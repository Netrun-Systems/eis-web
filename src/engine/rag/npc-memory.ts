// ============================================================
// EIS NPC Memory System — RAG-backed memory storage and recall
// ============================================================

import { ragClient, EIS_COLLECTIONS, type RAGResult } from './charlotte-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryCategory =
  | 'event'
  | 'interaction'
  | 'observation'
  | 'knowledge'
  | 'trauma';

export interface NPCMemoryInput {
  content: string;
  /** 0-10. Higher = more impactful, slower to decay. */
  emotionalWeight: number;
  category: MemoryCategory;
  relatedNpcs?: string[];
  location?: string;
  /** Simulation tick when this memory was formed */
  tick: number;
}

export interface NPCMemory {
  content: string;
  emotionalWeight: number;
  category: MemoryCategory;
  relatedNpcs: string[];
  location?: string;
  tick: number;
  /** Similarity score from RAG (0-1), set on recall */
  relevanceScore: number;
}

export interface RecallContext {
  currentSituation: string;
  currentEmotion: string;
  nearbyNpcs: string[];
  location: string;
}

// ---------------------------------------------------------------------------
// Memory decay constants
// ---------------------------------------------------------------------------

/** Ticks after which a low-weight memory starts decaying */
const LOW_WEIGHT_DECAY_AFTER_TICKS = 500;
/** Emotional weight threshold — above this, memory is considered significant */
const SIGNIFICANT_WEIGHT_THRESHOLD = 6;
/** Base RAG min_score for recall queries */
const DEFAULT_MIN_SCORE = 0.3;

// ---------------------------------------------------------------------------
// NPCMemorySystem
// ---------------------------------------------------------------------------

export class NPCMemorySystem {
  private client = ragClient;

  /**
   * Store a new memory for an NPC.
   * Intelligence attribute scales the NPC's memory capacity (decay_rate inversely).
   */
  async remember(
    npcId: string,
    memory: NPCMemoryInput,
    npcIntelligence = 5,
    npcMemoryDecayRate = 0.01
  ): Promise<void> {
    // Build a rich text representation for embedding
    const npcLabel = `NPC ${npcId}`;
    const relatedStr = memory.relatedNpcs?.length
      ? ` involving ${memory.relatedNpcs.join(', ')}`
      : '';
    const locationStr = memory.location ? ` at ${memory.location}` : '';
    const content =
      `[Memory|${memory.category}|weight:${memory.emotionalWeight}|tick:${memory.tick}] ` +
      `${npcLabel}${relatedStr}${locationStr}: ${memory.content}`;

    // Higher intelligence = lower effective decay rate
    const intelligenceFactor = npcIntelligence / 10; // 0.1–1.0
    const effectiveDecayRate = npcMemoryDecayRate * (1 - intelligenceFactor * 0.5);

    await this.client.store(content, {
      collection: EIS_COLLECTIONS.NPC_MEMORIES,
      source: npcId,
      type: 'memory',
      npc_id: npcId,
      emotional_context: `weight_${memory.emotionalWeight}_${memory.category}`,
      timestamp: memory.tick,
      decay_rate: effectiveDecayRate,
    });
  }

  /**
   * Recall relevant memories for an NPC given the current context.
   * Combines situational, emotional, and social context into the RAG query.
   */
  async recall(
    npcId: string,
    context: RecallContext,
    topK = 5,
    npcIntelligence = 5
  ): Promise<NPCMemory[]> {
    // Build a rich contextual query that captures situation + social context
    const npcParts = context.nearbyNpcs.length
      ? ` with ${context.nearbyNpcs.join(', ')}`
      : '';
    const queryText =
      `${context.currentSituation} at ${context.location}` +
      `${npcParts} feeling ${context.currentEmotion}`;

    // Intelligence scales how many memories are accessible
    const effectiveTopK = Math.max(1, Math.round(topK * (npcIntelligence / 10) + 1));

    const results = await this.client.query(queryText, {
      collection: EIS_COLLECTIONS.NPC_MEMORIES,
      top_k: effectiveTopK,
      min_score: DEFAULT_MIN_SCORE,
      filter_npc: npcId,
    });

    return results.map(r => parseMemoryResult(r));
  }

  /**
   * Apply memory decay for an NPC based on the current simulation tick.
   * Memories older than threshold with low emotional weight decay faster.
   * Returns number of memories that were "forgotten" (logged, not deleted from RAG).
   *
   * Note: RAG doesn't support deletion by filter in the current charlotte-ingest API,
   * so decay is tracked locally in the simulation and reflected in recall scoring.
   * Truly decayed memories will score below min_score thresholds and be filtered out.
   */
  async decay(
    npcId: string,
    currentTick: number,
    npcMemoryDecayRate = 0.01,
    npcIntelligence = 5
  ): Promise<number> {
    // Query recent memories for this NPC
    const memories = await this.client.query(
      `NPC ${npcId} memory tick`,
      {
        collection: EIS_COLLECTIONS.NPC_MEMORIES,
        top_k: 20,
        min_score: 0.1,
        filter_npc: npcId,
      }
    );

    let decayedCount = 0;
    const intelligenceFactor = npcIntelligence / 10;
    const effectiveDecayRate = npcMemoryDecayRate * (1 - intelligenceFactor * 0.5);

    for (const result of memories) {
      const parsed = parseMemoryResult(result);
      const age = currentTick - parsed.tick;

      // Trauma and high-weight memories are much harder to forget
      if (parsed.category === 'trauma' || parsed.emotionalWeight >= SIGNIFICANT_WEIGHT_THRESHOLD) {
        continue;
      }

      // Low-weight memories decay after threshold
      if (age > LOW_WEIGHT_DECAY_AFTER_TICKS) {
        const decayProbability = effectiveDecayRate * (age / LOW_WEIGHT_DECAY_AFTER_TICKS);
        if (Math.random() < decayProbability) {
          decayedCount++;
          // Log decay as a new chunk (tombstone) so RAG queries can filter it
          await this.client.store(
            `[DECAYED|tick:${currentTick}] NPC ${npcId} forgot: ${parsed.content.substring(0, 80)}`,
            {
              collection: EIS_COLLECTIONS.NPC_MEMORIES,
              source: npcId,
              type: 'memory',
              npc_id: npcId,
              emotional_context: 'decayed',
              timestamp: currentTick,
              decay_rate: 0,
            }
          );
        }
      }
    }

    return decayedCount;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a RAG result content string back into an NPCMemory.
 * Format: [Memory|category|weight:N|tick:N] content
 */
function parseMemoryResult(result: RAGResult): NPCMemory {
  const headerMatch = result.content.match(
    /^\[Memory\|(\w+)\|weight:(\d+(?:\.\d+)?)\|tick:(\d+)\]\s*/
  );

  if (!headerMatch) {
    return {
      content: result.content,
      emotionalWeight: 5,
      category: 'observation',
      relatedNpcs: [],
      tick: 0,
      relevanceScore: result.similarity_score,
    };
  }

  const [, category, weightStr, tickStr] = headerMatch;
  const bodyText = result.content.slice(headerMatch[0].length);

  // Extract location from body if present
  const locationMatch = bodyText.match(/at ([^:]+):/);
  const location = locationMatch?.[1]?.trim();

  return {
    content: bodyText,
    emotionalWeight: parseFloat(weightStr),
    category: category as MemoryCategory,
    relatedNpcs: [],
    location,
    tick: parseInt(tickStr, 10),
    relevanceScore: result.similarity_score,
  };
}

// Singleton
export const npcMemorySystem = new NPCMemorySystem();
