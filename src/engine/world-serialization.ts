// ============================================================
// EIS World Serialization — Save/Load world state to JSON
// ============================================================

import type {
  WorldMapState,
  WorldMapSaveData,
  SerializedTile,
  WorldConfig,
  WorldTile,
  WorldLocation,
  WorldObject,
  WorldPath,
  NPCLocationState,
} from './world-map-types';
import type { NPC } from './types';

const SAVE_VERSION = 1;

/** Serialize world map state to JSON-safe object */
export function serializeWorldMap(map: WorldMapState, npcs: NPC[]): WorldMapSaveData {
  const tiles: SerializedTile[] = [];
  for (let y = 0; y < map.config.height; y++) {
    for (let x = 0; x < map.config.width; x++) {
      const t = map.tiles[y][x];
      const s: SerializedTile = {
        x: t.x,
        y: t.y,
        b: t.biome,
        e: Math.round(t.elevation * 1000) / 1000,
        m: Math.round(t.moisture * 1000) / 1000,
        t: Math.round(t.temperature * 1000) / 1000,
        p: t.isPassable,
      };
      if (t.objectId) s.o = t.objectId;
      if (t.locationId) s.l = t.locationId;
      if (t.factionControl) s.f = t.factionControl;
      tiles.push(s);
    }
  }

  const npcPositions = npcs.map(n => ({
    npcId: n.id,
    x: Math.round(n.position.x * 100) / 100,
    y: Math.round(n.position.y * 100) / 100,
  }));

  return {
    version: SAVE_VERSION,
    config: map.config,
    tiles,
    locations: map.locations,
    objects: map.objects.map(o => ({
      ...o,
      currentUsers: [], // Don't persist runtime state
      lastUsedTick: 0,
    })),
    paths: map.paths,
    npcPositions,
  };
}

/** Deserialize world map from JSON */
export function deserializeWorldMap(data: WorldMapSaveData): {
  map: WorldMapState;
  npcPositions: { npcId: string; x: number; y: number }[];
} {
  const config = data.config;
  const tiles: WorldTile[][] = [];

  // Initialize empty tiles
  for (let y = 0; y < config.height; y++) {
    tiles[y] = [];
    for (let x = 0; x < config.width; x++) {
      tiles[y][x] = {
        x, y,
        biome: 'grassland',
        elevation: 0.5,
        moisture: 0.5,
        temperature: 0,
        isPassable: true,
      };
    }
  }

  // Fill from serialized data
  for (const s of data.tiles) {
    if (s.y >= 0 && s.y < config.height && s.x >= 0 && s.x < config.width) {
      tiles[s.y][s.x] = {
        x: s.x,
        y: s.y,
        biome: s.b,
        elevation: s.e,
        moisture: s.m,
        temperature: s.t,
        isPassable: s.p,
        objectId: s.o,
        locationId: s.l,
        factionControl: s.f,
      };
    }
  }

  const npcLocations = new Map<string, NPCLocationState>();
  for (const np of data.npcPositions) {
    npcLocations.set(np.npcId, {
      npcId: np.npcId,
      path: [],
      pathIndex: 0,
      interactionStartTick: 0,
      interactionDuration: 0,
      isInteracting: false,
      moveSpeed: 0.3,
    });
  }

  return {
    map: {
      config,
      tiles,
      locations: data.locations,
      objects: data.objects,
      paths: data.paths,
      npcLocations,
    },
    npcPositions: data.npcPositions,
  };
}

/** Export world to downloadable JSON string */
export function exportWorldJSON(map: WorldMapState, npcs: NPC[]): string {
  const data = serializeWorldMap(map, npcs);
  return JSON.stringify(data, null, 2);
}

/** Import world from JSON string */
export function importWorldJSON(json: string): ReturnType<typeof deserializeWorldMap> {
  const data = JSON.parse(json) as WorldMapSaveData;
  if (data.version !== SAVE_VERSION) {
    console.warn(`World save version mismatch: expected ${SAVE_VERSION}, got ${data.version}`);
  }
  return deserializeWorldMap(data);
}
