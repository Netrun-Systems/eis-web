import type { NPC, WorldState, SimulationEvent, System } from '../types';

/**
 * Knowledge propagation system: NPCs share knowledge based on
 * social interactions, proximity, and trust levels.
 */

/**
 * Attempt to propagate knowledge from source to target NPC.
 */
function propagateKnowledge(
  source: NPC,
  target: NPC,
  world: WorldState
): SimulationEvent | null {
  if (source.knowledgeBase.length === 0) return null;

  // Find knowledge the target doesn't have
  const newKnowledge = source.knowledgeBase.filter(k => !target.knowledgeBase.includes(k));
  if (newKnowledge.length === 0) return null;

  // Trust check: higher trust = more knowledge shared
  const trust = source.relationships.get(target.id) ?? 50;
  const trustFactor = trust / 100;

  // Personality: curiosity increases reception, honesty increases sharing
  const shareWillingness = source.personality.honesty / 10;
  const receiveWillingness = target.personality.curiosity / 10;

  const probability = trustFactor * shareWillingness * receiveWillingness;

  if (world.rng.next() > probability) return null;

  // Check knowledge capacity
  if (target.knowledgeBase.length >= target.knowledgeCapacity) return null;

  // Share one piece of knowledge
  const knowledgeIdx = world.rng.nextInt(0, newKnowledge.length - 1);
  const shared = newKnowledge[knowledgeIdx];
  target.knowledgeBase.push(shared);

  return {
    id: `knowledge-${world.tickCount}-${source.id}-${target.id}`,
    tick: world.tickCount,
    gameTime: world.time,
    type: 'knowledge',
    actorId: source.id,
    targetId: target.id,
    description: `${source.name} shared "${shared}" with ${target.name}`,
    data: { knowledge: shared, trustFactor },
  };
}

export const knowledgeSystem: System = {
  name: 'KnowledgeSystem',
  tick(world: WorldState, deltaTime: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    // Only process every few ticks
    if (world.tickCount % 8 !== 0) return events;

    // Memory decay: NPCs forget knowledge over time
    for (const npc of world.npcs) {
      if (npc.memoryDecayRate > 0 && npc.knowledgeBase.length > 5) {
        if (world.rng.next() < npc.memoryDecayRate * deltaTime) {
          const forgotIdx = world.rng.nextInt(0, npc.knowledgeBase.length - 1);
          npc.knowledgeBase.splice(forgotIdx, 1);
        }
      }
    }

    // Knowledge propagation between nearby socializing NPCs
    const socialNPCs = world.npcs.filter(
      npc => npc.currentBehavior === 'Socialize' || world.rng.next() < 0.15
    );

    for (const npc of socialNPCs) {
      const nearby = world.npcs.filter(other => {
        if (other.id === npc.id) return false;
        const dx = npc.position.x - other.position.x;
        const dy = npc.position.y - other.position.y;
        return Math.sqrt(dx * dx + dy * dy) < 150;
      });

      for (const target of nearby.slice(0, 2)) {
        const event = propagateKnowledge(npc, target, world);
        if (event) events.push(event);
      }
    }

    return events;
  },
};
