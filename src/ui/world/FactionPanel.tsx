import React, { useMemo } from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';
import { getFactionColor, getNPCsByFaction } from '../../engine/world';

export function FactionPanel() {
  const { world, tickCounter } = useSimulationStore();

  const factionData = useMemo(() => {
    if (!world) return [];
    return world.factions.map(faction => {
      // Count members by matching faction ID or name in NPC group affiliations
      const members = world.npcs.filter(npc =>
        npc.groupAffiliations.includes(String(faction.id)) ||
        npc.groupAffiliations.some(g => {
          const f = world.factions.find(fd => fd.name === g);
          return f?.id === faction.id;
        })
      );

      const reputations = world.factionReputations.filter(
        r => r.factionA === faction.name || r.factionB === faction.name
      );

      return { faction, members, reputations };
    });
  }, [world, tickCounter]);

  if (!world) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-eis-text">Factions ({world.factions.length})</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {factionData.map(({ faction, members, reputations }) => {
          const color = getFactionColor(faction.name);
          return (
            <div key={faction.id} className="eis-card">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                  <h3 className="font-medium text-eis-text">{faction.name}</h3>
                </div>
                <span className="eis-badge bg-eis-bg text-eis-text-secondary">{members.length} members</span>
              </div>

              <p className="text-xs text-eis-text-secondary mb-3">{faction.description}</p>

              <dl className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div>
                  <dt className="text-eis-text-muted">Territory</dt>
                  <dd className="text-eis-text">{faction.territory || 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-eis-text-muted">Leadership</dt>
                  <dd className="text-eis-text">{faction.leadership || 'None'}</dd>
                </div>
                <div>
                  <dt className="text-eis-text-muted">Population</dt>
                  <dd className="text-eis-text">{faction.population || 'Unknown'}</dd>
                </div>
                <div>
                  <dt className="text-eis-text-muted">Resources</dt>
                  <dd className="text-eis-text truncate">{faction.resources || 'None'}</dd>
                </div>
              </dl>

              {/* Reputation bars */}
              {reputations.length > 0 && (
                <div>
                  <p className="text-xs text-eis-text-muted mb-1.5">Reputation</p>
                  <div className="space-y-1">
                    {reputations.map(rep => {
                      const other = rep.factionA === faction.name ? rep.factionB : rep.factionA;
                      const level = rep.reputationLevel;
                      const barColor = level >= 60 ? 'bg-eis-green' : level >= 40 ? 'bg-eis-warning' : 'bg-eis-danger';

                      return (
                        <div key={rep.entryId} className="flex items-center gap-2 text-xs">
                          <span className="text-eis-text-secondary w-20 truncate">{other}</span>
                          <div className="flex-1 h-1.5 bg-eis-bg rounded-full overflow-hidden">
                            <div className={`h-full ${barColor} rounded-full`} style={{ width: `${level}%` }} />
                          </div>
                          <span className="text-eis-text-muted w-8 text-right">{Math.round(level)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Member list */}
              {members.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-eis-text-muted mb-1">Key Members</p>
                  <div className="flex flex-wrap gap-1">
                    {members.slice(0, 6).map(m => (
                      <span key={m.id} className="eis-badge bg-eis-bg text-eis-text-secondary text-xs">
                        {m.name}
                      </span>
                    ))}
                    {members.length > 6 && (
                      <span className="eis-badge bg-eis-bg text-eis-text-muted text-xs">+{members.length - 6}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Faction Relations */}
      <div className="eis-card">
        <h3 className="font-medium text-eis-text mb-3">Inter-Faction Relations</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-eis-border">
                <th className="text-left py-2 px-2 text-eis-text-muted">Faction A</th>
                <th className="text-left py-2 px-2 text-eis-text-muted">Faction B</th>
                <th className="text-left py-2 px-2 text-eis-text-muted">Status</th>
                <th className="text-right py-2 px-2 text-eis-text-muted">Trust</th>
              </tr>
            </thead>
            <tbody>
              {world.factionRelations.map(rel => {
                const statusColor =
                  rel.relationshipStatus === 'Allied' ? 'text-eis-green' :
                  rel.relationshipStatus === 'Hostile' ? 'text-eis-danger' :
                  rel.relationshipStatus === 'Rival' ? 'text-eis-warning' :
                  'text-eis-text-secondary';
                return (
                  <tr key={rel.pairId} className="border-b border-eis-border/50 hover:bg-eis-bg-hover">
                    <td className="py-1.5 px-2 text-eis-text">{rel.groupA}</td>
                    <td className="py-1.5 px-2 text-eis-text">{rel.groupB}</td>
                    <td className={`py-1.5 px-2 ${statusColor}`}>{rel.relationshipStatus}</td>
                    <td className="py-1.5 px-2 text-right font-mono text-eis-text">{rel.trustLevel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
