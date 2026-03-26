// ============================================================
// EIS RAG Collection Seeder
// Seeds charlotte-ingest with EIS CSV data for NPC memory,
// knowledge, dialogue, world lore, personality profiles,
// and conversation patterns.
//
// Run: npx tsx src/engine/rag/seed-collections.ts
// ============================================================

import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { ragClient, EIS_COLLECTIONS, type ChunkMetadata } from './charlotte-client';

// ---------------------------------------------------------------------------
// CSV paths (relative to eis-web project root when run via npx tsx)
// ---------------------------------------------------------------------------

const DATA_ROOT = resolve(__dirname, '../../../../EIS/Data');

const PATHS = {
  npcs:                join(DATA_ROOT, 'Core/NPCs.csv'),
  groups:              join(DATA_ROOT, 'Core/Groups_Definitions.csv'),
  memory:              join(DATA_ROOT, 'Social/Memory.csv'),
  knowledge:           join(DATA_ROOT, 'Social/Knowledge.csv'),
  dialogue:            join(DATA_ROOT, 'Social/Dialogue.csv'),
  conversationPatterns:join(DATA_ROOT, 'Communication/ConversationPatterns.csv'),
  culturalModifiers:   join(DATA_ROOT, 'Communication/CulturalCommunicationModifiers.csv'),
  emotionalContagion:  join(DATA_ROOT, 'Communication/EmotionalContagionRules.csv'),
  factionNarratives:   join(DATA_ROOT, 'Communication/FactionNarrativeEvents.csv'),
};

// ---------------------------------------------------------------------------
// Minimal CSV parser (no external deps for seeder script)
// ---------------------------------------------------------------------------

interface CSVRow {
  [key: string]: string;
}

function parseCSV(filePath: string): CSVRow[] {
  const text = readFileSync(filePath, 'utf-8');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]);
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    if (values.length === 0) continue;
    const row: CSVRow = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

/** Basic CSV line splitter — handles quoted fields */
function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// Chunk builders
// ---------------------------------------------------------------------------

interface Chunk {
  content: string;
  metadata: ChunkMetadata;
}

function buildNPCPersonalityChunks(rows: CSVRow[]): Chunk[] {
  return rows
    .filter(r => r.NPC_ID)
    .map(r => {
      const name = r.Name || r.NPC_ID;
      const traits = [
        r.Aggression && `aggression:${r.Aggression}`,
        r.Confidence && `confidence:${r.Confidence}`,
        r.Friendliness && `friendliness:${r.Friendliness}`,
        r.Intelligence && `intelligence:${r.Intelligence}`,
        r.Honesty && `honesty:${r.Honesty}`,
        r.Loyalty && `loyalty:${r.Loyalty}`,
        r.Empathy && `empathy:${r.Empathy}`,
        r.Curiosity && `curiosity:${r.Curiosity}`,
      ]
        .filter(Boolean)
        .join(', ');

      const signatureTraits = r.SignatureTraits?.split(';').join(', ') || '';
      const blindSpots = r.BlindSpotTraits?.split(';').join(', ') || '';
      const factions = r.GroupAffiliations || 'none';
      const roles = r.AssignedRoles || 'none';

      const content =
        `[PersonalityProfile|${r.NPC_ID}] ${name} (${r.Species}, ${r.Gender}, age ${r.Age}) ` +
        `belongs to factions: ${factions}. Roles: ${roles}. ` +
        `Personality traits: ${traits}. ` +
        (signatureTraits ? `Signature traits: ${signatureTraits}. ` : '') +
        (blindSpots ? `Blind spots: ${blindSpots}. ` : '') +
        `Emotional state: ${r.EmotionalState || 'unknown'}. ` +
        `Skills: ${r.Skills || 'none'}. ` +
        `Knowledge: ${r.KnowledgeBase || 'none'}.`;

      return {
        content,
        metadata: {
          collection: EIS_COLLECTIONS.PERSONALITY_PROFILES,
          source: r.NPC_ID,
          type: 'personality' as const,
          npc_id: r.NPC_ID,
          faction: r.GroupAffiliations?.split(';')[0],
        },
      };
    });
}

function buildMemoryChunks(rows: CSVRow[]): Chunk[] {
  return rows
    .filter(r => r.MemoryID)
    .map(r => {
      const content =
        `[Memory|knowledge|weight:5|tick:0] world: ` +
        `${r.Description} (${r.KnowledgeType}). ` +
        `Associated data: ${r.AssociatedData}. ` +
        `Expiration: ${r.Expiration}.`;

      return {
        content,
        metadata: {
          collection: EIS_COLLECTIONS.NPC_MEMORIES,
          source: 'world',
          type: 'memory' as const,
          npc_id: undefined,
          emotional_context: r.KnowledgeType,
        },
      };
    });
}

