import { describe, expect, it } from 'vitest';
import { runGuardFindings, runHardRuleGuards, splitSemicolonHazards } from '../guards.ts';
import type { ManifestTable } from '../types.ts';

/**
 * WEB-011 — pre-existing versus NEW semicolon hazards. A column the manifest
 * already flags semicolon_hazard (NPCs.csv carries 11 of them) must not
 * freeze the whole table read-only: pre-existing hazards WARN, only a hazard
 * the edit would introduce refuses. The PUT-refuses-iff-any-ERROR-finding
 * invariant holds.
 */

const entryWith = (flaggedColumns: string[]): ManifestTable => ({
  path: 'Data/Core/NPCs.csv',
  folder: 'Core',
  stem: 'NPCs',
  row_count: 2,
  columns: ['NPC_ID', 'Skills', 'Notes'],
  column_types: [
    { name: 'NPC_ID', ue5_type: 'FName', pipe_multi: false, semicolon_hazard: false },
    {
      name: 'Skills',
      ue5_type: 'TArray<FString>',
      pipe_multi: false,
      semicolon_hazard: flaggedColumns.includes('Skills'),
    },
    { name: 'Notes', ue5_type: 'FString', pipe_multi: false, semicolon_hazard: false },
  ],
  row_key: { column0: 'NPC_ID', unique: true, rows_lost_on_import: 0 },
  classification: 'authored',
  flags: {},
});

// Skills is 100% ;-dense in both payloads.
const payloadPreexistingOnly = {
  columns: ['NPC_ID', 'Skills', 'Notes'],
  rows: [
    ['A', 'Combat=9;Leadership=10', 'plain'],
    ['B', 'Repair=6;Strategy=6', 'plain'],
  ],
};

// Notes becomes ;-dense too — a hazard the edit INTRODUCES.
const payloadWithNewHazard = {
  columns: ['NPC_ID', 'Skills', 'Notes'],
  rows: [
    ['A', 'Combat=9;Leadership=10', 'x;y'],
    ['B', 'Repair=6;Strategy=6', 'p;q'],
  ],
};

describe('splitSemicolonHazards — manifest-flagged columns are pre-existing', () => {
  it('splits by the manifest flag', () => {
    const split = splitSemicolonHazards(entryWith(['Skills']), payloadWithNewHazard);
    expect(split.preexisting.map((h) => h.column)).toEqual(['Skills']);
    expect(split.newHazards.map((h) => h.column)).toEqual(['Notes']);
  });

  it('with no manifest flag, everything is new', () => {
    const split = splitSemicolonHazards(entryWith([]), payloadPreexistingOnly);
    expect(split.preexisting).toEqual([]);
    expect(split.newHazards.map((h) => h.column)).toEqual(['Skills']);
  });
});

describe('runHardRuleGuards — pre-existing hazards do not refuse', () => {
  it('allows a save whose only hazards are manifest-flagged (the NPCs.csv case)', () => {
    const { failure, checks } = runHardRuleGuards(entryWith(['Skills']), payloadPreexistingOnly);
    expect(failure).toBeNull();
    const semi = checks.find((c) => c.name === 'semicolon_hazard');
    expect(semi?.passed).toBe(true);
    expect(JSON.stringify(semi?.detail)).toContain('pre-existing');
  });

  it('still refuses a hazard the edit introduces, naming only the NEW column', () => {
    const { failure } = runHardRuleGuards(entryWith(['Skills']), payloadWithNewHazard);
    expect(failure).not.toBeNull();
    expect(failure?.reason).toBe('semicolon_hazard');
    const detail = failure?.detail as { message: string; columns: { column: string }[] };
    expect(detail.columns.map((c) => c.column)).toEqual(['Notes']);
    expect(detail.message).not.toContain('Skills');
  });
});

describe('runGuardFindings — severity mirrors the refusal split', () => {
  it('pre-existing → WARN, new → ERROR; PUT refuses iff any ERROR', () => {
    const findings = runGuardFindings(entryWith(['Skills']), payloadWithNewHazard);
    const byColumn = new Map(findings.map((f) => [f.column, f]));
    expect(byColumn.get('Notes')?.severity).toBe('ERROR');
    expect(byColumn.get('Notes')?.code).toBe('semicolon_hazard');
    expect(byColumn.get('Skills')?.severity).toBe('WARN');
    expect(byColumn.get('Skills')?.code).toBe('semicolon_hazard_preexisting');
    expect(byColumn.get('Skills')?.message).toContain('pre-existing');

    const onlyPre = runGuardFindings(entryWith(['Skills']), payloadPreexistingOnly);
    expect(onlyPre.every((f) => f.severity !== 'ERROR')).toBe(true);
    expect(runHardRuleGuards(entryWith(['Skills']), payloadPreexistingOnly).failure).toBeNull();
  });
});
