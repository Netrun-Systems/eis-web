// ============================================================
// EIS Knowledge Propagation — RAG-backed inter-NPC knowledge transfer
// ============================================================

import { ragClient, EIS_COLLECTIONS } from './charlotte-client';
import type { NPC } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommunicationProtocol {
  protocolId: string;
  protocolName: string;
  protocolType: string;
  /** 0-100, percentage of knowledge successfully transmitted */
  transmissionFidelity: number;
  knowledgeTransferRate: 'Very_Low' | 'Low' | 'Medium' | 'High' | 'Very_High';
  emotionalTransfer: 'Low' | 'Medium' | 'High' | 'Very_High';
  speciesCompatibility: string;
}

export interface KnowledgeTransfer {
  original: string;
  received: string;
  fidelity: number;
  protocolUsed: string;
}

// ---------------------------------------------------------------------------
// Knowledge transfer rate maps
// ---------------------------------------------------------------------------

const KNOWLEDGE_RATE_TO_CHUNK_COUNT: Record<string, number> = {
  Very_Low: 1,
  Low: 1,
  Medium: 2,
  High: 3,
  Very_High: 5,
};

// ---------------------------------------------------------------------------
// Fidelity distortion
// ---------------------------------------------------------------------------

/**
 * Apply fidelity distortion to a knowledge string.
 * Low fidelity = truncated, garbled, or partial content.
 */
function applyFidelityDistortion(content: string, fidelity: number): string {
  if (fidelity >= 90) return content; // Near-perfect — no distortion

  const words = content.split(' ');

  if (fidelity >= 70) {
    // Mild distortion: drop ~10-20% of words
    const keepRatio = 0.8 + (fidelity - 70) / 200;
    return words.filter(() => Math.random() < keepRatio).join(' ');
  }

  if (fidelity >= 50) {
    // Moderate distortion: drop 30-50% of words, may lose key context
    const keepRatio = 0.5 + (fidelity - 50) / 100;
    const kept = words.filter(() => Math.random() < keepRatio).join(' ');
    return `[partial] ${kept}`;
  }

  // Heavy distortion: only fragments survive
  const kept = words.filter(() => Math.random() < 0.3).join(' ');
  return `[fragments] ${kept.substring(0, 60)}...`;
}

// ---------------------------------------------------------------------------
// Protocol selection
// ---------------------------------------------------------------------------

const DEFAULT_VERBAL_PROTOCOL: CommunicationProtocol = {
  protocolId: 'CP001',
  protocolName: 'Verbal_Dialogue',
  protocolType: 'Verbal',
  transmissionFidelity: 95,
  knowledgeTransferRate: 'High',
  emotionalTransfer: 'High',
  speciesCompatibility: 'Humanoid',
};

/**
 * Select the best communication protocol for two NPCs based on species compatibility
 * and available loaded protocols.
 */
export function selectProtocol(
  source: NPC,
  target: NPC,
  availableProtocols: CommunicationProtocol[] = []
): CommunicationProtocol {
  if (availableProtocols.length === 0) return DEFAULT_VERBAL_PROTOCOL;

  // Filter to protocols compatible with both species
  const compatible = availableProtocols.filter(p => {
    const compat = p.speciesCompatibility;
    if (compat === 'Universal' || compat === 'Humanoid') return true;
    if (compat === 'Sentient') return true;
    return (
      compat.includes(source.species) && compat.includes(target.species)
    );
  });

  // Prefer higher fidelity
  const sorted = compatible.sort((a, b) => b.transmissionFidelity - a.transmissionFidelity);
  return sorted[0] ?? DEFAULT_VERBAL_PROTOCOL;
}

// ---------------------------------------------------------------------------
// KnowledgePropagationSystem
// ---------------------------------------------------------------------------

export class KnowledgePropagationSystem {
  private client = ragClient;

  /**
   * Propagate knowledge from source NPC to target NPC via a protocol.
   * Retrieves source's relevant knowledge chunks from RAG and stores
   * (possibly distorted) versions in target's knowledge collection.
   */
  async propagateKnowledge(
    source: NPC,
    target: NPC,
    protocol: CommunicationProtocol,
    interactionContext: string
  ): Promise<KnowledgeTransfer[]> {
    // Query source NPC's relevant knowledge
    const maxChunks = KNOWLEDGE_RATE_TO_CHUNK_COUNT[protocol.knowledgeTransferRate] ?? 2;

    const sourceKnowledge = await this.client.query(interactionContext, {
      collection: EIS_COLLECTIONS.NPC_KNOWLEDGE,
      top_k: maxChunks,
      min_score: 0.3,
      filter_npc: source.id,
    });

    if (sourceKnowledge.length === 0) return [];

    const fidelity = protocol.transmissionFidelity / 100; // 0-1
    const transferred: KnowledgeTransfer[] = [];

    for (const k of sourceKnowledge) {
      // Random transmission check based on fidelity
      if (Math.random() > fidelity) continue;

      const distorted = applyFidelityDistortion(k.content, protocol.transmissionFidelity);

      // Store in target NPC's knowledge collection
      await this.client.store(
        `[KnowledgeTransfer|from:${source.id}|protocol:${protocol.protocolName}|fidelity:${protocol.transmissionFidelity}] ${distorted}`,
        {
          collection: EIS_COLLECTIONS.NPC_KNOWLEDGE,
          source: target.id,
          type: 'knowledge',
          npc_id: target.id,
          emotional_context: target.emotionalState,
          faction: target.groupAffiliations[0],
        }
      );

      transferred.push({
        original: k.content,
        received: distorted,
        fidelity: protocol.transmissionFidelity,
        protocolUsed: protocol.protocolName,
      });
    }

    return transferred;
  }

  /**
   * Convenience: propagate knowledge with the best available protocol.
   */
  async propagate(
    source: NPC,
    target: NPC,
    interactionContext: string,
    availableProtocols: CommunicationProtocol[] = []
  ): Promise<KnowledgeTransfer[]> {
    const protocol = selectProtocol(source, target, availableProtocols);
    return this.propagateKnowledge(source, target, protocol, interactionContext);
  }
}

// Singleton
export const knowledgePropagation = new KnowledgePropagationSystem();
