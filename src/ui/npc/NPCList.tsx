import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSimulationStore } from '../../hooks/useSimulation';
import { getFactionForNPC, getFactionColor } from '../../engine/world';
import { PERSONALITY_TRAIT_KEYS } from '../../engine/types';

export function NPCList() {
  const { world, tickCounter } = useSimulationStore();
  const [search, setSearch] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'name' | 'species' | 'emotion'>('name');

  const species = useMemo(() => {
    if (!world) return [];
    const s = new Set(world.npcs.map(n => n.species));
    return ['All', ...Array.from(s).sort()];
  }, [world]);

  const filtered = useMemo(() => {
    if (!world) return [];
    return world.npcs
      .filter(npc => {
        if (search && !npc.name.toLowerCase().includes(search.toLowerCase()) &&
            !npc.id.toLowerCase().includes(search.toLowerCase())) return false;
        if (speciesFilter !== 'All' && npc.species !== speciesFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'species') return a.species.localeCompare(b.species);
        return a.emotionalState.localeCompare(b.emotionalState);
      });
  }, [world, search, speciesFilter, sortBy, tickCounter]);

  if (!world) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-eis-text">NPCs ({filtered.length})</h2>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by name or ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="eis-input w-64"
        />
        <select
          value={speciesFilter}
          onChange={e => setSpeciesFilter(e.target.value)}
          className="eis-input"
        >
          {species.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="eis-input"
        >
          <option value="name">Sort by Name</option>
          <option value="species">Sort by Species</option>
          <option value="emotion">Sort by Emotion</option>
        </select>
      </div>

      {/* NPC Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map(npc => {
          const faction = getFactionForNPC(world, npc);
          const factionColor = faction ? getFactionColor(faction.name) : '#5a6878';

          return (
            <Link
              key={npc.id}
              to={`/npcs/${npc.id}`}
              className="eis-card hover:border-eis-green/50 transition-colors group"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium text-eis-text group-hover:text-eis-green">{npc.name}</h3>
                  <p className="text-xs text-eis-text-muted">{npc.id}</p>
                </div>
                <span className="eis-badge" style={{ backgroundColor: factionColor + '20', color: factionColor }}>
                  {faction?.name ?? 'None'}
                </span>
              </div>

              <div className="flex gap-4 text-xs text-eis-text-secondary mb-2">
                <span>{npc.species}</span>
                <span>Age: {npc.age}</span>
                <span>{npc.gender}</span>
              </div>

              <div className="flex items-center gap-1 mb-2">
                <span className="text-xs text-eis-text-muted">Emotion:</span>
                <span className="text-xs font-medium text-eis-text">{npc.emotionalState}</span>
              </div>

              {/* Mini personality bars */}
              <div className="grid grid-cols-7 gap-0.5">
                {PERSONALITY_TRAIT_KEYS.map(trait => (
                  <div key={trait} className="flex flex-col items-center" title={`${trait}: ${npc.personality[trait]}`}>
                    <div className="w-full h-8 bg-eis-bg rounded-sm relative overflow-hidden">
                      <div
                        className="absolute bottom-0 w-full bg-eis-green/60 rounded-sm transition-all"
                        style={{ height: `${(npc.personality[trait] / 10) * 100}%` }}
                      />
                    </div>
                    <span className="text-[8px] text-eis-text-muted mt-0.5 truncate w-full text-center">
                      {trait.slice(0, 3)}
                    </span>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
