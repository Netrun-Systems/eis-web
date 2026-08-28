import React, { useCallback, useMemo, useState } from 'react';
import { fetchTableRows } from '../../api/client';
import { useApi } from '../../api/useApi';
import type { TablePutSuccess } from '../../api/types';
import { findDuplicateKeys, type EditRow } from '../../lib/guardHints';
import { proposeSuffixes } from '../../lib/keyProposals';
import { ErrorBox, HazardChip, LoadingBox } from '../tables/badges';
import { PageHeader } from '../layout/PageHeader';
import { MethodContext } from '../method/MethodContext';
import { TableEditor, type TableEditorApi } from '../tables/TableEditor';

const LOOT_PATH = 'Data/Inventory/LootTables.csv';

/**
 * WEB-011 — /loot: LootTables.csv, the collision showcase and its fix path.
 * The table loses 480 of its 517 rows on import TODAY (37 colliding
 * LootTableID keys — the WG-103 audit's largest survivor). The collision
 * groups lead the page, computed LIVE from the edit state; each offers a
 * one-click "make keys unique" suffix proposal (LT001 → LT001_2, LT001_3…)
 * applied into the DIRTY state for review — never auto-saved; Discard
 * restores the loaded snapshot. The server's save guard keeps refusing while
 * any collision remains, and that refusal renders as the fix list it is.
 */
