import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { ManifestTable, TableManifest } from '../types.ts';

/**
 * Builds a throwaway fixture git repo shaped like a miniature EISCORE:
 * Data/ with a few tiny CSVs, Exports/TableManifest.json hand-built to match.
 * Tests never touch the real EISCORE repo.
 */

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

export interface Fixture {
  repoPath: string;
  cleanup: () => void;
}

const table = (partial: Partial<ManifestTable> & Pick<ManifestTable, 'path' | 'stem' | 'folder'>): ManifestTable => ({
  row_count: 2,
  columns: [],
  column_types: [],
  row_key: { column0: 'RowName', unique: true, rows_lost_on_import: 0 },
  classification: 'authored',
  flags: {},
  ...partial,
});

export const FIXTURE_TABLES: ManifestTable[] = [
  table({
    path: 'Data/Core/Things.csv',
    folder: 'Core',
    stem: 'Things',
    columns: ['RowName', 'ThingId', 'DisplayName', 'Tags'],
  }),
  table({
    path: 'Data/PCG/RawParts.csv',
    folder: 'PCG',
    stem: 'RawParts',
    columns: ['RowName', 'PartId', 'Notes'],
    classification: 'raw_read',
    flags: { raw_read: { source: 'fixture' } },
  }),
  table({
    path: 'Data/WorldGen/GenOut.csv',
    folder: 'WorldGen',
    stem: 'GenOut',
    columns: ['RowName', 'Value'],
    classification: 'generated',
    flags: { generated: { generator: 'Scripts/fixture_generator.py' } },
  }),
  table({
    path: 'Data/Legacy_Import/Old.csv',
    folder: 'Legacy_Import',
    stem: 'Old',
    columns: ['Name', 'Value'],
    classification: 'legacy',
    flags: { legacy: { source: 'fixture legacy folder' } },
  }),
  // WEB-005: a table whose ON-DISK content collides on column 0, for the
  // dry-run guard endpoint (a miniature LootTables).
  table({
    path: 'Data/Inventory/Loot.csv',
    folder: 'Inventory',
    stem: 'Loot',
    columns: ['RowName', 'LootId', 'Item'],
    row_count: 6,
    row_key: { column0: 'RowName', unique: false, rows_lost_on_import: 3 },
  }),
];

const FILES: Record<string, string> = {
  // CRLF file — line-ending preservation is asserted against this one.
  'Data/Core/Things.csv':
    'RowName,ThingId,DisplayName,Tags\r\nTHING_A,THING_A,Thing A,alpha|beta\r\nTHING_B,THING_B,Thing B,beta\r\n',
  // LF file, raw-read.
  'Data/PCG/RawParts.csv': 'RowName,PartId,Notes\nPART_1,PART_1,fine\nPART_2,PART_2,also fine\n',
  'Data/WorldGen/GenOut.csv': 'RowName,Value\nG_1,G_1\nG_2,G_2\n',
  'Data/Legacy_Import/Old.csv': 'Name,Value\nOLD_1,1\nOLD_2,2\n',
  // WEB-005: colliding keys ON DISK — LOOT_A x3, LOOT_C x2 (3 rows lost).
  'Data/Inventory/Loot.csv':
    'RowName,LootId,Item\n' +
    'LOOT_A,LOOT_A,Sword\n' +
    'LOOT_A,LOOT_A,Shield\n' +
    'LOOT_B,LOOT_B,Potion\n' +
    'LOOT_A,LOOT_A,Gem\n' +
    'LOOT_C,LOOT_C,Coin\n' +
    'LOOT_C,LOOT_C,Ring\n',
  // WEB-005: stand-in worldgen validator — same CLI contract as the real
  // Scripts/validate_worldgen_metadata.py (--dir, --json <file>), emits one
  // ERROR + one WARNING item and exits 1 (errors found), so tests can prove
  // exit 1 is a result, not an HTTP failure.
  'Scripts/validate_worldgen_metadata.py': [
    'import json, sys',
    'args = sys.argv[1:]',
    'out = args[args.index("--json") + 1] if "--json" in args else None',
    'payload = {"dir": "Data/WorldGen", "items": [',
    '  {"severity": "ERROR", "rule": "V9-fixture-error", "table": "GenOut",',
    '   "column": "Value", "row": "G_1", "detail": "fixture error finding"},',
    '  {"severity": "WARNING", "rule": "V9-fixture-warning", "table": "GenOut",',
    '   "column": None, "row": None, "detail": "fixture warning finding"},',
    ']}',
    'if out:',
    '    with open(out, "w") as fh:',
    '        json.dump(payload, fh)',
    'sys.exit(1)',
    '',
  ].join('\n'),
  // WEB-004: the two allow-listed dashboard reports.
  'Documentation/World/WORLDGEN_BACKLOG.md':
    '# World-Gen Metadata — Still Needed\n\nFixture backlog body.\n',
  'Documentation/World/ASSET_GAPS.md': '# Asset Gaps\n\nFixture gap report body.\n',
};

