// ============================================================
// EIS Dialogue Generator — RAG + template-based NPC dialogue
// ============================================================

import { ragClient, EIS_COLLECTIONS, type RAGResult } from './charlotte-client';
import { npcMemorySystem, type NPCMemory, type RecallContext } from './npc-memory';
import type { NPC, EmotionalContagionRule } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DialogueContext {
  situation: string;
  location: string;
  topic?: string;
  triggerBehavior?: string;
}

export interface DialogueLine {
  speakerId: string;
  listenerId: string;
  text: string;
  emotionalTone: string;
  recalledMemories: NPCMemory[];
  patternUsed: string;
  generationMode: 'template' | 'llm';
}

export interface ConversationPattern {
  patternId: string;
  patternName: string;
  description: string;
  requiredTraits: string[];
  factionRestriction: string[];
  speciesCompatibility: string[];
  conversationThemes: string[];
  dialogueStarters: string[];
  defaultTone: string;
  conversationDuration: number;
  patternCooldown: number;
  selectionWeight: number;
}

// ---------------------------------------------------------------------------
// Loaded patterns cache (populated by seedCollections or lazy query)
// ---------------------------------------------------------------------------

let _patternCache: ConversationPattern[] = [];

export function loadConversationPatterns(patterns: ConversationPattern[]): void {
  _patternCache = patterns;
}

// ---------------------------------------------------------------------------
// Personality description helpers
// ---------------------------------------------------------------------------

function describePersonality(npc: NPC): string {
  const t = npc.personality;
  const top = [];

  if (t.aggression >= 7) top.push('highly aggressive');
  else if (t.aggression <= 3) top.push('non-confrontational');

  if (t.friendliness >= 7) top.push('very friendly');
  else if (t.friendliness <= 3) top.push('cold');

  if (npc.attributes.charisma >= 7) top.push('charismatic');

  if (t.honesty >= 7) top.push('honest');
  else if (t.honesty <= 3) top.push('deceptive');

  if (t.loyalty >= 8) top.push('fiercely loyal');

  if (t.patience <= 3) top.push('impatient');

  if (t.curiosity >= 7) top.push('curious');
  if (t.empathy >= 7) top.push('empathetic');
  if (t.confidence >= 7) top.push('confident');
  if (t.fearfulness >= 7) top.push('fearful');

  if (top.length === 0) top.push('average');
  return top.join(', ');
}

function getTrustLabel(trust: number): string {
  if (trust >= 80) return 'deeply trusts';
  if (trust >= 60) return 'trusts';
  if (trust >= 40) return 'is neutral toward';
  if (trust >= 20) return 'is wary of';
  return 'distrusts';
}

// ---------------------------------------------------------------------------
// Emotional tone from contagion rules
// ---------------------------------------------------------------------------

function getEmotionalToneForDialogue(
  speakerEmotion: string,
  contagionRules: EmotionalContagionRule[]
): string {
  const rule = contagionRules.find(
    r =>
      r.sourceEmotion.toLowerCase() === speakerEmotion.toLowerCase() &&
      r.contagionType === 'DirectContagion'
  );
  if (!rule) return 'neutral';
  if (rule.baseContagionStrength >= 0.7) return 'intense';
  if (rule.baseContagionStrength >= 0.5) return 'moderate';
  return 'mild';
}

// ---------------------------------------------------------------------------
// Pattern selection
// ---------------------------------------------------------------------------

export function selectConversationPattern(
  speaker: NPC,
  listener: NPC,
  trust: number,
  context: DialogueContext,
  patterns: ConversationPattern[] = _patternCache
): ConversationPattern | null {
  if (patterns.length === 0) return null;

  const speakerFactions = new Set(speaker.groupAffiliations);
  const speakerTraitKeys = getHighTraits(speaker);

  const candidates = patterns.filter(p => {
    // Faction restriction
    if (p.factionRestriction.length > 0) {
      const hasMatch = p.factionRestriction.some(f => speakerFactions.has(f));
      if (!hasMatch) return false;
    }

    // Species compatibility — 'Human|AI' means universal enough
    if (p.speciesCompatibility.length > 0) {
      const compatible = p.speciesCompatibility.some(
        s => s === speaker.species || s === 'Universal'
      );
      if (!compatible) return false;
    }

    // Required traits check
    if (p.requiredTraits.length > 0) {
      const traitMet = p.requiredTraits.some(rt =>
        speakerTraitKeys.some(tk => tk.toLowerCase().includes(rt.toLowerCase().replace('High_', '')))
      );
      if (!traitMet) return false;
    }

    // Hostile patterns need low trust
    if (p.patternName.includes('Hostile') || p.patternName.includes('Confrontation')) {
      if (trust >= 40) return false;
    }

    // Romance requires high trust
    if (p.patternName.includes('Romance')) {
      if (trust < 60) return false;
    }

    return true;
  });

  if (candidates.length === 0) {
    // Fallback to first unrestricted pattern
    return patterns.find(p => p.factionRestriction.length === 0) ?? patterns[0];
  }

  // Weighted random selection
  const totalWeight = candidates.reduce((sum, p) => sum + p.selectionWeight, 0);
  let roll = Math.random() * totalWeight;
  for (const p of candidates) {
    roll -= p.selectionWeight;
    if (roll <= 0) return p;
  }
  return candidates[0];
}

