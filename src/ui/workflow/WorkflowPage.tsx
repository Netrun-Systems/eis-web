import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchManifest, runWorldgenValidation } from '../../api/client';
import { useApi } from '../../api/useApi';
import type { Finding, ManifestTable, WorldgenValidationResponse } from '../../api/types';
import {
  GENERATE_STAGE,
  METHOD_STAGES,
  PHILOSOPHY_DOC_VERSION,
  PHILOSOPHY_ROUTE,
  PORTABILITY_CHECKLIST,
  PORTABILITY_CITE,
  VALIDATE_BETWEEN_QUOTE,
  type MethodStage,
} from '../../content/method';
import { ErrorBox, LoadingBox } from '../tables/badges';
import { FindingCountsStrip } from '../validation/findings';
import { CiteLink, MethodQuote } from '../method/MethodContext';
import { ApiHealthStrip } from '../StatusPage';
import { PageHeader } from '../layout/PageHeader';

/**
 * WEB-014 — the workflow spine and the app's landing page. The philosophy's
 * §3 dependency chain rendered as a vertical stepper: each stage teaches its
 * role (§-cited), shows its live table state from the manifest, links into
 * the right authoring surface, and offers "Validate now" between stages —
 * because §20 mandates validating after each step. Stages whose tables carry
 * ERROR findings in the loaded run are highlighted in rust.
 *
 * WEB-015 — this page is the app's one identity moment: display-face stage
 * numerals on a continuous spine line, the product's thesis drawn as a form.
 */

interface StemFindingCounts {
  error: number;
  warn: number;
}

