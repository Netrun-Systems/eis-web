import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  fetchGitLog,
  fetchTableRows,
  runTableGuardCheck,
  runWorldgenValidation,
} from '../../api/client';
import { useApi } from '../../api/useApi';
import type { Finding, ManifestTable, WorldgenValidationResponse } from '../../api/types';
import { ClassificationBadge, ErrorBox, HazardChip, LoadingBox } from './badges';
import { FindingCountsStrip, FindingListItem } from '../validation/findings';

const PAGE_SIZE = 100;

/** Read-only detail view for one manifest-listed table (WEB-004). */
export function TableDetailPage() {
  const params = useParams();
  const tablePath = params['*'] ?? '';

  const rowsState = useApi(() => fetchTableRows(tablePath), [tablePath]);
  const logState = useApi(() => fetchGitLog(tablePath), [tablePath]);
  // WEB-005: the hard-rule guards dry-run automatically for the open table.
  const guardState = useApi(() => runTableGuardCheck(tablePath), [tablePath]);
  const [page, setPage] = useState(0);

  // WEB-005: on-demand full worldgen validation (Data/WorldGen tables only).
  const isWorldGen = tablePath.startsWith('Data/WorldGen/');
  const [wgResult, setWgResult] = useState<WorldgenValidationResponse | null>(null);
  const [wgRunning, setWgRunning] = useState(false);
  const [wgError, setWgError] = useState<unknown>(null);

  // Landing on a different table always starts at page 1, with no stale
  // validation run carried over.
  useEffect(() => {
    setPage(0);
    setWgResult(null);
    setWgError(null);
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

  // WEB-005: findings shown here = the auto guard dry-run + (when run) the
  // worldgen findings whose table matches this one. The validator names
  // tables by stem, so the match is against entry.stem.
  const wgForThisTable = useMemo(
    () =>
      wgResult === null || entry === undefined
        ? []
        : wgResult.findings.filter((f) => f.table === entry.stem),
    [wgResult, entry],
  );
  const wgOtherCount = wgResult === null ? 0 : wgResult.findings.length - wgForThisTable.length;
  const findings = useMemo(
    () => [...(guardState.data?.findings ?? []), ...wgForThisTable],
    [guardState.data, wgForThisTable],
  );

  // Grid highlighting: every row whose column-0 value a finding names.
  const flaggedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const f of findings) if (f.row !== undefined) s.add(f.row);
    return s;
  }, [findings]);

  // Jump-to-row: first data row carrying the finding's key, paged correctly.
  const jumpToKey = (key: string) => {
    const idx = (rowsState.data?.rows ?? []).findIndex((r) => (r[0] ?? '') === key);
    if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE));
  };

  const runWg = () => {
    setWgRunning(true);
    setWgError(null);
    runWorldgenValidation()
      .then(setWgResult)
      .catch((e) => {
        setWgError(e);
        setWgResult(null);
      })
      .finally(() => setWgRunning(false));
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

          <FindingsPanel
            guardLoading={guardState.loading}
            guardError={guardState.error}
            findings={findings}
            onJumpToKey={jumpToKey}
            isWorldGen={isWorldGen}
            wgRunning={wgRunning}
            wgError={wgError}
            wgResult={wgResult}
            wgOtherCount={wgOtherCount}
            onRunWg={runWg}
          />

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
                {pageRows.map((row, r) => {
                  const flagged = flaggedKeys.has(row[0] ?? '');
                  return (
                    <tr
                      key={clampedPage * PAGE_SIZE + r}
                      className={
                        flagged
                          ? 'bg-rust-tint/50 hover:bg-rust-tint'
                          : 'hover:bg-dust-800/60'
                      }
                    >
                      {row.map((cell, c) => (
                        <td
                          key={c}
                          className={`max-w-md truncate px-2 py-1 font-mono ${
                            flagged ? 'text-rust-light' : 'text-dust-300'
                          }`}
                          title={cell}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  );
                })}
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

/** WEB-005: validation findings for the open table — the auto guard dry-run
 * plus, for Data/WorldGen tables, an on-demand full validator run filtered to
 * this table. Rendered above the grid; flagged rows are highlighted in it. */
function FindingsPanel({
  guardLoading,
  guardError,
  findings,
  onJumpToKey,
  isWorldGen,
  wgRunning,
  wgError,
  wgResult,
  wgOtherCount,
  onRunWg,
}: {
  guardLoading: boolean;
  guardError: unknown;
  findings: Finding[];
  onJumpToKey: (key: string) => void;
  isWorldGen: boolean;
  wgRunning: boolean;
  wgError: unknown;
  wgResult: WorldgenValidationResponse | null;
  wgOtherCount: number;
  onRunWg: () => void;
}) {
  const ordered = useMemo(() => {
    const rank = { ERROR: 0, WARN: 1, INFO: 2 } as const;
    return [...findings].sort((a, b) => rank[a.severity] - rank[b.severity]);
  }, [findings]);

  return (
    <section className="space-y-2 rounded border border-dust-700 bg-dust-800 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-dust-100">Validation</h3>
        {isWorldGen && (
          <button
            type="button"
            onClick={onRunWg}
            disabled={wgRunning}
            className="rounded border border-petrol-dark bg-petrol-tint px-2.5 py-1 text-xs text-petrol-light hover:bg-petrol-dark disabled:cursor-not-allowed disabled:text-dust-500"
          >
            {wgRunning ? 'Validating…' : 'Validate WorldGen'}
          </button>
        )}
        {wgResult && (
          <FindingCountsStrip
            counts={wgResult.summaryCounts}
            ranAt={wgResult.ranAt}
            exitCode={wgResult.exitCode}
          />
        )}
      </div>

      {guardLoading && <LoadingBox label="Running guard checks" />}
      {guardError != null && <ErrorBox error={guardError} />}
      {wgError != null && <ErrorBox error={wgError} />}

      {!guardLoading && guardError == null && ordered.length === 0 && (
        <p className="text-sm text-dust-500">
          No findings — hard-rule guard checks pass
          {wgResult !== null ? '; the worldgen validator reports nothing for this table' : ''}.
        </p>
      )}

      {ordered.length > 0 && (
        <ul className="divide-y divide-dust-700/60">
          {ordered.map((f, i) => (
            <FindingListItem
              key={`${f.source}-${f.code}-${f.row ?? ''}-${f.column ?? ''}-${i}`}
              finding={f}
              onJumpToRow={f.row !== undefined ? () => onJumpToKey(f.row as string) : undefined}
            />
          ))}
        </ul>
      )}

      {wgResult !== null && wgOtherCount > 0 && (
        <p className="text-xs text-dust-500">
          <Link to="/" className="text-petrol-light hover:text-petrol hover:underline">
            {wgOtherCount} finding{wgOtherCount === 1 ? '' : 's'} in other tables — see the
            dashboard
          </Link>
        </p>
      )}
    </section>
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
