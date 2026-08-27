import React from 'react';
import { fetchDamKitCoverage } from '../../api/client';
import { useApi } from '../../api/useApi';
import type { DamKitCoverageResponse, DamPieceTypeRow } from '../../api/types';
import { ErrorBox, LoadingBox } from '../tables/badges';
import { PageHeader } from '../layout/PageHeader';

/**
 * WEB-009 — the kit-coverage matrix. Consumed piece types as rows, grouped by
 * the consumer set that reads them; CityStyles as columns. A zero cell is
 * loud (rust) ONLY where the piece type is consumed — an empty inert cell is
 * dust, because absence of unused inventory is not a gap. The inert inventory
 * (WG-218) gets its own section instead of drowning the matrix.
 */

/** Presentation labels for the consumer keys the server parsed. Unknown keys
 * fall back to themselves — the keys come from location_brief.py, never here. */
const CONSUMER_LABELS: Record<string, string> = {
  VERT: 'PCGEISPlaceVerticalConnectors (PCG node)',
  ASM: 'PCGEISModularBuildingAssembler (PCG node)',
  EXO: 'EISPCGExodusSubsystem (console-driven, not a PCG node)',
};

function groupLabel(consumers: string[]): string {
  return consumers.join(' + ');
}

export function DamKitPage() {
  const state = useApi(() => fetchDamKitCoverage(), []);
  const cov: DamKitCoverageResponse | null = state.data;

  return (
    <div className="max-w-6xl space-y-5">
      <PageHeader
        eyebrow="Assets"
        title="Kit Coverage"
        context={
          cov ? (
            <>
              <code className="font-mono text-xs">{cov.catalogPath}</code> against the consumed
              set parsed live from{' '}
              <code className="font-mono text-xs">{cov.consumedSource}</code>. A catalogued row
              only matters if a generator reads its PieceType; everything else is inventory for
              a consumer that has not been written.
            </>
          ) : (
            <>The CityStyle × PieceType matrix over the building-kit catalogue.</>
          )
        }
      />

      {state.loading && <LoadingBox label="Measuring the catalogue" />}
      {state.error != null && <ErrorBox error={state.error} />}

      {cov && (
        <>
          <div className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-sm tabular-nums">
            <span className="text-dust-900 dark:text-dust-100">
              <span className="font-semibold">{cov.totalRows.toLocaleString()}</span> rows
            </span>
            <span className="text-dust-600 dark:text-dust-300">
              <span className="font-mono font-semibold">{cov.consumedRows.toLocaleString()}</span>{' '}
              consumed
            </span>
            <span className="text-rust-dark dark:text-rust-light">
              <span className="font-mono font-semibold">{cov.inertRows.toLocaleString()}</span>{' '}
              inert ({cov.inertPct.toFixed(1)}%) — measured now, not quoted
            </span>
            <span className="text-dust-600 dark:text-dust-400">
              {cov.styles.length} styles · {cov.pieceTypes.length} piece types
            </span>
          </div>

          <ConsumedMatrix cov={cov} />
          <ZeroRowCallout cov={cov} />
          <InertInventory cov={cov} />
          <FallbackChains cov={cov} />
        </>
      )}
    </div>
  );
}

