import React, { useMemo } from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';

export function TrustMatrix() {
  const { world, tickCounter } = useSimulationStore();

  const { npcIds, npcNames, matrix } = useMemo(() => {
    if (!world) return { npcIds: [], npcNames: [], matrix: [] as number[][] };

    // Get NPCs with relationships (limit to first 20 for readability)
    const involvedIds = new Set<string>();
    for (const rel of world.relationships) {
      involvedIds.add(rel.entities[0]);
      involvedIds.add(rel.entities[1]);
    }
    const ids = Array.from(involvedIds).slice(0, 20);
    const names = ids.map(id => {
      const npc = world.npcs.find(n => n.id === id);
      return npc?.name ?? id;
    });

    // Build matrix
    const mat: number[][] = [];
    for (let i = 0; i < ids.length; i++) {
      mat[i] = [];
      for (let j = 0; j < ids.length; j++) {
        if (i === j) {
          mat[i][j] = 10; // Self
          continue;
        }
        const rel = world.relationships.find(
          r => (r.entities[0] === ids[i] && r.entities[1] === ids[j]) ||
               (r.entities[0] === ids[j] && r.entities[1] === ids[i])
        );
        mat[i][j] = rel?.currentTrustLevel ?? -1;
      }
    }

    return { npcIds: ids, npcNames: names, matrix: mat };
  }, [world?.relationships.length, tickCounter]);

  if (!world) return null;

  function getTrustColor(trust: number): string {
    if (trust < 0) return 'bg-eis-bg';
    if (trust >= 8) return 'bg-green-600';
    if (trust >= 6) return 'bg-green-800';
    if (trust >= 4) return 'bg-yellow-700';
    if (trust >= 2) return 'bg-orange-700';
    return 'bg-red-700';
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-eis-text">Trust Matrix</h2>
      <p className="text-sm text-eis-text-secondary">
        Heatmap showing trust levels between NPCs. Green = high trust, Red = low trust.
      </p>

      <div className="eis-card overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="py-1 px-1 text-eis-text-muted" />
              {npcNames.map((name, i) => (
                <th key={i} className="py-1 px-0.5 text-eis-text-muted font-normal" style={{ writingMode: 'vertical-rl' }}>
                  <span className="block transform rotate-180 max-h-20 truncate">{name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i}>
                <td className="py-0.5 px-1 text-eis-text-secondary truncate max-w-[120px]">{npcNames[i]}</td>
                {row.map((trust, j) => (
                  <td key={j} className="p-0.5">
                    <div
                      className={`w-6 h-6 rounded-sm flex items-center justify-center ${getTrustColor(trust)}`}
                      title={trust >= 0 ? `${npcNames[i]} -> ${npcNames[j]}: ${trust.toFixed(1)}` : 'No relationship'}
                    >
                      {trust >= 0 && trust < 10 && (
                        <span className="text-[8px] text-white/70">{trust.toFixed(0)}</span>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
