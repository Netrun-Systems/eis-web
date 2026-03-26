// ============================================================
// EIS Web — Express API Server
// Mounts all route modules and starts WebSocket server
//
// Run:  npx tsx src/api/index.ts
// ============================================================

import express from 'express';
import http from 'http';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import multer from 'multer';
import { npcRouter } from './routes/npcs.js';
import { factionRouter } from './routes/factions.js';
import { relationshipRouter } from './routes/relationships.js';
import { simulationRouter } from './routes/simulation.js';
import { csvRouter } from './routes/csv.js';
import { setupWebSocket } from './ws.js';
import sql from '../../db/connection.js';

const PORT = parseInt(process.env.API_PORT ?? '3001', 10);

const app  = express();
const server = http.createServer(app);

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/npcs',        npcRouter);
app.use('/api/factions',    factionRouter);
app.use('/api/relationships', relationshipRouter);
app.use('/api/simulation',  simulationRouter);
app.use('/api/csv',         csvRouter);

// Basic health check
app.get('/health', async (_req, res) => {
  try {
    const [row] = await sql`SELECT NOW() AS now`;
    res.json({ status: 'ok', db_time: row.now });
  } catch {
    res.status(503).json({ status: 'error', detail: 'DB unreachable' });
  }
});

// ─── WebSocket ────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/api/ws' });
setupWebSocket(wss, sql);

// ─── Start ────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`EIS API listening on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/api/ws`);
});

export { app, server };
