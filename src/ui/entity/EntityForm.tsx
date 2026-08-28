import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ManifestTable, TablePutResponse, TablePutSuccess } from '../../api/types';
import { refusalToFindings } from '../../lib/guardHints';
import { detectTypeChanges, normalizeNumericValue, type TypeChange } from '../../lib/typeInference';
import {
  applyRowEdit,
  resolveReferenceTokens,
  type ReferenceSpec,
  type Section,
} from '../../lib/entityForm';
import { FindingListItem } from '../validation/findings';

/**
 * WEB-011 — the entity form: ONE row of an authored table, rendered as
 * titled sections over the real columns. Fields are typed from the manifest
 * (bool selects, numeric input modes with decimal preservation, multi-value
 * chip editors); reference columns render as links plus pickers where the
 * target is unambiguous from the data. Dirty tracking per field; Save
 * reconstructs the WHOLE table with just this row changed (the server
 * contract is table-level) and renders the same guard refusals as the grid.
 */

export interface ReferenceBinding {
  spec: ReferenceSpec;
  /** The target table's column-0 keys. */
  keys: ReadonlySet<string>;
  /** Key → display label (the spec's labelColumn). */
  labels: ReadonlyMap<string, string>;
  /** Measured over the whole source table — picker offered only when true. */
  pickerViable: boolean;
}

