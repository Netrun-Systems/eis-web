/**
 * WEB-010 — pure logic binding the world canvas to real EISCORE tables.
 *
 * The data facts this module is built on (verified against the repo,
 * 2026-08-27):
 *
 * - `Data/World/WorldLayout.csv` (64 rows, authored) is an 8x8 grid keyed
 *   `<GridX>_<GridY>` with columns Name, GridX, GridY, BiomeType,
 *   ElevationBase, ElevationRange, MoistureLevel, TemperatureLevel,
 *   SettlementType, Description. It references regions by NEITHER id nor
 *   section — the only paintable classification a cell carries is BiomeType
 *   (plus SettlementType). The canvas therefore paints BiomeType, and says so.
 * - Grid orientation: GridY 0 is north (row 0_0 is "Dense northwestern
 *   forest"; GridY 7 rows are "Southern ..."), GridX 0 is west.
 * - `Data/World/WorldRegions.csv` (27 RGN_*, raw_read) and
 *   `Data/World/WorldPOIs.csv` (raw_read) place themselves with XFrac/YFrac
 *   world fractions where YFrac 1 is north (RGN_NorthernRuins YFrac=0.812,
 *   RGN_SouthernDunes YFrac=0.180). Fractions of the world ARE fractions of
 *   the 8x8 grid, so col = floor(XFrac*8) and row = floor((1-YFrac)*8) is a
 *   data-defined mapping, not an invented projection.
 * - `Data/WorldGen/RegionCrosswalk.csv` (generated, read-only) joins REG_*
 *   generation regions to RGN_* gameplay regions with MatchBasis
 *   name | override | no-counterpart.
 * - WorldPOIs.Region holds bare names ("Underways", "DeadRiver") that
 *   resolve to RGN ids as exact `RGN_<name>`, then `RGN_The<name>`, then a
 *   unique RGN id containing the name.
 */

export const GRID_SIZE = 8;

// ---------------------------------------------------------------------------
// Generic row helpers
// ---------------------------------------------------------------------------

export type Record_ = Record<string, string>;

/** Zip one CSV row into a {column: value} record. Missing cells become ''. */
export function rowToRecord(columns: string[], row: string[]): Record_ {
  const rec: Record_ = {};
  columns.forEach((c, i) => {
    rec[c] = row[i] ?? '';
  });
  return rec;
}

export function rowsToRecords(columns: string[], rows: string[][]): Record_[] {
  return rows.map((r) => rowToRecord(columns, r));
}

// ---------------------------------------------------------------------------
// Stable colors — hand-seeded on the dust/petrol system, not the old
// hard-coded faction palette. Deterministic per id, muted (desaturated,
// mid-lightness) so hashed hues sit with the app's dust neutrals and the
// petrol accent instead of shouting over them.
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit — tiny, deterministic, good enough spread for 27 ids. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hslToRgbInt(h: number, s: number, l: number): number {
  // h in [0,360), s/l in [0,1]
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const to255 = (v: number) => Math.round((v + m) * 255);
  return (to255(r) << 16) | (to255(g) << 8) | to255(b);
}

/**
 * Stable, muted color for an id (region, biome, ...). The hue comes from the
 * hash; saturation/lightness are confined to two dusty bands so every derived
 * color reads as part of one system. Same id, same color, forever.
 */
export function stableColor(id: string): number {
  const h = fnv1a(id);
  const hue = h % 360;
  const sBand = [0.3, 0.38, 0.46][(h >>> 9) % 3];
  const lBand = [0.42, 0.5, 0.58][(h >>> 17) % 3];
  return hslToRgbInt(hue, sBand, lBand);
}

