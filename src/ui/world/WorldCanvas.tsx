// ============================================================
// EIS World Canvas — minimal editor page (WEB-002)
// Composes PixiWorldMap + PixiMinimap + useWorldEditor +
// useMapGestures with the existing editor tool shortcuts.
// Replaces the simulation-coupled PixiGameView (git history
// preserves it). Rebinding to real EISCORE data is WEB-010.
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWorldEditorStore } from '../../hooks/useWorldEditor';
import { useMapGestures } from '../../hooks/useMapGestures';
import { PixiWorldMap } from '../pixi/PixiWorldMap';
import { PixiMinimap } from '../pixi/PixiMinimap';
import { BottomActionBar } from '../touch/BottomActionBar';
import { BIOME_COLORS, BIOME_LABELS } from '../../engine/world-map-types';
import type { BiomeType, EditorTool, ObjectType } from '../../engine/world-map-types';
import { OBJECT_CATALOG } from '../../engine/object-catalog';
import { getFactionColor } from '../../engine/world';

// Editor keyboard shortcuts (carried over from PixiGameView)
const TOOL_KEYS: Record<string, EditorTool> = {
  s: 'select',
  b: 'paint_biome',
  o: 'place_object',
  l: 'create_location',
  e: 'erase',
  f: 'faction_paint',
  p: 'path',
  n: 'place_npc',
};

const TOOL_LABELS: Record<EditorTool, { label: string; key: string }> = {
  select: { label: 'Select', key: 'S' },
  paint_biome: { label: 'Biome', key: 'B' },
  place_object: { label: 'Object', key: 'O' },
  create_location: { label: 'Location', key: 'L' },
  place_npc: { label: 'NPC', key: 'N' },
  erase: { label: 'Erase', key: 'E' },
  path: { label: 'Path', key: 'P' },
  faction_paint: { label: 'Faction', key: 'F' },
};

const FACTIONS = ['Raiders', 'Remnants', 'Reclaimers', 'Villagers', 'Academy'];

