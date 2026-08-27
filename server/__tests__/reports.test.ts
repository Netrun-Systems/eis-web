import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { type Fixture, makeFixtureRepo } from './fixture.ts';

/**
 * WEB-004: GET /api/reports/:name — an allow-list of exactly two markdown
 * files, served read-only over the real express app (ephemeral port, real
 * fetch — so the 404 path is the actual HTTP behaviour, not a unit stand-in).
 */

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

describe('GET /api/reports/:name', () => {
  it('serves an allow-listed report with its content and mtime', async () => {
    const res = await fetch(`${baseUrl}/api/reports/worldgen-backlog`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      name: string;
      path: string;
      mtime: string;
      markdown: string;
    };
    expect(body.name).toBe('worldgen-backlog');
    expect(body.path).toBe('Documentation/World/WORLDGEN_BACKLOG.md');
    expect(body.markdown).toContain('Fixture backlog body.');
    // mtime is a real ISO 8601 timestamp:
    expect(body.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number.isNaN(Date.parse(body.mtime))).toBe(false);
  });

  it('404s a name outside the allow-list, returning the allow-list', async () => {
    const res = await fetch(`${baseUrl}/api/reports/CURRENT_STATE`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; reason: string; allowed: string[] };
    expect(body.success).toBe(false);
    expect(body.reason).toBe('unknown_report');
    expect(body.allowed.sort()).toEqual(['asset-gaps', 'world-philosophy', 'worldgen-backlog']);
  });

  // WEB-014: the philosophy doc — the one allow-listed path with a space in
  // its filename — serves through the same route.
  it('serves the world-philosophy document (filename with a space)', async () => {
    const res = await fetch(`${baseUrl}/api/reports/world-philosophy`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; path: string; markdown: string };
    expect(body.name).toBe('world-philosophy');
    expect(body.path).toBe('Documentation/world-development philosophy.md');
    expect(body.markdown).toContain('Procedural Spatial Infrastructure');
  });
});