/** stableColor as a '#rrggbb' string, for DOM swatches. */
export function stableColorHex(id: string): string {
  return `#${stableColor(id).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// WorldLayout: rows <-> 8x8 grid
// ---------------------------------------------------------------------------

export interface LayoutCell {
  /** Row key, e.g. "3_5" (= <GridX>_<GridY>). */
  name: string;
  gridX: number;
  gridY: number;
  biomeType: string;
  settlementType: string;
  description: string;
  /** Full record for the inspector. */
  record: Record_;
  /** Index into the rows[][] array this cell came from. */
  rowIndex: number;
}

export interface LayoutGrid {
  /** grid[gridY][gridX]; null where no row claims the cell. */
  cells: (LayoutCell | null)[][];
  /** Problems found while parsing (out-of-range coords, duplicates, ...). */
  issues: string[];
}

/** Parse WorldLayout rows into the 8x8 grid by their GridX/GridY columns. */
export function parseLayoutGrid(columns: string[], rows: string[][]): LayoutGrid {
  const issues: string[] = [];
  const cells: (LayoutCell | null)[][] = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => null),
  );
  const xi = columns.indexOf('GridX');
  const yi = columns.indexOf('GridY');
  if (xi < 0 || yi < 0) {
    issues.push('WorldLayout has no GridX/GridY columns — cannot build the grid');
    return { cells, issues };
  }
  rows.forEach((row, rowIndex) => {
    const rec = rowToRecord(columns, row);
    const gx = Number(rec.GridX);
    const gy = Number(rec.GridY);
    if (
      !Number.isInteger(gx) ||
      !Number.isInteger(gy) ||
      gx < 0 ||
      gx >= GRID_SIZE ||
      gy < 0 ||
      gy >= GRID_SIZE
    ) {
      issues.push(`row ${rowIndex + 1} ("${row[0] ?? ''}"): GridX/GridY (${rec.GridX}, ${rec.GridY}) outside the ${GRID_SIZE}x${GRID_SIZE} grid`);
      return;
    }
    if (cells[gy][gx] !== null) {
      issues.push(`row ${rowIndex + 1} ("${row[0] ?? ''}"): cell (${gx}, ${gy}) already claimed by "${cells[gy][gx]?.name}"`);
      return;
    }
    cells[gy][gx] = {
      name: row[0] ?? '',
      gridX: gx,
      gridY: gy,
      biomeType: rec.BiomeType ?? '',
      settlementType: rec.SettlementType ?? '',
      description: rec.Description ?? '',
      record: rec,
      rowIndex,
    };
  });
  return { cells, issues };
}

/** Key for a paint map entry. */
export const cellKey = (gridX: number, gridY: number): string => `${gridX}_${gridY}`;

/**
 * Serialize the grid back over the ORIGINAL rows, applying biome paints.
 * Row order and every untouched cell are preserved byte-for-byte — with an
 * empty paint map the output equals the input (the round-trip guarantee the
 * save contract depends on).
 */
export function layoutRowsWithPaints(
  columns: string[],
  rows: string[][],
  grid: LayoutGrid,
  paints: ReadonlyMap<string, string>,
): string[][] {
  if (paints.size === 0) return rows.map((r) => [...r]);
  const bi = columns.indexOf('BiomeType');
  const byRowIndex = new Map<number, string>();
  for (const [key, biome] of paints) {
    const [gx, gy] = key.split('_').map(Number);
    const cell = grid.cells[gy]?.[gx];
    if (cell) byRowIndex.set(cell.rowIndex, biome);
  }
  return rows.map((row, i) => {
    const paint = byRowIndex.get(i);
    if (paint === undefined || bi < 0) return [...row];
    const next = [...row];
    next[bi] = paint;
    return next;
  });
}

export interface CellPaintDiff {
  name: string;
  gridX: number;
  gridY: number;
  from: string;
  to: string;
}

/** The dirty diff behind the save bar: paints that actually change a cell.
 * A cell painted back to its original biome is NOT dirty. */
export function diffPaints(
  grid: LayoutGrid,
  paints: ReadonlyMap<string, string>,
): CellPaintDiff[] {
  const out: CellPaintDiff[] = [];
  for (const [key, to] of paints) {
    const [gx, gy] = key.split('_').map(Number);
    const cell = grid.cells[gy]?.[gx];
    if (!cell) continue;
    if (cell.biomeType !== to) {
      out.push({ name: cell.name, gridX: gx, gridY: gy, from: cell.biomeType, to });
    }
  }
  return out.sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX);
}

// ---------------------------------------------------------------------------
// World fractions -> grid cells (WorldRegions.XFrac/YFrac, WorldPOIs same)
// ---------------------------------------------------------------------------

const clampIndex = (v: number): number => Math.max(0, Math.min(GRID_SIZE - 1, v));

/**
 * Map world fractions to a grid cell. XFrac 0 is west (col 0); YFrac 1 is
 * north (row 0) — the Y axis flips because WorldLayout's GridY runs
 * north->south while the frac columns run south->north (verified against
 * RGN_NorthernRuins / RGN_SouthernDunes and the 0_0 "northwestern" row).
 */
export function fracToCell(xFrac: number, yFrac: number): { col: number; row: number } {
  return {
    col: clampIndex(Math.floor(xFrac * GRID_SIZE)),
    row: clampIndex(Math.floor((1 - yFrac) * GRID_SIZE)),
  };
}

/** Same mapping in continuous [0,1] canvas space (u right, v down). */
export function fracToUnit(xFrac: number, yFrac: number): { u: number; v: number } {
  return { u: Math.max(0, Math.min(1, xFrac)), v: Math.max(0, Math.min(1, 1 - yFrac)) };
}

// ---------------------------------------------------------------------------
// POI -> region resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a WorldPOIs.Region value ("Underways", "DeadRiver") to an RGN_* id:
 * exact `RGN_<name>`, then `RGN_The<name>`, then the UNIQUE id containing the
 * name (ambiguous containment resolves to null — never guess).
 */
export function resolvePoiRegion(regionName: string, regionIds: readonly string[]): string | null {
  if (regionName === '') return null;
  const exact = `RGN_${regionName}`;
  if (regionIds.includes(exact)) return exact;
  const thePrefixed = `RGN_The${regionName}`;
  if (regionIds.includes(thePrefixed)) return thePrefixed;
  const containing = regionIds.filter((id) => id.includes(regionName));
  return containing.length === 1 ? containing[0] : null;
}

// ---------------------------------------------------------------------------
// The three-source region join: RGN (WorldRegions) x RegionCrosswalk x REG
// (WorldGen/Regions)
// ---------------------------------------------------------------------------

export type MatchBasis = 'name' | 'override' | 'no-counterpart' | 'none';

export interface RegionJoin {
  /** RGN_* gameplay id, or null for a generation region with no counterpart. */
  rgnId: string | null;
  /** REG_* generation id, or null when no crosswalk row maps this RGN. */
  regId: string | null;
  displayName: string;
  /** 'none' = the RGN has no crosswalk row at all. */
  matchBasis: MatchBasis;
  crosswalkNotes: string;
  rgn: Record_ | null;
  reg: Record_ | null;
}

export interface RegionJoinResult {
  joins: RegionJoin[];
  /** RGN_* rows with a crosswalk row (and so a generation region). */
  rgnMapped: number;
  /** RGN_* rows with no crosswalk row. */
  rgnUnmapped: number;
  /** REG_* rows that map to an RGN. */
  regMapped: number;
  /** REG_* rows declared no-counterpart (or missing a canonical id). */
  regUnmapped: number;
}

export function joinRegions(
  worldRegions: { columns: string[]; rows: string[][] },
  crosswalk: { columns: string[]; rows: string[][] },
  genRegions: { columns: string[]; rows: string[][] },
): RegionJoinResult {
  const rgnRecords = rowsToRecords(worldRegions.columns, worldRegions.rows);
  const xwalkRecords = rowsToRecords(crosswalk.columns, crosswalk.rows);
  const regRecords = rowsToRecords(genRegions.columns, genRegions.rows);

  // WorldGen/Regions column 0 is RowName (= the REG_<name> row key); the
  // crosswalk's ExodusRegionID uses those RowNames.
  const regByRowName = new Map<string, Record_>();
  for (const r of regRecords) regByRowName.set(r.RowName ?? '', r);

  const xwalkByCanonical = new Map<string, Record_>();
  const noCounterpart: Record_[] = [];
  for (const x of xwalkRecords) {
    const canonical = x.CanonicalRegionID ?? '';
    if (canonical === '') noCounterpart.push(x);
    else xwalkByCanonical.set(canonical, x);
  }

  const joins: RegionJoin[] = [];
  const seenReg = new Set<string>();

  for (const rgn of rgnRecords) {
    const rgnId = rgn.RegionID ?? '';
    const x = xwalkByCanonical.get(rgnId);
    if (x === undefined) {
      joins.push({
        rgnId,
        regId: null,
        displayName: rgn.DisplayName || rgnId,
        matchBasis: 'none',
        crosswalkNotes: '',
        rgn,
        reg: null,
      });
      continue;
    }
    const regId = x.ExodusRegionID ?? '';
    const reg = regByRowName.get(regId) ?? null;
    if (reg !== null) seenReg.add(regId);
    joins.push({
      rgnId,
      regId: regId === '' ? null : regId,
      displayName: rgn.DisplayName || rgnId,
      matchBasis: (x.MatchBasis as MatchBasis) || 'name',
      crosswalkNotes: x.Notes ?? '',
      rgn,
      reg,
    });
  }

  // Generation regions that never joined an RGN: declared no-counterpart rows
  // first, then any REG row no crosswalk row references at all.
  for (const x of noCounterpart) {
    const regId = x.ExodusRegionID ?? '';
    const reg = regByRowName.get(regId) ?? null;
    if (reg !== null) seenReg.add(regId);
    joins.push({
      rgnId: null,
      regId: regId === '' ? null : regId,
      displayName: x.GenerationDisplayName || regId,
      matchBasis: 'no-counterpart',
      crosswalkNotes: x.Notes ?? '',
      rgn: null,
      reg,
    });
  }
  for (const reg of regRecords) {
    const rowName = reg.RowName ?? '';
    if (seenReg.has(rowName)) continue;
    if (joins.some((j) => j.regId === rowName)) continue;
    joins.push({
      rgnId: null,
      regId: rowName,
      displayName: reg.DisplayName || rowName,
      matchBasis: 'none',
      crosswalkNotes: '',
      rgn: null,
      reg,
    });
  }

  const rgnMapped = joins.filter((j) => j.rgnId !== null && j.regId !== null).length;
  const rgnUnmapped = joins.filter((j) => j.rgnId !== null && j.regId === null).length;
  const regIdsJoined = new Set(
    joins.filter((j) => j.rgnId !== null && j.regId !== null).map((j) => j.regId),
  );
  const regMapped = regRecords.filter((r) => regIdsJoined.has(r.RowName ?? '')).length;
  const regUnmapped = regRecords.length - regMapped;

  return { joins, rgnMapped, rgnUnmapped, regMapped, regUnmapped };
}

// ---------------------------------------------------------------------------
// EISCORE BiomeType -> sandbox tile-texture key (reuse, not invention: only
// biomes with a faithful analog get a texture; the rest flat-fill with their
// stable color)
// ---------------------------------------------------------------------------

/** Sandbox texture keys — mirror of engine/world-map-types BiomeType. Typed
 * as string here to keep this module dependency-free and testable. */
export const EISCORE_BIOME_TEXTURE: Record<string, string> = {
  Forest: 'forest',
  Grassland: 'grassland',
  Mountain: 'mountain',
  Desert: 'desert',
  Swamp: 'swamp',
  Tundra: 'tundra',
  Urban: 'urban',
  Coastal: 'beach',
};

/** Every biome value WorldLayout currently holds (for the paint palette),
 * in a stable order. Painting is not limited to this list server-side, but
 * the palette offers only values the table already uses. */
export function distinctBiomes(grid: LayoutGrid): string[] {
  const seen = new Set<string>();
  for (const row of grid.cells) {
    for (const cell of row) {
      if (cell && cell.biomeType !== '') seen.add(cell.biomeType);
    }
  }
  return [...seen].sort();
}
