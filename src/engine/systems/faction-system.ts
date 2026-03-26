import type { WorldState, SimulationEvent, System } from '../types';

/**
 * Faction system: manages faction reputation evolution, territory control,
 * and inter-faction dynamics.
 */

export const factionSystem: System = {
  name: 'FactionSystem',
  tick(world: WorldState, deltaTime: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    // Reputation decay toward neutral over time
    for (const rep of world.factionReputations) {
      const neutral = 50;
      const diff = rep.reputationLevel - neutral;
      rep.reputationLevel -= diff * rep.reputationDecayRate * deltaTime * 0.01;

      // Apply momentum
      rep.reputationLevel += rep.reputationMomentum * deltaTime * 0.01;
      rep.reputationLevel = Math.max(0, Math.min(100, rep.reputationLevel));

      // Decay momentum
      rep.reputationMomentum *= (1 - rep.eventImpactDecayRate * deltaTime * 0.01);

      // Check threshold crossings
      if (rep.reputationLevel <= rep.hostilityThreshold && diff > rep.hostilityThreshold) {
        events.push({
          id: `faction-hostile-${world.tickCount}-${rep.factionA}-${rep.factionB}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'faction',
          actorId: rep.factionA,
          targetId: rep.factionB,
          description: `${rep.factionA} and ${rep.factionB} have become hostile!`,
          data: { reputationLevel: rep.reputationLevel, status: 'hostile' },
        });
      }
    }

    // Update faction member counts
    if (world.tickCount % 20 === 0) {
      for (const faction of world.factions) {
        const members = world.npcs.filter(npc =>
          npc.groupAffiliations.includes(String(faction.id)) ||
          npc.groupAffiliations.some(g => {
            const fDef = world.factions.find(f => f.name === g || String(f.id) === g);
            return fDef?.name === faction.name;
          })
        );

        if (members.length > 0 && world.tickCount % 100 === 0) {
          events.push({
            id: `faction-status-${world.tickCount}-${faction.name}`,
            tick: world.tickCount,
            gameTime: world.time,
            type: 'faction',
            actorId: faction.name,
            description: `${faction.name}: ${members.length} active members`,
            data: { memberCount: members.length },
          });
        }
      }
    }

    return events;
  },
};