export function makeFixtureRepo(): Fixture {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'eisweb-fixture-'));
  for (const [rel, content] of Object.entries(FILES)) {
    const abs = path.join(repoPath, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  }
  const manifest: TableManifest = {
    summary: {
      total_tables: FIXTURE_TABLES.length,
      classification_counts: {},
      raw_read_flagged: 1,
    },
    tables: FIXTURE_TABLES,
  };
  const exportsDir = path.join(repoPath, 'Exports');
  fs.mkdirSync(exportsDir, { recursive: true });
  fs.writeFileSync(
    path.join(exportsDir, 'TableManifest.json'),
    JSON.stringify(manifest, null, 1),
    'utf-8',
  );
  git(repoPath, ['init', '-q']);
  git(repoPath, ['config', 'user.name', 'Fixture']);
  git(repoPath, ['config', 'user.email', 'fixture@example.invalid']);
  git(repoPath, ['config', 'core.autocrlf', 'false']);
  git(repoPath, ['add', '-A']);
  git(repoPath, ['commit', '-q', '-m', 'fixture: initial corpus']);
  return {
    repoPath,
    cleanup: () => {
      fs.rmSync(repoPath, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// WEB-006 — worldgen fixture: a mini Data/WorldGen + WorldGen_Extensions with
// stand-in normalize / group-tokens / validator scripts that honour the SAME
// CLI contracts as the real ones (normalize merges base -> ext -> web ->
// patch -> web.patch; the validator takes --dir/--json, exits 1 iff errors).
// ---------------------------------------------------------------------------

const WG_SPACETYPES_HEADER =
  'RowName,SpaceTypeID,DisplayName,Category,MinWidthCm,PrimaryAdjacency,Notes';

/** Data/WorldGen/SpaceTypes.csv exactly as the stand-in normalize regenerates
 * it from base + ext — the byte-identical no-web-files baseline. */
const WG_SPACETYPES_GENERATED =
  WG_SPACETYPES_HEADER +
  '\n' +
  'SPC_Lobby,SPC_Lobby,Lobby,Public,300.0,SPC_Corridor,base row\n' +
  'SPC_Corridor,SPC_Corridor,Corridor,Circulation,150.0,*,base row\n' +
  'SPC_FixtureExt,SPC_FixtureExt,Fixture Ext,Utility,120.0,SPC_Lobby,ext row\n';

const WG_GROUPTOKENS_GENERATED =
  'RowName,TokenID,Domain,MemberCount,Members,DerivationRule\n' +
  'AllFixture,AllFixture,SpaceTypes,2,SPC_Lobby|SPC_Corridor,fixture rule\n';

const WG_NORMALIZE_STANDIN = `import csv, io, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(ROOT, "Documentation", "WorldGen_Extensions")
OUT = os.path.join(ROOT, "Data", "WorldGen")
HDR = ["RowName","SpaceTypeID","DisplayName","Category","MinWidthCm","PrimaryAdjacency","Notes"]
BASE = [
  ["SPC_Lobby","SPC_Lobby","Lobby","Public","300.0","SPC_Corridor","base row"],
  ["SPC_Corridor","SPC_Corridor","Corridor","Circulation","150.0","*","base row"],
]
def read(p):
    if not os.path.isfile(p): return None
    with io.open(p, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.reader(fh))
    return rows[0], rows[1:]
rows = [list(r) for r in BASE]
names = set(r[0] for r in rows)
for suffix, label in ((".ext.csv","extension:"), (".web.csv","web:      ")):
    got = read(os.path.join(EXT, "SpaceTypes"+suffix))
    if not got: continue
    hdr, extra = got
    idx = dict((c,i) for i,c in enumerate(hdr))
    added = 0
    for er in extra:
        new = [er[idx[c]] if c in idx and idx[c] < len(er) else "" for c in HDR]
        if not new[0]: continue
        if new[0] in names:
            print("  WARNING: SpaceTypes%s row '%s' already exists, skipped" % (suffix, new[0]))
            continue
        rows.append(new); names.add(new[0]); added += 1
    if added: print("  %s %-24s +%d row(s)" % (label, "SpaceTypes", added))
by = dict((r[0], r) for r in rows)
for suffix, label in ((".patch.csv","patch:    "), (".web.patch.csv","web patch:")):
    got = read(os.path.join(EXT, "SpaceTypes"+suffix))
    if not got: continue
    hdr, prows = got
    idx = dict((c,i) for i,c in enumerate(hdr))
    applied = 0
    for pr in prows:
        def cell(c):
            i = idx.get(c, -1)
            return pr[i].strip() if 0 <= i < len(pr) else ""
        name, col = cell("RowName"), cell("Column")
        op, val = cell("Op").lower() or "append", cell("Value")
        t = by.get(name)
        if t is None or col not in HDR:
            print("  WARNING: SpaceTypes%s targets unknown row/column, skipped" % suffix)
            continue
        ci = HDR.index(col)
        if op == "set":
            t[ci] = val
        else:
            cur = [x for x in t[ci].split("|") if x.strip()]
            for tok in [x.strip() for x in val.split("|") if x.strip()]:
                if tok not in cur: cur.append(tok)
            t[ci] = "|".join(cur)
        applied += 1
    if applied: print("  %s %-24s %d applied, 0 skipped" % (label, "SpaceTypes", applied))
os.makedirs(OUT, exist_ok=True)
with io.open(os.path.join(OUT, "SpaceTypes.csv"), "w", encoding="utf-8", newline="") as fh:
    w = csv.writer(fh, lineterminator="\\n")
    w.writerow(HDR); w.writerows(rows)
print("  wrote %-28s %4d rows  %2d cols" % ("SpaceTypes.csv", len(rows), len(HDR)))
`;

const WG_GROUPTOKENS_STANDIN = `import io, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, "Data", "WorldGen", "GroupTokens.csv")
with io.open(p, "w", encoding="utf-8", newline="") as fh:
    fh.write("RowName,TokenID,Domain,MemberCount,Members,DerivationRule\\n")
    fh.write("AllFixture,AllFixture,SpaceTypes,2,SPC_Lobby|SPC_Corridor,fixture rule\\n")
`;

/** Content-sensitive stand-in validator: any PrimaryAdjacency token that is
 * not a RowName, wildcard, or the fixture group token is an ERROR (exit 1). */
const WG_VALIDATOR_STANDIN = `import csv, io, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = sys.argv[1:]
out = args[args.index("--json")+1] if "--json" in args else None
p = os.path.join(ROOT, "Data", "WorldGen", "SpaceTypes.csv")
with io.open(p, encoding="utf-8-sig", newline="") as fh:
    rows = list(csv.reader(fh))
hdr, data = rows[0], rows[1:]
ni, ai = hdr.index("RowName"), hdr.index("PrimaryAdjacency")
names = set(r[ni] for r in data)
groups = set(["AllFixture"])
wild = set(["", "*", "any", "all", "none", "n/a", "-"])
items = [{"severity": "INFO", "rule": "V0-fixture-info", "table": "SpaceTypes",
          "column": None, "row": None, "detail": "%d rows checked" % len(data)}]
errors = 0
for r in data:
    for tok in (r[ai] if ai < len(r) else "").split("|"):
        tok = tok.strip()
        if tok.lower() in wild or tok in names or tok in groups:
            continue
        items.append({"severity": "ERROR", "rule": "V2-fixture-unresolved",
                      "table": "SpaceTypes", "column": "PrimaryAdjacency",
                      "row": r[ni], "detail": "unresolved reference: %s" % tok})
        errors += 1
if out:
    with open(out, "w") as fh:
        json.dump({"dir": "Data/WorldGen", "items": items}, fh)
sys.exit(1 if errors else 0)
`;

export const WG_SPACETYPES_MANIFEST: ManifestTable = {
  path: 'Data/WorldGen/SpaceTypes.csv',
  folder: 'WorldGen',
  stem: 'SpaceTypes',
  row_count: 3,
  columns: WG_SPACETYPES_HEADER.split(','),
  column_types: WG_SPACETYPES_HEADER.split(',').map((name) => ({
    name,
    ue5_type: name === 'MinWidthCm' ? 'float' : 'FString',
    pipe_multi: name === 'PrimaryAdjacency',
    semicolon_hazard: false,
  })),
  row_key: { column0: 'RowName', unique: true, rows_lost_on_import: 0 },
  classification: 'generated',
  flags: { generated: { generator: 'Scripts/normalize_worldgen_metadata.py' } },
  foreign_keys: [
    { column: 'PrimaryAdjacency', target_table: 'SpaceTypes', target_prefix: 'SPC_' },
  ],
};

/** Layer the worldgen mini-corpus onto the base fixture repo and commit it —
 * a clean HEAD whose generated outputs are byte-identical to what the
 * stand-in generator chain reproduces (0 validator errors on HEAD). */
export function makeWorldgenFixture(): Fixture {
  const fx = makeFixtureRepo();
  const files: Record<string, string> = {
    'Data/WorldGen/SpaceTypes.csv': WG_SPACETYPES_GENERATED,
    'Data/WorldGen/GroupTokens.csv': WG_GROUPTOKENS_GENERATED,
    'Documentation/WorldGen_Extensions/SpaceTypes.ext.csv':
      WG_SPACETYPES_HEADER +
      '\n' +
      'SPC_FixtureExt,SPC_FixtureExt,Fixture Ext,Utility,120.0,SPC_Lobby,ext row\n',
    'Scripts/normalize_worldgen_metadata.py': WG_NORMALIZE_STANDIN,
    'Scripts/author_group_tokens.py': WG_GROUPTOKENS_STANDIN,
    // Replaces the WEB-005 always-fails stand-in for this fixture variant.
    'Scripts/validate_worldgen_metadata.py': WG_VALIDATOR_STANDIN,
  };
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(fx.repoPath, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  }
  // Manifest gains the SpaceTypes entry + the worldgen_reference block.
  const manifestPath = path.join(fx.repoPath, 'Exports', 'TableManifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as TableManifest;
  manifest.tables.push(WG_SPACETYPES_MANIFEST);
  manifest.worldgen_reference = {
    source: 'fixture',
    wildcards: ['', '*', 'any', 'all', 'none', 'n/a', '-'],
    adjacency_columns_accepting_categories: ['AvoidAdjacency', 'PrimaryAdjacency'],
    traversal_type_movement_modes: ['Walk', 'Climb'],
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1), 'utf-8');
  git(fx.repoPath, ['add', '-A']);
  git(fx.repoPath, ['commit', '-q', '-m', 'fixture: worldgen mini-corpus']);
  return fx;
}

// ---------------------------------------------------------------------------
// WEB-007 — briefs fixture: a Briefs/ dir with two briefs plus a stand-in
// location_brief.py honouring the real CLI contract (--brief, --json <file>,
// --quiet; exit 1 iff blockers; JSON report shaped like the real tool's).
// ---------------------------------------------------------------------------

/** Resolves (Region 'Fixture Region', structure 'Fixture Towers') -> exit 0. */
export const BRIEF_FIXTURE_OK = [
  '# A fixture brief for tests.',
  '',
  'Location:',
  'Fixture Canyon',
  '',
  'Region:',
  'Fixture Region',
  '',
  'Primary structures:',
  'Fixture Towers',
  '',
].join('\n');

/** Region resolves to nothing -> BLOCKER -> exit 1. */
export const BRIEF_FIXTURE_BAD = [
  'Location:',
  'Bad Region Site',
  '',
  'Region:',
  'Atlantis Prime',
  '',
  'Primary structures:',
  'Fixture Towers',
  '',
].join('\n');

const LOCATION_BRIEF_STANDIN = `import io, json, os, re, sys
args = sys.argv[1:]
def opt(flag):
    return args[args.index(flag) + 1] if flag in args else None
brief = opt("--brief")
out = opt("--json")
def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())
fields, key = {}, None
with io.open(brief, "r", encoding="utf-8-sig") as fh:
    for raw in fh.read().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^([A-Za-z][A-Za-z /_-]*):\\s*(.*)$", line)
        if m:
            key = m.group(1).strip().lower()
            fields.setdefault(key, [])
            if m.group(2).strip():
                fields[key].append(m.group(2).strip())
            continue
        if key:
            fields[key].append(line)
REGIONS = {"fixtureregion": "REG_Fixture"}
STRUCTS = {"fixturetower": "STR_FixtureTower", "fixturetowers": "STR_FixtureTower"}
findings = []
region_raw = (fields.get("region") or [""])[0]
region = REGIONS.get(norm(region_raw))
if not region:
    findings.append({"severity": "BLOCKER", "section": "region",
                     "detail": "Region '%s' resolves to no row in Regions.csv" % region_raw,
                     "fix": "author the region"})
structures = []
for tok in fields.get("primary structures", []):
    rn = STRUCTS.get(norm(tok))
    if rn:
        structures.append({"asked": tok, "resolved": rn})
    else:
        findings.append({"severity": "BLOCKER", "section": "structures",
                         "detail": "Primary structure '%s' resolves to no row" % tok,
                         "fix": None})
pieces = [{"piece": "Wall", "have": 3, "reasons": ["fixture enclosure"], "candidates": 0,
           "packs": [], "styles": [["Rural", 3]], "consumed": True, "consumers": ["ASM"]}]
blockers = sum(1 for f in findings if f["severity"] == "BLOCKER")
verdict = "NOT BUILDABLE" if blockers else "BUILDABLE"
result = {"brief": brief.replace("\\\\", "/"),
          "location": (fields.get("location") or [""])[0],
          "purpose": (fields.get("purpose") or [""])[0],
          "region": {"asked": region_raw, "resolved": region},
          "city_style": {"asked": "", "family": None, "chain": []},
          "structures": structures, "spaces": {"required": [], "preferred": []},
          "connections": [], "networks": [], "traversal": [], "states": [],
          "structure_coverage": [], "pieces": pieces, "rules": [],
          "verdict": verdict,
          "counts": {"blocker": blockers, "gap": 0, "note": 0, "style_substitution": 0},
          "findings": findings}
if out:
    d = os.path.dirname(os.path.abspath(out))
    if d and not os.path.isdir(d):
        os.makedirs(d)
    with io.open(out, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)
print("VERDICT: %s -- %d blocker(s), 0 gap(s), 0 note(s)" % (verdict, blockers))
sys.exit(1 if blockers else 0)
`;

/** Layer the briefs mini-corpus onto the base fixture repo and commit it. */
export function makeBriefsFixture(): Fixture {
  const fx = makeFixtureRepo();
  const files: Record<string, string> = {
    'Documentation/World/Briefs/FixtureCanyon.brief': BRIEF_FIXTURE_OK,
    'Documentation/World/Briefs/BadRegion.brief': BRIEF_FIXTURE_BAD,
    'Scripts/location_brief.py': LOCATION_BRIEF_STANDIN,
  };
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(fx.repoPath, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  }
  git(fx.repoPath, ['add', '-A']);
  git(fx.repoPath, ['commit', '-q', '-m', 'fixture: briefs mini-corpus']);
  return fx;
}

export function fixtureEntry(stem: string): ManifestTable {
  const entry = FIXTURE_TABLES.find((t) => t.stem === stem);
  if (!entry) throw new Error(`no fixture table ${stem}`);
  return entry;
}

export function fixtureAbs(repoPath: string, entry: ManifestTable): string {
  return path.join(repoPath, ...entry.path.split('/'));
}

export { git as fixtureGit };
