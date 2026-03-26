// ============================================================
// GET /api/relationships           — All relationships (optional NPC filter)
// PUT /api/relationships/:id       — Update trust level
// ============================================================

import { Router, Request, Response } from 'express';
import sql from '../../../db/connection.js';

export const relationshipRouter = Router();

// ─── GET /api/relationships ──────────────────────────────────
// Query params: npc_id, min_trust, max_trust, page, limit
relationshipRouter.get('/', async (req: Request, res: Response) => {
  try {
    const npcId    = req.query.npc_id as string | undefined;
    const minTrust = req.query.min_trust ? parseFloat(req.query.min_trust as string) : undefined;
    const maxTrust = req.query.max_trust ? parseFloat(req.query.max_trust as string) : undefined;
    const page     = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
    const limit    = Math.min(200, parseInt(req.query.limit as string ?? '100', 10));
    const offset   = (page - 1) * limit;

    const rows = await sql`
      SELECT r.*,
             n1.name AS npc1_name, n1.species AS npc1_species,
             n2.name AS npc2_name, n2.species AS npc2_species
      FROM eis_relationships r
      JOIN eis_npcs n1 ON n1.npc_id = r.npc1_id
      JOIN eis_npcs n2 ON n2.npc_id = r.npc2_id
      WHERE (${npcId ?? null}::text IS NULL OR r.npc1_id = ${npcId ?? ''} OR r.npc2_id = ${npcId ?? ''})
        AND (${minTrust ?? null}::numeric IS NULL OR r.current_trust_level >= ${minTrust ?? 0})
        AND (${maxTrust ?? null}::numeric IS NULL OR r.current_trust_level <= ${maxTrust ?? 10})
      ORDER BY r.current_trust_level DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    res.json({ data: rows, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── PUT /api/relationships/:id ──────────────────────────────
// Body: { trust_level: number, history_notes?: string, simulation_id?: string, tick_number?: number }
relationshipRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id         = parseInt(req.params.id, 10);
    const trustLevel = parseFloat(req.body.trust_level ?? '5');
    const historyNotes: string | undefined = req.body.history_notes;
    const simulationId: string | undefined = req.body.simulation_id;
    const tickNumber: number | undefined   = req.body.tick_number;

    const clampedTrust = Math.max(0, Math.min(10, trustLevel));

    const updates: Record<string, unknown> = { current_trust_level: clampedTrust };
    if (historyNotes !== undefined) updates.history_notes = historyNotes;

    const [updated] = await sql`
      UPDATE eis_relationships
      SET ${sql(updates)}
      WHERE relationship_id = ${id}
      RETURNING *
    `;

    if (!updated) return res.status(404).json({ error: 'Relationship not found' });

    // Record trust history if simulation context is provided
    if (simulationId && tickNumber !== undefined) {
      await sql`
        INSERT INTO eis_trust_history (simulation_id, tick_number, npc1_id, npc2_id, trust_level, event_type)
        VALUES (${simulationId}, ${tickNumber}, ${updated.npc1_id}, ${updated.npc2_id}, ${clampedTrust}, 'ManualUpdate')
      `;
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});
