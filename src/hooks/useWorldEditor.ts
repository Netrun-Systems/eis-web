// ============================================================
// EIS World Editor Store — Zustand state management
// ============================================================

import { create } from 'zustand';
import type {
  WorldMapState,
  WorldConfig,
  EditorTool,
  EditorState,
  BiomeType,
  ObjectType,
  WorldLocation,
  WorldObject,
  LocationType,
} from '../engine/world-map-types';
import { DEFAULT_WORLD_CONFIG } from '../engine/world-map-types';
import { WorldGenerator, generateDefaultWorld } from '../engine/world-generator';
import { createWorldObject } from '../engine/object-catalog';
import { exportWorldJSON, importWorldJSON } from '../engine/world-serialization';
import { locationSystem } from '../engine/systems/location-system';
import type { WorldState } from '../engine/types';

interface WorldEditorStore {
  worldMap: WorldMapState | null;
  editor: EditorState;
  worldState: WorldState | null; // Reference to simulation world

  // Actions
  generateWorld: (config?: Partial<WorldConfig>, worldState?: WorldState) => void;
  setWorldState: (world: WorldState) => void;
  setTool: (tool: EditorTool) => void;
  setSelectedBiome: (biome: BiomeType) => void;
  setSelectedObjectType: (type: ObjectType | null) => void;
  setSelectedFaction: (faction: string | null) => void;
  setBrushSize: (size: number) => void;
  toggleOverlay: (key: keyof EditorState['showOverlays']) => void;
  selectTile: (x: number, y: number) => void;
  selectObject: (id: string | null) => void;
  selectLocation: (id: string | null) => void;
  selectNpc: (id: string | null) => void;
  setCamera: (camera: Partial<EditorState['camera']>) => void;
  paintBiome: (x: number, y: number) => void;
  placeObject: (x: number, y: number) => void;
  eraseAt: (x: number, y: number) => void;
  createLocation: (x: number, y: number, radius: number, name: string, type: LocationType) => void;
  updateLocation: (id: string, updates: Partial<WorldLocation>) => void;
  deleteLocation: (id: string) => void;
  updateObject: (id: string, updates: Partial<WorldObject>) => void;
  deleteObject: (id: string) => void;
  paintFaction: (x: number, y: number) => void;
  saveWorld: () => string | null;
  loadWorld: (json: string) => void;
}

const defaultEditor: EditorState = {
  tool: 'select',
  selectedBiome: 'grassland',
  selectedObjectType: null,
  selectedFaction: null,
  brushSize: 1,
  showOverlays: {
    biomes: true,
    factions: true,
    paths: true,
    npcs: true,
    objects: true,
    comfort: false,
    scarcity: false,
    behaviorLines: false,
    needBubbles: false,
  },
  selectedTile: null,
  selectedObjectId: null,
  selectedLocationId: null,
  selectedNpcId: null,
  camera: { x: 0, y: 0, zoom: 1 },
};

