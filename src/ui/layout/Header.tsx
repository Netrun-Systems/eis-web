import React from 'react';
import { SimulationControls } from '../simulation/SimulationControls';
import { useSimulationStore } from '../../hooks/useSimulation';
import { getWorldTimeString } from '../../engine/world';

export function Header() {
  const { world, isPaused } = useSimulationStore();
  const stats = useSimulationStore(s => s.simulation.getStats());

  return (
    <header className="h-14 bg-eis-bg-card border-b border-eis-border flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-6">
        {world && (
          <>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-eis-warning' : 'bg-eis-green animate-pulse'}`} />
              <span className="text-sm font-mono text-eis-text">
                {getWorldTimeString(world)}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-eis-text-secondary">
              <span>Tick: {stats?.tickCount ?? 0}</span>
              <span>NPCs: {stats?.npcCount ?? 0}</span>
              <span>Events: {stats?.totalEvents ?? 0}</span>
            </div>
          </>
        )}
      </div>

      <SimulationControls />
    </header>
  );
}
