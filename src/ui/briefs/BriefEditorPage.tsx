import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { checkBriefDraft, describeApiError, fetchBrief, putBrief } from '../../api/client';
import { useApi } from '../../api/useApi';
import type { BriefCheckResponse, BriefPutResponse } from '../../api/types';
import {
  findBriefEntry,
  MULTI_VALUE_BRIEF_KEYS,
  parseBrief,
  RECOGNIZED_BRIEF_KEYS,
  spliceComments,
  spliceEntryValues,
  stripCommentMarker,
  toCommentLine,
} from '../../lib/briefFormat';
import { StageIndicator } from '../method/StageIndicator';
import { ErrorBox, LoadingBox } from '../tables/badges';
import { BriefCheckReport } from './CheckReport';

/**
 * WEB-007 — the brief editor. Two synced views over ONE raw-text buffer:
 *
 *   form  one field per recognised key, generated from the parse; edits are
 *         applied as surgical line splices, so unrecognised keys, mid-file
 *         comments and layout are preserved untouched;
 *   raw   the text itself.
 *
 * Because both modes edit the same buffer (form edits fold into it on
 * mode-switch / check / save), switching modes never loses content.
 *
 * "Check coverage" runs the draft buffer — unsaved, against a temp file
 * outside the repo. Save writes + commits, and returns a fresh check.
 */

const NOTES_KEY = '__notes';
const NAME_STEM_RE = /^[A-Za-z0-9_-]+$/;

type FormState = Record<string, string>;

function buildFormState(raw: string): FormState {
  const parsed = parseBrief(raw);
  const st: FormState = {};
  for (const key of RECOGNIZED_BRIEF_KEYS) {
    st[key] = findBriefEntry(parsed, key)?.values.join('\n') ?? '';
  }
  st[NOTES_KEY] = parsed.comments.map(stripCommentMarker).join('\n');
  return st;
}

function applyFormState(raw: string, st: FormState): string {
  let out = raw;
  for (const key of RECOGNIZED_BRIEF_KEYS) {
    out = spliceEntryValues(out, key, (st[key] ?? '').split('\n'));
  }
  const notesText = st[NOTES_KEY] ?? '';
  const notes = notesText.trim() === '' ? [] : notesText.split('\n').map(toCommentLine);
  return spliceComments(out, notes);
}

export function BriefEditorPage() {
  const params = useParams();
  const name = params.name ?? '';
  const isNew = name === 'new';
  const state = useApi(
    () => (isNew ? Promise.resolve(null) : fetchBrief(name)),
    [name, isNew],
  );

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Link to="/briefs" className="text-petrol-light hover:text-petrol hover:underline">
          &larr; All briefs
        </Link>
        <StageIndicator stageId="Brief" />
      </div>
      {state.loading && <LoadingBox label={isNew ? 'Preparing editor' : `Loading ${name}`} />}
      {state.error != null && <ErrorBox error={state.error} />}
      {!state.loading && state.error == null && (
        <Editor
          key={name}
          briefName={isNew ? null : name}
          initialRaw={state.data?.raw ?? ''}
        />
      )}
    </div>
  );
}

