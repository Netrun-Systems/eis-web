import React from 'react';
import type { BriefCheckResponse, BriefFinding, BriefResolution } from '../../api/types';

/**
 * WEB-007 — honest, complete rendering of one location_brief.py report.
 * The philosophy forbids silent fuzzy matches, so EVERY name resolution the
 * tool reports is shown (designer term -> RowName); the pieces table keeps
 * the style column visible ("read the style column, not just the count"),
 * and gaps carry their harvest-worklist pack suggestions.
 */

const VERDICT_STYLE = {
  ok: 'border-petrol-dark bg-petrol-tint text-petrol-light',
  warn: 'border-amber-dark bg-amber-tint text-amber-light',
  bad: 'border-rust-dark bg-rust-tint text-rust-light',
} as const;

function verdictTone(verdict: string): keyof typeof VERDICT_STYLE {
  if (verdict.startsWith('NOT')) return 'bad';
  if (verdict === 'BUILDABLE') return 'ok';
  return 'warn'; // BUILDABLE WITH GAPS / STYLE SUBSTITUTIONS
}

export function VerdictBadge({ verdict }: { verdict: string }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-xs font-semibold leading-5 whitespace-nowrap ${VERDICT_STYLE[verdictTone(verdict)]}`}
    >
      {verdict}
    </span>
  );
}

const FINDING_STYLE: Record<BriefFinding['severity'], string> = {
  BLOCKER: 'border-rust-dark bg-rust-tint text-rust-light',
  GAP: 'border-amber-dark bg-amber-tint text-amber-light',
  NOTE: 'border-dust-700 bg-dust-800 text-dust-300',
};

function BriefSeverityChip({ severity }: { severity: BriefFinding['severity'] }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px] leading-4 whitespace-nowrap ${FINDING_STYLE[severity]}`}
    >
      {severity}
    </span>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wider text-dust-500">{children}</h4>
  );
}

/** One designer-term -> RowName row. Identity resolutions still render — the
 * point is that nothing resolves silently. */
function ResolutionRow({ kind, asked, resolved, extra }: {
  kind: string;
  asked: string;
  resolved: string | null;
  extra?: string;
}) {
  return (
    <tr className="border-t border-dust-800">
      <td className="py-0.5 pr-3 text-xs text-dust-500">{kind}</td>
      <td className="py-0.5 pr-3 text-sm text-dust-300">{asked || <span className="text-dust-500">(unstated)</span>}</td>
      <td className="py-0.5 pr-2 text-dust-500">&rarr;</td>
      <td className="py-0.5 pr-3 font-mono text-sm">
        {resolved !== null && resolved !== '' ? (
          <span className="text-petrol-light">{resolved}</span>
        ) : (
          <span className="text-rust-light">UNRESOLVED</span>
        )}
      </td>
      <td className="py-0.5 text-xs text-dust-500">{extra ?? ''}</td>
    </tr>
  );
}

