// ============================================================
// POST /api/simulation/start       — Start new simulation run
// POST /api/simulation/tick        — Execute one simulation tick
// POST /api/simulation/tick-bulk   — Execute N ticks (fast-forward)
// GET  /api/simulation/events      — Events filtered by tick/type/NPC
// GET  /api/simulation/state       — Current world state summary
// ============================================================

import { Router, Request, Response } from 'express';
import sql from '../../../db/connection.js';

export const simulationRouter = Router();

// ─── POST /api/simulation/start ──────────────────────────────
simulationRouter.post('/start', async (req: Request, res: Response) => {
  try {
    const name   = req.body.name   ?? `Simulation ${new Date().toISOString()}`;
    const seed   = req.body.seed   ?? Math.floor(Math.random() * 2 ** 31);
    const config = req.body.config ?? {};

    const [run] = await sql`
      INSERT INTO eis_simulation_runs (name, seed, config)
      VALUES (${name}, ${seed}, ${sql.json(config)})
      RETURNING *
    `;

    // Create tick 0
    await sql`
      INSERT INTO eis_simulation_ticks (simulation_id, tick_number, world_time, summary_json)
      VALUES (${run.id}, 0, 0, ${sql.json({ npc_count: 0, events: 0 })})
    `;

    res.status(201).json(run);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── POST /api/simulation/tick ───────────────────────────────
// Body: { simulation_id: string, delta_time?: number }
// Performs bulk need decay for ALL NPCs in a single SQL UPDATE
simulationRouter.post('/tick', async (req: Request, res: Response) => {
  const startMs = Date.now();
  try {
    const simulationId: string = req.body.simulation_id;
    const deltaTime: number    = req.body.delta_time ?? 1.0;

    if (!simulationId) return res.status(400).json({ error: 'simulation_id required' });

    // Fetch current tick
    const [lastTick] = await sql`
      SELECT tick_number FROM eis_simulation_ticks
      WHERE simulation_id = ${simulationId}
      ORDER BY tick_number DESC
      LIMIT 1
    `;

    const [run] = await sql`SELECT * FROM eis_simulation_runs WHERE id = ${simulationId}`;
    if (!run) return res.status(404).json({ error: 'Simulation not found' });

    const nextTick   = (lastTick?.tick_number ?? 0) + 1;
    const worldTime  = nextTick * deltaTime;

    // Fetch need rates from catalog
    const needRates = await sql`SELECT need_name, increase_rate FROM eis_needs_catalog`;
    const rateMap   = Object.fromEntries(
      needRates.map(n => [n.need_name.toLowerCase().replace(/\s+/g, '_'), Number(n.increase_rate)])
    );

    const hungerRate  = rateMap['hunger']           ?? 0.10;
    const thirstRate  = rateMap['thirst']           ?? 0.20;
    const restRate    = rateMap['rest']             ?? 0.05;
    const socialRate  = rateMap['social_interaction'] ?? 0.03;
    const energyRate  = rateMap['energy']           ?? 0.04;
    const hygieneRate = rateMap['hygiene']          ?? 0.02;
    const comfortRate = rateMap['comfort']          ?? 0.02;

    // Bulk need decay — all NPCs in one query using need rates from catalog
    await sql`
      UPDATE eis_npcs SET
        hunger           = LEAST(100, hunger           + ${hungerRate  * deltaTime}),
        thirst           = LEAST(100, thirst           + ${thirstRate  * deltaTime}),
        rest             = LEAST(100, rest             + ${restRate    * deltaTime}),
        social_interaction = LEAST(100, social_interaction + ${socialRate  * deltaTime}),
        energy           = LEAST(100, energy           + ${energyRate  * deltaTime}),
        hygiene          = LEAST(100, hygiene          + ${hygieneRate * deltaTime}),
        comfort          = LEAST(100, comfort          + ${comfortRate * deltaTime}),
        updated_at       = NOW()
    `;

    // Find NPCs with critical needs (>= 80) — generate events for them
    const criticalNpcs = await sql`
      SELECT npc_id, name,
             hunger, thirst, rest, social_interaction, energy, hygiene, comfort
      FROM eis_npcs
      WHERE hunger >= 80 OR thirst >= 80 OR rest >= 80
         OR social_interaction >= 80 OR energy >= 80
    `;

    // Bulk insert critical need events
    if (criticalNpcs.length > 0) {
      const events = criticalNpcs.flatMap(npc => {
        const needs = ['hunger', 'thirst', 'rest', 'social_interaction', 'energy', 'hygiene', 'comfort'];
        return needs
          .filter(n => Number(npc[n]) >= 80)
          .map(n => ({
            simulation_id: simulationId,
            tick_number:   nextTick,
            npc_id:        npc.npc_id,
            event_type:    'NeedCritical',
            description:   `${npc.name} has critical ${n}: ${Number(npc[n]).toFixed(1)}`,
            data:          sql.json({ need: n, value: Number(npc[n]) }),
          }));
      });

      if (events.length > 0) {
        await sql`INSERT INTO eis_simulation_events ${sql(events)}`;
      }
    }

    // Record tick summary
    const [tickRow] = await sql`
      INSERT INTO eis_simulation_ticks (simulation_id, tick_number, world_time, summary_json)
      VALUES (${simulationId}, ${nextTick}, ${worldTime}, ${sql.json({
        npc_count:      criticalNpcs.length,
        events_count:   criticalNpcs.length,
        delta_time:     deltaTime,
        duration_ms:    Date.now() - startMs,
      })})
      RETURNING *
    `;

    // Update simulation tick count
    await sql`
      UPDATE eis_simulation_runs
      SET tick_count = ${nextTick}
      WHERE id = ${simulationId}
    `;

    res.json({
      tick:          nextTick,
      world_time:    worldTime,
      events_count:  criticalNpcs.length,
      duration_ms:   Date.now() - startMs,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── POST /api/simulation/tick-bulk ──────────────────────────
// Body: { simulation_id: string, count: number, delta_time?: number }
// Executes N ticks sequentially with minimal overhead
simulationRouter.post('/tick-bulk', async (req: Request, res: Response) => {
  const startMs = Date.now();
  try {
    const simulationId: string = req.body.simulation_id;
    const count: number        = Math.min(1000, Math.max(1, parseInt(req.body.count ?? '10', 10)));
    const deltaTime: number    = req.body.delta_time ?? 1.0;

    if (!simulationId) return res.status(400).json({ error: 'simulation_id required' });

    const [run] = await sql`SELECT id FROM eis_simulation_runs WHERE id = ${simulationId}`;
    if (!run) return res.status(404).json({ error: 'Simulation not found' });

    // Fetch need rates once
    const needRates = await sql`SELECT need_name, increase_rate FROM eis_needs_catalog`;
    const rateMap   = Object.fromEntries(
      needRates.map(n => [n.need_name.toLowerCase().replace(/\s+/g, '_'), Number(n.increase_rate)])
    );

    const hungerRate  = (rateMap['hunger']           ?? 0.10) * deltaTime;
    const thirstRate  = (rateMap['thirst']           ?? 0.20) * deltaTime;
    const restRate    = (rateMap['rest']             ?? 0.05) * deltaTime;
    const socialRate  = (rateMap['social_interaction'] ?? 0.03) * deltaTime;
    const energyRate  = (rateMap['energy']           ?? 0.04) * deltaTime;
    const hygieneRate = (rateMap['hygiene']          ?? 0.02) * deltaTime;
    const comfortRate = (rateMap['comfort']          ?? 0.02) * deltaTime;

    const [lastTick] = await sql`
      SELECT tick_number FROM eis_simulation_ticks
      WHERE simulation_id = ${simulationId}
      ORDER BY tick_number DESC LIMIT 1
    `;
    let currentTick = lastTick?.tick_number ?? 0;

    // Apply N × delta_time in one mega-UPDATE to minimize round trips
    const totalDelta = count * deltaTime;
    await sql`
      UPDATE eis_npcs SET
        hunger           = LEAST(100, hunger           + ${hungerRate  * count}),
        thirst           = LEAST(100, thirst           + ${thirstRate  * count}),
        rest             = LEAST(100, rest             + ${restRate    * count}),
        social_interaction = LEAST(100, social_interaction + ${socialRate  * count}),
        energy           = LEAST(100, energy           + ${energyRate  * count}),
        hygiene          = LEAST(100, hygiene          + ${hygieneRate * count}),
        comfort          = LEAST(100, comfort          + ${comfortRate * count}),
        updated_at       = NOW()
    `;

    // Insert one summary tick per call (not per individual tick — for performance)
    const finalTick  = currentTick + count;
    const worldTime  = finalTick * deltaTime;

    await sql`
      INSERT INTO eis_simulation_ticks (simulation_id, tick_number, world_time, summary_json)
      VALUES (${simulationId}, ${finalTick}, ${worldTime}, ${sql.json({
        bulk_ticks:   count,
        delta_time:   deltaTime,
        total_delta:  totalDelta,
        duration_ms:  Date.now() - startMs,
      })})
    `;

    await sql`
      UPDATE eis_simulation_runs SET tick_count = ${finalTick} WHERE id = ${simulationId}
    `;

    res.json({
      ticks_executed: count,
      from_tick:      currentTick,
      to_tick:        finalTick,
      world_time:     worldTime,
      duration_ms:    Date.now() - startMs,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── GET /api/simulation/events ──────────────────────────────
// Query: simulation_id, min_tick, max_tick, event_type, npc_id, page, limit
simulationRouter.get('/events', async (req: Request, res: Response) => {
  try {
    const simulationId: string = req.query.simulation_id as string;
    const minTick    = req.query.min_tick ? parseInt(req.query.min_tick as string, 10) : undefined;
    const maxTick    = req.query.max_tick ? parseInt(req.query.max_tick as string, 10) : undefined;
    const eventType: string | undefined = req.query.event_type as string | undefined;
    const npcId: string | undefined     = req.query.npc_id as string | undefined;
    const page       = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
    const limit      = Math.min(500, parseInt(req.query.limit as string ?? '100', 10));
    const offset     = (page - 1) * limit;

    if (!simulationId) return res.status(400).json({ error: 'simulation_id required' });

    const rows = await sql`
      SELECT *
      FROM eis_simulation_events
      WHERE simulation_id = ${simulationId}
        AND (${minTick ?? null}::integer IS NULL OR tick_number >= ${minTick ?? 0})
        AND (${maxTick ?? null}::integer IS NULL OR tick_number <= ${maxTick ?? 999999})
        AND (${eventType ?? null}::text IS NULL OR event_type = ${eventType ?? ''})
        AND (${npcId ?? null}::text IS NULL OR npc_id = ${npcId ?? ''})
      ORDER BY tick_number ASC, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    res.json({ data: rows, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── GET /api/simulation/state ───────────────────────────────
// Returns current world state summary
simulationRouter.get('/state', async (req: Request, res: Response) => {
  try {
    const simulationId: string | undefined = req.query.simulation_id as string | undefined;

    const [run] = simulationId
      ? await sql`SELECT * FROM eis_simulation_runs WHERE id = ${simulationId}`
      : await sql`SELECT * FROM eis_simulation_runs WHERE status = 'running' ORDER BY created_at DESC LIMIT 1`;

    if (!run) return res.status(404).json({ error: 'No active simulation found' });

    const [lastTick] = await sql`
      SELECT * FROM eis_simulation_ticks
      WHERE simulation_id = ${run.id}
      ORDER BY tick_number DESC LIMIT 1
    `;

    const [npcStats] = await sql`
      SELECT
        COUNT(*) AS npc_count,
        AVG(hunger) AS avg_hunger,
        AVG(thirst) AS avg_thirst,
        AVG(rest) AS avg_rest,
        AVG(social_interaction) AS avg_social,
        COUNT(*) FILTER (WHERE hunger >= 80 OR thirst >= 80 OR rest >= 80) AS critical_count
      FROM eis_npcs
    `;

    const recentEvents = await sql`
      SELECT event_type, COUNT(*) AS count
      FROM eis_simulation_events
      WHERE simulation_id = ${run.id}
        AND tick_number > (SELECT MAX(tick_number) - 10 FROM eis_simulation_ticks WHERE simulation_id = ${run.id})
      GROUP BY event_type
      ORDER BY count DESC
    `;

    res.json({
      simulation: run,
      current_tick: lastTick,
      npc_stats: npcStats,
      recent_events: recentEvents,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});
