import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTableRows } from '../../api/client';
import { useApi } from '../../api/useApi';
import { EmptyBox, ErrorBox, LoadingBox } from '../tables/badges';
import { PageHeader } from '../layout/PageHeader';
import { MethodContext } from '../method/MethodContext';

const ITEM_PATH = 'Data/Inventory/Item.csv';
const PAGE_SIZE = 100;

/** Facets from the real columns: ItemType (17 values), Availability (8). */
const FACET_COLUMNS = ['ItemType', 'Availability'] as const;

/**
 * WEB-011 — /items: the 542-row Item table, composed over the existing grid
 * substrate. Deliberate call: NO per-item entity form — Item.csv is 14 flat
 * columns, one grid row reads whole on screen; the sectioned form earns its
 * keep at 83 columns, not 14. Filter and read here; editing happens in the
 * writable table editor.
 */
export function ItemsPage() {
  const state = useApi(() => fetchTableRows(ITEM_PATH), []);
  const [search, setSearch] = useState('');
  const [facets, setFacets] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);

  const columns = state.data?.columns ?? [];
  const rows = state.data?.rows ?? [];
  const col = useMemo(() => {
    const m = new Map<string, number>();
    columns.forEach((c, i) => m.set(c, i));
    return m;
  }, [columns]);

  const facetValues = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const f of FACET_COLUMNS) {
      const ci = col.get(f);
      if (ci === undefined) continue;
      out[f] = [...new Set(rows.map((r) => r[ci] ?? '').filter((v) => v !== ''))].sort();
    }
    return out;
  }, [rows, col]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      for (const f of FACET_COLUMNS) {
        const want = facets[f];
        if (want !== undefined && want !== '' && (r[col.get(f) ?? -1] ?? '') !== want) return false;
      }
      if (q === '') return true;
      const name = (r[col.get('ItemName') ?? -1] ?? '').toLowerCase();
      return name.includes(q) || (r[0] ?? '').toLowerCase().includes(q);
    });
  }, [rows, search, facets, col]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE);

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        eyebrow="People &amp; story"
        title="Items"
        context={
          <>
            The {rows.length} rows of <code className="font-mono text-xs">{ITEM_PATH}</code> —
            14 flat columns, so the grid row IS the item view; no entity form was built for it.
          </>
        }
        actions={
          <Link to={`/tables/${ITEM_PATH}`} className="btn-primary px-3 py-1.5 text-sm">
            Edit in the table editor &rarr;
          </Link>
        }
      />

      <MethodContext surface="items" />

      {state.loading && <LoadingBox label="Loading items" />}
      {state.error != null && <ErrorBox error={state.error} />}

      {state.data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search item name or ID…"
              className="field min-w-56 px-2 py-1.5 text-sm"
            />
            {FACET_COLUMNS.map((f) =>
              facetValues[f] !== undefined ? (
                <select
                  key={f}
                  value={facets[f] ?? ''}
                  onChange={(e) => {
                    setFacets((prev) => ({ ...prev, [f]: e.target.value }));
                    setPage(0);
                  }}
                  className="field px-2 py-1.5 text-sm"
                  title={`Filter by ${f}`}
                >
                  <option value="">{f}: all</option>
                  {facetValues[f].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : null,
            )}
            <span className="font-mono text-xs tabular-nums text-dust-600 dark:text-dust-400">
              {filtered.length} of {rows.length}
            </span>
          </div>

          {filtered.length === 0 ? (
            <EmptyBox>No item matches the current search and filters.</EmptyBox>
          ) : (
            <>
              <div className="overflow-x-auto rounded border border-dust-200 dark:border-dust-700">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      {columns.map((c, i) => (
                        <th
                          key={i}
                          className="sticky top-0 z-10 border-b border-dust-200 bg-dust-0 px-2 py-1.5 text-left font-semibold text-dust-900 dark:border-dust-700 dark:bg-dust-800 dark:text-dust-100"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dust-200/70 dark:divide-dust-700/60">
                    {pageRows.map((r, ri) => (
                      <tr key={`${r[0]}-${ri}`} className="hover:bg-dust-100 dark:hover:bg-dust-800/60">
                        {r.map((cell, ci) => (
                          <td
                            key={ci}
                            className="max-w-md truncate px-2 py-1 font-mono text-dust-600 dark:text-dust-300"
                            title={cell}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3 text-sm text-dust-600 dark:text-dust-300">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(0, clampedPage - 1))}
                  disabled={clampedPage === 0}
                  className="btn-primary px-2.5 py-1"
                >
                  &larr; Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(pageCount - 1, clampedPage + 1))}
                  disabled={clampedPage >= pageCount - 1}
                  className="btn-primary px-2.5 py-1"
                >
                  Next &rarr;
                </button>
                <span className="font-mono text-xs tabular-nums">
                  page {clampedPage + 1} / {pageCount} &middot; {filtered.length} filtered rows
                </span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
