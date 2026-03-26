import type { NPC, Need, WorldState, SimulationEvent, System } from '../types';

/**
 * Maps Need CSV names to NPC need property keys.
 */
const NEED_NAME_MAP: Record<string, keyof NPC['needs']> = {
  Hunger: 'hunger',
  Thirst: 'thirst',
  Rest: 'rest',
  SocialInteraction: 'socialInteraction',
  Safety: 'safety',
  SelfActualization: 'selfActualization',
  Hygiene: 'hygiene',
  Entertainment: 'entertainment',
};

/**
 * Get personality modifier for a given need.
 * Personality traits affect need increase rates:
 *   - High Patience -> slower Rest increase
 *   - High Friendliness -> faster SocialInteraction increase
 *   - High Curiosity -> faster SelfActualization increase
 *   - High SurvivalInstinct -> faster Hunger/Thirst increase
 */
function getPersonalityModifier(npc: NPC, need: Need): number {
  let modifier = 1.0;
  const p = npc.personality;

  switch (need.name) {
    case 'Hunger':
    case 'Thirst':
      modifier *= 0.8 + (p.survivalInstinct / 10) * 0.4; // 0.8 - 1.2
      break;
    case 'Rest':
      modifier *= 1.2 - (p.patience / 10) * 0.4; // 0.8 - 1.2
      break;
    case 'SocialInteraction':
      modifier *= 0.6 + (p.friendliness / 10) * 0.8; // 0.6 - 1.4
      break;
    case 'Safety':
      modifier *= 0.6 + (p.fearfulness / 10) * 0.8; // 0.6 - 1.4
      break;
    case 'SelfActualization':
      modifier *= 0.6 + (p.curiosity / 10) * 0.8; // 0.6 - 1.4
      break;
    case 'Hygiene':
      modifier *= 0.8 + (p.patience / 10) * 0.4;
      break;
    case 'Entertainment':
      modifier *= 0.8 + (p.curiosity / 10) * 0.4;
      break;
  }

  return modifier;
}

/**
 * Tick all needs for a single NPC.
 * Returns the name of the highest-priority unsatisfied need.
 */
export function tickNeeds(npc: NPC, needs: Need[], deltaTime: number): string {
  for (const need of needs) {
    const key = NEED_NAME_MAP[need.name];
    if (!key) continue;

    const rate = need.increaseRate * getPersonalityModifier(npc, need);
    const current = npc.needs[key] ?? need.defaultValue;
    npc.needs[key] = Math.min(100, Math.max(0, current + rate * deltaTime));
  }

  // Find highest weighted unsatisfied need
  let topNeed = 'Hunger';
  let topScore = -Infinity;

  for (const need of needs) {
    const key = NEED_NAME_MAP[need.name];
    if (!key) continue;

    const value = npc.needs[key] ?? 0;
    const score = value * need.priorityWeight;

    if (score > topScore) {
      topScore = score;
      topNeed = need.name;
    }
  }

  return topNeed;
}

/**
 * Get need urgency level (0-1) for display.
 */
export function getNeedUrgency(value: number, threshold: number): number {
  if (value >= threshold) return 1.0;
  if (value <= 0) return 0;
  return value / threshold;
}

export const needSystem: System = {
  name: 'NeedSystem',
  tick(world: WorldState, deltaTime: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    for (const npc of world.npcs) {
      const prevNeeds = { ...npc.needs };
      const topNeed = tickNeeds(npc, world.needs, deltaTime);

      // Emit event if a need crosses critical threshold (80+)
      const key = NEED_NAME_MAP[topNeed];
      if (key && npc.needs[key] >= 80 && (prevNeeds[key] ?? 0) < 80) {
        events.push({
          id: `need-${world.tickCount}-${npc.id}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'need',
          actorId: npc.id,
          description: `${npc.name}'s ${topNeed} need is critical (${Math.round(npc.needs[key])})`,
          data: { need: topNeed, value: npc.needs[key] },
        });
      }
    }

    return events;
  },
};
