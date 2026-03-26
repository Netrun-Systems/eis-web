// ============================================================
// POST /api/csv/import             — Upload and import CSV files
// GET  /api/csv/export/:table      — Export table as CSV download
// ============================================================

import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Papa from 'papaparse';
import sql from '../../../db/connection.js';

export const csvRouter = Router();

// multer: store uploads in /tmp
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// ─── Allowed tables for export ───────────────────────────────
const ALLOWED_EXPORT_TABLES = new Set([
  'eis_npcs', 'eis_roles', 'eis_factions', 'eis_items', 'eis_quests',
  'eis_skills', 'eis_talents', 'eis_needs_catalog', 'eis_behaviors',
  'eis_actions', 'eis_emotions', 'eis_traits', 'eis_cultural_groups',
  'eis_crafting_recipes', 'eis_risks', 'eis_environments', 'eis_schedules',
  'eis_events', 'eis_relationships', 'eis_memories', 'eis_knowledge_entries',
  'eis_communication_protocols', 'eis_conversation_patterns',
  'eis_trust_evolution_parameters', 'eis_faction_reputation_matrix',
  'eis_faction_item_preferences', 'eis_faction_narrative_events',
  'eis_quest_hook_triggers', 'eis_rumor_templates', 'eis_simulation_events',
  'eis_simulation_ticks', 'eis_trust_history', 'eis_trade_log',
]);

// ─── POST /api/csv/import ────────────────────────────────────
// Accepts multipart: file (CSV) + table_name (form field)
csvRouter.post('/import', upload.single('file'), async (req: Request, res: Response) => {
  const filePath = (req.file as Express.Multer.File | undefined)?.path;
  try {
    const tableName: string = req.body.table_name;

    if (!tableName || !ALLOWED_EXPORT_TABLES.has(tableName)) {
      return res.status(400).json({ error: 'Invalid or missing table_name' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const content = fs.readFileSync(filePath!, 'utf8');
    const result  = Papa.parse<Record<string, string>>(content, {
      header:         true,
      skipEmptyLines: true,
      transform:      (v) => v.trim(),
    });

    if (result.data.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or has no data rows' });
    }

    // Convert keys to snake_case for PostgreSQL compatibility
    const snakify = (k: string) =>
      k.replace(/([A-Z])/g, c => `_${c.toLowerCase()}`).replace(/^_/, '');

    const rows = result.data.map(row =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [snakify(k), v === '' ? null : v])
      )
    );

    const CHUNK = 200;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await sql`INSERT INTO ${sql(tableName)} ${sql(rows.slice(i, i + CHUNK))} ON CONFLICT DO NOTHING`;
      inserted += rows.slice(i, i + CHUNK).length;
    }

    res.json({ inserted, table: tableName, errors: result.errors.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Import failed' });
  } finally {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

// ─── GET /api/csv/export/:table ──────────────────────────────
// Optional query: simulation_id (for sim tracking tables)
csvRouter.get('/export/:table', async (req: Request, res: Response) => {
  try {
    const tableName = req.params.table;

    if (!ALLOWED_EXPORT_TABLES.has(tableName)) {
      return res.status(400).json({ error: 'Table not allowed for export' });
    }

    const simulationId: string | undefined = req.query.simulation_id as string | undefined;
    const simTables = ['eis_simulation_events', 'eis_simulation_ticks', 'eis_trust_history', 'eis_trade_log'];

    let rows: Record<string, unknown>[];
    if (simulationId && simTables.includes(tableName)) {
      rows = await sql`SELECT * FROM ${sql(tableName)} WHERE simulation_id = ${simulationId} ORDER BY id`;
    } else {
      rows = await sql`SELECT * FROM ${sql(tableName)} ORDER BY id`;
    }

    const csv = Papa.unparse(rows as Record<string, string | number | boolean | null>[]);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${tableName}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Export failed' });
  }
});
