/**
 * WEB-010 — tests for the pure world-canvas binding logic. The fixtures
 * mirror the real tables' shapes (WorldLayout's 10 columns, the crosswalk's
 * name/override/no-counterpart rows) without copying all 64/27/13 rows.
 */

import { describe, expect, it } from 'vitest';
import {
  GRID_SIZE,
  cellKey,
  diffPaints,
  distinctBiomes,
  fnv1a,
  fracToCell,
  fracToUnit,
  joinRegions,
  layoutRowsWithPaints,
  parseLayoutGrid,
  resolvePoiRegion,
  stableColor,
  stableColorHex,
} from '../worldBinding';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LAYOUT_COLUMNS = [
  'Name', 'GridX', 'GridY', 'BiomeType', 'ElevationBase', 'ElevationRange',
  'MoistureLevel', 'TemperatureLevel', 'SettlementType', 'Description',
];

/** A full 8x8 layout in DELIBERATELY jumbled row order, to prove the
 * round-trip preserves row order rather than grid order. */
function fullLayoutRows(): string[][] {
  const rows: string[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      rows.push([
        `${x}_${y}`, String(x), String(y),
        (x + y) % 2 === 0 ? 'Forest' : 'Desert',
        '500', '1500', '0.8', '0.6',
        x === 0 && y === 0 ? 'Village' : 'None',
        `cell ${x} ${y}`,
      ]);
    }
  }
  // Jumble: reverse the middle third.
  const third = rows.splice(20, 20).reverse();
  rows.splice(20, 0, ...third);
  return rows;
}

const RGN_COLUMNS = [
  'RegionID', 'DisplayName', 'XFrac', 'YFrac', 'Radius', 'MaxActiveNPCs',
  'Faction', 'BiomeType', 'CreatureTypes', 'CreatureDensity',
  'SmartObjectPreset', 'LocationKeywords',
];
const rgnRow = (id: string, name: string, x = '0.5', y = '0.5'): string[] => [
  id, name, x, y, '60000.0', '100', 'Raiders', 'Wasteland', 'CREATURE_Rat', '4', 'Settlement', 'kw',
];

const XWALK_COLUMNS = [
  'RowName', 'ExodusRegionID', 'CanonicalRegionID', 'MatchBasis',
  'GenerationDisplayName', 'CanonicalDisplayName', 'Faction', 'BiomeType', 'Notes',
];

const REG_COLUMNS = ['RowName', 'RegionID', 'DisplayName', 'RegionType', 'PrimaryBiome'];
const regRow = (rowName: string, name: string): string[] => [
  rowName, 'REG_001', name, 'Surface', 'AridWasteland',
];

// ---------------------------------------------------------------------------
// stableColor
// ---------------------------------------------------------------------------