function ConsumedMatrix({ cov }: { cov: DamKitCoverageResponse }) {
  const consumed = cov.pieceTypes.filter((p) => p.consumed);
  // Group by the exact consumer set — WG-215c's point: WHICH consumer reads a
  // type decides whether a location actually gets built with it.
  const groups = new Map<string, DamPieceTypeRow[]>();
  for (const p of consumed) {
    const key = groupLabel(p.consumers);
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }
  const groupKeys = [...groups.keys()].sort();
  const usedConsumers = [...new Set(consumed.flatMap((p) => p.consumers))].sort();

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-dust-900 dark:text-dust-100">
        Consumed piece types × CityStyle
      </h3>
      <div className="panel overflow-x-auto">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-dust-600 dark:text-dust-400">
              <th className="sticky left-0 bg-dust-0 px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-eyebrow dark:bg-dust-800">
                piece type
              </th>
              <th className="px-2 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-eyebrow">
                total
              </th>
              {cov.styles.map((s) => (
                <th
                  key={s}
                  className="px-2 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-eyebrow"
                >
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          {groupKeys.map((g) => (
            <tbody key={g}>
              <tr className="border-t border-dust-200 bg-dust-50 dark:border-dust-700 dark:bg-dust-900/40">
                <td
                  colSpan={cov.styles.length + 2}
                  className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-eyebrow text-petrol-ink dark:text-petrol-light"
                >
                  read by {g}
                </td>
              </tr>
              {groups.get(g)!.map((p) => (
                <tr key={p.name} className="border-t border-dust-200/70 dark:border-dust-800">
                  <td className="sticky left-0 bg-dust-0 px-3 py-1.5 font-mono text-xs text-dust-900 dark:bg-dust-800 dark:text-dust-100">
                    {p.name}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold text-dust-900 dark:text-dust-100">
                    {p.total.toLocaleString()}
                  </td>
                  {cov.styles.map((s) => {
                    const n = p.byStyle[s] ?? 0;
                    return (
                      <td
                        key={s}
                        className={`px-2 py-1.5 text-right font-mono text-xs ${
                          n === 0
                            ? 'bg-rust-wash text-rust-dark dark:bg-rust-tint dark:text-rust-light'
                            : 'text-dust-700 dark:text-dust-300'
                        }`}
                      >
                        {n === 0 ? '0' : n.toLocaleString()}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dust-600 dark:text-dust-400">
        {usedConsumers.map((c) => (
          <li key={c}>
            <span className="font-mono font-semibold">{c}</span> ={' '}
            {CONSUMER_LABELS[c] ?? 'consumer parsed from location_brief.py'}
          </li>
        ))}
        <li>
          <span className="chip chip-rust !py-0">0</span> = a consumed type this style cannot
          supply — the fallback chain below decides what gets borrowed instead.
        </li>
      </ul>
    </section>
  );
}

function ZeroRowCallout({ cov }: { cov: DamKitCoverageResponse }) {
  const empty = cov.pieceTypes.filter((p) => p.consumed && p.total === 0);
  if (empty.length === 0) return null;
  return (
    <div className="rounded border border-rust/50 border-l-2 border-l-rust bg-rust-wash px-3 py-2 text-sm text-rust-dark dark:border-rust-dark dark:border-l-rust-light dark:bg-rust-tint dark:text-rust-light">
      Consumed with <span className="font-semibold">zero</span> catalogue rows:{' '}
      {empty.map((p, i) => (
        <span key={p.name}>
          {i > 0 && ', '}
          <span className="font-mono">{p.name}</span> (read by {p.consumers.join('/')})
        </span>
      ))}
      {' — '}those lookups are guarded by <code className="font-mono text-xs">Num() &gt; 0</code>{' '}
      and fail silently; the consumer can never fire until something is catalogued or the
      dependency is removed (WG-215c).
    </div>
  );
}

function InertInventory({ cov }: { cov: DamKitCoverageResponse }) {
  const inert = cov.pieceTypes
    .filter((p) => !p.consumed && p.total > 0)
    .sort((a, b) => b.total - a.total);
  if (inert.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-dust-900 dark:text-dust-100">
        Inert inventory — {cov.inertRows.toLocaleString()} rows no generator reads (WG-218)
      </h3>
      <p className="max-w-[70ch] text-sm leading-relaxed text-dust-600 dark:text-dust-300">
        Legal rows, catalogued correctly, that will never place: no consumer asks for their
        PieceType. They are not a defect in the catalogue — they are a generator that has not
        been written yet.
      </p>
      <div className="panel overflow-x-auto">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-dust-600 dark:text-dust-400">
              <th className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-eyebrow">
                piece type
              </th>
              <th className="px-3 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-eyebrow">
                rows
              </th>
              <th className="px-3 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-eyebrow">
                share of catalogue
              </th>
            </tr>
          </thead>
          <tbody>
            {inert.map((p) => (
              <tr key={p.name} className="border-t border-dust-200/70 dark:border-dust-800">
                <td className="px-3 py-1.5 font-mono text-xs text-dust-900 dark:text-dust-100">
                  {p.name}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-dust-700 dark:text-dust-300">
                  {p.total.toLocaleString()}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-dust-600 dark:text-dust-400">
                  {((p.total / cov.totalRows) * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FallbackChains({ cov }: { cov: DamKitCoverageResponse }) {
  if (cov.fallbacks.length === 0) return null;
  // Family order mirrors the file; group styles by family for reading.
  const byFamily = new Map<string, typeof cov.fallbacks>();
  for (const f of cov.fallbacks) {
    const list = byFamily.get(f.family);
    if (list) list.push(f);
    else byFamily.set(f.family, [f]);
  }
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-dust-900 dark:text-dust-100">
        Style fallback chains (CityStyleFallback.csv)
      </h3>
      <p className="max-w-[70ch] text-sm leading-relaxed text-dust-600 dark:text-dust-300">
        When a style lacks a piece, the generator borrows from the first style in its chain that
        has one (WG-163) — family members first, so a rust-red 0 above resolves to the nearest
        aesthetic neighbour rather than an arbitrary pick.
      </p>

      {/* WG-216, in the method's voice: honest about what is still open. */}
      <section className="space-y-2 rounded border border-petrol/30 bg-petrol-wash/40 p-3 dark:border-petrol-dark/60 dark:bg-petrol-tint/20">
        <h4 className="text-sm font-semibold text-petrol-ink dark:text-petrol-light">
          <span className="mr-1.5 rounded-sm border border-petrol/40 px-1 py-0.5 font-mono text-[10px] uppercase tracking-eyebrow dark:border-petrol-dark">
            Known gap
          </span>
          WG-216 — family fallback is aesthetic, not structural
        </h4>
        <p className="max-w-[65ch] font-serif text-[0.95rem] leading-relaxed text-dust-700 dark:text-dust-300">
          The chains guarantee a piece is <em>found</em>, not that it belongs: every interior and
          vertical piece in the catalogue is currently Rural, so an urban tower still generates
          Chicago walls around a medieval-village stair — coverage reads &ldquo;ok&rdquo; while
          looking absurd. That family-vs-style gap is tracked as WG-216 on the world-gen track
          and is not resolved by this view; the matrix above tells you where a chain will be
          exercised, the chain below tells you what it will fetch.
        </p>
      </section>

      <div className="space-y-3">
        {[...byFamily.entries()].map(([family, styles]) => (
          <div key={family} className="panel px-3 py-2">
            <p className="eyebrow !text-[10px]">{family}</p>
            <ul className="mt-1.5 space-y-1">
              {styles.map((f) => (
                <li key={f.style} className="text-xs leading-relaxed">
                  <span className="font-mono font-semibold text-dust-900 dark:text-dust-100">
                    {f.style}
                  </span>
                  <span className="text-dust-500 dark:text-dust-500"> → </span>
                  <span className="break-words font-mono text-dust-600 dark:text-dust-400">
                    {f.chain.join(' → ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
