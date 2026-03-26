import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useWorldEditorStore } from '../../hooks/useWorldEditor';
import { useSimulationStore } from '../../hooks/useSimulation';
import { getFactionColor } from '../../engine/world';
import { BIOME_COLORS, BIOME_LABELS } from '../../engine/world-map-types';
import type { BiomeType, EditorTool, WorldObject, WorldLocation } from '../../engine/world-map-types';
import { ObjectPalette } from './ObjectPalette';
import { LocationEditor } from './LocationEditor';
import { BehaviorOverlay } from './BehaviorOverlay';
import { PropertiesPanel } from './PropertiesPanel';

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

const TOOL_LABELS: Record<EditorTool, { label: string; icon: string; key: string }> = {
  select: { label: 'Select', icon: '\u{1F5B1}', key: 'S' },
  paint_biome: { label: 'Biome', icon: '\u{1F3A8}', key: 'B' },
  place_object: { label: 'Object', icon: '\u{1F4E6}', key: 'O' },
  create_location: { label: 'Location', icon: '\u{1F4CD}', key: 'L' },
  place_npc: { label: 'Place NPC', icon: '\u{1F464}', key: 'N' },
  erase: { label: 'Erase', icon: '\u{1F9F9}', key: 'E' },
  path: { label: 'Path', icon: '\u{1F6E4}', key: 'P' },
  faction_paint: { label: 'Faction', icon: '\u{1F3F4}', key: 'F' },
};

