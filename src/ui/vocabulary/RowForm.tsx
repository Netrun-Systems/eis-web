import React, { useMemo, useState } from 'react';
import type { ManifestColumnType, WorldgenFkOptions } from '../../api/types';

/**
 * WEB-006 — schema-driven row form. Fields are generated from the generated
 * table's header + manifest column types:
 *   - FK columns render as pickers over the target table's RowNames, legal
 *     wildcards, group tokens of the target's domain, and reference-blessed
 *     specials (SpaceTypes categories on adjacency columns, movement modes on
 *     TraversalType); pipe-multi FK columns as |-joined chips.
 *   - *Cm / *Cm2 columns take metres / m² and store the ×100 / ×10000 value
 *     (the pipeline's own convention — UE is centimetre-native).
 *   - numeric columns render as number inputs; everything else as text.
 * RowName enforces the stem's prefix, derived from existing rows upstream.
 */

const NUMBER_UE5_TYPES = new Set([
  'float',
  'double',
  'int8',
  'int16',
  'int32',
  'int64',
  'uint8',
  'uint16',
  'uint32',
]);

type FieldKind = 'rowname' | 'fk' | 'meters' | 'sqmeters' | 'number' | 'text';

export interface RowFormProps {
  columns: string[];
  columnTypes: ManifestColumnType[];
  fkOptions: WorldgenFkOptions[];
  wildcards: string[];
  /** The stem's RowName prefix (e.g. "SPC_"), derived from existing rows. */
  prefix: string;
  /** RowNames that already exist (base + ext + other web rows) — collisions refused. */
  takenNames: Set<string>;
  /** Aligned to columns; empty strings for a fresh row. */
  initial: string[];
  /** Non-null when editing an existing web row (its RowName may stay taken). */
  editingName: string | null;
  onSubmit: (values: string[]) => void;
  onCancel: () => void;
  /** "Copy values from an existing row" — parent resolves the full row. */
  onCopyFrom?: (rowName: string) => Promise<string[] | null>;
  copyFromNames?: string[];
}

