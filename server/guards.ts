import type {
  Finding,
  FindingSummaryCounts,
  GuardCheckResult,
  ManifestTable,
  TablePayload,
  WriteFailure,
} from './types.ts';
import { isRawRead } from './manifest.ts';

/**
 * Charter §5 hard rules, computed server-side. These are REFUSALS on write,
 * not warnings — each of them fails silently in the raw pipeline and has
 * already cost real data (LootTables kept 37 of 517 rows to a key collision).
 *
 * WEB-005: each rule is computed ONCE (the collect* functions below) and
 * formatted for two surfaces sharing that implementation:
 *   - runGuardFindings — Finding[] for the dry-run endpoint and the UI;
 *   - runHardRuleGuards — the WEB-003 PUT refusal, byte-identical in shape
 *     and wording to before the refactor (PUT refuses iff any ERROR finding).
 *
 * They are UX guards over the payload; the validation authority stays the
 * EISCORE repo's Python (charter D3) — nothing here reimplements a
 * cross-table rule.
 */

const REFUSED_CLASSIFICATIONS = new Set(['generated', 'generated_unverified', 'legacy']);

/** Guard 1 — classification: generated/legacy tables are read-only here. */
export function checkClassification(entry: ManifestTable): WriteFailure | null {
  if (!REFUSED_CLASSIFICATIONS.has(entry.classification)) return null;
  if (entry.classification === 'legacy') {
    return {
      success: false,
      reason: 'classification_refused',
      detail:
        `${entry.path} is classified "legacy" (${entry.flags.legacy?.source ?? 'legacy import'}). ` +
        'Legacy tables are frozen history — not editable through EISWeb.',
    };
  }
  const generator =
    entry.flags.generated?.generator ??
    entry.flags.generated_unverified?.generator ??
    'its generator script';
  return {
    success: false,
    reason: 'classification_refused',
    detail:
      `${entry.path} is classified "${entry.classification}" — it is the OUTPUT of ` +
      `${generator}. Edit the source, not the output (charter D4), then re-run the generator.`,
  };
}

// ---------------------------------------------------------------------------
// The rules themselves — one implementation each.
// ---------------------------------------------------------------------------

export interface KeyCollision {
  key: string;
  /** 1-based data-row numbers (header excluded), as before. */
  rows: number[];
}

/** Rule 3a — column 0 uniqueness. Non-unique keys silently overwrite on
 * import. Returns every colliding key with its row numbers. */
export function collectKeyCollisions(payload: TablePayload): KeyCollision[] {
  if (payload.columns.length === 0) return [];
  const seen = new Map<string, number[]>();
  payload.rows.forEach((row, i) => {
    const key = row[0] ?? '';
    const list = seen.get(key);
    if (list) list.push(i + 1);
    else seen.set(key, [i + 1]);
  });
  return [...seen.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, rows }));
}

export interface SemicolonHazardColumn {
  column: string;
  density: number;
}

/**
 * WEB-011 — split hazards into NEW versus PRE-EXISTING. A column the manifest
 * already flags `semicolon_hazard` was ≥80% `;`-dense in the shipped data:
 * the damage predates the edit (NPCs.csv carries 11 such columns), and
 * refusing every save of such a table would freeze it — including the edits
 * that fix it. Pre-existing hazards therefore WARN; only a hazard this edit
 * would INTRODUCE refuses. The PUT-refuses-iff-any-ERROR-finding invariant is
 * preserved.
 */
export interface SemicolonHazardSplit {
  newHazards: SemicolonHazardColumn[];
  preexisting: SemicolonHazardColumn[];
}

export function splitSemicolonHazards(
  entry: ManifestTable,
  payload: TablePayload,
): SemicolonHazardSplit {
  const flagged = new Set(
    entry.column_types.filter((c) => c.semicolon_hazard).map((c) => c.name),
  );
  const newHazards: SemicolonHazardColumn[] = [];
  const preexisting: SemicolonHazardColumn[] = [];
  for (const h of collectSemicolonHazards(payload)) {
    (flagged.has(h.column) ? preexisting : newHazards).push(h);
  }
  return { newHazards, preexisting };
}

/** Rule 3b — semicolon hazard: a column ≥80% `;`-dense re-infers as
 * TArray<FString>, which the CSV importer cannot populate. */