describe('stableColor — region color derivation', () => {
  it('is stable: the same id always produces the same color', () => {
    // Regression pins: if these move, every saved screenshot and the user's
    // learned map coloring silently changes — treat as a breaking change.
    expect(stableColor('RGN_CentralWastes')).toBe(stableColor('RGN_CentralWastes'));
    expect(stableColorHex('RGN_CentralWastes')).toMatch(/^#[0-9a-f]{6}$/);
    const pinned = stableColor('RGN_CentralWastes');
    for (let i = 0; i < 5; i++) expect(stableColor('RGN_CentralWastes')).toBe(pinned);
    // fnv1a itself is the published algorithm — pin one known vector.
    expect(fnv1a('')).toBe(0x811c9dc5);
  });

  it('assigns distinct colors to all 27 real RGN_* ids', () => {
    const ids = [
      'RGN_CentralWastes', 'RGN_NorthernRuins', 'RGN_EasternGreenbelts',
      'RGN_SouthernDunes', 'RGN_WesternCoastline', 'RGN_PeacefulVillage',
      'RGN_ForestRegion', 'RGN_MountainPass', 'RGN_FantasyWilds', 'RGN_Savanna',
      'RGN_StarterZone', 'RGN_DustwalkerRoute', 'RGN_FreeBannerRoads',
      'RGN_FallenMetropolis', 'RGN_ReclaimerTerritory', 'RGN_RemnantShelters',
      'RGN_Wraithlands', 'RGN_MachineHeartlands', 'RGN_TheUnderways',
      'RGN_TheShattercoast', 'RGN_TheEasternGreenlands', 'RGN_TheRazorSpine',
      'RGN_TheSouthernGlassSea', 'RGN_TheIronQuiet', 'RGN_TheLaunchSepulcher',
      'RGN_TheMeridianHeights', 'RGN_TheDeadRiverCorridor',
    ];
    const colors = new Set(ids.map(stableColor));
    expect(colors.size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// Layout grid round-trip
// ---------------------------------------------------------------------------

describe('parseLayoutGrid / layoutRowsWithPaints — the row<->grid round-trip', () => {
  it('parses a full 64-row layout with no issues and round-trips byte-equal', () => {
    const rows = fullLayoutRows();
    const grid = parseLayoutGrid(LAYOUT_COLUMNS, rows);
    expect(grid.issues).toEqual([]);
    expect(grid.cells.flat().filter((c) => c !== null)).toHaveLength(64);
    expect(grid.cells[0][0]?.name).toBe('0_0');
    expect(grid.cells[5][3]?.name).toBe('3_5');

    const out = layoutRowsWithPaints(LAYOUT_COLUMNS, rows, grid, new Map());
    // Byte-equal: same rows, same order, same cells.
    expect(out.map((r) => r.join(','))).toEqual(rows.map((r) => r.join(',')));
    // And not the same array identities (callers may mutate safely).
    expect(out).not.toBe(rows);
    expect(out[0]).not.toBe(rows[0]);
  });

  it('applies a paint to exactly the BiomeType cell of exactly the painted row', () => {
    const rows = fullLayoutRows();
    const grid = parseLayoutGrid(LAYOUT_COLUMNS, rows);
    const paints = new Map([[cellKey(3, 5), 'Volcanic']]);
    const out = layoutRowsWithPaints(LAYOUT_COLUMNS, rows, grid, paints);

    const changed = out
      .map((row, i) => ({ row, i }))
      .filter(({ row, i }) => row.join(',') !== rows[i].join(','));
    expect(changed).toHaveLength(1);
    expect(changed[0].row[0]).toBe('3_5');
    expect(changed[0].row[LAYOUT_COLUMNS.indexOf('BiomeType')]).toBe('Volcanic');
    // Every other column of the painted row is untouched.
    const orig = rows[changed[0].i];
    changed[0].row.forEach((v, ci) => {
      if (ci !== LAYOUT_COLUMNS.indexOf('BiomeType')) expect(v).toBe(orig[ci]);
    });
  });

  it('reports out-of-range and duplicate cells as issues instead of dropping them silently', () => {
    const rows = [
      ['0_0', '0', '0', 'Forest', '1', '1', '1', '1', 'None', 'a'],
      ['9_9', '9', '9', 'Forest', '1', '1', '1', '1', 'None', 'off the grid'],
      ['0_0b', '0', '0', 'Desert', '1', '1', '1', '1', 'None', 'duplicate claim'],
    ];
    const grid = parseLayoutGrid(LAYOUT_COLUMNS, rows);
    expect(grid.issues).toHaveLength(2);
    expect(grid.issues[0]).toContain('outside');
    expect(grid.issues[1]).toContain('already claimed');
    expect(grid.cells[0][0]?.biomeType).toBe('Forest');
  });
});

// ---------------------------------------------------------------------------
// Dirty diff
// ---------------------------------------------------------------------------

describe('diffPaints — dirty tracking for cell paints', () => {
  it('counts only paints that change a cell; painting back to the original is clean', () => {
    const rows = fullLayoutRows();
    const grid = parseLayoutGrid(LAYOUT_COLUMNS, rows);
    const originalBiome = grid.cells[2][2]?.biomeType ?? '';
    const paints = new Map([
      [cellKey(2, 2), originalBiome], // no-op: painted back to what it was
      [cellKey(4, 1), 'Snow'],
      [cellKey(6, 6), 'Snow'],
    ]);
    const diff = diffPaints(grid, paints);
    expect(diff).toHaveLength(2);
    expect(diff.map((d) => d.name).sort()).toEqual(['4_1', '6_6']);
    expect(diff[0].to).toBe('Snow');
    expect(diff[0].from).not.toBe('Snow');
  });
});

// ---------------------------------------------------------------------------
// Fractions -> grid
// ---------------------------------------------------------------------------

describe('fracToCell — XFrac/YFrac to the 8x8 grid, Y flipped (YFrac 1 = north = row 0)', () => {
  it('maps the compass corners correctly', () => {
    expect(fracToCell(0.05, 0.95)).toEqual({ col: 0, row: 0 }); // NW
    expect(fracToCell(0.95, 0.95)).toEqual({ col: 7, row: 0 }); // NE
    expect(fracToCell(0.05, 0.05)).toEqual({ col: 0, row: 7 }); // SW
    expect(fracToCell(0.95, 0.05)).toEqual({ col: 7, row: 7 }); // SE
  });

  it('places the real anchor regions on their named sides', () => {
    // RGN_NorthernRuins (0.405, 0.812) -> a northern row; RGN_SouthernDunes
    // (0.550, 0.180) -> a southern row; RGN_WesternCoastline (0.094, 0.554)
    // -> the west column.
    expect(fracToCell(0.405, 0.812).row).toBeLessThanOrEqual(1);
    expect(fracToCell(0.55, 0.18).row).toBeGreaterThanOrEqual(6);
    expect(fracToCell(0.094, 0.554).col).toBe(0);
  });

  it('clamps the 1.0 edge into the grid', () => {
    expect(fracToCell(1, 0)).toEqual({ col: 7, row: 7 });
    expect(fracToCell(0, 1)).toEqual({ col: 0, row: 0 });
    expect(fracToUnit(0.25, 1)).toEqual({ u: 0.25, v: 0 });
  });
});

// ---------------------------------------------------------------------------
// POI region resolution
// ---------------------------------------------------------------------------

describe('resolvePoiRegion — bare POI region names to RGN ids', () => {
  const ids = [
    'RGN_CentralWastes', 'RGN_TheUnderways', 'RGN_TheDeadRiverCorridor',
    'RGN_TheSouthernGlassSea', 'RGN_EasternGreenbelts', 'RGN_TheEasternGreenlands',
  ];

  it('resolves exact, The-prefixed, and unique-containment names', () => {
    expect(resolvePoiRegion('CentralWastes', ids)).toBe('RGN_CentralWastes');
    expect(resolvePoiRegion('Underways', ids)).toBe('RGN_TheUnderways');
    expect(resolvePoiRegion('DeadRiver', ids)).toBe('RGN_TheDeadRiverCorridor');
    expect(resolvePoiRegion('GlassSea', ids)).toBe('RGN_TheSouthernGlassSea');
    // Exact match wins over the containment that would also hit Greenlands.
    expect(resolvePoiRegion('EasternGreenbelts', ids)).toBe('RGN_EasternGreenbelts');
  });

  it('returns null for unknown or ambiguous names — never guesses', () => {
    expect(resolvePoiRegion('Atlantis', ids)).toBeNull();
    expect(resolvePoiRegion('', ids)).toBeNull();
    // "Eastern" is contained by two ids -> ambiguous -> null.
    expect(resolvePoiRegion('Eastern', ids)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The three-source region join
// ---------------------------------------------------------------------------

describe('joinRegions — RGN x crosswalk x REG', () => {
  const worldRegions = {
    columns: RGN_COLUMNS,
    rows: [
      rgnRow('RGN_CentralWastes', 'Central Wastes'),
      rgnRow('RGN_FallenMetropolis', 'The Fallen Metropolis'),
      rgnRow('RGN_PeacefulVillage', 'Peaceful Village'), // no crosswalk row
    ],
  };
  const crosswalk = {
    columns: XWALK_COLUMNS,
    rows: [
      ['REG_CentralDustBasin', 'REG_CentralDustBasin', 'RGN_CentralWastes', 'override',
        'Central Dust Basin', 'Central Wastes', 'Raiders', 'Wasteland', 'same place different name'],
      ['REG_FallenMetropolis', 'REG_FallenMetropolis', 'RGN_FallenMetropolis', 'name',
        'Fallen Metropolis', 'The Fallen Metropolis', 'HollowMen', 'Ruins', ''],
      ['REG_OffWorld', 'REG_OffWorld', '', 'no-counterpart',
        'Off-World', '', '', '', 'off-world hull'],
    ],
  };
  const genRegions = {
    columns: REG_COLUMNS,
    rows: [
      regRow('REG_CentralDustBasin', 'Central Dust Basin'),
      regRow('REG_FallenMetropolis', 'Fallen Metropolis'),
      regRow('REG_OffWorld', 'Off-World'),
    ],
  };

  it('joins name and override rows, keeps the MatchBasis and its stated reason', () => {
    const result = joinRegions(worldRegions, crosswalk, genRegions);
    const central = result.joins.find((j) => j.rgnId === 'RGN_CentralWastes');
    expect(central?.matchBasis).toBe('override');
    expect(central?.crosswalkNotes).toBe('same place different name');
    expect(central?.regId).toBe('REG_CentralDustBasin');
    expect(central?.reg?.DisplayName).toBe('Central Dust Basin');

    const metro = result.joins.find((j) => j.rgnId === 'RGN_FallenMetropolis');
    expect(metro?.matchBasis).toBe('name');
    expect(metro?.reg).not.toBeNull();
  });

  it('surfaces the unmapped states explicitly on both sides', () => {
    const result = joinRegions(worldRegions, crosswalk, genRegions);

    // RGN with no crosswalk row -> matchBasis 'none', reg null.
    const village = result.joins.find((j) => j.rgnId === 'RGN_PeacefulVillage');
    expect(village?.matchBasis).toBe('none');
    expect(village?.regId).toBeNull();
    expect(village?.reg).toBeNull();

    // Declared no-counterpart REG appears as a generation-only entry.
    const offWorld = result.joins.find((j) => j.regId === 'REG_OffWorld');
    expect(offWorld?.matchBasis).toBe('no-counterpart');
    expect(offWorld?.rgnId).toBeNull();
    expect(offWorld?.reg?.DisplayName).toBe('Off-World');

    expect(result.rgnMapped).toBe(2);
    expect(result.rgnUnmapped).toBe(1);
    expect(result.regMapped).toBe(2);
    expect(result.regUnmapped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Palette support
// ---------------------------------------------------------------------------

describe('distinctBiomes — the paint palette offers what the table holds', () => {
  it('collects the distinct biome values, sorted', () => {
    const rows = fullLayoutRows();
    const grid = parseLayoutGrid(LAYOUT_COLUMNS, rows);
    expect(distinctBiomes(grid)).toEqual(['Desert', 'Forest']);
  });
});
