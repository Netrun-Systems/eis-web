import React, { useMemo } from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';
import { getWorldTimeString, getFactionColor } from '../../engine/world';
import { Link } from 'react-router-dom';

export function Dashboard() {
  const { world, isPaused, tickCounter } = useSimulationStore();
  const stats = useSimulationStore(s => s.simulation.getStats());

  const factionCounts = useMemo(() => {
    if (!world) return [];
    const counts = new Map<string, number>();
    for (const npc of world.npcs) {
      for (const g of npc.groupAffiliations) {
        const faction = world.factions.find(f => String(f.id) === g || f.name === g);
        const name = faction?.name ?? g;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort(([, a], [, b]) => b - a);
  }, [world?.npcs.length, tickCounter]);

  const emotionCounts = useMemo(() => {
    if (!world) return [];
    const counts = new Map<string, number>();
    for (const npc of world.npcs) {
      counts.set(npc.emotionalState, (counts.get(npc.emotionalState) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort(([, a], [, b]) => b - a);
  }, [tickCounter]);

  const recentEvents = useMemo(() => {
    if (!world) return [];
    return world.eventLog.slice(-10).reverse();
  }, [world?.eventLog.length, tickCounter]);

  if (!world) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Stats Row */}
      <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <StatCard label="World Time" value={getWorldTimeString(world)} />
        <StatCard label="NPCs" value={stats?.npcCount ?? 0} />
        <StatCard label="Factions" value={stats?.factionCount ?? 0} />
        <StatCard label="Active Quests" value={stats?.activeQuests ?? 0} />
        <StatCard label="Completed Quests" value={stats?.completedQuests ?? 0} />
        <StatCard label="Total Events" value={stats?.totalEvents ?? 0} />
      </div>

      {/* Faction Distribution */}
      <div className="eis-card">
        <h3 className="text-sm font-medium text-eis-text-secondary mb-3">Faction Distribution</h3>
        <div className="space-y-2">
          {factionCounts.map(([name, count]) => {
            const pct = (count / world.npcs.length) * 100;
            return (
              <div key={name}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-eis-text truncate">{name}</span>
                  <span className="text-eis-text-muted">{count}</span>
                </div>
                <div className="h-2 bg-eis-bg rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, backgroundColor: getFactionColor(name) }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Emotional State */}
      <div className="eis-card">
        <h3 className="text-sm font-medium text-eis-text-secondary mb-3">Emotional State Overview</h3>
        <div className="space-y-2">
          {emotionCounts.map(([emotion, count]) => (
            <div key={emotion} className="flex justify-between items-center text-sm">
              <span className="text-eis-text">{emotion}</span>
              <span className="eis-badge bg-eis-bg">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Events */}
      <div className="eis-card">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium text-eis-text-secondary">Recent Events</h3>
          <Link to="/log" className="text-xs text-eis-green hover:underline">View All</Link>
        </div>
        <div className="space-y-1.5">
          {recentEvents.length === 0 ? (
            <p className="text-eis-text-muted text-sm text-center py-4">
              No events yet
            </p>
          ) : (
            recentEvents.map((event, i) => (
              <div key={event.id || i} className="text-xs border-l-2 border-eis-green/30 pl-2 py-0.5">
                <span className="text-eis-text">{event.description}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickLink to="/npcs" label="Browse NPCs" desc={`${world.npcs.length} characters`} />
        <QuickLink to="/map" label="World Map" desc="View NPC positions" />
        <QuickLink to="/relationships" label="Relationship Graph" desc="Social network" />
        <QuickLink to="/csv" label="CSV Editor" desc="Edit simulation data" />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="eis-card">
      <p className="text-xs text-eis-text-muted">{label}</p>
      <p className="text-lg font-bold text-eis-text mt-0.5">{value}</p>
    </div>
  );
}

function QuickLink({ to, label, desc }: { to: string; label: string; desc: string }) {
  return (
    <Link to={to} className="eis-card hover:border-eis-green/50 transition-colors group">
      <p className="text-sm font-medium text-eis-text group-hover:text-eis-green">{label}</p>
      <p className="text-xs text-eis-text-muted mt-0.5">{desc}</p>
    </Link>
  );
}
