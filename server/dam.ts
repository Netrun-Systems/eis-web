import fs from 'node:fs';
import path from 'node:path';
import { run } from './git.ts';
import { parseCsvText } from './csv.ts';
import type {
  DamConsumedPieceTypes,
  DamDryRunResult,
  DamKitCoverage,
  DamPackEntry,
  DamPackList,
  DamPackWriteResult,
  DamPieceTypeRow,
  DamStyleFallback,
} from './types.ts';

/**
 * WEB-009 — the digital-asset-management surfaces' server side. Three reads
 * and two runs, all against the EISCORE working clone:
 *
 *   - the consumed-piece-type map, parsed LIVE from Scripts/location_brief.py
 *     (the only copy, per WG-213/WG-215 — this module refuses to run with a
 *     hardcoded fallback for the same reason worldgen.ts refuses when a
 *     source parse fails: a stale copy is exactly the defect WG-213 fixed);
 *   - the CityStyle x PieceType coverage matrix over BuildingKitCatalog.csv,
 *     with WG-218's inert-inventory number computed live, never quoted;
 *   - Scripts/catalog_content_pack.py as the pack registry: --list (read),
 *     --pack X --dry-run (read), --pack X --write behind an explicit confirm
 *     (the ONE write; single-commit, idempotent when the pack is already
 *     registered — "re-running replaces only that pack's rows").
 */

export const LOCATION_BRIEF_REL = 'Scripts/location_brief.py';
export const KIT_CATALOG_REL = 'Data/PCG/BuildingKitCatalog.csv';
export const PROP_CATALOG_REL = 'Data/PCG/InteriorPropCatalog.csv';
export const FALLBACK_REL = 'Data/PCG/CityStyleFallback.csv';
export const CATALOG_SCRIPT_REL = 'Scripts/catalog_content_pack.py';
export const FALLBACK_SCRIPT_REL = 'Scripts/author_city_style_fallback.py';

const abs = (repoPath: string, rel: string) => path.join(repoPath, ...rel.split('/'));

// ---------------------------------------------------------------------------
// GET /api/dam/consumed-piece-types
// ---------------------------------------------------------------------------

/**
 * Parse the CONSUMED_PIECE_TYPES dict literal out of location_brief.py
 * source. Throws with a specific complaint on any structural surprise —
 * the caller turns that into a 500. Never falls back to a hardcoded set.
 */
export function parseConsumedPieceTypes(source: string): Record<string, string[]> {
  const assign = source.match(/^CONSUMED_PIECE_TYPES\s*=\s*\{/m);
  if (assign === null || assign.index === undefined) {
    throw new Error(
      `${LOCATION_BRIEF_REL} no longer defines CONSUMED_PIECE_TYPES — the DAM refuses ` +
        'to guess the consumed set (WG-213: stale copies are the defect).',
    );
  }
  // Walk to the matching close brace (the literal contains no braces inside
  // strings or comments today; depth tracking keeps this honest if it ever
  // gains a nested dict).
  const open = assign.index + assign[0].length - 1;
  let depth = 0;
  let close = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) {
    throw new Error(`CONSUMED_PIECE_TYPES in ${LOCATION_BRIEF_REL} has no closing brace`);
  }
  // Strip # comments line-by-line (no string literal in the dict contains #),
  // then match "Type": ("CONSUMER", ...) entries.
  const body = source
    .slice(open + 1, close)
    .split(/\r?\n/)
    .map((l) => {
      const hash = l.indexOf('#');
      return hash >= 0 ? l.slice(0, hash) : l;
    })
    .join('\n');

  const types: Record<string, string[]> = {};
  const entryRe = /"([A-Za-z_][A-Za-z0-9_]*)"\s*:\s*\(([^)]*)\)/g;
  for (const m of body.matchAll(entryRe)) {
    const name = m[1];
    const consumers = [...m[2].matchAll(/"([A-Za-z0-9_]+)"/g)].map((c) => c[1]);
    if (consumers.length === 0) {
      throw new Error(
        `CONSUMED_PIECE_TYPES["${name}"] parsed with zero consumers — the literal's shape changed; ` +
          `update the parser in server/dam.ts against ${LOCATION_BRIEF_REL}`,
      );
    }
    if (name in types) {
      throw new Error(`CONSUMED_PIECE_TYPES defines "${name}" twice`);
    }
    types[name] = consumers;
  }
  if (Object.keys(types).length === 0) {
    throw new Error(
      `CONSUMED_PIECE_TYPES in ${LOCATION_BRIEF_REL} parsed to zero entries — the literal's ` +
        'shape changed; update the parser in server/dam.ts rather than hardcoding the set',
    );
  }
  return types;
}