export function LootPage() {
  const state = useApi(() => fetchTableRows(LOOT_PATH), []);
  const data = state.data;
  const [dirty, setDirty] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<TablePutSuccess | null>(null);
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);

  const loadedStats = useMemo(() => collisionStats(data?.rows ?? []), [data]);

  const onSaved = (result: TablePutSuccess) => {
    setSaveSuccess(result);
    state.reload();
  };

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        eyebrow="People &amp; story"
        title="Loot Tables"
        context={
          <span className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-xs">{LOOT_PATH}</code>
            {loadedStats.groups.length > 0 && (
              <HazardChip title="Non-unique column 0: later rows silently overwrite earlier ones on import">
                loses {loadedStats.lost} of {loadedStats.total} rows on import
              </HazardChip>
            )}
            <HazardChip title='Raw-read by C++ with a quoteless ParseIntoArray(",") — commas are refused'>
              raw-read: no commas
            </HazardChip>
            <span>
              {loadedStats.groups.length} colliding keys. The proposals below are the fix path —
              applied to the dirty state for review, never auto-saved.
            </span>
          </span>
        }
      />

      <MethodContext surface="loot" />

      {state.loading && <LoadingBox label="Loading LootTables" />}
      {state.error != null && <ErrorBox error={state.error} />}

      {saveSuccess !== null && (
        <div className="rounded border border-petrol/40 bg-petrol-wash px-3 py-2 text-sm text-petrol-ink dark:border-petrol-dark dark:bg-petrol-tint dark:text-petrol-light">
          Saved — commit <code className="font-mono">{saveSuccess.commit}</code>
        </div>
      )}

      {data && (
        <TableEditor
          key={saveSuccess?.commit ?? 'initial'}
          tablePath={LOOT_PATH}
          entry={data.manifestEntry}
          columns={data.columns}
          initialRows={data.rows}
          onDirtyChange={onDirtyChange}
          onSaved={onSaved}
          onExit={() => {
            /* the editor IS this page — no exit surface */
          }}
          extraPanel={(api) => <CollisionPanel api={api} columns={data.columns} dirty={dirty} />}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface CollisionStats {
  total: number;
  lost: number;
  groups: { key: string; rows: number[] }[];
}

function collisionStats(rows: string[][]): CollisionStats {
  const groups = findDuplicateKeys(rows);
  return {
    total: rows.length,
    lost: groups.reduce((sum, g) => sum + g.rows.length - 1, 0),
    groups,
  };
}

/** The showcase: collision groups computed LIVE from the edit state, each
 * expandable to its rows, each with the one-click suffix proposal. */
function CollisionPanel({
  api,
  columns,
  dirty,
}: {
  api: TableEditorApi;
  columns: string[];
  dirty: boolean;
}) {
  const cells = api.rows.map((r) => r.cells);
  const stats = collisionStats(cells);

  const applyProposal = (key: string) => {
    api.applyBulk((prev: EditRow[]) => {
      const proposals = proposeSuffixes(
        prev.map((r) => r.cells),
        key,
      );
      if (proposals.length === 0) return prev;
      const byIndex = new Map(proposals.map((p) => [p.rowIndex, p.newKey]));
      return prev.map((r, i) => {
        const newKey = byIndex.get(i);
        if (newKey === undefined) return r;
        const next = [...r.cells];
        next[0] = newKey;
        return { ...r, cells: next };
      });
    });
  };

  const applyAll = () => {
    for (const g of stats.groups) applyProposal(g.key);
  };

  // Columns worth showing inside an expanded group (besides the key).
  const previewCols = ['TableName', 'ItemID', 'DropChance', 'MinQuantity', 'MaxQuantity']
    .map((name) => columns.indexOf(name))
    .filter((i) => i >= 0);

  if (stats.groups.length === 0) {
    return (
      <div className="rounded border border-petrol/40 bg-petrol-wash px-3 py-2 text-sm text-petrol-ink dark:border-petrol-dark dark:bg-petrol-tint dark:text-petrol-light">
        No column-0 collisions in the current edit state — every one of the {stats.total} rows
        would survive import.{dirty ? ' Review the proposed keys below, then Save or Discard.' : ''}
      </div>
    );
  }

  return (
    <section className="space-y-2 rounded border border-rust/50 bg-rust-wash/50 p-3 dark:border-rust-dark dark:bg-rust-tint/40">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-rust-dark dark:text-rust-light">
          Key collisions — live
        </h3>
        <span className="font-mono text-xs tabular-nums text-rust-dark dark:text-rust-light">
          {stats.groups.length} colliding keys &middot; {stats.lost} of {stats.total} rows lost on
          import
        </span>
        <button type="button" onClick={applyAll} className="btn-primary ml-auto px-2.5 py-1 text-xs">
          Make all keys unique
        </button>
      </div>
      <p className="text-xs text-dust-600 dark:text-dust-300">
        &ldquo;Make keys unique&rdquo; suffixes the later occurrences (LT001 &rarr; LT001_2,
        LT001_3 …) in the dirty state — review the highlighted cells, then Save, or Discard to
        restore the loaded file. Note: on import today the LAST duplicate wins, so consumers of a
        bare key currently get the last row; after the fix the bare key names the first — that
        semantic shift is exactly what the review is for.
      </p>
      <ul className="divide-y divide-dust-200/70 dark:divide-dust-700/60">
        {stats.groups.map((g) => (
          <li key={g.key} className="py-1">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                <code className="font-mono text-xs text-rust-dark dark:text-rust-light">
                  {g.key}
                </code>
                <span className="font-mono text-xs tabular-nums text-dust-600 dark:text-dust-300">
                  {g.rows.length} rows &middot; {g.rows.length - 1} lost
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    applyProposal(g.key);
                  }}
                  className="btn-primary px-2 py-0.5 text-[11px]"
                >
                  Make keys unique
                </button>
              </summary>
              <div className="mt-1 overflow-x-auto">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left font-semibold text-dust-900 dark:text-dust-100">
                        row
                      </th>
                      <th className="px-2 py-1 text-left font-semibold text-dust-900 dark:text-dust-100">
                        {columns[0]}
                      </th>
                      {previewCols.map((ci) => (
                        <th
                          key={ci}
                          className="px-2 py-1 text-left font-semibold text-dust-900 dark:text-dust-100"
                        >
                          {columns[ci]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dust-200/70 dark:divide-dust-700/60">
                    {g.rows.map((rowNo) => {
                      const r = cells[rowNo - 1] ?? [];
                      return (
                        <tr key={rowNo}>
                          <td className="px-2 py-0.5 font-mono tabular-nums text-dust-600 dark:text-dust-400">
                            {rowNo}
                          </td>
                          <td className="px-2 py-0.5 font-mono text-rust-dark dark:text-rust-light">
                            {r[0] ?? ''}
                          </td>
                          {previewCols.map((ci) => (
                            <td
                              key={ci}
                              className="max-w-56 truncate px-2 py-0.5 font-mono text-dust-600 dark:text-dust-300"
                              title={r[ci] ?? ''}
                            >
                              {r[ci] ?? ''}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