export function EntityForm({
  entry,
  columns,
  rows,
  rowIndex,
  sections,
  references,
  saveRow,
  contractNote,
}: {
  entry: ManifestTable;
  columns: string[];
  /** The WHOLE loaded table (needed to rebuild the table-level PUT). */
  rows: string[][];
  /** Index of the row this form edits. */
  rowIndex: number;
  sections: Section[];
  /** Column name → reference binding, for the columns that link out. */
  references?: ReadonlyMap<string, ReferenceBinding>;
  /** PUT the reconstructed table; resolves with the server's exact response. */
  saveRow: (allRows: string[][], message?: string) => Promise<TablePutResponse>;
  /** The table-level-contract note shown in the save bar. */
  contractNote: string;
}) {
  const original = useMemo(
    () => padRow(rows[rowIndex] ?? [], columns.length),
    [rows, rowIndex, columns.length],
  );
  const [values, setValues] = useState<string[]>(original);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<TablePutSuccess | null>(null);
  const [saveFailure, setSaveFailure] = useState<{ reason: string; detail: unknown } | null>(null);
  const [pendingTypeChanges, setPendingTypeChanges] = useState<TypeChange[] | null>(null);

  // A reload upstream (after save) hands us a fresh snapshot — reset to it.
  useEffect(() => {
    setValues(original);
    setPendingTypeChanges(null);
  }, [original]);

  const dirtyIndexes = useMemo(() => {
    const out: number[] = [];
    values.forEach((v, i) => {
      if (v !== (original[i] ?? '')) out.push(i);
    });
    return out;
  }, [values, original]);
  const dirty = dirtyIndexes.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const typeFor = (ci: number): string | null => {
    const byName = entry.column_types.find((c) => c.name === columns[ci]);
    if (byName) return byName.ue5_type;
    return entry.column_types[ci]?.ue5_type ?? null;
  };
  const pipeMultiFor = (ci: number): boolean =>
    entry.column_types.find((c) => c.name === columns[ci])?.pipe_multi === true;

  const setValue = (ci: number, v: string) => {
    setValues((prev) => {
      const next = [...prev];
      next[ci] = v;
      return next;
    });
    setSaveFailure(null);
    setSaveSuccess(null);
    setPendingTypeChanges(null);
  };

  const buildAllRows = (): string[][] => applyRowEdit(rows, rowIndex, values);

  const doSave = async () => {
    setSaving(true);
    setSaveFailure(null);
    setPendingTypeChanges(null);
    try {
      const result = await saveRow(buildAllRows(), message.trim() !== '' ? message.trim() : undefined);
      if (result.success) {
        setSaveSuccess(result);
        setMessage('');
      } else {
        setSaveFailure({ reason: result.reason, detail: result.detail });
      }
    } catch (e) {
      setSaveFailure({ reason: 'request_failed', detail: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const requestSave = () => {
    // Charter §5.4 — same rule as the grid: a row edit can re-infer a
    // column's type; confirm explicitly before proceeding.
    const changes = detectTypeChanges(entry.column_types, columns, buildAllRows());
    if (changes.length > 0) {
      setPendingTypeChanges(changes);
      return;
    }
    void doSave();
  };

  const discard = () => {
    if (!dirty) return;
    if (!window.confirm('Discard the edits on this row and restore the loaded values?')) return;
    setValues(original);
    setSaveFailure(null);
    setPendingTypeChanges(null);
  };

  const refusalFindings = useMemo(
    () => (saveFailure === null ? [] : refusalToFindings(saveFailure.reason, saveFailure.detail)),
    [saveFailure],
  );

  const key0 = original[0] ?? '';
  const defaultMessage = `eisweb: edit ${entry.stem} row ${key0}`;

  return (
    <div className="space-y-5">
      {saveSuccess !== null && (
        <div className="rounded border border-petrol/40 bg-petrol-wash px-3 py-2 text-sm text-petrol-ink dark:border-petrol-dark dark:bg-petrol-tint dark:text-petrol-light">
          Saved — commit <code className="font-mono">{saveSuccess.commit}</code>
        </div>
      )}

      {sections.map((section) => (
        <section key={section.title} className="space-y-2">
          <h3 className="flex items-baseline gap-2 border-b border-dust-200 pb-1 text-sm font-semibold text-dust-900 dark:border-dust-700 dark:text-dust-100">
            {section.title}
            <span className="font-mono text-[11px] font-normal tabular-nums text-dust-600 dark:text-dust-400">
              {section.indexes.length} column{section.indexes.length === 1 ? '' : 's'}
            </span>
          </h3>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {section.indexes.map((ci) => (
              <Field
                key={ci}
                column={columns[ci]}
                ue5={typeFor(ci)}
                pipeMulti={pipeMultiFor(ci)}
                value={values[ci] ?? ''}
                originalValue={original[ci] ?? ''}
                binding={references?.get(columns[ci])}
                onChange={(v) => setValue(ci, v)}
              />
            ))}
          </div>
        </section>
      ))}

      {pendingTypeChanges !== null && (
        <div className="space-y-2 rounded border border-amber/50 bg-amber-wash px-3 py-2 text-sm text-amber-ink dark:border-amber-dark dark:bg-amber-tint dark:text-amber-light">
          <p className="font-semibold">
            This edit would change {pendingTypeChanges.length} column type
            {pendingTypeChanges.length === 1 ? '' : 's'} on re-import:
          </p>
          <ul className="font-mono text-xs">
            {pendingTypeChanges.map((c) => (
              <li key={c.column}>
                {c.column}: {c.oldType} &rarr; {c.newType}
              </li>
            ))}
          </ul>
          <p className="text-xs">
            Editing rows can re-infer a column&apos;s type — regenerate structs and diff property
            types before importing.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void doSave()} className="btn-primary px-2.5 py-1 text-xs">
              Proceed with save
            </button>
            <button
              type="button"
              onClick={() => setPendingTypeChanges(null)}
              className="btn-quiet px-2.5 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {saveFailure !== null && (
        <div className="space-y-1 rounded border border-rust/50 bg-rust-wash px-3 py-2 dark:border-rust-dark dark:bg-rust-tint">
          <p className="text-sm font-semibold text-rust-dark dark:text-rust-light">
            Save refused — <code className="font-mono">{saveFailure.reason}</code>. Your edits are
            preserved below.
          </p>
          <ul className="divide-y divide-dust-200/70 dark:divide-dust-700/60">
            {refusalFindings.map((f, i) => (
              <FindingListItem key={`${f.code}-${f.row ?? ''}-${f.column ?? ''}-${i}`} finding={f} />
            ))}
          </ul>
        </div>
      )}

      {/* Persistent save bar — same surface language as the grid editor. */}
      <div
        className={`sticky bottom-0 flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-sm ${
          dirty
            ? 'border-petrol/40 bg-dust-0 text-dust-800 dark:border-petrol-dark dark:bg-dust-800 dark:text-dust-100'
            : 'border-dust-200 bg-dust-0 text-dust-500 dark:border-dust-700 dark:bg-dust-800'
        }`}
      >
        <span className="font-mono text-xs tabular-nums">
          {dirtyIndexes.length} field{dirtyIndexes.length === 1 ? '' : 's'} edited
        </span>
        <span className="text-xs text-dust-600 dark:text-dust-400">{contractNote}</span>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={defaultMessage}
          title="Commit message (optional — placeholder shows the default)"
          className="field min-w-52 flex-1 px-2 py-1 font-mono text-xs"
        />
        <button
          type="button"
          onClick={requestSave}
          disabled={!dirty || saving || pendingTypeChanges !== null}
          className="btn-primary px-2.5 py-1 text-xs"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={discard}
          disabled={!dirty || saving}
          className="btn-quiet px-2.5 py-1 text-xs"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One field.
// ---------------------------------------------------------------------------

function Field({
  column,
  ue5,
  pipeMulti,
  value,
  originalValue,
  binding,
  onChange,
}: {
  column: string;
  ue5: string | null;
  pipeMulti: boolean;
  value: string;
  originalValue: string;
  binding?: ReferenceBinding;
  onChange: (v: string) => void;
}) {
  const dirty = value !== originalValue;
  const isArray = ue5 !== null && ue5.startsWith('TArray');
  const separator = pipeMulti ? '|' : isArray ? ';' : null;

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <label className="text-xs font-semibold text-dust-800 dark:text-dust-200">{column}</label>
        {ue5 !== null && (
          <span className="font-mono text-[10px] text-dust-600 dark:text-dust-400">{ue5}</span>
        )}
        {binding !== undefined && (
          <Link
            to={`/tables/${binding.spec.targetPath}`}
            className="font-mono text-[10px] text-petrol-ink hover:underline dark:text-petrol-light"
            title={`Open the referenced table ${binding.spec.targetLabel}`}
          >
            &rarr; {binding.spec.targetLabel}
          </Link>
        )}
        {binding?.spec.deprecationNote !== undefined && (
          <span className="chip chip-amber" title="See WG-201 — the HeadPool pipeline is deprecated; surfaced here, not built on">
            {binding.spec.deprecationNote}
          </span>
        )}
        {dirty && <span className="chip chip-petrol">edited</span>}
      </div>

      {binding !== undefined && binding.pickerViable ? (
        binding.spec.separator !== null ? (
          <MultiReferenceEditor value={value} binding={binding} onChange={onChange} dirty={dirty} />
        ) : (
          <SingleReferencePicker value={value} binding={binding} onChange={onChange} dirty={dirty} />
        )
      ) : separator !== null ? (
        <ChipListEditor value={value} separator={separator} onChange={onChange} dirty={dirty} />
      ) : ue5 === 'bool' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass(dirty)}>
          {!['true', 'false'].includes(value) && (
            <option value={value}>{value === '' ? '(empty)' : value}</option>
          )}
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : isLongText(ue5, originalValue) ? (
        <textarea
          value={value}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClass(dirty)}
        />
      ) : (
        <input
          value={value}
          inputMode={inputModeFor(ue5)}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            const normalized = normalizeNumericValue(value, ue5);
            if (normalized !== value) onChange(normalized);
          }}
          className={fieldClass(dirty)}
        />
      )}
    </div>
  );
}

