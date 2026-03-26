// ============================================================
// EIS Web — WebSocket Server
// Real-time simulation event bridge for browser clients and UE5
//
// Protocol (Client → Server):
//   { "type": "subscribe", "topics": ["npc_state", "events", "faction_reputation"] }
//   { "type": "command",   "action": "tick",    "count": 10, "simulation_id": "..." }
//   { "type": "command",   "action": "tick-bulk","count": 100, "simulation_id": "..." }
//   { "type": "update_npc","npc_id": "NPC001",  "changes": { "aggression": 8.5 } }
//
// Protocol (Server → Client):
//   { "type": "event",        "tick": 1234, "data": { ... } }
//   { "type": "state_update", "npcs_changed": ["NPC001"], "tick": 1234 }
//   { "type": "tick_complete","tick": 1234, "events_count": 47, "duration_ms": 12 }
//   { "type": "error",        "message": "..." }
// ============================================================

import { WebSocketServer, WebSocket } from 'ws';
import type postgres from 'postgres';

type SqlClient = ReturnType<typeof import('postgres').default>;

interface ClientState {
  ws:     WebSocket;
  topics: Set<string>;
}

// Topic definitions — map to PostgreSQL LISTEN channels
const TOPIC_TO_CHANNEL: Record<string, string> = {
  npc_state:          'eis_npc_changed',
  events:             'eis_sim_event',
  tick_complete:      'eis_tick_complete',
  faction_reputation: 'eis_sim_event',   // filtered in handler
};

