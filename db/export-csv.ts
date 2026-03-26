#!/usr/bin/env npx tsx
// ============================================================
// EIS Web — CSV Export Script
// Exports any eis_* table to CSV compatible with UE5 DataTable import
//
// Usage:
//   npx tsx db/export-csv.ts --table eis_npcs --output NPCs.csv
//   npx tsx db/export-csv.ts --table eis_items
//   npx tsx db/export-csv.ts --all --output-dir ./exports/
//   npx tsx db/export-csv.ts --table eis_npcs --simulation-id <uuid>
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import sql, { testConnection } from './connection.js';

// ─── CLI args ────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(name: string): string | null {
  const idx = args.findIndex(a => a === name || a.startsWith(`${name}=`));
  if (idx === -1) return null;
  if (args[idx].includes('=')) return args[idx].split('=').slice(1).join('=');
  return args[idx + 1] ?? null;
}

const TABLE_ARG      = getArg('--table');
const OUTPUT_ARG     = getArg('--output');
const OUTPUT_DIR_ARG = getArg('--output-dir');
const SIM_ID_ARG     = getArg('--simulation-id');
const EXPORT_ALL     = args.includes('--all');

// ─── All exportable tables ───────────────────────────────────

const STATIC_TABLES = [
  'eis_roles',
  'eis_factions',
  'eis_skills',
  'eis_talents',
  'eis_talent_domains',
  'eis_needs_catalog',
  'eis_behaviors',
  'eis_actions',
  'eis_emotions',
  'eis_traits',
  'eis_cultural_groups',
  'eis_items',
  'eis_crafting_recipes',
  'eis_quests',
  'eis_risks',
  'eis_role_requirements',
  'eis_role_equipment_restrictions',
  'eis_environments',
  'eis_schedules',
  'eis_events',
  'eis_zone_streaming',
  'eis_interactive_objects',
  'eis_communication_protocols',
  'eis_conversation_patterns',
  'eis_emotional_contagion_rules',
  'eis_trust_evolution_parameters',
  'eis_rumor_templates',
  'eis_faction_reputation_matrix',
  'eis_faction_item_preferences',
  'eis_faction_narrative_events',
  'eis_quest_hook_triggers',
  'eis_group_relationships',
  'eis_ai_parameters',
  'eis_knowledge_entries',
  'eis_npcs',
  'eis_relationships',
  'eis_memories',
  'eis_npc_knowledge',
  'eis_npc_roles',
  'eis_npc_factions',
  'eis_npc_talents',
  'eis_npc_inventory',
] as const;

// ─── UE5 column name mapping ─────────────────────────────────
// Maps PostgreSQL snake_case columns back to UE5 PascalCase headers
// Used so exported CSVs can be re-imported into UE5 DataTables without
// column name mismatch errors.

const UE5_COLUMN_MAP: Record<string, Record<string, string>> = {
  eis_npcs: {
    npc_id: 'NPC_ID',
    name: 'Name',
    species: 'Species',
    age: 'Age',
    gender: 'Gender',
    strength: 'Strength',
    dexterity: 'Dexterity',
    endurance: 'Endurance',
    health: 'Health',
    intelligence: 'Intelligence',
    wisdom: 'Wisdom',
    willpower: 'Willpower',
    charisma: 'Charisma',
    aggression: 'Aggression',
    friendliness: 'Friendliness',
    curiosity: 'Curiosity',
    fearfulness: 'Fearfulness',
    loyalty: 'Loyalty',
    independence: 'Independence',
    confidence: 'Confidence',
    patience: 'Patience',
    honesty: 'Honesty',
    empathy: 'Empathy',
    resourcefulness: 'Resourcefulness',
    greed: 'Greed',
    generosity: 'Generosity',
    survival_instinct: 'SurvivalInstinct',
    hunger: 'Hunger',
    thirst: 'Thirst',
    rest: 'Rest',
    social_interaction: 'SocialInteraction',
    energy: 'Energy',
    hygiene: 'Hygiene',
    comfort: 'Comfort',
    memory_decay_rate: 'MemoryDecayRate',
    knowledge_capacity: 'KnowledgeCapacity',
    emotional_state: 'EmotionalState',
    awareness_level: 'AwarenessLevel',
    home_location: 'HomeLocation',
    work_location: 'WorkLocation',
    needs_home: 'NeedsHome',
    needs_work: 'NeedsWork',
    needs_risk_info: 'NeedsRiskInfo',
    group_affiliations: 'GroupAffiliations',
    assigned_roles: 'AssignedRoles',
    known_risks: 'KnownRisks',
    dialogue_options: 'DialogueOptions',
    cultural_traits: 'CulturalTraits',
    inventory_raw: 'Inventory',
    skills_raw: 'Skills',
    knowledge_base_raw: 'KnowledgeBase',
  },
  eis_items: {
    item_id: 'ItemID',
    item_name: 'ItemName',
    description: 'Description',
    item_type: 'ItemType',
    effects: 'Effects',
    value: 'Value',
    availability: 'Availability',
  },
  eis_roles: {
    role_id: 'RoleID',
    role_name: 'RoleName',
    description: 'Description',
    key_responsibilities: 'KeyResponsibilities',
    required_skills: 'RequiredSkills',
  },
};

