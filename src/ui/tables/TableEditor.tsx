import React, { useEffect, useMemo, useRef, useState } from 'react';
import { putTableRows } from '../../api/client';
import type { ManifestTable, TablePutSuccess } from '../../api/types';
import {
  computeDirtyStats,
  findDuplicateKeys,
  findSemicolonHazards,
  initEditRows,
  isCellDirty,
  isRawReadEntry,
  RAW_READ_COMMA_HINT,
  refusalToFindings,
  type EditRow,
} from '../../lib/guardHints';
import { detectTypeChanges, normalizeNumericValue, type TypeChange } from '../../lib/typeInference';
import { FindingListItem } from '../validation/findings';

const PAGE_SIZE = 100;

/**
 * WEB-008 — the writable grid for one authored table. Click-to-edit cells
 * (numeric/bool inputs per manifest type), add/duplicate/delete row, live
 * client-side guard hints mirroring server/guards.ts (the server refusals
 * stay authoritative), dirty tracking with Save/Discard, and the charter
 * §5.4 type re-inference confirm before PUT.
 */
/** WEB-011 — the composition seam for pages that wrap the editor (the /loot
 * fix path): live access to the edit rows plus a bulk mutation that lands in
 * the DIRTY state like any hand edit (reviewable, discardable, never saved
 * on its own). */
export interface TableEditorApi {
  rows: EditRow[];
  original: string[][];
  applyBulk: (fn: (rows: EditRow[]) => EditRow[]) => void;
}