export const useWorldEditorStore = create<WorldEditorStore>((set, get) => ({
  worldMap: null,
  editor: { ...defaultEditor },
  worldState: null,

  generateWorld: (config, worldState) => {
    const cfg = { ...DEFAULT_WORLD_CONFIG, ...config };
    const generator = new WorldGenerator(cfg.seed);
    const map = generator.generate(cfg, worldState);
    locationSystem.setWorldMap(map);
    set({ worldMap: map, worldState: worldState ?? get().worldState });
  },

  setWorldState: (world) => {
    set({ worldState: world });
    const map = get().worldMap;
    if (map) {
      locationSystem.setWorldMap(map);
    }
  },

  setTool: (tool) => set(s => ({ editor: { ...s.editor, tool } })),
  setSelectedBiome: (biome) => set(s => ({ editor: { ...s.editor, selectedBiome: biome } })),
  setSelectedObjectType: (type) => set(s => ({ editor: { ...s.editor, selectedObjectType: type } })),
  setSelectedFaction: (faction) => set(s => ({ editor: { ...s.editor, selectedFaction: faction } })),
  setBrushSize: (size) => set(s => ({ editor: { ...s.editor, brushSize: Math.max(1, Math.min(5, size)) } })),

  toggleOverlay: (key) => set(s => ({
    editor: {
      ...s.editor,
      showOverlays: {
        ...s.editor.showOverlays,
        [key]: !s.editor.showOverlays[key],
      },
    },
  })),

  selectTile: (x, y) => set(s => ({
    editor: { ...s.editor, selectedTile: { x, y }, selectedObjectId: null, selectedLocationId: null },
  })),

  selectObject: (id) => set(s => ({
    editor: { ...s.editor, selectedObjectId: id, selectedTile: null, selectedLocationId: null },
  })),

  selectLocation: (id) => set(s => ({
    editor: { ...s.editor, selectedLocationId: id, selectedTile: null, selectedObjectId: null },
  })),

  selectNpc: (id) => set(s => ({
    editor: { ...s.editor, selectedNpcId: id },
  })),

  setCamera: (camera) => set(s => ({
    editor: { ...s.editor, camera: { ...s.editor.camera, ...camera } },
  })),

  paintBiome: (x, y) => {
    const { worldMap, editor } = get();
    if (!worldMap) return;
    const { width, height } = worldMap.config;
    const r = editor.brushSize - 1;
    const tiles = worldMap.tiles;

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
          if (dx * dx + dy * dy <= r * r + r) {
            tiles[ty][tx].biome = editor.selectedBiome;
            tiles[ty][tx].isPassable = editor.selectedBiome !== 'water' && editor.selectedBiome !== 'mountain';
          }
        }
      }
    }

    set({ worldMap: { ...worldMap, tiles: [...tiles] } });
  },

  placeObject: (x, y) => {
    const { worldMap, editor } = get();
    if (!worldMap || !editor.selectedObjectType) return;
    const { width, height } = worldMap.config;
    if (x < 0 || x >= width || y < 0 || y >= height) return;

    const id = `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const obj = createWorldObject(editor.selectedObjectType, x, y, id);
    if (editor.selectedFaction) obj.factionOwner = editor.selectedFaction;

    worldMap.tiles[y][x].objectId = id;
    const objects = [...worldMap.objects, obj];
    set({ worldMap: { ...worldMap, objects } });
  },

  eraseAt: (x, y) => {
    const { worldMap } = get();
    if (!worldMap) return;
    const { width, height } = worldMap.config;
    if (x < 0 || x >= width || y < 0 || y >= height) return;

    const tile = worldMap.tiles[y][x];

    // Remove object
    if (tile.objectId) {
      const objects = worldMap.objects.filter(o => o.id !== tile.objectId);
      tile.objectId = undefined;
      set({ worldMap: { ...worldMap, objects } });
      return;
    }

    // Remove location membership
    if (tile.locationId) {
      tile.locationId = undefined;
      tile.factionControl = undefined;
      set({ worldMap: { ...worldMap } });
    }
  },

  createLocation: (x, y, radius, name, type) => {
    const { worldMap } = get();
    if (!worldMap) return;

    const id = `loc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const tile = worldMap.tiles[y]?.[x];
    if (!tile) return;

    const loc: WorldLocation = {
      id,
      name,
      type,
      x,
      y,
      radius,
      biome: tile.biome,
      buildings: [],
      npcCapacity: 10,
      currentNpcs: [],
      resources: {},
      comfortModifier: 0,
      resourceScarcity: 0.5,
    };

    // Mark tiles
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx >= 0 && tx < worldMap.config.width && ty >= 0 && ty < worldMap.config.height) {
          if (dx * dx + dy * dy <= radius * radius) {
            worldMap.tiles[ty][tx].locationId = id;
          }
        }
      }
    }

    set({ worldMap: { ...worldMap, locations: [...worldMap.locations, loc] } });
  },

  updateLocation: (id, updates) => {
    const { worldMap } = get();
    if (!worldMap) return;
    const locations = worldMap.locations.map(l => l.id === id ? { ...l, ...updates } : l);
    set({ worldMap: { ...worldMap, locations } });
  },

  deleteLocation: (id) => {
    const { worldMap } = get();
    if (!worldMap) return;
    // Clear tiles
    for (const row of worldMap.tiles) {
      for (const tile of row) {
        if (tile.locationId === id) {
          tile.locationId = undefined;
        }
      }
    }
    const locations = worldMap.locations.filter(l => l.id !== id);
    set({ worldMap: { ...worldMap, locations } });
  },

  updateObject: (id, updates) => {
    const { worldMap } = get();
    if (!worldMap) return;
    const objects = worldMap.objects.map(o => o.id === id ? { ...o, ...updates } : o);
    set({ worldMap: { ...worldMap, objects } });
  },

  deleteObject: (id) => {
    const { worldMap } = get();
    if (!worldMap) return;
    // Clear from tile
    for (const row of worldMap.tiles) {
      for (const tile of row) {
        if (tile.objectId === id) {
          tile.objectId = undefined;
        }
      }
    }
    const objects = worldMap.objects.filter(o => o.id !== id);
    set({ worldMap: { ...worldMap, objects } });
  },

  paintFaction: (x, y) => {
    const { worldMap, editor } = get();
    if (!worldMap || !editor.selectedFaction) return;
    const r = editor.brushSize - 1;

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx >= 0 && tx < worldMap.config.width && ty >= 0 && ty < worldMap.config.height) {
          if (dx * dx + dy * dy <= r * r + r) {
            worldMap.tiles[ty][tx].factionControl = editor.selectedFaction;
          }
        }
      }
    }
    set({ worldMap: { ...worldMap } });
  },

  saveWorld: () => {
    const { worldMap, worldState } = get();
    if (!worldMap) return null;
    return exportWorldJSON(worldMap, worldState?.npcs ?? []);
  },

  loadWorld: (json) => {
    try {
      const { map, npcPositions } = importWorldJSON(json);
      const { worldState } = get();

      // Restore NPC positions
      if (worldState) {
        for (const np of npcPositions) {
          const npc = worldState.npcs.find(n => n.id === np.npcId);
          if (npc) {
            npc.position.x = np.x;
            npc.position.y = np.y;
          }
        }
      }

      locationSystem.setWorldMap(map);
      set({ worldMap: map });
    } catch (err) {
      console.error('Failed to load world:', err);
    }
  },
}));
