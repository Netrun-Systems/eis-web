import React, { useMemo } from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';

export function TradeLog() {
  const { world, tickCounter } = useSimulationStore();

  const tradeEvents = useMemo(() => {
    if (!world) return [];
    return world.eventLog
      .filter(e => e.type === 'trade')
      .slice(-100)
      .reverse();
  }, [world?.eventLog.length, tickCounter]);

  const itemStats = useMemo(() => {
    if (!world) return [];
    const counts = new Map<string, number>();
    for (const npc of world.npcs) {
      for (const item of npc.inventory) {
        counts.set(item, (counts.get(item) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort(([, a], [, b]) => b - a).slice(0, 20);
  }, [tickCounter]);

  if (!world) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-eis-text">Economy</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Item Distribution */}
        <div className="eis-card">
          <h3 className="font-medium text-eis-text mb-3">Item Distribution (Top 20)</h3>
          <div className="space-y-1.5">
            {itemStats.length === 0 ? (
              <p className="text-eis-text-muted text-sm">No items tracked</p>
            ) : (
              itemStats.map(([name, count]) => {
                const item = world.items.find(i => i.name === name);
                const maxCount = itemStats[0][1];
                return (
                  <div key={name} className="flex items-center gap-2 text-sm">
                    <span className="text-eis-text flex-1 truncate">{name}</span>
                    <div className="w-32 h-2 bg-eis-bg rounded-full overflow-hidden">
                      <div
                        className="h-full bg-eis-green rounded-full"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-eis-text-muted text-xs w-8 text-right">{count}</span>
                    {item && (
                      <span className="text-eis-text-muted text-xs w-12 text-right">{item.value}g</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Item Catalog */}
        <div className="eis-card">
          <h3 className="font-medium text-eis-text mb-3">Item Catalog ({world.items.length})</h3>
          <div className="max-h-96 overflow-y-auto space-y-1">
            {world.items.map(item => (
              <div key={item.id} className="flex items-center justify-between text-sm py-1 hover:bg-eis-bg-hover px-2 rounded">
                <div>
                  <span className="text-eis-text">{item.name}</span>
                  <span className="text-eis-text-muted text-xs ml-2">{item.itemType}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`eis-badge text-xs ${
                    item.availability === 'Rare' ? 'bg-purple-900/50 text-purple-300' :
                    item.availability === 'Uncommon' ? 'bg-blue-900/50 text-blue-300' :
                    item.availability === 'Legendary' ? 'bg-yellow-900/50 text-yellow-300' :
                    'bg-eis-bg text-eis-text-secondary'
                  }`}>
                    {item.availability}
                  </span>
                  <span className="text-eis-text-muted font-mono text-xs">{item.value}g</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trade Log */}
      <div className="eis-card">
        <h3 className="font-medium text-eis-text mb-3">Trade History ({tradeEvents.length})</h3>
        {tradeEvents.length === 0 ? (
          <p className="text-eis-text-muted text-sm text-center py-4">
            No trades yet. Start the simulation to see trade activity.
          </p>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {tradeEvents.map((event, i) => (
              <div key={event.id || i} className="flex items-center gap-3 text-sm py-1 px-2 hover:bg-eis-bg-hover rounded">
                <span className="text-eis-text-muted font-mono text-xs w-12">{event.tick}</span>
                <span className="text-eis-text flex-1">{event.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
