import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import {
  parseBrief,
  serializeBrief,
  spliceComments,
  spliceEntryValues,
} from '../../src/lib/briefFormat.ts';
import type { BriefCheckResult, BriefGetResult, BriefListResult, BriefPutResult } from '../types.ts';
import { BRIEF_FIXTURE_OK, type Fixture, fixtureGit, makeBriefsFixture } from './fixture.ts';

/**
 * WEB-007 — Brief Studio. The critical guarantees:
 *   - the Briefs/ directory is a hard boundary (name rule + containment);
 *   - parse is lossless on the two REAL briefs (serialize(parse(text)) ===
 *     text, byte for byte);
 *   - a check passes exit 1 + the JSON report through as a 200 result;
 *   - a draft check leaves the repo untouched;
 *   - a PUT is exactly one single-file commit, carrying the check.
 */

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

let fx: Fixture;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  fx = makeBriefsFixture();
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

const porcelain = () => fixtureGit(fx.repoPath, ['status', '--porcelain']).trim();
const head = () => fixtureGit(fx.repoPath, ['rev-parse', 'HEAD']).trim();

function putBriefReq(name: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/briefs/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('brief name rule', () => {
  const badNames = [
    'nope.txt', // wrong extension
    'two.dots.brief', // extra dot
    'has%20space.brief', // space (decoded)
    '..%2F..%2Fescape.brief', // encoded traversal -> '../..' in the segment
    '..%5C..%5Cescape.brief', // encoded backslash traversal
    '%2e%2e%2fescape.brief', // fully-encoded traversal
    '.hidden.brief', // leading dot
  ];

  it('rejects every bad name on GET, check and PUT with 400 invalid_name', async () => {
    for (const name of badNames) {
      const responses = [
        await fetch(`${baseUrl}/api/briefs/${name}`),
        await fetch(`${baseUrl}/api/briefs/${name}/check`, { method: 'POST' }),
        await putBriefReq(name, { raw: 'Location:\nX\n' }),
      ];
      for (const res of responses) {
        expect(res.status, `${name} should be rejected`).toBe(400);
        const body = (await res.json()) as { reason: string };
        expect(body.reason).toBe('invalid_name');
      }
    }
    expect(porcelain()).toBe('');
  });

  it('404s a well-formed name that does not exist', async () => {
    const res = await fetch(`${baseUrl}/api/briefs/NoSuchBrief.brief`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { reason: string }).reason).toBe('not_found');
  });
});

describe('lossless parse on the real briefs', () => {
  for (const name of ['FinancialCanyon.brief', 'DustwalkerArchive.brief']) {
    it(`serialize(parse(text)) reproduces ${name} byte-for-byte`, () => {
      const text = fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
      expect(serializeBrief(parseBrief(text))).toBe(text);
    });
  }

  it('splicing one key rewrites only that key (FinancialCanyon)', () => {
    const text = fs.readFileSync(path.join(FIXTURES_DIR, 'FinancialCanyon.brief'), 'utf-8');
    const out = spliceEntryValues(text, 'Region', ['Central Dust Basin']);
    expect(out).toContain('Region:\nCentral Dust Basin\n');
    expect(out).not.toContain('Fallen Metropolis');
    // Everything else is untouched — put the region back, get the file back.
    expect(spliceEntryValues(out, 'Region', ['Fallen Metropolis'])).toBe(text);
  });

  it('splicing the leading comment block preserves the rest', () => {
    const text = fs.readFileSync(path.join(FIXTURES_DIR, 'DustwalkerArchive.brief'), 'utf-8');
    const parsed = parseBrief(text);
    // Replacing the block with itself is the identity.
    expect(spliceComments(text, parsed.comments)).toBe(text);
    const out = spliceComments(text, ['# one line only']);
    expect(out.startsWith('# one line only\n\nLocation:')).toBe(true);
  });
});