export function WorldMapEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    worldMap, editor, generateWorld, setTool, setCamera,
    paintBiome, placeObject, eraseAt, paintFaction,
    selectTile, selectObject, selectLocation, selectNpc,
    setSelectedBiome, setBrushSize, setSelectedObjectType,
    setSelectedFaction, toggleOverlay,
  } = useWorldEditorStore();
  const { world, tickCounter, isPaused } = useSimulationStore();

  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showObjectPalette, setShowObjectPalette] = useState(false);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [locationDragStart, setLocationDragStart] = useState<{ x: number; y: number } | null>(null);

  // Initialize world on mount
  useEffect(() => {
    if (!worldMap && world) {
      generateWorld(undefined, world);
    }
  }, [worldMap, world, generateWorld]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if (key in TOOL_KEYS) {
        setTool(TOOL_KEYS[key]);
        e.preventDefault();
      }
      if (key === ' ') {
        e.preventDefault();
        if (isPaused) {
          useSimulationStore.getState().play();
        } else {
          useSimulationStore.getState().pause();
        }
      }
      // Brush size
      if (key === '[') setBrushSize(editor.brushSize - 1);
      if (key === ']') setBrushSize(editor.brushSize + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setTool, setBrushSize, editor.brushSize, isPaused]);

  // ---- Canvas Drawing ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !worldMap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const { camera, showOverlays } = editor;
    const ts = worldMap.config.tileSize * camera.zoom;
    const offsetX = -camera.x * camera.zoom;
    const offsetY = -camera.y * camera.zoom;

    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Calculate visible tile range
    const startTileX = Math.max(0, Math.floor(-offsetX / ts));
    const startTileY = Math.max(0, Math.floor(-offsetY / ts));
    const endTileX = Math.min(worldMap.config.width, Math.ceil((-offsetX + rect.width) / ts));
    const endTileY = Math.min(worldMap.config.height, Math.ceil((-offsetY + rect.height) / ts));

    // Draw tiles
    if (showOverlays.biomes) {
      for (let y = startTileY; y < endTileY; y++) {
        for (let x = startTileX; x < endTileX; x++) {
          const tile = worldMap.tiles[y]?.[x];
          if (!tile) continue;
          const px = x * ts + offsetX;
          const py = y * ts + offsetY;
          ctx.fillStyle = BIOME_COLORS[tile.biome];
          ctx.fillRect(px, py, ts + 0.5, ts + 0.5);
        }
      }
    }

    // Faction overlay
    if (showOverlays.factions) {
      for (let y = startTileY; y < endTileY; y++) {
        for (let x = startTileX; x < endTileX; x++) {
          const tile = worldMap.tiles[y]?.[x];
          if (!tile?.factionControl) continue;
          const px = x * ts + offsetX;
          const py = y * ts + offsetY;
          const color = getFactionColor(tile.factionControl);
          ctx.fillStyle = color + '40';
          ctx.fillRect(px, py, ts + 0.5, ts + 0.5);
        }
      }
    }

    // Location borders
    if (showOverlays.biomes) {
      for (const loc of worldMap.locations) {
        const cx = loc.x * ts + offsetX + ts / 2;
        const cy = loc.y * ts + offsetY + ts / 2;
        const r = loc.radius * ts;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = loc.faction ? getFactionColor(loc.faction) + 'AA' : '#90b9ab88';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        if (camera.zoom > 0.5) {
          ctx.font = `${Math.max(9, 11 * camera.zoom)}px Inter, sans-serif`;
          ctx.fillStyle = '#e0e6ed';
          ctx.textAlign = 'center';
          ctx.fillText(loc.name, cx, cy - r - 4);
        }
      }
    }

    // Paths
    if (showOverlays.paths) {
      for (const path of worldMap.paths) {
        const fromLoc = worldMap.locations.find(l => l.id === path.from);
        const toLoc = worldMap.locations.find(l => l.id === path.to);
        if (!fromLoc || !toLoc) continue;

        ctx.beginPath();
        ctx.moveTo(fromLoc.x * ts + offsetX + ts / 2, fromLoc.y * ts + offsetY + ts / 2);
        ctx.lineTo(toLoc.x * ts + offsetX + ts / 2, toLoc.y * ts + offsetY + ts / 2);
        ctx.strokeStyle = path.type === 'trade_route' ? '#fbbf2460' : '#ffffff20';
        ctx.lineWidth = path.type === 'trade_route' ? 2 : 1;
        ctx.setLineDash([3, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Objects
    if (showOverlays.objects) {
      for (const obj of worldMap.objects) {
        const px = obj.x * ts + offsetX;
        const py = obj.y * ts + offsetY;
        if (px < -ts || py < -ts || px > rect.width + ts || py > rect.height + ts) continue;

        // Object background circle
        const isSelected = editor.selectedObjectId === obj.id;
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(px + ts / 2, py + ts / 2, ts * 0.7, 0, Math.PI * 2);
          ctx.fillStyle = '#90b9ab40';
          ctx.fill();
        }

        // Active indicator (currently in use)
        if (obj.currentUsers.length > 0) {
          ctx.beginPath();
          ctx.arc(px + ts / 2, py + ts / 2, ts * 0.6, 0, Math.PI * 2);
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Icon
        const fontSize = Math.max(10, ts * 0.7);
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obj.icon, px + ts / 2, py + ts / 2);

        // Name label on hover/select at high zoom
        if (isSelected && camera.zoom > 0.8) {
          ctx.font = `${Math.max(8, 10 * camera.zoom)}px Inter, sans-serif`;
          ctx.fillStyle = '#e0e6ed';
          ctx.fillText(obj.name, px + ts / 2, py - 4);
        }
      }
    }

    // NPCs
    if (showOverlays.npcs && world) {
      for (const npc of world.npcs) {
        const px = npc.position.x * ts + offsetX;
        const py = npc.position.y * ts + offsetY;
        if (px < -ts || py < -ts || px > rect.width + ts || py > rect.height + ts) continue;

        const faction = npc.groupAffiliations[0];
        const factionDef = world.factions.find(f => String(f.id) === faction || f.name === faction);
        const color = factionDef ? getFactionColor(factionDef.name) : '#90b9ab';
        const isSelected = editor.selectedNpcId === npc.id;
        const radius = isSelected ? ts * 0.35 : ts * 0.25;

        // Selection glow
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(px + ts / 2, py + ts / 2, ts * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = color + '30';
          ctx.fill();
        }

        // NPC dot
        ctx.beginPath();
        ctx.arc(px + ts / 2, py + ts / 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Name
        if (isSelected && camera.zoom > 0.6) {
          ctx.font = `${Math.max(8, 10 * camera.zoom)}px Inter, sans-serif`;
          ctx.fillStyle = '#e0e6ed';
          ctx.textAlign = 'center';
          ctx.fillText(npc.name, px + ts / 2, py - 4);
        }

        // Behavior line to target
        if (showOverlays.behaviorLines) {
          const locState = worldMap.npcLocations.get(npc.id);
          if (locState?.targetObjectId) {
            const targetObj = worldMap.objects.find(o => o.id === locState.targetObjectId);
            if (targetObj) {
              ctx.beginPath();
              ctx.moveTo(px + ts / 2, py + ts / 2);
              ctx.lineTo(targetObj.x * ts + offsetX + ts / 2, targetObj.y * ts + offsetY + ts / 2);
              ctx.strokeStyle = getBehaviorColor(npc.currentBehavior) + '60';
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }
        }

        // Need bubble
        if (showOverlays.needBubbles && camera.zoom > 0.7) {
          const topNeed = getTopNeed(npc);
          if (topNeed.value > 60) {
            const bubble = getNeedEmoji(topNeed.key);
            ctx.font = `${Math.max(8, 10 * camera.zoom)}px sans-serif`;
            ctx.fillText(bubble, px + ts / 2 + ts * 0.3, py - ts * 0.1);
          }
        }
      }
    }

    // Selection highlight
    if (editor.selectedTile) {
      const px = editor.selectedTile.x * ts + offsetX;
      const py = editor.selectedTile.y * ts + offsetY;
      ctx.strokeStyle = '#90b9ab';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, ts, ts);
    }

    // Brush preview
    if (editor.tool === 'paint_biome' || editor.tool === 'faction_paint') {
      // Show on hover — handled by mouse move
    }

    // ---- Minimap ----
    drawMinimap(rect);
  }, [worldMap, editor, world, tickCounter]);

  const drawMinimap = useCallback((mainRect: DOMRect) => {
    const minimap = minimapRef.current;
    if (!minimap || !worldMap) return;
    const ctx = minimap.getContext('2d');
    if (!ctx) return;

    const mmW = 160;
    const mmH = 160;
    minimap.width = mmW;
    minimap.height = mmH;

    const scaleX = mmW / worldMap.config.width;
    const scaleY = mmH / worldMap.config.height;

    // Draw biomes
    for (let y = 0; y < worldMap.config.height; y++) {
      for (let x = 0; x < worldMap.config.width; x++) {
        const tile = worldMap.tiles[y][x];
        ctx.fillStyle = BIOME_COLORS[tile.biome];
        ctx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
      }
    }

    // Viewport indicator
    const { camera } = editor;
    const ts = worldMap.config.tileSize * camera.zoom;
    const vpX = camera.x / worldMap.config.tileSize * scaleX;
    const vpY = camera.y / worldMap.config.tileSize * scaleY;
    const vpW = mainRect.width / ts * scaleX;
    const vpH = mainRect.height / ts * scaleY;
    ctx.strokeStyle = '#90b9ab';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpX, vpY, vpW, vpH);
  }, [worldMap, editor]);

  useEffect(() => { draw(); }, [draw]);

  // ---- Mouse Handlers ----
  const getTilePos = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current || !worldMap) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const { camera } = editor;
    const ts = worldMap.config.tileSize * camera.zoom;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const tileX = Math.floor((mx + camera.x * camera.zoom) / ts);
    const tileY = Math.floor((my + camera.y * camera.zoom) / ts);
    return { tileX, tileY, mx, my };
  }, [worldMap, editor]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle click or Alt+click = pan
      setIsPanning(true);
      setPanStart({ x: e.clientX + editor.camera.x * editor.camera.zoom, y: e.clientY + editor.camera.y * editor.camera.zoom });
      return;
    }

    const pos = getTilePos(e);
    if (!pos || !worldMap) return;
    const { tileX, tileY } = pos;

    setIsDragging(true);

    switch (editor.tool) {
      case 'select': {
        // Check if clicked on an object
        const obj = worldMap.objects.find(o => o.x === tileX && o.y === tileY);
        if (obj) {
          selectObject(obj.id);
          return;
        }
        // Check if clicked on a location
        const loc = worldMap.locations.find(l => {
          const dx = l.x - tileX;
          const dy = l.y - tileY;
          return Math.sqrt(dx * dx + dy * dy) <= l.radius;
        });
        if (loc) {
          selectLocation(loc.id);
          return;
        }
        // Check if clicked on an NPC
        if (world) {
          const npc = world.npcs.find(n => {
            const dx = n.position.x - tileX;
            const dy = n.position.y - tileY;
            return Math.sqrt(dx * dx + dy * dy) < 1.5;
          });
          if (npc) {
            selectNpc(npc.id);
            return;
          }
        }
        selectTile(tileX, tileY);
        break;
      }
      case 'paint_biome':
        paintBiome(tileX, tileY);
        break;
      case 'place_object':
        placeObject(tileX, tileY);
        break;
      case 'erase':
        eraseAt(tileX, tileY);
        break;
      case 'faction_paint':
        paintFaction(tileX, tileY);
        break;
      case 'create_location':
        setLocationDragStart({ x: tileX, y: tileY });
        break;
    }
  }, [editor, worldMap, world, getTilePos, paintBiome, placeObject, eraseAt, paintFaction, selectTile, selectObject, selectLocation, selectNpc]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const newX = (panStart.x - e.clientX) / editor.camera.zoom;
      const newY = (panStart.y - e.clientY) / editor.camera.zoom;
      setCamera({ x: newX, y: newY });
      return;
    }

    if (!isDragging) return;
    const pos = getTilePos(e);
    if (!pos) return;
    const { tileX, tileY } = pos;

    switch (editor.tool) {
      case 'paint_biome':
        paintBiome(tileX, tileY);
        break;
      case 'erase':
        eraseAt(tileX, tileY);
        break;
      case 'faction_paint':
        paintFaction(tileX, tileY);
        break;
    }
  }, [isDragging, isPanning, editor, panStart, getTilePos, paintBiome, eraseAt, paintFaction, setCamera]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (editor.tool === 'create_location' && locationDragStart) {
      const pos = getTilePos(e);
      if (pos) {
        const dx = pos.tileX - locationDragStart.x;
        const dy = pos.tileY - locationDragStart.y;
        const radius = Math.max(2, Math.round(Math.sqrt(dx * dx + dy * dy)));
        setShowLocationDialog(true);
        // Store temp data — the dialog will use locationDragStart and radius
      }
    }

    setIsDragging(false);
  }, [isPanning, editor.tool, locationDragStart, getTilePos]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(0.25, Math.min(4, editor.camera.zoom + delta));
    setCamera({ zoom: newZoom });
  }, [editor.camera.zoom, setCamera]);

  // ---- Generate/Save/Load ----
  const handleGenerate = useCallback(() => {
    const seed = Math.floor(Math.random() * 100000);
    generateWorld({ seed }, world ?? undefined);
  }, [generateWorld, world]);

  const handleSave = useCallback(() => {
    const json = useWorldEditorStore.getState().saveWorld();
    if (json) {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eis-world-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, []);

  const handleLoad = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          useWorldEditorStore.getState().loadWorld(reader.result as string);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, []);

  if (!worldMap) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-eis-text-secondary mb-4">No world generated yet</p>
          <button
            onClick={handleGenerate}
            className="eis-btn-primary"
          >
            Generate World
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-3 py-2 bg-eis-bg-card border border-eis-border rounded">
        <span className="text-sm font-medium text-eis-text">{worldMap.config.name}</span>
        <span className="text-xs text-eis-text-muted">
          {worldMap.config.width}x{worldMap.config.height} | Seed: {worldMap.config.seed}
        </span>
        <div className="flex-1" />
        <button onClick={handleGenerate} className="eis-btn-sm" title="Generate New World">New</button>
        <button onClick={handleSave} className="eis-btn-sm" title="Save World">Save</button>
        <button onClick={handleLoad} className="eis-btn-sm" title="Load World">Load</button>
        <span className="text-xs text-eis-text-muted mx-2">|</span>
        <OverlayToggles />
      </div>

      <div className="flex flex-1 gap-2 min-h-0">
        {/* Left Toolbar */}
        <div className="flex flex-col gap-1 w-12 shrink-0">
          {(Object.entries(TOOL_LABELS) as [EditorTool, typeof TOOL_LABELS[EditorTool]][]).map(([tool, meta]) => (
            <button
              key={tool}
              onClick={() => setTool(tool)}
              className={`w-12 h-12 flex flex-col items-center justify-center rounded text-xs transition-colors ${
                editor.tool === tool
                  ? 'bg-eis-green/20 text-eis-green border border-eis-green/40'
                  : 'bg-eis-bg-card text-eis-text-secondary hover:bg-eis-bg-hover border border-eis-border'
              }`}
              title={`${meta.label} (${meta.key})`}
            >
              <span className="text-base leading-none">{meta.icon}</span>
              <span className="text-[9px] mt-0.5">{meta.key}</span>
            </button>
          ))}

          {/* Brush size */}
          {(editor.tool === 'paint_biome' || editor.tool === 'faction_paint') && (
            <div className="mt-2 flex flex-col items-center gap-1">
              <span className="text-[9px] text-eis-text-muted">Size</span>
              {[1, 2, 3, 4, 5].map(s => (
                <button
                  key={s}
                  onClick={() => setBrushSize(s)}
                  className={`w-8 h-6 text-xs rounded ${
                    editor.brushSize === s
                      ? 'bg-eis-green/20 text-eis-green'
                      : 'bg-eis-bg-card text-eis-text-secondary hover:bg-eis-bg-hover'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Biome selector for paint mode */}
          {editor.tool === 'paint_biome' && (
            <div className="mt-2 flex flex-col items-center gap-1">
              <span className="text-[9px] text-eis-text-muted">Biome</span>
              {(Object.keys(BIOME_COLORS) as BiomeType[]).map(biome => (
                <button
                  key={biome}
                  onClick={() => setSelectedBiome(biome)}
                  className={`w-10 h-5 rounded border ${
                    editor.selectedBiome === biome ? 'border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: BIOME_COLORS[biome] }}
                  title={BIOME_LABELS[biome]}
                />
              ))}
            </div>
          )}

          {/* Faction selector */}
          {editor.tool === 'faction_paint' && world && (
            <div className="mt-2 flex flex-col items-center gap-1">
              <span className="text-[9px] text-eis-text-muted">Faction</span>
              {world.factions.map(f => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFaction(f.name)}
                  className={`w-10 h-5 rounded border ${
                    editor.selectedFaction === f.name ? 'border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: getFactionColor(f.name) }}
                  title={f.name}
                />
              ))}
            </div>
          )}
        </div>

        {/* Main Canvas */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden rounded border border-eis-border bg-[#0a0a0a]"
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { setIsDragging(false); setIsPanning(false); }}
            onWheel={handleWheel}
          />

          {/* Minimap */}
          <div className="absolute bottom-2 right-2 border border-eis-border rounded overflow-hidden bg-eis-bg-card/80">
            <canvas ref={minimapRef} width={160} height={160} className="block" />
          </div>

          {/* Object palette overlay */}
          {editor.tool === 'place_object' && (
            <div className="absolute top-2 left-2 z-10">
              <ObjectPalette />
            </div>
          )}
        </div>

        {/* Right Panel — Properties */}
        <div className="w-72 shrink-0 overflow-y-auto">
          <PropertiesPanel />
        </div>
      </div>
    </div>
  );
}

// ---- Helper Components ----

function OverlayToggles() {
  const { editor, toggleOverlay } = useWorldEditorStore();
  const overlays: { key: keyof typeof editor.showOverlays; label: string }[] = [
    { key: 'biomes', label: 'Biomes' },
    { key: 'factions', label: 'Factions' },
    { key: 'paths', label: 'Paths' },
    { key: 'npcs', label: 'NPCs' },
    { key: 'objects', label: 'Objects' },
    { key: 'behaviorLines', label: 'Behavior' },
    { key: 'needBubbles', label: 'Needs' },
  ];

  return (
    <div className="flex gap-1">
      {overlays.map(o => (
        <button
          key={o.key}
          onClick={() => toggleOverlay(o.key)}
          className={`px-2 py-0.5 text-xs rounded ${
            editor.showOverlays[o.key]
              ? 'bg-eis-green/20 text-eis-green'
              : 'bg-eis-bg text-eis-text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- Helpers ----

function getBehaviorColor(behavior: string | null): string {
  if (!behavior) return '#666';
  const b = behavior.toLowerCase();
  if (b.includes('food') || b.includes('eat') || b.includes('cook')) return '#22c55e';
  if (b.includes('drink')) return '#3b82f6';
  if (b.includes('fight') || b.includes('combat') || b.includes('attack')) return '#ef4444';
  if (b.includes('trade')) return '#eab308';
  if (b.includes('social') || b.includes('talk')) return '#a855f7';
  if (b.includes('rest') || b.includes('sleep')) return '#6366f1';
  if (b.includes('train') || b.includes('study')) return '#f97316';
  return '#90b9ab';
}

function getTopNeed(npc: import('../../engine/types').NPC): { key: string; value: number } {
  let topKey = 'hunger';
  let topVal = -1;
  const needs = npc.needs as unknown as Record<string, number>;
  for (const [key, val] of Object.entries(needs)) {
    if (typeof val === 'number' && val > topVal) {
      topVal = val;
      topKey = key;
    }
  }
  return { key: topKey, value: topVal };
}

function getNeedEmoji(need: string): string {
  const map: Record<string, string> = {
    hunger: '\u{1F356}',
    thirst: '\u{1F4A7}',
    rest: '\u{1F4A4}',
    socialInteraction: '\u{1F465}',
    energy: '\u{26A1}',
    hygiene: '\u{1F6BF}',
    comfort: '\u{1F3E0}',
    safety: '\u{1F6E1}',
    selfActualization: '\u{2B50}',
    entertainment: '\u{1F3AD}',
  };
  return map[need] ?? '\u{2753}';
}
