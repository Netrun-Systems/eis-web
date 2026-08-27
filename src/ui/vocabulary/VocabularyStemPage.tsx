import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchTableRows, fetchWorldgenWeb, putWorldgenWeb } from '../../api/client';
import { useApi } from '../../api/useApi';
import type {
  WorldgenPatch,
  WorldgenPutResponse,
  WorldgenWebResponse,
} from '../../api/types';
import { surfaceKeyForStem } from '../../content/method';
import { MethodContext } from '../method/MethodContext';
import { StageIndicator, StagePrevNext } from '../method/StageIndicator';
import { ErrorBox, LoadingBox } from '../tables/badges';
import { FindingCountsStrip, FindingListItem } from '../validation/findings';
import { RowForm, FkMultiPicker } from './RowForm';

/**
 * WEB-006 — per-stem vocabulary editor. Base + ext rows are read-only (their
 * owners are the upstream package and the author_*_ext.py scripts); web rows
 * and web patches are the editable, EISWeb-owned layer. Save writes the two
 * fragments server-side, re-runs the generator chain, and either commits or
 * rolls back on validator errors — the unsaved state survives any refusal.
 */
export function VocabularyStemPage() {
  const params = useParams();
  const stem = params.stem ?? '';
  const state = useApi(() => fetchWorldgenWeb(stem), [stem]);

  const surfaceKey = surfaceKeyForStem(stem);

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Link to="/vocabulary" className="text-petrol-ink dark:text-petrol-light hover:text-petrol-dark dark:hover:text-petrol hover:underline">
          &larr; All vocabularies
        </Link>
        <StageIndicator stageId={stem} />
      </div>
      {surfaceKey !== null && <MethodContext surface={surfaceKey} />}
      {state.loading && <LoadingBox label={`Loading ${stem}`} />}
      {state.error != null && <ErrorBox error={state.error} />}
      {state.data && <StemEditor key={stem} data={state.data} reload={state.reload} />}
      <StagePrevNext stageId={stem} />
    </div>
  );
}

/** Derive the stem's RowName prefix from its existing rows — the most common
 * leading `XXX_` pattern; never hardcoded. */
function derivePrefix(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) {
    const m = /^([A-Za-z]+_)/.exec(n);
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [p, c] of counts) {
    if (c > bestCount) {
      best = p;
      bestCount = c;
    }
  }
  return best;
}

type FormTarget = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; index: number };