describe('GET /api/briefs and GET /api/briefs/:name', () => {
  it('lists the fixture briefs with Location and comment count', async () => {
    const res = await fetch(`${baseUrl}/api/briefs`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as BriefListResult;
    expect(body.dir).toBe('Documentation/World/Briefs');
    expect(body.briefs.map((b) => b.name)).toEqual(['BadRegion.brief', 'FixtureCanyon.brief']);
    const canyon = body.briefs.find((b) => b.name === 'FixtureCanyon.brief')!;
    expect(canyon.location).toBe('Fixture Canyon');
    expect(canyon.commentLines).toBe(1);
  });

  it('returns raw + parsed entries in file order', async () => {
    const res = await fetch(`${baseUrl}/api/briefs/FixtureCanyon.brief`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as BriefGetResult;
    expect(body.raw).toBe(BRIEF_FIXTURE_OK);
    expect(body.parsed.comments).toEqual(['# A fixture brief for tests.']);
    expect(body.parsed.entries).toEqual([
      { key: 'Location', values: ['Fixture Canyon'], inline: false },
      { key: 'Region', values: ['Fixture Region'], inline: false },
      { key: 'Primary structures', values: ['Fixture Towers'], inline: false },
    ]);
  });
});

describe('POST /api/briefs/:name/check', () => {
  it('exit 0: BUILDABLE verdict with the JSON passed through', async () => {
    const res = await fetch(`${baseUrl}/api/briefs/FixtureCanyon.brief/check`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BriefCheckResult;
    expect(body.exitCode).toBe(0);
    expect(body.verdict).toBe('BUILDABLE');
    const result = body.result as {
      structures: { asked: string; resolved: string }[];
      pieces: { piece: string; styles: [string, number][] }[];
    };
    expect(result.structures).toEqual([{ asked: 'Fixture Towers', resolved: 'STR_FixtureTower' }]);
    expect(result.pieces[0].styles).toEqual([['Rural', 3]]);
  });

  it('exit 1 is a 200 result, not an error — blockers ride the JSON', async () => {
    const res = await fetch(`${baseUrl}/api/briefs/BadRegion.brief/check`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BriefCheckResult;
    expect(body.exitCode).toBe(1);
    expect(body.verdict).toBe('NOT BUILDABLE');
    const result = body.result as {
      counts: { blocker: number };
      findings: { severity: string; section: string; detail: string }[];
    };
    expect(result.counts.blocker).toBe(1);
    expect(result.findings[0].severity).toBe('BLOCKER');
    expect(result.findings[0].detail).toContain('Atlantis Prime');
    expect(porcelain()).toBe('');
  });
});

describe('POST /api/briefs/check-draft', () => {
  it('checks an unsaved draft and leaves the repo untouched', async () => {
    const before = head();
    const draft = BRIEF_FIXTURE_OK.replace('Fixture Region', 'Atlantis Prime');
    const res = await fetch(`${baseUrl}/api/briefs/check-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: draft }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BriefCheckResult;
    expect(body.exitCode).toBe(1);
    expect(body.verdict).toBe('NOT BUILDABLE');
    expect(porcelain()).toBe('');
    expect(head()).toBe(before);
    // And no draft temp file leaked into the repo's Briefs dir.
    const briefsDir = path.join(fx.repoPath, 'Documentation', 'World', 'Briefs');
    expect(fs.readdirSync(briefsDir).sort()).toEqual(['BadRegion.brief', 'FixtureCanyon.brief']);
  });

  it('refuses a draft over 64KB', async () => {
    const res = await fetch(`${baseUrl}/api/briefs/check-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: 'Location:\nX\n' + '#'.repeat(64 * 1024) }),
    });
    expect(res.status).toBe(413);
    expect(((await res.json()) as { reason: string }).reason).toBe('too_large');
  });
});

describe('PUT /api/briefs/:name', () => {
  it('creates a brief in exactly one single-file commit, check attached', async () => {
    const before = head();
    const raw = BRIEF_FIXTURE_OK.replace('Fixture Canyon', 'New Site');
    const res = await putBriefReq('NewSite.brief', { raw });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BriefPutResult;
    if (!body.success) throw new Error(`PUT failed: ${JSON.stringify(body)}`);
    expect(body.check.exitCode).toBe(0);
    expect(body.check.verdict).toBe('BUILDABLE');

    // Exactly one new commit, exactly one file, the promised message.
    expect(fixtureGit(fx.repoPath, ['rev-parse', 'HEAD~1']).trim()).toBe(before);
    expect(head().startsWith(body.commit)).toBe(true);
    const show = fixtureGit(fx.repoPath, ['show', '--name-only', '--format=%s', 'HEAD']).trim();
    const [subject, ...files] = show.split('\n').filter((l) => l.trim() !== '');
    expect(subject).toBe('eisweb: brief NewSite.brief');
    expect(files).toEqual(['Documentation/World/Briefs/NewSite.brief']);
    expect(porcelain()).toBe('');
    // The bytes on disk are exactly what was sent.
    expect(
      fs.readFileSync(
        path.join(fx.repoPath, 'Documentation', 'World', 'Briefs', 'NewSite.brief'),
        'utf-8',
      ),
    ).toBe(raw);
  });

  it('a NOT BUILDABLE brief still commits — no rollback on exit 1', async () => {
    const raw = BRIEF_FIXTURE_OK.replace('Fixture Region', 'Atlantis Prime');
    const res = await putBriefReq('Ambitious.brief', { raw });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BriefPutResult;
    if (!body.success) throw new Error(`PUT failed: ${JSON.stringify(body)}`);
    expect(body.check.exitCode).toBe(1);
    expect(body.check.verdict).toBe('NOT BUILDABLE');
    expect(porcelain()).toBe('');
    expect(
      fs.existsSync(path.join(fx.repoPath, 'Documentation', 'World', 'Briefs', 'Ambitious.brief')),
    ).toBe(true);
  });

  it('refuses a brief with no Location: key, committing nothing', async () => {
    const before = head();
    const res = await putBriefReq('NoLocation.brief', { raw: 'Region:\nFixture Region\n' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { reason: string }).reason).toBe('missing_location');
    expect(head()).toBe(before);
    expect(porcelain()).toBe('');
  });

  it('refuses to bury an uncommitted hand edit (dirty guard)', async () => {
    const abs = path.join(fx.repoPath, 'Documentation', 'World', 'Briefs', 'FixtureCanyon.brief');
    fs.writeFileSync(abs, BRIEF_FIXTURE_OK + 'Gameplay:\nhand edit in progress\n', 'utf-8');
    const res = await putBriefReq('FixtureCanyon.brief', { raw: BRIEF_FIXTURE_OK });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { reason: string }).reason).toBe('file_dirty');
    // The hand edit survives.
    expect(fs.readFileSync(abs, 'utf-8')).toContain('hand edit in progress');
  });
});
