import React from 'react';
import { Link } from 'react-router-dom';
import { fetchDamKitCoverage, fetchTables } from '../../api/client';
import { useApi } from '../../api/useApi';
import type { DamKitCoverageResponse, TableListEntry } from '../../api/types';
import { ErrorBox, LoadingBox } from '../tables/badges';
import { PageHeader } from '../layout/PageHeader';

/**
 * WEB-009 — the DAM landing page. Headline numbers only, every one computed
 * live (catalogue sizes from the manifest, the consumed/inert split from
 * /api/dam/kit-coverage — WG-218's number is measured on request, never
 * quoted), then two cards into the deep views.
 */

const AUDIO_MAPPINGS = [
  'Data/Audio/SFXAssetMapping.csv',
  'Data/Audio/VFXAssetMapping.csv',
  'Data/Audio/EffectAssociations.csv',
];

function rowCount(tables: TableListEntry[] | undefined, tablePath: string): number | null {
  const t = tables?.find((x) => x.path === tablePath);
  return t ? t.row_count : null;
}

function Stat({ label, value, sub, tone }: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'rust';
}) {
  return (
    <div className="panel min-w-[10rem] flex-1 px-3 py-2.5">
      <p className="eyebrow !text-[10px]">{label}</p>
      <p
        className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
          tone === 'rust'
            ? 'text-rust-dark dark:text-rust-light'
            : 'text-dust-900 dark:text-dust-100'
        }`}
      >
        {value}
      </p>
      {sub !== undefined && (
        <p className="mt-0.5 text-xs tabular-nums text-dust-600 dark:text-dust-400">{sub}</p>
      )}
    </div>
  );
}

function DeepViewCard({ to, title, body }: { to: string; title: string; body: string }) {
  return (
    <Link
      to={to}
      className="panel block flex-1 p-4 transition-colors hover:border-petrol dark:hover:border-petrol-dark"
    >
      <h3 className="font-display text-lg font-bold uppercase tracking-wide text-petrol-ink dark:text-petrol-light">
        {title}
      </h3>
      <p className="mt-1.5 max-w-[48ch] text-sm leading-relaxed text-dust-600 dark:text-dust-300">
        {body}
      </p>
      <p className="mt-2 font-mono text-xs text-petrol-ink dark:text-petrol-light">open →</p>
    </Link>
  );
}

export function DamOverviewPage() {
  const coverage = useApi(() => fetchDamKitCoverage(), []);
  const tables = useApi(() => fetchTables(), []);

  const t = tables.data?.tables;
  const cov: DamKitCoverageResponse | null = coverage.data;
  const audioTotal = AUDIO_MAPPINGS.map((p) => rowCount(t, p)).reduce<number | null>(
    (acc, n) => (acc === null || n === null ? null : acc + n),
    0,
  );

  return (
    <div className="max-w-6xl space-y-5">
      <PageHeader
        eyebrow="Assets"
        title="Asset Management"
        context={
          <>
            The PCG and audio catalogues as views with judgment: what is registered, what a
            generator will actually place, and what is inventory for a consumer that does not
            exist. Registration happens here too — a pack on disk is invisible to PCG until{' '}
            <code className="font-mono text-xs">catalog_content_pack.py</code> catalogues it.
          </>
        }
      />

      {(coverage.loading || tables.loading) && <LoadingBox label="Measuring the catalogues" />}
      {coverage.error != null && <ErrorBox error={coverage.error} />}
      {tables.error != null && coverage.error == null && <ErrorBox error={tables.error} />}

      {cov && t && (
        <>
          <div className="flex flex-wrap gap-3">
            <Stat
              label="Kit catalogue"
              value={cov.totalRows.toLocaleString()}
              sub={<>rows in BuildingKitCatalog</>}
            />
            <Stat
              label="Consumed"
              value={cov.consumedRows.toLocaleString()}
              sub={<>rows a generator reads</>}
            />
            <Stat
              label="Inert inventory"
              value={
                <>
                  {cov.inertRows.toLocaleString()}{' '}
                  <span className="text-sm font-normal">({cov.inertPct.toFixed(1)}%)</span>
                </>
              }
              sub={<>WG-218, measured live</>}
              tone={cov.inertRows > 0 ? 'rust' : undefined}
            />
            <Stat
              label="Interior props"
              value={rowCount(t, 'Data/PCG/InteriorPropCatalog.csv')?.toLocaleString() ?? '—'}
              sub={<>no consumer yet (WG-113)</>}
            />
            <Stat
              label="Destructibles"
              value={rowCount(t, 'Data/PCG/DestructibleManifest.csv')?.toLocaleString() ?? '—'}
              sub={<>DestructibleManifest</>}
            />
            <Stat
              label="Audio / FX mappings"
              value={audioTotal?.toLocaleString() ?? '—'}
              sub={<>SFX + VFX + associations</>}
            />
          </div>

          <p className="text-sm text-dust-600 dark:text-dust-300">
            The full gap report (what is still missing, everywhere) is{' '}
            <Link
              to="/data"
              className="text-petrol-ink hover:text-petrol-dark hover:underline dark:text-petrol-light dark:hover:text-petrol"
            >
              ASSET_GAPS.md on the Data health page
            </Link>
            .
          </p>

          <div className="flex flex-wrap gap-3">
            <DeepViewCard
              to="/dam/kit"
              title="Kit coverage"
              body="The CityStyle x PieceType matrix over BuildingKitCatalog — consumed types by consumer, gaps loud, inert inventory named, fallback chains per style."
            />
            <DeepViewCard
              to="/dam/packs"
              title="Content packs"
              body="The pack registry: what is configured, what is on disk, dry-run classification reports, and the register step (one guarded commit)."
            />
          </div>
        </>
      )}
    </div>
  );
}
