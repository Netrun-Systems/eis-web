// ============================================================
// EIS Tension / Standoff System
// Models building tension between NPCs with conflicting interests.
// Tension escalates or de-escalates per tick based on personality,
// faction relations, trust, and environmental factors.
// ============================================================

import type {
  NPC,
  WorldState,
  SimulationEvent,
  System,
  TensionInstance,
} from '../types';

// --- Helpers ---

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getNPCsNear(npc: NPC, world: WorldState, radius: number): NPC[] {
  return world.npcs.filter(other => {
    if (other.id === npc.id) return false;
    if (other.isDowned) return false;
    return dist(npc.position, other.position) <= radius;
  });
}

function getCurrentTrust(npc1: NPC, npc2: NPC): number {
  const directTrust = npc1.relationships.get(npc2.id);
  if (directTrust !== undefined) return directTrust / 10; // 0-10
  return 5;
}

function getFactionRepBetween(npc1: NPC, npc2: NPC, world: WorldState): number {
  for (const g1 of npc1.groupAffiliations) {
    for (const g2 of npc2.groupAffiliations) {
      const rep = world.factionReputations.find(
        r => (r.factionA === g1 && r.factionB === g2) ||
             (r.factionA === g2 && r.factionB === g1),
      );
      if (rep) return rep.reputationLevel;
    }
  }
  return 50;
}

function shareFaction(npc1: NPC, npc2: NPC): boolean {
  return npc1.groupAffiliations.some(g => npc2.groupAffiliations.includes(g));
}

// --- Tension evaluation ---

function shouldTensionExist(npc1: NPC, npc2: NPC, world: WorldState): boolean {
  if (npc1.isInCombat || npc2.isInCombat) return false;
  if (npc1.isDowned || npc2.isDowned) return false;

  const trust = getCurrentTrust(npc1, npc2);
  const factionRep = getFactionRepBetween(npc1, npc2, world);

  // Low trust or hostile faction
  if (trust < 3) return true;
  if (factionRep < 30) return true;

  // Both aggressive
  if (npc1.personality.aggression > 6 && npc2.personality.aggression > 6) return true;

  // One has items the other wants (greed check)
  if (npc1.personality.greed > 7 && npc2.inventory.length > 2) return true;
  if (npc2.personality.greed > 7 && npc1.inventory.length > 2) return true;

  // Resource scarcity
  if (npc1.needs.hunger > 70 && npc2.needs.hunger > 70) return true;

  return false;
}

interface EscalationFactors {
  increase: number;
  decrease: number;
}

function calculateEscalation(
  npc1: NPC,
  npc2: NPC,
  world: WorldState,
  tensionParticipants: string[],
): EscalationFactors {
  let increase = 0;
  let decrease = 0;

  // Aggression (both sides)
  increase += (npc1.personality.aggression + npc2.personality.aggression) / 20 * 3;

  // Hostile faction
  const factionRep = getFactionRepBetween(npc1, npc2, world);
  if (factionRep < 30) increase += (30 - factionRep) / 10;

  // Low trust
  const trust = getCurrentTrust(npc1, npc2);
  if (trust < 3) increase += (3 - trust) * 1.5;

  // Resource scarcity
  if (npc1.needs.hunger > 70 || npc2.needs.hunger > 70) increase += 1.5;

  // Unmet safety need
  if (npc1.needs.safety > 60 || npc2.needs.safety > 60) increase += 1;

  // Mob mentality: aggressive witnesses
  const nearby = getNPCsNear(npc1, world, 5);
  for (const witness of nearby) {
    if (tensionParticipants.includes(witness.id)) continue;
    if (witness.personality.aggression > 7) increase += 0.5;
  }

  // Greed: one NPC wants what the other has
  if (npc1.personality.greed > 7 && npc2.inventory.length > 2) increase += 1;
  if (npc2.personality.greed > 7 && npc1.inventory.length > 2) increase += 1;

  // --- De-escalation factors ---

  // High empathy
  decrease += (npc1.personality.empathy + npc2.personality.empathy) / 20 * 2;

  // Diplomacy skill
  const diplo1 = npc1.skills.get('Diplomacy') ?? npc1.skills.get('Skill_Diplomacy') ?? 0;
  const diplo2 = npc2.skills.get('Diplomacy') ?? npc2.skills.get('Skill_Diplomacy') ?? 0;
  decrease += (diplo1 + diplo2) / 10;

  // Shared faction
  if (shareFaction(npc1, npc2)) decrease += 3;

  // Positive relationship
  if (trust > 7) decrease += (trust - 7) * 1.5;

  // Third party mediator (high charisma NPC nearby)
  for (const witness of nearby) {
    if (tensionParticipants.includes(witness.id)) continue;
    if (witness.attributes.charisma > 7 && witness.personality.empathy > 6) {
      decrease += 2;
      break; // Only one mediator bonus
    }
  }

  // Positive emotional states
  if (npc1.emotionalState === 'Happy' || npc1.emotionalState === 'Hopeful') decrease += 1;
  if (npc2.emotionalState === 'Happy' || npc2.emotionalState === 'Hopeful') decrease += 1;

  return { increase, decrease };
}

