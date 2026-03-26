import React, { useMemo } from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';
import type { TensionInstance } from '../../engine/types';

/**
 * Tension overlay panel. Meant to be displayed alongside the WorldMap.
 * Shows active tensions with their levels and participants.
 * The WorldMap canvas can render pulsing circles based on this data.
 */

function TensionBar({ tension, world }: { tension: TensionInstance; world: { npcs: { id: string; name: string }[] } }) {
  const participants = tension.participants.map(pid => {
    const npc = world.npcs.find(n => n.id === pid);
    return npc?.name ?? pid;
  });

  const level = Math.round(tension.tensionLevel);
  const barColor =
    level >= 80 ? 'bg-red-500' :
    level >= 60 ? 'bg-orange-500' :
    level >= 40 ? 'bg-yellow-500' :
    'bg-blue-500';

  const statusLabel: Record<string, string> = {
    building: 'BUILDING',
    peaked: 'CONFRONTATION',
    resolved_peaceful: 'RESOLVED',
    resolved_combat: 'EXPLODED',
    dispersed: 'DISPERSED',
  };

  const statusColor: Record<string, string> = {
    building: 'text-yellow-400',
    peaked: 'text-red-400',
    resolved_peaceful: 'text-green-400',
    resolved_combat: 'text-red-500',
    dispersed: 'text-eis-text-muted',
  };

  return (
    <div className="eis-card py-2 px-3 mb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-eis-text font-medium">
          {participants.join(' vs ')}
        </span>
        <span className={`text-xs font-mono uppercase ${statusColor[tension.status] ?? 'text-eis-text-muted'}`}>
          {statusLabel[tension.status] ?? tension.status}
        </span>
      </div>

      {/* Tension meter */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-3 bg-eis-bg rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-500 ${level >= 70 ? 'animate-pulse' : ''}`}
            style={{ width: `${level}%` }}
          />
        </div>
        <span className="text-xs text-eis-text-muted w-8 text-right">{level}%</span>
      </div>

      {/* Triggers and factors */}
      {tension.triggers.length > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {tension.triggers.map(trigger => (
            <span key={trigger} className="text-[10px] px-1.5 py-0.5 bg-eis-bg rounded text-eis-text-muted">
              {trigger.replace('_', ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Escalation rate indicator */}
      <div className="flex items-center gap-2 mt-1 text-[10px]">
        <span className="text-red-400">+{tension.escalationRate.toFixed(1)}/tick</span>
        <span className="text-green-400">-{tension.deescalationRate.toFixed(1)}/tick</span>
        {level >= 70 && <span className="text-red-400 font-bold ml-auto">COMBAT LIKELY</span>}
      </div>
    </div>
  );
}

export function TensionOverlay() {
  const { world, tickCounter } = useSimulationStore();

  const activeTensions = useMemo(() => {
    if (!world) return [];
    return (world.activeTensions ?? []).filter(
      t => t.status === 'building' || t.status === 'peaked',
    );
  }, [world, tickCounter]);

  const recentResolved = useMemo(() => {
    if (!world) return [];
    return (world.activeTensions ?? []).filter(
      t => t.status !== 'building' && t.status !== 'peaked',
    ).slice(-5);
  }, [world, tickCounter]);

  const tensionEvents = useMemo(() => {
    if (!world) return [];
    return world.eventLog
      .filter(e =>
        e.type === 'tension_building' ||
        e.type === 'tension_peaked' ||
        e.type === 'tension_combat' ||
        e.type === 'tension_resolved' ||
        e.type === 'tension_dispersed',
      )
      .slice(-20);
  }, [world, tickCounter]);

  if (!world) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-eis-text">Tensions & Standoffs</h2>

      {/* Active tensions */}
      {activeTensions.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-orange-400 mb-2 uppercase tracking-wider">
            Active Standoffs ({activeTensions.length})
          </h3>
          {activeTensions.map(tension => (
            <TensionBar key={tension.id} tension={tension} world={world} />
          ))}
        </div>
      ) : (
        <div className="eis-card text-center text-eis-text-muted py-8">
          No active tensions. Relations are stable... for now.
        </div>
      )}

      {/* Recent resolved */}
      {recentResolved.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-eis-text-secondary mb-2 uppercase tracking-wider">
            Recently Resolved
          </h3>
          {recentResolved.map(tension => (
            <TensionBar key={tension.id} tension={tension} world={world} />
          ))}
        </div>
      )}

      {/* Event timeline */}
      <div>
        <h3 className="text-sm font-semibold text-eis-text-secondary mb-2 uppercase tracking-wider">
          Tension Events
        </h3>
        <div className="eis-card max-h-64 overflow-y-auto space-y-1">
          {tensionEvents.length === 0 ? (
            <p className="text-eis-text-muted text-sm">No tension events yet.</p>
          ) : (
            tensionEvents.map(event => (
              <div key={event.id} className="flex items-start gap-2 text-xs py-1 border-b border-eis-border/30">
                <span className="text-eis-text-muted w-14 shrink-0">T{event.tick}</span>
                <span className={`w-16 shrink-0 font-mono uppercase ${
                  event.type === 'tension_combat' ? 'text-red-500' :
                  event.type === 'tension_peaked' ? 'text-orange-400' :
                  event.type === 'tension_resolved' ? 'text-green-400' :
                  event.type === 'tension_dispersed' ? 'text-blue-400' :
                  'text-yellow-400'
                }`}>
                  {event.type.replace('tension_', '')}
                </span>
                <span className="text-eis-text-secondary flex-1">{event.description}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Data for the WorldMap canvas to render tension indicators.
 * Call from the WorldMap draw function.
 */
export function getTensionOverlayData(world: {
  activeTensions?: TensionInstance[];
}): { x: number; y: number; level: number; status: string }[] {
  if (!world.activeTensions) return [];
  return world.activeTensions
    .filter(t => t.status === 'building' || t.status === 'peaked')
    .map(t => ({
      x: t.location.x,
      y: t.location.y,
      level: t.tensionLevel,
      status: t.status,
    }));
}
