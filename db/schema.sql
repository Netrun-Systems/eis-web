-- ============================================================
-- EIS Web Simulation Database Schema
-- Target: PostgreSQL 15+ on Cloud SQL charlotte-pg-instance
-- Database: eis_simulation
-- Source: Derived from actual CSV column names in /data/workspace/github/EIS/
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- SCHEMA: core — NPC entities, attributes, social graph
-- ============================================================

-- eis_roles — Role definitions (Roles.csv: RoleID, RoleName, Description, KeyResponsibilities, RequiredSkills)
CREATE TABLE eis_roles (
  id           SERIAL PRIMARY KEY,
  role_id      INTEGER UNIQUE NOT NULL,  -- RoleID from CSV (1-based)
  role_name    VARCHAR(100) NOT NULL,
  description  TEXT,
  key_responsibilities TEXT,             -- semicolon-delimited list
  required_skills      TEXT,             -- semicolon-delimited list
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- eis_factions — Faction/Group definitions (Groups_Definitions.csv: GroupID, GroupName, Description, Territory, Leadership, Population, Resources)
CREATE TABLE eis_factions (
  id           SERIAL PRIMARY KEY,
  group_id     INTEGER UNIQUE NOT NULL,  -- GroupID from CSV
  group_name   VARCHAR(100) NOT NULL,
  description  TEXT,
  territory    VARCHAR(200),
  leadership   VARCHAR(200),
  population   VARCHAR(100),             -- stored as text; may be "Unknown" or "~20-40"
  resources    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- eis_skills — Skill definitions (Skills.csv: SkillID, SkillName, Description, Requirements, AssociatedAttributes, AttributeModifiers, EffectOnBehaviors)
CREATE TABLE eis_skills (
  id                   SERIAL PRIMARY KEY,
  skill_id             VARCHAR(50) UNIQUE NOT NULL,   -- e.g. "Skill_CombatSkill"
  skill_name           VARCHAR(100) NOT NULL,
  description          TEXT,
  requirements         TEXT,
  associated_attributes TEXT,                          -- semicolon-delimited
  attribute_modifiers  TEXT,
  effect_on_behaviors  TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- eis_talents — Talent definitions (Talents.csv: TalentID, TalentName, Domain, CoreDefinition, Brings, Needs, PotentialBlindSpot)
CREATE TABLE eis_talents (
  id                 SERIAL PRIMARY KEY,
  talent_id          VARCHAR(10) UNIQUE NOT NULL,  -- e.g. "T001"
  talent_name        VARCHAR(100) NOT NULL,
  domain             VARCHAR(100),
  core_definition    TEXT,
  brings             TEXT,
  needs              TEXT,
  potential_blind_spot TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- eis_talent_domains — Talent domain mappings (TalentDomainMapping.csv: DomainID, DomainName, Drive, GameplayRole, TalentCount, TalentIDs, ComplementaryDomain, ContrastingDomain)
CREATE TABLE eis_talent_domains (
  id                   SERIAL PRIMARY KEY,
  domain_id            VARCHAR(10) UNIQUE NOT NULL,  -- e.g. "DOM01"
  domain_name          VARCHAR(100) NOT NULL,
  drive                VARCHAR(200),
  gameplay_role        VARCHAR(200),
  talent_count         INTEGER DEFAULT 0,
  talent_ids           TEXT,                          -- semicolon-delimited list of TalentIDs
  complementary_domain VARCHAR(100),
  contrasting_domain   VARCHAR(100),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- eis_needs_catalog — Need definitions (Needs.csv: NeedID, NeedName, Description, DefaultValue, IncreaseRate, PriorityWeight, Modifiers, SatisfactionThresholds)
CREATE TABLE eis_needs_catalog (
  id                     SERIAL PRIMARY KEY,
  need_id                INTEGER UNIQUE NOT NULL,    -- NeedID from CSV
  need_name              VARCHAR(100) NOT NULL,
  description            TEXT,
  default_value          NUMERIC(6,2) DEFAULT 50,
  increase_rate          NUMERIC(8,4) DEFAULT 0.1,   -- per game-second
  priority_weight        NUMERIC(4,1) DEFAULT 5,
  modifiers              TEXT,
  satisfaction_thresholds NUMERIC(6,2) DEFAULT 80,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- eis_behaviors — Behavior definitions (Behavior.csv: BehaviorID, BehaviorName, Description, AssociatedNeeds, RequiredAttributesSkills, PersonaTraitsInfluence, Conditions, Effects, AnimationActionReferences)
CREATE TABLE eis_behaviors (
  id                          SERIAL PRIMARY KEY,
  behavior_id                 INTEGER UNIQUE NOT NULL,
  behavior_name               VARCHAR(100) NOT NULL,
  description                 TEXT,
  associated_needs             TEXT,   -- need IDs, comma-delimited
  required_attributes_skills   TEXT,
  persona_traits_influence     TEXT,
  conditions                  TEXT,
  effects                     TEXT,
  animation_action_references TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- eis_actions — Action definitions (Action.csv: ActionID, ActionName, Description, AffectedNeeds, AttributeChanges, RelationshipImpact, BehaviorID)
CREATE TABLE eis_actions (
  id                  SERIAL PRIMARY KEY,
  action_id           INTEGER UNIQUE NOT NULL,
  action_name         VARCHAR(100) NOT NULL,
  description         TEXT,
  affected_needs      TEXT,
  attribute_changes   TEXT,
  relationship_impact TEXT,
  behavior_id         INTEGER REFERENCES eis_behaviors(behavior_id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- eis_emotions — Emotion definitions (Emotions.csv: EmotionID, EmotionName, Description, Triggers, EffectsOnBehaviors, Duration)
CREATE TABLE eis_emotions (
  id                   SERIAL PRIMARY KEY,
  emotion_id           INTEGER UNIQUE NOT NULL,
  emotion_name         VARCHAR(100) NOT NULL,
  description          TEXT,
  triggers             TEXT,
  effects_on_behaviors TEXT,
  duration             VARCHAR(50) DEFAULT 'Variable',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- eis_traits — Trait definitions (Traits.csv: TraitID, TraitName, Description, EffectOnBehaviors, DefaultValue, RangeMin, RangeMax)
CREATE TABLE eis_traits (
  id                 SERIAL PRIMARY KEY,
  trait_id           INTEGER UNIQUE NOT NULL,
  trait_name         VARCHAR(100) NOT NULL,
  description        TEXT,
  effect_on_behaviors TEXT,
  default_value      NUMERIC(4,2) DEFAULT 5,
  range_min          NUMERIC(4,2) DEFAULT 1,
  range_max          NUMERIC(4,2) DEFAULT 10,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- eis_cultural_groups — Culture definitions (Cultural.csv: CultureID, CultureName, Description, ValuesAndBeliefs, PreferredBehaviors, CulturalEvents)
CREATE TABLE eis_cultural_groups (
  id                SERIAL PRIMARY KEY,
  culture_id        INTEGER UNIQUE NOT NULL,
  culture_name      VARCHAR(100) NOT NULL,
  description       TEXT,
  values_and_beliefs TEXT,
  preferred_behaviors TEXT,
  cultural_events   TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- eis_items — Item catalog (Item.csv: ItemID, ItemName, Description, ItemType, Effects, Value, Availability)
CREATE TABLE eis_items (
  id           SERIAL PRIMARY KEY,
  item_id      INTEGER UNIQUE NOT NULL,
  item_name    VARCHAR(200) NOT NULL,
  description  TEXT,
  item_type    VARCHAR(50),               -- Consumable, Tool, Weapon, Armor, etc.
  effects      TEXT,
  value        NUMERIC(10,2) DEFAULT 0,
  availability VARCHAR(50) DEFAULT 'Common',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- eis_crafting_recipes — Crafting system (CraftingRecipes.csv: RecipeID, RecipeName, Description, RequiredIngredients, CraftedItemID, CraftedQuantity, SkillRequirements, CraftingTime, FactionRestriction, bIsDiscovered, RecipeRarity, BaseSuccessChance, CriticalSuccessChance, OptionalCatalysts)
CREATE TABLE eis_crafting_recipes (
  id                    SERIAL PRIMARY KEY,
  recipe_id             INTEGER UNIQUE NOT NULL,
  recipe_name           VARCHAR(200) NOT NULL,
  description           TEXT,
  required_ingredients  TEXT,               -- "ItemID:Qty,ItemID:Qty" format
  crafted_item_id       INTEGER REFERENCES eis_items(item_id) ON DELETE SET NULL,
  crafted_quantity      INTEGER DEFAULT 1,
  skill_requirements    TEXT,               -- "SkillName:MinLevel" format
  crafting_time         NUMERIC(8,2) DEFAULT 10, -- seconds
  faction_restriction   VARCHAR(100),
  b_is_discovered       BOOLEAN DEFAULT TRUE,
  recipe_rarity         VARCHAR(50) DEFAULT 'Common',
  base_success_chance   NUMERIC(5,2) DEFAULT 90.0,
  critical_success_chance NUMERIC(5,2) DEFAULT 5.0,
  optional_catalysts    TEXT,               -- "ItemID:Qty" format
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- eis_quests — Quest definitions (Quests.csv: Faction, QuestName, QuestDescription, SuccessConditions, Requirements, Rewards)
CREATE TABLE eis_quests (
  id                SERIAL PRIMARY KEY,
  faction           VARCHAR(100),
  quest_name        VARCHAR(200) NOT NULL,
  quest_description TEXT,
  success_conditions TEXT,
  requirements      TEXT,
  rewards           TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- eis_risks — Risk definitions (Risk.csv: RiskID, RiskName, Description, AssociatedLocations, AssociatedNPCs)
CREATE TABLE eis_risks (
  id                  SERIAL PRIMARY KEY,
  risk_id             VARCHAR(50) UNIQUE NOT NULL,  -- e.g. "Risk_MachinePatrols"
  risk_name           VARCHAR(200) NOT NULL,
  description         TEXT,
  associated_locations TEXT,   -- semicolon-delimited
  associated_npcs      TEXT,   -- semicolon-delimited NPC IDs
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- eis_role_requirements — Role requirement specs (RoleReqs.csv: RoleID, RoleName, Description, PreferredAttributes, MinimumAttributes, PreferredSkills, PersonaTraitsPreferences, TrainingRequired)
CREATE TABLE eis_role_requirements (
  id                       SERIAL PRIMARY KEY,
  role_id                  INTEGER REFERENCES eis_roles(role_id) ON DELETE CASCADE,
  preferred_attributes     TEXT,
  minimum_attributes       TEXT,
  preferred_skills         TEXT,
  persona_traits_preferences TEXT,
  training_required        BOOLEAN DEFAULT FALSE,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- eis_role_equipment_restrictions — (RoleEquipmentRestrictions.csv: RoleID, RoleName, AllowedItemTypes, ForbiddenItemIDs, PreferredItemIDs, SlotRestrictions)
CREATE TABLE eis_role_equipment_restrictions (
  id                SERIAL PRIMARY KEY,
  role_id           INTEGER REFERENCES eis_roles(role_id) ON DELETE CASCADE,
  allowed_item_types TEXT,
  forbidden_item_ids TEXT,    -- comma-delimited ItemIDs
  preferred_item_ids TEXT,    -- comma-delimited ItemIDs
  slot_restrictions  TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- eis_environments — Environment/weather conditions (Environment.csv / WeatherConditions.csv)
-- Using the detailed WeatherConditions format: EnvironmentID, ConditionName, WeatherType, Intensity, Duration, ComfortModifier, VisibilityRange, TemperatureModifier, HumidityLevel, WindStrength, bAffectsNPCBehavior, bAffectsInteractiveObjects, bBlocksOutdoorActivities, CloudCoverage, Precipitation, FogColorR, FogColorG, FogColorB, NeedModifiers, TriggerConditions
CREATE TABLE eis_environments (
  id                        SERIAL PRIMARY KEY,
  environment_id            INTEGER UNIQUE NOT NULL,
  condition_name            VARCHAR(100) NOT NULL,
  weather_type              INTEGER DEFAULT 0,
  intensity                 NUMERIC(4,2) DEFAULT 0.5,
  duration                  VARCHAR(100) DEFAULT 'Variable',
  comfort_modifier          NUMERIC(4,2) DEFAULT 0,
  visibility_range          NUMERIC(10,2) DEFAULT 10000,
  temperature_modifier      NUMERIC(6,2) DEFAULT 0,
  humidity_level            NUMERIC(4,2) DEFAULT 0.5,
  wind_strength             NUMERIC(4,2) DEFAULT 0.1,
  b_affects_npc_behavior    BOOLEAN DEFAULT TRUE,
  b_affects_interactive_objects BOOLEAN DEFAULT FALSE,
  b_blocks_outdoor_activities BOOLEAN DEFAULT FALSE,
  cloud_coverage            NUMERIC(4,2) DEFAULT 0.1,
  precipitation             NUMERIC(4,2) DEFAULT 0,
  fog_color_r               NUMERIC(5,4) DEFAULT 0.8,
  fog_color_g               NUMERIC(5,4) DEFAULT 0.9,
  fog_color_b               NUMERIC(5,4) DEFAULT 1.0,
  need_modifiers            TEXT,
  trigger_conditions        TEXT,
  effects_on_behaviors      TEXT,     -- from simpler Environment.csv format
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- eis_schedules — Daily schedule templates (Schedule.csv: ScheduleID, ScheduleName, Description, TimeSlots, AssociatedRoles, Conditions)
CREATE TABLE eis_schedules (
  id             SERIAL PRIMARY KEY,
  schedule_id    INTEGER UNIQUE NOT NULL,
  schedule_name  VARCHAR(200) NOT NULL,
  description    TEXT,
  time_slots     TEXT,          -- "Morning: X; Afternoon: Y; ..." format
  associated_roles TEXT,        -- role names
  conditions     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- eis_events — World event definitions (Event.csv: EventID, EventName, Description, Schedule, RequiredRoles, Benefits, ParticipationRequirements)
CREATE TABLE eis_events (
  id                          SERIAL PRIMARY KEY,
  event_id                    INTEGER UNIQUE NOT NULL,
  event_name                  VARCHAR(200) NOT NULL,
  description                 TEXT,
  schedule                    TEXT,
  required_roles              TEXT,
  benefits                    TEXT,
  participation_requirements  TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- eis_zone_streaming — Zone streaming configuration (ZoneStreaming.csv)
CREATE TABLE eis_zone_streaming (
  id                      SERIAL PRIMARY KEY,
  zone_id                 INTEGER UNIQUE NOT NULL,
  zone_name               VARCHAR(200) NOT NULL,
  streaming_radius        NUMERIC(10,2) DEFAULT 3000,
  unload_radius           NUMERIC(10,2) DEFAULT 4500,
  priority                NUMERIC(4,2) DEFAULT 1.0,
  b_stream_weather_data   BOOLEAN DEFAULT TRUE,
  b_stream_inventory_data BOOLEAN DEFAULT TRUE,
  b_stream_quest_data     BOOLEAN DEFAULT TRUE,
  b_stream_npc_data       BOOLEAN DEFAULT TRUE,
  max_memory_budget       INTEGER DEFAULT 800,   -- MB
  zone_center_x           NUMERIC(12,4) DEFAULT 0,
  zone_center_y           NUMERIC(12,4) DEFAULT 0,
  zone_center_z           NUMERIC(12,4) DEFAULT 0,
  zone_extent_x           NUMERIC(12,4) DEFAULT 2000,
  zone_extent_y           NUMERIC(12,4) DEFAULT 2000,
  zone_extent_z           NUMERIC(12,4) DEFAULT 200,
  streaming_levels        TEXT,    -- semicolon-delimited level names
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- eis_interactive_objects — Interactive objects in the world (InteractiveObjects.csv)
CREATE TABLE eis_interactive_objects (
  id                      SERIAL PRIMARY KEY,
  object_id               INTEGER UNIQUE NOT NULL,
  object_name             VARCHAR(200) NOT NULL,
  object_type             INTEGER DEFAULT 0,       -- 0=Container, 1=Door, etc.
  interaction_range       NUMERIC(8,2) DEFAULT 200,
  b_requires_quest        BOOLEAN DEFAULT FALSE,
  required_quest_ids      TEXT,
  b_weather_responsive    BOOLEAN DEFAULT FALSE,
  weather_responses       TEXT,
  b_persistent            BOOLEAN DEFAULT TRUE,
  inventory_capacity      INTEGER DEFAULT 0,
  b_generate_loot         BOOLEAN DEFAULT FALSE,
  loot_table              TEXT,
  faction_loot_modifiers  TEXT,
  zone_id                 INTEGER REFERENCES eis_zone_streaming(zone_id) ON DELETE SET NULL,
  location_x              NUMERIC(12,4) DEFAULT 0,
  location_y              NUMERIC(12,4) DEFAULT 0,
  location_z              NUMERIC(12,4) DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCHEMA: core — NPC master table (must come after all FK targets)
-- ============================================================

-- eis_npcs — NPC core data (NPCs.csv)
-- Actual CSV columns: NPC_ID, Name, Species, Age, Gender, Strength, Dexterity, Endurance, Health,
--   Intelligence, Wisdom, Willpower, Charisma, Aggression, Friendliness, Curiosity, Fearfulness,
--   Loyalty, Independence, Confidence, Patience, Honesty, Empathy, Resourcefulness, Greed,
--   Generosity, SurvivalInstinct, Hunger, Thirst, Rest, SocialInteraction, Energy, Hygiene, Comfort,
--   MemoryDecayRate, KnowledgeCapacity, EmotionalState, GroupAffiliations, AssignedRoles,
--   HomeLocation, WorkLocation, KnownRisks, NeedsHome, NeedsWork, NeedsRiskInfo, AwarenessLevel,
--   DialogueOptions, Relationships, CulturalTraits, Inventory, Skills, KnowledgeBase
CREATE TABLE eis_npcs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  npc_id                VARCHAR(50) UNIQUE NOT NULL,  -- e.g. "NPC_Raven"
  name                  VARCHAR(100) NOT NULL,
  species               VARCHAR(50) NOT NULL DEFAULT 'Human',
  age                   INTEGER,
  gender                VARCHAR(20),

  -- Attributes (0-10 scale)
  strength              NUMERIC(4,2) DEFAULT 5,
  dexterity             NUMERIC(4,2) DEFAULT 5,
  endurance             NUMERIC(4,2) DEFAULT 5,
  health                NUMERIC(6,2) DEFAULT 80,    -- raw HP value in CSV (e.g. 80, 85)
  intelligence          NUMERIC(4,2) DEFAULT 5,
  wisdom                NUMERIC(4,2) DEFAULT 5,
  willpower             NUMERIC(4,2) DEFAULT 5,
  charisma              NUMERIC(4,2) DEFAULT 5,

  -- Personality traits (0-10 scale, matching CSV column names)
  aggression            NUMERIC(4,2) DEFAULT 5,
  friendliness          NUMERIC(4,2) DEFAULT 5,
  curiosity             NUMERIC(4,2) DEFAULT 5,
  fearfulness           NUMERIC(4,2) DEFAULT 5,
  loyalty               NUMERIC(4,2) DEFAULT 5,
  independence          NUMERIC(4,2) DEFAULT 5,
  confidence            NUMERIC(4,2) DEFAULT 5,
  patience              NUMERIC(4,2) DEFAULT 5,
  honesty               NUMERIC(4,2) DEFAULT 5,
  empathy               NUMERIC(4,2) DEFAULT 5,
  resourcefulness       NUMERIC(4,2) DEFAULT 5,
  greed                 NUMERIC(4,2) DEFAULT 5,
  generosity            NUMERIC(4,2) DEFAULT 5,
  survival_instinct     NUMERIC(4,2) DEFAULT 5,   -- CSV: SurvivalInstinct

  -- Needs (0-100 current values, CSV column names)
  hunger                NUMERIC(6,2) DEFAULT 50,   -- CSV: Hunger
  thirst                NUMERIC(6,2) DEFAULT 50,   -- CSV: Thirst
  rest                  NUMERIC(6,2) DEFAULT 50,   -- CSV: Rest
  social_interaction    NUMERIC(6,2) DEFAULT 50,   -- CSV: SocialInteraction
  energy                NUMERIC(6,2) DEFAULT 60,   -- CSV: Energy
  hygiene               NUMERIC(6,2) DEFAULT 40,   -- CSV: Hygiene
  comfort               NUMERIC(6,2) DEFAULT 50,   -- CSV: Comfort
  safety                NUMERIC(6,2) DEFAULT 50,   -- derived (not in CSV directly)
  self_actualization    NUMERIC(6,2) DEFAULT 20,   -- derived
  entertainment         NUMERIC(6,2) DEFAULT 30,   -- derived

  -- Memory/knowledge metadata
  memory_decay_rate     NUMERIC(6,4) DEFAULT 0.01, -- CSV: MemoryDecayRate
  knowledge_capacity    INTEGER DEFAULT 100,        -- CSV: KnowledgeCapacity

  -- Current state
  emotional_state       VARCHAR(50) DEFAULT 'Neutral',  -- CSV: EmotionalState
  awareness_level       VARCHAR(100) DEFAULT 'Active',  -- CSV: AwarenessLevel

  -- Locations
  home_location         VARCHAR(200),   -- CSV: HomeLocation
  work_location         VARCHAR(200),   -- CSV: WorkLocation

  -- Flags
  needs_home            BOOLEAN DEFAULT FALSE,    -- CSV: NeedsHome
  needs_work            BOOLEAN DEFAULT FALSE,    -- CSV: NeedsWork
  needs_risk_info       BOOLEAN DEFAULT FALSE,    -- CSV: NeedsRiskInfo

  -- Denormalized fields from CSV (for initial import; normalized tables fill in details)
  group_affiliations    TEXT,    -- CSV: GroupAffiliations (faction IDs, semicolon-delimited)
  assigned_roles        TEXT,    -- CSV: AssignedRoles (role IDs, semicolon-delimited)
  known_risks           TEXT,    -- CSV: KnownRisks (semicolon-delimited risk IDs)
  dialogue_options      TEXT,    -- CSV: DialogueOptions
  cultural_traits       TEXT,    -- CSV: CulturalTraits (k=v pairs)
  inventory_raw         TEXT,    -- CSV: Inventory (item names, raw)
  skills_raw            TEXT,    -- CSV: Skills (SkillName=Level pairs)
  knowledge_base_raw    TEXT,    -- CSV: KnowledgeBase

  -- Metadata
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCHEMA: social — Relationships, memory, knowledge
-- ============================================================

-- eis_relationships — NPC-to-NPC relationships (Relationship.csv: RelationshipID, EntitiesInvolved, InitialTrustLevel, PerceptionModifiers, HistoryNotes)
CREATE TABLE eis_relationships (
  id                   SERIAL PRIMARY KEY,
  relationship_id      INTEGER UNIQUE NOT NULL,    -- RelationshipID from CSV
  npc1_id              VARCHAR(50) REFERENCES eis_npcs(npc_id) ON DELETE CASCADE,
  npc2_id              VARCHAR(50) REFERENCES eis_npcs(npc_id) ON DELETE CASCADE,
  initial_trust_level  NUMERIC(4,2) DEFAULT 5,     -- InitialTrustLevel (0-10)
  current_trust_level  NUMERIC(4,2) DEFAULT 5,     -- runtime-updated
  perception_modifiers TEXT,
  history_notes        TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_relationship UNIQUE(npc1_id, npc2_id)
);

-- eis_memories — NPC memories (Memory.csv: MemoryID, KnowledgeType, Description, AssociatedData, Expiration)
CREATE TABLE eis_memories (
  id               SERIAL PRIMARY KEY,
  memory_id        INTEGER UNIQUE NOT NULL,
  npc_id           VARCHAR(50) REFERENCES eis_npcs(npc_id) ON DELETE CASCADE,
  knowledge_type   VARCHAR(50),    -- KnownRisk, KnownResource, etc.
  description      TEXT,
  associated_data  TEXT,           -- "RiskID:xxx; Location:yyy" format
  expiration       TEXT,           -- "Does not expire" or "Expires in N days"
  decay_factor     NUMERIC(6,4) DEFAULT 0.01,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- eis_knowledge_entries — Knowledge per faction/NPC (Knowledge.csv: Faction, KnowledgeType, KnowledgeDescription, HowItCanBeLearnedOrExchanged, ImpactOnPlotDevelopment)
CREATE TABLE eis_knowledge_entries (
  id                              SERIAL PRIMARY KEY,
  faction                         VARCHAR(100),
  knowledge_type                  VARCHAR(100),    -- Skill, CraftingPlan, Location, etc.
  knowledge_description           TEXT,
  how_it_can_be_learned_or_exchanged TEXT,
  impact_on_plot_development      TEXT,
  created_at                      TIMESTAMPTZ DEFAULT NOW()
);

-- eis_npc_knowledge — Knowledge held by a specific NPC (junction table)
CREATE TABLE eis_npc_knowledge (
  id               SERIAL PRIMARY KEY,
  npc_id           VARCHAR(50) REFERENCES eis_npcs(npc_id) ON DELETE CASCADE,
  knowledge_id     INTEGER REFERENCES eis_knowledge_entries(id) ON DELETE CASCADE,
  acquired_at      TIMESTAMPTZ DEFAULT NOW(),
  confidence_level NUMERIC(4,2) DEFAULT 1.0,  -- 0-1, may decay
  UNIQUE(npc_id, knowledge_id)
);

-- eis_npc_roles — Roles assigned to NPCs (many-to-many)
CREATE TABLE eis_npc_roles (
  id         SERIAL PRIMARY KEY,
  npc_id     VARCHAR(50) REFERENCES eis_npcs(npc_id) ON DELETE CASCADE,
  role_id    INTEGER REFERENCES eis_roles(role_id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(npc_id, role_id)
);

-- eis_npc_factions — Faction memberships per NPC (many-to-many)
CREATE TABLE eis_npc_factions (
  id          SERIAL PRIMARY KEY,
  npc_id      VARCHAR(50) REFERENCES eis_npcs(npc_id) ON DELETE CASCADE,
  faction_id  INTEGER REFERENCES eis_factions(group_id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  rank        VARCHAR(100),
  UNIQUE(npc_id, faction_id)
);

-- eis_npc_talents — NPC talent assignments (many-to-many with investment level)
CREATE TABLE eis_npc_talents (
  id               SERIAL PRIMARY KEY,
  npc_id           VARCHAR(50) REFERENCES eis_npcs(npc_id) ON DELETE CASCADE,
  talent_id        VARCHAR(10) REFERENCES eis_talents(talent_id) ON DELETE CASCADE,
  investment_level INTEGER DEFAULT 1,   -- 1-5 investment tier
  assigned_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(npc_id, talent_id)
);

-- eis_npc_inventory — Items held by NPCs
CREATE TABLE eis_npc_inventory (
  id        SERIAL PRIMARY KEY,
  npc_id    VARCHAR(50) REFERENCES eis_npcs(npc_id) ON DELETE CASCADE,
  item_id   INTEGER REFERENCES eis_items(item_id) ON DELETE CASCADE,
  quantity  INTEGER DEFAULT 1,
  acquired_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCHEMA: communication — Protocol definitions
-- ============================================================

-- eis_communication_protocols — 12+ protocol types (CommunicationProtocols.csv)
-- Actual CSV: ProtocolID, ProtocolName, ProtocolType, Description, RequiredCapabilities, TransmissionFidelity, Range, DetectionRequirements, KnowledgeTransferRate, EmotionalTransfer, CulturalModifiers, SpeciesCompatibility
CREATE TABLE eis_communication_protocols (
  id                       SERIAL PRIMARY KEY,
  protocol_id              VARCHAR(10) UNIQUE NOT NULL,   -- e.g. "CP001"
  protocol_name            VARCHAR(100) NOT NULL,
  protocol_type            VARCHAR(50),                   -- Verbal, Written, Signal, etc.
  description              TEXT,
  required_capabilities    TEXT,
  transmission_fidelity    INTEGER DEFAULT 95,            -- 0-100 percent
  range                    VARCHAR(50) DEFAULT 'Close',   -- Close, Medium, Long, Unlimited
  detection_requirements   TEXT,
  knowledge_transfer_rate  VARCHAR(20) DEFAULT 'Medium',  -- Low, Medium, High
  emotional_transfer       VARCHAR(20) DEFAULT 'Low',
  cultural_modifiers       TEXT,
  species_compatibility    TEXT,   -- semicolon-delimited species/groups
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- eis_conversation_patterns — Conversation archetypes (ConversationPatterns.csv)
-- Actual CSV: PatternID, PatternName, Description, RequiredTraits, FactionRestriction, SpeciesCompatibility, ConversationThemes, DialogueStarters, DefaultTone, ConversationDuration, PatternCooldown, SelectionWeight
CREATE TABLE eis_conversation_patterns (
  id                     SERIAL PRIMARY KEY,
  pattern_id             VARCHAR(10) UNIQUE NOT NULL,   -- e.g. "CP001"
  pattern_name           VARCHAR(100) NOT NULL,
  description            TEXT,
  required_traits        TEXT,    -- "Trait|Trait" format
  faction_restriction    TEXT,    -- comma-delimited faction names
  species_compatibility  TEXT,    -- "Human|AI" format
  conversation_themes    TEXT,    -- comma-delimited
  dialogue_starters      TEXT,    -- pipe-delimited starter templates
  default_tone           VARCHAR(50) DEFAULT 'Neutral',
  conversation_duration  NUMERIC(8,2) DEFAULT 60,    -- seconds
  pattern_cooldown       NUMERIC(8,2) DEFAULT 300,   -- seconds
  selection_weight       NUMERIC(6,2) DEFAULT 50,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- eis_emotional_contagion_rules — Emotion spread rules (EmotionalContagionRules.csv)
-- Actual CSV: RuleID, SourceEmotion, ContagionType, BaseContagionStrength, RelationshipStrengthMultiplier, PersonalityOpennessFactor, DistanceDecayRate, MaxPropagationDistance, DurationMultiplier, ResistanceThreshold, FactionAmplificationFactor
CREATE TABLE eis_emotional_contagion_rules (
  id                              SERIAL PRIMARY KEY,
  rule_id                         INTEGER UNIQUE NOT NULL,
  source_emotion                  VARCHAR(100) NOT NULL,
  contagion_type                  VARCHAR(50),    -- DirectContagion, SocialContagion, etc.
  base_contagion_strength         NUMERIC(4,2) DEFAULT 0.5,
  relationship_strength_multiplier NUMERIC(4,2) DEFAULT 1.0,
  personality_openness_factor     NUMERIC(4,2) DEFAULT 1.0,
  distance_decay_rate             NUMERIC(4,2) DEFAULT 0.2,
  max_propagation_distance        INTEGER DEFAULT 3,
  duration_multiplier             NUMERIC(4,2) DEFAULT 0.8,
  resistance_threshold            NUMERIC(4,2) DEFAULT 0.3,
  faction_amplification_factor    NUMERIC(4,2) DEFAULT 1.3,
  created_at                      TIMESTAMPTZ DEFAULT NOW()
);

-- eis_trust_evolution_parameters — Trust change parameters (TrustEvolutionParameters.csv)
-- Actual CSV: ParameterID, EventType, BaseTrustChange, PersonalityMultiplier, TimeDecayFactor, DiminishingReturnsFactor, MaxChangePerEvent, RecoveryDifficulty, WitnessImpactMultiplier, FactionInfluenceWeight
CREATE TABLE eis_trust_evolution_parameters (
  id                         SERIAL PRIMARY KEY,
  parameter_id               INTEGER UNIQUE NOT NULL,
  event_type                 VARCHAR(100) NOT NULL,    -- PositiveInteraction, NegativeInteraction, etc.
  base_trust_change          NUMERIC(6,2),
  personality_multiplier     NUMERIC(4,2) DEFAULT 1.0,
  time_decay_factor          NUMERIC(8,4) DEFAULT 0.01,
  diminishing_returns_factor NUMERIC(4,2) DEFAULT 0.8,
  max_change_per_event       NUMERIC(6,2) DEFAULT 15.0,
  recovery_difficulty        NUMERIC(4,2) DEFAULT 1.0,
  witness_impact_multiplier  NUMERIC(4,2) DEFAULT 0.3,
  faction_influence_weight   NUMERIC(4,2) DEFAULT 0.5,
  created_at                 TIMESTAMPTZ DEFAULT NOW()
);

-- eis_rumor_templates — Rumor propagation templates (RumorTemplates.csv)
-- Actual CSV: RumorID, RumorName, RumorTemplate, SubjectCategories, RequiredTrustLevel, CredibilityDecay, CorruptionChance, MaxPropagationHops, SpreadRate, FactionBias
CREATE TABLE eis_rumor_templates (
  id                     SERIAL PRIMARY KEY,
  rumor_id               VARCHAR(20) UNIQUE NOT NULL,  -- e.g. "RUMOR_001"
  rumor_name             VARCHAR(200) NOT NULL,
  rumor_template         TEXT,   -- "{SUBJECT} {ACTION} {OBJECT}" format
  subject_categories     TEXT,   -- pipe-delimited
  required_trust_level   NUMERIC(5,2) DEFAULT 25.0,
  credibility_decay      NUMERIC(6,4) DEFAULT 0.05,
  corruption_chance      NUMERIC(6,4) DEFAULT 0.02,
  max_propagation_hops   INTEGER DEFAULT 8,
  spread_rate            NUMERIC(4,2) DEFAULT 1.2,
  faction_bias           VARCHAR(50) DEFAULT 'Neutral',
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- eis_faction_reputation_matrix — Faction-to-faction reputation (FactionReputationMatrix.csv)
-- Actual CSV: EntryID, FactionA, FactionB, ReputationLevel, ReputationChangeRate, ReputationDecayRate, PublicStanding, TradeRelationshipModifier, HostilityThreshold, AllianceThreshold, ReputationMomentum, LastSignificantEvent, EventImpactDecayRate
CREATE TABLE eis_faction_reputation_matrix (
  id                       SERIAL PRIMARY KEY,
  entry_id                 INTEGER UNIQUE NOT NULL,
  faction_a                VARCHAR(100) NOT NULL,
  faction_b                VARCHAR(100) NOT NULL,
  reputation_level         NUMERIC(6,2) DEFAULT 50.0,
  reputation_change_rate   NUMERIC(6,4) DEFAULT 0.3,
  reputation_decay_rate    NUMERIC(6,4) DEFAULT 0.02,
  public_standing          NUMERIC(6,2) DEFAULT 50.0,
  trade_relationship_modifier NUMERIC(4,2) DEFAULT 1.0,
  hostility_threshold      NUMERIC(6,2) DEFAULT 20.0,
  alliance_threshold       NUMERIC(6,2) DEFAULT 75.0,
  reputation_momentum      NUMERIC(6,2) DEFAULT 0.0,
  last_significant_event   TEXT,
  event_impact_decay_rate  NUMERIC(6,4) DEFAULT 0.03,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_faction_pair UNIQUE(faction_a, faction_b)
);

-- eis_faction_item_preferences — Faction trading preferences (FactionItemPreferences.csv)
-- Actual CSV: FactionName, PreferredItems, DislikedItems, ForbiddenItems, PreferredPriceModifier, DislikedPriceModifier
CREATE TABLE eis_faction_item_preferences (
  id                      SERIAL PRIMARY KEY,
  faction_name            VARCHAR(100) UNIQUE NOT NULL,
  preferred_items         TEXT,    -- comma-delimited item IDs
  disliked_items          TEXT,    -- comma-delimited item IDs
  forbidden_items         TEXT,    -- comma-delimited item IDs
  preferred_price_modifier NUMERIC(4,2) DEFAULT 1.0,
  disliked_price_modifier  NUMERIC(4,2) DEFAULT 0.8,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- eis_faction_narrative_events — Faction story events (FactionNarrativeEvents.csv)
-- Actual CSV: EventID, EventName, EventDescription, PrimaryFaction, SecondaryFaction, EventType, EscalationStages, CurrentStage, StageDurations, ReputationImpact, UrgencyLevel, bCanGenerateQuests
CREATE TABLE eis_faction_narrative_events (
  id                  SERIAL PRIMARY KEY,
  event_id            VARCHAR(20) UNIQUE NOT NULL,  -- e.g. "FNE_001"
  event_name          VARCHAR(200) NOT NULL,
  event_description   TEXT,
  primary_faction     VARCHAR(100),
  secondary_faction   VARCHAR(100),
  event_type          VARCHAR(100),    -- TerritorialConflict, ResourceDispute, etc.
  escalation_stages   TEXT,            -- pipe-delimited stage descriptions
  current_stage       INTEGER DEFAULT 0,
  stage_durations     TEXT,            -- comma-delimited stage durations in seconds
  reputation_impact   TEXT,            -- "FactionA:+N,FactionB:-N" format
  urgency_level       VARCHAR(20) DEFAULT 'Medium',
  b_can_generate_quests BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- eis_quest_hook_triggers — Quest hook conditions (QuestHookTriggers.csv)
-- Actual CSV: HookID, HookName, HookDescription, TriggerConditions, RequiredNPCs, RequiredFactions, QuestType, UrgencyLevel, HookCooldown, PlayerProximityRequired
CREATE TABLE eis_quest_hook_triggers (
  id                        SERIAL PRIMARY KEY,
  hook_id                   VARCHAR(20) UNIQUE NOT NULL,   -- e.g. "HOOK_001"
  hook_name                 VARCHAR(200) NOT NULL,
  hook_description          TEXT,
  trigger_conditions        TEXT,    -- "Condition1|Condition2" format
  required_npcs             TEXT,    -- "{NPC1},{NPC2}" format
  required_factions         TEXT,
  quest_type                VARCHAR(100),    -- Mediation, Escort, etc.
  urgency_level             VARCHAR(20) DEFAULT 'Medium',
  hook_cooldown             NUMERIC(10,2) DEFAULT 1800,    -- seconds
  player_proximity_required NUMERIC(10,2) DEFAULT 0,      -- distance, 0 = not required
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- eis_group_relationships — Group-to-group relationships (Groups.csv inter-group)
-- Actual CSV: GroupPairID, GroupA, GroupB, RelationshipStatus, TrustLevel, HistoryNotes
CREATE TABLE eis_group_relationships (
  id                  SERIAL PRIMARY KEY,
  group_pair_id       INTEGER UNIQUE NOT NULL,
  group_a             VARCHAR(100) NOT NULL,
  group_b             VARCHAR(100) NOT NULL,
  relationship_status VARCHAR(50) DEFAULT 'Neutral',   -- Hostile, Allied, etc.
  trust_level         INTEGER DEFAULT 5,               -- 0-10
  history_notes       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- eis_ai_parameters — NPC AI parameters (Ai.csv: ParameterID, NPCType, UpdateInterval, BehaviorProbabilities, StateDefinitions)
CREATE TABLE eis_ai_parameters (
  id                     SERIAL PRIMARY KEY,
  parameter_id           INTEGER UNIQUE NOT NULL,
  npc_type               VARCHAR(50),    -- PassiveNPC, ActiveNPC, etc.
  update_interval        NUMERIC(6,2) DEFAULT 10,   -- seconds
  behavior_probabilities TEXT,    -- "Idle:50%; Move:30%; Interact:20%" format
  state_definitions      TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCHEMA: simulation — Runtime tracking tables
-- ============================================================

-- eis_simulation_runs — Simulation metadata
CREATE TABLE eis_simulation_runs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(200) NOT NULL,
  seed        BIGINT NOT NULL DEFAULT 42,
  start_time  TIMESTAMPTZ DEFAULT NOW(),
  end_time    TIMESTAMPTZ,
  status      VARCHAR(20) DEFAULT 'running',   -- running, paused, completed, failed
  config      JSONB DEFAULT '{}',              -- arbitrary simulation config
  tick_count  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- eis_simulation_ticks — Per-tick world state snapshots
CREATE TABLE eis_simulation_ticks (
  id             SERIAL PRIMARY KEY,
  simulation_id  UUID REFERENCES eis_simulation_runs(id) ON DELETE CASCADE,
  tick_number    INTEGER NOT NULL,
  world_time     NUMERIC(14,4) DEFAULT 0,   -- in-game seconds elapsed
  summary_json   JSONB DEFAULT '{}',         -- { npc_count, avg_needs, events_count, ... }
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(simulation_id, tick_number)
);

-- eis_simulation_events — Events generated during simulation ticks
CREATE TABLE eis_simulation_events (
  id             SERIAL PRIMARY KEY,
  simulation_id  UUID REFERENCES eis_simulation_runs(id) ON DELETE CASCADE,
  tick_number    INTEGER NOT NULL,
  npc_id         VARCHAR(50),   -- nullable (world events have no NPC)
  event_type     VARCHAR(100) NOT NULL,   -- NeedCritical, BehaviorChange, Trade, Combat, etc.
  description    TEXT,
  data           JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- eis_faction_reputation_history — Faction reputation over time
CREATE TABLE eis_faction_reputation_history (
  id             SERIAL PRIMARY KEY,
  simulation_id  UUID REFERENCES eis_simulation_runs(id) ON DELETE CASCADE,
  tick_number    INTEGER NOT NULL,
  faction_a      VARCHAR(100) NOT NULL,
  faction_b      VARCHAR(100) NOT NULL,
  reputation     NUMERIC(6,2),
  momentum       NUMERIC(6,2) DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- eis_trust_history — Trust evolution between NPC pairs
CREATE TABLE eis_trust_history (
  id             SERIAL PRIMARY KEY,
  simulation_id  UUID REFERENCES eis_simulation_runs(id) ON DELETE CASCADE,
  tick_number    INTEGER NOT NULL,
  npc1_id        VARCHAR(50) NOT NULL,
  npc2_id        VARCHAR(50) NOT NULL,
  trust_level    NUMERIC(4,2),
  event_type     VARCHAR(100),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- eis_trade_log — Trade transactions between NPCs
CREATE TABLE eis_trade_log (
  id              SERIAL PRIMARY KEY,
  simulation_id   UUID REFERENCES eis_simulation_runs(id) ON DELETE CASCADE,
  tick_number     INTEGER NOT NULL,
  seller_npc_id   VARCHAR(50),
  buyer_npc_id    VARCHAR(50),
  item_id         INTEGER REFERENCES eis_items(item_id) ON DELETE SET NULL,
  quantity        INTEGER DEFAULT 1,
  agreed_price    NUMERIC(10,2),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES — Simulation query performance
-- ============================================================

CREATE INDEX idx_npcs_species        ON eis_npcs(species);
CREATE INDEX idx_npcs_emotional_state ON eis_npcs(emotional_state);
CREATE INDEX idx_npcs_home_location  ON eis_npcs(home_location);
CREATE INDEX idx_npcs_updated_at     ON eis_npcs(updated_at);

CREATE INDEX idx_npc_factions_faction ON eis_npc_factions(faction_id);
CREATE INDEX idx_npc_factions_npc     ON eis_npc_factions(npc_id);

CREATE INDEX idx_npc_roles_role       ON eis_npc_roles(role_id);
CREATE INDEX idx_npc_roles_npc        ON eis_npc_roles(npc_id);

CREATE INDEX idx_npc_talents_talent   ON eis_npc_talents(talent_id);
CREATE INDEX idx_npc_inventory_npc    ON eis_npc_inventory(npc_id);
CREATE INDEX idx_npc_inventory_item   ON eis_npc_inventory(item_id);

CREATE INDEX idx_relationships_npc1   ON eis_relationships(npc1_id);
CREATE INDEX idx_relationships_npc2   ON eis_relationships(npc2_id);
CREATE INDEX idx_relationships_npcs   ON eis_relationships(npc1_id, npc2_id);

CREATE INDEX idx_memories_npc         ON eis_memories(npc_id);
CREATE INDEX idx_npc_knowledge_npc    ON eis_npc_knowledge(npc_id);

CREATE INDEX idx_sim_ticks_sim        ON eis_simulation_ticks(simulation_id, tick_number);
CREATE INDEX idx_sim_events_sim_tick  ON eis_simulation_events(simulation_id, tick_number);
CREATE INDEX idx_sim_events_type      ON eis_simulation_events(event_type);
CREATE INDEX idx_sim_events_npc       ON eis_simulation_events(npc_id);

CREATE INDEX idx_trust_history        ON eis_trust_history(npc1_id, npc2_id, simulation_id);
CREATE INDEX idx_trust_history_tick   ON eis_trust_history(simulation_id, tick_number);

CREATE INDEX idx_faction_rep_history  ON eis_faction_reputation_history(simulation_id, tick_number);
CREATE INDEX idx_trade_log_sim        ON eis_trade_log(simulation_id, tick_number);
CREATE INDEX idx_trade_log_seller     ON eis_trade_log(seller_npc_id);
CREATE INDEX idx_trade_log_buyer      ON eis_trade_log(buyer_npc_id);

CREATE INDEX idx_faction_narrative_primary ON eis_faction_narrative_events(primary_faction);
CREATE INDEX idx_crafting_item         ON eis_crafting_recipes(crafted_item_id);

-- ============================================================
-- NOTIFY TRIGGERS — Real-time WebSocket notifications
-- ============================================================

-- Function to emit NOTIFY on NPC state changes
CREATE OR REPLACE FUNCTION eis_notify_npc_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(
    'eis_npc_changed',
    json_build_object(
      'npc_id',    NEW.npc_id,
      'operation', TG_OP,
      'updated_at', NEW.updated_at
    )::text
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER eis_npc_after_update
  AFTER UPDATE ON eis_npcs
  FOR EACH ROW EXECUTE FUNCTION eis_notify_npc_change();

-- Function to emit NOTIFY on new simulation events
CREATE OR REPLACE FUNCTION eis_notify_sim_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(
    'eis_sim_event',
    json_build_object(
      'simulation_id', NEW.simulation_id,
      'tick_number',   NEW.tick_number,
      'event_type',    NEW.event_type,
      'npc_id',        NEW.npc_id,
      'id',            NEW.id
    )::text
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER eis_sim_event_after_insert
  AFTER INSERT ON eis_simulation_events
  FOR EACH ROW EXECUTE FUNCTION eis_notify_sim_event();

-- Function to emit NOTIFY on tick completion
CREATE OR REPLACE FUNCTION eis_notify_tick_complete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(
    'eis_tick_complete',
    json_build_object(
      'simulation_id', NEW.simulation_id,
      'tick_number',   NEW.tick_number,
      'world_time',    NEW.world_time
    )::text
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER eis_tick_after_insert
  AFTER INSERT ON eis_simulation_ticks
  FOR EACH ROW EXECUTE FUNCTION eis_notify_tick_complete();

-- Auto-update updated_at on eis_npcs
CREATE OR REPLACE FUNCTION eis_update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER eis_npcs_update_timestamp
  BEFORE UPDATE ON eis_npcs
  FOR EACH ROW EXECUTE FUNCTION eis_update_updated_at();

CREATE TRIGGER eis_relationships_update_timestamp
  BEFORE UPDATE ON eis_relationships
  FOR EACH ROW EXECUTE FUNCTION eis_update_updated_at();