// --- Tension System ---

export class TensionSystem implements System {
  name = 'TensionSystem';

  tick(world: WorldState, deltaTime: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    if (!world.activeTensions) world.activeTensions = [];

    // Only evaluate every 2 ticks for performance
    if (world.tickCount % 2 !== 0) return events;

    // Build a set of NPC IDs already in active tensions
    const inTension = new Set<string>();
    for (const t of world.activeTensions) {
      if (t.status === 'building' || t.status === 'peaked') {
        for (const pid of t.participants) inTension.add(pid);
      }
    }

    // 1. Detect new tension situations
    for (const npc of world.npcs) {
      if (npc.isDowned || npc.isInCombat) continue;
      if (inTension.has(npc.id)) continue; // Already in a standoff

      const nearby = getNPCsNear(npc, world, 5);
      for (const other of nearby) {
        if (other.isInCombat || other.isDowned) continue;
        if (inTension.has(other.id)) continue;

        if (shouldTensionExist(npc, other, world)) {
          const tensionId = `tension-${world.tickCount}-${npc.id}-${other.id}`;
          const tension: TensionInstance = {
            id: tensionId,
            participants: [npc.id, other.id],
            location: {
              x: (npc.position.x + other.position.x) / 2,
              y: (npc.position.y + other.position.y) / 2,
            },
            tensionLevel: 20 + world.rng.nextFloat(0, 10), // Start at 20-30
            escalationRate: 0,
            deescalationRate: 0,
            triggers: [],
            status: 'building',
            startTick: world.tickCount,
          };

          // Determine triggers
          const trust = getCurrentTrust(npc, other);
          if (trust < 3) tension.triggers.push('low_trust');
          const fRep = getFactionRepBetween(npc, other, world);
          if (fRep < 30) tension.triggers.push('faction_hostility');
          if (npc.personality.aggression > 6 || other.personality.aggression > 6) {
            tension.triggers.push('high_aggression');
          }
          if (npc.needs.hunger > 70 || other.needs.hunger > 70) {
            tension.triggers.push('resource_scarcity');
          }

          world.activeTensions.push(tension);
          inTension.add(npc.id);
          inTension.add(other.id);

          events.push({
            id: `tension-new-${world.tickCount}-${npc.id}`,
            tick: world.tickCount,
            gameTime: world.time,
            type: 'tension_building',
            actorId: npc.id,
            targetId: other.id,
            description: `Tension builds between ${npc.name} and ${other.name} (${tension.triggers.join(', ')})`,
            data: { tensionId, level: tension.tensionLevel, triggers: tension.triggers },
          });

          break; // One new tension per NPC per tick
        }
      }
    }

    // 2. Update existing tensions
    const resolved: string[] = [];

    for (const tension of world.activeTensions) {
      if (tension.status !== 'building' && tension.status !== 'peaked') {
        resolved.push(tension.id);
        continue;
      }

      const npc1 = world.npcs.find(n => n.id === tension.participants[0]);
      const npc2 = world.npcs.find(n => n.id === tension.participants[1]);
      if (!npc1 || !npc2 || npc1.isDowned || npc2.isDowned || npc1.isInCombat || npc2.isInCombat) {
        tension.status = 'dispersed';
        resolved.push(tension.id);
        continue;
      }

      // Check if they moved apart
      if (dist(npc1.position, npc2.position) > 8) {
        tension.tensionLevel -= 10 * deltaTime;
        if (tension.tensionLevel <= 0) {
          tension.status = 'dispersed';
          tension.resolutionTick = world.tickCount;
          resolved.push(tension.id);
          events.push({
            id: `tension-disperse-${world.tickCount}-${tension.id}`,
            tick: world.tickCount,
            gameTime: world.time,
            type: 'tension_dispersed',
            actorId: npc1.id,
            targetId: npc2.id,
            description: `Tension between ${npc1.name} and ${npc2.name} dispersed — they moved apart.`,
            data: { tensionId: tension.id },
          });
          continue;
        }
      }

      // Calculate escalation
      const factors = calculateEscalation(npc1, npc2, world, tension.participants);
      tension.escalationRate = factors.increase;
      tension.deescalationRate = factors.decrease;

      tension.tensionLevel += (factors.increase - factors.decrease) * deltaTime;
      tension.tensionLevel = Math.max(0, Math.min(100, tension.tensionLevel));

      // 3. Resolution checks
      if (tension.tensionLevel >= 90) {
        // EXPLODES INTO COMBAT
        tension.status = 'resolved_combat';
        tension.resolutionTick = world.tickCount;
        resolved.push(tension.id);

        events.push({
          id: `tension-combat-${world.tickCount}-${tension.id}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'tension_combat',
          actorId: npc1.id,
          targetId: npc2.id,
          description: `Tension between ${npc1.name} and ${npc2.name} exploded into combat!`,
          data: { tensionId: tension.id, level: tension.tensionLevel },
        });

        // Force combat initiation by setting conditions
        // The combat system will pick this up naturally since they're close
        // We can force it by directly creating a combat
        npc1.needs.safety = 100; // Max unmet safety triggers combat
        npc1.personality.aggression = Math.min(10, npc1.personality.aggression + 1); // temp boost
      } else if (tension.tensionLevel >= 70 && tension.status === 'building') {
        tension.status = 'peaked';
        events.push({
          id: `tension-peaked-${world.tickCount}-${tension.id}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'tension_peaked',
          actorId: npc1.id,
          targetId: npc2.id,
          description: `${npc1.name} and ${npc2.name} are in a heated confrontation!`,
          data: { tensionId: tension.id, level: tension.tensionLevel },
        });
      } else if (tension.tensionLevel <= 10 && tension.status === 'building') {
        tension.status = 'dispersed';
        tension.resolutionTick = world.tickCount;
        resolved.push(tension.id);
        events.push({
          id: `tension-disperse-${world.tickCount}-${tension.id}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'tension_dispersed',
          actorId: npc1.id,
          targetId: npc2.id,
          description: `Tension between ${npc1.name} and ${npc2.name} faded away.`,
          data: { tensionId: tension.id },
        });
      }

      // 4. Diplomatic resolution attempt
      if (tension.tensionLevel >= 50 && tension.tensionLevel < 90) {
        // Find highest diplomacy participant
        const diplo1 = npc1.skills.get('Diplomacy') ?? npc1.skills.get('Skill_Diplomacy') ?? 0;
        const diplo2 = npc2.skills.get('Diplomacy') ?? npc2.skills.get('Skill_Diplomacy') ?? 0;
        const diplomat = diplo1 >= diplo2 ? npc1 : npc2;
        const diploSkill = Math.max(diplo1, diplo2);

        if (diploSkill > 3 && world.rng.next() < diplomat.personality.empathy / 15) {
          tension.tensionLevel -= 20;
          if (tension.tensionLevel < 20) {
            tension.status = 'resolved_peaceful';
            tension.resolutionTick = world.tickCount;
            resolved.push(tension.id);
          }

          events.push({
            id: `tension-diplo-${world.tickCount}-${tension.id}`,
            tick: world.tickCount,
            gameTime: world.time,
            type: 'tension_resolved',
            actorId: diplomat.id,
            targetId: diplomat.id === npc1.id ? npc2.id : npc1.id,
            description: `${diplomat.name} defused the situation with diplomacy! (Tension: ${Math.round(tension.tensionLevel)})`,
            data: { tensionId: tension.id, level: tension.tensionLevel, diplomatId: diplomat.id },
          });
        }
      }
    }

    // Clean up old resolved tensions (keep last 30 for display)
    world.activeTensions = world.activeTensions.filter(t => {
      if (t.status === 'building' || t.status === 'peaked') return true;
      return t.resolutionTick !== undefined && world.tickCount - t.resolutionTick < 100;
    });

    return events;
  }
}

export const tensionSystem = new TensionSystem();
