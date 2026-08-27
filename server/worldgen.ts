import fs from 'node:fs';
import path from 'node:path';
import { run } from './git.ts';
import { parseCsvText, writeCsvAtomic } from './csv.ts';
import { loadManifest } from './manifest.ts';
import { countFindings } from './guards.ts';
import { mapValidatorJson, runValidatorRaw } from './validation.ts';
import type {
  Finding,
  ManifestColumnType,
  ManifestForeignKey,
  WorldgenBaseRow,
  WorldgenFkOptions,
  WorldgenGroupToken,
  WorldgenPatch,
  WorldgenPutBody,
  WorldgenPutResult,
  WorldgenSourceEntry,
  WorldgenSourcesResult,
  WorldgenWebResult,
} from './types.ts';

/**
 * WEB-006 — the vocabulary editor's server side. EISWeb owns exactly two
 * source fragments per normalized world-gen table:
 *
 *   Documentation/WorldGen_Extensions/<Stem>.web.csv        row additions
 *   Documentation/WorldGen_Extensions/<Stem>.web.patch.csv  column edits
 *
 * Scripts/normalize_worldgen_metadata.py merges them (base -> .ext.csv ->
 * .web.csv -> .patch.csv -> .web.patch.csv) into the generated
 * Data/WorldGen/<Stem>.csv. This module writes ONLY the two web fragments and
 * re-runs the generator chain; the generated outputs are never edited
 * directly (charter D4) — they are regenerated and committed together with
 * the fragments that produced them.
 */

// Mirror of normalize_worldgen_metadata.py's TABLES stems (its output-stem
// list, verified 2026-08-27). The allow-list for every /api/worldgen route.
export const WORLDGEN_STEMS = [
  'Regions',
  'StructureTypes',
  'SpaceTypes',
  'ConnectionTypes',
  'InfrastructureNetworks',
  'AssetStates',
  'AssetRegistry',
  'GenerationRules',
] as const;

export const EXT_DIR = 'Documentation/WorldGen_Extensions';
export const OUT_DIR = 'Data/WorldGen';

/** The Ops normalize's patch layer understands: `set` replaces the cell,
 * `append` adds |-separated tokens not already present. An empty Op in the
 * file means append (the script's own default). Anything else is skipped by
 * the script with only a warning — so the server refuses it outright. */
export const LEGAL_PATCH_OPS = ['append', 'set'] as const;

export const PATCH_HEADER = ['RowName', 'Column', 'Op', 'Value', 'Reason'] as const;

export function isWorldgenStem(stem: string): stem is (typeof WORLDGEN_STEMS)[number] {
  return (WORLDGEN_STEMS as readonly string[]).includes(stem);
}

const webCsvRel = (stem: string) => `${EXT_DIR}/${stem}.web.csv`;
const webPatchRel = (stem: string) => `${EXT_DIR}/${stem}.web.patch.csv`;
const extCsvRel = (stem: string) => `${EXT_DIR}/${stem}.ext.csv`;
const patchCsvRel = (stem: string) => `${EXT_DIR}/${stem}.patch.csv`;
const baseCsvRel = (stem: string) => `${OUT_DIR}/${stem}.csv`;

const abs = (repoPath: string, rel: string) => path.join(repoPath, ...rel.split('/'));

function csvInfo(repoPath: string, rel: string): { exists: boolean; rowCount: number | null } {
  const p = abs(repoPath, rel);
  if (!fs.existsSync(p)) return { exists: false, rowCount: null };
  try {
    return { exists: true, rowCount: parseCsvText(fs.readFileSync(p, 'utf-8')).rows.length };
  } catch {
    return { exists: true, rowCount: null };
  }
}

// ---------------------------------------------------------------------------
// GET /api/worldgen/sources
// ---------------------------------------------------------------------------

export function getWorldgenSources(repoPath: string): WorldgenSourcesResult {
  const stems: WorldgenSourceEntry[] = WORLDGEN_STEMS.map((stem) => ({
    stem,
    base: { path: baseCsvRel(stem), ...csvInfo(repoPath, baseCsvRel(stem)) },
    fragments: {
      ext: csvInfo(repoPath, extCsvRel(stem)),
      web: csvInfo(repoPath, webCsvRel(stem)),
      patch: csvInfo(repoPath, patchCsvRel(stem)),
      webPatch: csvInfo(repoPath, webPatchRel(stem)),
    },
  }));
  return { extDir: EXT_DIR, stems };
}

