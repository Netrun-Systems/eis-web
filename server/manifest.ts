import fs from 'node:fs';
import path from 'node:path';
import type { ManifestTable, TableManifest } from './types.ts';

export const MANIFEST_REL_PATH = 'Exports/TableManifest.json';

export interface LoadedManifest {
  manifest: TableManifest;
  /** manifest file mtime, ISO 8601 */
  mtime: string;
  /** normalized repo-relative path -> table entry */
  byPath: Map<string, ManifestTable>;
}

/** Normalize a repo-relative path for comparison: forward slashes, no leading
 * `./`, collapse duplicate separators. Refuses to produce anything containing
 * `..` — callers treat null as "not a manifest path". */
export function normalizeRelPath(p: string): string | null {
  const forward = p.replace(/\\/g, '/').trim();
  const parts = forward.split('/').filter((seg) => seg !== '' && seg !== '.');
  if (parts.some((seg) => seg === '..')) return null;
  if (parts.length === 0) return null;
  return parts.join('/');
}

let cache: { key: number; loaded: LoadedManifest } | null = null;

/** Load the manifest from the repo, cached on file mtime. */
export function loadManifest(repoPath: string): LoadedManifest {
  const file = path.join(repoPath, MANIFEST_REL_PATH);
  const stat = fs.statSync(file);
  if (cache && cache.key === stat.mtimeMs) return cache.loaded;
  const rawText = fs.readFileSync(file, 'utf-8');
  const raw = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
  const manifest = JSON.parse(raw) as TableManifest;
  if (!manifest || !Array.isArray(manifest.tables)) {
    throw new Error(`${MANIFEST_REL_PATH} does not have the expected {summary, tables[]} shape`);
  }
  const byPath = new Map<string, ManifestTable>();
  for (const t of manifest.tables) {
    const norm = normalizeRelPath(t.path);
    if (norm !== null) byPath.set(norm, t);
  }
  const loaded: LoadedManifest = {
    manifest,
    mtime: stat.mtime.toISOString(),
    byPath,
  };
  cache = { key: stat.mtimeMs, loaded };
  return loaded;
}

/** Resolve a caller-supplied path to a manifest-listed table, or null.
 * Anything not exactly in the manifest's path list is refused — this is the
 * whole path-traversal defence: the manifest is the allow-list. */
export function resolveManifestTable(
  repoPath: string,
  callerPath: string,
): { relPath: string; entry: ManifestTable; absPath: string } | null {
  const norm = normalizeRelPath(callerPath);
  if (norm === null) return null;
  const entry = loadManifest(repoPath).byPath.get(norm);
  if (!entry) return null;
  return { relPath: norm, entry, absPath: path.join(repoPath, ...norm.split('/')) };
}

/** True when the C++ side raw-reads this table with quoteless ParseIntoArray(",").
 * Checked via the flag, not the classification — a generated table (e.g.
 * BuildingKitCatalog) can carry the raw_read flag under another classification. */
export function isRawRead(entry: ManifestTable): boolean {
  return entry.classification === 'raw_read' || entry.flags.raw_read !== undefined;
}
