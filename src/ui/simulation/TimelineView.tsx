import React, { useMemo } from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';

export function TimelineView() {
  const { world } = useSimulationStore();

  const dayEvents = useMemo(() => {
    if (!world) return [];
    const grouped = new Map<number, typeof world.eventLog>();
    for (const event of world.eventLog) {
      const day = Math.floor(event.gameTime / 24) + 1;
      if (!grouped.has(day)) grouped.set(day, []);
      grouped.get(day)!.push(event);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => b - a);
  }, [world?.eventLog.length]);

  if (!world) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-eis-text">Timeline</h2>

      {dayEvents.length === 0 ? (
        <div className="eis-card text-center text-eis-text-muted py-8">
          No events yet. Start the simulation to see the timeline.
        </div>
      ) : (
        <div className="space-y-6">
          {dayEvents.map(([day, events]) => (
            <div key={day} className="relative">
              {/* Day header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-eis-green/20 flex items-center justify-center">
                  <span className="text-eis-green font-bold text-sm">{day}</span>
                </div>
                <div>
                  <h3 className="text-eis-text font-medium">Day {day}</h3>
                  <p className="text-xs text-eis-text-muted">{events.length} events</p>
                </div>
              </div>

              {/* Events */}
              <div className="ml-5 border-l-2 border-eis-border pl-6 space-y-1">
                {events.slice(0, 20).map((event, i) => (
                  <div key={event.id || i} className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-eis-green mt-1.5 shrink-0" />
                    <div>
                      <span className="text-eis-text-muted font-mono text-xs">
                        {Math.floor(event.gameTime % 24)}:00
                      </span>
                      <span className="text-eis-text ml-2">{event.description}</span>
                    </div>
                  </div>
                ))}
                {events.length > 20 && (
                  <p className="text-eis-text-muted text-xs ml-5">
                    ...and {events.length - 20} more events
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
