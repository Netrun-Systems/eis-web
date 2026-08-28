# eis-web

**Status: ACTIVE — M0–M6 shipped 2026-08-27; roadmap resumes at M7 (see [`todo.md`](./todo.md))**

EISWeb is the **world-design and CSV-authoring front-end for EISCORE** (the Unreal
Engine 5.8 project). The architecture is repo-as-database: the EISCORE repository's
CSVs are the single source of truth, every save is a file write plus a git commit,
and validation runs the EISCORE repo's own Python — the web tool never reimplements
a rule. The old in-browser simulation engine, the Express/Postgres backend, and the
stale CSV snapshot were removed in WEB-002; git history preserves them.

Surfaces: `/workflow` (the authoring methodology as a live stepper — the landing
page), `/philosophy` (the canonical doc, readable in-app), `/vocabulary` (world-gen
vocabulary forms over web-owned sources), `/briefs` (Brief Studio — "can we build
this?" with live coverage), `/tables` (all 203 tables; authored ones editable under
the full guard contract), `/dam` (kit coverage, inert inventory, pack registration),
`/world` (the WorldLayout canvas), `/people` `/quests` `/items` `/loot`.

## Install

```bash
npm install --legacy-peer-deps
```

`--legacy-peer-deps` is required until the React 19 peer-dependency situation in the
dependency tree is cleaned up.

Node 20+ (see `.nvmrc` / `engines`). Copy `.env.example` to `.env` and set
`EISCORE_REPO_PATH` to an EISCORE checkout on a branch carrying
`Exports/TableManifest.json`.

## Run

```bash
npm run dev:api   # Express API on :3001 (requires EISCORE_REPO_PATH)
npm run dev       # Vite dev server on :5173
npm test          # vitest
```

## Where the plan lives

**The working ledger and roadmap live here: [`todo.md`](./todo.md)** (moved from the
EISCORE repo on 2026-08-27; the EISCORE `todo.md § EISWeb revival` section is the
historical record of WEB-001–015). The charter's decisions are summarized at
[`docs/CHARTER.md`](./docs/CHARTER.md); the founding charter document remains in the
EISCORE repo at `Documentation/Web/EISWEB_CHARTER.md`.

## License

Proprietary — Netrun Systems.
