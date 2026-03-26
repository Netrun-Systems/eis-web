// ============================================================
// EIS Web Simulation Engine — Core Type Definitions
// Maps to all 58 CSV schemas from the EISCORE UE5 project
// ============================================================

// --- Seeded RNG for deterministic simulation ---
export interface SeededRNG {
  seed: number;
  next(): number; // 0..1
  nextInt(min: number, max: number): number;
  nextFloat(min: number, max: number): number;
}

// --- Core NPC ---

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

export const PERSONALITY_TRAIT_KEYS: (keyof PersonalityTraits)[] = [
  'aggression', 'friendliness', 'curiosity', 'fearfulness',
  'loyalty', 'independence', 'confidence', 'patience',
  'honesty', 'empathy', 'resourcefulness', 'greed',
  'generosity', 'survivalInstinct',
];

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

export const NEED_KEYS: (keyof NPCNeeds)[] = [
  'hunger', 'thirst', 'rest', 'socialInteraction',
  'energy', 'hygiene', 'comfort', 'safety',
  'selfActualization', 'entertainment',
];

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
  currentHealth: number;   // Runtime HP (0 = downed)
  maxHealth: number;       // Derived from attributes.health + endurance
  isInCombat: boolean;
  combatId?: string;       // Active CombatInstance id
  respawnTick?: number;    // Tick when NPC respawns after death
  isDowned: boolean;       // True when health <= 0
  gold: number;            // Currency
  isPlayer?: boolean;      // True for the player character
}

// --- Combat ---

export interface CombatInstance {
  id: string;
  attackerId: string;
  defenderId: string;
  location: { x: number; y: number };
  round: number;
  status: 'engaging' | 'fighting' | 'resolved' | 'fled';
  combatLog: CombatLogEntry[];
  startTick: number;
  resolutionTick?: number;
}

export interface CombatLogEntry {
  round: number;
  actorId: string;
  action: 'attack' | 'defend' | 'dodge' | 'flee' | 'surrender' | 'special';
  roll: number;
  damage: number;
  targetHealth: number;
  description: string;
}

// --- Tension / Standoff ---

export interface TensionInstance {
  id: string;
  participants: string[];
  location: { x: number; y: number };
  tensionLevel: number;       // 0-100
  escalationRate: number;
  deescalationRate: number;
  triggers: string[];
  status: 'building' | 'peaked' | 'resolved_peaceful' | 'resolved_combat' | 'dispersed';
  startTick: number;
  resolutionTick?: number;
}

// --- Advanced Trade ---

export interface MarketState {
  locationId: string;
  prices: Map<string, number>;
  supply: Map<string, number>;
  demand: Map<string, number>;
  tradeHistory: TradeRecord[];
}

export interface TradeRecord {
  tick: number;
  buyerId: string;
  sellerId: string;
  item: string;
  price: number;
  locationId: string;
}

export interface TradeNegotiation {
  id: string;
  buyerId: string;
  sellerId: string;
  item: string;
  askPrice: number;
  bidPrice: number;
  round: number;
  maxRounds: number;
  status: 'negotiating' | 'agreed' | 'failed' | 'walked_away';
}

// --- Player ---

export type PlayerActionType = 'move' | 'interact' | 'talk' | 'attack' | 'trade' | 'use_item' | 'wait';

export interface PlayerAction {
  type: PlayerActionType;
  target?: { x: number; y: number } | string;
  data?: Record<string, unknown>;
}

export interface PlayerQuestEntry {
  questName: string;
  faction: string;
  description: string;
  status: 'active' | 'completed' | 'failed';
  startTick: number;
}

// --- Needs ---

export interface Need {
  id: number;
  name: string;
  description: string;
  defaultValue: number;
  increaseRate: number;
  priorityWeight: number;
  modifiers: string;
  satisfactionThreshold: number;
}

// --- Behaviors ---

export interface Behavior {
  id: number;
  name: string;
  description: string;
  associatedNeeds: number[];
  requiredAttributes: Map<string, number>;
  personalityInfluence: Map<string, number>;
  conditions: string[];
  effects: Map<string, number>;
  animationReference: string;
}