function buildKnowledgeChunks(rows: CSVRow[]): Chunk[] {
  return rows
    .filter(r => r['Knowledge Type'] || r.KnowledgeType)
    .map(r => {
      const faction = r.Faction || 'world';
      const kType = r['Knowledge Type'] || r.KnowledgeType;
      const desc = r['Knowledge Description'] || r.Description;
      const howLearned = r['How It Can Be Learned or Exchanged'] || '';
      const plotImpact = r['Impact on Plot Development'] || '';

      const content =
        `[Knowledge|${faction}|${kType}] ${desc}. ` +
        (howLearned ? `How to learn: ${howLearned}. ` : '') +
        (plotImpact ? `Plot impact: ${plotImpact}.` : '');

      return {
        content,
        metadata: {
          collection: EIS_COLLECTIONS.NPC_KNOWLEDGE,
          source: faction.toLowerCase().replace(/\s+/g, '_'),
          type: 'knowledge' as const,
          faction: faction,
        },
      };
    });
}

function buildDialogueChunks(rows: CSVRow[]): Chunk[] {
  return rows
    .filter(r => r.DialogueID)
    .map(r => {
      const content =
        `[Dialogue|${r.DialogueID}|${r.SpeakerRole}] ` +
        `"${r.DialogueText}" ` +
        `Conditions: ${r.Conditions}. ` +
        `Responses: ${r.Responses}. ` +
        `Effects: ${r.Effects}.`;

      return {
        content,
        metadata: {
          collection: EIS_COLLECTIONS.DIALOGUE,
          source: r.SpeakerRole?.toLowerCase().replace(/\s+/g, '_') || 'npc',
          type: 'dialogue' as const,
        },
      };
    });
}

function buildConversationPatternChunks(rows: CSVRow[]): Chunk[] {
  return rows
    .filter(r => r.PatternID)
    .map(r => {
      const starters = r.DialogueStarters?.split('|').join(' | ') || '';
      const themes = r.ConversationThemes || '';
      const factionRestriction = r.FactionRestriction ? `Faction: ${r.FactionRestriction}.` : '';

      const content =
        `[ConversationPattern|${r.PatternID}|${r.PatternName}] ` +
        `${r.Description}. ` +
        `Required traits: ${r.RequiredTraits || 'none'}. ` +
        `${factionRestriction} ` +
        `Species: ${r.SpeciesCompatibility || 'all'}. ` +
        `Themes: ${themes}. ` +
        `Tone: ${r.DefaultTone}. ` +
        `Starters: ${starters}.`;

      return {
        content,
        metadata: {
          collection: EIS_COLLECTIONS.CONVERSATION_PATTERNS,
          source: r.PatternID,
          type: 'conversation_pattern' as const,
          faction: r.FactionRestriction || undefined,
        },
      };
    });
}

