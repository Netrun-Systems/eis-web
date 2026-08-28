# EISWeb Revival Charter — one-page summary

> **The founding charter document lives in the EISCORE repo at
> `Documentation/Web/EISWEB_CHARTER.md`** — on any divergence over the decisions
> below, that copy wins. **The working `WEB-` ledger and roadmap moved to THIS
> repo's [`todo.md`](../todo.md) on 2026-08-27** (D7 amended); the EISCORE
> `todo.md § EISWeb revival` section is the historical record of WEB-001–015.

**Mission**: a web/mobile app in which a designer builds a game world for EISCORE
without opening the Unreal editor — vocabulary, location briefs, story locations,
characters, quests, inventories, asset catalogues — whose output is exactly the CSV
corpus the EISCORE repo already imports.

## Decisions D1–D7 (open for override, not for drift)

| # | Decision |
|---|---|
| **D1** | Revive the eis-web repo; supplant its architecture. The old codebase was two half-applications never introduced to each other; ~20% was salvaged (world-editing core, Pixi 8 renderer, touch layer, the SQL schema as a design document) and the rest deleted in WEB-002. |
| **D2** | **Files + git are the store; no DB in the authoring path.** The backend (WEB-003) operates on a working clone of EISCORE: every read is from the live CSVs, every save is a write + validation + git commit. Git is the audit trail, the undo, and the sync. |
| **D3** | **Validation has one implementation: the EISCORE repo's Python.** The backend shells out to `validate_worldgen_metadata.py`, `location_brief.py`, the `author_*.py --check` gates, etc. TypeScript never reimplements a rule; client-side checks are UX assists, never the authority. |
| **D4** | **Generated tables are read-only in the tool.** All script-output tables (`Data/WorldGen/*`, the PCG catalogues, …) are edited via their *sources* plus a generator re-run — never directly. |
| **D5** | **Local-first.** v1 runs on the dev machine against the local clone. Hosting, auth, and git-credential handling are deferred until there is a second user. |
| **D6** | **The old UE bridge is deleted, not implemented.** `docs/UE5_BRIDGE.md` documented C++ that was never written, in the wrong direction. A new bridge is designed fresh against the real `EISRemoteControl` server in M7 (WEB-013), after M0–M3 ship. |
| **D7** | Ticket prefix `WEB-`; ledger lives in **this repo's `todo.md`** *(amended 2026-08-27 when development moved here — originally the EISCORE `todo.md`, which keeps WEB-001–015 as history)*. WG- numbering untouched and stays in EISCORE. |

## Roadmap (strictly ordered milestones)

- **M0** Contract & visibility — WEB-001 table manifest (EISCORE side), WEB-002 strip
  to the salvage core (this branch), WEB-003 repo-backed persistence spine,
  WEB-004 manifest-driven table browser.
- **M1** Vocabulary editing — WEB-005 validation service, WEB-006 vocabulary forms.
- **M2** Brief Studio — WEB-007 live `location_brief.py` verdicts.
- **M3** General CSV management — WEB-008 writable manifest-driven grid.
- **M4** DAM — WEB-009 catalogue browsers + gap dashboards.
- **M5** World canvas — WEB-010 Pixi canvas rebound to real data.
- **M6** People & story — WEB-011 NPC/quest/item/loot editors.
- **M7** Bridge & mobile — WEB-012 PWA pass, WEB-013 new UE bridge.