export function getConsumedPieceTypes(repoPath: string): DamConsumedPieceTypes {
  const p = abs(repoPath, LOCATION_BRIEF_REL);
  if (!fs.existsSync(p)) {
    throw new Error(`${LOCATION_BRIEF_REL} does not exist in the EISCORE repo`);
  }
  const types = parseConsumedPieceTypes(fs.readFileSync(p, 'utf-8'));
  const consumers = [...new Set(Object.values(types).flat())].sort();
  return {
    source: LOCATION_BRIEF_REL,
    count: Object.keys(types).length,
    consumers,
    types,
  };
}

// ---------------------------------------------------------------------------
// GET /api/dam/kit-coverage
// ---------------------------------------------------------------------------

function readFallbacks(repoPath: string): DamStyleFallback[] {
  const p = abs(repoPath, FALLBACK_REL);
  if (!fs.existsSync(p)) return [];
  const { columns, rows } = parseCsvText(fs.readFileSync(p, 'utf-8'));
  const idx = (c: string) => columns.indexOf(c);
  const [si, fi, oi] = [idx('CityStyle'), idx('Family'), idx('FallbackOrder')];
  if (si < 0) return [];
  return rows
    .map((r) => ({
      style: r[si] ?? '',
      family: fi >= 0 ? (r[fi] ?? '') : '',
      chain: oi >= 0 ? (r[oi] ?? '').split('|').filter((s) => s !== '') : [],
    }))
    .filter((f) => f.style !== '');
}

