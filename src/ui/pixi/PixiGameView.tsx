// ============================================================
// EIS Game View — Main game container with PixiJS renderer
// Combines world map, minimap, action bar, bottom sheet,
// context menus, and keyboard shortcuts into one view.
// ============================================================

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useWorldEditorStore } from '../../hooks/useWorldEditor';
import { useSimulationStore } from '../../hooks/useSimulation';
import { useMapGestures } from '../../hooks/useMapGestures';
import { useResponsive } from '../../hooks/useResponsive';
import { PixiWorldMap } from './PixiWorldMap';
import { PixiMinimap } from './PixiMinimap';
import { BottomActionBar } from '../touch/BottomActionBar';
import { BottomSheet, type SnapPoint } from '../touch/BottomSheet';
import { ContextMenu, NPC_CONTEXT_ITEMS, OBJECT_CONTEXT_ITEMS, TILE_CONTEXT_ITEMS } from '../touch/ContextMenu';
import { SwipeDrawer } from '../touch/SwipeDrawer';
import { PropertiesPanel } from '../world/PropertiesPanel';
import { ObjectPalette } from '../world/ObjectPalette';
import { BehaviorOverlay } from '../world/BehaviorOverlay';
import { BIOME_COLORS, BIOME_LABELS } from '../../engine/world-map-types';
import type { BiomeType, EditorTool } from '../../engine/world-map-types';
import { getFactionColor } from '../../engine/world';

interface PixiGameViewProps {
  mode: 'play' | 'editor' | 'observe';
}

// Tool configurations for editor keyboard shortcuts
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

