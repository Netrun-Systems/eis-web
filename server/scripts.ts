import fs from 'node:fs';
import path from 'node:path';
import { normalizeRelPath } from './manifest.ts';
import { run } from './git.ts';
import type { ScriptRunResult } from './types.ts';

/**
 * POST /api/run/:script allow-list. Nothing outside this list runs, ever, and
 * every entry spawns `python` with a fixed argument array — no shell, no
 * interpolation of user input.
 *
 * Write-behaviour verified from each script's source (2026-08-27):
 * - validate_worldgen_metadata.py writes only when --json/--markdown are
 *   passed; we pass neither -> read-only.
 * - export_table_manifest.py --check compares and exits; never writes.
 * - location_brief.py writes only with --markdown; we pass only --brief.
 * - asset_gap_report.py has exactly ONE write site (line 343), gated on
 *   --markdown, which we never pass -> read-only as invoked. (It does NOT
 *   unconditionally regenerate ASSET_GAPS.md; that only happens when a caller
 *   passes --markdown Documentation/World/ASSET_GAPS.md.)
 */
interface AllowListEntry {
  args: string[];
  note: string;
  /** Validates/augments args from the request body; returns an error string to refuse. */
  withBrief?: boolean;
}

const ALLOW_LIST: Record<string, AllowListEntry> = {
  'validate-worldgen': {
    args: ['Scripts/validate_worldgen_metadata.py', '--dir', 'Data/WorldGen'],
    note: 'read-only',
  },
  'manifest-check': {
    args: ['Scripts/export_table_manifest.py', '--check'],
    note: 'read-only',
  },
  'location-brief': {
    args: ['Scripts/location_brief.py', '--brief'],
    note: 'read-only; brief path must live under Documentation/World/Briefs/',
    withBrief: true,
  },
  'asset-gaps': {
    args: ['Scripts/asset_gap_report.py'],
    note: 'read-only as invoked (its only write site is gated on --markdown, which is never passed)',
  },
};

export function listAllowedScripts(): { name: string; note: string }[] {
  return Object.entries(ALLOW_LIST).map(([name, e]) => ({ name, note: e.note }));
}

export type RunScriptOutcome =
  | { ok: true; result: ScriptRunResult }
  | { ok: false; status: number; reason: string };

export async function runAllowedScript(
  repoPath: string,
  scriptName: string,
  briefPath: string | undefined,
): Promise<RunScriptOutcome> {
  const entry = ALLOW_LIST[scriptName];
  if (!entry) {
    return {
      ok: false,
      status: 404,
      reason: `"${scriptName}" is not in the allow-list. Allowed: ${Object.keys(ALLOW_LIST).join(', ')}`,
    };
  }
  const args = [...entry.args];
  if (entry.withBrief) {
    if (!briefPath) {
      return { ok: false, status: 400, reason: 'location-brief requires a "brief" path in the request body' };
    }
    const norm = normalizeRelPath(briefPath);
    if (norm === null || !norm.startsWith('Documentation/World/Briefs/')) {
      return {
        ok: false,
        status: 400,
        reason: 'brief path must be repo-relative under Documentation/World/Briefs/',
      };
    }
    const abs = path.join(repoPath, ...norm.split('/'));
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return { ok: false, status: 404, reason: `brief not found: ${norm}` };
    }
    args.push(norm);
  }
  const r = await run('python', args, repoPath);
  return { ok: true, result: { exitCode: r.code, stdout: r.stdout, stderr: r.stderr } };
}