export function RowForm(props: RowFormProps) {
  const {
    columns,
    columnTypes,
    fkOptions,
    wildcards,
    prefix,
    takenNames,
    initial,
    editingName,
    onSubmit,
    onCancel,
    onCopyFrom,
    copyFromNames,
  } = props;
  const [values, setValues] = useState<string[]>(() =>
    columns.map((_, i) => initial[i] ?? ''),
  );
  const [copyBusy, setCopyBusy] = useState(false);

  const typeFor = (name: string): ManifestColumnType | undefined =>
    columnTypes.find((c) => c.name === name);
  const fkFor = (name: string): WorldgenFkOptions | undefined =>
    fkOptions.find((o) => o.column === name);

  const kindFor = (name: string, index: number): FieldKind => {
    if (index === 0) return 'rowname';
    if (fkFor(name)) return 'fk';
    if (name.endsWith('Cm2')) return 'sqmeters';
    if (name.endsWith('Cm')) return 'meters';
    if (NUMBER_UE5_TYPES.has(typeFor(name)?.ue5_type ?? '')) return 'number';
    return 'text';
  };

  const rowName = values[0] ?? '';
  const nameError = useMemo(() => {
    if (rowName === '') return 'RowName is required';
    if (prefix !== '' && !rowName.startsWith(prefix)) {
      return `RowName must start with the stem prefix ${prefix}`;
    }
    if (rowName !== editingName && takenNames.has(rowName)) {
      return `${rowName} already exists — amend existing rows with a patch instead`;
    }
    return null;
  }, [rowName, prefix, takenNames, editingName]);

  const setValue = (index: number, v: string) => {
    setValues((prev) => {
      const next = [...prev];
      const before = next[index];
      next[index] = v;
      // Convention: column 1 is the ID, repeating the RowName. Keep it in
      // sync while it still mirrors the old name (or is empty).
      if (index === 0 && columns.length > 1 && columns[1].endsWith('ID')) {
        if (next[1] === '' || next[1] === before) next[1] = v;
      }
      return next;
    });
  };

  const doCopyFrom = async (name: string) => {
    if (!onCopyFrom || name === '') return;
    setCopyBusy(true);
    try {
      const full = await onCopyFrom(name);
      if (full) {
        setValues((prev) => {
          // Keep the identity fields the user already typed; copy the rest.
          const next = columns.map((_, i) => full[i] ?? '');
          next[0] = prev[0];
          if (columns.length > 1 && columns[1].endsWith('ID')) next[1] = prev[1];
          const displayI = columns.indexOf('DisplayName');
          if (displayI >= 0 && (prev[displayI] ?? '') !== '') next[displayI] = prev[displayI];
          return next;
        });
      }
    } finally {
      setCopyBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded border border-petrol/40 dark:border-petrol-dark bg-dust-0 dark:bg-dust-800 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <h4 className="text-sm font-semibold text-dust-900 dark:text-dust-100">
          {editingName !== null ? `Edit web row ${editingName}` : 'New web row'}
        </h4>
        {onCopyFrom && copyFromNames && copyFromNames.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-dust-600 dark:text-dust-400">
            copy values from
            <select
              disabled={copyBusy}
              defaultValue=""
              onChange={(e) => void doCopyFrom(e.target.value)}
              className="rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-900 px-1.5 py-1 font-mono text-xs text-dust-600 dark:text-dust-300"
            >
              <option value="">—</option>
              {copyFromNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {copyBusy && <span>loading…</span>}
          </label>
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-2">
        {columns.map((col, i) => {
          const kind = kindFor(col, i);
          return (
            <Field
              key={col}
              column={col}
              kind={kind}
              ue5Type={typeFor(col)?.ue5_type ?? null}
              pipeMulti={typeFor(col)?.pipe_multi ?? false}
              fk={fkFor(col)}
              wildcards={wildcards}
              prefix={prefix}
              value={values[i] ?? ''}
              error={i === 0 ? nameError : null}
              onChange={(v) => setValue(i, v)}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={nameError !== null}
          onClick={() => onSubmit(values)}
          className="rounded border border-petrol/40 dark:border-petrol-dark bg-petrol-wash dark:bg-petrol-tint px-3 py-1 text-sm text-petrol-ink dark:text-petrol-light hover:bg-petrol/20 dark:hover:bg-petrol-dark disabled:cursor-not-allowed disabled:border-dust-200 dark:disabled:border-dust-700 disabled:bg-dust-100 dark:disabled:bg-dust-800 disabled:text-dust-500"
        >
          {editingName !== null ? 'Update row' : 'Add row'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-dust-200 dark:border-dust-700 px-3 py-1 text-sm text-dust-600 dark:text-dust-300 hover:bg-dust-100 dark:hover:bg-dust-800/60"
        >
          Cancel
        </button>
        <span className="text-xs text-dust-600 dark:text-dust-400">Nothing is written until you Save.</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Field({
  column,
  kind,
  ue5Type,
  pipeMulti,
  fk,
  wildcards,
  prefix,
  value,
  error,
  onChange,
}: {
  column: string;
  kind: FieldKind;
  ue5Type: string | null;
  pipeMulti: boolean;
  fk: WorldgenFkOptions | undefined;
  wildcards: string[];
  prefix: string;
  value: string;
  error: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-0.5 flex items-baseline gap-1.5">
        <span className="font-semibold text-dust-900 dark:text-dust-100">{column}</span>
        {ue5Type !== null && <span className="font-mono text-[10px] text-dust-600 dark:text-dust-400">{ue5Type}</span>}
        {fk && (
          <span className="font-mono text-[10px] text-petrol-ink dark:text-petrol-light">→ {fk.targetTable}</span>
        )}
      </span>
      {kind === 'fk' && fk ? (
        pipeMulti ? (
          <FkMultiPicker fk={fk} wildcards={wildcards} value={value} onChange={onChange} />
        ) : (
          <FkSinglePicker fk={fk} wildcards={wildcards} value={value} onChange={onChange} />
        )
      ) : kind === 'meters' || kind === 'sqmeters' ? (
        <UnitField kind={kind} value={value} onChange={onChange} />
      ) : kind === 'number' ? (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-900 px-2 py-1 font-mono text-xs text-dust-600 dark:text-dust-300"
        />
      ) : (
        <input
          type="text"
          value={value}
          placeholder={kind === 'rowname' ? `${prefix}…` : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded border px-2 py-1 font-mono text-xs text-dust-600 dark:text-dust-300 ${
            error !== null ? 'border-rust/50 dark:border-rust-dark bg-rust-wash/50 dark:bg-rust-tint/40' : 'border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-900'
          }`}
        />
      )}
      {error !== null && <span className="mt-0.5 block text-rust-dark dark:text-rust-light">{error}</span>}
    </label>
  );
}

/** Designer types metres (or m²); the stored value is the ×100 (×10000) cm
 * figure the pipeline expects, always written with a decimal so the column
 * infers float. */
function UnitField({
  kind,
  value,
  onChange,
}: {
  kind: 'meters' | 'sqmeters';
  value: string;
  onChange: (v: string) => void;
}) {
  const factor = kind === 'meters' ? 100 : 10000;
  const unit = kind === 'meters' ? 'm' : 'm²';
  const shown = value === '' || Number.isNaN(Number(value)) ? '' : String(Number(value) / factor);
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="number"
        step="0.1"
        value={shown}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' || Number.isNaN(Number(v)) ? '' : (Number(v) * factor).toFixed(1));
        }}
        className="w-full rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-900 px-2 py-1 font-mono text-xs text-dust-600 dark:text-dust-300"
      />
      <span className="whitespace-nowrap text-dust-600 dark:text-dust-400">
        {unit} <span className="font-mono">= {value === '' ? '—' : value} cm{kind === 'sqmeters' ? '²' : ''}</span>
      </span>
    </span>
  );
}

function optionGroups(fk: WorldgenFkOptions, wildcards: string[]) {
  return [
    { label: `${fk.targetTable} rows`, options: fk.rowNames },
    { label: 'group tokens', options: fk.groupTokens },
    { label: 'wildcards', options: wildcards.filter((w) => w !== '') },
    { label: 'special', options: fk.extras },
  ].filter((g) => g.options.length > 0);
}

function FkSinglePicker({
  fk,
  wildcards,
  value,
  onChange,
}: {
  fk: WorldgenFkOptions;
  wildcards: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const groups = optionGroups(fk, wildcards);
  const known = groups.some((g) => g.options.includes(value));
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-900 px-1.5 py-1 font-mono text-xs text-dust-600 dark:text-dust-300"
    >
      <option value="">(empty)</option>
      {!known && value !== '' && <option value={value}>{value} (current)</option>}
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Pipe-multi FK column: the value is |-joined tokens, edited as chips. */
export function FkMultiPicker({
  fk,
  wildcards,
  value,
  onChange,
}: {
  fk: WorldgenFkOptions;
  wildcards: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const tokens = value.split('|').filter((t) => t !== '');
  const groups = optionGroups(fk, wildcards);
  const add = (tok: string) => {
    if (tok === '' || tokens.includes(tok)) return;
    onChange([...tokens, tok].join('|'));
  };
  const remove = (tok: string) => {
    onChange(tokens.filter((t) => t !== tok).join('|'));
  };
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {tokens.length === 0 && <span className="text-dust-600 dark:text-dust-400">(empty)</span>}
        {tokens.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded border border-petrol/40 dark:border-petrol-dark bg-petrol-wash dark:bg-petrol-tint px-1.5 py-0.5 font-mono text-[11px] text-petrol-ink dark:text-petrol-light"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              title={`remove ${t}`}
              className="text-petrol-ink dark:text-petrol-light hover:text-dust-900 dark:hover:text-dust-100"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <select
        value=""
        onChange={(e) => add(e.target.value)}
        className="w-full rounded border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-900 px-1.5 py-1 font-mono text-xs text-dust-600 dark:text-dust-300"
      >
        <option value="">+ add {fk.column} value…</option>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options
              .filter((o) => !tokens.includes(o))
              .map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