function StemEditor({ data, reload }: { data: WorldgenWebResponse; reload: () => void }) {
  const { stem, columns, baseRows } = data;
  const nameI = columns.indexOf('RowName');

  const [webRows, setWebRows] = useState<string[][]>(data.webRows);
  const [webPatches, setWebPatches] = useState<WorldgenPatch[]>(data.webPatches);
  const [form, setForm] = useState<FormTarget>({ mode: 'closed' });
  const [patchSeed, setPatchSeed] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<WorldgenPutResponse | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);

  // The server state we loaded — for the dirty indicator.
  const pristine = useMemo(
    () => JSON.stringify({ r: data.webRows, p: data.webPatches }),
    [data],
  );
  const dirty = JSON.stringify({ r: webRows, p: webPatches }) !== pristine;

  const prefix = useMemo(
    () => derivePrefix([...baseRows.map((b) => b.rowName), ...data.webRows.map((r) => r[nameI] ?? '')]),
    [baseRows, data.webRows, nameI],
  );

  const takenNames = useMemo(() => {
    const s = new Set<string>(baseRows.map((b) => b.rowName));
    webRows.forEach((r) => s.add(r[nameI] ?? ''));
    return s;
  }, [baseRows, webRows, nameI]);

  const filteredBase = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (f === '') return baseRows;
    return baseRows.filter(
      (b) => b.rowName.toLowerCase().includes(f) || b.displayName.toLowerCase().includes(f),
    );
  }, [baseRows, filter]);

  // "Copy values from": full rows come from the generated table via the
  // existing WEB-003 read endpoint, fetched lazily and cached.
  const [fullRowsCache, setFullRowsCache] = useState<Map<string, string[]> | null>(null);
  const copyFrom = async (rowName: string): Promise<string[] | null> => {
    let cache = fullRowsCache;
    if (cache === null) {
      const res = await fetchTableRows(`Data/WorldGen/${stem}.csv`);
      const srcNameI = res.columns.indexOf('RowName');
      cache = new Map(res.rows.map((r) => [r[srcNameI] ?? '', columns.map((c) => r[res.columns.indexOf(c)] ?? '')]));
      setFullRowsCache(cache);
    }
    return cache.get(rowName) ?? null;
  };

  const submitRow = (values: string[]) => {
    if (form.mode === 'edit') {
      setWebRows((prev) => prev.map((r, i) => (i === form.index ? values : r)));
    } else {
      setWebRows((prev) => [...prev, values]);
    }
    setForm({ mode: 'closed' });
  };

  const save = () => {
    setSaving(true);
    setSaveError(null);
    setSaveResult(null);
    putWorldgenWeb(stem, { webRows, webPatches })
      .then((result) => {
        setSaveResult(result);
        if (result.success) reload();
        // On refusal the form state is untouched — nothing is lost.
      })
      .catch((e) => setSaveError(e))
      .finally(() => setSaving(false));
  };

  return (
    <>
      <header className="space-y-1.5 border-b border-dust-200 pb-3 dark:border-dust-700">
        <p className="eyebrow">Author the vocabulary</p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="page-title normal-case tracking-normal">{stem}</h2>
          <span className="font-mono text-xs text-dust-600 dark:text-dust-400">
            {columns.length} columns · prefix {prefix || '(none)'}
          </span>
          <Link
            to={`/tables/Data/WorldGen/${stem}.csv`}
            className="text-xs text-petrol-ink dark:text-petrol-light hover:text-petrol-dark dark:hover:text-petrol hover:underline"
          >
            view generated table
          </Link>
        </div>
      </header>

      {/* ---- base + ext rows (read-only) ---- */}
      <section className="space-y-2 rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-800 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-dust-900 dark:text-dust-100">
            Existing rows <span className="font-mono text-xs text-dust-600 dark:text-dust-400">({baseRows.length})</span>
          </h3>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter…"
            className="rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-900 px-2 py-1 text-xs text-dust-600 dark:text-dust-300"
          />
          <span className="text-xs text-dust-600 dark:text-dust-400">
            read-only — owned by the base package or the ext scripts; amend via a patch
          </span>
        </div>
        <ul className="max-h-64 divide-y divide-dust-200/70 dark:divide-dust-700/60 overflow-y-auto">
          {filteredBase.map((b) => (
            <li key={b.rowName} className="flex items-center gap-2 py-1 text-xs">
              <code className="font-mono text-dust-900 dark:text-dust-100">{b.rowName}</code>
              <span className="text-dust-600 dark:text-dust-300">{b.displayName}</span>
              <span
                className={`rounded border px-1 font-mono text-[10px] ${
                  b.owner === 'ext'
                    ? 'border-petrol/40 dark:border-petrol-dark text-petrol-ink dark:text-petrol-light'
                    : 'border-dust-200 dark:border-dust-700 text-dust-600 dark:text-dust-400'
                }`}
              >
                {b.owner}
              </span>
              <button
                type="button"
                onClick={() => setPatchSeed(b.rowName)}
                className="ml-auto rounded border border-dust-200 dark:border-dust-700 px-1.5 text-[11px] text-dust-600 dark:text-dust-300 hover:border-petrol dark:hover:border-petrol-dark hover:text-petrol-dark dark:hover:text-petrol-light"
              >
                patch…
              </button>
            </li>
          ))}
          {filteredBase.length === 0 && (
            <li className="py-1 text-xs text-dust-600 dark:text-dust-400">no rows match the filter</li>
          )}
        </ul>
      </section>

      {/* ---- web rows (editable) ---- */}
      <section className="space-y-2 rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-800 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-dust-900 dark:text-dust-100">
            Web rows <span className="font-mono text-xs text-dust-600 dark:text-dust-400">({webRows.length})</span>
          </h3>
          <span className="text-xs text-dust-600 dark:text-dust-400">
            stored in Documentation/WorldGen_Extensions/{stem}.web.csv
          </span>
          {form.mode === 'closed' && (
            <button
              type="button"
              onClick={() => setForm({ mode: 'add' })}
              className="ml-auto rounded border border-petrol/40 dark:border-petrol-dark bg-petrol-wash dark:bg-petrol-tint px-2.5 py-1 text-xs text-petrol-ink dark:text-petrol-light hover:bg-petrol/20 dark:hover:bg-petrol-dark"
            >
              Add row
            </button>
          )}
        </div>

        {webRows.length > 0 && (
          <ul className="divide-y divide-dust-200/70 dark:divide-dust-700/60">
            {webRows.map((r, i) => (
              <li key={`${r[nameI]}-${i}`} className="flex items-center gap-2 py-1 text-xs">
                <code className="font-mono text-petrol-ink dark:text-petrol-light">{r[nameI]}</code>
                <span className="text-dust-600 dark:text-dust-300">
                  {columns.indexOf('DisplayName') >= 0 ? r[columns.indexOf('DisplayName')] : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setForm({ mode: 'edit', index: i })}
                  className="ml-auto rounded border border-dust-200 dark:border-dust-700 px-1.5 text-[11px] text-dust-600 dark:text-dust-300 hover:border-petrol dark:hover:border-petrol-dark hover:text-petrol-dark dark:hover:text-petrol-light"
                >
                  edit
                </button>
                <button
                  type="button"
                  onClick={() => setWebRows((prev) => prev.filter((_, j) => j !== i))}
                  className="rounded border border-dust-200 dark:border-dust-700 px-1.5 text-[11px] text-dust-600 dark:text-dust-300 hover:border-rust dark:hover:border-rust-dark hover:text-rust dark:hover:text-rust-light"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {webRows.length === 0 && form.mode === 'closed' && (
          <p className="text-xs text-dust-600 dark:text-dust-400">
            No web-owned rows yet — the fragment file does not exist until one is saved.
          </p>
        )}

        {form.mode !== 'closed' && (
          <RowForm
            key={form.mode === 'edit' ? `edit-${form.index}` : 'add'}
            columns={columns}
            columnTypes={data.columnTypes}
            fkOptions={data.fkOptions}
            wildcards={data.wildcards}
            prefix={prefix}
            takenNames={takenNames}
            initial={form.mode === 'edit' ? webRows[form.index] : columns.map(() => '')}
            editingName={form.mode === 'edit' ? (webRows[form.index][nameI] ?? '') : null}
            onSubmit={submitRow}
            onCancel={() => setForm({ mode: 'closed' })}
            onCopyFrom={copyFrom}
            copyFromNames={baseRows.map((b) => b.rowName)}
          />
        )}
      </section>

      {/* ---- web patches ---- */}
      <PatchEditor
        data={data}
        webRows={webRows}
        webPatches={webPatches}
        setWebPatches={setWebPatches}
        seedRowName={patchSeed}
        clearSeed={() => setPatchSeed(null)}
      />

      {/* ---- save ---- */}
      <section className="space-y-2 rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-800 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded border border-petrol/40 dark:border-petrol-dark bg-petrol-wash dark:bg-petrol-tint px-3 py-1.5 text-sm text-petrol-ink dark:text-petrol-light hover:bg-petrol/20 dark:hover:bg-petrol-dark disabled:cursor-not-allowed disabled:text-dust-500"
          >
            {saving ? 'Saving — running the generator chain…' : 'Save to EISCORE'}
          </button>
          <span className="text-xs text-dust-600 dark:text-dust-400">
            {dirty
              ? 'unsaved changes — save writes the fragments, re-runs normalize → group tokens → validator, and commits'
              : 'no unsaved changes'}
          </span>
        </div>
        {saveError != null && <ErrorBox error={saveError} />}
        {saveResult !== null && <SaveResultPanel result={saveResult} />}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------

function PatchEditor({
  data,
  webRows,
  webPatches,
  setWebPatches,
  seedRowName,
  clearSeed,
}: {
  data: WorldgenWebResponse;
  webRows: string[][];
  webPatches: WorldgenPatch[];
  setWebPatches: React.Dispatch<React.SetStateAction<WorldgenPatch[]>>;
  seedRowName: string | null;
  clearSeed: () => void;
}) {
  const { columns, baseRows, stem } = data;
  const nameI = columns.indexOf('RowName');
  const patchableNames = useMemo(
    () => [...baseRows.map((b) => b.rowName), ...webRows.map((r) => r[nameI] ?? '')],
    [baseRows, webRows, nameI],
  );

  const empty: WorldgenPatch = { rowName: '', column: '', op: 'append', value: '', reason: '' };
  const [draft, setDraft] = useState<WorldgenPatch>(empty);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (seedRowName !== null) {
      setDraft((d) => ({ ...d, rowName: seedRowName }));
      setOpen(true);
      clearSeed();
    }
  }, [seedRowName, clearSeed]);

  const fk = data.fkOptions.find((o) => o.column === draft.column);
  const draftError =
    draft.rowName === ''
      ? 'pick a row'
      : draft.column === ''
        ? 'pick a column'
        : draft.reason.trim() === ''
          ? 'Reason is required — an amendment to someone else’s data has to say why'
          : null;

  return (
    <section className="space-y-2 rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-800 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-dust-900 dark:text-dust-100">
          Web patches <span className="font-mono text-xs text-dust-600 dark:text-dust-400">({webPatches.length})</span>
        </h3>
        <span className="text-xs text-dust-600 dark:text-dust-400">
          column edits to existing rows — stored in {stem}.web.patch.csv; append adds |-tokens, set
          replaces the cell
        </span>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto rounded border border-petrol/40 dark:border-petrol-dark bg-petrol-wash dark:bg-petrol-tint px-2.5 py-1 text-xs text-petrol-ink dark:text-petrol-light hover:bg-petrol/20 dark:hover:bg-petrol-dark"
          >
            Add patch
          </button>
        )}
      </div>

      {webPatches.length > 0 && (
        <ul className="divide-y divide-dust-200/70 dark:divide-dust-700/60">
          {webPatches.map((p, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-2 py-1 text-xs">
              <code className="font-mono text-dust-900 dark:text-dust-100">{p.rowName}</code>
              <span className="text-dust-600 dark:text-dust-400">·</span>
              <code className="font-mono text-dust-600 dark:text-dust-300">{p.column}</code>
              <span className="rounded border border-dust-200 dark:border-dust-700 px-1 font-mono text-[10px] text-petrol-ink dark:text-petrol-light">
                {p.op}
              </span>
              <code className="font-mono text-dust-600 dark:text-dust-300">{p.value}</code>
              <span className="text-dust-600 dark:text-dust-400">— {p.reason}</span>
              <button
                type="button"
                onClick={() => setWebPatches((prev) => prev.filter((_, j) => j !== i))}
                className="ml-auto rounded border border-dust-200 dark:border-dust-700 px-1.5 text-[11px] text-dust-600 dark:text-dust-300 hover:border-rust dark:hover:border-rust-dark hover:text-rust dark:hover:text-rust-light"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="space-y-2 rounded border border-petrol/40 dark:border-petrol-dark bg-dust-100/50 dark:bg-dust-900/40 p-2">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <label className="block text-xs">
              <span className="mb-0.5 block font-semibold text-dust-900 dark:text-dust-100">Row</span>
              <select
                value={draft.rowName}
                onChange={(e) => setDraft({ ...draft, rowName: e.target.value })}
                className="w-full rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-900 px-1.5 py-1 font-mono text-xs text-dust-600 dark:text-dust-300"
              >
                <option value="">—</option>
                {patchableNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-0.5 block font-semibold text-dust-900 dark:text-dust-100">Column</span>
              <select
                value={draft.column}
                onChange={(e) => setDraft({ ...draft, column: e.target.value, value: '' })}
                className="w-full rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-900 px-1.5 py-1 font-mono text-xs text-dust-600 dark:text-dust-300"
              >
                <option value="">—</option>
                {columns
                  .filter((c) => c !== 'RowName')
                  .map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-0.5 block font-semibold text-dust-900 dark:text-dust-100">Op</span>
              <select
                value={draft.op}
                onChange={(e) => setDraft({ ...draft, op: e.target.value })}
                className="w-full rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-900 px-1.5 py-1 font-mono text-xs text-dust-600 dark:text-dust-300"
              >
                <option value="append">append (add |-tokens)</option>
                <option value="set">set (replace cell)</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-0.5 block font-semibold text-dust-900 dark:text-dust-100">Reason (required)</span>
              <input
                type="text"
                value={draft.reason}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                placeholder="why this amendment?"
                className="w-full rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-900 px-2 py-1 text-xs text-dust-600 dark:text-dust-300"
              />
            </label>
          </div>
          <label className="block text-xs">
            <span className="mb-0.5 block font-semibold text-dust-900 dark:text-dust-100">Value</span>
            {fk ? (
              <FkMultiPicker
                fk={fk}
                wildcards={data.wildcards}
                value={draft.value}
                onChange={(v) => setDraft({ ...draft, value: v })}
              />
            ) : (
              <input
                type="text"
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                className="w-full rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-900 px-2 py-1 font-mono text-xs text-dust-600 dark:text-dust-300"
              />
            )}
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={draftError !== null}
              onClick={() => {
                setWebPatches((prev) => [...prev, { ...draft, reason: draft.reason.trim() }]);
                setDraft(empty);
                setOpen(false);
              }}
              className="rounded border border-petrol/40 dark:border-petrol-dark bg-petrol-wash dark:bg-petrol-tint px-3 py-1 text-sm text-petrol-ink dark:text-petrol-light hover:bg-petrol/20 dark:hover:bg-petrol-dark disabled:cursor-not-allowed disabled:border-dust-200 dark:disabled:border-dust-700 disabled:bg-dust-100 dark:disabled:bg-dust-800 disabled:text-dust-500"
            >
              Add patch
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(empty);
                setOpen(false);
              }}
              className="rounded border border-dust-200 dark:border-dust-700 px-3 py-1 text-sm text-dust-600 dark:text-dust-300 hover:bg-dust-100 dark:hover:bg-dust-800/60"
            >
              Cancel
            </button>
            {draftError !== null && <span className="text-xs text-dust-600 dark:text-dust-400">{draftError}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

/** Honest rendering of a save outcome: success shows the commit + the
 * normalize report + remaining WARN/INFO findings; a refusal shows exactly
 * what the rows broke (the WEB-005 findings panel language throughout). */
function SaveResultPanel({ result }: { result: WorldgenPutResponse }) {
  if (result.success) {
    return (
      <div className="space-y-2 rounded border border-petrol/40 dark:border-petrol-dark bg-petrol-wash/50 dark:bg-petrol-tint/30 p-2">
        <p className="text-sm text-dust-900 dark:text-dust-100">
          Saved.{' '}
          {result.commit !== null ? (
            <>
              Commit <code className="font-mono text-petrol-ink dark:text-petrol-light">{result.commit}</code> in
              EISCORE — fragments + regenerated tables.
            </>
          ) : (
            'Nothing changed (byte-identical to HEAD) — no commit was made.'
          )}
        </p>
        <FindingCountsStrip counts={result.summaryCounts} ranAt={new Date().toISOString()} />
        {result.normalizeOutput !== '' && (
          <pre className="overflow-x-auto rounded border border-dust-200 dark:border-dust-700 bg-dust-100/60 dark:bg-dust-900 p-2 font-mono text-[11px] leading-4 text-dust-700 dark:text-dust-300">
            {result.normalizeOutput}
          </pre>
        )}
        {result.findings.length > 0 && (
          <ul className="divide-y divide-dust-200/70 dark:divide-dust-700/60">
            {result.findings.map((f, i) => (
              <FindingListItem key={i} finding={f} />
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded border border-rust/50 dark:border-rust-dark bg-rust-wash dark:bg-rust-tint p-2">
      <p className="text-sm text-rust-dark dark:text-rust-light">
        {result.reason === 'validation_errors' ? (
          <>
            Refused: the validator found errors, so the EISCORE tree was rolled back — nothing was
            written or committed. Your unsaved rows are still in the form below.
          </>
        ) : (
          <>
            Refused: <code className="font-mono">{result.reason}</code>
            {typeof result.detail === 'string' && <> — {result.detail}</>}
          </>
        )}
      </p>
      {typeof result.detail === 'object' && result.detail !== null && (
        <pre className="overflow-x-auto rounded border border-dust-200 dark:border-dust-700 bg-dust-100/60 dark:bg-dust-900 p-2 font-mono text-[11px] leading-4 text-dust-700 dark:text-dust-300">
          {JSON.stringify(result.detail, null, 2)}
        </pre>
      )}
      {result.summaryCounts && (
        <FindingCountsStrip counts={result.summaryCounts} ranAt={new Date().toISOString()} />
      )}
      {result.findings && result.findings.length > 0 && (
        <ul className="divide-y divide-dust-200/70 dark:divide-dust-700/60">
          {result.findings.map((f, i) => (
            <FindingListItem key={i} finding={f} />
          ))}
        </ul>
      )}
    </div>
  );
}