export function PixiGameView({ mode }: PixiGameViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const { isPhone, isTablet, isDesktop, isMobile, windowSize } = useResponsive();

  const { worldMap, editor, generateWorld, setTool, setCamera, setSelectedBiome, setBrushSize, setSelectedFaction, toggleOverlay } = useWorldEditorStore();
  const { world, isPaused, speed, tickCounter } = useSimulationStore();

  // UI state
  const [sheetSnap, setSheetSnap] = useState<SnapPoint>('peek');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'npc' | 'object' | 'tile'; targetId?: string } | null>(null);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);

  // Compute map dimensions
  const [mapSize, setMapSize] = useState({ width: 800, height: 600 });
  useEffect(() => {
    const updateSize = () => {
      if (mapContainerRef.current) {
        const rect = mapContainerRef.current.getBoundingClientRect();
        setMapSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    const observer = new ResizeObserver(updateSize);
    if (mapContainerRef.current) observer.observe(mapContainerRef.current);
    return () => {
      window.removeEventListener('resize', updateSize);
      observer.disconnect();
    };
  }, []);

  // Initialize world if needed
  useEffect(() => {
    if (!worldMap && world) {
      generateWorld(undefined, world);
    }
  }, [worldMap, world, generateWorld]);

  // Player reference
  const player = useMemo(() => {
    if (!world?.playerId) return null;
    return world.npcs.find(n => n.id === world.playerId) ?? null;
  }, [world, tickCounter]);

  // Camera follow player in play mode
  useEffect(() => {
    if (mode === 'play' && player && worldMap) {
      const ts = worldMap.config.tileSize;
      setCamera({
        x: player.position.x * ts - mapSize.width / (2 * editor.camera.zoom),
        y: player.position.y * ts - mapSize.height / (2 * editor.camera.zoom),
      });
    }
  }, [mode, player?.position.x, player?.position.y, tickCounter]);

  // Handle tap in play mode
  const handlePlayTap = useCallback(
    (tileX: number, tileY: number) => {
      if (!world) return;
      // Check if tapping on an NPC
      const npc = world.npcs.find(n => {
        if (n.id === world.playerId || n.isDowned) return false;
        const dx = n.position.x - tileX;
        const dy = n.position.y - tileY;
        return Math.sqrt(dx * dx + dy * dy) < 1.5;
      });
      if (npc) {
        setSelectedNpcId(npc.id);
        useWorldEditorStore.getState().selectNpc(npc.id);
        return;
      }
      // Otherwise, queue move
      setSelectedNpcId(null);
      world.playerActionQueue.push({ type: 'move', target: { x: tileX, y: tileY } });
    },
    [world],
  );

  // Handle context menu
  const handleContextMenu = useCallback(
    (tileX: number, tileY: number) => {
      if (!world || !worldMap) return;
      const rect = mapContainerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const ts = worldMap.config.tileSize * editor.camera.zoom;
      const screenX = tileX * ts - editor.camera.x * editor.camera.zoom + ts / 2;
      const screenY = tileY * ts - editor.camera.y * editor.camera.zoom + ts / 2;

      // Check NPC
      const npc = world.npcs.find(n => {
        const dx = n.position.x - tileX;
        const dy = n.position.y - tileY;
        return Math.sqrt(dx * dx + dy * dy) < 1.5;
      });
      if (npc) {
        setContextMenu({ x: screenX + rect.left, y: screenY + rect.top, type: 'npc', targetId: npc.id });
        return;
      }

      // Check object
      const obj = worldMap.objects.find(o => o.x === tileX && o.y === tileY);
      if (obj) {
        setContextMenu({ x: screenX + rect.left, y: screenY + rect.top, type: 'object', targetId: obj.id });
        return;
      }

      // Tile
      if (mode === 'editor') {
        setContextMenu({ x: screenX + rect.left, y: screenY + rect.top, type: 'tile' });
      }
    },
    [world, worldMap, editor.camera, mode],
  );

  // Handle context menu selection
  const handleContextSelect = useCallback(
    (actionId: string) => {
      if (!world || !contextMenu?.targetId) return;
      if (contextMenu.type === 'npc') {
        world.playerActionQueue.push({
          type: actionId as 'talk' | 'trade' | 'attack',
          target: contextMenu.targetId,
        });
      }
      setContextMenu(null);
    },
    [world, contextMenu],
  );

  // Player actions from bottom bar
  const handlePlayerAction = useCallback(
    (action: string) => {
      if (!world) return;
      switch (action) {
        case 'center':
          if (player && worldMap) {
            const ts = worldMap.config.tileSize;
            setCamera({
              x: player.position.x * ts - mapSize.width / (2 * editor.camera.zoom),
              y: player.position.y * ts - mapSize.height / (2 * editor.camera.zoom),
            });
          }
          break;
        case 'talk':
        case 'trade':
        case 'attack':
          if (selectedNpcId) {
            world.playerActionQueue.push({ type: action as 'talk' | 'trade' | 'attack', target: selectedNpcId });
          }
          break;
        case 'cancel':
          setSelectedNpcId(null);
          break;
        case 'menu':
          setLeftDrawerOpen(true);
          break;
      }
    },
    [world, player, worldMap, selectedNpcId, editor.camera.zoom, mapSize],
  );

  // Minimap jump
  const handleMinimapJump = useCallback(
    (worldX: number, worldY: number) => {
      setCamera({
        x: worldX - mapSize.width / (2 * editor.camera.zoom),
        y: worldY - mapSize.height / (2 * editor.camera.zoom),
      });
    },
    [mapSize, editor.camera.zoom, setCamera],
  );

  // Gesture binding
  const { bind } = useMapGestures(mapContainerRef, {
    mode,
    onTap: mode === 'play' ? handlePlayTap : undefined,
    onContextMenu: handleContextMenu,
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();

      // Editor tool shortcuts
      if (mode === 'editor' && key in TOOL_KEYS) {
        setTool(TOOL_KEYS[key]);
        e.preventDefault();
        return;
      }

      // Universal shortcuts
      switch (key) {
        case ' ':
          e.preventDefault();
          isPaused ? useSimulationStore.getState().play() : useSimulationStore.getState().pause();
          break;
        case ']':
          e.preventDefault();
          const speeds: (1 | 2 | 5 | 10)[] = [1, 2, 5, 10];
          const sIdx = speeds.indexOf(speed as 1 | 2 | 5 | 10);
          if (sIdx < speeds.length - 1) useSimulationStore.getState().setSpeed(speeds[sIdx + 1]);
          break;
        case '[':
          e.preventDefault();
          const spds: (1 | 2 | 5 | 10)[] = [1, 2, 5, 10];
          const si = spds.indexOf(speed as 1 | 2 | 5 | 10);
          if (si > 0) useSimulationStore.getState().setSpeed(spds[si - 1]);
          break;
        case '.':
          e.preventDefault();
          useSimulationStore.getState().step();
          break;
        case 'escape':
          setContextMenu(null);
          setSelectedNpcId(null);
          setLeftDrawerOpen(false);
          setRightDrawerOpen(false);
          setSheetSnap('peek');
          break;
        case 'tab':
          e.preventDefault();
          if (isDesktop) setRightDrawerOpen(prev => !prev);
          break;
        case 'm':
          break; // Minimap is always visible
        case 'i':
          if (mode === 'play') {
            e.preventDefault();
            setLeftDrawerOpen(prev => !prev);
          }
          break;
        case 'q':
          if (mode === 'play') {
            e.preventDefault();
            setRightDrawerOpen(prev => !prev);
          }
          break;
      }

      // Player movement (WASD / Arrow keys)
      if (mode === 'play' && player && world) {
        const moveMap: Record<string, { x: number; y: number }> = {
          w: { x: 0, y: -1 }, arrowup: { x: 0, y: -1 },
          s: { x: 0, y: 1 }, arrowdown: { x: 0, y: 1 },
          a: { x: -1, y: 0 }, arrowleft: { x: -1, y: 0 },
          d: { x: 1, y: 0 }, arrowright: { x: 1, y: 0 },
        };
        const dir = moveMap[key];
        if (dir) {
          e.preventDefault();
          world.playerActionQueue.push({
            type: 'move',
            target: { x: player.position.x + dir.x, y: player.position.y + dir.y },
          });
        }

        // Player interaction shortcuts
        if (key === 't' && selectedNpcId) {
          world.playerActionQueue.push({ type: 'talk', target: selectedNpcId });
        }
        if (key === 'r' && selectedNpcId) {
          world.playerActionQueue.push({ type: 'trade', target: selectedNpcId });
        }
        if (key === 'f' && selectedNpcId) {
          world.playerActionQueue.push({ type: 'attack', target: selectedNpcId });
        }
      }

      // Number keys for action bar
      if (key >= '1' && key <= '5') {
        // The BottomActionBar handles its own click events
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, isPaused, speed, player, world, selectedNpcId, isDesktop, setTool]);

  if (!worldMap) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-eis-text-secondary mb-4">No world generated yet</p>
          <button onClick={() => generateWorld(undefined, world ?? undefined)} className="eis-btn-primary">
            Generate World
          </button>
        </div>
      </div>
    );
  }

  // --- Phone Layout ---
  if (isPhone) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Map fills everything */}
        <div ref={mapContainerRef} className="flex-1 relative overflow-hidden bg-[#0a0a0a]">
          <PixiWorldMap mode={mode} width={mapSize.width} height={mapSize.height} />

          {/* Minimap */}
          <PixiMinimap
            worldMap={worldMap}
            world={world}
            camera={editor.camera}
            viewportWidth={mapSize.width}
            viewportHeight={mapSize.height}
            onJump={handleMinimapJump}
            playerMode={mode === 'play'}
          />
        </div>

        {/* Bottom action bar */}
        <BottomActionBar
          mode={mode}
          selectedNpcId={selectedNpcId}
          onPlayerAction={handlePlayerAction}
        />

        {/* Bottom sheet for properties/details */}
        <BottomSheet
          snapPoint={sheetSnap}
          onSnapChange={setSheetSnap}
          peekContent={
            <div className="text-xs text-eis-text-muted">
              {editor.selectedNpcId ? `Selected NPC` : editor.selectedObjectId ? `Selected Object` : 'Swipe up for details'}
            </div>
          }
        >
          <PropertiesPanel />
        </BottomSheet>

        {/* Context menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={
              contextMenu.type === 'npc' ? NPC_CONTEXT_ITEMS :
              contextMenu.type === 'object' ? OBJECT_CONTEXT_ITEMS :
              TILE_CONTEXT_ITEMS
            }
            onSelect={handleContextSelect}
            onClose={() => setContextMenu(null)}
          />
        )}

        {/* Left drawer (inventory/stats) */}
        <SwipeDrawer isOpen={leftDrawerOpen} onClose={() => setLeftDrawerOpen(false)} side="left" title="Inventory">
          {player && <PlayerStatsCompact player={player} />}
        </SwipeDrawer>
      </div>
    );
  }

  // --- Tablet Layout ---
  if (isTablet) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex flex-1 min-h-0">
          {/* Map area */}
          <div ref={mapContainerRef} className="flex-1 relative overflow-hidden bg-[#0a0a0a]">
            <PixiWorldMap mode={mode} width={mapSize.width} height={mapSize.height} />

            <PixiMinimap
              worldMap={worldMap}
              world={world}
              camera={editor.camera}
              viewportWidth={mapSize.width}
              viewportHeight={mapSize.height}
              onJump={handleMinimapJump}
            />

            {/* Object palette overlay in editor */}
            {mode === 'editor' && editor.tool === 'place_object' && (
              <div className="absolute top-2 left-2 z-10">
                <ObjectPalette />
              </div>
            )}
          </div>

          {/* Side panel */}
          <div className="w-72 shrink-0 bg-eis-bg-card border-l border-eis-border overflow-y-auto">
            <PropertiesPanel />
          </div>
        </div>

        {/* Bottom action bar */}
        <BottomActionBar
          mode={mode}
          selectedNpcId={selectedNpcId}
          onPlayerAction={handlePlayerAction}
        />

        {/* Context menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={
              contextMenu.type === 'npc' ? NPC_CONTEXT_ITEMS :
              contextMenu.type === 'object' ? OBJECT_CONTEXT_ITEMS :
              TILE_CONTEXT_ITEMS
            }
            onSelect={handleContextSelect}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }

  // --- Desktop Layout ---
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar with overlays and world controls */}
      {mode === 'editor' && (
        <div className="flex items-center gap-3 px-3 py-2 bg-eis-bg-card border-b border-eis-border shrink-0">
          <span className="text-sm font-medium text-eis-text">{worldMap.config.name}</span>
          <span className="text-xs text-eis-text-muted">
            {worldMap.config.width}x{worldMap.config.height} | Seed: {worldMap.config.seed}
          </span>
          <div className="flex-1" />
          <OverlayToggles />
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Left toolbar (editor mode) */}
        {mode === 'editor' && <EditorToolbar />}

        {/* Main map */}
        <div ref={mapContainerRef} className="flex-1 relative overflow-hidden bg-[#0a0a0a]">
          <PixiWorldMap mode={mode} width={mapSize.width} height={mapSize.height} />

          <PixiMinimap
            worldMap={worldMap}
            world={world}
            camera={editor.camera}
            viewportWidth={mapSize.width}
            viewportHeight={mapSize.height}
            onJump={handleMinimapJump}
          />

          {/* Object palette overlay in editor */}
          {mode === 'editor' && editor.tool === 'place_object' && (
            <div className="absolute top-2 left-2 z-10">
              <ObjectPalette />
            </div>
          )}

          {/* Context menu */}
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={
                contextMenu.type === 'npc' ? NPC_CONTEXT_ITEMS :
                contextMenu.type === 'object' ? OBJECT_CONTEXT_ITEMS :
                TILE_CONTEXT_ITEMS
              }
              onSelect={handleContextSelect}
              onClose={() => setContextMenu(null)}
            />
          )}
        </div>

        {/* Right panel (properties) */}
        <div className="w-72 shrink-0 bg-eis-bg-card border-l border-eis-border overflow-y-auto">
          <PropertiesPanel />
        </div>
      </div>

      {/* Bottom action bar (compact on desktop) */}
      <BottomActionBar
        mode={mode}
        selectedNpcId={selectedNpcId}
        onPlayerAction={handlePlayerAction}
      />
    </div>
  );
}

