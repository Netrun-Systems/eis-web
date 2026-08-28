import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTableRows } from '../../api/client';
import { useApi } from '../../api/useApi';
import { EmptyBox, ErrorBox, LoadingBox } from '../tables/badges';
import { PageHeader } from '../layout/PageHeader';
import { MethodContext } from '../method/MethodContext';

export const QUESTS_PATH = 'Data/Quest/Quests.csv';
export const OBJECTIVES_PATH = 'Data/Quest/QuestObjectives.csv';

/** Facets from the real columns: Faction (8 values), QuestType (3),
 * Status (3). */
const FACET_COLUMNS = ['Faction', 'QuestType', 'Status'] as const;

/** WEB-011 — /quests: the 130 quests with faction/type/status facets. */
export function QuestsPage() {
  const state = useApi(() => fetchTableRows(QUESTS_PATH), []);
  const [search, setSearch] = useState('');
  const [facets, setFacets] = useState<Record<string, string>>({});

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
      const name = (r[col.get('QuestName') ?? -1] ?? '').toLowerCase();
      return name.includes(q) || (r[0] ?? '').toLowerCase().includes(q);
    });
  }, [rows, search, facets, col]);

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        eyebrow="People &amp; story"
        title="Quests"
        context={
          <>
            The {rows.length} quests of <code className="font-mono text-xs">{QUESTS_PATH}</code>.
            Each detail joins its objectives from the raw-read{' '}
            <code className="font-mono text-xs">QuestObjectives.csv</code>.
          </>
        }
      />

      <MethodContext surface="quests" />

      {state.loading && <LoadingBox label="Loading quests" />}
      {state.error != null && <ErrorBox error={state.error} />}

      {state.data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quest name or ID…"
              className="field min-w-56 px-2 py-1.5 text-sm"
            />
            {FACET_COLUMNS.map((f) =>
              facetValues[f] !== undefined ? (
                <select
                  key={f}
                  value={facets[f] ?? ''}
                  onChange={(e) => setFacets((prev) => ({ ...prev, [f]: e.target.value }))}
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
            <EmptyBox>No quest matches the current search and filters.</EmptyBox>
          ) : (
            <div className="overflow-x-auto rounded border border-dust-200 dark:border-dust-700">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr>
                    {['Quest', 'QuestID', 'Faction', 'Type', 'Difficulty', 'Status'].map((h) => (
                      <th
                        key={h}
                        className="sticky top-0 z-10 border-b border-dust-200 bg-dust-0 px-2 py-1.5 text-left font-semibold text-dust-900 dark:border-dust-700 dark:bg-dust-800 dark:text-dust-100"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dust-200/70 dark:divide-dust-700/60">
                  {filtered.map((r) => {
                    const id = r[0] ?? '';
                    return (
                      <tr key={id} className="hover:bg-dust-100 dark:hover:bg-dust-800/60">
                        <td className="max-w-72 truncate px-2 py-1">
                          <Link
                            to={`/quests/${encodeURIComponent(id)}`}
                            className="font-medium text-petrol-ink hover:underline dark:text-petrol-light"
                          >
                            {r[col.get('QuestName') ?? -1] || id}
                          </Link>
                        </td>
                        <td className="px-2 py-1 font-mono text-dust-600 dark:text-dust-300">{id}</td>
                        <td className="px-2 py-1 text-dust-600 dark:text-dust-300">
                          {r[col.get('Faction') ?? -1] ?? ''}
                        </td>
                        <td className="px-2 py-1 text-dust-600 dark:text-dust-300">
                          {r[col.get('QuestType') ?? -1] ?? ''}
                        </td>
                        <td className="px-2 py-1 font-mono tabular-nums text-dust-600 dark:text-dust-300">
                          {r[col.get('DifficultyLevel') ?? -1] ?? ''}
                        </td>
                        <td className="px-2 py-1 text-dust-600 dark:text-dust-300">
                          {r[col.get('Status') ?? -1] ?? ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