// --- Actions ---

export interface Action {
  id: number;
  name: string;
  description: string;
  affectedNeeds: string;
  attributeChanges: string;
  relationshipImpact: string;
  behaviorId: number;
}

// --- Traits ---

export interface Trait {
  id: number;
  name: string;
  description: string;
  effectOnBehaviors: string;
  defaultValue: number;
  rangeMin: number;
  rangeMax: number;
}

// --- Talents (35 Clifton-style) ---

export type TalentDomain = 'Executing' | 'Strategic Thinking' | 'Influencing' | 'Relationship Building';

export interface Talent {
  id: string;
  name: string;
  domain: TalentDomain;
  coreDefinition: string;
  brings: string;
  needs: string;
  potentialBlindSpot: string;
}

export interface TalentProfile {
  topFive: string[]; // Talent IDs
  all: Map<string, number>; // TalentID -> strength (0-10)
}

// --- Emotions ---

export interface Emotion {
  id: number;
  name: string;
  description: string;
  triggers: string;
  effectsOnBehaviors: string;
  duration: string;
}

// --- Emotional Contagion ---

export type ContagionType = 'DirectContagion' | 'SocialContagion' | 'FactionContagion' | 'ProximityContagion';

export interface EmotionalContagionRule {
  ruleId: number;
  sourceEmotion: string;
  contagionType: ContagionType;
  baseContagionStrength: number;
  relationshipStrengthMultiplier: number;
  personalityOpennessFactor: number;
  distanceDecayRate: number;
  maxPropagationDistance: number;
  durationMultiplier: number;
  resistanceThreshold: number;
  factionAmplificationFactor: number;
}

// --- Trust Evolution ---

export interface TrustEvolutionParameter {
  parameterId: number;
  eventType: string;
  baseTrustChange: number;
  personalityMultiplier: number;
  timeDecayFactor: number;
  diminishingReturnsFactor: number;
  maxChangePerEvent: number;
  recoveryDifficulty: number;
  witnessImpactMultiplier: number;
  factionInfluenceWeight: number;
}

// --- Relationships ---