// ---------------------------------------------------------------------------
// GET /api/worldgen/web/:stem
// ---------------------------------------------------------------------------

/** The worldgen_reference block Exports/TableManifest.json carries (source:
 * the validator's own vocabulary). All fields optional — an older manifest
 * without the block degrades to empty lists, never a crash. */
interface WorldgenReference {
  wildcards?: unknown;
  adjacency_columns_accepting_categories?: unknown;
  traversal_type_movement_modes?: unknown;
}

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function readRowNameSet(repoPath: string, rel: string): Set<string> {
  const p = abs(repoPath, rel);
  if (!fs.existsSync(p)) return new Set();
  try {
    const { columns, rows } = parseCsvText(fs.readFileSync(p, 'utf-8'));
    const i = columns.indexOf('RowName');
    if (i < 0) return new Set();
    return new Set(rows.map((r) => r[i] ?? '').filter((n) => n !== ''));
  } catch {
    return new Set();
  }
}

function readGroupTokens(repoPath: string): WorldgenGroupToken[] {
  const p = abs(repoPath, `${OUT_DIR}/GroupTokens.csv`);
  if (!fs.existsSync(p)) return [];
  try {
    const { columns, rows } = parseCsvText(fs.readFileSync(p, 'utf-8'));
    const idx = (c: string) => columns.indexOf(c);
    const [ti, di, mi] = [idx('RowName'), idx('Domain'), idx('Members')];
    if (ti < 0) return [];
    return rows
      .map((r) => ({
        token: r[ti] ?? '',
        domain: di >= 0 ? (r[di] ?? '') : '',
        members: mi >= 0 ? (r[mi] ?? '').split('|').filter((m) => m !== '') : [],
      }))
      .filter((t) => t.token !== '');
  } catch {
    return [];
  }
}

