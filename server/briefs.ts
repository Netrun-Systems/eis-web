import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitAddAndCommit, gitFileStatus, run } from './git.ts';
import { findBriefEntry, parseBrief } from '../src/lib/briefFormat.ts';
import type {
  BriefCheckOutcome,
  BriefCheckResult,
  BriefGetResult,
  BriefListEntry,
  BriefListResult,
  BriefPutBody,
  BriefPutResult,
} from './types.ts';

/**
 * WEB-007 — Brief Studio's server side. The philosophy's "brief before
 * editor" (§1790) as an API: location briefs live in ONE directory of the
 * EISCORE repo, and `Scripts/location_brief.py --json` answers "can we
 * already build this?" for any of them — or for an unsaved draft, checked
 * against a temp file OUTSIDE the repo so iteration never touches EISCORE.
 *
 * A NOT BUILDABLE brief is a legitimate artifact: its gaps ARE the
 * environment-art backlog (§2037 Phase D). So the PUT's check is
 * informational — exit 1 never rolls a save back.
 */

export const BRIEFS_DIR = 'Documentation/World/Briefs';

/** The hard boundary: simple names only, no separators, no dots beyond the
 * one in the mandatory `.brief` extension. */
export const BRIEF_NAME_RE = /^[A-Za-z0-9_-]+\.brief$/;

export const MAX_BRIEF_BYTES = 64 * 1024;

const briefsAbsDir = (repoPath: string): string => path.join(repoPath, ...BRIEFS_DIR.split('/'));

/**
 * Name -> absolute path, or null for anything outside the rule. The regex
 * alone excludes every traversal form; the resolved-path containment check is
 * the belt-and-braces second line the charter asks for.
 */
export function briefAbsPath(repoPath: string, name: string): string | null {
  if (!BRIEF_NAME_RE.test(name)) return null;
  const dir = path.resolve(briefsAbsDir(repoPath));
  const abs = path.resolve(dir, name);
  if (path.dirname(abs) !== dir) return null;
  return abs;
}

const briefRelPath = (name: string): string => `${BRIEFS_DIR}/${name}`;

// ---------------------------------------------------------------------------
// GET /api/briefs
// ---------------------------------------------------------------------------

export function listBriefs(repoPath: string): BriefListResult {
  const dir = briefsAbsDir(repoPath);
  const briefs: BriefListEntry[] = [];
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).sort()) {
      if (!BRIEF_NAME_RE.test(name)) continue;
      const abs = path.join(dir, name);
      if (!fs.statSync(abs).isFile()) continue;
      let location = '';
      let commentLines = 0;
      try {
        const parsed = parseBrief(fs.readFileSync(abs, 'utf-8'));
        location = findBriefEntry(parsed, 'location')?.values[0] ?? '';
        commentLines = parsed.comments.length;
      } catch {
        /* unparseable file still lists, with empty metadata */
      }
      briefs.push({
        name,
        mtime: fs.statSync(abs).mtime.toISOString(),
        location,
        commentLines,
      });
    }
  }
  return { dir: BRIEFS_DIR, briefs };
}

// ---------------------------------------------------------------------------
// GET /api/briefs/:name
// ---------------------------------------------------------------------------

export function getBrief(repoPath: string, name: string): BriefGetResult | null {
  const abs = briefAbsPath(repoPath, name);
  if (abs === null) throw new Error(`invalid brief name: ${name}`);
  if (!fs.existsSync(abs)) return null;
  const raw = fs.readFileSync(abs, 'utf-8');
  const parsed = parseBrief(raw);
  return {
    name,
    raw,
    parsed: {
      comments: parsed.comments,
      entries: parsed.entries.map((e) => ({ key: e.key, values: e.values, inline: e.inline })),
    },
  };
}

// ---------------------------------------------------------------------------
// the check runner — location_brief.py --json, faithfully passed through
// ---------------------------------------------------------------------------

/**
 * Run the repo's location_brief.py against `briefPath` (repo-relative for
 * saved briefs, absolute for out-of-repo drafts), collecting its --json
 * report. Exit 0 and 1 are both RESULTS (1 = at least one blocker); only a
 * spawn/JSON failure is an error outcome.
 */
export async function runLocationBrief(
  repoPath: string,
  briefPath: string,
): Promise<BriefCheckOutcome> {
  const tmpJson = path.join(
    os.tmpdir(),
    `eisweb-brief-${crypto.randomBytes(6).toString('hex')}.json`,
  );
  try {
    const r = await run(
      'python',
      ['Scripts/location_brief.py', '--brief', briefPath, '--json', tmpJson, '--quiet'],
      repoPath,
    );
    let result: unknown = null;
    try {
      result = JSON.parse(fs.readFileSync(tmpJson, 'utf-8'));
    } catch {
      /* handled below */
    }
    if (result === null || typeof result !== 'object') {
      return {
        ok: false,
        detail:
          `location_brief.py produced no JSON report (exit ${r.code}): ` +
          (r.stdout + '\n' + r.stderr).trim().slice(-2000),
      };
    }
    const verdictRaw = (result as { verdict?: unknown }).verdict;
    const check: BriefCheckResult = {
      ranAt: new Date().toISOString(),
      exitCode: r.code,
      verdict: typeof verdictRaw === 'string' ? verdictRaw : null,
      result,
    };
    return { ok: true, check };
  } finally {
    try {
      fs.rmSync(tmpJson, { force: true });
    } catch {
      /* best effort */
    }
  }
}

