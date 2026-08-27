import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { mapValidatorJson } from '../validation.ts';
import { countFindings, runGuardFindings } from '../guards.ts';
import { writeTable } from '../tableWrite.ts';
import { readCsvFile } from '../csv.ts';
import type { Finding, TableGuardCheckResult, WorldgenValidationResult } from '../types.ts';
import {
  type Fixture,
  fixtureAbs,
  fixtureEntry,
  fixtureGit,
  makeFixtureRepo,
} from './fixture.ts';

const FIXTURE_JSON_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'worldgen_validation.json',
);

/**
 * WEB-005 — the validation service.
 *   - mapValidatorJson against a checked-in copy of a REAL validator run
 *     (plus one hand-added ERROR item, since the live corpus has none);
 *   - the dry-run guard endpoint on the fixture repo's colliding-key table,
 *     cross-checked against the PUT refusal's facts;
 *   - POST /api/validate/worldgen end-to-end over the fixture's stand-in
 *     validator (exit 1 must be a 200 result, not a 5xx).
 */

describe('mapValidatorJson (checked-in real-run fixture)', () => {
  const json = JSON.parse(fs.readFileSync(FIXTURE_JSON_PATH, 'utf-8')) as unknown;
  const findings = mapValidatorJson(json);

  it('maps every item, one finding each, source worldgen-validator', () => {
    expect(findings).toHaveLength(10);
    expect(new Set(findings.map((f) => f.source))).toEqual(new Set(['worldgen-validator']));
  });

  it('normalizes severities: ERROR -> ERROR, WARNING -> WARN, INFO -> INFO', () => {
    expect(countFindings(findings)).toEqual({ ERROR: 1, WARN: 2, INFO: 7 });
  });

  it('maps rule -> code, detail -> message, keeps table stems, fills row/column when present', () => {
    const error = findings.find((f) => f.severity === 'ERROR');
    expect(error).toMatchObject({
      code: 'fixture-added-error',
      table: 'Regions',
      column: 'RegionID',
      row: 'REG_Fixture',
    });
    const orphan = findings.find((f) => f.code === 'V3-orphan-spacetype');
    expect(orphan).toBeDefined();
    expect(orphan?.table).toBe('SpaceTypes'); // stem, exactly as the validator names it
    expect(orphan?.message).toContain('SPC_SecondaryCorridor');
    // null column/row from the validator are omitted, not invented:
    expect(orphan?.column).toBeUndefined();
    expect(orphan?.row).toBeUndefined();
  });

  it('refuses JSON without an items array', () => {
    expect(() => mapValidatorJson({ dir: 'Data/WorldGen' })).toThrow(/items/);
    expect(() => mapValidatorJson(null)).toThrow(/items/);
  });
});

describe('validation endpoints (fixture repo over real HTTP)', () => {
  let fx: Fixture;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    fx = makeFixtureRepo();
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

  it('POST /api/validate/table dry-runs the guards against the on-disk file', async () => {
    const res = await fetch(
      `${baseUrl}/api/validate/table?path=${encodeURIComponent('Data/Inventory/Loot.csv')}`,
      { method: 'POST' },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as TableGuardCheckResult;
    expect(body.path).toBe('Data/Inventory/Loot.csv');
    expect(body.summaryCounts).toEqual({ ERROR: 2, WARN: 0, INFO: 0 });
    // One finding per colliding key GROUP, not per row:
    expect(body.findings).toHaveLength(2);
    const byKey = new Map(body.findings.map((f) => [f.row, f]));
    expect(byKey.get('LOOT_A')).toMatchObject({
      source: 'table-guards',
      severity: 'ERROR',
      code: 'key_collision',
      table: 'Loot',
      column: 'RowName',
      detail: { key: 'LOOT_A', rows: [1, 2, 4] },
    });
    expect(byKey.get('LOOT_C')?.detail).toEqual({ key: 'LOOT_C', rows: [5, 6] });
    expect(byKey.get('LOOT_A')?.message).toContain('rows 1, 2, 4');
    // And the on-disk file was not touched, nothing committed:
    expect(fixtureGit(fx.repoPath, ['status', '--porcelain'])).toBe('');
  });

  it('dry-run findings state the same facts as the PUT refusal', async () => {
    const entry = fixtureEntry('Loot');
    const abs = fixtureAbs(fx.repoPath, entry);
    const { payload } = readCsvFile(abs);

    const findings: Finding[] = runGuardFindings(entry, payload);
    const putResult = await writeTable(
      { repoPath: fx.repoPath, skipPythonValidation: true },
      entry.path,
      entry,
      abs,
      payload,
    );

    expect(putResult.success).toBe(false);
    if (putResult.success) throw new Error('unreachable');
    expect(putResult.reason).toBe('key_collision');
    const detail = putResult.detail as { collisions: { key: string; rows: number[] }[] };
    // Same groups, same keys, same row numbers — one implementation:
    expect(findings.map((f) => f.detail)).toEqual(
      detail.collisions.map((c) => ({ key: c.key, rows: c.rows })),
    );
    // PUT refuses iff any ERROR finding:
    expect(findings.every((f) => f.severity === 'ERROR')).toBe(true);
  });

  it('POST /api/validate/table 404s on a non-manifest path', async () => {
    const res = await fetch(
      `${baseUrl}/api/validate/table?path=${encodeURIComponent('Data/Nope.csv')}`,
      { method: 'POST' },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe('unknown_table');
  });

  it('POST /api/validate/worldgen: validator exit 1 is a 200 result with mapped findings', async () => {
    const res = await fetch(`${baseUrl}/api/validate/worldgen`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as WorldgenValidationResult;
    expect(body.exitCode).toBe(1);
    expect(Number.isNaN(Date.parse(body.ranAt))).toBe(false);
    expect(body.summaryCounts).toEqual({ ERROR: 1, WARN: 1, INFO: 0 });
    expect(body.findings).toEqual([
      {
        source: 'worldgen-validator',
        severity: 'ERROR',
        code: 'V9-fixture-error',
        table: 'GenOut',
        column: 'Value',
        row: 'G_1',
        message: 'fixture error finding',
      },
      {
        source: 'worldgen-validator',
        severity: 'WARN',
        code: 'V9-fixture-warning',
        table: 'GenOut',
        message: 'fixture warning finding',
      },
    ]);
  });

  it('POST /api/validate/worldgen 500s when the validator produces no JSON', async () => {
    // Break the stand-in validator so it dies before writing JSON:
    fs.writeFileSync(
      path.join(fx.repoPath, 'Scripts', 'validate_worldgen_metadata.py'),
      'raise SystemExit("boom, no JSON written")\n',
      'utf-8',
    );
    const res = await fetch(`${baseUrl}/api/validate/worldgen`, { method: 'POST' });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { success: boolean; detail: string };
    expect(body.success).toBe(false);
    expect(body.detail).toContain('produced no JSON');
  });
});
