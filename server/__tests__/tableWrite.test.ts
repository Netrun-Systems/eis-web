import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeTable } from '../tableWrite.ts';
import { detectEol, parseCsvText } from '../csv.ts';
import { checkSemicolonHazard } from '../guards.ts';
import {
  type Fixture,
  fixtureAbs,
  fixtureEntry,
  fixtureGit,
  makeFixtureRepo,
} from './fixture.ts';

let fx: Fixture;

beforeEach(() => {
  fx = makeFixtureRepo();
});

afterEach(() => {
  fx.cleanup();
});

const ctx = () => ({ repoPath: fx.repoPath, skipPythonValidation: true });

describe('classification guard', () => {
  it('refuses a generated table, naming the generator script', async () => {
    const entry = fixtureEntry('GenOut');
    const result = await writeTable(ctx(), entry.path, entry, fixtureAbs(fx.repoPath, entry), {
      columns: ['RowName', 'Value'],
      rows: [['G_1', 'G_1']],
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    expect(result.reason).toBe('classification_refused');
    expect(String(result.detail)).toContain('Scripts/fixture_generator.py');
    expect(String(result.detail)).toContain('Edit the source, not the output');
  });

  it('refuses a legacy table', async () => {
    const entry = fixtureEntry('Old');
    const result = await writeTable(ctx(), entry.path, entry, fixtureAbs(fx.repoPath, entry), {
      columns: ['Name', 'Value'],
      rows: [['OLD_1', '9']],
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    expect(result.reason).toBe('classification_refused');
    expect(String(result.detail)).toContain('legacy');
  });
});

describe('dirty guard', () => {
  it('refuses when the file has uncommitted changes, with the diff stat', async () => {
    const entry = fixtureEntry('Things');
    const abs = fixtureAbs(fx.repoPath, entry);
    // A human's in-progress hand edit:
    fs.appendFileSync(abs, 'THING_C,THING_C,Hand-added,gamma\r\n', 'utf-8');
    const result = await writeTable(ctx(), entry.path, entry, abs, {
      columns: entry.columns,
      rows: [['THING_A', 'THING_A', 'Thing A', 'alpha']],
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    expect(result.reason).toBe('file_dirty');
    const detail = result.detail as { status: string; diffStat: string };
    expect(detail.status).toContain('Things.csv');
    expect(detail.diffStat).toContain('Things.csv');
    // And the hand edit is still there, untouched:
    expect(fs.readFileSync(abs, 'utf-8')).toContain('Hand-added');
  });
});

describe('hard-rule guards', () => {
  it('refuses column-0 key collisions and names every colliding key', async () => {
    const entry = fixtureEntry('Things');
    const result = await writeTable(ctx(), entry.path, entry, fixtureAbs(fx.repoPath, entry), {
      columns: entry.columns,
      rows: [
        ['THING_A', 'THING_A', 'First', ''],
        ['THING_A', 'THING_A', 'Overwrites first', ''],
        ['THING_B', 'THING_B', 'Fine', ''],
        ['THING_B', 'THING_B', 'Also collides', ''],
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    expect(result.reason).toBe('key_collision');
    const detail = result.detail as { message: string; collisions: { key: string; rows: number[] }[] };
    expect(detail.message).toContain('"THING_A"');
    expect(detail.message).toContain('"THING_B"');
    expect(detail.collisions).toEqual([
      { key: 'THING_A', rows: [1, 2] },
      { key: 'THING_B', rows: [3, 4] },
    ]);
  });

  it('refuses a >=80% semicolon-dense column', () => {
    const failure = checkSemicolonHazard({
      columns: ['RowName', 'Effects'],
      rows: [
        ['A', 'x;y'],
        ['B', 'p;q'],
        ['C', 'r;s'],
        ['D', 'lone'],
        ['E', 'u;v'],
      ],
    });
    expect(failure).not.toBeNull();
    expect(failure?.reason).toBe('semicolon_hazard');
    const detail = failure?.detail as { message: string };
    expect(detail.message).toContain('Effects');
  });

  it('refuses any comma in a raw_read table, naming row and column', async () => {
    const entry = fixtureEntry('RawParts');
    const result = await writeTable(ctx(), entry.path, entry, fixtureAbs(fx.repoPath, entry), {
      columns: entry.columns,
      rows: [
        ['PART_1', 'PART_1', 'fine'],
        ['PART_2', 'PART_2', 'shifts, every later column'],
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    expect(result.reason).toBe('raw_read_comma');
    const detail = result.detail as { message: string };
    expect(detail.message).toContain('row 2');
    expect(detail.message).toContain('column Notes');
    // The comma never reached disk:
    expect(fs.readFileSync(fixtureAbs(fx.repoPath, entry), 'utf-8')).not.toContain('shifts');
  });
});

describe('write, EOL preservation, and commit', () => {
  it('preserves CRLF on a CRLF file and commits exactly that file', async () => {
    const entry = fixtureEntry('Things');
    const abs = fixtureAbs(fx.repoPath, entry);
    expect(detectEol(fs.readFileSync(abs, 'utf-8'))).toBe('\r\n');
    const result = await writeTable(ctx(), entry.path, entry, abs, {
      columns: entry.columns,
      rows: [
        ['THING_A', 'THING_A', 'Thing A renamed', 'alpha|beta'],
        ['THING_B', 'THING_B', 'Thing B', 'beta'],
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.commit).toMatch(/^[0-9a-f]{7,}$/);
    const written = fs.readFileSync(abs, 'utf-8');
    expect(detectEol(written)).toBe('\r\n');
    expect(written.includes('\r\n')).toBe(true);
    expect(written).not.toMatch(/[^\r]\n/); // no stray bare LFs
    expect(written).toContain('Thing A renamed');
    // Committed with the contract message and the EISWeb author:
    const log = fixtureGit(fx.repoPath, ['log', '-1', '--format=%an <%ae>%n%s']);
    expect(log).toContain('EISWeb <daniel@netrunsystems.com>');
    expect(log).toContain('eisweb: edit Things (2 rows)');
    // Working tree is clean afterwards — nothing else was swept into the commit:
    expect(fixtureGit(fx.repoPath, ['status', '--porcelain'])).toBe('');
  });

  it('preserves LF on an LF file', async () => {
    const entry = fixtureEntry('RawParts');
    const abs = fixtureAbs(fx.repoPath, entry);
    const result = await writeTable(ctx(), entry.path, entry, abs, {
      columns: entry.columns,
      rows: [['PART_1', 'PART_1', 'edited']],
      message: 'fixture: LF edit',
    });
    expect(result.success).toBe(true);
    const written = fs.readFileSync(abs, 'utf-8');
    expect(written).not.toContain('\r');
    expect(detectEol(written)).toBe('\n');
  });

  it('leaves the original intact and no temp file behind when the round-trip re-read fails', async () => {
    const entry = fixtureEntry('Things');
    const abs = fixtureAbs(fx.repoPath, entry);
    const before = fs.readFileSync(abs, 'utf-8');
    const result = await writeTable(
      {
        ...ctx(),
        atomicOptions: {
          verifyHook: () => {
            throw new Error('simulated re-read failure');
          },
        },
      },
      entry.path,
      entry,
      abs,
      {
        columns: entry.columns,
        rows: [['THING_A', 'THING_A', 'Would-be edit', '']],
      },
    );
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    expect(result.reason).toBe('write_failed');
    expect(String(result.detail)).toContain('simulated re-read failure');
    // Original byte-identical, no torn file:
    expect(fs.readFileSync(abs, 'utf-8')).toBe(before);
    // No temp litter in the directory:
    const leftovers = fs.readdirSync(path.dirname(abs)).filter((f) => f.includes('.tmp'));
    expect(leftovers).toEqual([]);
    // And nothing was committed:
    const log = fixtureGit(fx.repoPath, ['log', '--format=%s']);
    expect(log.trim()).toBe('fixture: initial corpus');
  });
});

describe('csv primitives', () => {
  it('tolerates a BOM and parses into columns/rows', () => {
    const parsed = parseCsvText(String.fromCharCode(0xfeff) + 'RowName,Value\nA,1\n');
    expect(parsed.columns).toEqual(['RowName', 'Value']);
    expect(parsed.rows).toEqual([['A', '1']]);
  });
});
