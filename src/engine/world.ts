import type { WorldState, NPC, FactionDefinition } from './types';

/**
 * World state query utilities.
 * These provide convenient access patterns without UI dependencies.
 */

export function getNPCById(world: WorldState, id: string): NPC | undefined {
  return world.npcs.find(npc => npc.id === id);
}

export function getNPCsByFaction(world: WorldState, factionName: string): NPC[] {
  return world.npcs.filter(npc =>
    npc.groupAffiliations.some(g => {
      const faction = world.factions.find(f => String(f.id) === g || f.name === g);
      return faction?.name === factionName || g === factionName;
    })
  );
}

export function getNPCsBySpecies(world: WorldState, species: string): NPC[] {
  return world.npcs.filter(npc => npc.species.toLowerCase() === species.toLowerCase());
}

export function getFactionForNPC(world: WorldState, npc: NPC): FactionDefinition | undefined {
  for (const g of npc.groupAffiliations) {
    const faction = world.factions.find(f => String(f.id) === g || f.name === g);
    if (faction) return faction;
  }
  return undefined;
}

export function getRelationshipBetween(world: WorldState, id1: string, id2: string): number {
  const rel = world.relationships.find(
    r => (r.entities[0] === id1 && r.entities[1] === id2) ||
         (r.entities[0] === id2 && r.entities[1] === id1)
  );
  return rel?.currentTrustLevel ?? 5;
}

export function getAllRelationshipsForNPC(world: WorldState, npcId: string): { targetId: string; trust: number }[] {
  const results: { targetId: string; trust: number }[] = [];
  for (const rel of world.relationships) {
    if (rel.entities[0] === npcId) {
      results.push({ targetId: rel.entities[1], trust: rel.currentTrustLevel });
    } else if (rel.entities[1] === npcId) {
      results.push({ targetId: rel.entities[0], trust: rel.currentTrustLevel });
    }
  }
  return results;
}

export function getWorldTimeString(world: WorldState): string {
  const h = Math.floor(world.hour);
  const m = Math.floor((world.time % 1) * 60);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `Day ${world.day}, ${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
}

export function getFactionColor(factionName: string): string {
  const colors: Record<string, string> = {
    Raiders: '#e55b5b',
    Remnants: '#5b9ee5',
    Reclaimers: '#90b9ab',
    'Autonomous Machines': '#8b8b8b',
    Villagers: '#e5a84b',
    Wolves: '#7a5bb5',
    Wraiths: '#b55b7a',
    'Rogue AI - Null Persisters': '#e55b8b',
    'Rogue AI - Mnemonoids': '#8b5be5',
    'Rogue AI - Immutable Apex': '#5be5b5',
    Academy: '#e5e55b',
    Squirrels: '#a0c070',
    Foxes: '#e08050',
    Rabbits: '#c0a080',
    Deer: '#80b080',
  };
  return colors[factionName] ?? '#90b9ab';
}
