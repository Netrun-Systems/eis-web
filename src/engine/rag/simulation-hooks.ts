// ============================================================
// EIS Simulation Hooks — RAG integration at tick boundaries
// Handles NPC interaction events, memory formation, and knowledge transfer
// ============================================================

import { npcMemorySystem } from './npc-memory';
import { dialogueGenerator } from './dialogue-generator';
import { knowledgePropagation, selectProtocol, type CommunicationProtocol } from './knowledge-propagation';
import type { NPC, WorldState, SimulationEvent } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RAGSimulationEvent extends SimulationEvent {
  data: {
    dialogue?: string;
    memories?: { content: string; relevanceScore: number }[];
    knowledgeTransfers?: { original: string; received: string; fidelity: number }[];
    patternUsed?: string;
    generationMode?: string;
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// Batch queue for async RAG calls
// Prevents blocking the main simulation tick on individual RAG queries.
// ---------------------------------------------------------------------------

interface PendingRAGOp {
  type: 'remember' | 'propagate';
  fn: () => Promise<void>;
  priority: number; // Higher = executed first
}

const _pendingOps: PendingRAGOp[] = [];
let _isProcessing = false;

/** Enqueue a RAG operation for background processing */
function enqueueRAGOp(type: PendingRAGOp['type'], fn: () => Promise<void>, priority = 5): void {
  _pendingOps.push({ type, fn, priority });
  // Keep queue bounded to prevent memory bloat during fast simulation
  if (_pendingOps.length > 200) {
    // Drop oldest low-priority ops
    _pendingOps.sort((a, b) => b.priority - a.priority);
    _pendingOps.splice(150);
  }
}

/**
 * Process pending RAG operations in background.
 * Call this from a setInterval or requestAnimationFrame callback.
 */
export async function flushRAGQueue(maxOps = 5): Promise<number> {
  if (_isProcessing || _pendingOps.length === 0) return 0;
  _isProcessing = true;

  let processed = 0;
  const ops = _pendingOps.splice(0, maxOps);

  await Promise.allSettled(
    ops.map(async op => {
      try {
        await op.fn();
        processed++;
      } catch (err) {
        console.warn(`[RAGHooks] ${op.type} op failed:`, err);
      }
    })
  );

  _isProcessing = false;
  return processed;
}

export function getPendingQueueSize(): number {
  return _pendingOps.length;
}

// ---------------------------------------------------------------------------
// Loaded protocols cache
// ---------------------------------------------------------------------------

let _protocols: CommunicationProtocol[] = [];

export function loadCommunicationProtocols(protocols: CommunicationProtocol[]): void {
  _protocols = protocols;
}

// ---------------------------------------------------------------------------
// Core hook: NPC interaction
// ---------------------------------------------------------------------------

/**
 * Called when two NPCs interact during a simulation tick.
 * Asynchronously generates dialogue and propagates knowledge via RAG.
 * Returns synchronous simulation events immediately; RAG events are queued.
 */
export function onNPCInteraction(
  npc1: NPC,
  npc2: NPC,
  behavior: string,
  world: WorldState
): SimulationEvent[] {
  const events: SimulationEvent[] = [];
  const tick = world.tickCount;

  const isSocial = behavior === 'Socialize' || behavior === 'Trade' || behavior === 'Talk';

  if (isSocial) {
    // Enqueue async dialogue generation (doesn't block tick)
    enqueueRAGOp(
      'remember',
      async () => {
        const dialogueLine = await dialogueGenerator.generateDialogue(
          npc1,
          npc2,
          {
            situation: `${behavior} at ${npc1.homeLocation}`,
            location: npc1.homeLocation,
            triggerBehavior: behavior,
          },
          world.emotionalContagionRules
        );

        // Store dialogue as memory for both NPCs
        const emotionalWeight = behavior === 'Trade' ? 4 : 3;

        await npcMemorySystem.remember(
          npc1.id,
          {
            content: `${behavior} with ${npc2.name}: "${dialogueLine.text}"`,
            emotionalWeight,
            category: 'interaction',
            relatedNpcs: [npc2.id],
            location: npc1.homeLocation,
            tick,
          },
          npc1.attributes.intelligence,
          npc1.memoryDecayRate
        );

        await npcMemorySystem.remember(
          npc2.id,
          {
            content: `${behavior} with ${npc1.name} — heard: "${dialogueLine.text}"`,
            emotionalWeight,
            category: 'interaction',
            relatedNpcs: [npc1.id],
            location: npc1.homeLocation,
            tick,
          },
          npc2.attributes.intelligence,
          npc2.memoryDecayRate
        );
      },
      6 // Higher priority for social memory
    );

    // Emit a synchronous placeholder event (dialogue text filled later)
    events.push(makeDialogueEvent(npc1, npc2, behavior, world));
  }

  // Knowledge propagation (always when near and socializing)
  if (isSocial || behavior === 'Work') {
    enqueueRAGOp(
      'propagate',
      async () => {
        const context = `${behavior} ${npc1.homeLocation}`;
        await knowledgePropagation.propagate(npc1, npc2, context, _protocols);
      },
      4
    );
  }

  return events;
}

// ---------------------------------------------------------------------------
// Observation hook: NPC sees something significant
// ---------------------------------------------------------------------------

export function onNPCObservation(
  observer: NPC,
  observation: string,
  emotionalWeight: number,
  world: WorldState
): void {
  enqueueRAGOp(
    'remember',
    async () => {
      await npcMemorySystem.remember(
        observer.id,
        {
          content: observation,
          emotionalWeight,
          category: emotionalWeight >= 7 ? 'trauma' : 'observation',
          location: observer.homeLocation,
          tick: world.tickCount,
        },
        observer.attributes.intelligence,
        observer.memoryDecayRate
      );
    },
    emotionalWeight // Higher emotional weight = higher priority storage
  );
}

// ---------------------------------------------------------------------------
// Periodic decay hook — call once per game day
// ---------------------------------------------------------------------------

export function scheduleMemoryDecay(npcs: NPC[], currentTick: number): void {
  for (const npc of npcs) {
    enqueueRAGOp(
      'remember',
      async () => {
        const decayed = await npcMemorySystem.decay(
          npc.id,
          currentTick,
          npc.memoryDecayRate,
          npc.attributes.intelligence
        );
        if (decayed > 0) {
          console.debug(`[Memory] ${npc.name} forgot ${decayed} memories (tick ${currentTick})`);
        }
      },
      1 // Lowest priority
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDialogueEvent(
  speaker: NPC,
  listener: NPC,
  behavior: string,
  world: WorldState
): SimulationEvent {
  const trust = speaker.relationships.get(listener.id) ?? 50;
  const toneDesc = trust >= 60 ? 'warmly' : trust <= 30 ? 'cautiously' : 'neutrally';

  return {
    id: `rag-dialogue-${world.tickCount}-${speaker.id}-${listener.id}`,
    tick: world.tickCount,
    gameTime: world.time,
    type: 'social',
    actorId: speaker.id,
    targetId: listener.id,
    description: `${speaker.name} ${behavior.toLowerCase()}s ${toneDesc} with ${listener.name} [RAG dialogue queued]`,
    data: {
      behavior,
      trust,
      ragQueued: true,
    },
  };
}