// --- Helper: Compact player stats for mobile drawer ---

function PlayerStatsCompact({ player }: { player: import('../../engine/types').NPC }) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <h3 className="font-bold text-cyan-400">{player.name}</h3>
        <p className="text-xs text-eis-text-muted">{player.groupAffiliations[0] ?? 'Independent'}</p>
      </div>
      <div>
        <span className="text-eis-text-muted text-xs">HP </span>
        <span className="text-eis-text">{Math.round(player.currentHealth)}/{Math.round(player.maxHealth)}</span>
      </div>
      <div>
        <span className="text-eis-text-muted text-xs">Gold </span>
        <span className="text-eis-text">{player.gold}g</span>
      </div>
      <div>
        <span className="text-eis-text-muted text-xs uppercase block mb-1">Inventory</span>
        {player.inventory.length === 0 ? (
          <span className="text-xs text-eis-text-muted">Empty</span>
        ) : (
          <div className="space-y-0.5">
            {Object.entries(
              player.inventory.reduce<Record<string, number>>((acc, item) => {
                acc[item] = (acc[item] ?? 0) + 1;
                return acc;
              }, {}),
            ).map(([item, count]) => (
              <div key={item} className="text-xs text-eis-text-secondary">
                {item} {count > 1 ? `(${count})` : ''}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Helper: Overlay toggle buttons ---

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

// --- Helper: Editor left toolbar ---

function EditorToolbar() {
  const { editor, setTool, setBrushSize, setSelectedBiome, setSelectedFaction } = useWorldEditorStore();
  const { world } = useSimulationStore();

  const TOOL_LABELS: Record<EditorTool, { label: string; icon: string; key: string }> = {
    select: { label: 'Select', icon: '\u{1F5B1}', key: 'S' },
    paint_biome: { label: 'Biome', icon: '\u{1F3A8}', key: 'B' },
    place_object: { label: 'Object', icon: '\u{1F4E6}', key: 'O' },
    create_location: { label: 'Location', icon: '\u{1F4CD}', key: 'L' },
    place_npc: { label: 'NPC', icon: '\u{1F464}', key: 'N' },
    erase: { label: 'Erase', icon: '\u{1F9F9}', key: 'E' },
    path: { label: 'Path', icon: '\u{1F6E4}', key: 'P' },
    faction_paint: { label: 'Faction', icon: '\u{1F3F4}', key: 'F' },
  };

  return (
    <div className="flex flex-col gap-1 w-12 shrink-0 p-1 bg-eis-bg-card border-r border-eis-border overflow-y-auto">
      {(Object.entries(TOOL_LABELS) as [EditorTool, typeof TOOL_LABELS[EditorTool]][]).map(([tool, meta]) => (
        <button
          key={tool}
          onClick={() => setTool(tool)}
          className={`w-10 h-10 flex flex-col items-center justify-center rounded text-xs transition-colors touch-manipulation ${
            editor.tool === tool
              ? 'bg-eis-green/20 text-eis-green border border-eis-green/40'
              : 'bg-eis-bg text-eis-text-secondary hover:bg-eis-bg-hover border border-transparent'
          }`}
          title={`${meta.label} (${meta.key})`}
        >
          <span className="text-base leading-none">{meta.icon}</span>
          <span className="text-[8px] mt-0.5">{meta.key}</span>
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
              className={`w-7 h-5 text-[10px] rounded ${
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

      {/* Biome selector */}
      {editor.tool === 'paint_biome' && (
        <div className="mt-2 flex flex-col items-center gap-1">
          <span className="text-[8px] text-eis-text-muted">Biome</span>
          {(Object.keys(BIOME_COLORS) as BiomeType[]).map(biome => (
            <button
              key={biome}
              onClick={() => setSelectedBiome(biome)}
              className={`w-8 h-4 rounded border ${
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
          <span className="text-[8px] text-eis-text-muted">Faction</span>
          {world.factions.map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFaction(f.name)}
              className={`w-8 h-4 rounded border ${
                editor.selectedFaction === f.name ? 'border-white' : 'border-transparent'
              }`}
              style={{ backgroundColor: getFactionColor(f.name) }}
              title={f.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}
