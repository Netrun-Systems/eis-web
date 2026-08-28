import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTableRows } from '../../api/client';
import { useApi } from '../../api/useApi';
import { EmptyBox, ErrorBox, LoadingBox } from '../tables/badges';
import { PageHeader } from '../layout/PageHeader';
import { MethodContext } from '../method/MethodContext';

export const NPCS_PATH = 'Data/Core/NPCs.csv';
const ROLES_PATH = 'Data/Core/Roles.csv';
const GROUPS_PATH = 'Data/Core/Groups_Definitions.csv';

/** The list facets — the highest-signal categorical columns NPCs.csv
 * actually carries (measured: Species 32 values, HomeBiome 24,
 * PrimaryDomain 6). */
const FACET_COLUMNS = ['Species', 'HomeBiome', 'PrimaryDomain'] as const;

/**
 * WEB-011 — /people: the 138 NPCs as scannable rows. Name, role and group
 * resolve through Roles.csv / Groups_Definitions.csv (numeric IDs in the NPC
 * row); search plus three data-derived facets. Each row opens the entity
 * form at /people/:rowname.
 */
export function PeoplePage() {
  const npcState = useApi(() => fetchTableRows(NPCS_PATH), []);
  const rolesState = useApi(() => fetchTableRows(ROLES_PATH), []);
  const groupsState = useApi(() => fetchTableRows(GROUPS_PATH), []);

  const [search, setSearch] = useState('');
  const [facets, setFacets] = useState<Record<string, string>>({});

  const columns = npcState.data?.columns ?? [];
  const rows = npcState.data?.rows ?? [];
  const col = useMemo(() => {
    const m = new Map<string, number>();
    columns.forEach((c, i) => m.set(c, i));
    return m;
  }, [columns]);

  const roleNames = useMemo(() => keyToLabel(rolesState.data?.rows, 1), [rolesState.data]);
  const groupNames = useMemo(() => keyToLabel(groupsState.data?.rows, 1), [groupsState.data]);

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
      const name = (r[col.get('Name') ?? -1] ?? '').toLowerCase();
      const id = (r[0] ?? '').toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [rows, search, facets, col]);

  const resolveList = (value: string, labels: ReadonlyMap<string, string>): string => {
    if (value === '') return '';
    return value
      .split(';')
      .filter((t) => t !== '')
      .map((t) => labels.get(t) ?? t)
      .join(', ');
  };

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        eyebrow="People &amp; story"
        title="NPCs"
        context={
          <>
            The {rows.length} people of <code className="font-mono text-xs">Data/Core/NPCs.csv</code>{' '}
            — 83 columns per row, edited one NPC at a time through the entity form. Roles and
            groups resolve through their own tables.
          </>
        }
      />

      <MethodContext surface="people" />

      {(npcState.loading || rolesState.loading || groupsState.loading) && (
        <LoadingBox label="Loading NPCs" />
      )}
      {npcState.error != null && <ErrorBox error={npcState.error} />}

      {npcState.data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or NPC_ID…"
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
            <EmptyBox>No NPC matches the current search and filters.</EmptyBox>
          ) : (
            <div className="overflow-x-auto rounded border border-dust-200 dark:border-dust-700">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr>
                    {['Name', 'NPC_ID', 'Species', 'Roles', 'Groups', 'HomeBiome'].map((h) => (
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
                        <td className="px-2 py-1">
                          <Link
                            to={`/people/${encodeURIComponent(id)}`}
                            className="font-medium text-petrol-ink hover:underline dark:text-petrol-light"
                          >
                            {r[col.get('Name') ?? -1] ?? id}
                          </Link>
                        </td>
                        <td className="px-2 py-1 font-mono text-dust-600 dark:text-dust-300">{id}</td>
                        <td className="px-2 py-1 text-dust-600 dark:text-dust-300">
                          {r[col.get('Species') ?? -1] ?? ''}
                        </td>
                        <td className="max-w-56 truncate px-2 py-1 text-dust-600 dark:text-dust-300">
                          {resolveList(r[col.get('AssignedRoles') ?? -1] ?? '', roleNames)}
                        </td>
                        <td className="max-w-56 truncate px-2 py-1 text-dust-600 dark:text-dust-300">
                          {resolveList(r[col.get('GroupAffiliations') ?? -1] ?? '', groupNames)}
                        </td>
                        <td className="px-2 py-1 text-dust-600 dark:text-dust-300">
                          {r[col.get('HomeBiome') ?? -1] ?? ''}
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

/** Column-0 key → label from a given column index (RoleName / GroupName). */
export function keyToLabel(
  rows: string[][] | undefined,
  labelIndex: number,
): ReadonlyMap<string, string> {
  const m = new Map<string, string>();
  for (const r of rows ?? []) {
    const k = r[0] ?? '';
    if (k !== '' && !m.has(k)) m.set(k, r[labelIndex] ?? '');
  }
  return m;
}
