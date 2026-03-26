import React from 'react';
import { useWorldEditorStore } from '../../hooks/useWorldEditor';
import { useSimulationStore } from '../../hooks/useSimulation';
import { BIOME_LABELS, BIOME_COLORS, OBJECT_CATEGORY_LABELS } from '../../engine/world-map-types';
import { OBJECT_CATALOG } from '../../engine/object-catalog';
import { getFactionColor } from '../../engine/world';
import { LocationEditor } from './LocationEditor';
import { BehaviorLegend } from './BehaviorOverlay';
import type { NPC } from '../../engine/types';

/**
 * Right-side properties panel that shows details for the currently selected
 * tile, object, location, or NPC.
 */
export function PropertiesPanel() {
  const { worldMap, editor } = useWorldEditorStore();
  const { world } = useSimulationStore();

  if (!worldMap) return null;

  // Priority: location > object > NPC > tile
  if (editor.selectedLocationId) {
    return (
      <div className="eis-card p-3">
        <LocationEditor />
      </div>
    );
  }

  if (editor.selectedObjectId) {
    const obj = worldMap.objects.find(o => o.id === editor.selectedObjectId);
    if (obj) return <ObjectProperties obj={obj} />;
  }

  if (editor.selectedNpcId && world) {
    const npc = world.npcs.find(n => n.id === editor.selectedNpcId);
    if (npc) return <NPCProperties npc={npc} />;
  }

  if (editor.selectedTile) {
    const tile = worldMap.tiles[editor.selectedTile.y]?.[editor.selectedTile.x];
    if (tile) return <TileProperties tile={tile} />;
  }

  return (
    <div className="eis-card p-3">
      <p className="text-xs text-eis-text-muted text-center py-4">
        Click on the map to select a tile, object, location, or NPC
      </p>
      <div className="mt-4">
        <p className="text-[10px] text-eis-text-muted uppercase tracking-wider mb-2">Legend</p>
        <BehaviorLegend />
      </div>
      <div className="mt-4">
        <p className="text-[10px] text-eis-text-muted uppercase tracking-wider mb-2">Stats</p>
        <div className="space-y-1 text-[10px] text-eis-text-secondary">
          <p>Tiles: {worldMap.config.width}x{worldMap.config.height}</p>
          <p>Locations: {worldMap.locations.length}</p>
          <p>Objects: {worldMap.objects.length}</p>
          <p>Paths: {worldMap.paths.length}</p>
          {world && <p>NPCs: {world.npcs.length}</p>}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-[10px] text-eis-text-muted uppercase tracking-wider mb-2">Keyboard Shortcuts</p>
        <div className="space-y-0.5 text-[10px] text-eis-text-secondary">
          <p><kbd className="px-1 bg-eis-bg rounded">S</kbd> Select</p>
          <p><kbd className="px-1 bg-eis-bg rounded">B</kbd> Paint Biome</p>
          <p><kbd className="px-1 bg-eis-bg rounded">O</kbd> Place Object</p>
          <p><kbd className="px-1 bg-eis-bg rounded">L</kbd> Create Location</p>
          <p><kbd className="px-1 bg-eis-bg rounded">E</kbd> Erase</p>
          <p><kbd className="px-1 bg-eis-bg rounded">F</kbd> Faction Paint</p>
          <p><kbd className="px-1 bg-eis-bg rounded">Space</kbd> Play/Pause</p>
          <p><kbd className="px-1 bg-eis-bg rounded">[ ]</kbd> Brush Size</p>
          <p><kbd className="px-1 bg-eis-bg rounded">Scroll</kbd> Zoom</p>
          <p><kbd className="px-1 bg-eis-bg rounded">Alt+Drag</kbd> Pan</p>
        </div>
      </div>
    </div>
  );
}

