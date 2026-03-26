// ============================================================
// EIS Web — Combined frontend + API server
// Serves built Vite SPA as static files and mounts API routes
// Port: process.env.PORT (Cloud Run sets this to 8080)
// ============================================================

import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const express = (await import('express')).default;
const cors    = (await import('cors')).default;

// TypeScript API routes (resolved via tsx/esm at runtime)
const { npcRouter }          = await import('./src/api/routes/npcs.js');
const { factionRouter }      = await import('./src/api/routes/factions.js');
const { relationshipRouter } = await import('./src/api/routes/relationships.js');
const { simulationRouter }   = await import('./src/api/routes/simulation.js');
const { csvRouter }          = await import('./src/api/routes/csv.js');
const { setupWebSocket }     = await import('./src/api/ws.js');
const sql                    = (await import('./db/connection.js')).default;

const { WebSocketServer } = await import('ws');

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const app    = express();
const server = createServer(app);

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── API Routes ─────────────────────────────────────────────
app.use('/api/npcs',          npcRouter);
app.use('/api/factions',      factionRouter);
app.use('/api/relationships', relationshipRouter);
app.use('/api/simulation',    simulationRouter);
app.use('/api/csv',           csvRouter);

app.get('/health', async (_req, res) => {
  try {
    const [row] = await sql`SELECT NOW() AS now`;
    res.json({ status: 'ok', db_time: row.now });
  } catch (err) {
    res.status(503).json({ status: 'error', detail: 'DB unreachable' });
  }
});

// ── Static frontend ────────────────────────────────────────
const distDir = path.join(__dirname, 'dist');
app.use(express.static(distDir));

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API route not found' });
    return;
  }
  res.sendFile(path.join(distDir, 'index.html'));
});

// ── WebSocket ──────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/api/ws' });
setupWebSocket(wss, sql);

// ── Start ──────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`EIS Web listening on port ${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/api/ws`);
});
