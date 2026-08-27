import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './env.ts';
import { createApp, verifyRepo } from './app.ts';
import { gitHeadShort } from './git.ts';
import { loadManifest } from './manifest.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
  const config = loadConfig(rootDir);
  const complaint = await verifyRepo(config.repoPath);
  if (complaint !== null) {
    console.error(`[eisweb-api] REFUSING TO START: ${complaint}`);
    process.exit(1);
  }
  const head = await gitHeadShort(config.repoPath);
  const manifest = loadManifest(config.repoPath);
  console.log(`[eisweb-api] EISCORE repo: ${config.repoPath}`);
  console.log(`[eisweb-api] repo HEAD:   ${head}`);
  console.log(
    `[eisweb-api] manifest:    ${manifest.manifest.summary.total_tables} tables, ` +
      `generated ${manifest.mtime}`,
  );
  const app = createApp({ repoPath: config.repoPath, corsOrigin: config.corsOrigin });
  app.listen(config.port, () => {
    console.log(`[eisweb-api] listening on http://localhost:${config.port} (CORS: ${config.corsOrigin})`);
  });
}

main().catch((err) => {
  console.error('[eisweb-api] fatal:', err);
  process.exit(1);
});
