import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchHealth, fetchManifest, fetchReport, runWorldgenValidation } from '../api/client';
import { useApi } from '../api/useApi';
import type {
  Finding,
  ManifestResponse,
  ManifestSummary,
  ManifestTable,
  WorldgenValidationResponse,
} from '../api/types';
import { ErrorBox, LoadingBox } from './tables/badges';
import { ManifestSummaryStrip } from './tables/ManifestSummaryStrip';
import { Markdown } from './markdown/Markdown';
import { MethodContext } from './method/MethodContext';
import { PageHeader } from './layout/PageHeader';
import { FindingCountsStrip, FindingListItem, bySeverity } from './validation/findings';

/** Live strip over /api/health (WEB-003). Shows the connected EISCORE repo +
 * HEAD, or how to start the API when the fetch fails. Shared with the
 * WEB-014 workflow landing page. */
export function ApiHealthStrip() {
  const { data: health, error, loading } = useApi(() => fetchHealth(), []);

  if (error != null) return <ErrorBox error={error} />;
  if (loading || !health) {
    return (
      <div className="rounded border border-dust-200 dark:border-dust-700 px-3 py-2 text-sm text-dust-600 dark:text-dust-300">
        Checking API…
      </div>
    );
  }
  return (
    <div className="rounded border border-petrol/40 dark:border-petrol-dark bg-petrol-wash/60 dark:bg-petrol-tint/40 px-3 py-2 text-sm text-dust-900 dark:text-dust-100">
      <span className="font-semibold text-petrol-ink dark:text-petrol-light">API connected</span>
      {' — '}
      <code className="font-mono text-xs">{health.repoPath}</code>
      {' @ '}
      <code className="font-mono text-xs text-petrol-ink dark:text-petrol-light">{health.head ?? '?'}</code>
    </div>
  );
}

