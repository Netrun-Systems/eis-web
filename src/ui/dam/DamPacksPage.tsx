import React, { useState } from 'react';
import { describeApiError, fetchDamPackList, runDamPackDryRun, runDamPackWrite } from '../../api/client';
import { useApi } from '../../api/useApi';
import type {
  DamDryRunResponse,
  DamFallbackCheck,
  DamPackEntry,
  DamPackWriteResponse,
} from '../../api/types';
import { EmptyBox, ErrorBox, LoadingBox } from '../tables/badges';
import { PageHeader } from '../layout/PageHeader';

/**
 * WEB-009 — the pack registry. Dry run is free (read-only classification
 * report); Register is the approve step: a confirm strip quotes the exact
 * commit that will be created, the server dirty-guards the catalogues, and
 * the result is rendered faithfully — commit hash, idempotent note, or
 * refusal. The fallback --check verdict follows every write, because a new
 * CityStyle without a STYLE_FAMILY entry is exactly the WG-163 defect.
 */

type DryState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; result: DamDryRunResponse }
  | { kind: 'error'; message: string };

type WriteState =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'running' }
  | { kind: 'done'; result: DamPackWriteResponse }
  | { kind: 'error'; message: string };

export function DamPacksPage() {
  const state = useApi(() => fetchDamPackList(), []);
  const [dry, setDry] = useState<Record<string, DryState>>({});
  const [write, setWrite] = useState<Record<string, WriteState>>({});

  const runDry = async (name: string): Promise<void> => {
    setDry((s) => ({ ...s, [name]: { kind: 'running' } }));
    try {
      const result = await runDamPackDryRun(name);
      setDry((s) => ({ ...s, [name]: { kind: 'done', result } }));
    } catch (err) {
      setDry((s) => ({ ...s, [name]: { kind: 'error', message: describeApiError(err) } }));
    }
  };

  const runWrite = async (name: string): Promise<void> => {
    setWrite((s) => ({ ...s, [name]: { kind: 'running' } }));
    try {
      const result = await runDamPackWrite(name);
      setWrite((s) => ({ ...s, [name]: { kind: 'done', result } }));
    } catch (err) {
      setWrite((s) => ({ ...s, [name]: { kind: 'error', message: describeApiError(err) } }));
    }
  };

  return (
    <div className="max-w-6xl space-y-5">
      <PageHeader
        eyebrow="Assets"
        title="Content Packs"
        context={
          <>
            An asset on disk does not exist as far as PCG is concerned — the nodes resolve
            meshes through the kit catalogue by PieceType. This is{' '}
            <code className="font-mono text-xs">Scripts/catalog_content_pack.py</code> as a
            surface: dry-run the classification, then register. Re-running replaces only that
            pack&apos;s rows, so registration is safe to iterate.
          </>
        }
        actions={
          <button
            type="button"
            onClick={state.reload}
            className="btn-quiet px-3 py-1.5 text-sm"
          >
            Refresh
          </button>
        }
      />

      {state.loading && <LoadingBox label="Listing configured packs" />}
      {state.error != null && <ErrorBox error={state.error} />}

      {state.data && state.data.packs === null && (
        <div className="space-y-2">
          <div className="rounded border border-amber/50 bg-amber-wash px-3 py-2 text-sm text-amber-ink dark:border-amber-dark dark:bg-amber-tint dark:text-amber-light">
            The <code className="font-mono text-xs">--list</code> output resisted parsing — raw
            output below (exit {state.data.exitCode}).
          </div>
          <pre className="panel overflow-x-auto p-3 font-mono text-xs leading-relaxed text-dust-700 dark:text-dust-300">
            {state.data.raw}
          </pre>
        </div>
      )}

      {state.data && state.data.packs !== null && state.data.packs.length === 0 && (
        <EmptyBox>No packs configured in catalog_content_pack.py.</EmptyBox>
      )}

      {state.data && state.data.packs !== null && state.data.packs.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-dust-600 dark:text-dust-400">
                <th className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-eyebrow">pack</th>
                <th className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-eyebrow">CityStyle</th>
                <th className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-eyebrow">on disk</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {state.data.packs.map((p) => (
                <PackRow
                  key={p.name}
                  pack={p}
                  dry={dry[p.name] ?? { kind: 'idle' }}
                  write={write[p.name] ?? { kind: 'idle' }}
                  onDryRun={() => void runDry(p.name)}
                  onWriteState={(s) => setWrite((w) => ({ ...w, [p.name]: s }))}
                  onWriteConfirmed={() => void runWrite(p.name)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PackRow({ pack, dry, write, onDryRun, onWriteState, onWriteConfirmed }: {
  pack: DamPackEntry;
  dry: DryState;
  write: WriteState;
  onDryRun: () => void;
  onWriteState: (s: WriteState) => void;
  onWriteConfirmed: () => void;
}) {
  const busy = dry.kind === 'running' || write.kind === 'running';
  const showDetail =
    dry.kind !== 'idle' || write.kind === 'confirming' || write.kind === 'done' || write.kind === 'error';
  return (
    <>
      <tr className="border-t border-dust-200/70 dark:border-dust-800">
        <td className="px-3 py-2 font-mono text-xs text-dust-900 dark:text-dust-100">{pack.name}</td>
        <td className="px-3 py-2 text-xs text-dust-700 dark:text-dust-300">{pack.cityStyle}</td>
        <td className="px-3 py-2">
          {pack.onDisk ? (
            <span className="chip chip-petrol">on disk</span>
          ) : (
            <span className="chip chip-rust">NOT FOUND</span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          <span className="inline-flex gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={onDryRun}
              className="btn-quiet px-2 py-1 text-xs"
            >
              {dry.kind === 'running' ? 'Running…' : 'Dry run'}
            </button>
            <button
              type="button"
              disabled={busy || !pack.onDisk || write.kind === 'confirming'}
              onClick={() => onWriteState({ kind: 'confirming' })}
              className="btn-primary px-2 py-1 text-xs"
              title={pack.onDisk ? undefined : 'pack root is not on disk — nothing to scan'}
            >
              {write.kind === 'running' ? 'Registering…' : 'Register (write)'}
            </button>
          </span>
        </td>
      </tr>
      {showDetail && (
        <tr className="border-t border-dust-200/40 dark:border-dust-800/60">
          <td colSpan={4} className="bg-dust-50/60 px-3 py-2.5 dark:bg-dust-900/30">
            <div className="space-y-2.5">
              {write.kind === 'confirming' && (
                <ConfirmStrip
                  pack={pack.name}
                  onCancel={() => onWriteState({ kind: 'idle' })}
                  onConfirm={onWriteConfirmed}
                />
              )}
              {write.kind === 'error' && (
                <p className="text-sm text-rust-dark dark:text-rust-light">{write.message}</p>
              )}
              {write.kind === 'done' && <WriteResult result={write.result} />}
              {dry.kind === 'error' && (
                <p className="text-sm text-rust-dark dark:text-rust-light">{dry.message}</p>
              )}
              {dry.kind === 'done' && <DryRunReport result={dry.result} />}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ConfirmStrip({ pack, onCancel, onConfirm }: {
  pack: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-2 rounded border border-amber/50 bg-amber-wash px-3 py-2.5 text-sm text-amber-ink dark:border-amber-dark dark:bg-amber-tint dark:text-amber-light">
      <p className="max-w-[70ch] leading-relaxed">
        This runs <code className="font-mono text-xs">--pack {pack} --write</code> against the
        EISCORE clone and, if the catalogues change, creates exactly one commit:
      </p>
      <p className="font-mono text-xs">
        eisweb: register pack {pack} <span className="opacity-70">(author EISWeb)</span>
      </p>
      <p className="max-w-[70ch] text-xs leading-relaxed opacity-80">
        Uncommitted hand edits to the catalogues block the write. If the pack is already
        registered byte-identically, nothing is committed and the result says so.
      </p>
      <div className="flex gap-2 pt-0.5">
        <button type="button" onClick={onConfirm} className="btn-primary px-3 py-1 text-xs">
          Confirm — register {pack}
        </button>
        <button type="button" onClick={onCancel} className="btn-quiet px-3 py-1 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}

function WriteResult({ result }: { result: DamPackWriteResponse }) {
  if (!result.success) {
    return (
      <div className="space-y-1 rounded border border-rust/50 bg-rust-wash px-3 py-2 text-sm text-rust-dark dark:border-rust-dark dark:bg-rust-tint dark:text-rust-light">
        <p>
          Refused: <span className="font-mono text-xs">{result.reason}</span>
        </p>
        {result.detail !== undefined && (
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed">
            {typeof result.detail === 'string' ? result.detail : JSON.stringify(result.detail, null, 2)}
          </pre>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {result.commit !== null ? (
        <p className="text-sm text-dust-900 dark:text-dust-100">
          <span className="chip chip-petrol mr-1.5">committed {result.commit}</span>
          registered <span className="font-mono text-xs">{result.pack}</span>
        </p>
      ) : (
        <p className="text-sm text-dust-900 dark:text-dust-100">
          <span className="chip chip-info mr-1.5">{result.note ?? 'no changes'}</span>
          the catalogues already match this pack byte-for-byte
        </p>
      )}
      {result.diffstat !== null && result.diffstat !== '' && (
        <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-dust-600 dark:text-dust-400">
          {result.diffstat}
        </pre>
      )}
      <FallbackVerdict check={result.fallbackCheck} />
    </div>
  );
}

function FallbackVerdict({ check }: { check: DamFallbackCheck }) {
  return (
    <div className="text-xs">
      <span className="mr-1.5 text-dust-600 dark:text-dust-400">
        author_city_style_fallback.py --check:
      </span>
      {check.exitCode === 0 ? (
        <span className="chip chip-petrol">ok</span>
      ) : (
        <>
          <span className="chip chip-rust">FAILED (exit {check.exitCode})</span>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed text-rust-dark dark:text-rust-light">
            {check.output}
          </pre>
          <p className="mt-1 max-w-[70ch] text-dust-600 dark:text-dust-400">
            A new CityStyle needs a family: add it to STYLE_FAMILY in
            author_city_style_fallback.py and re-run — without an entry the style falls straight
            through to an arbitrary pick (WG-163). Surfaced here, fixed in the repo.
          </p>
        </>
      )}
    </div>
  );
}

function DryRunReport({ result }: { result: DamDryRunResponse }) {
  return (
    <div className="space-y-1.5">
      <p className="flex flex-wrap items-center gap-2 text-xs text-dust-600 dark:text-dust-400">
        <span className="font-mono">dry run · exit {result.exitCode}</span>
        {result.merge && (
          <span className="tabular-nums">
            kit {result.merge.kitKept.toLocaleString()} kept +{' '}
            {result.merge.kitNew.toLocaleString()} new = {result.merge.kitTotal.toLocaleString()}
            {' · '}props {result.merge.propKept.toLocaleString()} kept +{' '}
            {result.merge.propNew.toLocaleString()} new = {result.merge.propTotal.toLocaleString()}
          </span>
        )}
      </p>
      <pre className="max-h-96 overflow-auto rounded border border-dust-200 bg-dust-0 p-2.5 font-mono text-xs leading-relaxed text-dust-700 dark:border-dust-700 dark:bg-dust-900 dark:text-dust-300">
        {result.report}
      </pre>
    </div>
  );
}
