import type { NPC, WorldState, SimulationEvent, System, Relationship, EmotionalContagionRule } from '../types';
import { personalityCompatibility } from './personality-system';

/**
 * ABI Trust Model: Ability, Benevolence, Integrity
 * Trust changes based on interaction type, personality compatibility, and faction alignment.
 */

/**
 * Evolve trust between two NPCs based on an interaction.
 */
export function evolveTrust(
  npc1: NPC,
  npc2: NPC,
  eventType: string,
  world: WorldState
): { trustChange: number; newTrust: number } {
  const params = world.trustEvolutionParameters.find(p => p.eventType === eventType);
  if (!params) return { trustChange: 0, newTrust: getCurrentTrust(npc1, npc2, world) };

  // Base trust change
  let change = params.baseTrustChange;

  // Personality compatibility modifier
  const compatibility = personalityCompatibility(npc1, npc2);
  change *= params.personalityMultiplier * (0.5 + compatibility);

  // Faction alignment modifier
  const sameFaction = npc1.groupAffiliations.some(g => npc2.groupAffiliations.includes(g));
  if (sameFaction) {
    change *= 1 + params.factionInfluenceWeight;
  } else {
    // Check faction reputation
    const factionRep = getFactionReputation(npc1, npc2, world);
    change *= 0.5 + (factionRep / 100) * 0.5;
  }

  // Diminishing returns
  const currentTrust = getCurrentTrust(npc1, npc2, world);
  if (change > 0 && currentTrust > 7) {
    change *= params.diminishingReturnsFactor;
  }

  // Clamp change
  change = Math.max(-params.maxChangePerEvent, Math.min(params.maxChangePerEvent, change));

  // Apply
  const newTrust = Math.max(0, Math.min(10, currentTrust + change / 10));
  setTrust(npc1, npc2, newTrust, world);

  return { trustChange: change, newTrust };
}

function getCurrentTrust(npc1: NPC, npc2: NPC, world: WorldState): number {
  // Check NPC's relationship map first
  const directTrust = npc1.relationships.get(npc2.id);
  if (directTrust !== undefined) return directTrust / 10; // Normalize to 0-10

  // Fall back to relationship data
  const rel = world.relationships.find(
    r => (r.entities[0] === npc1.id && r.entities[1] === npc2.id) ||
         (r.entities[0] === npc2.id && r.entities[1] === npc1.id)
  );

  return rel ? rel.currentTrustLevel : 5;
}

function setTrust(npc1: NPC, npc2: NPC, trust: number, world: WorldState): void {
  npc1.relationships.set(npc2.id, trust * 10);
  npc2.relationships.set(npc1.id, trust * 10);

  // Update relationships data
  const rel = world.relationships.find(
    r => (r.entities[0] === npc1.id && r.entities[1] === npc2.id) ||
         (r.entities[0] === npc2.id && r.entities[1] === npc1.id)
  );
  if (rel) {
    rel.currentTrustLevel = trust;
  }
}

function getFactionReputation(npc1: NPC, npc2: NPC, world: WorldState): number {
  for (const f1 of npc1.groupAffiliations) {
    for (const f2 of npc2.groupAffiliations) {
      const rep = world.factionReputations.find(
        r => (r.factionA === f1 && r.factionB === f2) ||
             (r.factionA === f2 && r.factionB === f1)
      );
      if (rep) return rep.reputationLevel;
    }
  }
  return 50; // Default neutral
}

/**
 * Emotional contagion: emotions spread between nearby/related NPCs.
 */
