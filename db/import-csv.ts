#!/usr/bin/env npx tsx
// ============================================================
// EIS Web — CSV Import Script
// Reads all CSV files from /data/workspace/github/EIS/Data/ and DataFlat/
// Parses with PapaParse and INSERTs into PostgreSQL
//
// Usage:
//   npx tsx db/import-csv.ts
//   npx tsx db/import-csv.ts --table eis_npcs      # single table only
//   npx tsx db/import-csv.ts --dry-run              # parse only, no writes
//
// Import order respects FK constraints:
//   1. eis_roles → eis_factions → eis_skills → eis_talents → eis_talent_domains
//   2. eis_needs_catalog → eis_behaviors → eis_actions → eis_emotions → eis_traits
//   3. eis_cultural_groups → eis_items → eis_crafting_recipes
//   4. eis_quests → eis_risks → eis_role_requirements → eis_role_equipment_restrictions
//   5. eis_environments → eis_schedules → eis_events → eis_zone_streaming
//   6. eis_interactive_objects
//   7. eis_communication_protocols → eis_conversation_patterns
//   8. eis_emotional_contagion_rules → eis_trust_evolution_parameters
//   9. eis_rumor_templates → eis_faction_reputation_matrix → eis_faction_item_preferences
//  10. eis_faction_narrative_events → eis_quest_hook_triggers → eis_group_relationships → eis_ai_parameters
//  11. eis_knowledge_entries
//  12. eis_npcs                    (depends on nothing upstream at FK level)
//  13. eis_relationships → eis_memories → eis_npc_knowledge
//  14. eis_npc_roles → eis_npc_factions → eis_npc_talents → eis_npc_inventory
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import sql, { testConnection } from './connection.js';

// ─── CLI args ───────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const tableArg  = args.find(a => a.startsWith('--table='))?.split('=')[1] ?? null;

// ─── Paths ──────────────────────────────────────────────────
const DATA_DIR      = '/data/workspace/github/EIS/Data';
const DATA_FLAT_DIR = '/data/workspace/github/EIS/DataFlat';

// ─── Helpers ────────────────────────────────────────────────

function readCsv(filePath: string): Record<string, string>[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`  [SKIP] File not found: ${filePath}`);
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const result  = Papa.parse<Record<string, string>>(content, {
    header:          true,
    skipEmptyLines:  true,
    transformHeader: (h) => h.trim(),
    transform:       (v) => v.trim(),
  });
  if (result.errors.length > 0) {
    result.errors.slice(0, 5).forEach(e => console.warn(`  [CSV ERR] ${e.message}`));
  }
  return result.data;
}

function toNum(v: string | undefined, def = 0): number {
  const n = parseFloat(v ?? '');
  return isNaN(n) ? def : n;
}

function toInt(v: string | undefined, def = 0): number {
  const n = parseInt(v ?? '', 10);
  return isNaN(n) ? def : n;
}

function toBool(v: string | undefined, def = false): boolean {
  if (v === undefined || v === null || v === '') return def;
  return v.toLowerCase() === 'true' || v === '1';
}

