/**
 * WEB-008 — tests for the client-side type re-inference module against cases
 * lifted from the EISCORE repo's Scripts/EIS_DATA_TYPEINFERENCE_v1.py
 * (verified 2026-08-27, the script the WEB-001 manifest's ue5_type values
 * come from). Rule sources by line:
 *   - detection order:   infer_type()            lines 110-155
 *   - bool:              _is_boolean()           lines 157-164
 *   - int + width:       _is_integer 166-173, _infer_integer_type 229-243
 *   - float + width:     _is_float 175-182, _infer_float_type 245-263
 *   - array (>=80% ';'): _is_array 205-211, _infer_array_element_type 213-227
 *   - vector/rot/color:  patterns 68-70, checks 184-203 (threshold 0.95)
 *   - empty column:      lines 98-100 (FString, confidence 0)
 */

import { describe, expect, it } from 'vitest';
import {
  detectTypeChanges,
  inferColumnType,
  normalizeNumericValue,
} from '../typeInference';
import type { ManifestColumnType } from '../../api/types';

const col = (name: string, ue5_type: string): ManifestColumnType => ({
  name,
  ue5_type,
  pipe_multi: false,
  semicolon_hazard: false,
});

describe('inferColumnType — the four §5.4 cases', () => {
  it('bool: every value in the Python bool set, case-insensitive (lines 157-164)', () => {
    expect(inferColumnType(['true', 'false', 'TRUE'])).toBe('bool');
    expect(inferColumnType(['yes', 'no', 'Y', 'n'])).toBe('bool');
  });

  it('bool wins over int for a 1/0 column — bool is checked first (lines 129-140)', () => {
    expect(inferColumnType(['1', '0', '1', '0'])).toBe('bool');
  });

  it('bare-int column: uint8 iff 0 <= min and max < 256, else int32 (lines 229-243)', () => {
    expect(inferColumnType(['2', '7', '255'])).toBe('uint8');
    expect(inferColumnType(['2', '7', '256'])).toBe('int32');
    expect(inferColumnType(['-1', '7'])).toBe('int32');
  });

  it('numeric-with-decimal: float; double only above 6 decimals after stripping trailing zeros (lines 245-263)', () => {
    expect(inferColumnType(['250.0', '0.30', '12.5'])).toBe('float');
    // 0.1234560 -> '123456' after rstrip('0') = 6 decimals -> still float
    expect(inferColumnType(['0.1234560'])).toBe('float');
    expect(inferColumnType(['0.1234567'])).toBe('double');
  });

  it('a mixed bare-int + decimal column is float, not int (_is_integer fails on "0.5", lines 166-182)', () => {
    expect(inferColumnType(['1', '0.5', '3'])).toBe('float');
  });

  it("array: >= 80% of non-empty values contain ';' (line 211), element-typed (lines 213-227)", () => {
    // 4 of 5 = 80% — at the threshold, IS an array.
    expect(inferColumnType(['a;b', 'c;d', 'e;f', 'g;h', 'plain'])).toBe('TArray<FString>');
    // 3 of 4 = 75% — below the threshold, not an array.
    expect(inferColumnType(['a;b', 'c;d', 'e;f', 'plain'])).toBe('FString');
    expect(inferColumnType(['1;2', '3;4', '5;6', '7;8'])).toBe('TArray<int32>');
    expect(inferColumnType(['1.5;2.0', '3.25;4.0', '5.0;6.1', '7.5;8.0'])).toBe('TArray<float>');
  });

  it('empty values are excluded before detection (line 96); an all-empty column is FString (lines 98-100)', () => {
    expect(inferColumnType(['', '', ''])).toBe('FString');
    // Empties do not count against the bool check.
    expect(inferColumnType(['true', '', 'false'])).toBe('bool');
  });

  it('vector-shaped values (threshold 0.95, lines 68/184-189)', () => {
    expect(inferColumnType(['(X=1,Y=2,Z=3)', '(X=0,Y=0,Z=9.5)'])).toBe('FVector');
  });

  it('anything mixed falls back to FString (lines 153-155)', () => {
    expect(inferColumnType(['Concrete', '42', 'true'])).toBe('FString');
  });
});

describe('detectTypeChanges — charter §5.4 before-PUT comparison', () => {
  it('flags a float column whose edited values are all bare ints (float -> uint8)', () => {
    const changes = detectTypeChanges(
      [col('Name', 'FName'), col('Amount', 'float')],
      ['Name', 'Amount'],
      [
        ['A', '30'],
        ['B', '45'],
      ],
    );
    expect(changes).toEqual([{ column: 'Amount', oldType: 'float', newType: 'uint8' }]);
  });

  it('does not flag FName vs FString — the string family compares equal (rule 6 not reimplemented)', () => {
    const changes = detectTypeChanges(
      [col('Name', 'FName'), col('Description', 'FString')],
      ['Name', 'Description'],
      [['A', 'a longer free-text sentence, with punctuation']],
    );
    expect(changes).toEqual([]);
  });

  it('flags an int column crossing the uint8 boundary (uint8 -> int32)', () => {
    const changes = detectTypeChanges([col('Tier', 'uint8')], ['Tier'], [['300']]);
    expect(changes).toEqual([{ column: 'Tier', oldType: 'uint8', newType: 'int32' }]);
  });

  it('reports nothing when the edited data keeps every declared type', () => {
    const changes = detectTypeChanges(
      [col('Name', 'FName'), col('Amount', 'float'), col('bActive', 'bool')],
      ['Name', 'Amount', 'bActive'],
      [
        ['A', '30.5', 'true'],
        ['B', '45.0', 'false'],
      ],
    );
    expect(changes).toEqual([]);
  });
});

describe('normalizeNumericValue — decimal-format preservation', () => {
  it('appends .0 when a bare integer is committed into a float column (editing 250.0, typing 300 stores 300.0)', () => {
    expect(normalizeNumericValue('300', 'float')).toBe('300.0');
    expect(normalizeNumericValue('-4', 'double')).toBe('-4.0');
  });

  it('keeps a bare-integer column bare, and leaves decimals/non-numerics untouched', () => {
    expect(normalizeNumericValue('300', 'int32')).toBe('300');
    expect(normalizeNumericValue('300', 'uint8')).toBe('300');
    expect(normalizeNumericValue('300.5', 'float')).toBe('300.5');
    expect(normalizeNumericValue('n/a', 'float')).toBe('n/a');
    expect(normalizeNumericValue('300', null)).toBe('300');
  });
});
