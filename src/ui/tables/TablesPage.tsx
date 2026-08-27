import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchManifest, fetchTables } from '../../api/client';
import { useApi } from '../../api/useApi';
import type { Classification, TableListEntry } from '../../api/types';
import { MethodContext } from '../method/MethodContext';
import { ClassificationBadge, ErrorBox, HazardChip, LoadingBox } from './badges';
import { ManifestSummaryStrip } from './ManifestSummaryStrip';

const CLASSIFICATIONS: Classification[] = [
  'authored',
  'generated',
  'generated_unverified',
  'legacy',
  'raw_read',
];

/** Manifest-driven read-only table browser (WEB-004). */
export function TablesPage() {
  const tablesState = useApi(() => fetchTables(), []);
  const manifestState = useApi(() => fetchManifest(), []);

  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState<Classification | 'all'>('all');

  // Row-loss straight from the manifest summary (never recomputed) …
  const rowLossByPath = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of manifestState.data?.manifest.summary.tables_losing_rows_on_import ?? []) {
      m.set(e.path, e.rows_lost_on_import);
    }
    return m;
  }, [manifestState.data]);

  // … and the per-table semicolon-hazard column count from the full manifest.
  const semicolonColsByPath = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of manifestState.data?.manifest.tables ?? []) {
      const n = t.column_types.filter((c) => c.semicolon_hazard).length;
      if (n > 0) m.set(t.path, n);
    }
    return m;
  }, [manifestState.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tablesState.data?.tables ?? []).filter((t) => {
      if (classFilter !== 'all' && t.classification !== classFilter) return false;
      if (q !== '' && !t.stem.toLowerCase().includes(q) && !t.path.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [tablesState.data, query, classFilter]);

  const byFolder = useMemo(() => {
    const groups = new Map<string, TableListEntry[]>();
    for (const t of filtered) {
      const g = groups.get(t.folder);
      if (g) g.push(t);
      else groups.set(t.folder, [t]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="max-w-5xl space-y-4">
      <h2 className="text-xl font-bold text-dust-100">Tables</h2>

      <MethodContext surface="tables" />

      {manifestState.loading && <LoadingBox label="Loading manifest" />}
      {manifestState.error != null && <ErrorBox error={manifestState.error} />}
      {manifestState.data && <ManifestSummaryStrip summary={manifestState.data.manifest.summary} />}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by stem or path…"
          className="w-64 rounded border border-dust-700 bg-dust-900 px-3 py-1.5 text-sm text-dust-100 placeholder:text-dust-500 focus:border-petrol focus:outline-none focus:ring-1 focus:ring-petrol/50"
        />
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value as Classification | 'all')}
          className="rounded border border-dust-700 bg-dust-900 px-2 py-1.5 text-sm text-dust-100 focus:border-petrol focus:outline-none"
        >
          <option value="all">all classifications</option>
          {CLASSIFICATIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {tablesState.data && (
          <span className="text-xs text-dust-500">
            {filtered.length} of {tablesState.data.count} tables
          </span>
        )}
      </div>

      {tablesState.loading && <LoadingBox label="Loading tables" />}
      {tablesState.error != null && <ErrorBox error={tablesState.error} />}

      {tablesState.data && (
        <div className="space-y-4">
          {byFolder.map(([folder, entries]) => (
            <section key={folder}>
              <h3 className="mb-1 font-mono text-xs uppercase tracking-wider text-dust-500">
                Data/{folder}
              </h3>
              <ul className="divide-y divide-dust-700 rounded border border-dust-700 bg-dust-800">
                {entries.map((t) => (
                  <li key={t.path}>
                    <Link
                      to={`/tables/${t.path}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-petrol-tint/40"
                    >
                      <span className="font-mono text-sm text-petrol-light">{t.stem}</span>
                      <span className="font-mono text-xs text-dust-500">
                        {t.row_count} rows
                      </span>
                      <ClassificationBadge classification={t.classification} />
                      {rowLossByPath.has(t.path) && (
                        <HazardChip title="Non-unique column 0: later rows silently overwrite earlier ones on import">
                          loses {rowLossByPath.get(t.path)} rows on import
                        </HazardChip>
                      )}
                      {semicolonColsByPath.has(t.path) && (
                        <HazardChip title="A ≥80%-dense semicolon column re-infers as TArray<FString> and fails to import — multi-values must use |">
                          semicolon hazard: {semicolonColsByPath.get(t.path)} col
                          {semicolonColsByPath.get(t.path) === 1 ? '' : 's'}
                        </HazardChip>
                      )}
                      {(t.classification === 'raw_read' || t.flags.raw_read !== undefined) && (
                        <HazardChip title='Raw-read by quoteless ParseIntoArray(",") — a comma in any field silently shifts every later column'>
                          raw-read: no commas
                        </HazardChip>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {byFolder.length === 0 && (
            <p className="text-sm text-dust-500">No tables match the current search/filter.</p>
          )}
        </div>
      )}
    </div>
  );
}
