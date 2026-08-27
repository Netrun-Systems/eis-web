# eis-web

**Status: REVIVAL IN PROGRESS — branch `revival/worldgen`**

EISWeb is being rebuilt as a **world-design and CSV-authoring front-end for EISCORE**
(the Unreal Engine 5.8 project). The architecture is repo-as-database: the EISCORE
repository's CSVs are the single source of truth, every save is a file write plus a
git commit, and validation runs the EISCORE repo's own Python — the web tool never
reimplements a rule. The old in-browser simulation engine, the Express/Postgres
backend, and the stale CSV snapshot were removed in WEB-002; git history preserves
them.

## Install

```bash
npm install --legacy-peer-deps
```

`--legacy-peer-deps` is required until the React 19 peer-dependency situation in the
dependency tree is cleaned up.

Node 20+ (see `.nvmrc` / `engines`).

## Run

```bash
npm run dev    # Vite dev server on :5173
```

## Where the plan lives

The canonical charter and the `WEB-` ticket ledger live in the **EISCORE repo**:

- `Documentation/Web/EISWEB_CHARTER.md`
- `todo.md § EISWeb revival`

A one-page summary of the charter's decisions is mirrored here at
[`docs/CHARTER.md`](./docs/CHARTER.md) — on divergence, the EISCORE copy wins.

## License

Proprietary — Netrun Systems.