export function BriefCheckReport({ check }: { check: BriefCheckResponse }) {
  const r = check.result;
  if (check.failure !== undefined || r === null) {
    return (
      <div className="rounded border border-rust-dark bg-rust-tint px-3 py-2 text-sm text-rust-light">
        The coverage check could not run: {check.failure ?? 'no report produced'}
      </div>
    );
  }

  const resolutions: { kind: string; res: BriefResolution; extra?: string }[] = [];
  if (r.region) resolutions.push({ kind: 'Region', res: r.region });
  for (const s of r.structures ?? []) resolutions.push({ kind: 'Structure', res: s });
  for (const n of r.networks ?? []) resolutions.push({ kind: 'Network', res: n });
  for (const s of r.states ?? []) resolutions.push({ kind: 'World state', res: s });

  const cityStyle = r.city_style;
  const findings = r.findings ?? [];
  const bySev = (sev: BriefFinding['severity']) => findings.filter((f) => f.severity === sev);
  const counts = r.counts;
  const familyStated = Boolean(cityStyle?.family);

  return (
    <div className="space-y-4">
      {/* verdict line */}
      <div className="flex flex-wrap items-center gap-2">
        {r.verdict !== undefined && <VerdictBadge verdict={r.verdict} />}
        {counts && (
          <span className="text-xs text-dust-500">
            <span className={counts.blocker > 0 ? 'font-semibold text-rust-light' : ''}>
              {counts.blocker} blocker{counts.blocker === 1 ? '' : 's'}
            </span>
            {' · '}
            <span className={counts.gap > 0 ? 'font-semibold text-amber-light' : ''}>
              {counts.gap} gap{counts.gap === 1 ? '' : 's'}
            </span>
            {' · '}
            {counts.note} note{counts.note === 1 ? '' : 's'}
            {counts.style_substitution > 0 && ` · ${counts.style_substitution} style substitution(s)`}
          </span>
        )}
        <span className="font-mono text-xs text-dust-500">exit {check.exitCode}</span>
        <span className="font-mono text-xs text-dust-500">
          ran {check.ranAt.slice(0, 19).replace('T', ' ')}
        </span>
      </div>

      {/* every name resolution — nothing resolves silently */}
      {(resolutions.length > 0 || cityStyle?.asked || (r.traversal ?? []).length > 0) && (
        <section className="space-y-1">
          <SectionHeading>Name resolutions (designer term &rarr; RowName)</SectionHeading>
          <table className="w-full border-collapse">
            <tbody>
              {resolutions.map((row, i) => (
                <ResolutionRow
                  key={`${row.kind}-${row.res.asked}-${i}`}
                  kind={row.kind}
                  asked={row.res.asked}
                  resolved={row.res.resolved}
                  extra={
                    row.kind === 'Region' && r.landmark
                      ? `landmark '${r.landmark}' — hero location`
                      : undefined
                  }
                />
              ))}
              {cityStyle && cityStyle.asked !== '' && (
                <ResolutionRow
                  kind="City style"
                  asked={cityStyle.asked}
                  resolved={cityStyle.family}
                  extra={cityStyle.chain.length > 0 ? `family chain: ${cityStyle.chain.join(' > ')}` : undefined}
                />
              )}
              {(r.traversal ?? []).map((t, i) => (
                <ResolutionRow
                  key={`trav-${t.asked}-${i}`}
                  kind="Traversal"
                  asked={t.asked}
                  resolved={t.declared ? t.asked : null}
                  extra={t.declared ? 'declared by the region' : 'NOT in the region TraversalProfile'}
                />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* manifest summary */}
      {(r.spaces || r.connections || r.rules) && (
        <p className="text-xs text-dust-500">
          {r.spaces && (
            <>
              {r.spaces.required.length} required / {r.spaces.preferred.length} preferred spaces
            </>
          )}
          {r.connections && <>{' · '}{r.connections.length} connection types</>}
          {r.rules && <>{' · '}{r.rules.length} generation rules in scope</>}
        </p>
      )}

      {/* pieces: count AND style column, reasons, harvest packs */}
      {(r.pieces ?? []).length > 0 && (
        <section className="space-y-1">
          <SectionHeading>Required pieces (BuildingKitCatalog coverage)</SectionHeading>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-dust-500">
                  <th className="py-1 pr-3 font-medium">piece</th>
                  {familyStated && <th className="py-1 pr-3 font-medium">in family</th>}
                  <th className="py-1 pr-3 text-right font-medium">in kit</th>
                  <th className="py-1 pr-3 font-medium">styles present</th>
                  <th className="py-1 pr-3 font-medium">read by</th>
                  <th className="py-1 pr-3 font-medium">harvest from</th>
                  <th className="py-1 font-medium">required because</th>
                </tr>
              </thead>
              <tbody>
                {(r.pieces ?? []).map((p) => {
                  const missing = p.have === 0;
                  const thin = p.have > 0 && p.have < 2;
                  return (
                    <tr key={p.piece} className="border-t border-dust-800 align-top">
                      <td className="py-1 pr-3 font-mono text-xs text-dust-100 whitespace-nowrap">
                        {p.piece}
                        {!p.consumed && (
                          <span className="ml-1 rounded border border-rust-dark bg-rust-tint px-1 text-[10px] text-rust-light">
                            NO CONSUMER
                          </span>
                        )}
                      </td>
                      {familyStated && (
                        <td className="py-1 pr-3 text-xs whitespace-nowrap">
                          {p.family_hop === 1 ? (
                            <span className="text-petrol-light">{p.in_family} in {cityStyle?.family}</span>
                          ) : p.family_hop != null ? (
                            <span className="text-amber-light">
                              {p.in_family} via {p.family_hop_name} (hop {p.family_hop})
                            </span>
                          ) : (
                            <span className="text-rust-light">0 in chain</span>
                          )}
                        </td>
                      )}
                      <td
                        className={`py-1 pr-3 text-right font-mono text-xs ${missing ? 'font-semibold text-rust-light' : thin ? 'text-amber-light' : 'text-dust-300'}`}
                      >
                        {p.have}
                        {missing ? ' — MISSING' : thin ? ' — thin' : ''}
                      </td>
                      <td className="py-1 pr-3 font-mono text-xs text-dust-300">
                        {p.styles.length > 0
                          ? p.styles.map(([st, n]) => `${st}(${n})`).join(', ')
                          : '—'}
                      </td>
                      <td className="py-1 pr-3 font-mono text-xs text-dust-500 whitespace-nowrap">
                        {p.consumers.length > 0 ? p.consumers.join('/') : '—'}
                      </td>
                      <td className="py-1 pr-3 text-xs text-dust-300">
                        {p.candidates > 0 && p.packs.length > 0 ? (
                          <>
                            {p.candidates} candidate(s):{' '}
                            <span className="font-mono">
                              {p.packs.map(([pk, n]) => `${pk}(${n})`).join(', ')}
                            </span>
                          </>
                        ) : missing || thin ? (
                          <span className="text-dust-500">none in project (new art)</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-1 text-xs text-dust-300">
                        <ul className="space-y-0.5">
                          {p.reasons.map((reason, i) => (
                            <li key={i}>{reason}</li>
                          ))}
                        </ul>
                        {p.family_note && (
                          <div className="mt-0.5 font-mono text-[11px] text-amber-light">
                            !! {p.family_note}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* structure-level asset coverage */}
      {(r.structure_coverage ?? []).length > 0 && (
        <section className="space-y-1">
          <SectionHeading>Structure-level assets (AssetRegistry)</SectionHeading>
          <ul className="space-y-0.5 text-xs">
            {(r.structure_coverage ?? []).map((sc) => (
              <li key={sc.structure} className="font-mono">
                <span className="text-dust-100">{sc.structure}</span>{' '}
                {sc.assets.length > 0 ? (
                  <span className="text-dust-300">{sc.assets.join(', ')}</span>
                ) : (
                  <span className="text-rust-light">no registered assets</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* findings, complete, grouped by severity */}
      {(['BLOCKER', 'GAP', 'NOTE'] as const).map((sev) => {
        const items = bySev(sev);
        if (items.length === 0) return null;
        return (
          <section key={sev} className="space-y-1">
            <SectionHeading>
              {sev} ({items.length})
            </SectionHeading>
            <ul className="space-y-1.5">
              {items.map((f, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <BriefSeverityChip severity={f.severity} />
                  <span className="font-mono text-xs text-dust-500">[{f.section}]</span>
                  <span className="w-full text-sm leading-snug text-dust-300 sm:w-auto sm:flex-1">
                    {f.detail}
                    {f.fix && (
                      <span className="block text-xs text-dust-500">&rarr; {f.fix}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