export function getWorldgenWeb(repoPath: string, stem: string): WorldgenWebResult {
  const basePath = abs(repoPath, baseCsvRel(stem));
  if (!fs.existsSync(basePath)) {
    throw new Error(`${baseCsvRel(stem)} does not exist — run the normalize pipeline first`);
  }
  const base = parseCsvText(fs.readFileSync(basePath, 'utf-8'));
  const columns = base.columns;
  const nameI = columns.indexOf('RowName');
  const displayI = columns.indexOf('DisplayName');

  // Manifest facts for this table: column types (for form field inference)
  // and the FK declarations.
  const loaded = loadManifest(repoPath);
  const entry = loaded.manifest.tables.find((t) => t.path === baseCsvRel(stem));
  const columnTypes: ManifestColumnType[] = entry?.column_types ?? [];
  const fks: ManifestForeignKey[] = entry?.foreign_keys ?? [];
  const reference = (loaded.manifest.worldgen_reference ?? {}) as WorldgenReference;
  const wildcards = strArray(reference.wildcards);
  const adjacencyCategoryColumns = strArray(reference.adjacency_columns_accepting_categories);
  const traversalMovementModes = strArray(reference.traversal_type_movement_modes);
  const groupTokens = readGroupTokens(repoPath);

  // Web-owned rows, remapped into the base column order (the fragment file
  // carries the same header, but never trust column order).
  const webAbs = abs(repoPath, webCsvRel(stem));
  let webRows: string[][] = [];
  const webNames = new Set<string>();
  if (fs.existsSync(webAbs)) {
    const web = parseCsvText(fs.readFileSync(webAbs, 'utf-8'));
    const idx = new Map(web.columns.map((c, i) => [c, i]));
    webRows = web.rows.map((r) => columns.map((c) => (idx.has(c) ? (r[idx.get(c)!] ?? '') : '')));
    for (const r of webRows) if (r[nameI]) webNames.add(r[nameI]);
  }

  // Base + ext rows (RowName + DisplayName only). Owner is decided by whether
  // the RowName appears in <Stem>.ext.csv — cheap and exact, since the
  // generated table is base + ext + web merged.
  const extNames = readRowNameSet(repoPath, extCsvRel(stem));
  const baseRows: WorldgenBaseRow[] = base.rows
    .filter((r) => !webNames.has(r[nameI] ?? ''))
    .map((r) => ({
      rowName: r[nameI] ?? '',
      displayName: displayI >= 0 ? (r[displayI] ?? '') : '',
      owner: extNames.has(r[nameI] ?? '') ? ('ext' as const) : ('base' as const),
    }));

  // Web-owned patches.
  const patchAbs = abs(repoPath, webPatchRel(stem));
  let webPatches: WorldgenPatch[] = [];
  if (fs.existsSync(patchAbs)) {
    const parsed = parseCsvText(fs.readFileSync(patchAbs, 'utf-8'));
    const idx = new Map(parsed.columns.map((c, i) => [c, i]));
    const cell = (r: string[], c: string) => (idx.has(c) ? (r[idx.get(c)!] ?? '') : '');
    webPatches = parsed.rows.map((r) => ({
      rowName: cell(r, 'RowName'),
      column: cell(r, 'Column'),
      op: cell(r, 'Op'),
      value: cell(r, 'Value'),
      reason: cell(r, 'Reason'),
    }));
  }

  // FK picker options, computed here so the client never guesses: the target
  // table's RowNames, plus the legal wildcards, plus group tokens whose
  // domain is the target table, plus reference-blessed special cases
  // (adjacency columns accept SpaceTypes Category values; TraversalType
  // accepts movement modes).
  const fkOptions: WorldgenFkOptions[] = fks.map((fk) => {
    const rowNames = [...readRowNameSet(repoPath, baseCsvRel(fk.target_table))].sort();
    const tokens = groupTokens
      .filter((t) => t.domain === fk.target_table)
      .map((t) => t.token)
      .sort();
    let extras: string[] = [];
    if (fk.target_table === 'SpaceTypes' && adjacencyCategoryColumns.includes(fk.column)) {
      const catI = columns.indexOf('Category');
      if (stem === 'SpaceTypes' && catI >= 0) {
        extras = [...new Set(base.rows.map((r) => r[catI] ?? '').filter((c) => c !== ''))].sort();
      }
    }
    if (fk.column === 'TraversalType') extras = traversalMovementModes;
    return {
      column: fk.column,
      targetTable: fk.target_table,
      targetPrefix: fk.target_prefix,
      rowNames,
      groupTokens: tokens,
      extras,
    };
  });

  return {
    stem,
    columns,
    columnTypes,
    baseRows,
    webRows,
    webPatches,
    fks,
    fkOptions,
    wildcards,
    groupTokens,
    adjacencyCategoryColumns,
    traversalMovementModes,
  };
}

// ---------------------------------------------------------------------------
// PUT /api/worldgen/web/:stem
// ---------------------------------------------------------------------------

const GENERATOR_CHAIN: string[][] = [
  ['Scripts/normalize_worldgen_metadata.py'],
  ['Scripts/author_group_tokens.py'],
];

/** The lines of normalize's stdout worth returning to a designer: the merge /
 * patch / write report, warnings and overrides. Falls back to the last lines
 * when the format ever changes rather than returning nothing. */
export function trimNormalizeOutput(stdout: string): string {
  const lines = stdout.split(/\r?\n/);
  const kept = lines.filter((l) =>
    /^\s*(extension:|web:|patch:|web patch:|wrote |WARNING|OVERRIDE|STILL UNRESOLVED)/.test(l),
  );
  if (kept.length > 0) return kept.join('\n');
  return lines.slice(-20).join('\n').trim();
}

interface FragmentPlan {
  rel: string;
  /** null = the fragment should not exist (empty edit set). */
  content: { columns: string[]; rows: string[][] } | null;
}

/** Validate the request body against the stem's base table. Returns a refusal
 * or the two fragment plans. */
