import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { checkBrief, describeApiError, fetchBriefs } from '../../api/client';
import { useApi } from '../../api/useApi';
import type { BriefCheckResponse, BriefListEntry } from '../../api/types';
import { MethodContext } from '../method/MethodContext';
import { StageIndicator, StagePrevNext } from '../method/StageIndicator';
import { EmptyBox, ErrorBox, LoadingBox } from '../tables/badges';
import { VerdictBadge } from './CheckReport';
import { PageHeader } from '../layout/PageHeader';

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
    <div className="max-w-6xl space-y-5">
      <PageHeader
        eyebrow="Design locations"
        title="Briefs"
        context={
          <>
            The designer&apos;s first artifact — a location brief, written before Unreal opens.
            &ldquo;Check&rdquo; asks{' '}
            <code className="font-mono text-xs">Scripts/location_brief.py</code>: can we already
            build this? A NOT BUILDABLE brief is still a legitimate artifact — its gaps are the
            environment-art backlog.
          </>
        }
        actions={
          <>
            <StageIndicator stageId="Brief" />
            {state.data && state.data.briefs.length > 0 && (
              <button
                type="button"
                disabled={checkingAll}
                onClick={() => void runAll(state.data!.briefs)}
                className="btn-quiet px-3 py-1.5 text-sm"
              >
                {checkingAll ? 'Checking…' : 'Check all'}
              </button>
            )}
            <Link to="/briefs/new" className="btn-primary px-3 py-1.5 text-sm">
              New brief
            </Link>
          </>
        }
      />

      <MethodContext surface="briefs" />

      {state.loading && <LoadingBox label="Loading briefs" />}
      {state.error != null && <ErrorBox error={state.error} />}

      {state.data && state.data.briefs.length === 0 && (
        <EmptyBox>
          No briefs in <code className="font-mono text-xs">{state.data.dir}</code> yet — start with{' '}
          <Link
            to="/briefs/new"
            className="text-petrol-ink hover:text-petrol-dark hover:underline dark:text-petrol-light dark:hover:text-petrol"
          >
            New brief
          </Link>
          .
        </EmptyBox>
      )}

      {state.data && state.data.briefs.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-dust-600 dark:text-dust-400">
                <th className="px-3 py-2 font-mono font-medium uppercase tracking-eyebrow text-[10px]">brief</th>
                <th className="px-3 py-2 font-mono font-medium uppercase tracking-eyebrow text-[10px]">Location</th>
                <th className="px-3 py-2 font-mono font-medium uppercase tracking-eyebrow text-[10px]">notes</th>
                <th className="px-3 py-2 font-mono font-medium uppercase tracking-eyebrow text-[10px]">modified</th>
                <th className="px-3 py-2 font-mono font-medium uppercase tracking-eyebrow text-[10px]">last verdict</th>
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
    <tr className="border-t border-dust-200/70 dark:border-dust-800">
      <td className="px-3 py-2 font-mono text-xs">
        <Link
          to={`/briefs/${encodeURIComponent(brief.name)}`}
          className="text-petrol-ink hover:text-petrol-dark hover:underline dark:text-petrol-light dark:hover:text-petrol"
        >
          {brief.name}
        </Link>
      </td>
      <td className="px-3 py-2 text-dust-900 dark:text-dust-100">
        {brief.location || <span className="text-dust-500">—</span>}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-dust-600 dark:text-dust-400">
        {brief.commentLines > 0 ? `${brief.commentLines} line${brief.commentLines === 1 ? '' : 's'}` : '—'}
      </td>
      <td className="px-3 py-2 font-mono text-xs tabular-nums text-dust-600 dark:text-dust-400">
        {brief.mtime.slice(0, 16).replace('T', ' ')}
      </td>
      <td className="px-3 py-2">
        {check.kind === 'idle' && (
          <span className="text-xs text-dust-600 dark:text-dust-400">not checked yet</span>
        )}
        {check.kind === 'running' && (
          <span className="flex items-center gap-1.5 text-xs text-dust-600 dark:text-dust-400">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-petrol dark:bg-petrol-light" />
            checking…
          </span>
        )}
        {check.kind === 'error' && (
          <span className="text-xs text-rust-dark dark:text-rust-light">{check.message}</span>
        )}
        {check.kind === 'done' &&
          (check.check.verdict !== null ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <VerdictBadge verdict={check.check.verdict} />
              {check.check.result?.counts && (
                <span className="text-xs tabular-nums text-dust-600 dark:text-dust-400">
                  {check.check.result.counts.blocker}B / {check.check.result.counts.gap}G /{' '}
                  {check.check.result.counts.note}N
                </span>
              )}
            </span>
          ) : (
            <span className="text-xs text-rust-dark dark:text-rust-light">
              check produced no verdict
            </span>
          ))}
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          disabled={check.kind === 'running'}
          onClick={onCheck}
          className="btn-quiet px-2 py-1 text-xs"
        >
          Check
        </button>
      </td>
    </tr>
  );
}