function TileProperties({ tile }: { tile: import('../../engine/world-map-types').WorldTile }) {
  const { worldMap } = useWorldEditorStore();
  const location = worldMap?.locations.find(l => l.id === tile.locationId);
  const obj = worldMap?.objects.find(o => o.id === tile.objectId);

  return (
    <div className="eis-card p-3 space-y-3">
      <h3 className="text-sm font-medium text-eis-text">Tile Properties</h3>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-eis-text-muted">Position</label>
          <p className="text-xs text-eis-text">{tile.x}, {tile.y}</p>
        </div>
        <div>
          <label className="text-[10px] text-eis-text-muted">Biome</label>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: BIOME_COLORS[tile.biome] }} />
            <p className="text-xs text-eis-text">{BIOME_LABELS[tile.biome]}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-eis-text-muted">Elevation</label>
          <div className="mt-0.5">
            <div className="h-1.5 bg-eis-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-eis-green rounded-full"
                style={{ width: `${tile.elevation * 100}%` }}
              />
            </div>
            <p className="text-[9px] text-eis-text-muted mt-0.5">{(tile.elevation * 100).toFixed(0)}%</p>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-eis-text-muted">Moisture</label>
          <div className="mt-0.5">
            <div className="h-1.5 bg-eis-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${tile.moisture * 100}%` }}
              />
            </div>
            <p className="text-[9px] text-eis-text-muted mt-0.5">{(tile.moisture * 100).toFixed(0)}%</p>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-eis-text-muted">Temperature</label>
          <div className="mt-0.5">
            <div className="h-1.5 bg-eis-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full"
                style={{ width: `${(tile.temperature + 1) * 50}%` }}
              />
            </div>
            <p className="text-[9px] text-eis-text-muted mt-0.5">{tile.temperature.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-eis-text-muted">Passable</label>
          <p className={`text-xs ${tile.isPassable ? 'text-eis-green' : 'text-eis-danger'}`}>
            {tile.isPassable ? 'Yes' : 'No'}
          </p>
        </div>
        {tile.factionControl && (
          <div>
            <label className="text-[10px] text-eis-text-muted">Faction</label>
            <p className="text-xs" style={{ color: getFactionColor(tile.factionControl) }}>
              {tile.factionControl}
            </p>
          </div>
        )}
      </div>

      {location && (
        <div className="pt-2 border-t border-eis-border">
          <label className="text-[10px] text-eis-text-muted">Location</label>
          <p className="text-xs text-eis-text">{location.name} ({location.type})</p>
        </div>
      )}

      {obj && (
        <div className="pt-2 border-t border-eis-border">
          <label className="text-[10px] text-eis-text-muted">Object</label>
          <div className="flex items-center gap-1">
            <span>{obj.icon}</span>
            <p className="text-xs text-eis-text">{obj.name}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ObjectProperties({ obj }: { obj: import('../../engine/world-map-types').WorldObject }) {
  const { updateObject, deleteObject } = useWorldEditorStore();
  const { world } = useSimulationStore();

  const users = obj.currentUsers.map(id =>
    world?.npcs.find(n => n.id === id)
  ).filter(Boolean);

  return (
    <div className="eis-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{obj.icon}</span>
          <div>
            <h3 className="text-sm font-medium text-eis-text">{obj.name}</h3>
            <p className="text-[10px] text-eis-text-muted">
              {OBJECT_CATEGORY_LABELS[obj.category] ?? obj.category}
            </p>
          </div>
        </div>
        <button
          onClick={() => deleteObject(obj.id)}
          className="text-xs text-eis-danger hover:text-red-400"
        >
          Delete
        </button>
      </div>

      {/* Position */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-eis-text-muted">Position</label>
          <p className="text-xs text-eis-text">{obj.x}, {obj.y}</p>
        </div>
        {obj.factionOwner && (
          <div>
            <label className="text-[10px] text-eis-text-muted">Faction</label>
            <p className="text-xs" style={{ color: getFactionColor(obj.factionOwner) }}>
              {obj.factionOwner}
            </p>
          </div>
        )}
      </div>

      {/* Durability */}
      <div>
        <label className="text-[10px] text-eis-text-muted">Durability</label>
        <div className="flex items-center gap-2 mt-0.5">
          <div className="flex-1 h-1.5 bg-eis-bg rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                obj.durability > 60 ? 'bg-eis-green' : obj.durability > 30 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${obj.durability}%` }}
            />
          </div>
          <span className="text-[10px] text-eis-text-muted">{obj.durability}%</span>
        </div>
      </div>

      {/* Capacity */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-eis-text-muted">Capacity</label>
          <p className="text-xs text-eis-text">{obj.currentUsers.length}/{obj.capacity}</p>
        </div>
        <div>
          <label className="text-[10px] text-eis-text-muted">Cooldown</label>
          <p className="text-xs text-eis-text">{obj.cooldownTicks} ticks</p>
        </div>
      </div>

      {/* Satisfies */}
      {obj.satisfiesNeed && (
        <div>
          <label className="text-[10px] text-eis-text-muted">Satisfies Need</label>
          <p className="text-xs text-eis-green">{obj.satisfiesNeed} (-{obj.needSatisfactionAmount})</p>
        </div>
      )}

      {/* Current Users */}
      {users.length > 0 && (
        <div>
          <label className="text-[10px] text-eis-text-muted uppercase tracking-wider">Current Users</label>
          <div className="mt-1 space-y-0.5">
            {users.map(npc => npc && (
              <p key={npc.id} className="text-[10px] text-eis-text-secondary">
                {npc.name} — {npc.currentBehavior ?? 'Idle'}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Interactions */}
      <div>
        <label className="text-[10px] text-eis-text-muted uppercase tracking-wider">Interactions</label>
        <div className="mt-1 space-y-1.5">
          {obj.interactions.map((inter, i) => (
            <div key={i} className="p-1.5 bg-eis-bg rounded">
              <p className="text-xs font-medium text-eis-text">{inter.name}</p>
              <p className="text-[10px] text-eis-text-muted">Duration: {inter.duration} ticks</p>
              {Object.keys(inter.needsAffected).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {Object.entries(inter.needsAffected).map(([key, val]) => (
                    <span
                      key={key}
                      className={`text-[9px] px-1 rounded ${val < 0 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}
                    >
                      {key}: {val > 0 ? '+' : ''}{val}
                    </span>
                  ))}
                </div>
              )}
              {inter.skillGain && Object.keys(inter.skillGain).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {Object.entries(inter.skillGain).map(([key, val]) => (
                    <span key={key} className="text-[9px] px-1 rounded bg-blue-900/30 text-blue-400">
                      +{val} {key}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NPCProperties({ npc }: { npc: NPC }) {
  const { worldMap } = useWorldEditorStore();

  const locState = worldMap?.npcLocations.get(npc.id);
  const targetObj = locState?.targetObjectId
    ? worldMap?.objects.find(o => o.id === locState.targetObjectId)
    : null;

  const needEntries = Object.entries(npc.needs)
    .filter(([, v]) => typeof v === 'number')
    .sort(([, a], [, b]) => (b as number) - (a as number));

  return (
    <div className="eis-card p-3 space-y-3">
      <h3 className="text-sm font-medium text-eis-text">{npc.name}</h3>
      <p className="text-[10px] text-eis-text-muted">{npc.species} | {npc.age} | {npc.gender}</p>

      {/* Current Behavior */}
      <div>
        <label className="text-[10px] text-eis-text-muted uppercase tracking-wider">Current Behavior</label>
        <p className="text-xs text-eis-green">{npc.currentBehavior ?? 'Idle'}</p>
        {targetObj && (
          <p className="text-[10px] text-eis-text-muted">
            Target: {targetObj.icon} {targetObj.name}
          </p>
        )}
        {locState?.isInteracting && (
          <p className="text-[10px] text-eis-green">Interacting...</p>
        )}
        {locState && locState.path.length > 0 && !locState.isInteracting && (
          <p className="text-[10px] text-blue-400">
            Moving ({locState.pathIndex}/{locState.path.length} steps)
          </p>
        )}
      </div>

      {/* Position */}
      <div>
        <label className="text-[10px] text-eis-text-muted">Position</label>
        <p className="text-xs text-eis-text">
          {npc.position.x.toFixed(1)}, {npc.position.y.toFixed(1)}
        </p>
      </div>

      {/* Needs */}
      <div>
        <label className="text-[10px] text-eis-text-muted uppercase tracking-wider">Needs</label>
        <div className="mt-1 space-y-1">
          {needEntries.map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] text-eis-text-secondary w-24 truncate">{key}</span>
              <div className="flex-1 h-1.5 bg-eis-bg rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    (val as number) > 70 ? 'bg-red-500' : (val as number) > 40 ? 'bg-yellow-500' : 'bg-eis-green'
                  }`}
                  style={{ width: `${val}%` }}
                />
              </div>
              <span className="text-[9px] text-eis-text-muted w-8 text-right">{(val as number).toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Emotional State */}
      <div>
        <label className="text-[10px] text-eis-text-muted">Emotional State</label>
        <p className="text-xs text-eis-text">{npc.emotionalState}</p>
      </div>

      {/* Roles */}
      {npc.assignedRoles.length > 0 && (
        <div>
          <label className="text-[10px] text-eis-text-muted">Roles</label>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {npc.assignedRoles.map(r => (
              <span key={r} className="text-[10px] px-1.5 py-0.5 bg-eis-bg rounded text-eis-text-secondary">{r}</span>
            ))}
          </div>
        </div>
      )}

      {/* Attributes (compact) */}
      <div>
        <label className="text-[10px] text-eis-text-muted uppercase tracking-wider">Attributes</label>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-1">
          {Object.entries(npc.attributes).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between text-[10px]">
              <span className="text-eis-text-secondary">{key.slice(0, 3).toUpperCase()}</span>
              <span className="text-eis-text">{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
