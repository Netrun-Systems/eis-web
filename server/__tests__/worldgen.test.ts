import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { trimNormalizeOutput } from '../worldgen.ts';
import type {
  WorldgenPutResult,
  WorldgenSourcesResult,
  WorldgenWebResult,
} from '../types.ts';
import { type Fixture, fixtureGit, makeWorldgenFixture } from './fixture.ts';

/**
 * WEB-006 — the vocabulary editor's mutation contract, over real HTTP against
 * the worldgen fixture repo (stand-in normalize / group-tokens / validator
 * honouring the real CLI contracts). The critical guarantees:
 *   - a validator ERROR rolls the tree back byte-identical, no commit;
 *   - a success is exactly one commit carrying fragments + regenerated files;
 *   - empty edit sets delete the fragments (no-web-files baseline).
 */

let fx: Fixture;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  fx = makeWorldgenFixture();
  const app = createApp({ repoPath: fx.repoPath, corsOrigin: 'http://localhost:5173' });
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  fx.cleanup();
});

const SPT_COLS = [
  'RowName',
  'SpaceTypeID',
  'DisplayName',
  'Category',
  'MinWidthCm',
  'PrimaryAdjacency',
  'Notes',
];

const row = (name: string, display: string, adjacency: string): string[] => [
  name,
  name,
  display,
  'Utility',
  '200.0',
  adjacency,
  'web row',
];