function planFragments(
  repoPath: string,
  stem: string,
  body: WorldgenPutBody,
):
  | { ok: false; result: WorldgenPutResult }
  | { ok: true; webRows: string[][]; patches: WorldgenPatch[]; columns: string[] } {
  const bad = (detail: string): { ok: false; result: WorldgenPutResult } => ({
    ok: false,
    result: { success: false, reason: 'bad_request', detail },
  });

  const basePath = abs(repoPath, baseCsvRel(stem));
  if (!fs.existsSync(basePath)) return bad(`${baseCsvRel(stem)} does not exist`);
  const base = parseCsvText(fs.readFileSync(basePath, 'utf-8'));
  const columns = base.columns;
  const nameI = columns.indexOf('RowName');
  if (nameI < 0) return bad(`${baseCsvRel(stem)} has no RowName column`);

  const webRows = body.webRows;
  const patches = body.webPatches;
  if (!Array.isArray(webRows) || !Array.isArray(patches)) {
    return bad('body must carry {webRows: string[][], webPatches: WorldgenPatch[]}');
  }

  // --- webRows shape + RowName discipline
  const seen = new Map<string, number>();
  for (let i = 0; i < webRows.length; i++) {
    const row = webRows[i];
    if (!Array.isArray(row) || row.some((v) => typeof v !== 'string')) {
      return bad(`webRows[${i}] is not a string[]`);
    }
    if (row.length !== columns.length) {
      return bad(
        `webRows[${i}] has ${row.length} values; the ${stem} header has ${columns.length} columns`,
      );
    }
    const name = row[nameI] ?? '';
    if (name === '') return bad(`webRows[${i}] has an empty RowName`);
    if (seen.has(name)) {
      return {
        ok: false,
        result: {
          success: false,
          reason: 'key_collision',
          detail:
            `RowName "${name}" appears more than once in webRows (rows ${seen.get(name)! + 1} ` +
            `and ${i + 1}) — column 0 becomes the DataTable row key.`,
        },
      };
    }
    seen.set(name, i);
  }

  // A web row shadowing a base/ext-owned RowName would be skipped by normalize
  // with only a warning — the row would silently not exist. Refuse instead.
  // (Edits to existing rows are what patches are for.)
  const webNamesOnDisk = readRowNameSet(repoPath, webCsvRel(stem));
  const extNames = readRowNameSet(repoPath, extCsvRel(stem));
  for (const [name] of seen) {
    const inGenerated = base.rows.some((r) => (r[nameI] ?? '') === name);
    const ownedByWeb = webNamesOnDisk.has(name);
    if (inGenerated && !ownedByWeb) {
      const owner = extNames.has(name) ? `${stem}.ext.csv` : 'the base table';
      return {
        ok: false,
        result: {
          success: false,
          reason: 'key_collision',
          detail:
            `RowName "${name}" already exists in ${stem} (owned by ${owner}). ` +
            'normalize would skip the web row silently — amend the existing row with a patch instead.',
        },
      };
    }
  }

  // --- patch discipline: legal Op, known column, known target row, a Reason
  const knownNames = new Set<string>([
    ...base.rows.map((r) => r[nameI] ?? ''),
    ...[...seen.keys()],
  ]);
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i];
    if (
      p === null ||
      typeof p !== 'object' ||
      typeof p.rowName !== 'string' ||
      typeof p.column !== 'string' ||
      typeof p.op !== 'string' ||
      typeof p.value !== 'string' ||
      typeof p.reason !== 'string'
    ) {
      return bad(`webPatches[${i}] must be {rowName, column, op, value, reason} of strings`);
    }
    const op = p.op.trim().toLowerCase();
    if (op !== '' && !(LEGAL_PATCH_OPS as readonly string[]).includes(op)) {
      return bad(
        `webPatches[${i}] has Op "${p.op}" — the patch layer supports only: ` +
          `${LEGAL_PATCH_OPS.join(', ')} (empty means append)`,
      );
    }
    if (p.rowName === '') return bad(`webPatches[${i}] has an empty RowName`);
    if (!columns.includes(p.column)) {
      return bad(`webPatches[${i}] targets unknown column "${p.column}" — normalize would skip it`);
    }
    if (!knownNames.has(p.rowName)) {
      return bad(
        `webPatches[${i}] targets unknown row "${p.rowName}" — normalize would skip it silently`,
      );
    }
    if (p.reason.trim() === '') {
      return bad(
        `webPatches[${i}] has no Reason — an amendment to someone else's data has to say why`,
      );
    }
  }

  return {
    ok: true,
    columns,
    webRows: webRows.map((r) => [...r]),
    patches: patches.map((p) => ({
      rowName: p.rowName,
      column: p.column,
      op: p.op.trim().toLowerCase() === 'set' ? 'set' : 'append',
      value: p.value,
      reason: p.reason,
    })),
  };
}

