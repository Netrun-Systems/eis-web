/**
 * WEB-008 — pure editing-state helpers for the writable grid: live client
 * hints mirroring the server's charter-§5 hard-rule guards (server/guards.ts
 * stays authoritative — these are as-you-type mirrors, not the refusal), the
 * dirty-diff computation for the save bar, and the mapping from a PUT refusal
 * body to Finding[] for the findings panel.
 */

import type { Finding } from '../api/types';

// ---------------------------------------------------------------------------
// Live guard hints — thresholds identical to server/guards.ts.
// ---------------------------------------------------------------------------

export interface DuplicateKeyGroup {
  key: string;
  /** 1-based data-row numbers, mirroring server collectKeyCollisions. */
  rows: number[];
}

/** Mirror of server collectKeyCollisions: every column-0 value appearing more
 * than once, with all its 1-based row numbers. */
export function findDuplicateKeys(rows: string[][]): DuplicateKeyGroup[] {
  const seen = new Map<string, number[]>();
  rows.forEach((row, i) => {
    const key = row[0] ?? '';
    const list = seen.get(key);
    if (list) list.push(i + 1);
    else seen.set(key, [i + 1]);
  });
  return [...seen.entries()]
    .filter(([, r]) => r.length > 1)
    .map(([key, r]) => ({ key, rows: r }));
}

export interface SemicolonHazardHint {
  column: string;
  index: number;
  density: number;
}

/** Mirror of server collectSemicolonHazards: a column whose non-empty values
 * are >= 80% ';'-dense re-infers as TArray<FString> and silently fails to
 * import. Threshold 0.8, non-empty values only — exactly the server's rule. */
export function findSemicolonHazards(columns: string[], rows: string[][]): SemicolonHazardHint[] {
  if (rows.length === 0) return [];
  const hazards: SemicolonHazardHint[] = [];
  columns.forEach((col, ci) => {
    let withSemicolon = 0;
    let nonEmpty = 0;
    for (const row of rows) {
      const v = row[ci] ?? '';
      if (v !== '') {
        nonEmpty++;
        if (v.includes(';')) withSemicolon++;
      }
    }
    if (nonEmpty > 0 && withSemicolon / nonEmpty >= 0.8) {
      hazards.push({ column: col, index: ci, density: withSemicolon / nonEmpty });
    }
  });
  return hazards;
}

/** Mirror of server isRawRead (server/manifest.ts): checked via the flag, not
 * only the classification — a generated table (BuildingKitCatalog) can carry
 * the raw_read flag under another classification. */
export function isRawReadEntry(
  classification: string,
  flags: Record<string, unknown>,
): boolean {
  return classification === 'raw_read' || flags.raw_read !== undefined;
}

/** The one-line explainer shown when a comma keystroke is blocked in a
 * raw-read table (the ParseIntoArray rule). */
export const RAW_READ_COMMA_HINT =
  'Comma blocked — this table is raw-read by C++ with a quoteless ParseIntoArray(","), so one comma silently shifts every later column.';

// ---------------------------------------------------------------------------
// Edit-state model + dirty diff.
// ---------------------------------------------------------------------------

export interface EditRow {
  /** Stable identity across reorders/inserts (React key + focus target). */
  id: number;
  /** Index into the loaded snapshot, or null for a row added this session. */
  origIndex: number | null;
  cells: string[];
}

export function initEditRows(rows: string[][]): EditRow[] {
  return rows.map((cells, i) => ({ id: i, origIndex: i, cells: [...cells] }));
}

export interface DirtyStats {
  cellsEdited: number;
  rowsAdded: number;
  rowsDeleted: number;
  dirty: boolean;
}

/** The save bar's numbers: N cells edited (in surviving original rows),
 * M rows added, K deleted (original rows no longer present). */
export function computeDirtyStats(original: string[][], rows: EditRow[]): DirtyStats {
  let cellsEdited = 0;
  let rowsAdded = 0;
  const survivingOrig = new Set<number>();
  for (const row of rows) {
    if (row.origIndex === null) {
      rowsAdded++;
      continue;
    }
    survivingOrig.add(row.origIndex);
    const orig = original[row.origIndex] ?? [];
    const width = Math.max(orig.length, row.cells.length);
    for (let ci = 0; ci < width; ci++) {
      if ((row.cells[ci] ?? '') !== (orig[ci] ?? '')) cellsEdited++;
    }
  }
  const rowsDeleted = original.length - survivingOrig.size;
  return {
    cellsEdited,
    rowsAdded,
    rowsDeleted,
    dirty: cellsEdited > 0 || rowsAdded > 0 || rowsDeleted > 0,
  };
}