async function upsertBatch<T extends Record<string, unknown>>(
  tableName: string,
  rows: T[],
  conflictKey: string,
): Promise<void> {
  if (rows.length === 0) return;
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would insert ${rows.length} rows into ${tableName}`);
    return;
  }
  // Chunk into groups of 200 to avoid parameter limits
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await sql`
      INSERT INTO ${sql(tableName)} ${sql(chunk)}
      ON CONFLICT (${sql(conflictKey)}) DO NOTHING
    `;
  }
  console.log(`  Inserted ${rows.length} rows → ${tableName}`);
}

// ─── Importers (one per table) ───────────────────────────────

async function importRoles(): Promise<void> {
  console.log('Importing eis_roles …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Roles.csv'));
  const mapped = rows.map(r => ({
    role_id:              toInt(r.RoleID),
    role_name:            r.RoleName ?? '',
    description:          r.Description ?? null,
    key_responsibilities: r.KeyResponsibilities ?? null,
    required_skills:      r.RequiredSkills ?? null,
  }));
  await upsertBatch('eis_roles', mapped, 'role_id');
}

async function importFactions(): Promise<void> {
  console.log('Importing eis_factions …');
  const rows = readCsv(path.join(DATA_DIR, 'Core', 'Groups_Definitions.csv'));
  const mapped = rows.map(r => ({
    group_id:    toInt(r.GroupID),
    group_name:  r.GroupName ?? '',
    description: r.Description ?? null,
    territory:   r.Territory ?? null,
    leadership:  r.Leadership ?? null,
    population:  r.Population ?? null,
    resources:   r.Resources ?? null,
  }));
  await upsertBatch('eis_factions', mapped, 'group_id');
}

async function importSkills(): Promise<void> {
  console.log('Importing eis_skills …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Skills.csv'));
  const mapped = rows.map(r => ({
    skill_id:              r.SkillID ?? '',
    skill_name:            r.SkillName ?? '',
    description:           r.Description ?? null,
    requirements:          r.Requirements ?? null,
    associated_attributes: r.AssociatedAttributes ?? null,
    attribute_modifiers:   r.AttributeModifiers ?? null,
    effect_on_behaviors:   r.EffectOnBehaviors ?? null,
  }));
  await upsertBatch('eis_skills', mapped, 'skill_id');
}

async function importTalents(): Promise<void> {
  console.log('Importing eis_talents …');
  const rows = readCsv(path.join(DATA_DIR, 'Behavioral', 'Talents.csv'));
  const mapped = rows.map(r => ({
    talent_id:           r.TalentID ?? '',
    talent_name:         r.TalentName ?? '',
    domain:              r.Domain ?? null,
    core_definition:     r.CoreDefinition ?? null,
    brings:              r.Brings ?? null,
    needs:               r.Needs ?? null,
    potential_blind_spot: r.PotentialBlindSpot ?? null,
  }));
  await upsertBatch('eis_talents', mapped, 'talent_id');
}

async function importTalentDomains(): Promise<void> {
  console.log('Importing eis_talent_domains …');
  const rows = readCsv(path.join(DATA_DIR, 'Behavioral', 'TalentDomainMapping.csv'));
  const mapped = rows.map(r => ({
    domain_id:            r.DomainID ?? '',
    domain_name:          r.DomainName ?? '',
    drive:                r.Drive ?? null,
    gameplay_role:        r.GameplayRole ?? null,
    talent_count:         toInt(r.TalentCount),
    talent_ids:           r.TalentIDs ?? null,
    complementary_domain: r.ComplementaryDomain ?? null,
    contrasting_domain:   r.ContrastingDomain ?? null,
  }));
  await upsertBatch('eis_talent_domains', mapped, 'domain_id');
}

async function importNeedsCatalog(): Promise<void> {
  console.log('Importing eis_needs_catalog …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Needs.csv'));
  const mapped = rows.map(r => ({
    need_id:                  toInt(r.NeedID),
    need_name:                r.NeedName ?? '',
    description:              r.Description ?? null,
    default_value:            toNum(r.DefaultValue, 50),
    increase_rate:            toNum(r.IncreaseRate, 0.1),
    priority_weight:          toNum(r.PriorityWeight, 5),
    modifiers:                r.Modifiers ?? null,
    satisfaction_thresholds:  toNum(r.SatisfactionThresholds, 80),
  }));
  await upsertBatch('eis_needs_catalog', mapped, 'need_id');
}

async function importBehaviors(): Promise<void> {
  console.log('Importing eis_behaviors …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Behavior.csv'));
  const mapped = rows.map(r => ({
    behavior_id:                  toInt(r.BehaviorID),
    behavior_name:                r.BehaviorName ?? '',
    description:                  r.Description ?? null,
    associated_needs:             r.AssociatedNeeds ?? null,
    required_attributes_skills:   r.RequiredAttributesSkills ?? null,
    persona_traits_influence:     r.PersonaTraitsInfluence ?? null,
    conditions:                   r.Conditions ?? null,
    effects:                      r.Effects ?? null,
    animation_action_references:  r.AnimationActionReferences ?? null,
  }));
  await upsertBatch('eis_behaviors', mapped, 'behavior_id');
}

async function importActions(): Promise<void> {
  console.log('Importing eis_actions …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Action.csv'));
  const mapped = rows.map(r => ({
    action_id:           toInt(r.ActionID),
    action_name:         r.ActionName ?? '',
    description:         r.Description ?? null,
    affected_needs:      r.AffectedNeeds ?? null,
    attribute_changes:   r.AttributeChanges ?? null,
    relationship_impact: r.RelationshipImpact ?? null,
    behavior_id:         r.BehaviorID ? toInt(r.BehaviorID) : null,
  }));
  await upsertBatch('eis_actions', mapped, 'action_id');
}

async function importEmotions(): Promise<void> {
  console.log('Importing eis_emotions …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Emotions.csv'));
  const mapped = rows.map(r => ({
    emotion_id:           toInt(r.EmotionID),
    emotion_name:         r.EmotionName ?? '',
    description:          r.Description ?? null,
    triggers:             r.Triggers ?? null,
    effects_on_behaviors: r.EffectsOnBehaviors ?? null,
    duration:             r.Duration ?? 'Variable',
  }));
  await upsertBatch('eis_emotions', mapped, 'emotion_id');
}

async function importTraits(): Promise<void> {
  console.log('Importing eis_traits …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Traits.csv'));
  const mapped = rows.map(r => ({
    trait_id:            toInt(r.TraitID),
    trait_name:          r.TraitName ?? '',
    description:         r.Description ?? null,
    effect_on_behaviors: r.EffectOnBehaviors ?? null,
    default_value:       toNum(r.DefaultValue, 5),
    range_min:           toNum(r.RangeMin, 1),
    range_max:           toNum(r.RangeMax, 10),
  }));
  await upsertBatch('eis_traits', mapped, 'trait_id');
}

async function importCulturalGroups(): Promise<void> {
  console.log('Importing eis_cultural_groups …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Cultural.csv'));
  const mapped = rows.map(r => ({
    culture_id:          toInt(r.CultureID),
    culture_name:        r.CultureName ?? '',
    description:         r.Description ?? null,
    values_and_beliefs:  r.ValuesAndBeliefs ?? null,
    preferred_behaviors: r.PreferredBehaviors ?? null,
    cultural_events:     r.CulturalEvents ?? null,
  }));
  await upsertBatch('eis_cultural_groups', mapped, 'culture_id');
}

async function importItems(): Promise<void> {
  console.log('Importing eis_items …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Item.csv'));
  const mapped = rows.map(r => ({
    item_id:      toInt(r.ItemID),
    item_name:    r.ItemName ?? '',
    description:  r.Description ?? null,
    item_type:    r.ItemType ?? null,
    effects:      r.Effects ?? null,
    value:        toNum(r.Value, 0),
    availability: r.Availability ?? 'Common',
  }));
  await upsertBatch('eis_items', mapped, 'item_id');
}

async function importCraftingRecipes(): Promise<void> {
  console.log('Importing eis_crafting_recipes …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'CraftingRecipes.csv'));
  const mapped = rows.map(r => ({
    recipe_id:               toInt(r.RecipeID),
    recipe_name:             r.RecipeName ?? '',
    description:             r.Description ?? null,
    required_ingredients:    r.RequiredIngredients ?? null,
    // NULL out crafted_item_id if the referenced item doesn't exist yet
    crafted_item_id:         null as null,
    crafted_quantity:        toInt(r.CraftedQuantity, 1),
    skill_requirements:      r.SkillRequirements ?? null,
    crafting_time:           toNum(r.CraftingTime, 10),
    faction_restriction:     r.FactionRestriction ?? null,
    b_is_discovered:         toBool(r.bIsDiscovered, true),
    recipe_rarity:           r.RecipeRarity ?? 'Common',
    base_success_chance:     toNum(r.BaseSuccessChance, 90),
    critical_success_chance: toNum(r.CriticalSuccessChance, 5),
    optional_catalysts:      r.OptionalCatalysts ?? null,
  }));
  // Store raw CraftedItemID in a separate pass after all items are loaded
  await upsertBatch('eis_crafting_recipes', mapped, 'recipe_id');
  // Back-fill crafted_item_id where the item now exists
  for (const r of rows) {
    const itemId = r.CraftedItemID ? toInt(r.CraftedItemID) : null;
    if (!itemId) continue;
    await sql`
      UPDATE eis_crafting_recipes
      SET crafted_item_id = ${itemId}
      WHERE recipe_id = ${toInt(r.RecipeID)}
        AND EXISTS (SELECT 1 FROM eis_items WHERE item_id = ${itemId})
    `;
  }
}

async function importQuests(): Promise<void> {
  console.log('Importing eis_quests …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Quests.csv'));
  const mapped = rows.map(r => ({
    faction:           r.Faction ?? null,
    quest_name:        r['Quest Name'] ?? r.QuestName ?? '',
    quest_description: r['Quest Description'] ?? r.QuestDescription ?? null,
    success_conditions: r['Success Conditions'] ?? r.SuccessConditions ?? null,
    requirements:      r.Requirements ?? null,
    rewards:           r.Rewards ?? null,
  }));
  // quests table has no unique key other than serial, use insert with conflict check on name
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would insert ${mapped.length} rows into eis_quests`);
    return;
  }
  const CHUNK = 200;
  for (let i = 0; i < mapped.length; i += CHUNK) {
    await sql`INSERT INTO eis_quests ${sql(mapped.slice(i, i + CHUNK))}`;
  }
  console.log(`  Inserted ${mapped.length} rows → eis_quests`);
}

