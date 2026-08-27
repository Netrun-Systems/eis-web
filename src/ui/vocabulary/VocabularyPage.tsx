import React from 'react';
import { Link } from 'react-router-dom';
import { fetchWorldgenSources } from '../../api/client';
import { useApi } from '../../api/useApi';
import type { WorldgenSourceEntry } from '../../api/types';
import { ErrorBox, LoadingBox } from '../tables/badges';

/**
 * WEB-006 — stem picker for the vocabulary editor. One card per normalized
 * world-gen table, showing who owns how many rows of it (base package,
 * script-authored ext, EISWeb web fragments).
 */
export function VocabularyPage() {
  const state = useApi(() => fetchWorldgenSources(), []);

  return (
    <div className="max-w-6xl space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-bold text-dust-100">Vocabulary</h2>
        <p className="text-sm text-dust-300">
          The world-generation vocabulary tables. Rows added here are written to web-owned source
          fragments (<code className="font-mono text-xs">*.web.csv</code> /{' '}
          <code className="font-mono text-xs">*.web.patch.csv</code>), then the generator chain
          re-runs and the result is committed — the generated tables are never edited directly.
        </p>
      </header>

      {state.loading && <LoadingBox label="Loading world-gen sources" />}
      {state.error != null && <ErrorBox error={state.error} />}

      {state.data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.data.stems.map((s) => (
            <StemCard key={s.stem} entry={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function StemCard({ entry }: { entry: WorldgenSourceEntry }) {
  const { stem, base, fragments } = entry;
  const count = (n: number | null) => (n === null ? '—' : String(n));
  return (
    <Link
      to={`/vocabulary/${stem}`}
      className="block rounded border border-dust-700 bg-dust-800 p-3 hover:border-petrol-dark hover:bg-dust-800/60"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-dust-100">{stem}</span>
        <span className="font-mono text-xs text-dust-500">
          {base.exists ? `${count(base.rowCount)} rows` : 'not generated'}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-dust-500">script ext</dt>
        <dd className="font-mono text-dust-300">
          {fragments.ext.exists ? `+${count(fragments.ext.rowCount)} rows` : '—'}
        </dd>
        <dt className="text-dust-500">script patches</dt>
        <dd className="font-mono text-dust-300">
          {fragments.patch.exists ? count(fragments.patch.rowCount) : '—'}
        </dd>
        <dt className="text-petrol-light">web rows</dt>
        <dd className="font-mono text-petrol-light">
          {fragments.web.exists ? `+${count(fragments.web.rowCount)}` : '0'}
        </dd>
        <dt className="text-petrol-light">web patches</dt>
        <dd className="font-mono text-petrol-light">
          {fragments.webPatch.exists ? count(fragments.webPatch.rowCount) : '0'}
        </dd>
      </dl>
    </Link>
  );
}
