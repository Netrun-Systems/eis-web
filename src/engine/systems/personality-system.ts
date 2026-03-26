import type { NPC, WorldState, SimulationEvent, System, PersonalityTraits } from '../types';
import { PERSONALITY_TRAIT_KEYS } from '../types';

/**
 * Personality evolution: traits slowly shift based on experiences and behaviors.
 * This mirrors the EIS PersonalityProgressionComponent in UE5.
 */

/**
 * Apply small personality drift based on current behavior and emotional state.
 */
function evolvePersonality(npc: NPC, deltaTime: number, world: WorldState): void {
  const driftRate = 0.001 * deltaTime; // Very slow drift

  // Emotional state affects personality over time
  switch (npc.emotionalState) {
    case 'Happy':
    case 'Hopeful':
      npc.personality.friendliness = clamp(npc.personality.friendliness + driftRate);
      npc.personality.confidence = clamp(npc.personality.confidence + driftRate * 0.5);
      break;
    case 'Angry':
    case 'Ferocious':
      npc.personality.aggression = clamp(npc.personality.aggression + driftRate);
      npc.personality.patience = clamp(npc.personality.patience - driftRate * 0.5);
      break;
    case 'Fearful':
    case 'Timid':
      npc.personality.fearfulness = clamp(npc.personality.fearfulness + driftRate);
      npc.personality.confidence = clamp(npc.personality.confidence - driftRate * 0.5);
      break;
    case 'Curious':
      npc.personality.curiosity = clamp(npc.personality.curiosity + driftRate);
      break;
    case 'Stoic':
    case 'Calm':
      npc.personality.patience = clamp(npc.personality.patience + driftRate * 0.5);
      break;
  }

  // Behaviors reinforce related traits
  if (npc.currentBehavior) {
    const b = npc.currentBehavior.toLowerCase();
    if (b.includes('trade') || b.includes('sociali')) {
      npc.personality.friendliness = clamp(npc.personality.friendliness + driftRate * 0.3);
    }
    if (b.includes('defend') || b.includes('fight')) {
      npc.personality.aggression = clamp(npc.personality.aggression + driftRate * 0.3);
      npc.personality.confidence = clamp(npc.personality.confidence + driftRate * 0.2);
    }
    if (b.includes('explore')) {
      npc.personality.curiosity = clamp(npc.personality.curiosity + driftRate * 0.3);
    }
  }
}

function clamp(v: number, min = 0, max = 10): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Evaluate talent effects on personality.
 * Talents amplify certain personality expressions.
 */
export function getTalentPersonalityModifier(npc: NPC): Partial<PersonalityTraits> {
  const mods: Partial<PersonalityTraits> = {};
  const talents = npc.talentProfile;

  for (const talentId of talents.topFive) {
    const strength = talents.all.get(talentId) ?? 5;
    const bonus = (strength - 5) * 0.1; // -0.5 to +0.5

    // Map talent domains to personality trait boosts
    switch (talentId) {
      case 'T019': // Command
        mods.confidence = (mods.confidence ?? 0) + bonus;
        mods.aggression = (mods.aggression ?? 0) + bonus * 0.5;
        break;
      case 'T029': // Empathy
        mods.empathy = (mods.empathy ?? 0) + bonus;
        mods.friendliness = (mods.friendliness ?? 0) + bonus * 0.5;
        break;
      case 'T017': // Strategic
        mods.curiosity = (mods.curiosity ?? 0) + bonus;
        mods.patience = (mods.patience ?? 0) + bonus * 0.3;
        break;
      case 'T001': // Achiever
        mods.resourcefulness = (mods.resourcefulness ?? 0) + bonus;
        break;
      case 'T033': // Positivity
        mods.friendliness = (mods.friendliness ?? 0) + bonus;
        mods.empathy = (mods.empathy ?? 0) + bonus * 0.3;
        break;
    }
  }

  return mods;
}

/**
 * Calculate personality compatibility between two NPCs (0-1).
 */
export function personalityCompatibility(npc1: NPC, npc2: NPC): number {
  let totalDiff = 0;
  for (const key of PERSONALITY_TRAIT_KEYS) {
    const diff = Math.abs(npc1.personality[key] - npc2.personality[key]);
    totalDiff += diff;
  }
  // Normalize: max diff = 14 traits * 10 = 140
  return 1 - totalDiff / 140;
}

export const personalitySystem: System = {
  name: 'PersonalitySystem',
  tick(world: WorldState, deltaTime: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    for (const npc of world.npcs) {
      const prevTraits = { ...npc.personality };
      evolvePersonality(npc, deltaTime, world);

      // Check for significant personality shifts
      for (const key of PERSONALITY_TRAIT_KEYS) {
        const diff = Math.abs(npc.personality[key] - prevTraits[key]);
        if (diff >= 0.5) {
          events.push({
            id: `personality-${world.tickCount}-${npc.id}-${key}`,
            tick: world.tickCount,
            gameTime: world.time,
            type: 'system',
            actorId: npc.id,
            description: `${npc.name}'s ${key} shifted to ${npc.personality[key].toFixed(1)}`,
            data: { trait: key, oldValue: prevTraits[key], newValue: npc.personality[key] },
          });
        }
      }
    }

    return events;
  },
};
