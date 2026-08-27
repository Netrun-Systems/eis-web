import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { MANIFEST_REL_PATH, loadManifest, resolveManifestTable } from './manifest.ts';
import { readCsvFile } from './csv.ts';
import { gitHeadShort, gitLogForFile, run } from './git.ts';
import { listAllowedScripts, runAllowedScript } from './scripts.ts';
import { writeTable } from './tableWrite.ts';
import { countFindings, runGuardFindings } from './guards.ts';
import { runWorldgenValidation } from './validation.ts';
import { getWorldgenSources, getWorldgenWeb, isWorldgenStem, putWorldgenWeb, WORLDGEN_STEMS } from './worldgen.ts';
import type { TableGuardCheckResult, TableListEntry, WorldgenPutBody, WriteRequestBody } from './types.ts';

export interface AppOptions {
  repoPath: string;
  corsOrigin: string;
}

/** WEB-004: read-only markdown reports served from the EISCORE repo. The Map
 * IS the path allow-list — nothing outside it is ever resolved. */
export const REPORT_ALLOW_LIST: ReadonlyMap<string, string> = new Map([
  ['worldgen-backlog', 'Documentation/World/WORLDGEN_BACKLOG.md'],
  ['asset-gaps', 'Documentation/World/ASSET_GAPS.md'],
]);

/** Boot-time verification: the configured path must be a git repo (worktrees
 * count) containing Data/ and the WEB-001 manifest. Returns a specific
 * complaint, or null when the repo is usable. */
export async function verifyRepo(repoPath: string): Promise<string | null> {
  if (repoPath === '') {
    return 'EISCORE_REPO_PATH is not set. Copy .env.example to .env and point it at your EISCORE checkout.';
  }
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    return `EISCORE_REPO_PATH does not exist or is not a directory: ${repoPath}`;
  }
  const rev = await run('git', ['rev-parse', '--is-inside-work-tree'], repoPath);
  if (rev.code !== 0 || rev.stdout.trim() !== 'true') {
    return `EISCORE_REPO_PATH is not a git repository (git rev-parse said: ${rev.stderr.trim() || rev.stdout.trim()}): ${repoPath}`;
  }
  if (!fs.existsSync(path.join(repoPath, 'Data'))) {
    return `EISCORE_REPO_PATH has no Data/ directory — is this really the EISCORE repo? ${repoPath}`;
  }
  const manifestAbs = path.join(repoPath, MANIFEST_REL_PATH);
  if (!fs.existsSync(manifestAbs)) {
    return (
      `EISCORE_REPO_PATH has no ${MANIFEST_REL_PATH} — run ` +
      `"python Scripts/export_table_manifest.py" in the EISCORE repo first (WEB-001). ${repoPath}`
    );
  }
  return null;
}

