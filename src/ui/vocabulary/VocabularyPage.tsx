import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchWorldgenSources } from '../../api/client';
import { useApi } from '../../api/useApi';
import type { WorldgenSourceEntry } from '../../api/types';
import { METHOD_STAGES } from '../../content/method';
import { MethodContext } from '../method/MethodContext';
import { ErrorBox, LoadingBox } from '../tables/badges';
import { PageHeader } from '../layout/PageHeader';

/**
 * WEB-006 — stem picker for the vocabulary editor. One card per normalized
 * world-gen table, showing who owns how many rows of it (base package,
 * script-authored ext, EISWeb web fragments). WEB-014 orders the cards by
 * the §3 authoring order and numbers them as stages.
 */
export function VocabularyPage() {
  const state = useApi(() => fetchWorldgenSources(), []);

  // §3 dependency order, then anything the method doesn't number (none today).
  const ordered = useMemo(() => {
    const stageOrder = new Map(
      METHOD_STAGES.filter((s) => s.stem !== undefined).map((s, i) => [s.stem as string, i]),
    );
    return [...(state.data?.stems ?? [])].sort(
      (a, b) => (stageOrder.get(a.stem) ?? 99) - (stageOrder.get(b.stem) ?? 99),
    );
  }, [state.data]);

  return (
    <div className="max-w-6xl space-y-5">
      <PageHeader
        eyebrow="Author the vocabulary"
        title="Vocabulary"
        context={
          <>
            The world-generation vocabulary tables, in authoring order. Rows added here are written
            to web-owned source fragments (<code className="font-mono text-xs">*.web.csv</code> /{' '}
            <code className="font-mono text-xs">*.web.patch.csv</code>), then the generator chain
            re-runs and the result is committed — the generated tables are never edited directly.
          </>
        }
      />

      <MethodContext surface="vocabulary-root" />

      {state.loading && <LoadingBox label="Loading world-gen sources" />}
      {state.error != null && <ErrorBox error={state.error} />}

      {state.data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((s) => (
            <StemCard
              key={s.stem}
              entry={s}
              stageNo={METHOD_STAGES.findIndex((m) => m.stem === s.stem) + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StemCard({ entry, stageNo }: { entry: WorldgenSourceEntry; stageNo: number }) {
  const { stem, base, fragments } = entry;
  const count = (n: number | null) => (n === null ? '—' : String(n));
  return (
    <Link
      to={`/vocabulary/${stem}`}
      className="panel block p-3 transition-colors hover:border-petrol dark:hover:border-petrol-dark"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-2 font-semibold text-dust-900 dark:text-dust-100">
          {stageNo > 0 && (
            <span className="font-display text-base font-bold leading-none text-petrol-ink dark:text-petrol-light">
              {stageNo}
            </span>
          )}
          <span className="font-mono text-sm">{stem}</span>
        </span>
        <span className="font-mono text-xs tabular-nums text-dust-600 dark:text-dust-400">
          {base.exists ? `${count(base.rowCount)} rows` : 'not generated'}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs tabular-nums">
        <dt className="text-dust-600 dark:text-dust-400">script ext</dt>
        <dd className="font-mono text-dust-600 dark:text-dust-300">
          {fragments.ext.exists ? `+${count(fragments.ext.rowCount)} rows` : '—'}
        </dd>
        <dt className="text-dust-600 dark:text-dust-400">script patches</dt>
        <dd className="font-mono text-dust-600 dark:text-dust-300">
          {fragments.patch.exists ? count(fragments.patch.rowCount) : '—'}
        </dd>
        <dt className="text-petrol-ink dark:text-petrol-light">web rows</dt>
        <dd className="font-mono text-petrol-ink dark:text-petrol-light">
          {fragments.web.exists ? `+${count(fragments.web.rowCount)}` : '0'}
        </dd>
        <dt className="text-petrol-ink dark:text-petrol-light">web patches</dt>
        <dd className="font-mono text-petrol-ink dark:text-petrol-light">
          {fragments.webPatch.exists ? count(fragments.webPatch.rowCount) : '0'}
        </dd>
      </dl>
    </Link>
  );
}