export function getKitCoverage(repoPath: string): DamKitCoverage {
  const consumedInfo = getConsumedPieceTypes(repoPath);
  const consumed = consumedInfo.types;

  const catalogAbs = abs(repoPath, KIT_CATALOG_REL);
  if (!fs.existsSync(catalogAbs)) {
    throw new Error(`${KIT_CATALOG_REL} does not exist in the EISCORE repo`);
  }
  const { columns, rows } = parseCsvText(fs.readFileSync(catalogAbs, 'utf-8'));
  const styleI = columns.indexOf('CityStyle');
  const pieceI = columns.indexOf('PieceType');
  if (styleI < 0 || pieceI < 0) {
    throw new Error(`${KIT_CATALOG_REL} lacks CityStyle/PieceType columns: ${columns.join(', ')}`);
  }

  const styles = new Set<string>();
  const byType = new Map<string, { total: number; byStyle: Record<string, number> }>();
  let consumedRows = 0;
  for (const r of rows) {
    const style = r[styleI] ?? '';
    const piece = r[pieceI] ?? '';
    styles.add(style);
    let entry = byType.get(piece);
    if (entry === undefined) {
      entry = { total: 0, byStyle: {} };
      byType.set(piece, entry);
    }
    entry.total += 1;
    entry.byStyle[style] = (entry.byStyle[style] ?? 0) + 1;
    if (piece in consumed) consumedRows += 1;
  }
  // Consumed types with ZERO catalogue rows still get a row — their absence
  // is the WG-215c finding (InteriorWall/Scaffold: consumers that can never
  // fire), which a purely catalogue-derived matrix would hide.
  for (const t of Object.keys(consumed)) {
    if (!byType.has(t)) byType.set(t, { total: 0, byStyle: {} });
  }

  const pieceTypes: DamPieceTypeRow[] = [...byType.entries()]
    .map(([name, e]) => ({
      name,
      consumed: name in consumed,
      consumers: consumed[name] ?? [],
      total: e.total,
      byStyle: e.byStyle,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const totalRows = rows.length;
  const inertRows = totalRows - consumedRows;
  return {
    ranAt: new Date().toISOString(),
    catalogPath: KIT_CATALOG_REL,
    consumedSource: LOCATION_BRIEF_REL,
    totalRows,
    consumedRows,
    inertRows,
    inertPct: totalRows > 0 ? (inertRows / totalRows) * 100 : 0,
    styles: [...styles].sort(),
    pieceTypes,
    fallbacks: readFallbacks(repoPath),
  };
}

// ---------------------------------------------------------------------------
// GET /api/dam/pack-list
// ---------------------------------------------------------------------------

/**
 * Parse `catalog_content_pack.py --list` stdout: `%-22s %-16s %s` per pack.
 * Conservative: the status suffix is the anchor; the name is the first
 * whitespace token; the style is whatever sits between (it may contain
 * spaces — "N/A (props only)"). Any line that resists returns null and the
 * caller ships {raw} instead of a wrong table.
 */
export function parsePackList(stdout: string): DamPackEntry[] | null {
  const packs: DamPackEntry[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    let onDisk: boolean;
    let rest: string;
    if (line.endsWith('on disk')) {
      onDisk = true;
      rest = line.slice(0, -'on disk'.length).trimEnd();
    } else if (line.endsWith('NOT FOUND')) {
      onDisk = false;
      rest = line.slice(0, -'NOT FOUND'.length).trimEnd();
    } else {
      return null;
    }
    const space = rest.search(/\s/);
    if (space <= 0) return null;
    const name = rest.slice(0, space);
    const cityStyle = rest.slice(space).trim();
    if (!/^[A-Za-z0-9_]+$/.test(name) || cityStyle === '') return null;
    packs.push({ name, cityStyle, onDisk });
  }
  return packs.length > 0 ? packs : null;
}

export async function getPackList(repoPath: string): Promise<DamPackList> {
  const r = await run('python', [CATALOG_SCRIPT_REL, '--list'], repoPath);
  return {
    ranAt: new Date().toISOString(),
    exitCode: r.code,
    packs: r.code === 0 ? parsePackList(r.stdout) : null,
    raw: (r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim(),
  };
}

/** Resolve + validate a caller-supplied pack name against the live --list
 * output. Returns the canonical name or a refusal detail. */
async function resolvePackName(
  repoPath: string,
  pack: unknown,
): Promise<{ ok: true; name: string } | { ok: false; status: number; reason: string; detail: string }> {
  if (typeof pack !== 'string' || !/^[A-Za-z0-9_]+$/.test(pack)) {
    return {
      ok: false,
      status: 400,
      reason: 'bad_request',
      detail: 'body must carry {pack} matching [A-Za-z0-9_]+',
    };
  }
  const list = await getPackList(repoPath);
  if (list.packs === null) {
    return {
      ok: false,
      status: 500,
      reason: 'pack_list_unavailable',
      detail: `could not parse ${CATALOG_SCRIPT_REL} --list output to validate the pack name:\n${list.raw.slice(0, 2000)}`,
    };
  }
  const entry = list.packs.find((p) => p.name === pack);
  if (entry === undefined) {
    return {
      ok: false,
      status: 404,
      reason: 'unknown_pack',
      detail: `"${pack}" is not a configured pack. Configured: ${list.packs.map((p) => p.name).join(', ')}`,
    };
  }
  return { ok: true, name: entry.name };
}

// ---------------------------------------------------------------------------
// POST /api/dam/pack-dry-run
// ---------------------------------------------------------------------------

/** The merge summary lines at the tail of every classification report. Parsed
 * opportunistically — a format change degrades to null, never to a wrong
 * number; the raw report is always shipped alongside. */
export function parseMergeSummary(stdout: string): DamDryRunResult['merge'] {
  const kit = stdout.match(/^BuildingKitCatalog: (\d+) existing kept \+ (\d+) new = (\d+)$/m);
  const prop = stdout.match(/^InteriorPropCatalog: (\d+) existing kept \+ (\d+) new = (\d+)$/m);
  if (!kit || !prop) return null;
  return {
    kitKept: Number(kit[1]),
    kitNew: Number(kit[2]),
    kitTotal: Number(kit[3]),
    propKept: Number(prop[1]),
    propNew: Number(prop[2]),
    propTotal: Number(prop[3]),
  };
}

export async function dryRunPack(
  repoPath: string,
  pack: unknown,
): Promise<
  | { ok: true; result: DamDryRunResult }
  | { ok: false; status: number; reason: string; detail: string }
> {
  const resolved = await resolvePackName(repoPath, pack);
  if (!resolved.ok) return resolved;
  const r = await run(
    'python',
    [CATALOG_SCRIPT_REL, '--pack', resolved.name, '--dry-run'],
    repoPath,
  );
  if (r.code !== 0) {
    return {
      ok: false,
      status: 500,
      reason: 'script_failed',
      detail: `${CATALOG_SCRIPT_REL} --pack ${resolved.name} --dry-run exited ${r.code}:\n${(r.stdout + '\n' + r.stderr).trim().slice(-4000)}`,
    };
  }
  return {
    ok: true,
    result: {
      pack: resolved.name,
      ranAt: new Date().toISOString(),
      exitCode: r.code,
      report: r.stdout.trim(),
      merge: parseMergeSummary(r.stdout),
    },
  };
}

// ---------------------------------------------------------------------------
// POST /api/dam/pack-write
// ---------------------------------------------------------------------------

const COMMIT_IDENTITY: NodeJS.ProcessEnv = {
  GIT_AUTHOR_NAME: 'EISWeb',
  GIT_AUTHOR_EMAIL: 'daniel@netrunsystems.com',
  GIT_COMMITTER_NAME: 'EISWeb',
  GIT_COMMITTER_EMAIL: 'daniel@netrunsystems.com',
};

const CATALOG_FILES = [KIT_CATALOG_REL, PROP_CATALOG_REL];

export async function writePack(
  repoPath: string,
  pack: unknown,
  confirm: unknown,
): Promise<
  | { ok: true; result: DamPackWriteResult }
  | { ok: false; status: number; reason: string; detail: unknown }
> {
  if (confirm !== true) {
    return {
      ok: false,
      status: 400,
      reason: 'bad_request',
      detail: 'pack-write is the approve step — the body must carry {pack, confirm: true}',
    };
  }
  const resolved = await resolvePackName(repoPath, pack);
  if (!resolved.ok) return resolved;

  // Dirty guard on exactly the two files the script writes. Same discipline
  // as every other EISWeb mutation: never bury an in-progress hand edit.
  const dirty = await run('git', ['status', '--porcelain', '--', ...CATALOG_FILES], repoPath);
  if (dirty.code !== 0) {
    return { ok: false, status: 500, reason: 'git_error', detail: dirty.stderr.trim() };
  }
  if (dirty.stdout.trim() !== '') {
    return {
      ok: false,
      status: 409,
      reason: 'file_dirty',
      detail: {
        message:
          'the PCG catalogues have uncommitted changes in the EISCORE working tree — ' +
          'commit or discard them first; EISWeb will not bury an in-progress hand edit.',
        status: dirty.stdout.trim(),
      },
    };
  }

  const w = await run('python', [CATALOG_SCRIPT_REL, '--pack', resolved.name, '--write'], repoPath);
  if (w.code !== 0) {
    return {
      ok: false,
      status: 500,
      reason: 'script_failed',
      detail: `${CATALOG_SCRIPT_REL} --pack ${resolved.name} --write exited ${w.code}:\n${(w.stdout + '\n' + w.stderr).trim().slice(-4000)}`,
    };
  }
  const report = w.stdout.trim();

  const changed = await run('git', ['status', '--porcelain', '--', ...CATALOG_FILES], repoPath);
  if (changed.code !== 0) {
    return { ok: false, status: 500, reason: 'git_error', detail: changed.stderr.trim() };
  }

  // The fallback gate runs in BOTH branches: a newly-registered CityStyle
  // without a STYLE_FAMILY entry is exactly what --check exists to catch
  // (WG-163/WG-216). Surface the verdict; never auto-fix.
  const runFallbackCheck = async () => {
    const c = await run('python', [FALLBACK_SCRIPT_REL, '--check'], repoPath);
    return { exitCode: c.code, output: (c.stdout + (c.stderr ? '\n' + c.stderr : '')).trim() };
  };

  if (changed.stdout.trim() === '') {
    return {
      ok: true,
      result: {
        success: true,
        pack: resolved.name,
        commit: null,
        note: 'idempotent — no changes',
        diffstat: null,
        report,
        fallbackCheck: await runFallbackCheck(),
      },
    };
  }

  const diffstatR = await run('git', ['diff', '--stat', '--', ...CATALOG_FILES], repoPath);
  const diffstat = diffstatR.code === 0 ? diffstatR.stdout.trim() : '';

  const message = `eisweb: register pack ${resolved.name}`;
  const add = await run('git', ['add', '--', ...CATALOG_FILES], repoPath, COMMIT_IDENTITY);
  if (add.code !== 0) {
    return { ok: false, status: 500, reason: 'commit_failed', detail: `git add failed: ${add.stderr.trim()}` };
  }
  const commit = await run(
    'git',
    ['commit', '-m', message, '--', ...CATALOG_FILES],
    repoPath,
    COMMIT_IDENTITY,
  );
  if (commit.code !== 0) {
    return {
      ok: false,
      status: 500,
      reason: 'commit_failed',
      detail: `git commit failed: ${(commit.stderr + commit.stdout).trim()}`,
    };
  }
  const head = await run('git', ['rev-parse', '--short', 'HEAD'], repoPath);
  return {
    ok: true,
    result: {
      success: true,
      pack: resolved.name,
      commit: head.code === 0 ? head.stdout.trim() : '(HEAD unreadable)',
      diffstat,
      report,
      fallbackCheck: await runFallbackCheck(),
    },
  };
}
