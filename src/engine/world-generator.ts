// ============================================================
// EIS World Generator — Procedural world from seed
// Uses Perlin noise and the existing seeded RNG for determinism
// ============================================================

import type { SeededRNG } from './types';
import type {
  WorldConfig,
  WorldTile,
  WorldLocation,
  WorldObject,
  WorldPath,
  WorldMapState,
  BiomeType,
  LocationType,
  NPCLocationState,
} from './world-map-types';
import { DEFAULT_WORLD_CONFIG } from './world-map-types';
import { createRNG } from './rng';
import { createWorldObject } from './object-catalog';
import type { NPC, FactionDefinition, WorldState } from './types';

// ---- Compact Perlin Noise (2D, single octave) ----

function buildPermutation(rng: SeededRNG): Uint8Array {
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates shuffle with seeded RNG
  for (let i = 255; i > 0; i--) {
    const j = rng.nextInt(0, i);
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 256; i++) p[256 + i] = p[i];
  return p;
}

const GRAD2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function dot2(g: number[], x: number, y: number): number {
  return g[0] * x + g[1] * y;
}

function perlinNoise2D(x: number, y: number, perm: Uint8Array): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  const aa = perm[perm[xi] + yi];
  const ab = perm[perm[xi] + yi + 1];
  const ba = perm[perm[xi + 1] + yi];
  const bb = perm[perm[xi + 1] + yi + 1];

  const g00 = GRAD2[aa % 8];
  const g10 = GRAD2[ba % 8];
  const g01 = GRAD2[ab % 8];
  const g11 = GRAD2[bb % 8];

  const n00 = dot2(g00, xf, yf);
  const n10 = dot2(g10, xf - 1, yf);
  const n01 = dot2(g01, xf, yf - 1);
  const n11 = dot2(g11, xf - 1, yf - 1);

  const x1 = lerp(n00, n10, u);
  const x2 = lerp(n01, n11, u);
  return lerp(x1, x2, v);
}