function getHighTraits(npc: NPC): string[] {
  const high: string[] = [];
  const p = npc.personality;
  if (npc.attributes.charisma >= 7) high.push('High_Charisma', 'Friendly');
  if (p.aggression >= 7) high.push('High_Aggression', 'Confrontational');
  if (p.confidence >= 7) high.push('Confident');
  if (p.patience >= 7) high.push('Patient');
  return high;
}

// ---------------------------------------------------------------------------
// Dialogue prompt builder
// ---------------------------------------------------------------------------

function buildDialoguePrompt(
  speaker: NPC,
  listener: NPC,
  memories: NPCMemory[],
  factionLore: RAGResult[],
  pattern: ConversationPattern,
  context: DialogueContext,
  trust: number
): string {
  const trustLabel = getTrustLabel(trust);
  const factionStr = speaker.groupAffiliations.join(', ') || 'none';

  const memorySummary = memories.length > 0
    ? memories.map(m => `- ${m.content} (${m.category}, emotional weight: ${m.emotionalWeight})`).join('\n')
    : '- No specific memories recalled.';

  const loreSummary = factionLore.length > 0
    ? factionLore.map(r => `- ${r.content}`).join('\n')
    : '- No specific faction lore recalled.';

  return `You are ${speaker.name}, a ${speaker.species} ${speaker.assignedRoles.join('/')} of the ${factionStr}.

Personality: ${describePersonality(speaker)}
Current emotion: ${speaker.emotionalState}
You ${trustLabel} ${listener.name}.

Relevant memories:
${memorySummary}

Faction customs and lore:
${loreSummary}

Conversation pattern: ${pattern.patternName} (tone: ${pattern.defaultTone})
Situation: ${context.situation} at ${context.location}

Generate a single dialogue line that ${speaker.name} would say to ${listener.name}.
Stay in character. Reference memories naturally if relevant. Use ${pattern.defaultTone} tone.
Keep it under 2 sentences.`;
}

// ---------------------------------------------------------------------------
// LLM generation stub — pluggable
// ---------------------------------------------------------------------------

type LLMProvider = (prompt: string) => Promise<string>;
let _llmProvider: LLMProvider | null = null;

export function setLLMProvider(provider: LLMProvider): void {
  _llmProvider = provider;
}

async function generateFromPrompt(
  prompt: string,
  fallback: string
): Promise<{ text: string; mode: 'template' | 'llm' }> {
  if (_llmProvider) {
    try {
      const text = await _llmProvider(prompt);
      if (text && text.trim().length > 0) {
        return { text: text.trim(), mode: 'llm' };
      }
    } catch (err) {
      console.warn('[DialogueGen] LLM provider failed, using template fallback:', err);
    }
  }
  return { text: fallback, mode: 'template' };
}

// ---------------------------------------------------------------------------
// Template-based fast path
// ---------------------------------------------------------------------------

function fillTemplate(template: string, speaker: NPC, listener: NPC): string {
  return template
    .replace(/\{LISTENER\}/g, listener.name)
    .replace(/\{SPEAKER\}/g, speaker.name)
    .replace(/\{FACTION_LEADER\}/g, speaker.groupAffiliations[0] ?? 'our leader');
}

// ---------------------------------------------------------------------------
// DialogueGenerator
// ---------------------------------------------------------------------------

export class DialogueGenerator {
  private memory = npcMemorySystem;
  private client = ragClient;

  /**
   * Generate what speaker would say to listener in the given context.
   */
  async generateDialogue(
    speaker: NPC,
    listener: NPC,
    context: DialogueContext,
    contagionRules: EmotionalContagionRule[] = []
  ): Promise<DialogueLine> {
    const trust = speaker.relationships.get(listener.id) ?? 50;

    // 1. Recall speaker's relevant memories
    const recallContext: RecallContext = {
      currentSituation: context.situation,
      currentEmotion: speaker.emotionalState,
      nearbyNpcs: [listener.id],
      location: context.location,
    };
    const memories = await this.memory.recall(
      speaker.id,
      recallContext,
      5,
      speaker.attributes.intelligence
    );

    // 2. Query faction lore
    const factionQuery = [
      ...speaker.groupAffiliations,
      'lore customs greetings',
      context.topic ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    const factionLore = await this.client.query(factionQuery, {
      collection: EIS_COLLECTIONS.WORLD_LORE,
      top_k: 3,
      min_score: 0.25,
      filter_faction: speaker.groupAffiliations[0],
    });

    // 3. Select conversation pattern
    const pattern = selectConversationPattern(speaker, listener, trust, context);

    const emotionalTone = getEmotionalToneForDialogue(speaker.emotionalState, contagionRules);

    // 4. Fast path: pick a dialogue starter template
    const starterTemplate = pattern
      ? pattern.dialogueStarters[
          Math.floor(Math.random() * pattern.dialogueStarters.length)
        ]
      : '{LISTENER}, let us talk.';
    const templateText = fillTemplate(starterTemplate, speaker, listener);

    // 5. LLM path (if provider set)
    const prompt = pattern
      ? buildDialoguePrompt(speaker, listener, memories, factionLore, pattern, context, trust)
      : `You are ${speaker.name}. Say something to ${listener.name} about "${context.situation}".`;

    const { text, mode } = await generateFromPrompt(prompt, templateText);

    return {
      speakerId: speaker.id,
      listenerId: listener.id,
      text,
      emotionalTone,
      recalledMemories: memories,
      patternUsed: pattern?.patternName ?? 'default',
      generationMode: mode,
    };
  }
}

// Singleton
export const dialogueGenerator = new DialogueGenerator();
