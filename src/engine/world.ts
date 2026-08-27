/**
 * Faction display colors for map rendering.
 * (The old WorldState query helpers were simulation-only and were
 * removed in WEB-002; git history preserves them.)
 */
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
