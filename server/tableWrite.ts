import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  ManifestTable,
  WriteRequestBody,
  WriteResult,
} from './types.ts';
import { detectEol, writeCsvAtomic, type AtomicWriteOptions, type Eol } from './csv.ts';
import { checkClassification, runHardRuleGuards } from './guards.ts';
import { gitAddAndCommit, gitDiffStat, gitFileStatus, run } from './git.ts';

export interface WriteContext {
  repoPath: string;
  /** Test seam, forwarded to writeCsvAtomic. */
  atomicOptions?: AtomicWriteOptions;
  /** Test seam: skip the Python validator even when the path would demand it. */
  skipPythonValidation?: boolean;
}

/**
 * The mutation contract (WEB-003), in this exact order:
 *   1. classification guard   2. dirty guard   3. hard-rule guards (§5)
 *   4. atomic write + round-trip re-read       5. validation report
 *   6. git add (that file only) + commit
 * Every outcome is {success, ...} — never a bare boolean; a failure at or
 * after step 4 cannot leave a torn file (temp-file + rename).
 */
export async function writeTable(
  ctx: WriteContext,
  relPath: string,
  entry: ManifestTable,
  absPath: string,
  body: WriteRequestBody,
): Promise<WriteResult> {
  const payload = { columns: body.columns, rows: body.rows };
  if (!Array.isArray(payload.columns) || !Array.isArray(payload.rows)) {
    return { success: false, reason: 'bad_request', detail: 'body must carry {columns: string[], rows: string[][]}' };
  }
  if (payload.columns.length === 0) {
    return { success: false, reason: 'bad_request', detail: 'columns must not be empty' };
  }

  // 1 — classification guard
  const classificationRefusal = checkClassification(entry);
  if (classificationRefusal) return classificationRefusal;

  // 2 — dirty guard: never bury someone's in-progress hand edit
  let status: string;
  try {
    status = await gitFileStatus(ctx.repoPath, relPath);
  } catch (err) {
    return { success: false, reason: 'git_error', detail: String(err) };
  }
  if (status !== '') {
    const diffStat = await gitDiffStat(ctx.repoPath, relPath);
    return {
      success: false,
      reason: 'file_dirty',
      detail: {
        message:
          `${relPath} already has uncommitted changes in the EISCORE working tree — ` +
          'commit or discard them first; EISWeb will not bury an in-progress hand edit.',
        status,
        diffStat,
      },
    };
  }

  // 3 — hard-rule guards (charter §5): refusals, not warnings
  const { failure: guardFailure, checks } = runHardRuleGuards(entry, payload);
  if (guardFailure) return guardFailure;

  // 4 — serialize preserving the file's current line endings; write to a temp
  //     file, re-read, re-parse, compare, and only then rename into place
  let eol: Eol = '\n';
  try {
    if (fs.existsSync(absPath)) eol = detectEol(fs.readFileSync(absPath, 'utf-8'));
    writeCsvAtomic(absPath, payload, eol, ctx.atomicOptions ?? {});
  } catch (err) {
    return {
      success: false,
      reason: 'write_failed',
      detail: `round-trip write failed, original file untouched: ${String(err)}`,
    };
  }

  // 5 — validation report
  let validationReport: unknown = { source: 'eisweb-hard-rule-guards', checks };
  const touchesWorldGen = relPath.startsWith('Data/WorldGen/');
  if ((touchesWorldGen || body.validate === true) && ctx.skipPythonValidation !== true) {
    const report = await runWorldgenValidator(ctx.repoPath);
    if (!report.ok) {
      // The file is written but not committed; surface that honestly.
      return {
        success: false,
        reason: 'validation_failed',
        detail: { message: 'validate_worldgen_metadata.py failed; file written but NOT committed', ...report },
      };
    }
    validationReport = report.json;
  }

  // 6 — git add <that file only> + commit
  const message =
    body.message && body.message.trim() !== ''
      ? body.message.trim()
      : `eisweb: edit ${entry.stem} (${payload.rows.length} rows)`;
  const committed = await gitAddAndCommit(ctx.repoPath, relPath, message);
  if (!committed.ok) {
    return { success: false, reason: 'commit_failed', detail: committed.detail };
  }
  return { success: true, commit: committed.commit, validationReport };
}

async function runWorldgenValidator(
  repoPath: string,
): Promise<{ ok: boolean; json?: unknown; output?: string }> {
  const tmpJson = path.join(
    os.tmpdir(),
    `eisweb-worldgen-validation-${crypto.randomBytes(6).toString('hex')}.json`,
  );
  try {
    const r = await run(
      'python',
      ['Scripts/validate_worldgen_metadata.py', '--dir', 'Data/WorldGen', '--json', tmpJson],
      repoPath,
    );
    let json: unknown = null;
    if (fs.existsSync(tmpJson)) {
      try {
        json = JSON.parse(fs.readFileSync(tmpJson, 'utf-8'));
      } catch {
        json = null;
      }
    }
    if (r.code !== 0 && json === null) {
      return { ok: false, output: (r.stdout + '\n' + r.stderr).trim() };
    }
    return { ok: true, json: json ?? { note: 'validator produced no JSON', stdout: r.stdout } };
  } finally {
    try {
      fs.rmSync(tmpJson, { force: true });
    } catch {
      /* best effort */
    }
  }
}