export function setupWebSocket(wss: WebSocketServer, sqlClient: SqlClient): void {
  const clients = new Map<WebSocket, ClientState>();

  // ─── PostgreSQL LISTEN setup ────────────────────────────────
  // Subscribe to all EIS notification channels
  const reservedSql = sqlClient.reserve();

  reservedSql.then(async (reserved) => {
    await reserved`LISTEN eis_npc_changed`;
    await reserved`LISTEN eis_sim_event`;
    await reserved`LISTEN eis_tick_complete`;

    reserved.listen('eis_npc_changed', (payload) => {
      broadcastToTopic('npc_state', {
        type:    'state_update',
        channel: 'eis_npc_changed',
        data:    parsePayload(payload),
      });
    });

    reserved.listen('eis_sim_event', (payload) => {
      const data = parsePayload(payload);
      broadcastToTopic('events', {
        type:  'event',
        tick:  data.tick_number,
        data,
      });
    });

    reserved.listen('eis_tick_complete', (payload) => {
      const data = parsePayload(payload);
      broadcastToTopic('tick_complete', {
        type:        'tick_complete',
        tick:        data.tick_number,
        world_time:  data.world_time,
        simulation_id: data.simulation_id,
      });
    });

    console.log('[WS] PostgreSQL LISTEN channels registered');
  }).catch(err => {
    console.error('[WS] Failed to establish LISTEN connection:', err);
  });

  // ─── Client connection handler ──────────────────────────────
  wss.on('connection', (ws: WebSocket) => {
    const state: ClientState = { ws, topics: new Set() };
    clients.set(ws, state);

    console.log(`[WS] Client connected. Total: ${clients.size}`);

    ws.on('message', async (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }

      switch (msg.type) {
        case 'subscribe': {
          const topics = (msg.topics as string[] ?? []);
          for (const topic of topics) {
            if (TOPIC_TO_CHANNEL[topic]) state.topics.add(topic);
          }
          send(ws, { type: 'subscribed', topics: [...state.topics] });
          break;
        }

        case 'unsubscribe': {
          const topics = (msg.topics as string[] ?? []);
          for (const topic of topics) state.topics.delete(topic);
          send(ws, { type: 'unsubscribed', topics: [...state.topics] });
          break;
        }

        case 'command': {
          await handleCommand(ws, msg, sqlClient);
          break;
        }

        case 'update_npc': {
          await handleNpcUpdate(ws, msg, sqlClient);
          break;
        }

        default:
          send(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WS] Client disconnected. Total: ${clients.size}`);
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
      clients.delete(ws);
    });

    // Send welcome
    send(ws, {
      type:            'connected',
      message:         'EIS WebSocket bridge ready',
      available_topics: Object.keys(TOPIC_TO_CHANNEL),
    });
  });

  // ─── Broadcast helper ───────────────────────────────────────
  function broadcastToTopic(topic: string, message: unknown): void {
    const payload = JSON.stringify(message);
    for (const [ws, state] of clients) {
      if (state.topics.has(topic) && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  function send(ws: WebSocket, message: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function parsePayload(payload: string): Record<string, unknown> {
    try { return JSON.parse(payload); } catch { return { raw: payload }; }
  }
}

// ─── Command handlers ─────────────────────────────────────────

async function handleCommand(
  ws: WebSocket,
  msg: Record<string, unknown>,
  sqlClient: SqlClient,
): Promise<void> {
  const action       = msg.action as string;
  const simulationId = msg.simulation_id as string | undefined;
  const count        = Math.min(1000, parseInt(msg.count as string ?? '1', 10));
  const deltaTime    = parseFloat(msg.delta_time as string ?? '1.0');

  function send(m: unknown) {
    if ((ws as WebSocket).readyState === WebSocket.OPEN) {
      (ws as WebSocket).send(JSON.stringify(m));
    }
  }

  if (!simulationId) {
    send({ type: 'error', message: 'simulation_id required for command' });
    return;
  }

  switch (action) {
    case 'tick':
    case 'tick-bulk': {
      const startMs = Date.now();
      try {
        // Fetch need rates
        const needRates = await sqlClient`SELECT need_name, increase_rate FROM eis_needs_catalog`;
        const rateMap   = Object.fromEntries(
          needRates.map((n: Record<string, unknown>) => [
            (n.need_name as string).toLowerCase().replace(/\s+/g, '_'),
            Number(n.increase_rate),
          ])
        );

        const [lastTick] = await sqlClient`
          SELECT tick_number FROM eis_simulation_ticks
          WHERE simulation_id = ${simulationId}
          ORDER BY tick_number DESC LIMIT 1
        `;
        const currentTick = lastTick?.tick_number ?? 0;
        const nextTick    = currentTick + count;
        const worldTime   = nextTick * deltaTime;

        // Bulk update
        const hRate = (rateMap['hunger']           ?? 0.10) * count * deltaTime;
        const tRate = (rateMap['thirst']           ?? 0.20) * count * deltaTime;
        const rRate = (rateMap['rest']             ?? 0.05) * count * deltaTime;
        const sRate = (rateMap['social_interaction'] ?? 0.03) * count * deltaTime;
        const eRate = (rateMap['energy']           ?? 0.04) * count * deltaTime;
        const yRate = (rateMap['hygiene']          ?? 0.02) * count * deltaTime;
        const cRate = (rateMap['comfort']          ?? 0.02) * count * deltaTime;

        await sqlClient`
          UPDATE eis_npcs SET
            hunger           = LEAST(100, hunger           + ${hRate}),
            thirst           = LEAST(100, thirst           + ${tRate}),
            rest             = LEAST(100, rest             + ${rRate}),
            social_interaction = LEAST(100, social_interaction + ${sRate}),
            energy           = LEAST(100, energy           + ${eRate}),
            hygiene          = LEAST(100, hygiene          + ${yRate}),
            comfort          = LEAST(100, comfort          + ${cRate}),
            updated_at       = NOW()
        `;

        await sqlClient`
          INSERT INTO eis_simulation_ticks (simulation_id, tick_number, world_time, summary_json)
          VALUES (${simulationId}, ${nextTick}, ${worldTime}, ${sqlClient.json({
            ticks: count, duration_ms: Date.now() - startMs
          })})
        `;

        await sqlClient`
          UPDATE eis_simulation_runs SET tick_count = ${nextTick} WHERE id = ${simulationId}
        `;

        send({
          type:           'tick_complete',
          tick:           nextTick,
          world_time:     worldTime,
          ticks_executed: count,
          events_count:   0,
          duration_ms:    Date.now() - startMs,
        });
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Tick failed' });
      }
      break;
    }

    default:
      send({ type: 'error', message: `Unknown command action: ${action}` });
  }
}

async function handleNpcUpdate(
  ws: WebSocket,
  msg: Record<string, unknown>,
  sqlClient: SqlClient,
): Promise<void> {
  function send(m: unknown) {
    if ((ws as WebSocket).readyState === WebSocket.OPEN) {
      (ws as WebSocket).send(JSON.stringify(m));
    }
  }

  const npcId   = msg.npc_id as string | undefined;
  const changes = msg.changes as Record<string, unknown> | undefined;

  if (!npcId || !changes) {
    send({ type: 'error', message: 'npc_id and changes required' });
    return;
  }

  const ALLOWED = new Set([
    'aggression', 'friendliness', 'curiosity', 'fearfulness', 'loyalty',
    'independence', 'confidence', 'patience', 'honesty', 'empathy',
    'resourcefulness', 'greed', 'generosity', 'survival_instinct',
    'strength', 'dexterity', 'endurance', 'health', 'intelligence',
    'wisdom', 'willpower', 'charisma',
    'hunger', 'thirst', 'rest', 'social_interaction', 'energy',
    'hygiene', 'comfort', 'emotional_state', 'awareness_level',
  ]);

  const safeChanges = Object.fromEntries(
    Object.entries(changes).filter(([k]) => ALLOWED.has(k))
  );

  if (Object.keys(safeChanges).length === 0) {
    send({ type: 'error', message: 'No valid fields in changes' });
    return;
  }

  try {
    const [updated] = await sqlClient`
      UPDATE eis_npcs SET ${sqlClient(safeChanges)} WHERE npc_id = ${npcId} RETURNING npc_id, updated_at
    `;
    if (!updated) {
      send({ type: 'error', message: `NPC not found: ${npcId}` });
      return;
    }
    send({ type: 'npc_updated', npc_id: npcId, changes: safeChanges });
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : 'Update failed' });
  }
}
