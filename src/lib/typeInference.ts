/**
 * WEB-008 — client-side column type re-inference, mirroring the EISCORE
 * repo's Scripts/EIS_DATA_TYPEINFERENCE_v1.py (the script the WEB-001
 * manifest's ue5_type values come from — export_table_manifest.py imports
 * that engine directly). Charter §5.4: adding rows can re-infer a column's
 * type, so before a PUT we re-infer the EDITED data and warn when a column's
 * type would change.
 *
 * Rule sources (EIS_DATA_TYPEINFERENCE_v1.py, verified 2026-08-27):
 *   - detection ORDER: vector/rotator/color -> array -> bool -> int -> float
 *     -> string (infer_type, lines 110-155). Order matters: a column of
 *     "1"/"0" is bool, not int.
 *   - vector/rotator/color: regex match ratio >= 0.95 (lines 68-70, 184-203)
 *   - array: >= 80% of non-empty values contain ';' (_is_array, lines
 *     205-211); element type from the first 20 values (lines 213-227)
 *   - bool: every value in {true,false,1,0,yes,no,y,n}, case-insensitive
 *     (_is_boolean, lines 157-164)
 *   - int: every value parses as int; uint8 when 0 <= min and max < 256,
 *     else int32 (_is_integer 166-173, _infer_integer_type 229-243)
 *   - float: every value parses as float; double when any value has > 6
 *     decimals after stripping trailing zeros (_is_float 175-182,
 *     _infer_float_type 245-263)
 *   - empty column -> FString, and the FName-vs-FString heuristics (rule 6,
 *     lines 265-282) are NOT reimplemented here: FName/FString/FText are one
 *     family for change detection — the four §5.4 cases never cross it.
 */

import type { ManifestColumnType } from '../api/types';

export type InferredType =
  | 'bool'
  | 'uint8'
  | 'int32'
  | 'float'
  | 'double'
  | 'FVector'
  | 'FRotator'
  | 'FLinearColor'
  | 'TArray<FString>'
  | 'TArray<int32>'
  | 'TArray<float>'
  | 'FString';

// Patterns from EIS_DATA_TYPEINFERENCE_v1.py lines 68-70 (re.match = anchored
// at the start only).
const VECTOR_RE = /^\(X=[^,]+,Y=[^,]+,Z=[^)]+\)/i;
const ROTATOR_RE = /^\(P=[^,]+,Y=[^,]+,R=[^)]+\)/i;
const COLOR_RE = /^\(R=[^,]+,G=[^,]+,B=[^,]+,A=[^)]+\)/i;
const STRUCT_CONFIDENCE = 0.95; // confidence_threshold, line 75
const ARRAY_DENSITY = 0.8; // _is_array, line 211

const BOOL_VALUES = new Set(['true', 'false', '1', '0', 'yes', 'no', 'y', 'n']); // line 159

/** Python int(v): optional sign + digits (we ignore Python's underscore quirk). */
const INT_RE = /^[+-]?\d+$/;
/** Python float(v): decimals, scientific notation, inf/nan. */
const FLOAT_RE = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$|^[+-]?(inf|infinity|nan)$/i;

const isInt = (v: string): boolean => INT_RE.test(v);
const isFloat = (v: string): boolean => FLOAT_RE.test(v);

function ratioMatching(values: string[], re: RegExp): number {
  if (values.length === 0) return 0;
  return values.filter((v) => re.test(v)).length / values.length;
}

/** _infer_float_type lines 245-263: decimals after '.', trailing zeros
 * stripped, > 6 means double. (The Python counts on the raw string, so an
 * exponent suffix rides along — mirrored faithfully.) */
function floatWidth(values: string[]): 'float' | 'double' {
  let maxDecimals = 0;
  for (const v of values) {
    const dot = v.indexOf('.');
    if (dot >= 0) {
      const decimals = v.slice(dot + 1).replace(/0+$/, '').length;
      maxDecimals = Math.max(maxDecimals, decimals);
    }
  }
  return maxDecimals > 6 ? 'double' : 'float';
}

