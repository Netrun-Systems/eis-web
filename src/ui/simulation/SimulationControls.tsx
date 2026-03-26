import React from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';
import type { SimulationSpeed } from '../../engine/simulation';

const SPEEDS: { value: SimulationSpeed; label: string }[] = [
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 5, label: '5x' },
  { value: 10, label: '10x' },
  { value: 100, label: '100x' },
];

export function SimulationControls() {
  const { isPaused, speed, play, pause, step, setSpeed, reset } = useSimulationStore();

  return (
    <div className="flex items-center gap-3">
      {/* Play / Pause */}
      <button
        onClick={isPaused ? play : pause}
        className="eis-btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3"
        title={isPaused ? 'Play' : 'Pause'}
      >
        {isPaused ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
          </svg>
        )}
        {isPaused ? 'Play' : 'Pause'}
      </button>

      {/* Step */}
      <button onClick={step} className="eis-btn-secondary text-sm py-1.5 px-3" title="Step (single tick)">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M3 4.25a.75.75 0 011.26-.55l5.25 4.75a.75.75 0 010 1.1L4.26 14.3A.75.75 0 013 13.75V4.25zM13.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
        </svg>
      </button>

      {/* Speed */}
      <div className="flex items-center gap-1 bg-eis-bg rounded-md px-1">
        {SPEEDS.map(s => (
          <button
            key={s.value}
            onClick={() => setSpeed(s.value)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              speed === s.value
                ? 'bg-eis-green text-eis-bg font-bold'
                : 'text-eis-text-secondary hover:text-eis-text'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Reset */}
      <button onClick={reset} className="eis-btn-danger text-sm py-1.5 px-3" title="Reset simulation">
        Reset
      </button>
    </div>
  );
}