/** True when this one cell differs from the loaded snapshot. */
export function isCellDirty(original: string[][], row: EditRow, ci: number): boolean {
  if (row.origIndex === null) return true;
  return (row.cells[ci] ?? '') !== (original[row.origIndex]?.[ci] ?? '');
}

// ---------------------------------------------------------------------------
// PUT refusal -> Finding[] for the findings panel.
// ---------------------------------------------------------------------------

interface RefusalDetailObject {
  message?: unknown;
  collisions?: { key: string; rows: number[] }[];
  columns?: { column: string; density: number }[];
  offenders?: { row: number; column: string; value: string }[];
  status?: unknown;
  diffStat?: unknown;
  [key: string]: unknown;
}

/**
 * Map a WEB-003 PUT refusal ({reason, detail}) onto Finding[] so the failure
 * renders in the same findings language as the dry-run panel: collisions one
 * finding per key GROUP, hazards one per column, comma offenders one per
 * field, everything else a single finding carrying the server's exact text.
 */
export function refusalToFindings(reason: string, detail: unknown): Finding[] {
  const d: RefusalDetailObject =
    detail !== null && typeof detail === 'object' ? (detail as RefusalDetailObject) : {};

  if (reason === 'key_collision' && Array.isArray(d.collisions)) {
    return d.collisions.map((c) => ({
      source: 'table-guards',
      severity: 'ERROR',
      code: 'key_collision',
      row: c.key,
      message:
        `Key "${c.key}" appears ${c.rows.length} times (rows ${c.rows.join(', ')}) — ` +
        'column 0 becomes the DataTable row key, and later rows silently overwrite earlier ones on import.',
      detail: c,
    }));
  }

  if (reason === 'semicolon_hazard' && Array.isArray(d.columns)) {
    return d.columns.map((c) => ({
      source: 'table-guards',
      severity: 'ERROR',
      code: 'semicolon_hazard',
      column: c.column,
      message:
        `Column ${c.column} is ${Math.round(c.density * 100)}% ;-dense — at >=80% it re-infers ` +
        'as TArray<FString> and silently fails to import. Multi-values must be |-separated, never ;.',
      detail: c,
    }));
  }

  if (reason === 'raw_read_comma' && Array.isArray(d.offenders)) {
    return d.offenders.map((o) => ({
      source: 'table-guards',
      severity: 'ERROR',
      code: 'raw_read_comma',
      row: o.row > 0 ? String(o.row) : undefined,
      column: o.column,
      message:
        `${o.row === 0 ? `Header column ${o.column}` : `Row ${o.row}, column ${o.column}`} ` +
        `contains a comma (${JSON.stringify(o.value)}) — raw-read tables are parsed with a ` +
        'quoteless ParseIntoArray(","), so one comma silently shifts every later column.',
      detail: o,
    }));
  }

  if (reason === 'file_dirty') {
    const message =
      typeof d.message === 'string'
        ? d.message
        : 'The file already has uncommitted changes in the EISCORE working tree.';
    const diffStat = typeof d.diffStat === 'string' && d.diffStat.trim() !== '' ? d.diffStat : null;
    return [
      {
        source: 'table-guards',
        severity: 'ERROR',
        code: 'file_dirty',
        message:
          message +
          (diffStat !== null
            ? ` Someone has uncommitted hand edits — diff stat: ${diffStat.trim()}`
            : ''),
        detail: d,
      },
    ];
  }

  // Everything else (classification_refused, validation_failed, git/commit
  // errors, bad_request): one finding carrying the server's exact text.
  const text =
    typeof detail === 'string'
      ? detail
      : typeof d.message === 'string'
        ? d.message
        : JSON.stringify(detail ?? reason);
  return [
    {
      source: 'table-guards',
      severity: 'ERROR',
      code: reason,
      message: text,
      detail,
    },
  ];
}
