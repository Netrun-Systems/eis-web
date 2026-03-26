import React from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';

export function BiomeView() {
  const { world } = useSimulationStore();
  if (!world) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-eis-text">Environment & Weather</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Weather Conditions */}
        <div className="eis-card">
          <h3 className="font-medium text-eis-text mb-3">Weather Conditions</h3>
          <div className="space-y-2">
            {world.weatherConditions.map(w => (
              <div key={w.id} className="bg-eis-bg rounded p-2">
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-eis-text">{w.name}</span>
                  <span className="text-xs text-eis-text-muted">Intensity: {w.intensity.toFixed(1)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-eis-text-secondary">
                  <span>Temp: {w.temperatureModifier > 0 ? '+' : ''}{w.temperatureModifier}</span>
                  <span>Wind: {w.windStrength.toFixed(1)}</span>
                  <span>Vis: {w.visibilityRange}m</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Environment Effects */}
        <div className="eis-card">
          <h3 className="font-medium text-eis-text mb-3">Environment Effects</h3>
          <div className="space-y-2">
            {world.environmentConditions.map(e => (
              <div key={e.id} className="bg-eis-bg rounded p-2">
                <p className="text-sm text-eis-text">{e.name}</p>
                <p className="text-xs text-eis-text-secondary mt-0.5">{e.description}</p>
                <p className="text-xs text-eis-text-muted mt-0.5">{e.effectsOnBehaviors}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