async function importRisks(): Promise<void> {
  console.log('Importing eis_risks …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Risk.csv'));
  const mapped = rows.map(r => ({
    risk_id:              r.RiskID ?? '',
    risk_name:            r.RiskName ?? '',
    description:          r.Description ?? null,
    associated_locations: r.AssociatedLocations ?? null,
    associated_npcs:      r.AssociatedNPCs ?? null,
  }));
  await upsertBatch('eis_risks', mapped, 'risk_id');
}

async function importRoleRequirements(): Promise<void> {
  console.log('Importing eis_role_requirements …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'RoleReqs.csv'));
  // RoleReqs.csv uses 1400-series IDs; map to Roles.csv 1-series IDs by subtracting 1400
  const existingRoles = await sql`SELECT role_id FROM eis_roles`;
  const validRoleIds  = new Set(existingRoles.map(r => r.role_id as number));

  const mapped = rows
    .map(r => ({
      // RoleReqs uses 1401,1402... → map to 1,2... (subtract 1400)
      role_id:                    toInt(r.RoleID) > 100 ? toInt(r.RoleID) - 1400 : toInt(r.RoleID),
      preferred_attributes:       r.PreferredAttributes ?? null,
      minimum_attributes:         r.MinimumAttributes ?? null,
      preferred_skills:           r.PreferredSkills ?? null,
      persona_traits_preferences: r.PersonaTraitsPreferences ?? null,
      training_required:          r.TrainingRequired?.toLowerCase() === 'yes',
    }))
    .filter(r => validRoleIds.has(r.role_id));

  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would insert ${mapped.length} rows into eis_role_requirements`);
    return;
  }
  for (let i = 0; i < mapped.length; i += 200) {
    await sql`INSERT INTO eis_role_requirements ${sql(mapped.slice(i, i + 200))} ON CONFLICT DO NOTHING`;
  }
  console.log(`  Inserted ${mapped.length} rows → eis_role_requirements`);
}

async function importRoleEquipmentRestrictions(): Promise<void> {
  console.log('Importing eis_role_equipment_restrictions …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'RoleEquipmentRestrictions.csv'));
  const mapped = rows.map(r => ({
    role_id:            toInt(r.RoleID),
    allowed_item_types: r.AllowedItemTypes ?? null,
    forbidden_item_ids: r.ForbiddenItemIDs ?? null,
    preferred_item_ids: r.PreferredItemIDs ?? null,
    slot_restrictions:  r.SlotRestrictions ?? null,
  }));
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would insert ${mapped.length} rows into eis_role_equipment_restrictions`);
    return;
  }
  for (let i = 0; i < mapped.length; i += 200) {
    await sql`INSERT INTO eis_role_equipment_restrictions ${sql(mapped.slice(i, i + 200))} ON CONFLICT DO NOTHING`;
  }
  console.log(`  Inserted ${mapped.length} rows → eis_role_equipment_restrictions`);
}

