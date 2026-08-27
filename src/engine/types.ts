// ============================================================
// EISWeb — Core Type Definitions (salvage core, WEB-002)
// Pruned to what the world-editing core needs. The simulation
// half of the old type system lives in git history.
// ============================================================

// --- Seeded RNG for deterministic generation ---
export interface SeededRNG {
  seed: number;
  next(): number; // 0..1
  nextInt(min: number, max: number): number;
  nextFloat(min: number, max: number): number;
}

// --- Core NPC (kept for world placement + sprite rendering) ---

export interface NPCAttributes {
  strength: number;
  dexterity: number;
  endurance: number;
  health: number;
  intelligence: number;
  wisdom: number;
  willpower: number;
  charisma: number;
}

export interface PersonalityTraits {
  aggression: number;
  friendliness: number;
  curiosity: number;
  fearfulness: number;
  loyalty: number;
  independence: number;
  confidence: number;
  patience: number;
  honesty: number;
  empathy: number;
  resourcefulness: number;
  greed: number;
  generosity: number;
  survivalInstinct: number;
}

export interface NPCNeeds {
  hunger: number;
  thirst: number;
  rest: number;
  socialInteraction: number;
  energy: number;
  hygiene: number;
  comfort: number;
  safety: number;
  selfActualization: number;
  entertainment: number;
}

export interface TalentProfile {
  topFive: string[]; // Talent IDs
  all: Map<string, number>; // TalentID -> strength (0-10)
}

export interface NPC {
  id: string;
  name: string;
  species: string;
  age: string;
  gender: string;
  attributes: NPCAttributes;
  personality: PersonalityTraits;
  needs: NPCNeeds;
  memoryDecayRate: number;
  knowledgeCapacity: number;
  emotionalState: string;
  groupAffiliations: string[];
  assignedRoles: string[];
  homeLocation: string;
  workLocation: string;
  knownRisks: string[];
  needsHome: boolean;
  needsWork: boolean;
  needsRiskInfo: boolean;
  awarenessLevel: string;
  dialogueOptions: string[];
  relationships: Map<string, number>;
  culturalTraits: Map<string, number>;
  inventory: string[];
  skills: Map<string, number>;
  knowledgeBase: string[];
  // Runtime state
  currentBehavior: string | null;
  position: { x: number; y: number };
  talentProfile: TalentProfile;
  // Combat / player state
  currentHealth: number;
  maxHealth: number;
  isInCombat: boolean;
  combatId?: string;
  respawnTick?: number;
  isDowned: boolean;
  gold: number;
  isPlayer?: boolean;
}

// --- Factions / Groups ---

export interface FactionDefinition {
  id: number;
  name: string;
  description: string;
  territory: string;
  leadership: string;
  population: string;
  resources: string;
}

// --- CSV Schema descriptor ---
// Deliberately unused today: it names what the manifest-driven
// table tooling (WEB-004+) builds against.

export interface CSVSchema {
  name: string;
  columns: { name: string; type: 'string' | 'number' | 'boolean' | 'array'; }[];
}
