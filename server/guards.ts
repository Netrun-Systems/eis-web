import type {
  GuardCheckResult,
  ManifestTable,
  TablePayload,
  WriteFailure,
} from './types.ts';
import { isRawRead } from './manifest.ts';

/**
 * Charter §5 hard rules, computed server-side. These are REFUSALS, not
 * warnings — each of them fails silently in the raw pipeline and has already
 * cost real data (LootTables kept 37 of 517 rows to a key collision).
 *
 * They are UX guards over the submitted payload; the validation authority
 * stays the EISCORE repo's Python (charter D3) — nothing here reimplements a
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

/** Guard 3a — column 0 uniqueness. Non-unique keys silently overwrite on
 * import; every colliding key is named. */
export function checkKeyCollisions(payload: TablePayload): WriteFailure | null {
  if (payload.columns.length === 0) return null;
  const seen = new Map<string, number[]>();
  payload.rows.forEach((row, i) => {
    const key = row[0] ?? '';
    const list = seen.get(key);
    if (list) list.push(i + 1);
    else seen.set(key, [i + 1]);
  });
  const collisions = [...seen.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, rows }));
  if (collisions.length === 0) return null;
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

/** Guard 3b — semicolon hazard: a column ≥80% `;`-dense re-infers as
 * TArray<FString>, which the CSV importer cannot populate. */
export function checkSemicolonHazard(payload: TablePayload): WriteFailure | null {
  if (payload.rows.length === 0) return null;
  const hazardous: { column: string; density: number }[] = [];
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
  if (hazardous.length === 0) return null;
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

/** Guard 3c — raw-read comma ban: these tables are parsed by C++ with a
 * quoteless ParseIntoArray(",") — one comma silently shifts every later
 * column. Refuse any field containing a comma, naming row and column. */
export function checkRawReadCommas(
  entry: ManifestTable,
  payload: TablePayload,
): WriteFailure | null {
  if (!isRawRead(entry)) return null;
  const offenders: { row: number; column: string; value: string }[] = [];
  payload.rows.forEach((row, ri) => {
    payload.columns.forEach((col, ci) => {
      const v = row[ci] ?? '';
      if (v.includes(',')) offenders.push({ row: ri + 1, column: col, value: v });
    });
  });
  payload.columns.forEach((col) => {
    if (col.includes(',')) offenders.push({ row: 0, column: col, value: col });
  });
  if (offenders.length === 0) return null;
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

/** Run guards 3a–3c and also report the passing checks, so a successful write
 * can carry them as its validationReport. */
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
  record('semicolon_hazard', checkSemicolonHazard(payload));
  record('raw_read_comma_ban', checkRawReadCommas(entry, payload));
  return { failure, checks };
}
