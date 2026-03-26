import React, { useState } from 'react';
import { useWorldEditorStore } from '../../hooks/useWorldEditor';
import { useSimulationStore } from '../../hooks/useSimulation';
import { LOCATION_TYPE_ICONS } from '../../engine/world-map-types';
import type { LocationType, WorldLocation } from '../../engine/world-map-types';
import { getFactionColor } from '../../engine/world';

const LOCATION_TYPES: LocationType[] = [
  'settlement', 'camp', 'market', 'farm', 'mine',
  'forest_clearing', 'ruins', 'shrine', 'watchtower', 'harbor',
  'workshop', 'tavern', 'training_ground', 'library', 'barracks',
];

export function LocationEditor() {
  const { worldMap, editor, updateLocation, deleteLocation } = useWorldEditorStore();
  const { world } = useSimulationStore();

  const location = worldMap?.locations.find(l => l.id === editor.selectedLocationId);
  if (!location) return <EmptyLocationState />;

  const npcsHere = world?.npcs.filter(n => {
    const dx = n.position.x - location.x;
    const dy = n.position.y - location.y;
    return Math.sqrt(dx * dx + dy * dy) <= location.radius + 1;
  }) ?? [];

  const objectsHere = worldMap?.objects.filter(o => {
    const dx = o.x - location.x;
    const dy = o.y - location.y;
    return Math.sqrt(dx * dx + dy * dy) <= location.radius + 1;
  }) ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-eis-text">Location</h3>
        <button
          onClick={() => deleteLocation(location.id)}
          className="text-xs text-eis-danger hover:text-red-400"
        >
          Delete
        </button>
      </div>

      {/* Name */}
      <div>
        <label className="text-[10px] text-eis-text-muted uppercase tracking-wider">Name</label>
        <input
          type="text"
          value={location.name}
          onChange={e => updateLocation(location.id, { name: e.target.value })}
          className="w-full mt-0.5 px-2 py-1 text-sm bg-eis-bg border border-eis-border rounded text-eis-text focus:border-eis-green focus:outline-none"
        />
      </div>

      {/* Type */}
      <div>
        <label className="text-[10px] text-eis-text-muted uppercase tracking-wider">Type</label>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {LOCATION_TYPES.map(type => (
            <button
              key={type}
              onClick={() => updateLocation(location.id, { type })}
              className={`flex items-center gap-1 px-1.5 py-1 text-[10px] rounded border ${
                location.type === type
                  ? 'border-eis-green bg-eis-green/10 text-eis-green'
                  : 'border-eis-border text-eis-text-secondary hover:bg-eis-bg-hover'
              }`}
            >
              <span>{LOCATION_TYPE_ICONS[type]}</span>
              <span className="truncate">{type.replace(/_/g, ' ')}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Position & Radius */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-eis-text-muted">X</label>
          <p className="text-xs text-eis-text">{location.x}</p>
        </div>
        <div>
          <label className="text-[10px] text-eis-text-muted">Y</label>
          <p className="text-xs text-eis-text">{location.y}</p>
        </div>
        <div>
          <label className="text-[10px] text-eis-text-muted">Radius</label>
          <input
            type="number"
            value={location.radius}
            onChange={e => updateLocation(location.id, { radius: parseInt(e.target.value) || 2 })}
            min={1}
            max={10}
            className="w-full px-1 py-0.5 text-xs bg-eis-bg border border-eis-border rounded text-eis-text"
          />
        </div>
      </div>

      {/* Faction */}
      <div>
        <label className="text-[10px] text-eis-text-muted uppercase tracking-wider">Faction</label>
        <div className="flex flex-wrap gap-1 mt-1">
          <button
            onClick={() => updateLocation(location.id, { faction: undefined })}
            className={`px-2 py-0.5 text-[10px] rounded ${
              !location.faction ? 'bg-eis-bg-hover text-eis-text' : 'text-eis-text-muted'
            }`}
          >
            None
          </button>
          {world?.factions.map(f => (
            <button
              key={f.id}
              onClick={() => updateLocation(location.id, { faction: f.name })}
              className={`px-2 py-0.5 text-[10px] rounded flex items-center gap-1 ${
                location.faction === f.name ? 'ring-1 ring-white' : ''
              }`}
              style={{ backgroundColor: getFactionColor(f.name) + '40', color: getFactionColor(f.name) }}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>

      {/* Capacity */}
      <div>
        <label className="text-[10px] text-eis-text-muted uppercase tracking-wider">NPC Capacity</label>
        <input
          type="number"
          value={location.npcCapacity}
          onChange={e => updateLocation(location.id, { npcCapacity: parseInt(e.target.value) || 5 })}
          min={1}
          max={50}
          className="w-full mt-0.5 px-2 py-1 text-xs bg-eis-bg border border-eis-border rounded text-eis-text"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-eis-text-muted">Comfort</label>
          <p className="text-xs text-eis-text">{location.comfortModifier > 0 ? '+' : ''}{location.comfortModifier}</p>
        </div>
        <div>
          <label className="text-[10px] text-eis-text-muted">Scarcity</label>
          <p className="text-xs text-eis-text">{(location.resourceScarcity * 100).toFixed(0)}%</p>
        </div>
      </div>

      {/* Resources */}
      {Object.keys(location.resources).length > 0 && (
        <div>
          <label className="text-[10px] text-eis-text-muted uppercase tracking-wider">Resources</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {Object.entries(location.resources).map(([key, val]) => (
              <div key={key} className="text-[10px] text-eis-text-secondary">
                <span className="text-eis-text">{val}</span> {key}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NPCs Present */}
      <div>
        <label className="text-[10px] text-eis-text-muted uppercase tracking-wider">
          NPCs ({npcsHere.length}/{location.npcCapacity})
        </label>
        <div className="mt-1 max-h-32 overflow-y-auto space-y-0.5">
          {npcsHere.length === 0 && (
            <p className="text-[10px] text-eis-text-muted italic">No NPCs present</p>
          )}
          {npcsHere.map(npc => (
            <div key={npc.id} className="flex items-center gap-1.5 text-[10px] text-eis-text-secondary">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getFactionColor(npc.groupAffiliations[0] ?? '') }} />
              <span className="text-eis-text">{npc.name}</span>
              <span className="text-eis-text-muted">— {npc.currentBehavior ?? 'Idle'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Objects Here */}
      <div>
        <label className="text-[10px] text-eis-text-muted uppercase tracking-wider">
          Objects ({objectsHere.length})
        </label>
        <div className="mt-1 max-h-24 overflow-y-auto space-y-0.5">
          {objectsHere.map(obj => (
            <div key={obj.id} className="flex items-center gap-1 text-[10px] text-eis-text-secondary">
              <span>{obj.icon}</span>
              <span>{obj.name}</span>
              {obj.currentUsers.length > 0 && (
                <span className="text-eis-green">({obj.currentUsers.length} using)</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyLocationState() {
  return (
    <div className="text-center py-4">
      <p className="text-xs text-eis-text-muted">No location selected</p>
      <p className="text-[10px] text-eis-text-muted mt-1">Use the Location tool (L) to create one</p>
    </div>
  );
}