export function collectSemicolonHazards(payload: TablePayload): SemicolonHazardColumn[] {
  if (payload.rows.length === 0) return [];
  const hazardous: SemicolonHazardColumn[] = [];
  payload.columns.forEach((col, ci) => {
    let withSemicolon = 0;
    let nonEmpty = 0;
    for (const row of payload.rows) {
      const v = row[ci] ?? '';
      if (v !== '') {
        nonEmpty++;
        if (v.includes(';')) withSemicolon++;
      }
    }
    if (nonEmpty > 0 && withSemicolon / nonEmpty >= 0.8) {
      hazardous.push({ column: col, density: withSemicolon / nonEmpty });
    }
  });
  return hazardous;
}

export interface RawReadCommaOffender {
  /** 1-based data-row number; 0 means the header row itself. */
  row: number;
  column: string;
  value: string;
}

/** Rule 3c — raw-read comma ban: these tables are parsed by C++ with a
 * quoteless ParseIntoArray(",") — one comma silently shifts every later
 * column. */
export function collectRawReadCommas(
  entry: ManifestTable,
  payload: TablePayload,
): RawReadCommaOffender[] {
  if (!isRawRead(entry)) return [];
  const offenders: RawReadCommaOffender[] = [];
  payload.rows.forEach((row, ri) => {
    payload.columns.forEach((col, ci) => {
      const v = row[ci] ?? '';
      if (v.includes(',')) offenders.push({ row: ri + 1, column: col, value: v });
    });
  });
  payload.columns.forEach((col) => {
    if (col.includes(',')) offenders.push({ row: 0, column: col, value: col });
  });
  return offenders;
}

// ---------------------------------------------------------------------------
// Surface 1 — the WEB-003 PUT refusal shapes (unchanged wording and detail).
// ---------------------------------------------------------------------------

function keyCollisionFailure(
  payload: TablePayload,
  collisions: KeyCollision[],
): WriteFailure {
  return {
    success: false,
    reason: 'key_collision',
    detail: {
      message:
        `Column 0 (${payload.columns[0]}) must be unique — it becomes the DataTable row key, ` +
        'and colliding rows silently overwrite earlier ones on import. ' +
        `${collisions.length} key(s) collide: ` +
        collisions.map((c) => `"${c.key}" (rows ${c.rows.join(', ')})`).join('; '),
      collisions,
    },
  };
}

function semicolonHazardFailure(hazardous: SemicolonHazardColumn[]): WriteFailure {
  return {
    success: false,
    reason: 'semicolon_hazard',
    detail: {
      message:
        'Multi-values must be |-separated, never ; — at >=80% density a ; column re-infers as ' +
        'TArray<FString> and silently fails to import. Hazardous column(s): ' +
        hazardous
          .map((h) => `${h.column} (${Math.round(h.density * 100)}% ;-dense)`)
          .join(', '),
      columns: hazardous,
    },
  };
}

function rawReadCommaFailure(
  entry: ManifestTable,
  offenders: RawReadCommaOffender[],
): WriteFailure {
  return {
    success: false,
    reason: 'raw_read_comma',
    detail: {
      message:
        `${entry.stem} is raw-read by C++ with a quoteless ParseIntoArray(",") — a comma in any ` +
        'field silently shifts every later column. Offending field(s): ' +
        offenders
          .slice(0, 20)
          .map((o) => `row ${o.row}, column ${o.column}: ${JSON.stringify(o.value)}`)
          .join('; ') +
        (offenders.length > 20 ? ` (and ${offenders.length - 20} more)` : ''),
      offenders,
    },
  };
}

/** Guard 3a as a WriteFailure (kept for direct use and tests). */
export function checkKeyCollisions(payload: TablePayload): WriteFailure | null {
  const collisions = collectKeyCollisions(payload);
  return collisions.length === 0 ? null : keyCollisionFailure(payload, collisions);
}

/** Guard 3b as a WriteFailure (kept for direct use and tests). */
export function checkSemicolonHazard(payload: TablePayload): WriteFailure | null {
  const hazardous = collectSemicolonHazards(payload);
  return hazardous.length === 0 ? null : semicolonHazardFailure(hazardous);
}

/** Guard 3c as a WriteFailure (kept for direct use and tests). */
export function checkRawReadCommas(
  entry: ManifestTable,
  payload: TablePayload,
): WriteFailure | null {
  const offenders = collectRawReadCommas(entry, payload);
  return offenders.length === 0 ? null : rawReadCommaFailure(entry, offenders);
}

/** Run guards 3a–3c and also report the passing checks, so a successful write
 * can carry them as its validationReport. PUT refuses iff any rule found
 * anything (all guard findings are ERROR) — first failing rule wins, in the
 * same order as always. */
