// ============================================================
// EIS World Map — Type Definitions
// Tile-based world with objects, locations, and NPC behavior
// ============================================================

// --- World Configuration ---

export interface WorldConfig {
  width: number;          // Grid width in tiles (default 64)
  height: number;         // Grid height in tiles (default 64)
  tileSize: number;       // Pixels per tile for rendering (default 16)
  name: string;
  seed: number;           // For procedural generation
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  width: 64,
  height: 64,
  tileSize: 16,
  name: 'New World',
  seed: 42,
};

// --- World Tile ---

export interface WorldTile {
  x: number;
  y: number;
  biome: BiomeType;
  elevation: number;      // 0-1 (0=water, 0.3=beach, 0.5=plains, 0.8=hills, 1.0=mountain)
  moisture: number;       // 0-1 (affects vegetation)
  temperature: number;    // -1 to 1 (affects habitability)
  isPassable: boolean;
  objectId?: string;      // Placed object on this tile
  locationId?: string;    // Part of a named location
  factionControl?: string; // Faction owning this territory
}

export type BiomeType =
  | 'water' | 'beach' | 'grassland' | 'forest' | 'dense_forest'
  | 'desert' | 'tundra' | 'mountain' | 'swamp' | 'urban'
  | 'farmland' | 'ruins';

export const BIOME_COLORS: Record<BiomeType, string> = {
  water: '#1e40af',
  beach: '#fbbf24',
  grassland: '#65a30d',
  forest: '#166534',
  dense_forest: '#14532d',
  desert: '#d97706',
  tundra: '#9ca3af',
  mountain: '#6b7280',
  swamp: '#4d7c0f',
  urban: '#6b7280',
  farmland: '#a3e635',
  ruins: '#78716c',
};

export const BIOME_LABELS: Record<BiomeType, string> = {
  water: 'Water',
  beach: 'Beach',
  grassland: 'Grassland',
  forest: 'Forest',
  dense_forest: 'Dense Forest',
  desert: 'Desert',
  tundra: 'Tundra',
  mountain: 'Mountain',
  swamp: 'Swamp',
  urban: 'Urban',
  farmland: 'Farmland',
  ruins: 'Ruins',
};

// --- Named Locations ---

export interface WorldLocation {
  id: string;
  name: string;
  type: LocationType;
  x: number;              // Center tile X
  y: number;              // Center tile Y
  radius: number;         // Tiles from center
  biome: BiomeType;
  faction?: string;
  buildings: string[];    // Object IDs of buildings at this location
  npcCapacity: number;    // Max NPCs that can be here
  currentNpcs: string[];  // NPC IDs currently present
  resources: Record<string, number>; // Available resources
  comfortModifier: number; // From biome data
  resourceScarcity: number;
}

export type LocationType =
  | 'settlement' | 'camp' | 'market' | 'farm' | 'mine'
  | 'forest_clearing' | 'ruins' | 'shrine' | 'watchtower' | 'harbor'
  | 'workshop' | 'tavern' | 'training_ground' | 'library' | 'barracks';

export const LOCATION_TYPE_ICONS: Record<LocationType, string> = {
  settlement: '\u{1F3D8}',
  camp: '\u{26FA}',
  market: '\u{1F6D2}',
  farm: '\u{1F33E}',
  mine: '\u{26CF}',
  forest_clearing: '\u{1F332}',
  ruins: '\u{1F3DA}',
  shrine: '\u{26E9}',
  watchtower: '\u{1F3F0}',
  harbor: '\u{2693}',
  workshop: '\u{1F528}',
  tavern: '\u{1F37A}',
  training_ground: '\u{2694}',
  library: '\u{1F4DA}',
  barracks: '\u{1F6E1}',
};

// --- Placeable Objects ---

export interface WorldObject {
  id: string;
  name: string;
  type: ObjectType;
  category: ObjectCategory;
  x: number;
  y: number;
  icon: string;           // Emoji for rendering
  color: string;          // Hex color
  interactions: ObjectInteraction[];
  satisfiesNeed?: string; // Which NPC need this satisfies
  needSatisfactionAmount: number; // How much it satisfies
  requiredRole?: string;  // Only this role can use it
  requiredSkill?: string;
  capacity: number;       // Max NPCs using simultaneously
  currentUsers: string[]; // NPC IDs currently using
  cooldownTicks: number;  // Ticks before reuse
  lastUsedTick: number;
  durability: number;     // 0-100, degrades with use
  factionOwner?: string;
  isDestructible: boolean;
  lootTable?: string[];   // Items dropped if destroyed
}

