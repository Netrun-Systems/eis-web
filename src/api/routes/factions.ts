// ============================================================
// GET /api/factions                    — List factions with member counts
// GET /api/factions/:id/reputation     — Faction reputation matrix
// ============================================================

import { Router, Request, Response } from 'express';
import sql from '../../../db/connection.js';

export const factionRouter = Router();

// ─── GET /api/factions ───────────────────────────────────────
factionRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT f.*,
             COUNT(nf.npc_id) AS member_count
      FROM eis_factions f
      LEFT JOIN eis_npc_factions nf ON nf.faction_id = f.group_id
      GROUP BY f.id
      ORDER BY f.group_name
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ─── GET /api/factions/:id/reputation ───────────────────────
// Returns the full reputation matrix row and history for a faction
factionRouter.get('/:id/reputation', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // faction name or numeric ID
    const faction = await sql`
      SELECT group_name FROM eis_factions WHERE group_id = ${parseInt(id, 10) || 0}
      UNION
      SELECT group_name FROM eis_factions WHERE group_name ILIKE ${id}
      LIMIT 1
    `;

    const factionName = faction[0]?.group_name ?? id;

    const matrix = await sql`
      SELECT *
      FROM eis_faction_reputation_matrix
      WHERE faction_a = ${factionName} OR faction_b = ${factionName}
      ORDER BY faction_a, faction_b
    `;

    res.json({ faction: factionName, matrix });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});