// ─── Core export function ────────────────────────────────────

async function exportTable(tableName: string, outputPath: string, simulationId?: string): Promise<void> {
  console.log(`Exporting ${tableName} → ${outputPath} …`);

  let rows: Record<string, unknown>[];

  // For simulation tracking tables, filter by simulation_id if provided
  if (simulationId && ['eis_simulation_events', 'eis_simulation_ticks', 'eis_trust_history', 'eis_faction_reputation_history', 'eis_trade_log'].includes(tableName)) {
    rows = await sql`SELECT * FROM ${sql(tableName)} WHERE simulation_id = ${simulationId} ORDER BY tick_number`;
  } else {
    rows = await sql`SELECT * FROM ${sql(tableName)} ORDER BY id`;
  }

  if (rows.length === 0) {
    console.log(`  (empty table — creating empty CSV with headers)`);
    // Create empty file to signal intentionally-empty export
    fs.writeFileSync(outputPath, '');
    return;
  }

  // Apply UE5 column name mapping if available
  const colMap = UE5_COLUMN_MAP[tableName];
  const finalRows = colMap
    ? rows.map(row =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [colMap[k] ?? k, v])
        )
      )
    : rows;

  const csv = Papa.unparse(finalRows as Record<string, string | number | boolean | null>[]);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, csv, 'utf8');
  console.log(`  Exported ${rows.length} rows`);
}

// ─── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== EIS CSV Export ===');
  await testConnection();

  if (EXPORT_ALL) {
    const outDir = OUTPUT_DIR_ARG ?? './exports';
    console.log(`Exporting all ${STATIC_TABLES.length} tables to ${outDir}/`);

    for (const tableName of STATIC_TABLES) {
      // Use a friendly filename: strip eis_ prefix, PascalCase it
      const friendly = tableName
        .replace(/^eis_/, '')
        .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
        .replace(/^([a-z])/, c => c.toUpperCase());
      const outputPath = path.join(outDir, `${friendly}.csv`);
      try {
        await exportTable(tableName, outputPath, SIM_ID_ARG ?? undefined);
      } catch (err) {
        console.error(`  [ERROR] ${tableName}:`, err instanceof Error ? err.message : err);
      }
    }
  } else if (TABLE_ARG) {
    const outputPath = OUTPUT_ARG ?? `${TABLE_ARG}.csv`;
    await exportTable(TABLE_ARG, outputPath, SIM_ID_ARG ?? undefined);
  } else {
    console.error('Usage:');
    console.error('  npx tsx db/export-csv.ts --table eis_npcs [--output NPCs.csv]');
    console.error('  npx tsx db/export-csv.ts --all [--output-dir ./exports/]');
    console.error('  npx tsx db/export-csv.ts --table eis_simulation_events --simulation-id <uuid>');
    process.exit(1);
  }

  await sql.end();
  console.log('=== Export complete ===');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