/** Restore the pre-call tree: delete fragment files that did not exist before
 * (checkout cannot remove untracked files), then `git checkout` scoped to
 * exactly the two generated/source paths. Returns a complaint or null. */
async function rollbackWorldgen(repoPath: string, createdNew: string[]): Promise<string | null> {
  for (const rel of createdNew) {
    try {
      fs.rmSync(abs(repoPath, rel), { force: true });
    } catch (err) {
      return `could not delete ${rel}: ${String(err)}`;
    }
  }
  const co = await run('git', ['checkout', '--', EXT_DIR, OUT_DIR], repoPath);
  if (co.code !== 0) return `git checkout failed: ${co.stderr.trim()}`;
  const status = await run('git', ['status', '--porcelain', '--', EXT_DIR, OUT_DIR], repoPath);
  if (status.code !== 0) return `git status failed after rollback: ${status.stderr.trim()}`;
  if (status.stdout.trim() !== '') {
    return `tree not clean after rollback:\n${status.stdout.trim()}`;
  }
  return null;
}

/**
 * The WEB-006 mutation contract, in this exact order (mirroring WEB-003):
 *   1. body validation (shape, RowName collisions, legal patch Ops)
 *   2. dirty guard over EVERY file the operation may touch — the fragment
 *      files and all of Data/WorldGen (normalize regenerates the lot)
 *   3. atomic fragment write (empty edit set = no file, byte-identical
 *      no-web-files baseline)
 *   4. the generator chain: normalize -> author_group_tokens -> validator
 *   5. any validator ERROR -> full rollback to the pre-call tree
 *   6. one commit of fragments + regenerated outputs
 */
