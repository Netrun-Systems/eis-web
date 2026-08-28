/**
 * WEB-008 — tests for the pure editing-state helpers: the live client-side
 * guard hints (thresholds must mirror server/guards.ts exactly), the
 * dirty-diff computation behind the save bar, and the refusal -> Finding[]
 * mapping.
 */

import { describe, expect, it } from 'vitest';
import {
  computeDirtyStats,
  findDuplicateKeys,
  findSemicolonHazards,
  initEditRows,
  isCellDirty,
  isRawReadEntry,
  refusalToFindings,
  type EditRow,
} from '../guardHints';

describe('findDuplicateKeys — mirrors server collectKeyCollisions', () => {
  it('groups every colliding column-0 key with its 1-based row numbers', () => {
    const groups = findDuplicateKeys([
      ['A', 'x'],
      ['B', 'y'],
      ['A', 'z'],
      ['A', 'w'],
    ]);
    expect(groups).toEqual([{ key: 'A', rows: [1, 3, 4] }]);
  });

  it('reports nothing when keys are unique', () => {
    expect(findDuplicateKeys([['A'], ['B'], ['C']])).toEqual([]);
  });
});

describe('findSemicolonHazards — 0.8 density over non-empty values, as the server computes it', () => {
  it('flags a column at exactly 80% and not at 75%', () => {
    const columns = ['K', 'V'];
    // 4 of 5 non-empty = 80% -> hazard (server: >= 0.8).
    const at80 = findSemicolonHazards(columns, [
      ['a', 'x;y'],
      ['b', 'x;y'],
      ['c', 'x;y'],
      ['d', 'x;y'],
      ['e', 'plain'],
    ]);
    expect(at80).toEqual([{ column: 'V', index: 1, density: 0.8, preexisting: false }]);

    // 3 of 4 non-empty = 75% -> no hazard.
    const at75 = findSemicolonHazards(columns, [
      ['a', 'x;y'],
      ['b', 'x;y'],
      ['c', 'x;y'],
      ['d', 'plain'],
    ]);
    expect(at75).toEqual([]);
  });

  it('ignores empty values in the density denominator, like the server', () => {
    // 1 of 1 non-empty = 100% even though 3 of 4 rows are empty.
    const hazards = findSemicolonHazards(['K', 'V'], [['a', 'x;y'], ['b', ''], ['c', ''], ['d', '']]);
    expect(hazards).toEqual([{ column: 'V', index: 1, density: 1, preexisting: false }]);
  });
});

describe('isRawReadEntry — the comma-block gate, flag OR classification', () => {
  it('matches server/manifest.ts isRawRead: classification raw_read, or the raw_read flag under any classification', () => {
    expect(isRawReadEntry('raw_read', {})).toBe(true);
    // BuildingKitCatalog: generated classification carrying the raw_read flag.
    expect(isRawReadEntry('generated', { raw_read: { source: 'commandlet' } })).toBe(true);
    expect(isRawReadEntry('authored', {})).toBe(false);
  });
});

describe('computeDirtyStats — the save bar numbers', () => {
  const original = [
    ['A', '1'],
    ['B', '2'],
    ['C', '3'],
  ];

  it('is clean immediately after init', () => {
    const rows = initEditRows(original);
    expect(computeDirtyStats(original, rows)).toEqual({
      cellsEdited: 0,
      rowsAdded: 0,
      rowsDeleted: 0,
      dirty: false,
    });
  });

  it('counts edited cells, added rows and deleted rows independently', () => {
    const rows: EditRow[] = [
      { id: 0, origIndex: 0, cells: ['A', '9'] }, // one cell edited
      // row B (origIndex 1) deleted
      { id: 2, origIndex: 2, cells: ['C', '3'] }, // untouched
      { id: 3, origIndex: null, cells: ['D', '4'] }, // added
    ];
    expect(computeDirtyStats(original, rows)).toEqual({
      cellsEdited: 1,
      rowsAdded: 1,
      rowsDeleted: 1,
      dirty: true,
    });
  });

  it('isCellDirty: an added row is dirty everywhere; a reverted cell is clean again', () => {
    const added: EditRow = { id: 9, origIndex: null, cells: ['X', ''] };
    expect(isCellDirty(original, added, 0)).toBe(true);
    expect(isCellDirty(original, added, 1)).toBe(true);
    const reverted: EditRow = { id: 0, origIndex: 0, cells: ['A', '1'] };
    expect(isCellDirty(original, reverted, 1)).toBe(false);
  });
});

describe('refusalToFindings — PUT refusals in the findings panel language', () => {
  it('key_collision: one finding per key group, both rows named', () => {
    const findings = refusalToFindings('key_collision', {
      message: 'Column 0 (Name) must be unique …',
      collisions: [{ key: 'Concrete', rows: [1, 4] }],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('key_collision');
    expect(findings[0].severity).toBe('ERROR');
    expect(findings[0].row).toBe('Concrete');
    expect(findings[0].message).toContain('"Concrete"');
    expect(findings[0].message).toContain('rows 1, 4');
  });

  it('file_dirty: shows the diff stat and explains the uncommitted hand edit', () => {
    const findings = refusalToFindings('file_dirty', {
      message: 'Data/X.csv already has uncommitted changes in the EISCORE working tree — commit or discard them first.',
      status: ' M Data/X.csv',
      diffStat: ' Data/X.csv | 2 +-\n 1 file changed',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('file_dirty');
    expect(findings[0].message).toContain('uncommitted');
    expect(findings[0].message).toContain('uncommitted hand edits');
    expect(findings[0].message).toContain('Data/X.csv | 2 +-');
  });

  it('raw_read_comma and semicolon_hazard map per offender/column; unknown reasons pass the text through', () => {
    const comma = refusalToFindings('raw_read_comma', {
      offenders: [{ row: 2, column: 'Notes', value: 'a,b' }],
    });
    expect(comma).toHaveLength(1);
    expect(comma[0].column).toBe('Notes');
    expect(comma[0].message).toContain('ParseIntoArray');

    const semi = refusalToFindings('semicolon_hazard', {
      columns: [{ column: 'Description', density: 0.833 }],
    });
    expect(semi).toHaveLength(1);
    expect(semi[0].column).toBe('Description');
    expect(semi[0].message).toContain('83%');

    const other = refusalToFindings('classification_refused', 'X is classified "generated"');
    expect(other).toHaveLength(1);
    expect(other[0].message).toBe('X is classified "generated"');
  });
});
