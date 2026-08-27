import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchGitLog, fetchTableRows } from '../../api/client';
import { useApi } from '../../api/useApi';
import type { ManifestTable } from '../../api/types';
import { ClassificationBadge, ErrorBox, HazardChip, LoadingBox } from './badges';

const PAGE_SIZE = 100;

/** Read-only detail view for one manifest-listed table (WEB-004). */
export function TableDetailPage() {
  const params = useParams();
  const tablePath = params['*'] ?? '';

  const rowsState = useApi(() => fetchTableRows(tablePath), [tablePath]);
  const logState = useApi(() => fetchGitLog(tablePath), [tablePath]);
  const [page, setPage] = useState(0);

  // Landing on a different table always starts at page 1.
  useEffect(() => {
    setPage(0);
  }, [tablePath]);

  const entry = rowsState.data?.manifestEntry;
  const totalRows = rowsState.data?.rows.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () =>
      (rowsState.data?.rows ?? []).slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE),
    [rowsState.data, clampedPage],
  );

  // UE type per column header, matched by name with index fallback.
  const typeFor = (name: string, index: number): string | null => {
    if (!entry) return null;
    const byName = entry.column_types.find((c) => c.name === name);
    if (byName) return byName.ue5_type;
    return entry.column_types[index]?.ue5_type ?? null;
  };

  return (
    <div className="max-w-6xl space-y-4">
      <div className="text-xs">
        <Link to="/tables" className="text-petrol-light hover:text-petrol hover:underline">
          &larr; All tables
        </Link>
      </div>

      {rowsState.loading && <LoadingBox label="Loading table" />}
      {rowsState.error != null && <ErrorBox error={rowsState.error} />}

      {rowsState.data && entry && (
        <>
          <TableHeader entry={entry} />
          <GeneratedBanner entry={entry} />

          <div className="overflow-x-auto rounded border border-dust-700">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr>
                  {rowsState.data.columns.map((col, i) => (
                    <th
                      key={i}
                      className="sticky top-0 border-b border-dust-700 bg-dust-800 px-2 py-1.5 text-left align-bottom"
                    >
                      <div className="font-semibold text-dust-100">{col}</div>
                      {typeFor(col, i) && (
                        <div className="font-mono text-[10px] font-normal text-dust-500">
                          {typeFor(col, i)}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-dust-700/60">
                {pageRows.map((row, r) => (
                  <tr key={clampedPage * PAGE_SIZE + r} className="hover:bg-dust-800/60">
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className="max-w-md truncate px-2 py-1 font-mono text-dust-300"
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

          <div className="flex items-center gap-3 text-sm text-dust-300">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, clampedPage - 1))}
              disabled={clampedPage === 0}
              className="rounded border border-petrol-dark bg-petrol-tint px-2.5 py-1 text-petrol-light hover:bg-petrol-dark disabled:cursor-not-allowed disabled:border-dust-700 disabled:bg-dust-800 disabled:text-dust-500"
            >
              &larr; Prev
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.min(pageCount - 1, clampedPage + 1))}
              disabled={clampedPage >= pageCount - 1}
              className="rounded border border-petrol-dark bg-petrol-tint px-2.5 py-1 text-petrol-light hover:bg-petrol-dark disabled:cursor-not-allowed disabled:border-dust-700 disabled:bg-dust-800 disabled:text-dust-500"
            >
              Next &rarr;
            </button>
            <span className="font-mono text-xs">
              page {clampedPage + 1} / {pageCount} &middot; {totalRows} rows total
            </span>
          </div>
        </>
      )}

      <section className="space-y-1">
        <h3 className="text-sm font-semibold text-dust-100">Recent history</h3>
        {logState.loading && <LoadingBox label="Loading git log" />}
        {logState.error != null && <ErrorBox error={logState.error} />}
        {logState.data &&
          (logState.data.commits.length === 0 ? (
            <p className="text-sm text-dust-500">No commits touch this file.</p>
          ) : (
            <ul className="space-y-0.5 font-mono text-xs text-dust-300">
              {logState.data.commits.map((c) => (
                <li key={c.hash}>
                  <span className="text-petrol-light">{c.hash}</span>
                  <span className="text-dust-500"> &middot; </span>
                  <span className="text-dust-500">{c.date.slice(0, 10)}</span>
                  <span className="text-dust-500"> &middot; </span>
                  {c.subject}
                </li>
              ))}
            </ul>
          ))}
      </section>
    </div>
  );
}

/** Manifest facts: path, classification + source note, generator, row key, FKs. */
function TableHeader({ entry }: { entry: ManifestTable }) {
  const classDetail = entry.flags[entry.classification];
  const generator =
    entry.flags.generated?.generator ?? entry.flags.generated_unverified?.generator ?? null;
  const semicolonCols = entry.column_types.filter((c) => c.semicolon_hazard).map((c) => c.name);
  const rawRead = entry.classification === 'raw_read' || entry.flags.raw_read !== undefined;

  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold text-dust-100">{entry.stem}</h2>
        <ClassificationBadge classification={entry.classification} />
        {entry.row_key.rows_lost_on_import > 0 && (
          <HazardChip title="Non-unique column 0: later rows silently overwrite earlier ones on import">
            loses {entry.row_key.rows_lost_on_import} rows on import
          </HazardChip>
        )}
        {semicolonCols.length > 0 && (
          <HazardChip title={`Semicolon-dense columns: ${semicolonCols.join(', ')}`}>
            semicolon hazard: {semicolonCols.length} col{semicolonCols.length === 1 ? '' : 's'}
          </HazardChip>
        )}
        {rawRead && (
          <HazardChip title='Raw-read by quoteless ParseIntoArray(",") — a comma in any field silently shifts every later column'>
            raw-read: no commas
          </HazardChip>
        )}
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-dust-500">Path</dt>
        <dd className="font-mono text-xs text-dust-300">{entry.path}</dd>

        <dt className="text-dust-500">Classification</dt>
        <dd className="text-dust-300">
          {entry.classification}
          {typeof classDetail?.source === 'string' && (
            <span className="text-dust-500"> — {classDetail.source}</span>
          )}
        </dd>

        {generator !== null && (
          <>
            <dt className="text-dust-500">Generator</dt>
            <dd className="font-mono text-xs text-dust-300">{generator}</dd>
          </>
        )}

        <dt className="text-dust-500">Row key</dt>
        <dd className="text-dust-300">
          column 0 <code className="font-mono text-xs text-petrol-light">{entry.row_key.column0}</code>
          {' — '}
          {entry.row_key.unique ? (
            'unique'
          ) : (
            <span className="text-rust-light">
              NOT unique ({entry.row_key.rows_lost_on_import} rows lost on import)
            </span>
          )}
        </dd>

        {entry.foreign_keys && entry.foreign_keys.length > 0 && (
          <>
            <dt className="text-dust-500">Foreign keys</dt>
            <dd className="space-y-0.5 font-mono text-xs text-dust-300">
              {entry.foreign_keys.map((fk) => (
                <div key={`${fk.column}->${fk.target_table}`}>
                  {fk.column} &rarr; {fk.target_table}{' '}
                  <span className="text-dust-500">({fk.target_prefix})</span>
                </div>
              ))}
            </dd>
          </>
        )}
      </dl>
    </header>
  );
}

/** Visible banner on generated tables — text from the manifest entry. */
function GeneratedBanner({ entry }: { entry: ManifestTable }) {
  const detail = entry.flags.generated ?? entry.flags.generated_unverified;
  if (!detail) return null;
  return (
    <div className="rounded border border-rust-dark bg-rust-tint px-3 py-2 text-sm text-rust-light">
      Generated by <code className="font-mono">{detail.generator ?? 'a script'}</code> — edits
      belong in the source
      {entry.classification === 'generated_unverified' && typeof detail.source === 'string' && (
        <span className="text-rust-light/80"> ({detail.source})</span>
      )}
    </div>
  );
}