export async function putWorldgenWeb(
  repoPath: string,
  stem: string,
  body: WorldgenPutBody,
): Promise<WorldgenPutResult> {
  // 1 — validate
  const plan = planFragments(repoPath, stem, body);
  if (!plan.ok) return plan.result;

  // 2 — dirty guard. Wider than the strictly-touched set on purpose: the
  // commit is scoped to these two paths, so nothing dirty may hide anywhere
  // under them or it would be swept into (or block) the commit.
  const dirty = await run('git', ['status', '--porcelain', '--', EXT_DIR, OUT_DIR], repoPath);
  if (dirty.code !== 0) {
    return { success: false, reason: 'git_error', detail: dirty.stderr.trim() };
  }
  if (dirty.stdout.trim() !== '') {
    return {
      success: false,
      reason: 'file_dirty',
      detail: {
        message:
          `${EXT_DIR} / ${OUT_DIR} have uncommitted changes in the EISCORE working tree — ` +
          'commit or discard them first; EISWeb will not bury an in-progress hand edit.',
        status: dirty.stdout.trim(),
      },
    };
  }

  // 3 — write (or remove) the two fragments, remembering what to undo
  const fragments: FragmentPlan[] = [
    {
      rel: webCsvRel(stem),
      content: plan.webRows.length > 0 ? { columns: plan.columns, rows: plan.webRows } : null,
    },
    {
      rel: webPatchRel(stem),
      content:
        plan.patches.length > 0
          ? {
              columns: [...PATCH_HEADER],
              rows: plan.patches.map((p) => [p.rowName, p.column, p.op, p.value, p.reason]),
            }
          : null,
    },
  ];
  const createdNew: string[] = [];
  try {
    for (const f of fragments) {
      const p = abs(repoPath, f.rel);
      const existed = fs.existsSync(p);
      if (f.content === null) {
        if (existed) fs.rmSync(p, { force: true });
        continue;
      }
      if (!existed) createdNew.push(f.rel);
      writeCsvAtomic(p, f.content, '\n');
    }
  } catch (err) {
    const complaint = await rollbackWorldgen(repoPath, createdNew);
    return {
      success: false,
      reason: 'write_failed',
      detail: `fragment write failed (${String(err)})${complaint ? `; ROLLBACK ALSO FAILED: ${complaint}` : '; tree rolled back'}`,
    };
  }

  // 4 — the generator chain, then the validator
  let normalizeStdout = '';
  for (const args of GENERATOR_CHAIN) {
    const r = await run('python', args, repoPath);
    if (args[0].includes('normalize')) normalizeStdout = r.stdout;
    if (r.code !== 0) {
      const complaint = await rollbackWorldgen(repoPath, createdNew);
      return {
        success: false,
        reason: 'generator_failed',
        detail: {
          script: args[0],
          exitCode: r.code,
          output: (r.stdout + '\n' + r.stderr).trim().slice(-4000),
          rollback: complaint ?? 'tree rolled back to pre-call state',
        },
      };
    }
  }

  const v = await runValidatorRaw(repoPath);
  if (v.json === null) {
    const complaint = await rollbackWorldgen(repoPath, createdNew);
    return {
      success: false,
      reason: 'validator_failed',
      detail: {
        message: `validate_worldgen_metadata.py produced no JSON (exit ${v.code})`,
        output: (v.stdout + '\n' + v.stderr).trim().slice(-4000),
        rollback: complaint ?? 'tree rolled back to pre-call state',
      },
    };
  }
  let findings: Finding[];
  try {
    findings = mapValidatorJson(v.json);
  } catch (err) {
    const complaint = await rollbackWorldgen(repoPath, createdNew);
    return {
      success: false,
      reason: 'validator_failed',
      detail: {
        message: String(err),
        rollback: complaint ?? 'tree rolled back to pre-call state',
      },
    };
  }

  // 5 — any ERROR rolls the tree back to the pre-call state; the designer
  // sees exactly what their rows broke. (Baseline on HEAD is 0 errors.)
  const summaryCounts = countFindings(findings);
  if (summaryCounts.ERROR > 0) {
    const complaint = await rollbackWorldgen(repoPath, createdNew);
    if (complaint !== null) {
      return {
        success: false,
        reason: 'rollback_failed',
        detail: { message: complaint, findings, summaryCounts },
      };
    }
    return { success: false, reason: 'validation_errors', findings, summaryCounts };
  }

  // 6 — one commit: the fragments + every regenerated output
  const changed = await run('git', ['status', '--porcelain', '--', EXT_DIR, OUT_DIR], repoPath);
  if (changed.code !== 0) {
    return { success: false, reason: 'git_error', detail: changed.stderr.trim() };
  }
  if (changed.stdout.trim() === '') {
    // Byte-identical to HEAD (e.g. clearing an already-absent fragment set).
    return {
      success: true,
      commit: null,
      normalizeOutput: trimNormalizeOutput(normalizeStdout),
      findings,
      summaryCounts,
    };
  }

  const identity = {
    GIT_AUTHOR_NAME: 'EISWeb',
    GIT_AUTHOR_EMAIL: 'daniel@netrunsystems.com',
    GIT_COMMITTER_NAME: 'EISWeb',
    GIT_COMMITTER_EMAIL: 'daniel@netrunsystems.com',
  };
  const message =
    body.message && body.message.trim() !== ''
      ? body.message.trim()
      : `eisweb: vocabulary edit ${stem} (+${plan.webRows.length} rows, ${plan.patches.length} patches)`;
  const add = await run('git', ['add', '-A', '--', EXT_DIR, OUT_DIR], repoPath, identity);
  if (add.code !== 0) {
    const complaint = await rollbackWorldgen(repoPath, createdNew);
    return {
      success: false,
      reason: 'commit_failed',
      detail: `git add failed: ${add.stderr.trim()}${complaint ? `; rollback also failed: ${complaint}` : ''}`,
    };
  }
  const commit = await run(
    'git',
    ['commit', '-m', message, '--', EXT_DIR, OUT_DIR],
    repoPath,
    identity,
  );
  if (commit.code !== 0) {
    return {
      success: false,
      reason: 'commit_failed',
      detail: `git commit failed: ${(commit.stderr + commit.stdout).trim()}`,
    };
  }
  const head = await run('git', ['rev-parse', '--short', 'HEAD'], repoPath);
  return {
    success: true,
    commit: head.code === 0 ? head.stdout.trim() : '(HEAD unreadable)',
    normalizeOutput: trimNormalizeOutput(normalizeStdout),
    findings,
    summaryCounts,
  };
}
