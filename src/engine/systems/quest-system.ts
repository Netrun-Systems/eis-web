import type { WorldState, SimulationEvent, System } from '../types';

/**
 * Quest system: manages quest state transitions and completion tracking.
 */

export const questSystem: System = {
  name: 'QuestSystem',
  tick(world: WorldState, deltaTime: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    // Only check quests periodically
    if (world.tickCount % 25 !== 0) return events;

    for (const quest of world.quests) {
      if (quest.status !== 'available') continue;

      // Check if any NPC from the quest's faction is actively working
      const factionMembers = world.npcs.filter(npc =>
        npc.groupAffiliations.some(g => {
          const faction = world.factions.find(f => String(f.id) === g || f.name === g);
          return faction?.name === quest.faction;
        })
      );

      // Random chance of quest activation based on faction activity
      if (factionMembers.length > 0 && world.rng.next() < 0.02) {
        quest.status = 'active';
        events.push({
          id: `quest-activate-${world.tickCount}-${quest.name}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'quest',
          actorId: quest.faction,
          description: `Quest "${quest.name}" is now active for ${quest.faction}`,
          data: { questName: quest.name, faction: quest.faction },
        });
      }
    }

    // Check for quest completion
    for (const quest of world.quests) {
      if (quest.status !== 'active') continue;

      // Simplified completion: random chance per tick based on faction strength
      if (world.rng.next() < 0.005) {
        quest.status = 'completed';
        events.push({
          id: `quest-complete-${world.tickCount}-${quest.name}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'quest',
          actorId: quest.faction,
          description: `Quest "${quest.name}" completed by ${quest.faction}!`,
          data: { questName: quest.name, faction: quest.faction, rewards: quest.rewards },
        });
      }
    }

    return events;
  },
};
