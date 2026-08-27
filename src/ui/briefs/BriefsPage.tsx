import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { checkBrief, describeApiError, fetchBriefs } from '../../api/client';
import { useApi } from '../../api/useApi';
import type { BriefCheckResponse, BriefListEntry } from '../../api/types';
import { MethodContext } from '../method/MethodContext';
import { StageIndicator, StagePrevNext } from '../method/StageIndicator';
import { ErrorBox, LoadingBox } from '../tables/badges';
import { VerdictBadge } from './CheckReport';

/**
 * WEB-007 — the brief list. Checks are LAZY: nothing runs on load; each row
 * has its own Check button and "Check all" walks the rows sequentially, so
 * the repo's python tool is never hammered in parallel.
 */

type CheckState = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; check: BriefCheckResponse } | { kind: 'error'; message: string };

export function BriefsPage() {
  const state = useApi(() => fetchBriefs(), []);
  const [checks, setChecks] = useState<Record<string, CheckState>>({});
  const [checkingAll, setCheckingAll] = useState(false);

  const runCheck = async (name: string): Promise<void> => {
    setChecks((c) => ({ ...c, [name]: { kind: 'running' } }));
    try {
      const check = await checkBrief(name);
      setChecks((c) => ({ ...c, [name]: { kind: 'done', check } }));
    } catch (err) {
      setChecks((c) => ({ ...c, [name]: { kind: 'error', message: describeApiError(err) } }));
    }
  };

  const runAll = async (briefs: BriefListEntry[]): Promise<void> => {
    setCheckingAll(true);
    try {
      for (const b of briefs) {
        // Sequential on purpose — one location_brief.py at a time.
        await runCheck(b.name);
      }
    } finally {
      setCheckingAll(false);
    }
  };

  return (
    <div className="max-w-6xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-dust-100">Briefs</h2>
            <StageIndicator stageId="Brief" />
          </div>
          <p className="text-sm text-dust-300">
            The designer&apos;s first artifact — a location brief, written before Unreal opens.
            &ldquo;Check&rdquo; asks{' '}
            <code className="font-mono text-xs">Scripts/location_brief.py</code>: can we already
            build this? A NOT BUILDABLE brief is still a legitimate artifact — its gaps are the
            environment-art backlog.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state.data && state.data.briefs.length > 0 && (
            <button
              type="button"
              disabled={checkingAll}
              onClick={() => void runAll(state.data!.briefs)}
              className="rounded border border-dust-700 bg-dust-800 px-3 py-1.5 text-sm text-dust-300 hover:border-petrol-dark hover:text-petrol-light disabled:opacity-50"
            >
              {checkingAll ? 'Checking…' : 'Check all'}
            </button>
          )}
          <Link
            to="/briefs/new"
            className="rounded border border-petrol-dark bg-petrol-tint px-3 py-1.5 text-sm text-petrol-light hover:bg-petrol-dark"
          >
            New brief
          </Link>
        </div>
      </header>

      <MethodContext surface="briefs" />

      {state.loading && <LoadingBox label="Loading briefs" />}
      {state.error != null && <ErrorBox error={state.error} />}

      {state.data && (
        <div className="overflow-x-auto rounded border border-dust-700">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-dust-800 text-left text-xs text-dust-500">
                <th className="px-3 py-2 font-medium">brief</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium">notes</th>
                <th className="px-3 py-2 font-medium">modified</th>
                <th className="px-3 py-2 font-medium">last verdict</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {state.data.briefs.map((b) => (
                <BriefRow
                  key={b.name}
                  brief={b}
                  check={checks[b.name] ?? { kind: 'idle' }}
                  onCheck={() => void runCheck(b.name)}
                />
              ))}
              {state.data.briefs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-dust-500">
                    No briefs in {state.data.dir} yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <StagePrevNext stageId="Brief" />
    </div>
  );
}

function BriefRow({ brief, check, onCheck }: {
  brief: BriefListEntry;
  check: CheckState;
  onCheck: () => void;
}) {
  return (
    <tr className="border-t border-dust-800">
      <td className="px-3 py-2 font-mono text-xs">
        <Link
          to={`/briefs/${encodeURIComponent(brief.name)}`}
          className="text-petrol-light hover:text-petrol hover:underline"
        >
          {brief.name}
        </Link>
      </td>
      <td className="px-3 py-2 text-dust-100">{brief.location || <span className="text-dust-500">—</span>}</td>
      <td className="px-3 py-2 text-xs text-dust-500">
        {brief.commentLines > 0 ? `${brief.commentLines} line${brief.commentLines === 1 ? '' : 's'}` : '—'}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-dust-500">
        {brief.mtime.slice(0, 16).replace('T', ' ')}
      </td>
      <td className="px-3 py-2">
        {check.kind === 'idle' && <span className="text-xs text-dust-500">not checked yet</span>}
        {check.kind === 'running' && <span className="text-xs text-dust-500">checking…</span>}
        {check.kind === 'error' && (
          <span className="text-xs text-rust-light">{check.message}</span>
        )}
        {check.kind === 'done' &&
          (check.check.verdict !== null ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <VerdictBadge verdict={check.check.verdict} />
              {check.check.result?.counts && (
                <span className="text-xs text-dust-500">
                  {check.check.result.counts.blocker}B / {check.check.result.counts.gap}G /{' '}
                  {check.check.result.counts.note}N
                </span>
              )}
            </span>
          ) : (
            <span className="text-xs text-rust-light">check produced no verdict</span>
          ))}
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          disabled={check.kind === 'running'}
          onClick={onCheck}
          className="rounded border border-dust-700 px-2 py-1 text-xs text-dust-300 hover:border-petrol-dark hover:text-petrol-light disabled:opacity-50"
        >
          Check
        </button>
      </td>
    </tr>
  );
}