export function WorldCanvas() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const {
    worldMap, editor, generateWorld, setTool, setCamera,
    setSelectedBiome, setBrushSize, setSelectedObjectType, setSelectedFaction,
    saveWorld, loadWorld,
  } = useWorldEditorStore();

  const [mapSize, setMapSize] = useState({ width: 800, height: 600 });
  useEffect(() => {
    const updateSize = () => {
      if (mapContainerRef.current) {
        const rect = mapContainerRef.current.getBoundingClientRect();
        setMapSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (mapContainerRef.current) observer.observe(mapContainerRef.current);
    window.addEventListener('resize', updateSize);
    return () => {
      window.removeEventListener('resize', updateSize);
      observer.disconnect();
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const key = e.key.toLowerCase();
      if (key in TOOL_KEYS) {
        setTool(TOOL_KEYS[key]);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setTool]);

  useMapGestures(mapContainerRef, {});

  const handleMinimapJump = useCallback(
    (worldX: number, worldY: number) => {
      setCamera({
        x: worldX - mapSize.width / (2 * editor.camera.zoom),
        y: worldY - mapSize.height / (2 * editor.camera.zoom),
      });
    },
    [mapSize, editor.camera.zoom, setCamera],
  );

  const handleSave = useCallback(() => {
    const json = saveWorld();
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${worldMap?.config.name ?? 'world'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [saveWorld, worldMap]);

  const handleLoadFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      loadWorld(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [loadWorld]);

  if (!worldMap) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-eis-text-secondary mb-4">No world generated yet</p>
          <button onClick={() => generateWorld()} className="eis-btn-primary">
            Generate World
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-3 py-2 bg-eis-bg-card border-b border-eis-border shrink-0">
        <span className="text-sm font-medium text-eis-text">{worldMap.config.name}</span>
        <span className="text-xs text-eis-text-muted">
          {worldMap.config.width}x{worldMap.config.height} | Seed: {worldMap.config.seed}
        </span>
        <div className="flex-1" />
        <button onClick={() => generateWorld()} className="eis-btn-secondary text-xs">Regenerate</button>
        <button onClick={handleSave} className="eis-btn-secondary text-xs">Save JSON</button>
        <label className="eis-btn-secondary text-xs cursor-pointer">
          Load JSON
          <input type="file" accept=".json" onChange={handleLoadFile} className="hidden" />
        </label>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left toolbar */}
        <div className="flex flex-col gap-1 w-16 shrink-0 p-1 bg-eis-bg-card border-r border-eis-border overflow-y-auto">
          {(Object.entries(TOOL_LABELS) as [EditorTool, { label: string; key: string }][]).map(([tool, meta]) => (
            <button
              key={tool}
              onClick={() => setTool(tool)}
              className={`h-9 flex items-center justify-center rounded text-[10px] transition-colors touch-manipulation ${
                editor.tool === tool
                  ? 'bg-eis-green/20 text-eis-green border border-eis-green/40'
                  : 'bg-eis-bg text-eis-text-secondary hover:bg-eis-bg-hover border border-transparent'
              }`}
              title={`${meta.label} (${meta.key})`}
            >
              {meta.label}
            </button>
          ))}

          {/* Brush size */}
          {(editor.tool === 'paint_biome' || editor.tool === 'faction_paint') && (
            <div className="mt-2 flex flex-col items-center gap-1">
              <span className="text-[8px] text-eis-text-muted">Size</span>
              {[1, 2, 3, 4, 5].map(s => (
                <button
                  key={s}
                  onClick={() => setBrushSize(s)}
                  className={`w-8 h-5 text-[10px] rounded ${
                    editor.brushSize === s
                      ? 'bg-eis-green/20 text-eis-green'
                      : 'bg-eis-bg text-eis-text-secondary hover:bg-eis-bg-hover'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Biome swatches */}
          {editor.tool === 'paint_biome' && (
            <div className="mt-2 flex flex-col items-center gap-1">
              <span className="text-[8px] text-eis-text-muted">Biome</span>
              {(Object.keys(BIOME_COLORS) as BiomeType[]).map(biome => (
                <button
                  key={biome}
                  onClick={() => setSelectedBiome(biome)}
                  className={`w-10 h-4 rounded border ${
                    editor.selectedBiome === biome ? 'border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: BIOME_COLORS[biome] }}
                  title={BIOME_LABELS[biome]}
                />
              ))}
            </div>
          )}

          {/* Faction swatches */}
          {editor.tool === 'faction_paint' && (
            <div className="mt-2 flex flex-col items-center gap-1">
              <span className="text-[8px] text-eis-text-muted">Faction</span>
              {FACTIONS.map(f => (
                <button
                  key={f}
                  onClick={() => setSelectedFaction(f)}
                  className={`w-10 h-4 rounded border ${
                    editor.selectedFaction === f ? 'border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: getFactionColor(f) }}
                  title={f}
                />
              ))}
            </div>
          )}
        </div>

        {/* Main map */}
        <div ref={mapContainerRef} className="flex-1 relative overflow-hidden bg-[#0a0a0a]" style={{ touchAction: 'none' }}>
          <PixiWorldMap width={mapSize.width} height={mapSize.height} />

          <PixiMinimap
            worldMap={worldMap}
            camera={editor.camera}
            viewportWidth={mapSize.width}
            viewportHeight={mapSize.height}
            onJump={handleMinimapJump}
          />

          {/* Object palette overlay */}
          {editor.tool === 'place_object' && (
            <div className="absolute top-2 left-2 z-10 bg-eis-bg-card/90 border border-eis-border rounded p-2">
              <label className="text-[10px] text-eis-text-muted block mb-1">Object type</label>
              <select
                value={editor.selectedObjectType ?? ''}
                onChange={e => setSelectedObjectType((e.target.value || null) as ObjectType | null)}
                className="eis-input text-xs"
              >
                <option value="">Choose...</option>
                {(Object.keys(OBJECT_CATALOG) as ObjectType[]).map(t => (
                  <option key={t} value={t}>{OBJECT_CATALOG[t].name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Bottom action bar (touch) */}
      <BottomActionBar />
    </div>
  );
}