/** Single-value reference — a picker over the target's keys, with the current
 * value kept selectable even when it does not resolve. */
function SingleReferencePicker({
  value,
  binding,
  onChange,
  dirty,
}: {
  value: string;
  binding: ReferenceBinding;
  onChange: (v: string) => void;
  dirty: boolean;
}) {
  const options = useMemo(() => [...binding.keys].sort(), [binding.keys]);
  const unresolved = value !== '' && !binding.keys.has(value);
  return (
    <div className="space-y-0.5">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass(dirty)}>
        <option value="">(empty)</option>
        {unresolved && <option value={value}>{value} (unresolved)</option>}
        {options.map((k) => (
          <option key={k} value={k}>
            {binding.labels.get(k) !== undefined ? `${k} — ${binding.labels.get(k)}` : k}
          </option>
        ))}
      </select>
      {unresolved && (
        <p className="text-[11px] text-amber-ink dark:text-amber-light">
          Current value does not resolve in {binding.spec.targetLabel}.
        </p>
      )}
    </div>
  );
}

/** Multi-value reference — resolved tokens render as linked chips; add from a
 * picker over the target's keys; unresolved tokens stay visible and removable. */
function MultiReferenceEditor({
  value,
  binding,
  onChange,
  dirty,
}: {
  value: string;
  binding: ReferenceBinding;
  onChange: (v: string) => void;
  dirty: boolean;
}) {
  const sep = binding.spec.separator ?? ';';
  const tokens = resolveReferenceTokens(value, sep, binding.keys, binding.labels);
  const options = useMemo(() => [...binding.keys].sort(), [binding.keys]);

  const removeAt = (i: number) => {
    const next = tokens.filter((_, j) => j !== i).map((t) => t.token);
    onChange(next.join(sep));
  };
  const add = (token: string) => {
    if (token === '') return;
    onChange([...tokens.map((t) => t.token), token].join(sep));
  };

  return (
    <div className={`space-y-1 rounded border px-2 py-1.5 ${dirty ? 'border-petrol/40 bg-petrol-wash/40 dark:border-petrol-dark dark:bg-petrol-tint/30' : 'border-dust-200 dark:border-dust-700'}`}>
      <div className="flex flex-wrap items-center gap-1">
        {tokens.length === 0 && (
          <span className="text-xs text-dust-500 dark:text-dust-500">(empty)</span>
        )}
        {tokens.map((t, i) => (
          <span
            key={`${t.token}-${i}`}
            className={`chip ${t.resolved ? 'chip-petrol' : 'chip-amber'}`}
            title={t.resolved ? undefined : `Does not resolve in ${binding.spec.targetLabel}`}
          >
            {t.resolved ? (
              <Link to={`/tables/${binding.spec.targetPath}`} className="hover:underline">
                {t.token}
                {t.label !== null ? ` ${t.label}` : ''}
              </Link>
            ) : (
              <>{t.token} ?</>
            )}
            <button
              type="button"
              onClick={() => removeAt(i)}
              title={`Remove ${t.token}`}
              className="ml-1 font-bold hover:text-rust-dark dark:hover:text-rust-light"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <select value="" onChange={(e) => add(e.target.value)} className="field w-full px-2 py-1 font-mono text-xs">
        <option value="">+ add from {binding.spec.targetLabel}…</option>
        {options.map((k) => (
          <option key={k} value={k}>
            {binding.labels.get(k) !== undefined ? `${k} — ${binding.labels.get(k)}` : k}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Plain multi-value chip editor for TArray (';') and pipe_multi ('|')
 * columns without a reference target. */
function ChipListEditor({
  value,
  separator,
  onChange,
  dirty,
}: {
  value: string;
  separator: string;
  onChange: (v: string) => void;
  dirty: boolean;
}) {
  const [draft, setDraft] = useState('');
  const tokens = value === '' ? [] : value.split(separator).filter((t) => t !== '');

  const removeAt = (i: number) => onChange(tokens.filter((_, j) => j !== i).join(separator));
  const add = () => {
    const t = draft.trim();
    if (t === '') return;
    onChange([...tokens, t].join(separator));
    setDraft('');
  };

  return (
    <div className={`space-y-1 rounded border px-2 py-1.5 ${dirty ? 'border-petrol/40 bg-petrol-wash/40 dark:border-petrol-dark dark:bg-petrol-tint/30' : 'border-dust-200 dark:border-dust-700'}`}>
      <div className="flex flex-wrap items-center gap-1">
        {tokens.length === 0 && (
          <span className="text-xs text-dust-500 dark:text-dust-500">(empty)</span>
        )}
        {tokens.map((t, i) => (
          <span key={`${t}-${i}`} className="chip chip-dust">
            {t}
            <button
              type="button"
              onClick={() => removeAt(i)}
              title={`Remove ${t}`}
              className="ml-1 font-bold hover:text-rust-dark dark:hover:text-rust-light"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
          if (e.key === separator) {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={`add value (${separator}-separated)`}
        className="field w-full px-2 py-1 font-mono text-xs"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function padRow(row: string[], width: number): string[] {
  if (row.length >= width) return [...row];
  return [...row, ...Array<string>(width - row.length).fill('')];
}

function inputModeFor(ue5: string | null): 'decimal' | 'numeric' | 'text' {
  if (ue5 === 'float' || ue5 === 'double') return 'decimal';
  if (ue5 === 'uint8' || ue5 === 'int32') return 'numeric';
  return 'text';
}

function isLongText(ue5: string | null, originalValue: string): boolean {
  const stringish = ue5 === null || ue5 === 'FString' || ue5 === 'FText';
  return stringish && originalValue.length > 60;
}

function fieldClass(dirty: boolean): string {
  return `field w-full px-2 py-1 font-mono text-xs ${
    dirty ? 'ring-1 ring-petrol dark:ring-petrol-dark' : ''
  }`;
}
