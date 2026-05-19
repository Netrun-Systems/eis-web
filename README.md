# eis-web

Web-based simulation twin / companion for the **EISCORE** Unreal Engine 5.7 project.

**Status**: STALLED — last active commit was the initial scaffold. Resume only with deliberate scoping; see `ARCHITECTURE.md` for state.

## What it is

A browser-based, PixiJS-rendered 2D simulation viewport that shares CSVs with EISCORE and syncs bidirectionally with the UE5 project over WebSocket + REST. 12 in-browser simulation systems live in `src/engine/`. A Node server (`server.mjs`) sits between the UE5 plugin (`Plugins/EISRemoteControl` in the EIS repo) and the browser.

## Architecture

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the system diagram, UE5 bridge sequence, and stalled-state notes.

## Protocol spec

See `docs/UE5_BRIDGE.md` for the WebSocket + REST protocol with the EISCORE plugin.

## Stack

| Layer | Tool |
|-------|------|
| Build | Vite |
| UI | React 18 + TypeScript + Tailwind |
| Renderer | PixiJS (2D viewport) |
| Server | Node `server.mjs` + Express-like routing |
| DB | PostgreSQL via `db/connection.ts` |

## Dev

```bash
npm install
npm run dev    # Vite dev :5173
npm run api    # Node API :3001
```

## License

Proprietary — Netrun Systems.