export function WorkflowPage() {
  const manifestState = useApi(() => fetchManifest(), []);

  // One validation run shared by the header summary, every "Validate now"
  // button, and the stage highlights (WEB-005 endpoint).
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WorldgenValidationResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const runValidation = () => {
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

  const tables = manifestState.data?.manifest.tables ?? [];

  // Row counts for each stage's generated table (Data/WorldGen/<Stem>.csv).
  const rowCountByStem = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tables) if (t.folder === 'WorldGen') m.set(t.stem, t.row_count);
    return m;
  }, [tables]);

  const findingsByStem = useMemo(() => {
    const m = new Map<string, StemFindingCounts>();
    for (const f of result?.findings ?? []) {
      if (f.table === undefined) continue;
      const entry = m.get(f.table) ?? { error: 0, warn: 0 };
      if (f.severity === 'ERROR') entry.error += 1;
      else if (f.severity === 'WARN') entry.warn += 1;
      m.set(f.table, entry);
    }
    return m;
  }, [result]);

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        eyebrow="The Method"
        title="The Workflow"
        context={
          <>
            This app is the software expression of one methodology:{' '}
            <Link
              to={PHILOSOPHY_ROUTE}
              className="text-petrol-ink hover:text-petrol-dark hover:underline dark:text-petrol-light dark:hover:text-petrol"
            >
              Procedural Spatial Infrastructure
            </Link>{' '}
            ({PHILOSOPHY_DOC_VERSION}). Designers author <em>vocabulary</em> — what can exist and
            what makes a result valid — and generators produce instances (
            <CiteLink cite={{ label: '§1.2', anchor: 's1-2' }} />
            ). Author in the dependency order below: each layer constrains the next, and authoring
            out of order produces tables that reference rows nobody has written (
            <CiteLink cite={{ label: '§3', anchor: 's3' }} />
            ).
          </>
        }
      />

      <ApiHealthStrip />

      {/* Validation summary, near the top on purpose — §20's mandate. */}
      <section className="panel space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-dust-900 dark:text-dust-100">
            Reference health
          </h3>
          <button
            type="button"
            onClick={runValidation}
            disabled={running}
            className="btn-primary px-3 py-1.5 text-sm"
          >
            {running ? 'Running…' : 'Run WorldGen validation'}
          </button>
          {result && (
            <FindingCountsStrip counts={result.summaryCounts} ranAt={result.ranAt} exitCode={result.exitCode} />
          )}
          <Link
            to="/data"
            className="ml-auto text-xs text-petrol-ink hover:text-petrol-dark hover:underline dark:text-petrol-light dark:hover:text-petrol"
          >
            full findings &amp; data health →
          </Link>
        </div>
        {error != null && <ErrorBox error={error} />}
        {result === null && error == null && !running && (
          <p className="text-xs text-dust-600 dark:text-dust-400">
            No run loaded yet — run it to light up the stages below. &ldquo;Reference health should
            read <em>0 unresolved</em> before you move on.&rdquo;{' '}
            <CiteLink cite={{ label: '§20', anchor: 's20' }} />
          </p>
        )}
      </section>

      {manifestState.loading && <LoadingBox label="Loading manifest" />}
      {manifestState.error != null && <ErrorBox error={manifestState.error} />}

      {/* ---- the stepper: stage cards on a continuous spine ---- */}
      <ol className="relative space-y-3 before:absolute before:bottom-6 before:left-5 before:top-6 before:w-px before:bg-dust-200 before:content-[''] dark:before:bg-dust-700">
        {METHOD_STAGES.map((stage, idx) => (
          <React.Fragment key={stage.id}>
            {idx > 0 && (
              <ValidateDivider running={running} onValidate={runValidation} first={idx === 1} />
            )}
            <StageCard
              stage={stage}
              index={idx}
              rowCount={stage.stem !== undefined ? rowCountByStem.get(stage.stem) : undefined}
              findings={stage.stem !== undefined ? findingsByStem.get(stage.stem) : undefined}
              hasRun={result !== null}
              tables={tables}
            />
          </React.Fragment>
        ))}
        <ValidateDivider running={running} onValidate={runValidation} />
        <GenerateCard />
      </ol>

      {/* §45 — when has the methodology transferred? */}
      <details className="panel p-3">
        <summary className="cursor-pointer text-sm font-semibold text-dust-900 dark:text-dust-100">
          When is the vocabulary done? The portability checklist{' '}
          <CiteLink cite={PORTABILITY_CITE} />
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-dust-600 dark:text-dust-300">
          {PORTABILITY_CHECKLIST.map((c, i) => (
            <li key={i}>{c.text}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** The between-stages affordance: §20 mandates validating after each step.
 * Sits ON the spine — a small node marks the pause between stages. */
function ValidateDivider({
  running,
  onValidate,
  first = false,
}: {
  running: boolean;
  onValidate: () => void;
  first?: boolean;
}) {
  return (
    <li className="relative flex items-center gap-3 py-0.5 pl-14" aria-hidden={false}>
      <span
        aria-hidden
        className="absolute left-5 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-dust-300 dark:bg-dust-500"
      />
      <button
        type="button"
        onClick={onValidate}
        disabled={running}
        className="btn-quiet px-2 py-0.5 text-[11px]"
        title={`"${VALIDATE_BETWEEN_QUOTE.text}" (${VALIDATE_BETWEEN_QUOTE.cite.label})`}
      >
        {running ? 'validating…' : 'Validate now'}
      </button>
      {first && (
        <span className="hidden text-[11px] italic text-dust-600 dark:text-dust-400 sm:inline">
          &ldquo;{VALIDATE_BETWEEN_QUOTE.text}&rdquo;{' '}
          <CiteLink cite={VALIDATE_BETWEEN_QUOTE.cite} />
        </span>
      )}
    </li>
  );
}

/** The display-face stage numeral, sitting on the spine. Page-ground fill so
 * the line passes visually behind it. */
function StageMarker({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'ok' | 'error' | 'muted';
}) {
  const toneCls =
    tone === 'error'
      ? 'border-rust text-rust-dark dark:border-rust-dark dark:text-rust-light'
      : tone === 'muted'
        ? 'border-dust-300 text-dust-600 dark:border-dust-700 dark:text-dust-400'
        : 'border-petrol/60 text-petrol-ink dark:border-petrol-dark dark:text-petrol-light';
  return (
    <span
      aria-hidden
      className={`absolute left-0 top-2.5 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-dust-50 font-display text-xl font-bold dark:bg-dust-900 ${toneCls}`}
    >
      {children}
    </span>
  );
}

function StageCard({
  stage,
  index,
  rowCount,
  findings,
  hasRun,
  tables,
}: {
  stage: MethodStage;
  index: number;
  rowCount: number | undefined;
  findings: StemFindingCounts | undefined;
  hasRun: boolean;
  tables: ManifestTable[];
}) {
  const hasErrors = (findings?.error ?? 0) > 0;
  const tablePath =
    stage.stem !== undefined
      ? tables.find((t) => t.folder === 'WorldGen' && t.stem === stage.stem)?.path
      : undefined;

  return (
    <li className="relative pl-14">
      <StageMarker tone={hasErrors ? 'error' : 'ok'}>{index + 1}</StageMarker>
      <div
        className={`rounded border p-3 ${
          hasErrors
            ? 'border-rust/50 bg-rust-wash/50 dark:border-rust-dark dark:bg-rust-tint/40'
            : 'panel'
        }`}
      >
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="eyebrow w-full !text-[10px]">Stage {index + 1}</p>
          <h3 className="text-base font-semibold text-dust-900 dark:text-dust-100">
            {stage.title}
          </h3>
          {stage.cites.map((c, i) => (
            <CiteLink key={i} cite={c} />
          ))}

          {/* live state */}
          <span className="ml-auto flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums">
            {stage.stem !== undefined && (
              <span className="text-dust-600 dark:text-dust-400">
                {rowCount !== undefined ? `${rowCount} rows` : 'rows: ?'}
              </span>
            )}
            {hasRun && stage.stem !== undefined && (
              <>
                {(findings?.error ?? 0) > 0 && (
                  <span className="font-semibold text-rust-dark dark:text-rust-light">
                    {findings!.error} ERROR
                  </span>
                )}
                {(findings?.warn ?? 0) > 0 && (
                  <span className="text-amber-ink dark:text-amber-light">
                    {findings!.warn} WARN
                  </span>
                )}
                {(findings?.error ?? 0) === 0 && (findings?.warn ?? 0) === 0 && (
                  <span className="text-petrol-ink dark:text-petrol-light">0 findings</span>
                )}
              </>
            )}
          </span>
        </div>

        <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-dust-600 dark:text-dust-300">
          {stage.role}
        </p>

        {stage.quote && (
          <div className="mt-2">
            <MethodQuote text={stage.quote.text} cite={stage.quote.cite} />
          </div>
        )}

        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-dust-600 dark:text-dust-400">Depends on</dt>
            <dd className="text-dust-600 dark:text-dust-300">{stage.dependsOn}</dd>
          </div>
          <div>
            <dt className="font-semibold text-dust-600 dark:text-dust-400">What depends on it</dt>
            <dd className="text-dust-600 dark:text-dust-300">{stage.enables}</dd>
          </div>
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <Link to={stage.route} className="btn-primary px-3 py-1">
            Author &rarr;
          </Link>
          {tablePath !== undefined && (
            <Link
              to={`/tables/${tablePath}`}
              className="text-xs text-petrol-ink hover:text-petrol-dark hover:underline dark:text-petrol-light dark:hover:text-petrol"
            >
              inspect the generated table
            </Link>
          )}
          {stage.stopWhen !== undefined && (
            <span className="text-xs text-dust-600 dark:text-dust-400">
              Stop when: <em>{stage.stopWhen}</em>
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/** The honest terminus: generation happens in the Unreal editor, not here. */
function GenerateCard() {
  return (
    <li className="relative pl-14">
      <StageMarker tone="muted">⟳</StageMarker>
      <div className="rounded border border-dashed border-dust-300 bg-dust-0/60 p-3 dark:border-dust-700 dark:bg-dust-800/60">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-base font-semibold text-dust-900 dark:text-dust-100">
            {GENERATE_STAGE.title}
          </h3>
          {GENERATE_STAGE.cites.map((c, i) => (
            <CiteLink key={i} cite={c} />
          ))}
          <span className="chip chip-dust ml-auto !text-[10px] uppercase tracking-eyebrow">
            in the Unreal editor
          </span>
        </div>
        <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-dust-600 dark:text-dust-300">
          {GENERATE_STAGE.role}
        </p>
        <p className="mt-2 text-xs text-dust-600 dark:text-dust-400">
          Procedural does not mean procedural-only — a generated location supports the designer
          verbs{' '}
          <code className="font-mono text-[11px] text-dust-700 dark:text-dust-300">
            {GENERATE_STAGE.designerVerbs.join(' · ')}
          </code>{' '}
          <CiteLink cite={GENERATE_STAGE.designerVerbsCite} />, as persistent per-instance
          annotations.
        </p>
      </div>
    </li>
  );
}
