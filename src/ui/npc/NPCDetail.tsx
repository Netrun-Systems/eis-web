import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSimulationStore } from '../../hooks/useSimulation';
import { getNPCById, getAllRelationshipsForNPC, getFactionForNPC, getFactionColor } from '../../engine/world';
import { PersonalityRadar } from './PersonalityRadar';
import { NPCEditor } from './NPCEditor';
import { NEED_KEYS, PERSONALITY_TRAIT_KEYS } from '../../engine/types';

export function NPCDetail() {
  const { id } = useParams<{ id: string }>();
  const { world, tickCounter } = useSimulationStore();

  if (!world || !id) return null;

  const npc = getNPCById(world, id);
  if (!npc) {
    return (
      <div className="eis-card text-center py-8">
        <p className="text-eis-text-secondary">NPC not found: {id}</p>
        <Link to="/npcs" className="text-eis-green hover:underline mt-2 inline-block">Back to NPC List</Link>
      </div>
    );
  }

  const faction = getFactionForNPC(world, npc);
  const relationships = getAllRelationshipsForNPC(world, npc.id);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/npcs" className="text-eis-text-secondary hover:text-eis-text">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-eis-text">{npc.name}</h2>
          <p className="text-sm text-eis-text-muted">{npc.species} | {npc.gender} | Age: {npc.age}</p>
        </div>
        {faction && (
          <span className="eis-badge ml-auto text-sm" style={{ backgroundColor: getFactionColor(faction.name) + '20', color: getFactionColor(faction.name) }}>
            {faction.name}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Personality Radar */}
        <div className="eis-card">
          <h3 className="text-sm font-medium text-eis-text-secondary mb-3">Personality Profile</h3>
          <PersonalityRadar personality={npc.personality} />
        </div>

        {/* Attributes */}
        <div className="eis-card">
          <h3 className="text-sm font-medium text-eis-text-secondary mb-3">Attributes</h3>
          <div className="space-y-2">
            {Object.entries(npc.attributes).map(([key, val]) => (
              <div key={key}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-eis-text capitalize">{key}</span>
                  <span className="text-eis-text-muted font-mono">{val}</span>
                </div>
                <div className="h-2 bg-eis-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-eis-green rounded-full transition-all"
                    style={{ width: `${(Number(val) / 10) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Needs */}
        <div className="eis-card">
          <h3 className="text-sm font-medium text-eis-text-secondary mb-3">Current Needs</h3>
          <div className="space-y-2">
            {NEED_KEYS.map(key => {
              const val = npc.needs[key] ?? 0;
              const color = val >= 80 ? 'bg-eis-danger' : val >= 50 ? 'bg-eis-warning' : 'bg-eis-green';
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-eis-text capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                    <span className="text-eis-text-muted font-mono">{Math.round(val)}</span>
                  </div>
                  <div className="h-2 bg-eis-bg rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${val}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status */}
        <div className="eis-card">
          <h3 className="text-sm font-medium text-eis-text-secondary mb-3">Status</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-eis-text-muted">Emotional State</dt>
              <dd className="text-eis-text font-medium">{npc.emotionalState}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-eis-text-muted">Current Behavior</dt>
              <dd className="text-eis-text">{npc.currentBehavior ?? 'Idle'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-eis-text-muted">Home</dt>
              <dd className="text-eis-text">{npc.homeLocation || 'None'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-eis-text-muted">Work</dt>
              <dd className="text-eis-text">{npc.workLocation || 'None'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-eis-text-muted">Awareness</dt>
              <dd className="text-eis-text">{npc.awarenessLevel}</dd>
            </div>
            <div>
              <dt className="text-eis-text-muted mb-1">Roles</dt>
              <dd className="flex flex-wrap gap-1">
                {npc.assignedRoles.map(r => (
                  <span key={r} className="eis-badge bg-eis-bg text-eis-text-secondary">{r}</span>
                ))}
              </dd>
            </div>
          </dl>
        </div>

        {/* Relationships */}
        <div className="eis-card">
          <h3 className="text-sm font-medium text-eis-text-secondary mb-3">
            Relationships ({relationships.length})
          </h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {relationships.length === 0 ? (
              <p className="text-eis-text-muted text-sm">No known relationships</p>
            ) : (
              relationships.sort((a, b) => b.trust - a.trust).map(rel => {
                const target = getNPCById(world, rel.targetId);
                const trustPct = (rel.trust / 10) * 100;
                const color = rel.trust >= 7 ? 'bg-eis-green' : rel.trust >= 4 ? 'bg-eis-warning' : 'bg-eis-danger';
                return (
                  <Link
                    key={rel.targetId}
                    to={`/npcs/${rel.targetId}`}
                    className="flex items-center gap-2 text-sm hover:bg-eis-bg-hover px-2 py-1 rounded"
                  >
                    <div className="flex-1">
                      <span className="text-eis-text">{target?.name ?? rel.targetId}</span>
                    </div>
                    <div className="w-20 h-1.5 bg-eis-bg rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full`} style={{ width: `${trustPct}%` }} />
                    </div>
                    <span className="text-xs text-eis-text-muted w-8 text-right">{rel.trust.toFixed(1)}</span>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Inventory & Knowledge */}
        <div className="eis-card">
          <h3 className="text-sm font-medium text-eis-text-secondary mb-3">Inventory & Knowledge</h3>
          <div className="mb-3">
            <p className="text-xs text-eis-text-muted mb-1">Inventory ({npc.inventory.length})</p>
            <div className="flex flex-wrap gap-1">
              {npc.inventory.map((item, i) => (
                <span key={i} className="eis-badge bg-eis-bg text-eis-text-secondary">{item}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-eis-text-muted mb-1">Knowledge ({npc.knowledgeBase.length})</p>
            <div className="flex flex-wrap gap-1">
              {npc.knowledgeBase.slice(0, 10).map((k, i) => (
                <span key={i} className="eis-badge bg-eis-bg text-eis-text-secondary text-xs">{k}</span>
              ))}
              {npc.knowledgeBase.length > 10 && (
                <span className="eis-badge bg-eis-bg text-eis-text-muted">+{npc.knowledgeBase.length - 10} more</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Editor */}
      <NPCEditor npc={npc} />
    </div>
  );
}
