import fs from 'node:fs';
import path from 'node:path';

/**
 * Tiny hand-rolled .env parser — enough for KEY=value lines, `#` comments,
 * and optional surrounding quotes. Values already present in process.env win
 * (so `EISCORE_REPO_PATH=... npm run dev:api` overrides the file).
 */
export function loadDotEnv(dir: string): void {
  const file = path.join(dir, '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf-8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export interface ServerConfig {
  repoPath: string;
  port: number;
  corsOrigin: string;
}

export function loadConfig(rootDir: string): ServerConfig {
  loadDotEnv(rootDir);
  const repoPath = process.env.EISCORE_REPO_PATH ?? '';
  const port = Number(process.env.API_PORT ?? '3001');
  return {
    repoPath,
    port: Number.isFinite(port) && port > 0 ? port : 3001,
    corsOrigin: 'http://localhost:5173',
  };
}
