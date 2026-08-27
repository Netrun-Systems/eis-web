import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchHealth, fetchManifest, fetchReport } from '../api/client';
import { useApi } from '../api/useApi';
import type { ManifestResponse, ManifestSummary } from '../api/types';
import { ErrorBox, LoadingBox } from './tables/badges';
import { ManifestSummaryStrip } from './tables/ManifestSummaryStrip';
import { Markdown } from './markdown/Markdown';

/** Live strip over /api/health (WEB-003). Shows the connected EISCORE repo +
 * HEAD, or how to start the API when the fetch fails. */
function ApiHealthStrip() {
  const { data: health, error, loading } = useApi(() => fetchHealth(), []);

  if (error != null) return <ErrorBox error={error} />;
  if (loading || !health) {
    return (
      <div className="rounded border border-dust-700 px-3 py-2 text-sm text-dust-300">
        Checking API…
      </div>
    );
  }
  return (
    <div className="rounded border border-petrol-dark bg-petrol-tint/40 px-3 py-2 text-sm text-dust-100">
      <span className="font-semibold text-petrol-light">API connected</span>
      {' — '}
      <code className="font-mono text-xs">{health.repoPath}</code>
      {' @ '}
      <code className="font-mono text-xs text-petrol-light">{health.head ?? '?'}</code>
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
        className="rounded border border-petrol-dark bg-petrol-tint px-3 py-1.5 text-sm text-petrol-light hover:bg-petrol-dark disabled:cursor-not-allowed disabled:text-dust-500"
      >
        {checking ? 'Checking…' : 'Check manifest freshness'}
      </button>
      {error != null && <ErrorBox error={error} />}
      {result && (
        <div
          className={`rounded border px-3 py-2 text-sm ${
            result.stale
              ? 'border-rust-dark bg-rust-tint text-rust-light'
              : 'border-petrol-dark bg-petrol-tint/40 text-dust-100'
          }`}
        >
          <span className="font-semibold">
            {result.stale ? 'STALE — regenerate with Scripts/export_table_manifest.py' : 'Fresh'}
          </span>
          {result.output !== '' && (
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-dust-300">
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
    <section className="rounded border border-dust-700 bg-dust-800 p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
        <h3 className="text-sm font-semibold text-dust-100">{title}</h3>
        {data && (
          <span className="font-mono text-[10px] text-dust-500">
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

/** Red-flag card: every table the manifest says loses rows on import. */
function RowLossCard({ summary }: { summary: ManifestSummary }) {
  const losers = summary.tables_losing_rows_on_import ?? [];
  return (
    <section className="rounded border border-rust-dark bg-rust-tint p-3">
      <h3 className="mb-2 text-sm font-semibold text-rust-light">
        Tables losing rows on import
      </h3>
      {losers.length === 0 ? (
        <p className="text-sm text-dust-300">None — every column-0 key is unique.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {losers.map((t) => (
            <li key={t.path} className="flex flex-wrap items-baseline gap-x-2">
              <Link
                to={`/tables/${t.path}`}
                className="font-mono text-xs text-petrol-light hover:text-petrol hover:underline"
              >
                {t.path}
              </Link>
              <span className="text-rust-light">
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

/** WEB-004 dashboard: health, manifest summary, staleness gate, the two repo
 * reports, and the row-loss red flags. */
export function StatusPage() {
  const manifestState = useApi(() => fetchManifest(), []);

  return (
    <div className="max-w-4xl space-y-4">
      <h2 className="text-xl font-bold text-dust-100">Dashboard</h2>
      <ApiHealthStrip />

      {manifestState.loading && <LoadingBox label="Loading manifest" />}
      {manifestState.error != null && <ErrorBox error={manifestState.error} />}
      {manifestState.data && (
        <ManifestSummaryStrip summary={manifestState.data.manifest.summary} />
      )}

      <ManifestFreshnessCheck />

      <ReportCard name="worldgen-backlog" title="World-Gen Backlog (WORLDGEN_BACKLOG.md)" />
      <ReportCard name="asset-gaps" title="Asset Gaps (ASSET_GAPS.md)" />

      {manifestState.data && <RowLossCard summary={manifestState.data.manifest.summary} />}

      <p className="text-sm leading-relaxed text-dust-500">
        The canonical charter and ticket ledger live in the EISCORE repo:
        {' '}<code className="font-mono text-xs">Documentation/Web/EISWEB_CHARTER.md</code> and
        {' '}<code className="font-mono text-xs">todo.md &sect; EISWeb revival</code>.
        A one-page summary is mirrored here at{' '}
        <code className="font-mono text-xs">docs/CHARTER.md</code>.
      </p>
    </div>
  );
}