export type ObjectCategory =
  | 'resource' | 'crafting' | 'social' | 'rest' | 'food'
  | 'water' | 'trade' | 'training' | 'defense' | 'storage'
  | 'decoration' | 'quest';

export type ObjectType =
  // Resource nodes
  | 'well' | 'spring' | 'berry_bush' | 'apple_tree' | 'ore_vein' | 'lumber_pile' | 'herb_patch'
  // Crafting stations
  | 'forge' | 'workbench' | 'cooking_fire' | 'alchemy_table' | 'loom' | 'tanning_rack'
  // Social
  | 'campfire' | 'bench' | 'tavern_table' | 'market_stall' | 'notice_board' | 'stage'
  // Rest
  | 'bed' | 'hammock' | 'tent' | 'sleeping_bag'
  // Training
  | 'training_dummy' | 'archery_target' | 'sparring_ring' | 'library_shelf'
  // Defense
  | 'wall_segment' | 'gate' | 'watchtower_obj' | 'barricade' | 'trap'
  // Storage
  | 'chest' | 'barrel' | 'crate' | 'warehouse' | 'granary'
  // Buildings (multi-tile)
  | 'house' | 'shop' | 'inn' | 'temple' | 'blacksmith' | 'farm_building' | 'guard_post';

export const OBJECT_CATEGORY_LABELS: Record<ObjectCategory, string> = {
  resource: 'Resources',
  crafting: 'Crafting',
  social: 'Social',
  rest: 'Rest',
  food: 'Food',
  water: 'Water',
  trade: 'Trade',
  training: 'Training',
  defense: 'Defense',
  storage: 'Storage',
  decoration: 'Decoration',
  quest: 'Quest',
};

export interface ObjectInteraction {
  name: string;           // "Eat", "Drink", "Craft", "Rest", "Trade", "Train"
  duration: number;       // Ticks to complete
  needsAffected: Record<string, number>; // Need changes on completion
  skillGain?: Record<string, number>;    // Skill XP gained
  itemsRequired?: Record<string, number>; // Items consumed
  itemsProduced?: Record<string, number>; // Items created
  animationRef?: string;  // UE5 animation reference
}

// --- NPC Location State (runtime) ---

export interface NPCLocationState {
  npcId: string;
  targetObjectId?: string;
  targetLocationId?: string;
  path: { x: number; y: number }[];
  pathIndex: number;
  interactionStartTick: number;
  interactionDuration: number;
  isInteracting: boolean;
  moveSpeed: number;      // Tiles per tick, based on Dexterity
}

// --- World Map State (extends WorldState) ---

export interface WorldMapState {
  config: WorldConfig;
  tiles: WorldTile[][];
  locations: WorldLocation[];
  objects: WorldObject[];
  paths: WorldPath[];     // Connections between locations
  npcLocations: Map<string, NPCLocationState>;
}

export interface WorldPath {
  id: string;
  from: string;           // Location ID
  to: string;             // Location ID
  waypoints: { x: number; y: number }[];
  type: 'road' | 'trail' | 'trade_route';
}

// --- Editor State ---

export type EditorTool =
  | 'select' | 'paint_biome' | 'place_object' | 'create_location'
  | 'place_npc' | 'erase' | 'path' | 'faction_paint';

export interface EditorState {
  tool: EditorTool;
  selectedBiome: BiomeType;
  selectedObjectType: ObjectType | null;
  selectedFaction: string | null;
  brushSize: number;
  showOverlays: {
    biomes: boolean;
    factions: boolean;
    paths: boolean;
    npcs: boolean;
    objects: boolean;
    comfort: boolean;
    scarcity: boolean;
    behaviorLines: boolean;
    needBubbles: boolean;
  };
  selectedTile: { x: number; y: number } | null;
  selectedObjectId: string | null;
  selectedLocationId: string | null;
  selectedNpcId: string | null;
  camera: {
    x: number;
    y: number;
    zoom: number;
  };
}

// --- Serialization ---

export interface WorldMapSaveData {
  version: number;
  config: WorldConfig;
  tiles: SerializedTile[];
  locations: WorldLocation[];
  objects: WorldObject[];
  paths: WorldPath[];
  npcPositions: { npcId: string; x: number; y: number }[];
}

/** Compact tile serialization — only non-default values */
export interface SerializedTile {
  x: number;
  y: number;
  b: BiomeType;
  e: number;
  m: number;
  t: number;
  p: boolean;
  o?: string;
  l?: string;
  f?: string;
}