function buildWorldLoreChunks(
  groupRows: CSVRow[],
  culturalRows: CSVRow[],
  factionNarrativeRows: CSVRow[]
): Chunk[] {
  const chunks: Chunk[] = [];

  // Group/faction definitions
  for (const r of groupRows) {
    if (!r.GroupID) continue;
    const content =
      `[FactionLore|${r.GroupName}] ${r.Description}. ` +
      `Territory: ${r.Territory}. ` +
      `Leadership: ${r.Leadership}. ` +
      `Population: ${r.Population}. ` +
      `Resources: ${r.Resources}.`;

    chunks.push({
      content,
      metadata: {
        collection: EIS_COLLECTIONS.WORLD_LORE,
        source: r.GroupName?.toLowerCase().replace(/\s+/g, '_') || 'faction',
        type: 'faction_lore' as const,
        faction: r.GroupName,
      },
    });
  }

  // Cultural modifiers
  for (const r of culturalRows) {
    if (!r.ModifierID) continue;
    const content =
      `[CulturalLore|${r.CulturalGroup}|${r.ModifierName}] ${r.Description}. ` +
      `Trust impact: ${r.TrustImpact}. ` +
      `Hostility triggers: ${r.HostilityTriggers}. ` +
      `Taboo actions: ${r.TabooActions}. ` +
      `Respect gestures: ${r.RespectGestures}. ` +
      `Gift protocols: ${r.GiftProtocols}.`;

    chunks.push({
      content,
      metadata: {
        collection: EIS_COLLECTIONS.WORLD_LORE,
        source: r.CulturalGroup?.toLowerCase().replace(/\s+/g, '_') || 'culture',
        type: 'faction_lore' as const,
        faction: r.CulturalGroup,
      },
    });
  }

  // Faction narrative events
  for (const r of factionNarrativeRows) {
    if (!r.EventID && !r.NarrativeEvent) continue;
    const content =
      `[NarrativeEvent|${r.Faction || 'world'}] ${r.NarrativeEvent || r.EventName || r.Description}.` +
      (r.Impact ? ` Impact: ${r.Impact}.` : '') +
      (r.Trigger ? ` Trigger: ${r.Trigger}.` : '');

    chunks.push({
      content,
      metadata: {
        collection: EIS_COLLECTIONS.WORLD_LORE,
        source: 'narrative',
        type: 'faction_lore' as const,
        faction: r.Faction,
      },
    });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Main seeder
// ---------------------------------------------------------------------------

async function seedRAGCollections(): Promise<void> {
  console.log('[Seeder] Starting EIS RAG collection seeder...');
  console.log(`[Seeder] Data root: ${DATA_ROOT}`);

  // Verify charlotte-ingest is reachable
  if (!ragClient.isAvailable()) {
    console.error('[Seeder] RAG client is unavailable. Check CHARLOTTE_INGEST_TOKEN and service URL.');
    process.exit(1);
  }

  const allChunks: Chunk[] = [];

  // 1. NPC Personality Profiles
  console.log('[Seeder] Building NPC personality profiles...');
  try {
    const npcRows = parseCSV(PATHS.npcs);
    const npcChunks = buildNPCPersonalityChunks(npcRows);
    allChunks.push(...npcChunks);
    console.log(`  -> ${npcChunks.length} NPC profiles`);
  } catch (err) {
    console.warn('[Seeder] Failed to parse NPCs.csv:', err);
  }

  // 2. Initial memories
  console.log('[Seeder] Building memory chunks...');
  try {
    const memRows = parseCSV(PATHS.memory);
    const memChunks = buildMemoryChunks(memRows);
    allChunks.push(...memChunks);
    console.log(`  -> ${memChunks.length} memory entries`);
  } catch (err) {
    console.warn('[Seeder] Failed to parse Memory.csv:', err);
  }

  // 3. Knowledge entries
  console.log('[Seeder] Building knowledge chunks...');
  try {
    const knowRows = parseCSV(PATHS.knowledge);
    const knowChunks = buildKnowledgeChunks(knowRows);
    allChunks.push(...knowChunks);
    console.log(`  -> ${knowChunks.length} knowledge entries`);
  } catch (err) {
    console.warn('[Seeder] Failed to parse Knowledge.csv:', err);
  }

  // 4. Dialogue templates
  console.log('[Seeder] Building dialogue chunks...');
  try {
    const dialogRows = parseCSV(PATHS.dialogue);
    const dialogChunks = buildDialogueChunks(dialogRows);
    allChunks.push(...dialogChunks);
    console.log(`  -> ${dialogChunks.length} dialogue entries`);
  } catch (err) {
    console.warn('[Seeder] Failed to parse Dialogue.csv:', err);
  }

  // 5. Conversation patterns
  console.log('[Seeder] Building conversation pattern chunks...');
  try {
    const patternRows = parseCSV(PATHS.conversationPatterns);
    const patternChunks = buildConversationPatternChunks(patternRows);
    allChunks.push(...patternChunks);
    console.log(`  -> ${patternChunks.length} conversation patterns`);
  } catch (err) {
    console.warn('[Seeder] Failed to parse ConversationPatterns.csv:', err);
  }

  // 6. World lore (factions + cultural modifiers + narrative events)
  console.log('[Seeder] Building world lore chunks...');
  try {
    const groupRows = parseCSV(PATHS.groups);
    const culturalRows = parseCSV(PATHS.culturalModifiers);
    let narrativeRows: CSVRow[] = [];
    try { narrativeRows = parseCSV(PATHS.factionNarratives); } catch { /* optional */ }

    const loreChunks = buildWorldLoreChunks(groupRows, culturalRows, narrativeRows);
    allChunks.push(...loreChunks);
    console.log(`  -> ${loreChunks.length} world lore entries`);
  } catch (err) {
    console.warn('[Seeder] Failed to parse world lore CSVs:', err);
  }

  // Store all chunks
  console.log(`\n[Seeder] Storing ${allChunks.length} total chunks to charlotte-ingest...`);
  const stored = await ragClient.batchStore(allChunks);
  console.log(`[Seeder] Done! ${stored}/${allChunks.length} chunks stored successfully.`);

  if (stored < allChunks.length) {
    console.warn(`[Seeder] ${allChunks.length - stored} chunks failed. Re-run to retry.`);
  }
}

// Run if executed directly
seedRAGCollections().catch(err => {
  console.error('[Seeder] Fatal error:', err);
  process.exit(1);
});
