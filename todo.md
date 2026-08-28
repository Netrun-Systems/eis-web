# EISWeb — Development Roadmap & Ledger

> **This file is the working ledger for EISWeb development as of 2026-08-27** (moved here from
> EISCORE `todo.md § EISWeb revival`, which remains the historical record of WEB-001–015).
> Charter: `docs/CHARTER.md` (summary) · founding document `Documentation/Web/EISWEB_CHARTER.md`
> in the EISCORE repo. Decisions D1–D7 are open for override, not for drift.
>
> ⚠️ **Temporal anchor**: accurate as of 2026-08-27, branch `revival/worldgen` @ `ff4be84`.
> **Next free WEB id is WEB-016.**

---

## Context anchors (read before any task)

**What this is**: a web/mobile app in which a designer builds a game world for EISCORE without
the Unreal editor — the output is exactly the CSV corpus EISCORE imports. The EISCORE repo is
the database (files + git); the repo's Python validators are the only validation authority;
generated tables are edited via their sources + a generator re-run, never directly.

**Run**: `npm install --legacy-peer-deps` (required — React 18 vs `@pixi/react`-era peer-deps) ·
`npm run dev:api` (Express, :3001) + `npm run dev` (Vite, :5173) · `npm test` (vitest, **129
passing** as of `ff4be84`) · `npm run build` = client tsc + server tsc + vite, all must be clean.
Node ≥20 (`.nvmrc`). `.env` needs `EISCORE_REPO_PATH` pointing at an EISCORE checkout whose
branch carries `Exports/TableManifest.json` (on `feature/worldgen-refactor`); the server refuses
to boot otherwise, by design.

**Layout**: `server/` (Express spine — manifest, tables GET/PUT, validation, worldgen sources,
briefs, DAM, reports; strict-tsc via `tsconfig.server.json`) · `src/api/client.ts` (the one API
module) · `src/content/method.ts` (ALL instructional copy, §-cited against the philosophy doc —
every claim must trace to a section; no invented methodology) · `src/lib/` (guards mirror,
type inference, entity forms, key proposals — each mirrors a named EISCORE source, cited in
headers) · `src/ui/` per surface.

**Conventions earned during M0–M6 (do not relearn these the hard way):**
- **The PUT contract order is law**: classification guard → dirty-file guard → hard-rule guards →
  atomic temp+rename write with re-read verify → validation → single-file commit as
  `EISWeb <daniel@netrunsystems.com>`; every mutation returns `{success, commit, validationReport}`,
  never a bare boolean. PUT refuses iff any ERROR finding.
- **Semicolon guard split** (WEB-011): manifest-flagged *pre-existing* `;`-density hazards WARN
  and allow the save; *newly-introduced* hazards refuse. Keep the invariant when touching guards.
- **Boot proofs against the real EISCORE repo**: any positive write proof commits, then removes
  its own commit ONLY under the triple check (HEAD == returned commit ∧ porcelain empty ∧ message
  prefix matches) → `git reset --hard HEAD~1`; any mismatch → abort and report, never reset.
  GET-only proofs must leave porcelain empty.
- **Windows dev-server kills**: npm wrappers orphan the tsx/vite children — kill by port-resolved
  PID and confirm the ports are free.
- **Push**: `origin` carries a second push-URL (local forge, SSH) that fails host-key verification
  — known-cosmetic; verify GitHub with `ls-remote` against the local tip.
- **Aesthetic system** (WEB-015): light-first + `dark:` on every color; fonts display/sans/serif/
  mono tokens (serif ONLY in long-form reading); `.chip`/`btn-*`/`field`/`panel` primitives; house
  contrast rules (dust-500 is decorative-only on light ground); rust = errors/hazards only,
  amber = warnings, petrol = interactive. No raw Tailwind palette colors.

---

## Roadmap — remaining (strictly ordered stops here; M7 was deferred by design)

- [ ] **WEB-012** (M7) PWA/mobile pass: manifest + service worker (local-first — cache the app
  shell, never the API), install prompt, the salvaged touch layer audited against the new
  surfaces (canvas gestures, grid editing on small screens), viewport/typography pass at phone
  widths. The Brief Studio is the mobile killer feature — "can we build this?" from a phone.
- [ ] **WEB-013** (M7) UE bridge, designed fresh against the real `EISRemoteControl` plugin
  (a SERVER in-editor: HTTP :8080 / WS :8081 — eis-web connects as CLIENT). The old
  `docs/UE5_BRIDGE.md` was deleted under D6: it documented C++ never written, in the wrong
  direction, with zero world vocabulary. Needs a protocol design first (world/level/PCG scope,
  not just NPC ticks). Do not start before Daniel scopes what the bridge is FOR.

### Backlog candidates (unnumbered until claimed — take the next free WEB id)
- Space-graph view + §36 designer verbs (`LOCK/EXCLUDE/FORCE/RESEED/OVERRIDE/PROMOTE/PIN`) as
  persistent per-instance annotations — the deferred half of WEB-010.