async function importEnvironments(): Promise<void> {
  console.log('Importing eis_environments …');
  // Use the richer WeatherConditions version if available, fallback to Environment.csv
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'WeatherConditions.csv'));
  const mapped = rows.map(r => ({
    environment_id:                 toInt(r.EnvironmentID),
    condition_name:                 r.ConditionName ?? '',
    weather_type:                   toInt(r.WeatherType, 0),
    intensity:                      toNum(r.Intensity, 0.5),
    duration:                       r.Duration ?? 'Variable',
    comfort_modifier:               toNum(r.ComfortModifier, 0),
    visibility_range:               toNum(r.VisibilityRange, 10000),
    temperature_modifier:           toNum(r.TemperatureModifier, 0),
    humidity_level:                 toNum(r.HumidityLevel, 0.5),
    wind_strength:                  toNum(r.WindStrength, 0.1),
    b_affects_npc_behavior:         toBool(r.bAffectsNPCBehavior, true),
    b_affects_interactive_objects:  toBool(r.bAffectsInteractiveObjects, false),
    b_blocks_outdoor_activities:    toBool(r.bBlocksOutdoorActivities, false),
    cloud_coverage:                 toNum(r.CloudCoverage, 0.1),
    precipitation:                  toNum(r.Precipitation, 0),
    fog_color_r:                    toNum(r.FogColorR, 0.8),
    fog_color_g:                    toNum(r.FogColorG, 0.9),
    fog_color_b:                    toNum(r.FogColorB, 1.0),
    need_modifiers:                 r.NeedModifiers ?? null,
    trigger_conditions:             r.TriggerConditions ?? null,
    effects_on_behaviors:           r.EffectsOnBehaviors ?? null,
  }));
  await upsertBatch('eis_environments', mapped, 'environment_id');
}

async function importSchedules(): Promise<void> {
  console.log('Importing eis_schedules …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Schedule.csv'));
  const mapped = rows.map(r => ({
    schedule_id:      toInt(r.ScheduleID),
    schedule_name:    r.ScheduleName ?? '',
    description:      r.Description ?? null,
    time_slots:       r.TimeSlots ?? null,
    associated_roles: r.AssociatedRoles ?? null,
    conditions:       r.Conditions ?? null,
  }));
  await upsertBatch('eis_schedules', mapped, 'schedule_id');
}

async function importEvents(): Promise<void> {
  console.log('Importing eis_events …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Event.csv'));
  const mapped = rows.map(r => ({
    event_id:                    toInt(r.EventID),
    event_name:                  r.EventName ?? '',
    description:                 r.Description ?? null,
    schedule:                    r.Schedule ?? null,
    required_roles:              r.RequiredRoles ?? null,
    benefits:                    r.Benefits ?? null,
    participation_requirements:  r.ParticipationRequirements ?? null,
  }));
  await upsertBatch('eis_events', mapped, 'event_id');
}

