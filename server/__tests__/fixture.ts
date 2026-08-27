import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { ManifestTable, TableManifest } from '../types.ts';

/**
 * Builds a throwaway fixture git repo shaped like a miniature EISCORE:
 * Data/ with a few tiny CSVs, Exports/TableManifest.json hand-built to match.
 * Tests never touch the real EISCORE repo.
 */

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

export interface Fixture {
  repoPath: string;
  cleanup: () => void;
}

const table = (partial: Partial<ManifestTable> & Pick<ManifestTable, 'path' | 'stem' | 'folder'>): ManifestTable => ({
  row_count: 2,
  columns: [],
  column_types: [],
  row_key: { column0: 'RowName', unique: true, rows_lost_on_import: 0 },
  classification: 'authored',
  flags: {},
  ...partial,
});

export const FIXTURE_TABLES: ManifestTable[] = [
  table({
    path: 'Data/Core/Things.csv',
    folder: 'Core',
    stem: 'Things',
    columns: ['RowName', 'ThingId', 'DisplayName', 'Tags'],
  }),
  table({
    path: 'Data/PCG/RawParts.csv',
    folder: 'PCG',
    stem: 'RawParts',
    columns: ['RowName', 'PartId', 'Notes'],
    classification: 'raw_read',
    flags: { raw_read: { source: 'fixture' } },
  }),
  table({
    path: 'Data/WorldGen/GenOut.csv',
    folder: 'WorldGen',
    stem: 'GenOut',
    columns: ['RowName', 'Value'],
    classification: 'generated',
    flags: { generated: { generator: 'Scripts/fixture_generator.py' } },
  }),
  table({
    path: 'Data/Legacy_Import/Old.csv',
    folder: 'Legacy_Import',
    stem: 'Old',
    columns: ['Name', 'Value'],
    classification: 'legacy',
    flags: { legacy: { source: 'fixture legacy folder' } },
  }),
];

const FILES: Record<string, string> = {
  // CRLF file — line-ending preservation is asserted against this one.
  'Data/Core/Things.csv':
    'RowName,ThingId,DisplayName,Tags\r\nTHING_A,THING_A,Thing A,alpha|beta\r\nTHING_B,THING_B,Thing B,beta\r\n',
  // LF file, raw-read.
  'Data/PCG/RawParts.csv': 'RowName,PartId,Notes\nPART_1,PART_1,fine\nPART_2,PART_2,also fine\n',
  'Data/WorldGen/GenOut.csv': 'RowName,Value\nG_1,G_1\nG_2,G_2\n',
  'Data/Legacy_Import/Old.csv': 'Name,Value\nOLD_1,1\nOLD_2,2\n',
};

export function makeFixtureRepo(): Fixture {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'eisweb-fixture-'));
  for (const [rel, content] of Object.entries(FILES)) {
    const abs = path.join(repoPath, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  }
  const manifest: TableManifest = {
    summary: {
      total_tables: FIXTURE_TABLES.length,
      classification_counts: {},
      raw_read_flagged: 1,
    },
    tables: FIXTURE_TABLES,
  };
  const exportsDir = path.join(repoPath, 'Exports');
  fs.mkdirSync(exportsDir, { recursive: true });
  fs.writeFileSync(
    path.join(exportsDir, 'TableManifest.json'),
    JSON.stringify(manifest, null, 1),
    'utf-8',
  );
  git(repoPath, ['init', '-q']);
  git(repoPath, ['config', 'user.name', 'Fixture']);
  git(repoPath, ['config', 'user.email', 'fixture@example.invalid']);
  git(repoPath, ['config', 'core.autocrlf', 'false']);
  git(repoPath, ['add', '-A']);
  git(repoPath, ['commit', '-q', '-m', 'fixture: initial corpus']);
  return {
    repoPath,
    cleanup: () => {
      fs.rmSync(repoPath, { recursive: true, force: true });
    },
  };
}

export function fixtureEntry(stem: string): ManifestTable {
  const entry = FIXTURE_TABLES.find((t) => t.stem === stem);
  if (!entry) throw new Error(`no fixture table ${stem}`);
  return entry;
}

export function fixtureAbs(repoPath: string, entry: ManifestTable): string {
  return path.join(repoPath, ...entry.path.split('/'));
}

export { git as fixtureGit };
