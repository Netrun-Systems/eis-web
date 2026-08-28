import { describe, expect, it } from 'vitest';
import { applyProposals, proposeSuffixes } from '../keyProposals';
import { findDuplicateKeys } from '../guardHints';

const row = (key: string, v = 'x'): string[] => [key, `T_${key}`, v];

describe('proposeSuffixes — the LootTables fix path', () => {
  it('keeps the first occurrence and suffixes the rest _2, _3, … in row order', () => {
    const rows = [row('LT001'), row('LT002'), row('LT001'), row('LT001')];
    expect(proposeSuffixes(rows, 'LT001')).toEqual([
      { rowIndex: 2, oldKey: 'LT001', newKey: 'LT001_2' },
      { rowIndex: 3, oldKey: 'LT001', newKey: 'LT001_3' },
    ]);
  });

  it('never proposes a key the table already uses — no new collisions', () => {
    // LT001_2 already exists as a real key elsewhere in the table.
    const rows = [row('LT001'), row('LT001_2'), row('LT001'), row('LT001')];
    const proposals = proposeSuffixes(rows, 'LT001');
    expect(proposals.map((p) => p.newKey)).toEqual(['LT001_3', 'LT001_4']);
    const applied = applyProposals(rows, proposals);
    expect(findDuplicateKeys(applied)).toEqual([]);
  });

  it('is deterministic and returns [] for a non-colliding key', () => {
    const rows = [row('LT001'), row('LT001'), row('LT002')];
    expect(proposeSuffixes(rows, 'LT001')).toEqual(proposeSuffixes(rows, 'LT001'));
    expect(proposeSuffixes(rows, 'LT002')).toEqual([]);
    expect(proposeSuffixes(rows, 'LT_ABSENT')).toEqual([]);
  });

  it('applied to every collision group, the whole table becomes unique with no rows lost', () => {
    // A miniature LootTables: 9 rows, 3 keys, all colliding.
    let rows = [
      row('LT001'),
      row('LT001'),
      row('LT002'),
      row('LT002'),
      row('LT002'),
      row('LT003'),
      row('LT003'),
      row('LT001'),
      row('LT003'),
    ];
    for (const g of findDuplicateKeys(rows)) {
      rows = applyProposals(rows, proposeSuffixes(rows, g.key));
    }
    expect(rows).toHaveLength(9); // no rows lost
    expect(findDuplicateKeys(rows)).toEqual([]); // fully unique
    // Only column 0 changed; the payload columns are untouched.
    expect(rows.every((r) => r[1] === `T_${r[0].replace(/_\d+$/, '')}` || r[1].startsWith('T_LT'))).toBe(
      true,
    );
  });

  it('applyProposals leaves non-key cells and unlisted rows byte-identical', () => {
    const rows = [row('LT001', 'a'), row('LT001', 'b'), row('LT002', 'c')];
    const applied = applyProposals(rows, proposeSuffixes(rows, 'LT001'));
    expect(applied[0]).toEqual(['LT001', 'T_LT001', 'a']);
    expect(applied[1]).toEqual(['LT001_2', 'T_LT001', 'b']);
    expect(applied[2]).toEqual(['LT002', 'T_LT002', 'c']);
  });
});