function putStem(stem: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/worldgen/web/${stem}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Deterministic hash of every file under the two paths the PUT may touch —
 * the byte-identical rollback assertion. */
function treeHash(repoPath: string): string {
  const hash = crypto.createHash('sha256');
  const walk = (rel: string) => {
    const abs = path.join(repoPath, ...rel.split('/'));
    if (!fs.existsSync(abs)) return;
    for (const name of fs.readdirSync(abs).sort()) {
      const child = `${rel}/${name}`;
      const childAbs = path.join(abs, name);
      if (fs.statSync(childAbs).isDirectory()) walk(child);
      else {
        hash.update(child);
        hash.update('\0');
        hash.update(fs.readFileSync(childAbs));
        hash.update('\0');
      }
    }
  };
  walk('Documentation/WorldGen_Extensions');
  walk('Data/WorldGen');
  return hash.digest('hex');
}

const head = () => fixtureGit(fx.repoPath, ['rev-parse', 'HEAD']).trim();
const porcelain = () => fixtureGit(fx.repoPath, ['status', '--porcelain']).trim();

describe('stem allow-list', () => {
  it('GET and PUT 404 on a non-worldgen stem, naming the allowed set', async () => {
    for (const res of [
      await fetch(`${baseUrl}/api/worldgen/web/LootTables`),
      await putStem('LootTables', { webRows: [], webPatches: [] }),
    ]) {
      expect(res.status).toBe(404);
      const body = (await res.json()) as { reason: string; allowed: string[] };
      expect(body.reason).toBe('unknown_stem');
      expect(body.allowed).toContain('SpaceTypes');
      expect(body.allowed).toHaveLength(8);
    }
  });
});

describe('GET /api/worldgen/sources', () => {
  it('reports all 8 stems with fragment existence and row counts', async () => {
    const res = await fetch(`${baseUrl}/api/worldgen/sources`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as WorldgenSourcesResult;
    expect(body.stems).toHaveLength(8);
    const spt = body.stems.find((s) => s.stem === 'SpaceTypes');
    expect(spt).toMatchObject({
      base: { path: 'Data/WorldGen/SpaceTypes.csv', exists: true, rowCount: 3 },
      fragments: {
        ext: { exists: true, rowCount: 1 },
        web: { exists: false, rowCount: null },
        patch: { exists: false, rowCount: null },
        webPatch: { exists: false, rowCount: null },
      },
    });
  });
});

describe('GET /api/worldgen/web/:stem', () => {
  it('returns columns, owner-labelled base rows, empty web state, and FK picker options', async () => {
    const res = await fetch(`${baseUrl}/api/worldgen/web/SpaceTypes`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as WorldgenWebResult;
    expect(body.columns).toEqual(SPT_COLS);
    expect(body.baseRows).toEqual([
      { rowName: 'SPC_Lobby', displayName: 'Lobby', owner: 'base' },
      { rowName: 'SPC_Corridor', displayName: 'Corridor', owner: 'base' },
      { rowName: 'SPC_FixtureExt', displayName: 'Fixture Ext', owner: 'ext' },
    ]);
    expect(body.webRows).toEqual([]);
    expect(body.webPatches).toEqual([]);
    expect(body.wildcards).toContain('*');
    expect(body.groupTokens).toEqual([
      { token: 'AllFixture', domain: 'SpaceTypes', members: ['SPC_Lobby', 'SPC_Corridor'] },
    ]);
    // FK picker sourcing: target RowNames + group tokens of the target's
    // domain + (adjacency column on SpaceTypes) the Category values.
    expect(body.fkOptions).toEqual([
      {
        column: 'PrimaryAdjacency',
        targetTable: 'SpaceTypes',
        targetPrefix: 'SPC_',
        rowNames: ['SPC_Corridor', 'SPC_FixtureExt', 'SPC_Lobby'],
        groupTokens: ['AllFixture'],
        extras: ['Circulation', 'Public', 'Utility'],
      },
    ]);
  });
});

describe('PUT refusals (no process ever runs)', () => {
  it('refuses when anything under Data/WorldGen is dirty', async () => {
    const abs = path.join(fx.repoPath, 'Data', 'WorldGen', 'SpaceTypes.csv');
    fs.appendFileSync(abs, 'SPC_Hand,SPC_Hand,Hand,Utility,100.0,*,hand edit\n', 'utf-8');
    const res = await putStem('SpaceTypes', {
      webRows: [row('SPC_WebRoom', 'Web Room', 'SPC_Lobby')],
      webPatches: [],
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('file_dirty');
    // The hand edit survives untouched:
    expect(fs.readFileSync(abs, 'utf-8')).toContain('hand edit');
  });

  it('refuses an Op the patch layer does not support', async () => {
    const res = await putStem('SpaceTypes', {
      webRows: [],
      webPatches: [
        { rowName: 'SPC_Lobby', column: 'Notes', op: 'delete', value: 'x', reason: 'testing' },
      ],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason: string; detail: string };
    expect(body.reason).toBe('bad_request');
    expect(body.detail).toContain('append, set');
    expect(porcelain()).toBe('');
  });

  it('refuses a patch without a Reason, and one targeting an unknown row', async () => {
    const noReason = await putStem('SpaceTypes', {
      webRows: [],
      webPatches: [{ rowName: 'SPC_Lobby', column: 'Notes', op: 'set', value: 'x', reason: ' ' }],
    });
    expect(noReason.status).toBe(400);
    expect(((await noReason.json()) as { detail: string }).detail).toContain('Reason');

    const unknownRow = await putStem('SpaceTypes', {
      webRows: [],
      webPatches: [{ rowName: 'SPC_Ghost', column: 'Notes', op: 'set', value: 'x', reason: 'y' }],
    });
    expect(unknownRow.status).toBe(400);
    expect(((await unknownRow.json()) as { detail: string }).detail).toContain('SPC_Ghost');
  });

  it('refuses RowName collisions inside webRows and against base/ext-owned rows', async () => {
    const internal = await putStem('SpaceTypes', {
      webRows: [row('SPC_Dup', 'A', '*'), row('SPC_Dup', 'B', '*')],
      webPatches: [],
    });
    expect(internal.status).toBe(409);
    expect(((await internal.json()) as { reason: string }).reason).toBe('key_collision');

    const shadowing = await putStem('SpaceTypes', {
      webRows: [row('SPC_FixtureExt', 'Shadow', '*')],
      webPatches: [],
    });
    expect(shadowing.status).toBe(409);
    const body = (await shadowing.json()) as { reason: string; detail: string };
    expect(body.reason).toBe('key_collision');
    expect(body.detail).toContain('SpaceTypes.ext.csv');
  });
});

describe('validation-ERROR path', () => {
  it('rolls the tree back byte-identical, leaves no commit, and returns the findings', async () => {
    const hashBefore = treeHash(fx.repoPath);
    const headBefore = head();

    const res = await putStem('SpaceTypes', {
      webRows: [row('SPC_WebBroken', 'Broken', 'SPC_DoesNotExist')],
      webPatches: [],
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as WorldgenPutResult;
    expect(body.success).toBe(false);
    if (body.success) throw new Error('unreachable');
    expect(body.reason).toBe('validation_errors');
    if (!('findings' in body)) throw new Error('unreachable');
    expect(body.summaryCounts.ERROR).toBeGreaterThan(0);
    const err = body.findings.find((f) => f.severity === 'ERROR');
    expect(err?.message).toContain('SPC_DoesNotExist');
    expect(err?.row).toBe('SPC_WebBroken');

    // Byte-identical rollback: same tree hash, same HEAD, clean status, and
    // the never-before-present fragment file is gone again.
    expect(treeHash(fx.repoPath)).toBe(hashBefore);
    expect(head()).toBe(headBefore);
    expect(porcelain()).toBe('');
    expect(
      fs.existsSync(
        path.join(fx.repoPath, 'Documentation', 'WorldGen_Extensions', 'SpaceTypes.web.csv'),
      ),
    ).toBe(false);
  });
});

describe('success path', () => {
  it('writes fragments, re-runs the chain, and makes exactly one commit with fragments + regenerated outputs', async () => {
    const headBefore = head();
    const res = await putStem('SpaceTypes', {
      webRows: [row('SPC_WebRoom', 'Web Room', 'SPC_Lobby|AllFixture')],
      webPatches: [
        {
          rowName: 'SPC_Corridor',
          column: 'Notes',
          op: 'set',
          value: 'patched by web',
          reason: 'WEB-006 test',
        },
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as WorldgenPutResult;
    expect(body.success).toBe(true);
    if (!body.success) throw new Error('unreachable');
    expect(body.commit).toMatch(/^[0-9a-f]{7,}$/);
    expect(body.summaryCounts.ERROR).toBe(0);
    // The normalize report section reaches the caller:
    expect(body.normalizeOutput).toContain('web:');
    expect(body.normalizeOutput).toContain('wrote');

    // Exactly one new commit, contract message, EISWeb author:
    const log = fixtureGit(fx.repoPath, ['log', `${headBefore}..HEAD`, '--format=%an <%ae>%n%s']);
    expect(log.trim().split('\n')).toEqual([
      'EISWeb <daniel@netrunsystems.com>',
      'eisweb: vocabulary edit SpaceTypes (+1 rows, 1 patches)',
    ]);
    // The commit carries the fragments AND the regenerated outputs:
    const files = fixtureGit(fx.repoPath, ['show', '--name-only', '--format=', 'HEAD'])
      .trim()
      .split('\n');
    expect(files).toContain('Documentation/WorldGen_Extensions/SpaceTypes.web.csv');
    expect(files).toContain('Documentation/WorldGen_Extensions/SpaceTypes.web.patch.csv');
    expect(files).toContain('Data/WorldGen/SpaceTypes.csv');
    expect(porcelain()).toBe('');

    // And the regenerated table actually gained the row and the patch:
    const generated = fs.readFileSync(
      path.join(fx.repoPath, 'Data', 'WorldGen', 'SpaceTypes.csv'),
      'utf-8',
    );
    expect(generated).toContain('SPC_WebRoom');
    expect(generated).toContain('patched by web');
    expect(generated.trim().split('\n')).toHaveLength(5); // header + 4 rows
  });

  it('empty edit set deletes the fragments and restores the no-web-files baseline', async () => {
    // First a real edit...
    const first = await putStem('SpaceTypes', {
      webRows: [row('SPC_WebRoom', 'Web Room', 'SPC_Lobby')],
      webPatches: [],
    });
    expect(first.status).toBe(200);
    const baselineCsv = fixtureGit(fx.repoPath, [
      'show',
      'HEAD~1:Data/WorldGen/SpaceTypes.csv',
    ]);

    // ...then clear it:
    const second = await putStem('SpaceTypes', { webRows: [], webPatches: [] });
    expect(second.status).toBe(200);
    const body = (await second.json()) as WorldgenPutResult;
    expect(body.success).toBe(true);
    if (!body.success) throw new Error('unreachable');
    expect(body.commit).toMatch(/^[0-9a-f]{7,}$/);

    const webCsv = path.join(
      fx.repoPath,
      'Documentation',
      'WorldGen_Extensions',
      'SpaceTypes.web.csv',
    );
    expect(fs.existsSync(webCsv)).toBe(false);
    // Byte-identical to the pre-edit generated table:
    expect(
      fs.readFileSync(path.join(fx.repoPath, 'Data', 'WorldGen', 'SpaceTypes.csv'), 'utf-8'),
    ).toBe(baselineCsv);
    expect(porcelain()).toBe('');
  });

  it('empty edit set on the clean baseline is a no-op success with commit null', async () => {
    const headBefore = head();
    const res = await putStem('SpaceTypes', { webRows: [], webPatches: [] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as WorldgenPutResult;
    expect(body.success).toBe(true);
    if (!body.success) throw new Error('unreachable');
    expect(body.commit).toBeNull();
    expect(head()).toBe(headBefore);
    expect(porcelain()).toBe('');
  });
});

describe('trimNormalizeOutput', () => {
  it('keeps the merge/patch/write report lines and drops the transformation preamble', () => {
    const stdout = [
      'Units — 4 column(s) renamed',
      'References — 12 prefixed',
      '  web:       SpaceTypes               +1 row(s)',
      '  web patch: SpaceTypes               1 applied, 0 skipped',
      '  wrote SpaceTypes.csv                  4 rows   7 cols',
    ].join('\n');
    const trimmed = trimNormalizeOutput(stdout);
    expect(trimmed).not.toContain('Units');
    expect(trimmed).toContain('web:');
    expect(trimmed).toContain('wrote SpaceTypes.csv');
  });
});
