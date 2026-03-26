import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';
import type { SimulationEventType } from '../../engine/types';

const EVENT_COLORS: Record<SimulationEventType, string> = {
  behavior: 'text-eis-green',
  trade: 'text-yellow-400',
  combat: 'text-red-400',
  combat_start: 'text-red-500',
  combat_round: 'text-red-300',
  combat_end: 'text-green-400',
  combat_flee: 'text-yellow-300',
  combat_death: 'text-red-600',
  tension_building: 'text-orange-300',
  tension_peaked: 'text-orange-500',
  tension_combat: 'text-red-500',
  tension_resolved: 'text-green-300',
  tension_dispersed: 'text-blue-300',
  trade_negotiation: 'text-yellow-300',
  trade_agreed: 'text-green-400',
  trade_failed: 'text-red-300',
  player_move: 'text-cyan-400',
  player_interact: 'text-cyan-300',
  player_dialogue: 'text-cyan-500',
  social: 'text-blue-400',
  quest: 'text-purple-400',
  emotion: 'text-pink-400',
  knowledge: 'text-cyan-400',
  faction: 'text-orange-400',
  need: 'text-amber-400',
  weather: 'text-sky-400',
  location: 'text-teal-400',
  system: 'text-eis-text-muted',
};

const EVENT_TYPES: SimulationEventType[] = [
  'behavior', 'trade', 'trade_negotiation', 'trade_agreed', 'trade_failed',
  'combat', 'combat_start', 'combat_round', 'combat_end', 'combat_flee', 'combat_death',
  'tension_building', 'tension_peaked', 'tension_combat', 'tension_resolved', 'tension_dispersed',
  'player_move', 'player_interact', 'player_dialogue',
  'social', 'quest', 'emotion', 'knowledge', 'faction', 'need', 'weather', 'location', 'system',
];

export function SimulationLog() {
  const { world } = useSimulationStore();
  const [filters, setFilters] = useState<Set<SimulationEventType>>(new Set(EVENT_TYPES));
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  const events = useMemo(() => {
    if (!world) return [];
    return world.eventLog
      .filter(e => filters.has(e.type))
      .slice(-500);
  }, [world?.eventLog.length, filters]);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events.length, autoScroll]);

  const toggleFilter = (type: SimulationEventType) => {
    setFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-eis-text">Event Log</h2>
        <label className="flex items-center gap-2 text-sm text-eis-text-secondary">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={e => setAutoScroll(e.target.checked)}
            className="rounded border-eis-border"
          />
          Auto-scroll
        </label>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {EVENT_TYPES.map(type => (
          <button
            key={type}
            onClick={() => toggleFilter(type)}
            className={`eis-badge cursor-pointer transition-opacity ${EVENT_COLORS[type]} ${
              filters.has(type) ? 'opacity-100 bg-eis-bg-hover' : 'opacity-40 bg-eis-bg'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Log */}
      <div ref={logRef} className="flex-1 overflow-auto eis-card font-mono text-xs space-y-0.5">
        {events.length === 0 ? (
          <p className="text-eis-text-muted p-4 text-center">No events yet. Start the simulation.</p>
        ) : (
          events.map((event, i) => (
            <div key={event.id || i} className="flex gap-2 py-0.5 hover:bg-eis-bg-hover px-2 rounded">
              <span className="text-eis-text-muted shrink-0 w-12">{String(event.tick).padStart(5, '0')}</span>
              <span className={`shrink-0 w-20 ${EVENT_COLORS[event.type]}`}>[{event.type}]</span>
              <span className="text-eis-text">{event.description}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