function Editor({ briefName, initialRaw }: { briefName: string | null; initialRaw: string }) {
  const navigate = useNavigate();
  const isNew = briefName === null;

  const [raw, setRaw] = useState(initialRaw);
  const [mode, setMode] = useState<'form' | 'raw'>('form');
  const [form, setForm] = useState<FormState>(() => buildFormState(initialRaw));
  const [nameStem, setNameStem] = useState('');
  const [check, setCheck] = useState<BriefCheckResponse | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<BriefPutResponse | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** The buffer with any pending form edits folded in. */
  const currentRaw = (): string => (mode === 'form' ? applyFormState(raw, form) : raw);

  const switchMode = (next: 'form' | 'raw'): void => {
    if (next === mode) return;
    if (next === 'raw') {
      setRaw(applyFormState(raw, form));
    } else {
      setForm(buildFormState(raw));
    }
    setMode(next);
  };

  const parsed = useMemo(() => parseBrief(currentRaw()), [raw, form, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const recognizedLower = useMemo(
    () => new Set(RECOGNIZED_BRIEF_KEYS.map((k) => k.toLowerCase())),
    [],
  );
  const unrecognized = parsed.entries.filter(
    (e) => !recognizedLower.has(e.key.trim().toLowerCase()),
  );

  const targetName = isNew ? `${nameStem}.brief` : briefName;
  const nameOk = !isNew || NAME_STEM_RE.test(nameStem);
  const dirty = currentRaw() !== initialRaw || isNew;

  const runCheck = async (): Promise<void> => {
    const buffer = currentRaw();
    if (mode === 'form') setRaw(buffer); // fold form edits into the buffer
    setChecking(true);
    setCheckError(null);
    try {
      setCheck(await checkBriefDraft(buffer));
    } catch (err) {
      setCheckError(describeApiError(err));
    } finally {
      setChecking(false);
    }
  };

  const save = async (): Promise<void> => {
    if (!nameOk) return;
    const buffer = currentRaw();
    if (mode === 'form') setRaw(buffer);
    setSaving(true);
    setSaveError(null);
    setSaveResult(null);
    try {
      const res = await putBrief(targetName, { raw: buffer });
      setSaveResult(res);
      if (res.success) {
        setCheck(res.check);
        setCheckError(null);
        if (isNew) navigate(`/briefs/${encodeURIComponent(res.name)}`);
      }
    } catch (err) {
      setSaveError(describeApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    'w-full rounded border border-dust-700 bg-dust-900 px-2 py-1.5 font-mono text-sm text-dust-100 focus:border-petrol-dark focus:outline-none';

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-dust-100">
            {isNew ? 'New brief' : briefName}
          </h2>
          {dirty && <span className="text-xs text-amber-light">unsaved changes</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded border border-dust-700 text-xs">
            {(['form', 'raw'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`px-3 py-1.5 ${mode === m ? 'bg-petrol-tint text-petrol-light' : 'bg-dust-800 text-dust-500 hover:text-dust-100'}`}
              >
                {m === 'form' ? 'Form' : 'Raw text'}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={checking}
            onClick={() => void runCheck()}
            className="rounded border border-dust-700 bg-dust-800 px-3 py-1.5 text-sm text-dust-300 hover:border-petrol-dark hover:text-petrol-light disabled:opacity-50"
          >
            {checking ? 'Checking…' : 'Check coverage'}
          </button>
          <button
            type="button"
            disabled={saving || !nameOk}
            onClick={() => void save()}
            className="rounded border border-petrol-dark bg-petrol-tint px-3 py-1.5 text-sm text-petrol-light hover:bg-petrol-dark disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save & commit'}
          </button>
        </div>
      </header>

      {isNew && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-dust-300" htmlFor="brief-name">
            File name
          </label>
          <input
            id="brief-name"
            value={nameStem}
            onChange={(e) => setNameStem(e.target.value)}
            placeholder="MyNewLocation"
            className={`${fieldClass} max-w-xs`}
          />
          <span className="font-mono text-xs text-dust-500">.brief</span>
          {!nameOk && nameStem !== '' && (
            <span className="text-xs text-rust-light">letters, digits, _ and - only</span>
          )}
        </div>
      )}

      {mode === 'raw' ? (
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          spellCheck={false}
          rows={Math.max(20, raw.split('\n').length + 2)}
          className={`${fieldClass} leading-relaxed`}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <FormField
              label="Design notes (# comments)"
              multi
              value={form[NOTES_KEY] ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, [NOTES_KEY]: v }))}
              hint="The leading comment block — canon citations, intent, pacing decisions."
              fieldClass={fieldClass}
            />
            {RECOGNIZED_BRIEF_KEYS.map((key) => (
              <FormField
                key={key}
                label={key}
                multi={
                  MULTI_VALUE_BRIEF_KEYS.has(key.toLowerCase()) ||
                  (form[key] ?? '').includes('\n')
                }
                value={form[key] ?? ''}
                onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
                fieldClass={fieldClass}
              />
            ))}
          </div>
          <div className="space-y-3">
            {unrecognized.length > 0 && (
              <div className="rounded border border-dust-700 bg-dust-800 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-dust-500">
                  Unrecognised keys (preserved untouched)
                </p>
                <ul className="mt-2 space-y-1 font-mono text-xs text-dust-300">
                  {unrecognized.map((e, i) => (
                    <li key={`${e.key}-${i}`}>
                      {e.key}: {e.values.join(' | ')}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-dust-500">
                  location_brief.py echoes but does not check these — edit them in Raw text.
                </p>
              </div>
            )}
            <p className="text-xs text-dust-500">
              Multi-value keys take one value per line. Names are designer language — the check
              resolves them to RowNames and shows every resolution.
            </p>
          </div>
        </div>
      )}

      {saveError !== null && <ErrorBox error={saveError} />}
      {saveResult !== null && !saveResult.success && (
        <div className="rounded border border-rust-dark bg-rust-tint px-3 py-2 text-sm text-rust-light">
          Save refused ({saveResult.reason})
          {saveResult.detail !== undefined && (
            <span className="block font-mono text-xs">
              {typeof saveResult.detail === 'string'
                ? saveResult.detail
                : JSON.stringify(saveResult.detail)}
            </span>
          )}
        </div>
      )}
      {saveResult !== null && saveResult.success && (
        <div className="rounded border border-petrol-dark bg-petrol-tint px-3 py-2 text-sm text-petrol-light">
          Saved and committed as <code className="font-mono">{saveResult.commit}</code> — the
          check below is fresh from that save.
        </div>
      )}

      {checkError !== null && <ErrorBox error={checkError} />}
      {check !== null && (
        <section className="rounded border border-dust-700 bg-dust-800/50 p-4">
          <BriefCheckReport check={check} />
        </section>
      )}
    </div>
  );
}

function FormField({ label, value, onChange, multi, hint, fieldClass }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multi: boolean;
  hint?: string;
  fieldClass: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-dust-300">{label}</span>
      {multi ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          rows={Math.min(8, Math.max(2, value.split('\n').length + 1))}
          className={fieldClass}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className={fieldClass}
        />
      )}
      {hint !== undefined && <span className="mt-0.5 block text-[11px] text-dust-500">{hint}</span>}
    </label>
  );
}