export function spreadEmotion(
  source: NPC,
  targets: NPC[],
  rules: EmotionalContagionRule[],
  world: WorldState
): SimulationEvent[] {
  const events: SimulationEvent[] = [];
  const matchingRules = rules.filter(r => r.sourceEmotion === source.emotionalState);

  for (const rule of matchingRules) {
    for (const target of targets) {
      if (target.id === source.id) continue;

      // Calculate distance
      const dx = source.position.x - target.position.x;
      const dy = source.position.y - target.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy) / 100; // Normalize

      if (distance > rule.maxPropagationDistance) continue;

      // Relationship strength
      const trust = getCurrentTrust(source, target, world);
      const relMultiplier = rule.relationshipStrengthMultiplier * (trust / 10);

      // Personality openness (empathy + friendliness average)
      const openness = (target.personality.empathy + target.personality.friendliness) / 20;
      const personalityFactor = rule.personalityOpennessFactor * openness;

      // Distance decay
      const distanceFactor = Math.max(0, 1 - distance * rule.distanceDecayRate);

      // Faction amplification
      const sameFaction = source.groupAffiliations.some(g => target.groupAffiliations.includes(g));
      const factionFactor = sameFaction ? rule.factionAmplificationFactor : 1.0;

      // Total contagion strength
      const strength = rule.baseContagionStrength * relMultiplier * personalityFactor *
        distanceFactor * factionFactor;

      // Resistance check
      const resistance = (target.personality.independence + target.personality.confidence) / 20;
      if (strength <= rule.resistanceThreshold * resistance) continue;

      // Apply emotion change
      if (world.rng.next() < strength) {
        const prevEmotion = target.emotionalState;
        target.emotionalState = source.emotionalState;

        events.push({
          id: `emotion-${world.tickCount}-${target.id}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'emotion',
          actorId: target.id,
          targetId: source.id,
          description: `${target.name} caught ${source.emotionalState} from ${source.name} (was ${prevEmotion})`,
          data: {
            previousEmotion: prevEmotion,
            newEmotion: source.emotionalState,
            contagionType: rule.contagionType,
            strength,
          },
        });
      }
    }
  }

  return events;
}

export const relationshipSystem: System = {
  name: 'RelationshipSystem',
  tick(world: WorldState, deltaTime: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    // Time decay on all relationships
    for (const rel of world.relationships) {
      const decayParam = world.trustEvolutionParameters.find(p => p.eventType === 'TimeDecay');
      if (decayParam && rel.currentTrustLevel > 5) {
        rel.currentTrustLevel = Math.max(
          rel.initialTrustLevel * 0.5,
          rel.currentTrustLevel - Math.abs(decayParam.baseTrustChange) * deltaTime * 0.001
        );
      }
    }

    // Emotional contagion (process a subset each tick for performance)
    const contagionCandidates = world.npcs.filter(() => world.rng.next() < 0.3);
    for (const npc of contagionCandidates) {
      const nearby = world.npcs.filter(other => {
        if (other.id === npc.id) return false;
        const dx = npc.position.x - other.position.x;
        const dy = npc.position.y - other.position.y;
        return Math.sqrt(dx * dx + dy * dy) < 200;
      });

      if (nearby.length > 0) {
        const emotionEvents = spreadEmotion(npc, nearby, world.emotionalContagionRules, world);
        events.push(...emotionEvents);
      }
    }

    // Random social interactions between nearby NPCs
    if (world.tickCount % 5 === 0) {
      for (let i = 0; i < Math.min(3, world.npcs.length); i++) {
        const idx = world.rng.nextInt(0, world.npcs.length - 1);
        const npc = world.npcs[idx];

        const nearby = world.npcs.filter(other => {
          if (other.id === npc.id) return false;
          const dx = npc.position.x - other.position.x;
          const dy = npc.position.y - other.position.y;
          return Math.sqrt(dx * dx + dy * dy) < 150;
        });

        if (nearby.length > 0) {
          const target = nearby[world.rng.nextInt(0, nearby.length - 1)];
          const eventType = world.rng.next() > 0.3 ? 'PositiveInteraction' : 'NegativeInteraction';
          const { trustChange, newTrust } = evolveTrust(npc, target, eventType, world);

          if (Math.abs(trustChange) > 1) {
            events.push({
              id: `social-${world.tickCount}-${npc.id}-${target.id}`,
              tick: world.tickCount,
              gameTime: world.time,
              type: 'social',
              actorId: npc.id,
              targetId: target.id,
              description: `${npc.name} had a ${eventType === 'PositiveInteraction' ? 'positive' : 'negative'} interaction with ${target.name} (trust: ${newTrust.toFixed(1)})`,
              data: { eventType, trustChange, newTrust },
            });
          }
        }
      }
    }

    return events;
  },
};