/** Fractal Brownian Motion — multi-octave Perlin */
function fbm(x: number, y: number, perm: Uint8Array, octaves: number, lacunarity: number, gain: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmplitude = 0;

  for (let i = 0; i < octaves; i++) {
    value += perlinNoise2D(x * frequency, y * frequency, perm) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxAmplitude;
}

// ---- World Generator ----

export class WorldGenerator {
  private rng: SeededRNG;
  private perm: Uint8Array;
  private permMoisture: Uint8Array;
  private permTemp: Uint8Array;

  constructor(seed: number) {
    this.rng = createRNG(seed);
    this.perm = buildPermutation(createRNG(seed));
    this.permMoisture = buildPermutation(createRNG(seed + 1000));
    this.permTemp = buildPermutation(createRNG(seed + 2000));
  }

  generate(config: WorldConfig, worldState?: WorldState): WorldMapState {
    const tiles = this.generateTiles(config);
    const factions = worldState?.factions ?? [];
    const locations = this.placeLocations(tiles, config, factions);
    const objects = this.placeObjects(locations, config);
    const paths = this.connectLocations(locations, tiles, config);

    // Place NPCs at home locations if worldState provided
    const npcLocations = new Map<string, NPCLocationState>();
    if (worldState) {
      this.placeNPCs(worldState.npcs, locations, tiles, config, npcLocations);
    }

    // Mark tiles with location IDs
    for (const loc of locations) {
      for (let dy = -loc.radius; dy <= loc.radius; dy++) {
        for (let dx = -loc.radius; dx <= loc.radius; dx++) {
          const tx = loc.x + dx;
          const ty = loc.y + dy;
          if (tx >= 0 && tx < config.width && ty >= 0 && ty < config.height) {
            if (dx * dx + dy * dy <= loc.radius * loc.radius) {
              tiles[ty][tx].locationId = loc.id;
              if (loc.faction) {
                tiles[ty][tx].factionControl = loc.faction;
              }
            }
          }
        }
      }
    }

    // Mark tiles with object positions
    for (const obj of objects) {
      if (obj.x >= 0 && obj.x < config.width && obj.y >= 0 && obj.y < config.height) {
        tiles[obj.y][obj.x].objectId = obj.id;
      }
    }

    return {
      config,
      tiles,
      locations,
      objects,
      paths,
      npcLocations,
    };
  }

  private generateTiles(config: WorldConfig): WorldTile[][] {
    const { width, height } = config;
    const scale = 0.06; // Controls terrain feature size
    const tiles: WorldTile[][] = [];

    for (let y = 0; y < height; y++) {
      tiles[y] = [];
      for (let x = 0; x < width; x++) {
        const elevation = (fbm(x * scale, y * scale, this.perm, 3, 2.0, 0.5) + 1) / 2;
        const moisture = (fbm(x * scale * 1.2, y * scale * 1.2, this.permMoisture, 2, 2.0, 0.5) + 1) / 2;
        const temperature = (fbm(x * scale * 0.8, y * scale * 0.8, this.permTemp, 2, 2.0, 0.5) + 1) / 2;

        // Island mask — lower elevation at edges
        const cx = x / width - 0.5;
        const cy = y / height - 0.5;
        const edgeDist = 1 - 2 * Math.max(Math.abs(cx), Math.abs(cy));
        const maskedElevation = Math.max(0, Math.min(1, elevation * 0.7 + edgeDist * 0.3));

        const biome = this.deriveBiome(maskedElevation, moisture, temperature);
        const isPassable = biome !== 'water' && biome !== 'mountain';

        tiles[y][x] = {
          x,
          y,
          biome,
          elevation: maskedElevation,
          moisture,
          temperature: temperature * 2 - 1, // remap to -1..1
          isPassable,
        };
      }
    }

    return tiles;
  }

  deriveBiome(elevation: number, moisture: number, temperature?: number): BiomeType {
    if (elevation < 0.2) return 'water';
    if (elevation < 0.25) return 'beach';
    if (elevation > 0.85) return 'mountain';
    if (elevation > 0.7) {
      return (temperature ?? 0.5) < 0.3 ? 'tundra' : 'mountain';
    }
    if (moisture > 0.7 && elevation < 0.4) return 'swamp';
    if (moisture > 0.65) return 'dense_forest';
    if (moisture > 0.45) return 'forest';
    if (moisture < 0.2) return 'desert';
    if (moisture < 0.35) return 'grassland';
    return 'grassland';
  }

  private scoreHabitability(tile: WorldTile): number {
    if (!tile.isPassable) return -1;
    let score = 0;
    // Prefer mid-elevation
    score += 1 - Math.abs(tile.elevation - 0.5) * 2;
    // Prefer moderate moisture
    score += 1 - Math.abs(tile.moisture - 0.5) * 2;
    // Prefer moderate temperature
    score += 1 - Math.abs(tile.temperature) * 0.5;
    // Penalize swamp
    if (tile.biome === 'swamp') score -= 0.5;
    // Bonus for grassland/forest
    if (tile.biome === 'grassland' || tile.biome === 'forest') score += 0.3;
    return score;
  }

  placeLocations(tiles: WorldTile[][], config: WorldConfig, factions: FactionDefinition[]): WorldLocation[] {
    const locations: WorldLocation[] = [];
    const minSpacing = 8;
    const maxLocations = Math.floor((config.width * config.height) / 200);

    // Score all passable tiles
    const candidates: { x: number; y: number; score: number }[] = [];
    for (let y = 3; y < config.height - 3; y++) {
      for (let x = 3; x < config.width - 3; x++) {
        const score = this.scoreHabitability(tiles[y][x]);
        if (score > 0.3) {
          candidates.push({ x, y, score });
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    const locationTypes: LocationType[] = [
      'settlement', 'camp', 'market', 'farm', 'mine',
      'forest_clearing', 'ruins', 'shrine', 'tavern', 'workshop',
      'training_ground', 'library', 'watchtower', 'barracks',
    ];

    for (const candidate of candidates) {
      if (locations.length >= maxLocations) break;

      // Check minimum spacing
      const tooClose = locations.some(l => {
        const dx = l.x - candidate.x;
        const dy = l.y - candidate.y;
        return Math.sqrt(dx * dx + dy * dy) < minSpacing;
      });
      if (tooClose) continue;

      const tile = tiles[candidate.y][candidate.x];
      const typeIdx = this.rng.nextInt(0, locationTypes.length - 1);
      const locType = locationTypes[typeIdx];
      const radius = locType === 'settlement' ? this.rng.nextInt(3, 5)
        : locType === 'camp' ? 2
        : this.rng.nextInt(2, 3);

      const factionIdx = factions.length > 0 ? this.rng.nextInt(0, factions.length - 1) : -1;
      const faction = factionIdx >= 0 ? factions[factionIdx].name : undefined;

      const loc: WorldLocation = {
        id: `loc_${locations.length}`,
        name: this.generateLocationName(locType, tile.biome),
        type: locType,
        x: candidate.x,
        y: candidate.y,
        radius,
        biome: tile.biome,
        faction,
        buildings: [],
        npcCapacity: locType === 'settlement' ? 10 : locType === 'camp' ? 5 : 3,
        currentNpcs: [],
        resources: this.generateResources(tile.biome),
        comfortModifier: this.getBiomeComfort(tile.biome),
        resourceScarcity: this.getBiomeScarcity(tile.biome),
      };

      locations.push(loc);
    }

    return locations;
  }

  private generateLocationName(type: LocationType, biome: BiomeType): string {
    const prefixes: Record<string, string[]> = {
      settlement: ['Haven', 'Refuge', 'Village', 'Hollow', 'Rest'],
      camp: ['Camp', 'Outpost', 'Watch', 'Post'],
      market: ['Market', 'Bazaar', 'Exchange', 'Fair'],
      farm: ['Farm', 'Fields', 'Pasture', 'Orchard'],
      mine: ['Mine', 'Dig', 'Quarry', 'Pit'],
      forest_clearing: ['Glade', 'Dell', 'Grove', 'Clearing'],
      ruins: ['Ruins', 'Remnants', 'Vestiges', 'Relics'],
      shrine: ['Shrine', 'Altar', 'Sanctum', 'Chapel'],
      tavern: ['Tavern', 'Pub', 'Alehouse', 'Lodge'],
      workshop: ['Workshop', 'Foundry', 'Studio', 'Atelier'],
      training_ground: ['Arena', 'Grounds', 'Yard', 'Field'],
      library: ['Library', 'Archive', 'Study', 'Athenaeum'],
      watchtower: ['Tower', 'Bastion', 'Lookout', 'Spire'],
      barracks: ['Barracks', 'Fort', 'Garrison', 'Keep'],
      harbor: ['Harbor', 'Dock', 'Port', 'Wharf'],
    };

    const biomeSuffixes: Record<string, string[]> = {
      grassland: ['Green', 'Plain', 'Meadow'],
      forest: ['Wood', 'Shade', 'Leaf'],
      dense_forest: ['Deep', 'Dark', 'Ancient'],
      desert: ['Sand', 'Dust', 'Dune'],
      beach: ['Shore', 'Coast', 'Tide'],
      swamp: ['Mire', 'Bog', 'Murk'],
      tundra: ['Frost', 'Ice', 'Cold'],
      ruins: ['Old', 'Lost', 'Forgotten'],
      urban: ['Stone', 'Iron', 'Steel'],
      farmland: ['Gold', 'Harvest', 'Bounty'],
    };

    const pList = prefixes[type] ?? ['Place'];
    const sList = biomeSuffixes[biome] ?? ['Cross'];

    const prefix = pList[this.rng.nextInt(0, pList.length - 1)];
    const suffix = sList[this.rng.nextInt(0, sList.length - 1)];

    return `${suffix} ${prefix}`;
  }

  private generateResources(biome: BiomeType): Record<string, number> {
    const resources: Record<string, number> = {};
    switch (biome) {
      case 'forest':
      case 'dense_forest':
        resources.lumber = this.rng.nextInt(20, 60);
        resources.herbs = this.rng.nextInt(10, 30);
        resources.food = this.rng.nextInt(5, 15);
        break;
      case 'grassland':
      case 'farmland':
        resources.food = this.rng.nextInt(30, 60);
        resources.water = this.rng.nextInt(15, 30);
        break;
      case 'mountain':
      case 'tundra':
        resources.ore = this.rng.nextInt(30, 60);
        resources.stone = this.rng.nextInt(20, 40);
        break;
      case 'desert':
        resources.ore = this.rng.nextInt(5, 15);
        break;
      case 'swamp':
        resources.herbs = this.rng.nextInt(20, 40);
        resources.water = this.rng.nextInt(10, 20);
        break;
      default:
        resources.food = this.rng.nextInt(5, 15);
        resources.water = this.rng.nextInt(5, 15);
    }
    return resources;
  }

  private getBiomeComfort(biome: BiomeType): number {
    const map: Partial<Record<BiomeType, number>> = {
      grassland: 18,
      farmland: 15,
      forest: -8,
      dense_forest: -12,
      beach: 10,
      desert: -20,
      tundra: -18,
      swamp: -16,
      mountain: -12,
      urban: -5,
      ruins: 0,
    };
    return map[biome] ?? 0;
  }

  private getBiomeScarcity(biome: BiomeType): number {
    const map: Partial<Record<BiomeType, number>> = {
      grassland: 0.25,
      farmland: 0.2,
      forest: 0.5,
      dense_forest: 0.45,
      beach: 0.4,
      desert: 0.95,
      tundra: 0.85,
      swamp: 0.7,
      mountain: 0.75,
      urban: 0.65,
      ruins: 0.5,
    };
    return map[biome] ?? 0.5;
  }

  private placeObjects(locations: WorldLocation[], config: WorldConfig): WorldObject[] {
    const objects: WorldObject[] = [];
    let objIdx = 0;

    // Each location gets appropriate objects based on its type
    for (const loc of locations) {
      const templates = this.getObjectsForLocationType(loc.type);
      for (const type of templates) {
        // Place within the location radius
        const angle = this.rng.nextFloat(0, Math.PI * 2);
        const dist = this.rng.nextFloat(0, loc.radius * 0.8);
        const ox = Math.round(loc.x + Math.cos(angle) * dist);
        const oy = Math.round(loc.y + Math.sin(angle) * dist);

        if (ox >= 0 && ox < config.width && oy >= 0 && oy < config.height) {
          const id = `obj_${objIdx++}`;
          const obj = createWorldObject(type, ox, oy, id);
          if (loc.faction) obj.factionOwner = loc.faction;
          objects.push(obj);
          loc.buildings.push(id);
        }
      }
    }

    return objects;
  }

  private getObjectsForLocationType(type: LocationType): import('./world-map-types').ObjectType[] {
    switch (type) {
      case 'settlement':
        return ['well', 'cooking_fire', 'bed', 'campfire', 'bench', 'house', 'chest'];
      case 'camp':
        return ['campfire', 'tent', 'cooking_fire'];
      case 'market':
        return ['market_stall', 'market_stall', 'bench', 'notice_board'];
      case 'farm':
        return ['farm_building', 'well', 'granary', 'cooking_fire'];
      case 'mine':
        return ['ore_vein', 'ore_vein', 'crate', 'tent'];
      case 'forest_clearing':
        return ['campfire', 'berry_bush', 'herb_patch', 'sleeping_bag'];
      case 'ruins':
        return ['chest', 'library_shelf', 'notice_board'];
      case 'shrine':
        return ['temple', 'bench'];
      case 'tavern':
        return ['inn', 'tavern_table', 'tavern_table', 'bench', 'stage'];
      case 'workshop':
        return ['workbench', 'forge', 'crate', 'barrel'];
      case 'training_ground':
        return ['training_dummy', 'archery_target', 'sparring_ring'];
      case 'library':
        return ['library_shelf', 'library_shelf', 'bench'];
      case 'watchtower':
        return ['watchtower_obj', 'chest'];
      case 'barracks':
        return ['bed', 'bed', 'guard_post', 'training_dummy', 'chest'];
      case 'harbor':
        return ['market_stall', 'barrel', 'crate', 'bench'];
      default:
        return ['campfire'];
    }
  }

  connectLocations(locations: WorldLocation[], tiles: WorldTile[][], config: WorldConfig): WorldPath[] {
    const paths: WorldPath[] = [];
    if (locations.length < 2) return paths;

    // Connect each location to its nearest 2-3 neighbors
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      const distances: { idx: number; dist: number }[] = [];

      for (let j = 0; j < locations.length; j++) {
        if (i === j) continue;
        const other = locations[j];
        const dx = loc.x - other.x;
        const dy = loc.y - other.y;
        distances.push({ idx: j, dist: Math.sqrt(dx * dx + dy * dy) });
      }

      distances.sort((a, b) => a.dist - b.dist);
      const connectCount = Math.min(this.rng.nextInt(1, 3), distances.length);

      for (let c = 0; c < connectCount; c++) {
        const other = locations[distances[c].idx];
        // Check if path already exists
        const exists = paths.some(
          p => (p.from === loc.id && p.to === other.id) || (p.from === other.id && p.to === loc.id)
        );
        if (exists) continue;

        paths.push({
          id: `path_${paths.length}`,
          from: loc.id,
          to: other.id,
          waypoints: [
            { x: loc.x, y: loc.y },
            { x: other.x, y: other.y },
          ],
          type: loc.type === 'market' || other.type === 'market' ? 'trade_route' : 'road',
        });
      }
    }

    return paths;
  }

  private placeNPCs(
    npcs: NPC[],
    locations: WorldLocation[],
    tiles: WorldTile[][],
    config: WorldConfig,
    npcLocations: Map<string, NPCLocationState>,
  ): void {
    for (const npc of npcs) {
      // Try to find a matching location for the NPC's home
      let targetLoc = locations.find(l => l.name.includes(npc.homeLocation));
      if (!targetLoc && locations.length > 0) {
        targetLoc = locations[this.rng.nextInt(0, locations.length - 1)];
      }

      if (targetLoc) {
        const angle = this.rng.nextFloat(0, Math.PI * 2);
        const dist = this.rng.nextFloat(0, targetLoc.radius);
        npc.position.x = targetLoc.x + Math.cos(angle) * dist;
        npc.position.y = targetLoc.y + Math.sin(angle) * dist;

        if (targetLoc.currentNpcs.length < targetLoc.npcCapacity) {
          targetLoc.currentNpcs.push(npc.id);
        }
      } else {
        // Random passable tile
        npc.position.x = this.rng.nextFloat(2, config.width - 2);
        npc.position.y = this.rng.nextFloat(2, config.height - 2);
      }

      npcLocations.set(npc.id, {
        npcId: npc.id,
        path: [],
        pathIndex: 0,
        interactionStartTick: 0,
        interactionDuration: 0,
        isInteracting: false,
        moveSpeed: 0.3 + (npc.attributes.dexterity / 10) * 0.3,
      });
    }
  }
}

/** Generate a world with default config */
export function generateDefaultWorld(worldState?: WorldState): WorldMapState {
  const config = { ...DEFAULT_WORLD_CONFIG };
  if (worldState) {
    config.seed = worldState.rng.seed;
  }
  const generator = new WorldGenerator(config.seed);
  return generator.generate(config, worldState);
}