export function runHardRuleGuards(
  entry: ManifestTable,
  payload: TablePayload,
): { failure: WriteFailure | null; checks: GuardCheckResult[] } {
  const checks: GuardCheckResult[] = [];
  let failure: WriteFailure | null = null;
  const record = (name: string, f: WriteFailure | null) => {
    checks.push({ name, passed: f === null, detail: f?.detail });
    if (f && !failure) failure = f;
  };
  record('column0_unique', checkKeyCollisions(payload));
  // WEB-011: only NEW hazards refuse; manifest-flagged ones are pre-existing
  // damage and land as WARN findings on the dry-run surface instead.
  const split = splitSemicolonHazards(entry, payload);
  const semicolonFailure =
    split.newHazards.length === 0 ? null : semicolonHazardFailure(split.newHazards);
  checks.push({
    name: 'semicolon_hazard',
    passed: semicolonFailure === null,
    detail:
      semicolonFailure?.detail ??
      (split.preexisting.length > 0
        ? {
            note: `${split.preexisting.length} pre-existing ;-dense column(s) (manifest-flagged) — save allowed`,
            preexisting: split.preexisting,
          }
        : undefined),
  });
  if (semicolonFailure && !failure) failure = semicolonFailure;
  record('raw_read_comma_ban', checkRawReadCommas(entry, payload));
  return { failure, checks };
}

// ---------------------------------------------------------------------------
// Surface 2 — structured findings for the WEB-005 dry-run endpoint / UI.
// ---------------------------------------------------------------------------

/**
 * The same three rules as Finding[]. Granularity chosen for signal, not bulk:
 * one finding per colliding key GROUP (LootTables' 480 lost rows arrive as
 * ~37 grouped findings, not 480 rows of noise), one per hazardous column, one
 * per offending raw-read field (there the row/column pair IS the fact).
 */
export function runGuardFindings(entry: ManifestTable, payload: TablePayload): Finding[] {
  const findings: Finding[] = [];

  for (const c of collectKeyCollisions(payload)) {
    findings.push({
      source: 'table-guards',
      severity: 'ERROR',
      code: 'key_collision',
      table: entry.stem,
      row: c.key,
      column: payload.columns[0],
      message:
        `Key "${c.key}" appears ${c.rows.length} times (rows ${c.rows.join(', ')}) — ` +
        'column 0 becomes the DataTable row key, and later rows silently overwrite ' +
        'earlier ones on import.',
      detail: { key: c.key, rows: c.rows },
    });
  }

  const split = splitSemicolonHazards(entry, payload);
  for (const h of split.newHazards) {
    findings.push({
      source: 'table-guards',
      severity: 'ERROR',
      code: 'semicolon_hazard',
      table: entry.stem,
      column: h.column,
      message:
        `Column ${h.column} is ${Math.round(h.density * 100)}% ;-dense — at >=80% it ` +
        're-infers as TArray<FString> and silently fails to import. Multi-values must ' +
        'be |-separated, never ;.',
      detail: { density: h.density },
    });
  }
  for (const h of split.preexisting) {
    findings.push({
      source: 'table-guards',
      severity: 'WARN',
      code: 'semicolon_hazard_preexisting',
      table: entry.stem,
      column: h.column,
      message:
        `Column ${h.column} is ${Math.round(h.density * 100)}% ;-dense — pre-existing ` +
        '(manifest-flagged): it already re-infers as TArray<FString> and silently fails to ' +
        'import in the shipped data. Saves are allowed; migrating the column to | is the fix.',
      detail: { density: h.density, preexisting: true },
    });
  }

  for (const o of collectRawReadCommas(entry, payload)) {
    findings.push({
      source: 'table-guards',
      severity: 'ERROR',
      code: 'raw_read_comma',
      table: entry.stem,
      row: o.row > 0 ? payload.rows[o.row - 1]?.[0] : undefined,
      column: o.column,
      message:
        `${o.row === 0 ? `Header column ${o.column}` : `Row ${o.row}, column ${o.column}`} ` +
        `contains a comma (${JSON.stringify(o.value)}) — ${entry.stem} is raw-read by C++ ` +
        'with a quoteless ParseIntoArray(","), so one comma silently shifts every later column.',
      detail: { dataRow: o.row, value: o.value },
    });
  }

  return findings;
}

/** Severity tally for a findings list — the summaryCounts every validation
 * response carries. */
export function countFindings(findings: Finding[]): FindingSummaryCounts {
  const counts: FindingSummaryCounts = { ERROR: 0, WARN: 0, INFO: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}
