import type { NPC, Behavior, WorldState, SimulationEvent, System } from '../types';
import { tickNeeds } from './need-system';

/**
 * Need name -> NPC need key mapping
 */
const NEED_ID_MAP: Record<number, keyof NPC['needs']> = {
  1: 'hunger',
  2: 'thirst',
  3: 'rest',
  4: 'socialInteraction',
  5: 'safety',
  6: 'selfActualization',
  7: 'hygiene',
  8: 'entertainment',
};

/**
 * Check if NPC meets the attribute requirements for a behavior.
 */
function meetsRequirements(npc: NPC, requirements: Map<string, number>): boolean {
  for (const [attr, minVal] of requirements) {
    const attrLower = attr.toLowerCase();
    const npcVal =
      (npc.attributes as unknown as Record<string, number>)[attrLower] ??
      (npc.skills.get(attr) ?? 0);
    if (npcVal < minVal) return false;
  }
  return true;
}

/**
 * Score a behavior based on personality alignment.
 * Higher score = better match for this NPC's personality.
 */
function personalityScore(npc: NPC, behavior: Behavior): number {
  let score = 0;
  for (const [trait, threshold] of behavior.personalityInfluence) {
    const traitLower = trait.toLowerCase() as keyof typeof npc.personality;
    const npcVal = (npc.personality as unknown as Record<string, number>)[traitLower] ?? 5;
    // Score increases when NPC trait exceeds the influence threshold
    score += Math.max(0, npcVal - threshold + 5);
  }
  return score;
}

/**
 * Select the best behavior for an NPC given their top need.
 */
export function selectBehavior(
  npc: NPC,
  topNeed: string,
  behaviors: Behavior[],
  world: WorldState
): Behavior | null {
  // Map need name to ID
  const needId = world.needs.find(n => n.name === topNeed)?.id;
  if (needId === undefined) return null;

  // Find behaviors that address this need
  const candidates = behaviors.filter(
    b => b.associatedNeeds.includes(needId) && meetsRequirements(npc, b.requiredAttributes)
  );

  if (candidates.length === 0) {
    // Fallback: try any behavior the NPC can perform
    const fallback = behaviors.filter(b => meetsRequirements(npc, b.requiredAttributes));
    if (fallback.length === 0) return null;
    // Pick randomly using deterministic RNG
    return fallback[world.rng.nextInt(0, fallback.length - 1)];
  }

  // Sort by personality alignment and pick the best
  candidates.sort((a, b) => personalityScore(npc, b) - personalityScore(npc, a));
  return candidates[0];
}

/**
 * Execute a behavior, applying its effects to the NPC.
 */
export function executeBehavior(
  npc: NPC,
  behavior: Behavior,
  world: WorldState
): SimulationEvent {
  // Apply need satisfaction based on behavior
  for (const needId of behavior.associatedNeeds) {
    const needKey = NEED_ID_MAP[needId];
    if (needKey) {
      // Satisfy need by 20-40 points depending on behavior
      const satisfaction = 20 + world.rng.nextFloat(0, 20);
      npc.needs[needKey] = Math.max(0, npc.needs[needKey] - satisfaction);
    }
  }

  // Apply effects from behavior
  for (const [effect, value] of behavior.effects) {
    const effectLower = effect.toLowerCase();
    if (effectLower in npc.needs) {
      (npc.needs as unknown as Record<string, number>)[effectLower] = Math.max(
        0,
        Math.min(100, ((npc.needs as unknown as Record<string, number>)[effectLower] ?? 50) + value)
      );
    }
  }

  npc.currentBehavior = behavior.name;

  return {
    id: `behavior-${world.tickCount}-${npc.id}`,
    tick: world.tickCount,
    gameTime: world.time,
    type: 'behavior',
    actorId: npc.id,
    description: `${npc.name} is ${behavior.name.toLowerCase()}ing`,
    data: { behaviorId: behavior.id, behaviorName: behavior.name },
  };
}

export const behaviorSystem: System = {
  name: 'BehaviorSystem',
  tick(world: WorldState, deltaTime: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    for (const npc of world.npcs) {
      // Determine top need
      const topNeed = tickNeeds(npc, world.needs, 0); // 0 delta - just evaluate

      // Select behavior
      const behavior = selectBehavior(npc, topNeed, world.behaviors, world);
      if (behavior) {
        const event = executeBehavior(npc, behavior, world);
        events.push(event);
      }
    }

    return events;
  },
};