/** Staleness gate: on demand only — GET /api/manifest?check=1 never regenerates. */
function ManifestFreshnessCheck() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ManifestResponse['check'] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const check = () => {
    setChecking(true);
    setError(null);
    fetchManifest(true)
      .then((m) => setResult(m.check ?? { stale: false, output: '(no check output)' }))
      .catch((e) => {
        setError(e);
        setResult(null);
      })
      .finally(() => setChecking(false));
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={check}
        disabled={checking}
        className="rounded border border-petrol/40 dark:border-petrol-dark bg-petrol-wash dark:bg-petrol-tint px-3 py-1.5 text-sm text-petrol-ink dark:text-petrol-light hover:bg-petrol/20 dark:hover:bg-petrol-dark disabled:cursor-not-allowed disabled:text-dust-500"
      >
        {checking ? 'Checking…' : 'Check manifest freshness'}
      </button>
      {error != null && <ErrorBox error={error} />}
      {result && (
        <div
          className={`rounded border px-3 py-2 text-sm ${
            result.stale
              ? 'border-rust/50 dark:border-rust-dark bg-rust-wash dark:bg-rust-tint text-rust-dark dark:text-rust-light'
              : 'border-petrol/40 dark:border-petrol-dark bg-petrol-wash/60 dark:bg-petrol-tint/40 text-dust-900 dark:text-dust-100'
          }`}
        >
          <span className="font-semibold">
            {result.stale ? 'STALE — regenerate with Scripts/export_table_manifest.py' : 'Fresh'}
          </span>
          {result.output !== '' && (
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-dust-600 dark:text-dust-300">
              {result.output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/** One of the two allow-listed repo reports, rendered as markdown. */
function ReportCard({ name, title }: { name: string; title: string }) {
  const { data, error, loading } = useApi(() => fetchReport(name), [name]);
  return (
    <section className="rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-800 p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
        <h3 className="text-sm font-semibold text-dust-900 dark:text-dust-100">{title}</h3>
        {data && (
          <span className="font-mono text-[10px] text-dust-600 dark:text-dust-400">
            {data.path} &middot; {data.mtime.slice(0, 16).replace('T', ' ')}
          </span>
        )}
      </div>
      {loading && <LoadingBox label="Loading report" />}
      {error != null && <ErrorBox error={error} />}
      {data && <Markdown source={data.markdown} />}
    </section>
  );
}

/** WEB-005: run the repo's worldgen validator and show its findings, grouped
 * by severity — ERROR first (rust), then WARN (amber), INFO collapsed. Each
 * finding links to its table's detail page when the stem resolves to a
 * manifest path. */
function ValidationCard({ tables }: { tables: ManifestTable[] }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WorldgenValidationResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  // The validator names tables by stem. Resolve stem -> detail-page path via
  // the manifest, preferring the WorldGen folder when a stem is ambiguous.
  const pathForStem = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tables) if (!m.has(t.stem)) m.set(t.stem, t.path);
    for (const t of tables) if (t.folder === 'WorldGen') m.set(t.stem, t.path);
    return m;
  }, [tables]);

  const run = () => {
    setRunning(true);
    setError(null);
    runWorldgenValidation()
      .then(setResult)
      .catch((e) => {
        setError(e);
        setResult(null);
      })
      .finally(() => setRunning(false));
  };

  const linkFor = (f: Finding): string | undefined => {
    const p = f.table !== undefined ? pathForStem.get(f.table) : undefined;
    return p !== undefined ? `/tables/${p}` : undefined;
  };

  const renderGroup = (findings: Finding[]) => (
    <ul className="divide-y divide-dust-200/70 dark:divide-dust-700/60">
      {findings.map((f, i) => (
        <FindingListItem
          key={`${f.code}-${f.table ?? ''}-${f.column ?? ''}-${i}`}
          finding={f}
          tableLinkTo={linkFor(f)}
        />
      ))}
    </ul>
  );

  const errors = result === null ? [] : bySeverity(result.findings, 'ERROR');
  const warns = result === null ? [] : bySeverity(result.findings, 'WARN');
  const infos = result === null ? [] : bySeverity(result.findings, 'INFO');

  return (
    <section className="space-y-2 rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-800 p-3">
      <MethodContext surface="validation" />
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-dust-900 dark:text-dust-100">Validation</h3>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="rounded border border-petrol/40 dark:border-petrol-dark bg-petrol-wash dark:bg-petrol-tint px-3 py-1.5 text-sm text-petrol-ink dark:text-petrol-light hover:bg-petrol/20 dark:hover:bg-petrol-dark disabled:cursor-not-allowed disabled:text-dust-500"
        >
          {running ? 'Running…' : 'Run WorldGen validation'}
        </button>
        {result && (
          <FindingCountsStrip
            counts={result.summaryCounts}
            ranAt={result.ranAt}
            exitCode={result.exitCode}
          />
        )}
      </div>

      {error != null && <ErrorBox error={error} />}
      {result === null && error == null && !running && (
        <p className="text-sm text-dust-600 dark:text-dust-400">
          Runs <code className="font-mono text-xs">Scripts/validate_worldgen_metadata.py</code>{' '}
          server-side against <code className="font-mono text-xs">Data/WorldGen</code> and
          renders its findings here.
        </p>
      )}

      {result && (
        <div className="space-y-2">
          {result.findings.length === 0 && (
            <p className="text-sm text-dust-600 dark:text-dust-400">No findings — the corpus validates clean.</p>
          )}
          {errors.length > 0 && renderGroup(errors)}
          {warns.length > 0 && renderGroup(warns)}
          {infos.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-dust-600 dark:text-dust-400 hover:text-dust-700 dark:hover:text-dust-300">
                {infos.length} info finding{infos.length === 1 ? '' : 's'}
              </summary>
              {renderGroup(infos)}
            </details>
          )}
        </div>
      )}
    </section>
  );
}

/** Red-flag card: every table the manifest says loses rows on import. */
function RowLossCard({ summary }: { summary: ManifestSummary }) {
  const losers = summary.tables_losing_rows_on_import ?? [];
  return (
    <section className="rounded border border-rust/50 dark:border-rust-dark bg-rust-wash dark:bg-rust-tint p-3">
      <h3 className="mb-2 text-sm font-semibold text-rust-dark dark:text-rust-light">
        Tables losing rows on import
      </h3>
      {losers.length === 0 ? (
        <p className="text-sm text-dust-600 dark:text-dust-300">None — every column-0 key is unique.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {losers.map((t) => (
            <li key={t.path} className="flex flex-wrap items-baseline gap-x-2">
              <Link
                to={`/tables/${t.path}`}
                className="font-mono text-xs text-petrol-ink dark:text-petrol-light hover:text-petrol-dark dark:hover:text-petrol hover:underline"
              >
                {t.path}
              </Link>
              <span className="text-rust-dark dark:text-rust-light">
                keeps {t.row_count - t.rows_lost_on_import} of {t.row_count} rows (
                {t.rows_lost_on_import} lost)
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** WEB-004 dashboard, rehomed at /data by WEB-014 ("Inspect the data"):
 * health, manifest summary, staleness gate, the repo reports, and the
 * row-loss red flags. The app now lands on /workflow — the method — and this
 * page is where the raw corpus state lives. */
export function StatusPage() {
  const manifestState = useApi(() => fetchManifest(), []);

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader
        eyebrow="Inspect the data"
        title="Data Health"
        context={
          <>
            The state of the corpus: manifest summary, freshness, validation findings and the
            repo&apos;s generated reports. The authoring walk-through lives at{' '}
            <Link
              to="/workflow"
              className="text-petrol-ink hover:text-petrol-dark hover:underline dark:text-petrol-light dark:hover:text-petrol"
            >
              /workflow
            </Link>
            .
          </>
        }
      />
      <ApiHealthStrip />

      {manifestState.loading && <LoadingBox label="Loading manifest" />}
      {manifestState.error != null && <ErrorBox error={manifestState.error} />}
      {manifestState.data && (
        <ManifestSummaryStrip summary={manifestState.data.manifest.summary} />
      )}

      <ManifestFreshnessCheck />

      <ValidationCard tables={manifestState.data?.manifest.tables ?? []} />

      <ReportCard name="worldgen-backlog" title="World-Gen Backlog (WORLDGEN_BACKLOG.md)" />
      <ReportCard name="asset-gaps" title="Asset Gaps (ASSET_GAPS.md)" />

      {manifestState.data && <RowLossCard summary={manifestState.data.manifest.summary} />}

      <p className="text-sm leading-relaxed text-dust-600 dark:text-dust-400">
        The canonical charter and ticket ledger live in the EISCORE repo:
        {' '}<code className="font-mono text-xs">Documentation/Web/EISWEB_CHARTER.md</code> and
        {' '}<code className="font-mono text-xs">todo.md &sect; EISWeb revival</code>.
        A one-page summary is mirrored here at{' '}
        <code className="font-mono text-xs">docs/CHARTER.md</code>.
      </p>
    </div>
  );
}