/** Check a SAVED brief by name. null = no such brief. */
export async function checkBrief(
  repoPath: string,
  name: string,
): Promise<BriefCheckOutcome | null> {
  const abs = briefAbsPath(repoPath, name);
  if (abs === null) throw new Error(`invalid brief name: ${name}`);
  if (!fs.existsSync(abs)) return null;
  return runLocationBrief(repoPath, briefRelPath(name));
}

/**
 * Check an UNSAVED draft: the raw text goes to a temp file outside the repo
 * (the OS temp dir), so a designer iterates without touching EISCORE at all.
 */
export async function checkBriefDraft(
  repoPath: string,
  raw: string,
): Promise<BriefCheckOutcome> {
  const tmpBrief = path.join(
    os.tmpdir(),
    `eisweb-draft-${crypto.randomBytes(6).toString('hex')}.brief`,
  );
  try {
    fs.writeFileSync(tmpBrief, raw, 'utf-8');
    return await runLocationBrief(repoPath, tmpBrief);
  } finally {
    try {
      fs.rmSync(tmpBrief, { force: true });
    } catch {
      /* best effort */
    }
  }
}

// ---------------------------------------------------------------------------
// PUT /api/briefs/:name
// ---------------------------------------------------------------------------

/** Verbatim atomic text write: sibling temp file, re-read verification,
 * rename into place. The designer's bytes are written exactly as sent. */
function writeTextAtomic(absPath: string, content: string): void {
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(absPath)}.eisweb-${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    fs.writeFileSync(tmp, content, 'utf-8');
    const reread = fs.readFileSync(tmp, 'utf-8');
    if (reread !== content) throw new Error('round-trip check: re-read text differs');
    fs.renameSync(tmp, absPath);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
    throw err;
  }
}

/**
 * The WEB-007 mutation contract (WEB-003 pattern, one file):
 *   1. name rule + body validation (raw string, <=64KB, a Location: key)
 *   2. dirty guard on exactly that file
 *   3. atomic verbatim write (new names allowed — creating a brief)
 *   4. the coverage check — INFORMATIONAL. Exit 1 (NOT BUILDABLE) commits
 *      anyway: the gaps are the point of the artifact. Only a check that
 *      cannot run at all is reported as a failure alongside the commit.
 *   5. single-file commit `eisweb: brief <name>`; rollback on commit failure.
 */
export async function putBrief(
  repoPath: string,
  name: string,
  body: BriefPutBody,
): Promise<BriefPutResult> {
  const abs = briefAbsPath(repoPath, name);
  if (abs === null) {
    return {
      success: false,
      reason: 'invalid_name',
      detail: `brief names must match ${BRIEF_NAME_RE} and stay inside ${BRIEFS_DIR}/`,
    };
  }
  const raw = body?.raw;
  if (typeof raw !== 'string') {
    return { success: false, reason: 'bad_request', detail: 'body must carry {raw: string}' };
  }
  if (Buffer.byteLength(raw, 'utf-8') > MAX_BRIEF_BYTES) {
    return {
      success: false,
      reason: 'too_large',
      detail: `brief exceeds ${MAX_BRIEF_BYTES} bytes`,
    };
  }
  // Minimal parse guard — location_brief.py itself blocks on a missing
  // Region, but a brief with no Location: key is not a brief at all.
  const parsed = parseBrief(raw);
  const location = findBriefEntry(parsed, 'location');
  if (location === undefined || (location.values[0] ?? '') === '') {
    return {
      success: false,
      reason: 'missing_location',
      detail: "the brief has no 'Location:' key with a value — add one before saving",
    };
  }

  const rel = briefRelPath(name);
  const dirtyStatus = await gitFileStatus(repoPath, rel);
  if (dirtyStatus !== '') {
    return {
      success: false,
      reason: 'file_dirty',
      detail: {
        message:
          `${rel} has uncommitted changes in the EISCORE working tree — commit or discard ` +
          'them first; EISWeb will not bury an in-progress hand edit.',
        status: dirtyStatus,
      },
    };
  }

  const existedBefore = fs.existsSync(abs);
  const prevBytes = existedBefore ? fs.readFileSync(abs) : null;
  const rollback = (): void => {
    try {
      if (prevBytes !== null) fs.writeFileSync(abs, prevBytes);
      else fs.rmSync(abs, { force: true });
    } catch {
      /* best effort */
    }
  };

  try {
    writeTextAtomic(abs, raw);
  } catch (err) {
    rollback();
    return { success: false, reason: 'write_failed', detail: String(err) };
  }

  // 4 — informational check. No rollback on exit 1: a NOT BUILDABLE brief is
  // a legitimate artifact whose gaps are the environment-art backlog.
  const outcome = await runLocationBrief(repoPath, rel);
  const check: BriefCheckResult =
    outcome.ok
      ? outcome.check
      : {
          ranAt: new Date().toISOString(),
          exitCode: -1,
          verdict: null,
          result: null,
          failure: outcome.detail,
        };

  const message =
    body.message !== undefined && body.message.trim() !== ''
      ? body.message.trim()
      : `eisweb: brief ${name}`;
  const committed = await gitAddAndCommit(repoPath, rel, message);
  if (!committed.ok) {
    rollback();
    return { success: false, reason: 'commit_failed', detail: committed.detail };
  }

  return { success: true, name, commit: committed.commit, check };
}