export function TableEditor({
  tablePath,
  entry,
  columns,
  initialRows,
  onDirtyChange,
  onSaved,
  onExit,
  extraPanel,
}: {
  tablePath: string;
  entry: ManifestTable;
  columns: string[];
  initialRows: string[][];
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (result: TablePutSuccess) => void;
  onExit: () => void;
  /** WEB-011: rendered between the guard hints and the grid. */
  extraPanel?: (api: TableEditorApi) => React.ReactNode;
}) {
  // The loaded snapshot — Discard restores this; dirty is measured against it.
  const original = useMemo(
    () => initialRows.map((r) => padRow(r, columns.length)),
    [initialRows, columns.length],
  );
  const [rows, setRows] = useState<EditRow[]>(() => initEditRows(original));
  const nextIdRef = useRef(original.length);
  const [page, setPage] = useState(0);

  const [active, setActive] = useState<{ rowId: number; ci: number; draft: string } | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<{ reason: string; detail: unknown } | null>(null);
  const [pendingTypeChanges, setPendingTypeChanges] = useState<TypeChange[] | null>(null);
  const [commaBlocked, setCommaBlocked] = useState(false);

  const rawRead = isRawReadEntry(entry.classification, entry.flags);

  // UE type per column, matched by name with index fallback (same rule as the
  // read-only grid).
  const typeFor = (ci: number): string | null => {
    const byName = entry.column_types.find((c) => c.name === columns[ci]);
    if (byName) return byName.ue5_type;
    return entry.column_types[ci]?.ue5_type ?? null;
  };

  const dirtyStats = useMemo(() => computeDirtyStats(original, rows), [original, rows]);
  useEffect(() => {
    onDirtyChange(dirtyStats.dirty);
  }, [dirtyStats.dirty, onDirtyChange]);

  // Navigation-away warning. BrowserRouter (no data router) means useBlocker
  // is unavailable at react-router 6.22 — beforeunload is the clean choice;
  // the in-app back link is confirmed by the parent via onDirtyChange.
  useEffect(() => {
    if (!dirtyStats.dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyStats.dirty]);

  // Live guard hints — thresholds mirror server/guards.ts exactly.
  const currentCells = useMemo(() => rows.map((r) => r.cells), [rows]);
  const dupGroups = useMemo(() => findDuplicateKeys(currentCells), [currentCells]);
  const dupKeys = useMemo(() => new Set(dupGroups.map((g) => g.key)), [dupGroups]);
  const semicolonHazards = useMemo(
    () => findSemicolonHazards(columns, currentCells, entry.column_types),
    [columns, currentCells, entry.column_types],
  );
  const hazardColIndexes = useMemo(
    () => new Set(semicolonHazards.map((h) => h.index)),
    [semicolonHazards],
  );

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE);

  const mutateRows = (fn: (prev: EditRow[]) => EditRow[]) => {
    setRows(fn);
    setSaveFailure(null);
    setPendingTypeChanges(null);
  };

  const commitActive = () => {
    if (active === null) return;
    const { rowId, ci, draft } = active;
    mutateRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, cells: setCell(r.cells, ci, normalizeNumericValue(draft, typeFor(ci))) } : r,
      ),
    );
    setActive(null);
  };

  const setCellValue = (rowId: number, ci: number, value: string) => {
    mutateRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, cells: setCell(r.cells, ci, value) } : r)),
    );
  };

  const addRow = () => {
    const id = nextIdRef.current++;
    mutateRows((prev) => [...prev, { id, origIndex: null, cells: columns.map(() => '') }]);
    setPage(Math.floor(rows.length / PAGE_SIZE)); // the page the new last row lands on
    setActive({ rowId: id, ci: 0, draft: '' }); // column-0 focused via autoFocus
  };

  const duplicateRow = (rowId: number) => {
    const id = nextIdRef.current++;
    mutateRows((prev) => {
      const i = prev.findIndex((r) => r.id === rowId);
      if (i < 0) return prev;
      const copy: EditRow = { id, origIndex: null, cells: [...prev[i].cells] };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  };

  const deleteRow = (rowId: number) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const pos = rows.indexOf(row) + 1;
    const key = row.cells[0] ?? '';
    if (!window.confirm(`Delete row "${key}" (row ${pos})? This is applied on Save.`)) return;
    mutateRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  const discard = () => {
    if (!dirtyStats.dirty) return;
    if (!window.confirm('Discard all edits and restore the loaded snapshot?')) return;
    setRows(initEditRows(original));
    setActive(null);
    setSaveFailure(null);
    setPendingTypeChanges(null);
    setMessage('');
  };

  const doSave = async () => {
    setSaving(true);
    setSaveFailure(null);
    setPendingTypeChanges(null);
    try {
      const result = await putTableRows(tablePath, {
        columns,
        rows: rows.map((r) => r.cells),
        message: message.trim() !== '' ? message.trim() : undefined,
      });
      if (result.success) {
        onSaved(result);
      } else {
        // Dirty state preserved — nothing is lost on a refusal.
        setSaveFailure({ reason: result.reason, detail: result.detail });
      }
    } catch (e) {
      setSaveFailure({ reason: 'request_failed', detail: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const requestSave = () => {
    if (active !== null) commitActive();
    // Charter §5.4: adding rows can re-infer a column's type — compare the
    // manifest's type against a re-inference of the edited data and confirm
    // explicitly before proceeding.
    const changes = detectTypeChanges(entry.column_types, columns, rows.map((r) => r.cells));
    if (changes.length > 0) {
      setPendingTypeChanges(changes);
      return;
    }
    void doSave();
  };

  // Comma keystroke block for raw-read tables — the hint shows once tripped.
  const guardComma = rawRead
    ? {
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === ',') {
            e.preventDefault();
            setCommaBlocked(true);
          }
        },
        onPaste: (e: React.ClipboardEvent) => {
          if (e.clipboardData.getData('text').includes(',')) {
            e.preventDefault();
            setCommaBlocked(true);
          }
        },
      }
    : {};

  const refusalFindings = useMemo(
    () => (saveFailure === null ? [] : refusalToFindings(saveFailure.reason, saveFailure.detail)),
    [saveFailure],
  );

  const defaultMessage = `eisweb: edit ${entry.stem} (${rows.length} rows)`;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addRow} className={btnPetrol}>
          + Add row
        </button>
        <span className="text-xs text-dust-600 dark:text-dust-400">
          Click a cell to edit · Enter/blur commits · Esc cancels · column order is fixed
        </span>
        <button type="button" onClick={onExit} className={`${btnDust} ml-auto`}>
          Close editor
        </button>
      </div>

      {/* Live client-side guard hints (server refusals stay authoritative). */}
      {(dupGroups.length > 0 || semicolonHazards.length > 0 || commaBlocked) && (
        <div className="space-y-1 rounded border border-amber/50 bg-amber-wash px-3 py-2 text-xs text-amber-ink dark:border-amber-dark dark:bg-amber-tint dark:text-amber-light">
          {dupGroups.map((g) => (
            <div key={g.key}>
              Duplicate column-0 key <code className="font-mono">&quot;{g.key}&quot;</code> in rows{' '}
              {g.rows.join(', ')} — later rows silently overwrite earlier ones on import; the save
              will be refused.
            </div>
          ))}
          {semicolonHazards.map((h) => (
            <div key={h.column}>
              Column <code className="font-mono">{h.column}</code> is{' '}
              {Math.round(h.density * 100)}% ;-dense —{' '}
              {h.preexisting ? (
                <>
                  pre-existing (manifest-flagged): it already re-infers as TArray&lt;FString&gt;
                  and silently fails to import in the shipped data. Saves are allowed; migrating
                  the column to | is the fix.
                </>
              ) : (
                <>
                  at &gt;=80% it re-infers as TArray&lt;FString&gt; and silently fails to import
                  (use | for multi-values); the save will be refused.
                </>
              )}
            </div>
          ))}
          {commaBlocked && <div>{RAW_READ_COMMA_HINT}</div>}
        </div>
      )}

      {/* WEB-011: page-supplied panel over the live edit state (/loot). */}
      {extraPanel !== undefined && extraPanel({ rows, original, applyBulk: mutateRows })}

      {/* The editable grid */}
      <div className="overflow-x-auto rounded border border-dust-200 dark:border-dust-700">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              {columns.map((col, ci) => (
                <th
                  key={ci}
                  className="sticky top-0 z-10 border-b border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-800 px-2 py-1.5 text-left align-bottom"
                >
                  <div className="font-semibold text-dust-900 dark:text-dust-100">{col}</div>
                  {typeFor(ci) !== null && (
                    <div className="font-mono text-[10px] font-normal text-dust-600 dark:text-dust-400">
                      {typeFor(ci)}
                    </div>
                  )}
                </th>
              ))}
              <th className="sticky top-0 z-10 border-b border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-800 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-dust-200/70 dark:divide-dust-700/60">
            {pageRows.map((row) => (
              <tr key={row.id} className="hover:bg-dust-100 dark:hover:bg-dust-800/40">
                {columns.map((_, ci) => {
                  const value = row.cells[ci] ?? '';
                  const dirty = isCellDirty(original, row, ci);
                  const dupHere = ci === 0 && dupKeys.has(value);
                  const hazardHere = hazardColIndexes.has(ci) && value.includes(';');
                  const isActive = active !== null && active.rowId === row.id && active.ci === ci;
                  const ue5 = typeFor(ci);

                  if (ue5 === 'bool') {
                    return (
                      <td key={ci} className={cellClass(dirty, dupHere, hazardHere)}>
                        <select
                          value={value}
                          onChange={(e) => setCellValue(row.id, ci, e.target.value)}
                          className="w-full bg-transparent font-mono text-xs text-dust-800 dark:text-dust-100 outline-none"
                        >
                          {!['true', 'false'].includes(value) && (
                            <option value={value}>{value === '' ? '(empty)' : value}</option>
                          )}
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      </td>
                    );
                  }

                  if (isActive) {
                    return (
                      <td key={ci} className={cellClass(dirty, dupHere, hazardHere)}>
                        <input
                          autoFocus
                          value={active.draft}
                          inputMode={inputModeFor(ue5)}
                          onChange={(e) => setActive({ ...active, draft: e.target.value })}
                          onBlur={commitActive}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitActive();
                            if (e.key === 'Escape') setActive(null);
                            guardComma.onKeyDown?.(e);
                          }}
                          onPaste={guardComma.onPaste}
                          className="w-full min-w-24 bg-dust-0 font-mono text-xs text-dust-800 outline-none ring-1 ring-petrol dark:bg-dust-900 dark:text-dust-100 dark:ring-petrol-dark"
                        />
                      </td>
                    );
                  }

                  return (
                    <td
                      key={ci}
                      onClick={() => setActive({ rowId: row.id, ci, draft: value })}
                      title={value}
                      className={`max-w-md cursor-text truncate font-mono ${cellClass(dirty, dupHere, hazardHere)}`}
                    >
                      {value === '' ? ' ' : value}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-2 py-1 text-right">
                  <button
                    type="button"
                    onClick={() => duplicateRow(row.id)}
                    title="Duplicate this row"
                    className={btnMini}
                  >
                    dup
                  </button>{' '}
                  <button
                    type="button"
                    onClick={() => deleteRow(row.id)}
                    title="Delete this row"
                    className={btnMiniDanger}
                  >
                    del
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-3 text-sm text-dust-600 dark:text-dust-300">
        <button
          type="button"
          onClick={() => setPage(Math.max(0, clampedPage - 1))}
          disabled={clampedPage === 0}
          className={btnPage}
        >
          &larr; Prev
        </button>
        <button
          type="button"
          onClick={() => setPage(Math.min(pageCount - 1, clampedPage + 1))}
          disabled={clampedPage >= pageCount - 1}
          className={btnPage}
        >
          Next &rarr;
        </button>
        <span className="font-mono text-xs tabular-nums">
          page {clampedPage + 1} / {pageCount} &middot; {rows.length} rows
        </span>
      </div>

      {/* §5.4 type re-inference confirm */}
      {pendingTypeChanges !== null && (
        <div className="space-y-2 rounded border border-amber/50 bg-amber-wash px-3 py-2 text-sm text-amber-ink dark:border-amber-dark dark:bg-amber-tint dark:text-amber-light">
          <p className="font-semibold">
            This edit would change {pendingTypeChanges.length} column type
            {pendingTypeChanges.length === 1 ? '' : 's'} on re-import:
          </p>
          <ul className="font-mono text-xs">
            {pendingTypeChanges.map((c) => (
              <li key={c.column}>
                {c.column}: {c.oldType} &rarr; {c.newType}
              </li>
            ))}
          </ul>
          <p className="text-xs">
            Adding or editing rows can re-infer a column&apos;s type — regenerate structs and diff
            property types before importing.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void doSave()} className={btnPetrol}>
              Proceed with save
            </button>
            <button type="button" onClick={() => setPendingTypeChanges(null)} className={btnDust}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Refusal — the server's exact reason/detail in findings language;
          dirty state is preserved so nothing is lost. */}
      {saveFailure !== null && (
        <div className="space-y-1 rounded border border-rust/50 bg-rust-wash px-3 py-2 dark:border-rust-dark dark:bg-rust-tint">
          <p className="text-sm font-semibold text-rust-dark dark:text-rust-light">
            Save refused — <code className="font-mono">{saveFailure.reason}</code>. Your edits are
            preserved below.
          </p>
          <ul className="divide-y divide-dust-200/70 dark:divide-dust-700/60">
            {refusalFindings.map((f, i) => (
              <FindingListItem key={`${f.code}-${f.row ?? ''}-${f.column ?? ''}-${i}`} finding={f} />
            ))}
          </ul>
        </div>
      )}

      {/* Persistent dirty bar — same surface language as the app's other
          persistent bars: card ground, dust border; petrol border once dirty. */}
      <div
        className={`sticky bottom-0 flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-sm ${
          dirtyStats.dirty
            ? 'border-petrol/40 bg-dust-0 text-dust-800 dark:border-petrol-dark dark:bg-dust-800 dark:text-dust-100'
            : 'border-dust-200 bg-dust-0 text-dust-500 dark:border-dust-700 dark:bg-dust-800'
        }`}
      >
        <span className="font-mono text-xs tabular-nums">
          {dirtyStats.cellsEdited} cell{dirtyStats.cellsEdited === 1 ? '' : 's'} edited,{' '}
          {dirtyStats.rowsAdded} row{dirtyStats.rowsAdded === 1 ? '' : 's'} added,{' '}
          {dirtyStats.rowsDeleted} deleted
        </span>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={defaultMessage}
          title="Commit message (optional — placeholder shows the default)"
          className="field min-w-52 flex-1 px-2 py-1 font-mono text-xs"
        />
        <button
          type="button"
          onClick={requestSave}
          disabled={!dirtyStats.dirty || saving || pendingTypeChanges !== null}
          className={btnPetrol}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={discard}
          disabled={!dirtyStats.dirty || saving}
          className={btnDust}
        >
          Discard
        </button>
      </div>
    </div>
  );
}

function padRow(row: string[], width: number): string[] {
  if (row.length >= width) return [...row];
  return [...row, ...Array<string>(width - row.length).fill('')];
}

function setCell(cells: string[], ci: number, value: string): string[] {
  const next = [...cells];
  next[ci] = value;
  return next;
}

function inputModeFor(ue5: string | null): 'decimal' | 'numeric' | 'text' {
  if (ue5 === 'float' || ue5 === 'double') return 'decimal';
  if (ue5 === 'uint8' || ue5 === 'int32') return 'numeric';
  return 'text';
}

/** Cell background language: petrol wash/tint = dirty, rust = duplicate key,
 * amber = semicolon-hazard contributor. Word/hint carries the meaning too. */
function cellClass(dirty: boolean, dupKey: boolean, hazard: boolean): string {
  const base = 'px-2 py-1';
  if (dupKey) return `${base} bg-rust-wash text-rust-dark dark:bg-rust-tint dark:text-rust-light`;
  if (hazard)
    return `${base} bg-amber-wash text-amber-ink dark:bg-amber-tint dark:text-amber-light`;
  if (dirty)
    return `${base} bg-petrol-wash text-petrol-ink dark:bg-petrol-tint dark:text-petrol-light`;
  return `${base} text-dust-600 dark:text-dust-300`;
}

const btnPetrol = 'btn-primary px-2.5 py-1 text-xs';
const btnDust = 'btn-quiet px-2.5 py-1 text-xs';
const btnPage = 'btn-primary px-2.5 py-1';
const btnMini =
  'rounded border border-dust-200 px-1.5 text-[11px] leading-4 text-dust-600 hover:bg-dust-100 dark:border-dust-700 dark:text-dust-300 dark:hover:bg-dust-700';
const btnMiniDanger =
  'rounded border border-rust/50 px-1.5 text-[11px] leading-4 text-rust-dark hover:bg-rust-wash dark:border-rust-dark dark:text-rust-light dark:hover:bg-rust-tint';