async function importZoneStreaming(): Promise<void> {
  console.log('Importing eis_zone_streaming …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'ZoneStreaming.csv'));
  const mapped = rows.map(r => {
    const [cx = '0', cy = '0', cz = '0'] = (r.ZoneCenterX ?? '0,0,0').split(',');
    const [ex = '2000', ey = '2000', ez = '200'] = (r.ZoneExtentX ?? '2000,2000,200').split(',');
    return {
      zone_id:                  toInt(r.ZoneID),
      zone_name:                r.ZoneName ?? '',
      streaming_radius:         toNum(r.StreamingRadius, 3000),
      unload_radius:            toNum(r.UnloadRadius, 4500),
      priority:                 toNum(r.Priority, 1.0),
      b_stream_weather_data:    toBool(r.bStreamWeatherData, true),
      b_stream_inventory_data:  toBool(r.bStreamInventoryData, true),
      b_stream_quest_data:      toBool(r.bStreamQuestData, true),
      b_stream_npc_data:        toBool(r.bStreamNPCData, true),
      max_memory_budget:        toInt(r.MaxMemoryBudget, 800),
      zone_center_x:            toNum(cx.replace(/["']/g, '')),
      zone_center_y:            toNum(cy.replace(/["']/g, '')),
      zone_center_z:            toNum(cz.replace(/["']/g, '')),
      zone_extent_x:            toNum(ex.replace(/["']/g, '')),
      zone_extent_y:            toNum(ey.replace(/["']/g, '')),
      zone_extent_z:            toNum(ez.replace(/["']/g, '')),
      streaming_levels:         r.StreamingLevels ?? null,
    };
  });
  await upsertBatch('eis_zone_streaming', mapped, 'zone_id');
}

async function importInteractiveObjects(): Promise<void> {
  console.log('Importing eis_interactive_objects …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'InteractiveObjects.csv'));
  const existingZones = await sql`SELECT zone_id FROM eis_zone_streaming`;
  const validZoneIds  = new Set(existingZones.map(z => z.zone_id as number));
  const mapped = rows.map(r => {
    const zoneId = r.ZoneID ? toInt(r.ZoneID) : null;
    return {
      object_id:               toInt(r.ObjectID),
      object_name:             r.ObjectName ?? '',
      object_type:             toInt(r.ObjectType, 0),
      interaction_range:       toNum(r.InteractionRange, 200),
      b_requires_quest:        toBool(r.bRequiresQuest, false),
      required_quest_ids:      r.RequiredQuestIDs ?? null,
      b_weather_responsive:    toBool(r.bWeatherResponsive, false),
      weather_responses:       r.WeatherResponses ?? null,
      b_persistent:            toBool(r.bPersistent, true),
      inventory_capacity:      toInt(r.InventoryCapacity, 0),
      b_generate_loot:         toBool(r.bGenerateLoot, false),
      loot_table:              r.LootTable ?? null,
      faction_loot_modifiers:  r.FactionLootModifiers ?? null,
      // NULL out zone_id if it doesn't exist in zone_streaming
      zone_id:                 (zoneId && validZoneIds.has(zoneId)) ? zoneId : null,
      location_x:              toNum(r.LocationX, 0),
      location_y:              toNum(r.LocationY, 0),
      location_z:              toNum(r.LocationZ, 0),
    };
  });
  await upsertBatch('eis_interactive_objects', mapped, 'object_id');
}

async function importCommunicationProtocols(): Promise<void> {
  console.log('Importing eis_communication_protocols …');
  const rows = readCsv(path.join(DATA_DIR, 'Communication', 'CommunicationProtocols.csv'));
  const mapped = rows.map(r => ({
    protocol_id:              r.ProtocolID ?? '',
    protocol_name:            r.ProtocolName ?? '',
    protocol_type:            r.ProtocolType ?? null,
    description:              r.Description ?? null,
    required_capabilities:    r.RequiredCapabilities ?? null,
    transmission_fidelity:    toInt(r.TransmissionFidelity, 95),
    range:                    r.Range ?? 'Close',
    detection_requirements:   r.DetectionRequirements ?? null,
    knowledge_transfer_rate:  r.KnowledgeTransferRate ?? 'Medium',
    emotional_transfer:       r.EmotionalTransfer ?? 'Low',
    cultural_modifiers:       r.CulturalModifiers ?? null,
    species_compatibility:    r.SpeciesCompatibility ?? null,
  }));
  await upsertBatch('eis_communication_protocols', mapped, 'protocol_id');
}

async function importConversationPatterns(): Promise<void> {
  console.log('Importing eis_conversation_patterns …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'ConversationPatterns.csv'));
  const mapped = rows.map(r => ({
    pattern_id:             r.PatternID ?? '',
    pattern_name:           r.PatternName ?? '',
    description:            r.Description ?? null,
    required_traits:        r.RequiredTraits ?? null,
    faction_restriction:    r.FactionRestriction ?? null,
    species_compatibility:  r.SpeciesCompatibility ?? null,
    conversation_themes:    r.ConversationThemes ?? null,
    dialogue_starters:      r.DialogueStarters ?? null,
    default_tone:           r.DefaultTone ?? 'Neutral',
    conversation_duration:  toNum(r.ConversationDuration, 60),
    pattern_cooldown:       toNum(r.PatternCooldown, 300),
    selection_weight:       toNum(r.SelectionWeight, 50),
  }));
  await upsertBatch('eis_conversation_patterns', mapped, 'pattern_id');
}

async function importEmotionalContagionRules(): Promise<void> {
  console.log('Importing eis_emotional_contagion_rules …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'EmotionalContagionRules.csv'));
  const mapped = rows.map(r => ({
    rule_id:                          toInt(r.RuleID),
    source_emotion:                   r.SourceEmotion ?? '',
    contagion_type:                   r.ContagionType ?? null,
    base_contagion_strength:          toNum(r.BaseContagionStrength, 0.5),
    relationship_strength_multiplier: toNum(r.RelationshipStrengthMultiplier, 1.0),
    personality_openness_factor:      toNum(r.PersonalityOpennessFactor, 1.0),
    distance_decay_rate:              toNum(r.DistanceDecayRate, 0.2),
    max_propagation_distance:         toInt(r.MaxPropagationDistance, 3),
    duration_multiplier:              toNum(r.DurationMultiplier, 0.8),
    resistance_threshold:             toNum(r.ResistanceThreshold, 0.3),
    faction_amplification_factor:     toNum(r.FactionAmplificationFactor, 1.3),
  }));
  await upsertBatch('eis_emotional_contagion_rules', mapped, 'rule_id');
}

async function importTrustEvolutionParameters(): Promise<void> {
  console.log('Importing eis_trust_evolution_parameters …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'TrustEvolutionParameters.csv'));
  const mapped = rows.map(r => ({
    parameter_id:               toInt(r.ParameterID),
    event_type:                 r.EventType ?? '',
    base_trust_change:          toNum(r.BaseTrustChange, 0),
    personality_multiplier:     toNum(r.PersonalityMultiplier, 1.0),
    time_decay_factor:          toNum(r.TimeDecayFactor, 0.01),
    diminishing_returns_factor: toNum(r.DiminishingReturnsFactor, 0.8),
    max_change_per_event:       toNum(r.MaxChangePerEvent, 15.0),
    recovery_difficulty:        toNum(r.RecoveryDifficulty, 1.0),
    witness_impact_multiplier:  toNum(r.WitnessImpactMultiplier, 0.3),
    faction_influence_weight:   toNum(r.FactionInfluenceWeight, 0.5),
  }));
  await upsertBatch('eis_trust_evolution_parameters', mapped, 'parameter_id');
}

async function importRumorTemplates(): Promise<void> {
  console.log('Importing eis_rumor_templates …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'RumorTemplates.csv'));
  const mapped = rows.map(r => ({
    rumor_id:                r.RumorID ?? '',
    rumor_name:              r.RumorName ?? '',
    rumor_template:          r.RumorTemplate ?? null,
    subject_categories:      r.SubjectCategories ?? null,
    required_trust_level:    toNum(r.RequiredTrustLevel, 25),
    credibility_decay:       toNum(r.CredibilityDecay, 0.05),
    corruption_chance:       toNum(r.CorruptionChance, 0.02),
    max_propagation_hops:    toInt(r.MaxPropagationHops, 8),
    spread_rate:             toNum(r.SpreadRate, 1.2),
    faction_bias:            r.FactionBias ?? 'Neutral',
  }));
  await upsertBatch('eis_rumor_templates', mapped, 'rumor_id');
}

async function importFactionReputationMatrix(): Promise<void> {
  console.log('Importing eis_faction_reputation_matrix …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'FactionReputationMatrix.csv'));
  const mapped = rows.map(r => ({
    entry_id:                   toInt(r.EntryID),
    faction_a:                  r.FactionA ?? '',
    faction_b:                  r.FactionB ?? '',
    reputation_level:           toNum(r.ReputationLevel, 50),
    reputation_change_rate:     toNum(r.ReputationChangeRate, 0.3),
    reputation_decay_rate:      toNum(r.ReputationDecayRate, 0.02),
    public_standing:            toNum(r.PublicStanding, 50),
    trade_relationship_modifier: toNum(r.TradeRelationshipModifier, 1.0),
    hostility_threshold:        toNum(r.HostilityThreshold, 20),
    alliance_threshold:         toNum(r.AllianceThreshold, 75),
    reputation_momentum:        toNum(r.ReputationMomentum, 0),
    last_significant_event:     r.LastSignificantEvent ?? null,
    event_impact_decay_rate:    toNum(r.EventImpactDecayRate, 0.03),
  }));
  await upsertBatch('eis_faction_reputation_matrix', mapped, 'entry_id');
}

async function importFactionItemPreferences(): Promise<void> {
  console.log('Importing eis_faction_item_preferences …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'FactionItemPreferences.csv'));
  const mapped = rows.map(r => ({
    faction_name:             r.FactionName ?? '',
    preferred_items:          r.PreferredItems ?? null,
    disliked_items:           r.DislikedItems ?? null,
    forbidden_items:          r.ForbiddenItems ?? null,
    preferred_price_modifier: toNum(r.PreferredPriceModifier, 1.0),
    disliked_price_modifier:  toNum(r.DislikedPriceModifier, 0.8),
  }));
  await upsertBatch('eis_faction_item_preferences', mapped, 'faction_name');
}

async function importFactionNarrativeEvents(): Promise<void> {
  console.log('Importing eis_faction_narrative_events …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'FactionNarrativeEvents.csv'));
  const mapped = rows.map(r => ({
    event_id:              r.EventID ?? '',
    event_name:            r.EventName ?? '',
    event_description:     r.EventDescription ?? null,
    primary_faction:       r.PrimaryFaction ?? null,
    secondary_faction:     r.SecondaryFaction ?? null,
    event_type:            r.EventType ?? null,
    escalation_stages:     r.EscalationStages ?? null,
    current_stage:         toInt(r.CurrentStage, 0),
    stage_durations:       r.StageDurations ?? null,
    reputation_impact:     r.ReputationImpact ?? null,
    urgency_level:         r.UrgencyLevel ?? 'Medium',
    b_can_generate_quests: toBool(r.bCanGenerateQuests, true),
  }));
  await upsertBatch('eis_faction_narrative_events', mapped, 'event_id');
}

async function importQuestHookTriggers(): Promise<void> {
  console.log('Importing eis_quest_hook_triggers …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'QuestHookTriggers.csv'));
  const mapped = rows.map(r => ({
    hook_id:                       r.HookID ?? '',
    hook_name:                     r.HookName ?? '',
    hook_description:              r.HookDescription ?? null,
    trigger_conditions:            r.TriggerConditions ?? null,
    required_npcs:                 r.RequiredNPCs ?? null,
    required_factions:             r.RequiredFactions ?? null,
    quest_type:                    r.QuestType ?? null,
    urgency_level:                 r.UrgencyLevel ?? 'Medium',
    hook_cooldown:                 toNum(r.HookCooldown, 1800),
    player_proximity_required:     toNum(r.PlayerProximityRequired, 0),
  }));
  await upsertBatch('eis_quest_hook_triggers', mapped, 'hook_id');
}

async function importGroupRelationships(): Promise<void> {
  console.log('Importing eis_group_relationships …');
  const rows = readCsv(path.join(DATA_DIR, 'Core', 'Groups.csv'));
  const mapped = rows.map(r => ({
    group_pair_id:       toInt(r.GroupPairID),
    group_a:             r.GroupA ?? '',
    group_b:             r.GroupB ?? '',
    relationship_status: r.RelationshipStatus ?? 'Neutral',
    trust_level:         toInt(r.TrustLevel, 5),
    history_notes:       r.HistoryNotes ?? null,
  }));
  await upsertBatch('eis_group_relationships', mapped, 'group_pair_id');
}

async function importAiParameters(): Promise<void> {
  console.log('Importing eis_ai_parameters …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Ai.csv'));
  const mapped = rows.map(r => ({
    parameter_id:           toInt(r.ParameterID),
    npc_type:               r.NPCType ?? null,
    update_interval:        toNum(r.UpdateInterval, 10),
    behavior_probabilities: r.BehaviorProbabilities ?? null,
    state_definitions:      r.StateDefinitions ?? null,
  }));
  await upsertBatch('eis_ai_parameters', mapped, 'parameter_id');
}

async function importKnowledgeEntries(): Promise<void> {
  console.log('Importing eis_knowledge_entries …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Knowledge.csv'));
  const mapped = rows.map(r => ({
    faction:                                r.Faction ?? null,
    knowledge_type:                         r['Knowledge Type'] ?? r.KnowledgeType ?? null,
    knowledge_description:                  r['Knowledge Description'] ?? r.KnowledgeDescription ?? null,
    how_it_can_be_learned_or_exchanged:     r['How It Can Be Learned or Exchanged'] ?? null,
    impact_on_plot_development:             r['Impact on Plot Development'] ?? null,
  }));
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would insert ${mapped.length} rows into eis_knowledge_entries`);
    return;
  }
  const CHUNK = 200;
  for (let i = 0; i < mapped.length; i += CHUNK) {
    await sql`INSERT INTO eis_knowledge_entries ${sql(mapped.slice(i, i + CHUNK))}`;
  }
  console.log(`  Inserted ${mapped.length} rows → eis_knowledge_entries`);
}

async function importNpcs(): Promise<void> {
  console.log('Importing eis_npcs …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'NPCs.csv'));
  const mapped = rows.map(r => ({
    npc_id:            r.NPC_ID ?? '',
    name:              r.Name ?? '',
    species:           r.Species ?? 'Human',
    age:               r.Age ? toInt(r.Age) : null,
    gender:            r.Gender ?? null,
    strength:          toNum(r.Strength, 5),
    dexterity:         toNum(r.Dexterity, 5),
    endurance:         toNum(r.Endurance, 5),
    health:            toNum(r.Health, 80),
    intelligence:      toNum(r.Intelligence, 5),
    wisdom:            toNum(r.Wisdom, 5),
    willpower:         toNum(r.Willpower, 5),
    charisma:          toNum(r.Charisma, 5),
    aggression:        toNum(r.Aggression, 5),
    friendliness:      toNum(r.Friendliness, 5),
    curiosity:         toNum(r.Curiosity, 5),
    fearfulness:       toNum(r.Fearfulness, 5),
    loyalty:           toNum(r.Loyalty, 5),
    independence:      toNum(r.Independence, 5),
    confidence:        toNum(r.Confidence, 5),
    patience:          toNum(r.Patience, 5),
    honesty:           toNum(r.Honesty, 5),
    empathy:           toNum(r.Empathy, 5),
    resourcefulness:   toNum(r.Resourcefulness, 5),
    greed:             toNum(r.Greed, 5),
    generosity:        toNum(r.Generosity, 5),
    survival_instinct: toNum(r.SurvivalInstinct, 5),
    hunger:            toNum(r.Hunger, 50),
    thirst:            toNum(r.Thirst, 50),
    rest:              toNum(r.Rest, 50),
    social_interaction: toNum(r.SocialInteraction, 50),
    energy:            toNum(r.Energy, 60),
    hygiene:           toNum(r.Hygiene, 40),
    comfort:           toNum(r.Comfort, 50),
    memory_decay_rate: toNum(r.MemoryDecayRate, 0.01),
    knowledge_capacity: toInt(r.KnowledgeCapacity, 100),
    emotional_state:   r.EmotionalState ?? 'Neutral',
    awareness_level:   r.AwarenessLevel ?? 'Active',
    home_location:     r.HomeLocation ?? null,
    work_location:     r.WorkLocation ?? null,
    needs_home:        toBool(r.NeedsHome, false),
    needs_work:        toBool(r.NeedsWork, false),
    needs_risk_info:   toBool(r.NeedsRiskInfo, false),
    group_affiliations: r.GroupAffiliations ?? null,
    assigned_roles:    r.AssignedRoles ?? null,
    known_risks:       r.KnownRisks ?? null,
    dialogue_options:  r.DialogueOptions ?? null,
    cultural_traits:   r.CulturalTraits ?? null,
    inventory_raw:     r.Inventory ?? null,
    skills_raw:        r.Skills ?? null,
    knowledge_base_raw: r.KnowledgeBase ?? null,
  }));
  await upsertBatch('eis_npcs', mapped, 'npc_id');
}

async function importRelationships(): Promise<void> {
  console.log('Importing eis_relationships …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Relationship.csv'));
  // Get all existing NPC IDs
  const existingNpcs = await sql`SELECT npc_id FROM eis_npcs`;
  const validNpcIds  = new Set(existingNpcs.map(n => n.npc_id as string));

  const mapped: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    // EntitiesInvolved = "NPC_Raven; NPC_Grim"
    const parts = (r.EntitiesInvolved ?? '').split(';').map(s => s.trim());
    if (parts.length < 2) continue;
    const npc1 = parts[0];
    const npc2 = parts[1];
    // Only import if both NPCs exist
    if (!validNpcIds.has(npc1) || !validNpcIds.has(npc2)) continue;
    mapped.push({
      relationship_id:      toInt(r.RelationshipID),
      npc1_id:              npc1,
      npc2_id:              npc2,
      initial_trust_level:  toNum(r.InitialTrustLevel, 5),
      current_trust_level:  toNum(r.InitialTrustLevel, 5),
      perception_modifiers: r.PerceptionModifiers ?? null,
      history_notes:        r.HistoryNotes ?? null,
    });
  }
  await upsertBatch('eis_relationships', mapped, 'relationship_id');
}

async function importMemories(): Promise<void> {
  console.log('Importing eis_memories …');
  const rows = readCsv(path.join(DATA_FLAT_DIR, 'Memory.csv'));
  // Memory.csv doesn't associate to a specific NPC — it's a global catalog
  // We insert without npc_id; the simulation assigns them at runtime
  const mapped = rows.map(r => ({
    memory_id:       toInt(r.MemoryID),
    knowledge_type:  r.KnowledgeType ?? null,
    description:     r.Description ?? null,
    associated_data: r.AssociatedData ?? null,
    expiration:      r.Expiration ?? null,
  }));
  await upsertBatch('eis_memories', mapped, 'memory_id');
}

// ─── Orchestrator ────────────────────────────────────────────

const ALL_IMPORTERS: Array<{ name: string; fn: () => Promise<void> }> = [
  // Step 1 — leaf reference tables (no FK dependencies)
  { name: 'eis_roles',                      fn: importRoles },
  { name: 'eis_factions',                   fn: importFactions },
  { name: 'eis_skills',                     fn: importSkills },
  { name: 'eis_talents',                    fn: importTalents },
  { name: 'eis_talent_domains',             fn: importTalentDomains },
  { name: 'eis_needs_catalog',              fn: importNeedsCatalog },
  { name: 'eis_behaviors',                  fn: importBehaviors },
  { name: 'eis_actions',                    fn: importActions },
  { name: 'eis_emotions',                   fn: importEmotions },
  { name: 'eis_traits',                     fn: importTraits },
  { name: 'eis_cultural_groups',            fn: importCulturalGroups },
  { name: 'eis_items',                      fn: importItems },
  { name: 'eis_crafting_recipes',           fn: importCraftingRecipes },
  { name: 'eis_quests',                     fn: importQuests },
  { name: 'eis_risks',                      fn: importRisks },
  { name: 'eis_role_requirements',          fn: importRoleRequirements },
  { name: 'eis_role_equipment_restrictions', fn: importRoleEquipmentRestrictions },
  { name: 'eis_environments',               fn: importEnvironments },
  { name: 'eis_schedules',                  fn: importSchedules },
  { name: 'eis_events',                     fn: importEvents },
  { name: 'eis_zone_streaming',             fn: importZoneStreaming },
  { name: 'eis_interactive_objects',        fn: importInteractiveObjects },
  { name: 'eis_communication_protocols',    fn: importCommunicationProtocols },
  { name: 'eis_conversation_patterns',      fn: importConversationPatterns },
  { name: 'eis_emotional_contagion_rules',  fn: importEmotionalContagionRules },
  { name: 'eis_trust_evolution_parameters', fn: importTrustEvolutionParameters },
  { name: 'eis_rumor_templates',            fn: importRumorTemplates },
  { name: 'eis_faction_reputation_matrix',  fn: importFactionReputationMatrix },
  { name: 'eis_faction_item_preferences',   fn: importFactionItemPreferences },
  { name: 'eis_faction_narrative_events',   fn: importFactionNarrativeEvents },
  { name: 'eis_quest_hook_triggers',        fn: importQuestHookTriggers },
  { name: 'eis_group_relationships',        fn: importGroupRelationships },
  { name: 'eis_ai_parameters',              fn: importAiParameters },
  { name: 'eis_knowledge_entries',          fn: importKnowledgeEntries },
  // Step 2 — NPCs (references nothing at FK level except uuid)
  { name: 'eis_npcs',                       fn: importNpcs },
  // Step 3 — Junction / child tables (depend on eis_npcs)
  { name: 'eis_relationships',              fn: importRelationships },
  { name: 'eis_memories',                   fn: importMemories },
];

async function main(): Promise<void> {
  console.log('=== EIS CSV Import ===');
  if (DRY_RUN) console.log('  Mode: DRY-RUN (no database writes)');

  if (!DRY_RUN) await testConnection();

  const toRun = tableArg
    ? ALL_IMPORTERS.filter(i => i.name === tableArg)
    : ALL_IMPORTERS;

  if (toRun.length === 0) {
    console.error(`No importer found for table: ${tableArg}`);
    process.exit(1);
  }

  const startMs = Date.now();
  let failed = 0;
  for (const { name, fn } of toRun) {
    try {
      await fn();
    } catch (err) {
      console.error(`  [ERROR] ${name}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`\n=== Import complete in ${elapsed}s — ${failed} error(s) ===`);
  if (!DRY_RUN) await sql.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
