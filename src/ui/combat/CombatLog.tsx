import React, { useMemo } from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';
import type { CombatInstance, CombatLogEntry, NPC } from '../../engine/types';

function HealthBar({ current, max, label }: { current: number; max: number; label: string }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const color = pct > 60 ? 'bg-green-500' : pct > 30 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-eis-text-secondary w-20 truncate">{label}</span>
      <div className="flex-1 h-3 bg-eis-bg rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-eis-text-muted w-12 text-right">
        {Math.round(current)}/{Math.round(max)}
      </span>
    </div>
  );
}

function CombatCard({ combat, npcs }: { combat: CombatInstance; npcs: NPC[] }) {
  const attacker = npcs.find(n => n.id === combat.attackerId);
  const defender = npcs.find(n => n.id === combat.defenderId);

  if (!attacker || !defender) return null;

  const statusColors: Record<string, string> = {
    engaging: 'text-yellow-400',
    fighting: 'text-red-400',
    resolved: 'text-green-400',
    fled: 'text-blue-400',
  };

  return (
    <div className="eis-card mb-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-eis-text">
          {attacker.name} vs {defender.name}
        </h3>
        <span className={`text-xs font-mono uppercase ${statusColors[combat.status] ?? 'text-eis-text-muted'}`}>
          {combat.status} (Round {combat.round})
        </span>
      </div>

      {/* Health bars */}
      <div className="space-y-1 mb-3">
        <HealthBar current={attacker.currentHealth} max={attacker.maxHealth} label={attacker.name} />
        <HealthBar current={defender.currentHealth} max={defender.maxHealth} label={defender.name} />
      </div>

      {/* Combat log entries */}
      <div className="max-h-48 overflow-y-auto space-y-1">
        {combat.combatLog.slice(-10).map((entry, i) => (
          <CombatLogLine key={i} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function CombatLogLine({ entry }: { entry: CombatLogEntry }) {
  const actionColors: Record<string, string> = {
    attack: 'text-red-400',
    defend: 'text-blue-400',
    dodge: 'text-cyan-400',
    flee: 'text-yellow-400',
    surrender: 'text-purple-400',
    special: 'text-orange-400',
  };

  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-eis-text-muted w-8 shrink-0">R{entry.round}</span>
      <span className={`w-16 shrink-0 uppercase font-mono ${actionColors[entry.action] ?? 'text-eis-text-muted'}`}>
        {entry.action}
      </span>
      <span className="text-eis-text-secondary flex-1">{entry.description}</span>
      {entry.damage > 0 && (
        <span className="text-red-400 font-bold shrink-0">-{entry.damage}</span>
      )}
    </div>
  );
}

export function CombatLog() {
  const { world, tickCounter } = useSimulationStore();

  const activeCombats = useMemo(() => {
    if (!world) return [];
    return (world.activeCombats ?? []).filter(
      c => c.status === 'engaging' || c.status === 'fighting',
    );
  }, [world, tickCounter]);

  const recentCombats = useMemo(() => {
    if (!world) return [];
    return (world.activeCombats ?? []).filter(
      c => c.status === 'resolved' || c.status === 'fled',
    ).slice(-10);
  }, [world, tickCounter]);

  const combatEvents = useMemo(() => {
    if (!world) return [];
    return world.eventLog
      .filter(e =>
        e.type === 'combat_start' ||
        e.type === 'combat_end' ||
        e.type === 'combat_flee' ||
        e.type === 'combat_death',
      )
      .slice(-30);
  }, [world, tickCounter]);

  if (!world) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-eis-text">Combat Log</h2>

      {/* Active combats */}
      {activeCombats.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-400 mb-2 uppercase tracking-wider">
            Active Combats ({activeCombats.length})
          </h3>
          {activeCombats.map(combat => (
            <CombatCard key={combat.id} combat={combat} npcs={world.npcs} />
          ))}
        </div>
      )}

      {activeCombats.length === 0 && (
        <div className="eis-card text-center text-eis-text-muted py-8">
          No active combats. The world is at peace... for now.
        </div>
      )}

      {/* Recent resolved combats */}
      {recentCombats.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-eis-text-secondary mb-2 uppercase tracking-wider">
            Recent Combats
          </h3>
          {recentCombats.map(combat => (
            <CombatCard key={combat.id} combat={combat} npcs={world.npcs} />
          ))}
        </div>
      )}

      {/* Combat event timeline */}
      <div>
        <h3 className="text-sm font-semibold text-eis-text-secondary mb-2 uppercase tracking-wider">
          Combat Events
        </h3>
        <div className="eis-card max-h-96 overflow-y-auto space-y-1">
          {combatEvents.length === 0 ? (
            <p className="text-eis-text-muted text-sm">No combat events recorded yet.</p>
          ) : (
            combatEvents.map(event => (
              <div key={event.id} className="flex items-start gap-2 text-xs py-1 border-b border-eis-border/30">
                <span className="text-eis-text-muted w-14 shrink-0">T{event.tick}</span>
                <span className={`w-20 shrink-0 font-mono uppercase ${
                  event.type === 'combat_death' ? 'text-red-500' :
                  event.type === 'combat_start' ? 'text-orange-400' :
                  event.type === 'combat_flee' ? 'text-yellow-400' :
                  'text-green-400'
                }`}>
                  {event.type.replace('combat_', '')}
                </span>
                <span className="text-eis-text-secondary flex-1">{event.description}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="eis-card text-center">
          <div className="text-2xl font-bold text-red-400">{activeCombats.length}</div>
          <div className="text-xs text-eis-text-muted">Active Fights</div>
        </div>
        <div className="eis-card text-center">
          <div className="text-2xl font-bold text-yellow-400">
            {(world.activeTensions ?? []).filter(t => t.status === 'building' || t.status === 'peaked').length}
          </div>
          <div className="text-xs text-eis-text-muted">Active Tensions</div>
        </div>
        <div className="eis-card text-center">
          <div className="text-2xl font-bold text-eis-text">
            {world.npcs.filter(n => n.isDowned).length}
          </div>
          <div className="text-xs text-eis-text-muted">NPCs Downed</div>
        </div>
      </div>
    </div>
  );
}