export function createApp(options: AppOptions): express.Express {
  const { repoPath, corsOrigin } = options;
  const app = express();
  app.use(express.json({ limit: '32mb' }));

  // CORS restricted to the Vite dev origin.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin === corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(origin === corsOrigin ? 204 : 403);
      return;
    }
    next();
  });

  app.get('/api/health', asyncRoute(async (_req, res) => {
    const head = await gitHeadShort(repoPath);
    const loaded = loadManifest(repoPath);
    res.json({
      ok: true,
      repoPath,
      head,
      manifestGeneratedAt: loaded.mtime,
    });
  }));

  app.get('/api/manifest', asyncRoute(async (req, res) => {
    const loaded = loadManifest(repoPath);
    const body: Record<string, unknown> = {
      mtime: loaded.mtime,
      manifest: loaded.manifest,
    };
    if (req.query.check === '1') {
      // Read-only staleness gate; never regenerates.
      const r = await run('python', ['Scripts/export_table_manifest.py', '--check'], repoPath);
      body.check = { stale: r.code !== 0, output: (r.stdout + r.stderr).trim() };
    }
    res.json(body);
  }));

  app.get('/api/tables', asyncRoute(async (_req, res) => {
    const loaded = loadManifest(repoPath);
    const tables: TableListEntry[] = loaded.manifest.tables.map((t) => ({
      path: t.path,
      folder: t.folder,
      stem: t.stem,
      classification: t.classification,
      flags: t.flags,
      row_count: t.row_count,
    }));
    res.json({ count: tables.length, tables });
  }));

  app.get('/api/tables/rows', asyncRoute(async (req, res) => {
    const callerPath = String(req.query.path ?? '');
    const resolved = resolveManifestTable(repoPath, callerPath);
    if (!resolved) {
      res.status(404).json({
        success: false,
        reason: 'unknown_table',
        detail: `path is not a manifest-listed table: ${callerPath}`,
      });
      return;
    }
    const { payload } = readCsvFile(resolved.absPath);
    res.json({ columns: payload.columns, rows: payload.rows, manifestEntry: resolved.entry });
  }));

  app.put('/api/tables/rows', asyncRoute(async (req, res) => {
    const callerPath = String(req.query.path ?? '');
    const resolved = resolveManifestTable(repoPath, callerPath);
    if (!resolved) {
      res.status(404).json({
        success: false,
        reason: 'unknown_table',
        detail: `path is not a manifest-listed table: ${callerPath}`,
      });
      return;
    }
    const body = req.body as WriteRequestBody;
    const result = await writeTable(
      { repoPath },
      resolved.relPath,
      resolved.entry,
      resolved.absPath,
      body,
    );
    res.status(result.success ? 200 : statusForFailure(result.reason)).json(result);
  }));

  // WEB-005: the worldgen validator as a service. The validator exiting 1
  // (errors found) is a RESULT — only spawn/parse problems reach the 5xx
  // handler (runWorldgenValidation throws for those).
  app.post('/api/validate/worldgen', asyncRoute(async (_req, res) => {
    res.json(await runWorldgenValidation(repoPath));
  }));

  // WEB-005: the WEB-003 hard-rule guards in dry-run against the file
  // currently on disk — same Finding[] shape, no write, no refusal semantics.
  app.post('/api/validate/table', asyncRoute(async (req, res) => {
    const callerPath = String(req.query.path ?? '');
    const resolved = resolveManifestTable(repoPath, callerPath);
    if (!resolved) {
      res.status(404).json({
        success: false,
        reason: 'unknown_table',
        detail: `path is not a manifest-listed table: ${callerPath}`,
      });
      return;
    }
    const { payload } = readCsvFile(resolved.absPath);
    const findings = runGuardFindings(resolved.entry, payload);
    const body: TableGuardCheckResult = {
      ranAt: new Date().toISOString(),
      path: resolved.relPath,
      findings,
      summaryCounts: countFindings(findings),
    };
    res.json(body);
  }));

  // WEB-006: the vocabulary editor's three routes. EISWeb owns exactly two
  // source fragments per normalized world-gen stem (<Stem>.web.csv row
  // additions, <Stem>.web.patch.csv column edits); the PUT writes them,
  // re-runs the generator chain, and rolls back on any validator ERROR.
  app.get('/api/worldgen/sources', asyncRoute(async (_req, res) => {
    res.json(getWorldgenSources(repoPath));
  }));

  app.get('/api/worldgen/web/:stem', asyncRoute(async (req, res) => {
    const stem = req.params.stem;
    if (!isWorldgenStem(stem)) {
      res.status(404).json({
        success: false,
        reason: 'unknown_stem',
        detail: `not a normalized world-gen stem: ${stem}`,
        allowed: [...WORLDGEN_STEMS],
      });
      return;
    }
    res.json(getWorldgenWeb(repoPath, stem));
  }));

  app.put('/api/worldgen/web/:stem', asyncRoute(async (req, res) => {
    const stem = req.params.stem;
    if (!isWorldgenStem(stem)) {
      res.status(404).json({
        success: false,
        reason: 'unknown_stem',
        detail: `not a normalized world-gen stem: ${stem}`,
        allowed: [...WORLDGEN_STEMS],
      });
      return;
    }
    const result = await putWorldgenWeb(repoPath, stem, req.body as WorldgenPutBody);
    res.status(result.success ? 200 : statusForFailure(result.reason)).json(result);
  }));

  app.post('/api/run/:script', asyncRoute(async (req, res) => {
    const scriptName = req.params.script;
    const brief =
      typeof (req.body as { brief?: unknown } | undefined)?.brief === 'string'
        ? String((req.body as { brief: string }).brief)
        : undefined;
    const outcome = await runAllowedScript(repoPath, scriptName, brief);
    if (!outcome.ok) {
      res.status(outcome.status).json({ success: false, reason: outcome.reason, allowed: listAllowedScripts() });
      return;
    }
    res.json(outcome.result);
  }));

  app.get('/api/reports/:name', asyncRoute(async (req, res) => {
    const rel = REPORT_ALLOW_LIST.get(req.params.name);
    if (rel === undefined) {
      res.status(404).json({
        success: false,
        reason: 'unknown_report',
        detail: `not an allow-listed report: ${req.params.name}`,
        allowed: [...REPORT_ALLOW_LIST.keys()],
      });
      return;
    }
    const abs = path.join(repoPath, ...rel.split('/'));
    const stat = fs.statSync(abs);
    const markdown = fs.readFileSync(abs, 'utf-8');
    res.json({
      name: req.params.name,
      path: rel,
      mtime: stat.mtime.toISOString(),
      markdown,
    });
  }));

  app.get('/api/git/log', asyncRoute(async (req, res) => {
    const callerPath = String(req.query.path ?? '');
    const resolved = resolveManifestTable(repoPath, callerPath);
    if (!resolved) {
      res.status(404).json({
        success: false,
        reason: 'unknown_table',
        detail: `path is not a manifest-listed table: ${callerPath}`,
      });
      return;
    }
    const nRaw = Number(req.query.n ?? '10');
    const n = Number.isInteger(nRaw) && nRaw > 0 && nRaw <= 100 ? nRaw : 10;
    const commits = await gitLogForFile(repoPath, resolved.relPath, n);
    res.json({ path: resolved.relPath, commits });
  }));

  // Uniform error shape for anything a route throws.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ success: false, reason: 'internal_error', detail: String(err) });
  });

  return app;
}

function statusForFailure(reason: string): number {
  switch (reason) {
    case 'bad_request':
      return 400;
    case 'classification_refused':
    case 'file_dirty':
    case 'key_collision':
    case 'semicolon_hazard':
    case 'raw_read_comma':
    case 'validation_errors':
      return 409;
    default:
      return 500;
  }
}

type Handler = (req: Request, res: Response) => Promise<void>;

function asyncRoute(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}