- Sandbox tab retirement decision: the old JSON toy-world editor still lives behind `/world`'s
  Sandbox tab; its 784-line object catalog is design content worth mining before deletion.
- Surface `Saved/Reports/harvest_worklist.csv` in the DAM (needs a server allow-list entry;
  the file is generated by EISCORE's `harvest_worklist.py` and may be absent — handle honestly).
- NPCs `BodyPoolRow` → BodyLibrary resolution measured at **0%** (SciFiMerc_* keys absent from
  BodyLibrary) during WEB-011 — either a data gap or a wrong join assumption; investigate before
  offering a picker.
- Real-browser visual QA: every UI surface to date is compile-and-contract-verified; the Chrome
  extension never connected during M0–M6, so no page has been pixel-eyeballed by an agent.

### External dependencies (live in EISCORE `todo.md`, WG track — they gate data, not code here)
- **WG-231** `author_spacetypes_ext.py --check` self-condemning (exits 1 on pristine HEAD).
- **WG-232** `MaterialStandards.csv` Description 83% `;`-dense → the table refuses saves until
  re-punctuated (correct behavior; the data is the defect).
- **WG-233** `catalog_content_pack.py` single-pack `--write` reorder churn (byte-idempotent only
  for the last pack in `PACKS`).
- **WG-234** 11 columns of `NPCs.csv` ≥80% `;`-dense — mis-infers on the next struct regen; the
  WEB-011 guard split exists because of this. Note: `NPCs.uasset` / `DT_MaterialStandards.uasset`
  were dirty-and-unowned in the EISCORE main checkout on 2026-08-27 — check working-tree versions
  before any struct regeneration.

---

## Ledger — shipped (WEB-001–015, all 2026-08-27)

| Ticket | Commit | What |
|---|---|---|
| ✅ WEB-001 | EISCORE side | `Scripts/export_table_manifest.py` — the schema contract: 203 tables classified `authored/generated/legacy/raw_read`, UE types, FKs, hazards; `--check` gate. Found the raw-read doc-vs-code drift (authority: `EISDataTableImportCommandlet.cpp`). |
| ✅ WEB-002 | `ca29999`+`e32c509` | Strip to the salvage core: −21,437 lines; 3 routes; Node 20 pinned; boots clean. |
| ✅ WEB-003 | `1aab6ce` | Persistence spine: Express, strict-tsc; the PUT contract; 4-script run allow-list; git log per table. 10 guard tests vs fixture repos. |
| ✅ WEB-004 | `8bb177f` | Manifest-driven browser (203 tables, classification badges, hazard chips, per-table git history) + dashboard rendering the generated reports. |
| ✅ WEB-005 | `06bcbdf` | Validators as structured findings; collision findings one-per-key-group (LootTables: 37 groups = exactly 480 lost rows); shared guard computation, PUT bytes unchanged. |
| ✅ WEB-006 | `3773daa` | Vocabulary editor over web-owned `.web.csv`/`.web.patch.csv` (enabled by the EISCORE-side normalize merge layers, WEB-006a); FK pickers; validation-ERROR → byte-identical rollback, else one atomic sources+output commit. |
| ✅ WEB-007 | `3bc6d67` | Brief Studio: lossless form↔raw editing, draft checks outside the repo, every resolution shown, style column always visible; NOT BUILDABLE briefs still commit — their gaps ARE the backlog. |
| ✅ WEB-008 | `6da592e` | Writable grid: authored tables editable; live guard hints mirroring the server; §5.4 type-re-inference confirm built from `EIS_DATA_TYPEINFERENCE_v1.py`'s actual rules. |
| ✅ WEB-009 | `3485689` | DAM: CityStyle × PieceType coverage over the LIVE-parsed 16-type consumed set; inert inventory (1,219/3,451 = 35.3% measured); confirm-gated pack registration with idempotence contract. |
| ✅ WEB-010 | `0199e3f` | World canvas over the real WorldLayout schema (paint = BiomeType, the only classification the table carries); 146/146 POIs by world fraction, no invented projection; 3-way region inspector. |
| ✅ WEB-011 | `ff4be84` | People & story: NPC entity form (11 sections = exactly the 83 real columns), evidence-gated reference pickers (≥90% resolution or no picker), quests+objectives, items, `/loot` as the WG-103 collision fix path. |
| ✅ WEB-014 | `eade648` | The philosophy is the navigation: `/workflow` landing stepper in §3 dependency order with live state; sidebar re-grouped by method; §-cited MethodContext on all surfaces; full doc readable at `/philosophy`. |
| ✅ WEB-015 | `70fd04a`+`212a846` | Aesthetic pass (built on `revival/aesthetic`, merged): type system, dark mode, WCAG contrast, unified primitives; identity moment on the workflow spine. |

*(WEB-006a lives in EISCORE — `normalize_worldgen_metadata.py` web merge layers. WEB-012/013
were always M7-deferred; they are the open roadmap above.)*