export interface Relationship {
  id: number;
  entities: [string, string];
  initialTrustLevel: number;
  currentTrustLevel: number;
  perceptionModifiers: string;
  historyNotes: string;
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

export interface FactionRelation {
  pairId: number;
  groupA: string;
  groupB: string;
  relationshipStatus: string;
  trustLevel: number;
  historyNotes: string;
}

export interface FactionReputation {
  entryId: number;
  factionA: string;
  factionB: string;
  reputationLevel: number;
  reputationChangeRate: number;
  reputationDecayRate: number;
  publicStanding: number;
  tradeRelationshipModifier: number;
  hostilityThreshold: number;
  allianceThreshold: number;
  reputationMomentum: number;
  lastSignificantEvent: string;
  eventImpactDecayRate: number;
}

// --- Items ---

export type ItemAvailability = 'Common' | 'Uncommon' | 'Rare' | 'Legendary';

export interface Item {
  id: number;
  name: string;
  description: string;
  itemType: string;
  effects: string;
  value: number;
  availability: ItemAvailability;
}

// --- Quests ---

export interface Quest {
  faction: string;
  name: string;
  description: string;
  successConditions: string;
  requirements: string;
  rewards: string;
  status: 'available' | 'active' | 'completed' | 'failed';
}

// --- Roles ---

export interface Role {
  id: number;
  name: string;
  description: string;
  keyResponsibilities: string[];
  requiredSkills: string[];
}

// --- Skills ---

export interface Skill {
  id: string;
  name: string;
  description: string;
  requirements: string;
  associatedAttributes: string[];
  attributeModifiers: Map<string, string>;
  effectOnBehaviors: string;
}

// --- Knowledge ---

export interface Knowledge {
  faction: string;
  type: string;
  description: string;
  howLearned: string;
  plotImpact: string;
}

// --- Memory ---

export interface Memory {
  id: number;
  knowledgeType: string;
  description: string;
  associatedData: string;
  expiration: string;
}

// --- Schedule ---

export interface Schedule {
  id: number;
  name: string;
  description: string;
  timeSlots: ScheduleSlot[];
  associatedRoles: string[];
  conditions: string;
}

export interface ScheduleSlot {
  period: string;
  activity: string;
}

// --- Environment ---

export interface EnvironmentCondition {
  id: number;
  name: string;
  description: string;
  effectsOnBehaviors: string;
  duration: string;
  triggerConditions: string;
}

// --- Weather ---

export interface WeatherCondition {
  id: number;
  name: string;
  weatherType: number;
  intensity: number;
  duration: number;
  comfortModifier: number;
  visibilityRange: number;
  temperatureModifier: number;
  humidityLevel: number;
  windStrength: number;
  affectsNPCBehavior: boolean;
  affectsInteractiveObjects: boolean;
  blocksOutdoorActivities: boolean;
  cloudCoverage: number;
  precipitation: number;
  needModifiers: Map<string, number>;
  triggerConditions: string;
}

// --- Events ---

export interface WorldEvent {
  id: number;
  name: string;
  description: string;
  schedule: string;
  requiredRoles: string[];
  benefits: string;
  participationRequirements: string;
}

// --- Dialogue ---

export interface Dialogue {
  id: number;
  text: string;
  speakerRole: string;
  conditions: string;
  responses: string[];
  effects: string;
}

// --- Simulation Events (runtime) ---

export type SimulationEventType =
  | 'behavior'
  | 'trade'
  | 'combat'
  | 'combat_start'
  | 'combat_round'
  | 'combat_end'
  | 'combat_flee'
  | 'combat_death'
  | 'tension_building'
  | 'tension_peaked'
  | 'tension_combat'
  | 'tension_resolved'
  | 'tension_dispersed'
  | 'trade_negotiation'
  | 'trade_agreed'
  | 'trade_failed'
  | 'player_move'
  | 'player_interact'
  | 'player_dialogue'
  | 'social'
  | 'quest'
  | 'emotion'
  | 'knowledge'
  | 'faction'
  | 'need'
  | 'weather'
  | 'location'
  | 'system';

export interface SimulationEvent {
  id: string;
  tick: number;
  gameTime: number;
  type: SimulationEventType;
  actorId: string;
  targetId?: string;
  description: string;
  data?: Record<string, unknown>;
}

// --- World State ---

export interface WorldState {
  npcs: NPC[];
  needs: Need[];
  behaviors: Behavior[];
  actions: Action[];
  traits: Trait[];
  talents: Talent[];
  emotions: Emotion[];
  emotionalContagionRules: EmotionalContagionRule[];
  trustEvolutionParameters: TrustEvolutionParameter[];
  relationships: Relationship[];
  factions: FactionDefinition[];
  factionRelations: FactionRelation[];
  factionReputations: FactionReputation[];
  items: Item[];
  quests: Quest[];
  roles: Role[];
  skills: Skill[];
  knowledge: Knowledge[];
  memories: Memory[];
  schedules: Schedule[];
  environmentConditions: EnvironmentCondition[];
  weatherConditions: WeatherCondition[];
  events: WorldEvent[];
  dialogues: Dialogue[];

  // Runtime
  time: number; // game hours since start
  day: number;
  hour: number;
  currentWeather: WeatherCondition | null;
  activeEvents: SimulationEvent[];
  eventLog: SimulationEvent[];
  tickCount: number;
  rng: SeededRNG;

  // Combat & Tension runtime
  activeCombats: CombatInstance[];
  activeTensions: TensionInstance[];

  // Economy runtime
  markets: MarketState[];
  activeNegotiations: TradeNegotiation[];

  // Player
  playerId?: string;  // NPC ID of the player character
  playerActionQueue: PlayerAction[];
}

// --- System Interface ---

export interface System {
  name: string;
  tick(world: WorldState, deltaTime: number): SimulationEvent[];
}

// --- CSV Schema descriptor for generic parsing ---

export interface CSVSchema {
  name: string;
  columns: { name: string; type: 'string' | 'number' | 'boolean' | 'array'; }[];
}
