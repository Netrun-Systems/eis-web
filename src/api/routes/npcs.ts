// ============================================================
// GET  /api/npcs                  — List NPCs with filters and pagination
// GET  /api/npcs/:id              — NPC detail (joins: talents, inventory, roles, factions)
// PUT  /api/npcs/:id              — Update NPC attributes/personality/needs
// POST /api/npcs/:id/tick         — Tick a single NPC (need decay + behavior selection)
// ============================================================

import { Router, Request, Response } from 'express';
import sql from '../../../db/connection.js';

export const npcRouter = Router();

// ─── GET /api/npcs ───────────────────────────────────────────
// Query params: species, faction_id, emotional_state, page, limit
npcRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? '50', 10)));
    const offset = (page - 1) * limit;

    const species        = req.query.species as string | undefined;
    const emotionalState = req.query.emotional_state as string | undefined;
    const factionId      = req.query.faction_id ? parseInt(req.query.faction_id as string, 10) : undefined;

    let rows;

    if (factionId) {
      rows = await sql`
        SELECT n.*
        FROM eis_npcs n
        JOIN eis_npc_factions nf ON nf.npc_id = n.npc_id
        WHERE nf.faction_id = ${factionId}
          AND (${species ?? null}::text IS NULL OR n.species = ${species ?? ''})
          AND (${emotionalState ?? null}::text IS NULL OR n.emotional_state = ${emotionalState ?? ''})
        ORDER BY n.name
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      rows = await sql`
        SELECT *
        FROM eis_npcs
        WHERE (${species ?? null}::text IS NULL OR species = ${species ?? ''})
          AND (${emotionalState ?? null}::text IS NULL OR emotional_state = ${emotionalState ?? ''})
        ORDER BY name
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    const [{ count }] = await sql`SELECT COUNT(*) FROM eis_npcs`;
    res.json({ data: rows, total: Number(count), page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── GET /api/npcs/:id ───────────────────────────────────────
npcRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [npc] = await sql`SELECT * FROM eis_npcs WHERE npc_id = ${id}`;
    if (!npc) return res.status(404).json({ error: 'NPC not found' });

    const [talents, inventory, roles, factions, relationships] = await Promise.all([
      sql`
        SELECT nt.*, t.talent_name, t.domain, t.core_definition
        FROM eis_npc_talents nt
        JOIN eis_talents t ON t.talent_id = nt.talent_id
        WHERE nt.npc_id = ${id}
      `,
      sql`
        SELECT ni.*, i.item_name, i.item_type, i.value
        FROM eis_npc_inventory ni
        JOIN eis_items i ON i.item_id = ni.item_id
        WHERE ni.npc_id = ${id}
      `,
      sql`
        SELECT nr.*, r.role_name, r.description
        FROM eis_npc_roles nr
        JOIN eis_roles r ON r.role_id = nr.role_id
        WHERE nr.npc_id = ${id}
      `,
      sql`
        SELECT nf.*, f.group_name, f.description
        FROM eis_npc_factions nf
        JOIN eis_factions f ON f.group_id = nf.faction_id
        WHERE nf.npc_id = ${id}
      `,
      sql`
        SELECT r.*,
               CASE WHEN r.npc1_id = ${id} THEN r.npc2_id ELSE r.npc1_id END AS other_npc_id
        FROM eis_relationships r
        WHERE r.npc1_id = ${id} OR r.npc2_id = ${id}
        ORDER BY r.current_trust_level DESC
      `,
    ]);

    res.json({ ...npc, talents, inventory, roles, factions, relationships });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── PUT /api/npcs/:id ───────────────────────────────────────
npcRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;

    // Only allow whitelisted columns to be updated
    const ALLOWED = new Set([
      'aggression', 'friendliness', 'curiosity', 'fearfulness',
      'loyalty', 'independence', 'confidence', 'patience',
      'honesty', 'empathy', 'resourcefulness', 'greed',
      'generosity', 'survival_instinct',
      'strength', 'dexterity', 'endurance', 'health',
      'intelligence', 'wisdom', 'willpower', 'charisma',
      'hunger', 'thirst', 'rest', 'social_interaction',
      'energy', 'hygiene', 'comfort', 'safety',
      'self_actualization', 'entertainment',
      'emotional_state', 'awareness_level',
      'home_location', 'work_location',
    ]);

    const updates = Object.fromEntries(
      Object.entries(body).filter(([k]) => ALLOWED.has(k))
    );

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const [updated] = await sql`
      UPDATE eis_npcs
      SET ${sql(updates)}
      WHERE npc_id = ${id}
      RETURNING *
    `;

    if (!updated) return res.status(404).json({ error: 'NPC not found' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── POST /api/npcs/:id/tick ─────────────────────────────────
// Applies one simulation tick to a single NPC
// Body: { delta_time: number (seconds), simulation_id?: string }
npcRouter.post('/:id/tick', async (req: Request, res: Response) => {
  try {
    const { id }   = req.params;
    const deltaTime: number = req.body.delta_time ?? 1.0;
    const simulationId: string | undefined = req.body.simulation_id;

    const [npc] = await sql`SELECT * FROM eis_npcs WHERE npc_id = ${id}`;
    if (!npc) return res.status(404).json({ error: 'NPC not found' });

    // Fetch need rates from catalog
    const needRates = await sql`SELECT need_name, increase_rate FROM eis_needs_catalog`;
    const rateMap   = Object.fromEntries(
      needRates.map(n => [n.need_name.toLowerCase().replace(/\s+/g, '_'), Number(n.increase_rate)])
    );

    // Apply need decay (needs increase toward 100; satisfaction actions reduce them)
    const NEED_FIELDS = ['hunger', 'thirst', 'rest', 'social_interaction', 'energy', 'hygiene', 'comfort'];
    const needUpdates: Record<string, number> = {};
    const criticalNeeds: string[] = [];

    for (const field of NEED_FIELDS) {
      const rate = rateMap[field] ?? 0.1;
      const current = Number(npc[field] ?? 50);
      const next = Math.min(100, current + rate * deltaTime);
      needUpdates[field] = next;
      if (next >= 80) criticalNeeds.push(field);
    }

    // Simple behavior selection: highest critical need → select behavior
    let selectedBehavior = 'Idle';
    if (criticalNeeds.length > 0) {
      const needToBehavior: Record<string, string> = {
        hunger: 'FindFood',
        thirst: 'FindWater',
        rest: 'Sleep',
        social_interaction: 'Socialize',
        energy: 'Rest',
        hygiene: 'Bathe',
        comfort: 'Seek Comfort',
      };
      selectedBehavior = needToBehavior[criticalNeeds[0]] ?? 'Idle';
    }

    const [updated] = await sql`
      UPDATE eis_npcs
      SET ${sql(needUpdates)}
      WHERE npc_id = ${id}
      RETURNING *
    `;

    // Log simulation event if a simulation_id is provided
    if (simulationId && criticalNeeds.length > 0) {
      await sql`
        INSERT INTO eis_simulation_events (simulation_id, tick_number, npc_id, event_type, description, data)
        SELECT ${simulationId}, st.tick_number, ${id}, 'NeedCritical',
               ${`${id} has critical needs: ${criticalNeeds.join(', ')}`},
               ${sql.json({ needs: criticalNeeds, behavior: selectedBehavior })}
        FROM eis_simulation_ticks st
        WHERE st.simulation_id = ${simulationId}
        ORDER BY st.tick_number DESC
        LIMIT 1
      `;
    }

    res.json({
      npc: updated,
      behavior:       selectedBehavior,
      critical_needs: criticalNeeds,
      delta_time:     deltaTime,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});
