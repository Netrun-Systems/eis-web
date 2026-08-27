import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { parseConsumedPieceTypes, parseMergeSummary, parsePackList } from '../dam.ts';
import type {
  DamConsumedPieceTypes,
  DamKitCoverage,
  DamPackList,
  DamPackWriteResult,
  DamDryRunResult,
} from '../types.ts';
import { type Fixture, fixtureGit, makeDamFixture } from './fixture.ts';

/**
 * WEB-009 — the DAM surfaces against the DAM fixture repo. The critical
 * guarantees:
 *   - the consumed set comes from parsing location_brief.py source, and a
 *     parse failure is a loud 500, never a hardcoded fallback;
 *   - the coverage math (incl. the live inert count) is exact on a known
 *     mini catalogue, and consumed-with-zero-rows types still appear;
 *   - pack-write is dirty-guarded, commits exactly when the catalogues
 *     changed, and reports idempotence (commit: null) when they did not.
 */

let fx: Fixture;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  fx = makeDamFixture();
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

const kitAbs = () => path.join(fx.repoPath, 'Data', 'PCG', 'BuildingKitCatalog.csv');

const post = (route: string, body: unknown): Promise<Response> =>
  fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('GET /api/dam/consumed-piece-types', () => {
  it('parses the dict literal live from location_brief.py, comments and all', async () => {
    const res = await fetch(`${baseUrl}/api/dam/consumed-piece-types`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DamConsumedPieceTypes;
    expect(body.source).toBe('Scripts/location_brief.py');
    expect(body.count).toBe(3);
    expect(body.types).toEqual({
      Wall: ['ASM', 'EXO'],
      StairStep: ['VERT'],
      Scaffold: ['EXO'],
    });
    expect(body.consumers).toEqual(['ASM', 'EXO', 'VERT']);
  });

  it('refuses loudly (500, specific message) when the constant is gone — no fallback', async () => {
    fs.writeFileSync(
      path.join(fx.repoPath, 'Scripts', 'location_brief.py'),
      '# the constant moved away\nSOMETHING_ELSE = {"Wall": ("ASM",)}\n',
      'utf-8',
    );
    const res = await fetch(`${baseUrl}/api/dam/consumed-piece-types`);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { success: boolean; reason: string; detail: string };
    expect(body.success).toBe(false);
    expect(body.reason).toBe('consumed_parse_failed');
    expect(body.detail).toContain('CONSUMED_PIECE_TYPES');
  });
});

describe('parseConsumedPieceTypes', () => {
  it('throws on an entry with zero consumers instead of shipping it', () => {
    expect(() => parseConsumedPieceTypes('CONSUMED_PIECE_TYPES = {\n  "Wall": (),\n}\n')).toThrow(
      /zero consumers|zero entries/,
    );
  });

  it('throws on a missing closing brace', () => {
    expect(() => parseConsumedPieceTypes('CONSUMED_PIECE_TYPES = {\n  "Wall": ("ASM",),\n')).toThrow(
      /closing brace/,
    );
  });
});

describe('GET /api/dam/kit-coverage', () => {
  it('computes the matrix and the live inert number on the known mini catalogue', async () => {
    const res = await fetch(`${baseUrl}/api/dam/kit-coverage`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DamKitCoverage;

    expect(body.totalRows).toBe(9);
    expect(body.consumedRows).toBe(4); // 3 Wall + 1 StairStep
    expect(body.inertRows).toBe(5); // 2 Door + 3 CornerIn
    expect(body.inertPct).toBeCloseTo((5 / 9) * 100, 5);
    expect(body.styles).toEqual(['Chicago', 'Rural']);

    const byName = new Map(body.pieceTypes.map((p) => [p.name, p]));
    expect(byName.get('Wall')).toMatchObject({
      consumed: true,
      consumers: ['ASM', 'EXO'],
      total: 3,
      byStyle: { Rural: 2, Chicago: 1 },
    });
    expect(byName.get('Door')).toMatchObject({ consumed: false, consumers: [], total: 2 });
    // WG-215c: consumed with ZERO rows still appears — its absence is the finding.
    expect(byName.get('Scaffold')).toMatchObject({ consumed: true, total: 0, byStyle: {} });

    const rural = body.fallbacks.find((f) => f.style === 'Rural');
    expect(rural).toMatchObject({ family: 'Vernacular', chain: ['Chicago'] });
  });
});

describe('GET /api/dam/pack-list', () => {
  it('parses --list output, spaces-in-style and all', async () => {
    const res = await fetch(`${baseUrl}/api/dam/pack-list`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DamPackList;
    expect(body.exitCode).toBe(0);
    expect(body.packs).toEqual([
      { name: 'FixturePack', cityStyle: 'Rural', onDisk: true },
      { name: 'PropsOnly', cityStyle: 'N/A (props only)', onDisk: false },
    ]);
    expect(body.raw).toContain('FixturePack');
  });
});

describe('parsePackList / parseMergeSummary (conservative parsing)', () => {
  it('returns null on lines that resist parsing rather than a wrong table', () => {
    expect(parsePackList('something entirely different\n')).toBeNull();
    expect(parsePackList('')).toBeNull();
  });

  it('merge summary degrades to null on a format change, never a wrong number', () => {
    expect(parseMergeSummary('BuildingKitCatalog: reshaped output\n')).toBeNull();
    expect(
      parseMergeSummary(
        'BuildingKitCatalog: 4 existing kept + 3 new = 7\nInteriorPropCatalog: 1 existing kept + 0 new = 1\n',
      ),
    ).toEqual({ kitKept: 4, kitNew: 3, kitTotal: 7, propKept: 1, propNew: 0, propTotal: 1 });
  });
});

describe('POST /api/dam/pack-dry-run', () => {
  it('passes the classification report through and touches nothing', async () => {
    const before = fs.readFileSync(kitAbs(), 'utf-8');
    const res = await post('/api/dam/pack-dry-run', { pack: 'FixturePack' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as DamDryRunResult;
    expect(body.exitCode).toBe(0);
    expect(body.report).toContain('architectural');
    expect(body.report).toContain('dry run');
    expect(body.merge).toEqual({
      kitKept: 4,
      kitNew: 3,
      kitTotal: 7,
      propKept: 1,
      propNew: 0,
      propTotal: 1,
    });
    expect(fs.readFileSync(kitAbs(), 'utf-8')).toBe(before);
    expect(fixtureGit(fx.repoPath, ['status', '--porcelain']).trim()).toBe('');
  });

  it('refuses a pack name that is not in --list', async () => {
    const res = await post('/api/dam/pack-dry-run', { pack: 'NotAPack' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { reason: string; detail: string };
    expect(body.reason).toBe('unknown_pack');
    expect(body.detail).toContain('FixturePack');
  });
});

describe('POST /api/dam/pack-write', () => {
  it('refuses without confirm: true', async () => {
    const res = await post('/api/dam/pack-write', { pack: 'FixturePack' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('bad_request');
  });

  it('diff branch: one commit with the exact message, diffstat reported', async () => {
    const res = await post('/api/dam/pack-write', { pack: 'FixturePack', confirm: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as DamPackWriteResult;
    expect(body.success).toBe(true);
    expect(body.commit).not.toBeNull();
    expect(body.diffstat).toContain('BuildingKitCatalog.csv');
    expect(body.fallbackCheck.exitCode).toBe(0);
    expect(body.fallbackCheck.output).toContain('check ok');

    const log = fixtureGit(fx.repoPath, ['log', '-1', '--format=%s%x09%an']);
    expect(log.trim()).toBe('eisweb: register pack FixturePack\tEISWeb');
    expect(fixtureGit(fx.repoPath, ['status', '--porcelain']).trim()).toBe('');
    // The write replaced only the pack's rows: Chicago rows survived.
    const after = fs.readFileSync(kitAbs(), 'utf-8');
    expect(after).toContain('CHI_W1');
    expect(after).toContain('FX_W1');
    expect(after).not.toContain('LEG_W1');
  });

  it('no-diff branch: a second write reports idempotence and commits nothing', async () => {
    const first = await post('/api/dam/pack-write', { pack: 'FixturePack', confirm: true });
    expect(first.status).toBe(200);
    const countAfterFirst = fixtureGit(fx.repoPath, ['rev-list', '--count', 'HEAD']).trim();

    const res = await post('/api/dam/pack-write', { pack: 'FixturePack', confirm: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as DamPackWriteResult;
    expect(body.success).toBe(true);
    expect(body.commit).toBeNull();
    expect(body.note).toBe('idempotent — no changes');
    expect(body.fallbackCheck.exitCode).toBe(0);
    expect(fixtureGit(fx.repoPath, ['rev-list', '--count', 'HEAD']).trim()).toBe(countAfterFirst);
    expect(fixtureGit(fx.repoPath, ['status', '--porcelain']).trim()).toBe('');
  });

  it('dirty guard: an uncommitted catalogue edit blocks the write untouched', async () => {
    fs.appendFileSync(kitAbs(), 'HAND_1,Rural,KIT_HAND,L1,Wall,/Game/Hand/W1\n', 'utf-8');
    const res = await post('/api/dam/pack-write', { pack: 'FixturePack', confirm: true });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { reason: string; detail: { status: string } };
    expect(body.reason).toBe('file_dirty');
    expect(body.detail.status).toContain('BuildingKitCatalog.csv');
    // The hand edit is still there — the script never ran.
    expect(fs.readFileSync(kitAbs(), 'utf-8')).toContain('HAND_1');
  });
});
