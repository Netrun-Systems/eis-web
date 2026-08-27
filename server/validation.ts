import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { run } from './git.ts';
import { countFindings } from './guards.ts';
import type { Finding, FindingSeverity, WorldgenValidationResult } from './types.ts';

/**
 * WEB-005 — validate_worldgen_metadata.py as a service. The EISCORE repo's
 * Python stays the validation authority (charter D3); this module only runs
 * it (arg-array spawn, cwd = the repo, --json to a temp file) and maps its
 * JSON faithfully into the common Finding shape.
 */

export const VALIDATOR_ARGS = [
  'Scripts/validate_worldgen_metadata.py',
  '--dir',
  'Data/WorldGen',
  '--json',
] as const;

export interface RawValidatorRun {
  code: number;
  /** Parsed --json output, or null when the file was absent/unparseable. */
  json: unknown;
  stdout: string;
  stderr: string;
}

/** Low-level runner shared with the WEB-003 write path: spawn, read the temp
 * JSON, always delete it. Never throws on a non-zero exit — that is the
 * validator reporting errors, which is a result. */
export async function runValidatorRaw(repoPath: string): Promise<RawValidatorRun> {
  const tmpJson = path.join(
    os.tmpdir(),
    `eisweb-worldgen-validation-${crypto.randomBytes(6).toString('hex')}.json`,
  );
  try {
    const r = await run('python', [...VALIDATOR_ARGS, tmpJson], repoPath);
    let json: unknown = null;
    if (fs.existsSync(tmpJson)) {
      try {
        json = JSON.parse(fs.readFileSync(tmpJson, 'utf-8'));
      } catch {
        json = null;
      }
    }
    return { code: r.code, json, stdout: r.stdout, stderr: r.stderr };
  } finally {
    try {
      fs.rmSync(tmpJson, { force: true });
    } catch {
      /* best effort */
    }
  }
}

/** The validator's JSON item shape (Scripts/validate_worldgen_metadata.py,
 * Report.add): severity is "ERROR" | "WARNING" | "INFO"; table is a stem;
 * detail is the human-readable message; column/row are usually null. */
interface ValidatorItem {
  severity?: unknown;
  rule?: unknown;
  table?: unknown;
  column?: unknown;
  row?: unknown;
  detail?: unknown;
}

function mapSeverity(raw: unknown): FindingSeverity {
  if (raw === 'ERROR') return 'ERROR';
  if (raw === 'WARNING') return 'WARN';
  if (raw === 'INFO') return 'INFO';
  // Unknown literal from a future validator version: keep it visible.
  return 'WARN';
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v !== '' ? v : undefined;

/** Map the validator's {items: [...]} JSON into Finding[]. Faithful, not
 * inventive: rule -> code, detail -> message, table stays the stem the
 * validator uses, null column/row are omitted. */
export function mapValidatorJson(json: unknown): Finding[] {
  const items = (json as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) {
    throw new Error('validator JSON does not have the expected {items: [...]} shape');
  }
  return items.map((raw): Finding => {
    const item = raw as ValidatorItem;
    return {
      source: 'worldgen-validator',
      severity: mapSeverity(item.severity),
      code: str(item.rule) ?? 'unknown-rule',
      table: str(item.table),
      row: str(item.row),
      column: str(item.column),
      message: str(item.detail) ?? '(no detail)',
    };
  });
}

/** POST /api/validate/worldgen implementation. Throws (→ 5xx) only on
 * spawn/parse problems; a non-zero exit with parseable JSON is a result. */
export async function runWorldgenValidation(
  repoPath: string,
): Promise<WorldgenValidationResult> {
  const ranAt = new Date().toISOString();
  const r = await runValidatorRaw(repoPath);
  if (r.json === null) {
    throw new Error(
      `validate_worldgen_metadata.py produced no JSON (exit ${r.code}): ` +
        `${(r.stdout + '\n' + r.stderr).trim()}`,
    );
  }
  const findings = mapValidatorJson(r.json);
  return { ranAt, exitCode: r.code, findings, summaryCounts: countFindings(findings) };
}