/** _infer_integer_type lines 229-243: uint8 iff 0 <= min and max < 256. */
function intWidth(values: string[]): 'uint8' | 'int32' {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    const n = parseInt(v, 10);
    if (n < min) min = n;
    if (n > max) max = n;
  }
  return min >= 0 && max < 256 ? 'uint8' : 'int32';
}

/** _infer_array_element_type lines 213-227: sample the first 20 arrays. */
function arrayElementType(values: string[]): InferredType {
  const elements: string[] = [];
  for (const v of values.slice(0, 20)) {
    for (const e of v.split(';')) {
      const t = e.trim();
      if (t !== '') elements.push(t);
    }
  }
  if (elements.length > 0 && elements.every(isInt)) return 'TArray<int32>';
  if (elements.length > 0 && elements.every(isFloat)) return 'TArray<float>';
  return 'TArray<FString>';
}

/** Infer the UE5 type the EISCORE engine would assign this column's values.
 * Same order of specificity as infer_type() lines 110-155. */
export function inferColumnType(rawValues: string[]): InferredType {
  const values = rawValues.map((v) => v.trim()).filter((v) => v !== ''); // line 96
  if (values.length === 0) return 'FString'; // lines 98-100

  if (ratioMatching(values, VECTOR_RE) >= STRUCT_CONFIDENCE) return 'FVector';
  if (ratioMatching(values, ROTATOR_RE) >= STRUCT_CONFIDENCE) return 'FRotator';
  if (ratioMatching(values, COLOR_RE) >= STRUCT_CONFIDENCE) return 'FLinearColor';

  const semicolonDensity = values.filter((v) => v.includes(';')).length / values.length;
  if (semicolonDensity >= ARRAY_DENSITY) return arrayElementType(values);

  if (values.every((v) => BOOL_VALUES.has(v.toLowerCase()))) return 'bool';
  if (values.every(isInt)) return intWidth(values);
  if (values.every(isFloat)) return floatWidth(values);
  return 'FString';
}

/** FName-vs-FString is a heuristic we deliberately do not reimplement (rule 6
 * of the Python); the whole string-ish family compares equal. */
const STRING_FAMILY = new Set(['FString', 'FName', 'FText']);

export interface TypeChange {
  column: string;
  oldType: string;
  newType: string;
}

/**
 * Charter §5.4 check: compare the manifest's inferred type per column against
 * a re-inference of the edited payload. Returns every column whose type would
 * change — each one means "regenerate structs and diff property types before
 * importing".
 */
export function detectTypeChanges(
  columnTypes: ManifestColumnType[],
  columns: string[],
  rows: string[][],
): TypeChange[] {
  const changes: TypeChange[] = [];
  columns.forEach((col, ci) => {
    const manifestType =
      columnTypes.find((c) => c.name === col)?.ue5_type ?? columnTypes[ci]?.ue5_type;
    if (manifestType === undefined) return; // brand-new column: nothing to compare against
    const inferred = inferColumnType(rows.map((r) => r[ci] ?? ''));
    if (inferred === manifestType) return;
    if (STRING_FAMILY.has(inferred) && STRING_FAMILY.has(manifestType)) return;
    changes.push({ column: col, oldType: manifestType, newType: inferred });
  });
  return changes;
}

/**
 * Decimal-format preservation (charter §5: "write continuous numerics with a
 * decimal or they infer uint8/int32"): committing a bare integer into a
 * float/double column appends `.0`; bare-integer columns stay bare; anything
 * non-numeric passes through untouched.
 */
export function normalizeNumericValue(value: string, ue5Type: string | null): string {
  if (ue5Type !== 'float' && ue5Type !== 'double') return value;
  const trimmed = value.trim();
  if (INT_RE.test(trimmed)) return `${trimmed}.0`;
  return value;
}
