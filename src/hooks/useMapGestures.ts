// ============================================================
// EIS Map Gesture Handler — Unified touch/mouse input
// Uses @use-gesture/react for pinch, drag, tap, long-press
// ============================================================

import { useCallback, useRef } from 'react';
import { useGesture } from '@use-gesture/react';
import { useWorldEditorStore } from './useWorldEditor';
import { useSimulationStore } from './useSimulation';
import type { WorldMapState } from '../engine/world-map-types';

interface MapGestureOptions {
  mode: 'play' | 'editor' | 'observe';
  onContextMenu?: (worldX: number, worldY: number) => void;
  onTap?: (worldX: number, worldY: number) => void;
}

export function useMapGestures(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: MapGestureOptions,
) {
  const {
    worldMap,
    editor,
    setCamera,
    paintBiome,
    placeObject,
    eraseAt,
    paintFaction,
    selectTile,
    selectObject,
    selectLocation,
    selectNpc,
  } = useWorldEditorStore();

  const { world } = useSimulationStore();
  const lastPinchScale = useRef(1);

  /** Convert screen coordinates to tile coordinates */
  const screenToTile = useCallback(
    (screenX: number, screenY: number): { tileX: number; tileY: number } | null => {
      if (!worldMap || !containerRef.current) return null;
      const rect = containerRef.current.getBoundingClientRect();
      const mx = screenX - rect.left;
      const my = screenY - rect.top;
      const { camera } = editor;
      const ts = worldMap.config.tileSize * camera.zoom;
      const tileX = Math.floor((mx + camera.x * camera.zoom) / ts);
      const tileY = Math.floor((my + camera.y * camera.zoom) / ts);
      return { tileX, tileY };
    },
    [worldMap, editor, containerRef],
  );

  /** Screen to world coordinates */
  const screenToWorld = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } | null => {
      if (!worldMap || !containerRef.current) return null;
      const rect = containerRef.current.getBoundingClientRect();
      const mx = screenX - rect.left;
      const my = screenY - rect.top;
      const { camera } = editor;
      const x = (mx + camera.x * camera.zoom) / camera.zoom;
      const y = (my + camera.y * camera.zoom) / camera.zoom;
      return { x, y };
    },
    [worldMap, editor, containerRef],
  );

  /** Handle select mode tap (find what was clicked) */
  const handleSelectTap = useCallback(
    (tileX: number, tileY: number) => {
      if (!worldMap || !world) return;

      // Check objects
      const obj = worldMap.objects.find(o => o.x === tileX && o.y === tileY);
      if (obj) { selectObject(obj.id); return; }

      // Check locations
      const loc = worldMap.locations.find(l => {
        const dx = l.x - tileX;
        const dy = l.y - tileY;
        return Math.sqrt(dx * dx + dy * dy) <= l.radius;
      });
      if (loc) { selectLocation(loc.id); return; }

      // Check NPCs
      const npc = world.npcs.find(n => {
        const dx = n.position.x - tileX;
        const dy = n.position.y - tileY;
        return Math.sqrt(dx * dx + dy * dy) < 1.5;
      });
      if (npc) { selectNpc(npc.id); return; }

      selectTile(tileX, tileY);
    },
    [worldMap, world, selectObject, selectLocation, selectNpc, selectTile],
  );

  /** Apply editor tool at tile position */
  const applyTool = useCallback(
    (tileX: number, tileY: number) => {
      switch (editor.tool) {
        case 'select':
          handleSelectTap(tileX, tileY);
          break;
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
      }
    },
    [editor.tool, handleSelectTap, paintBiome, placeObject, eraseAt, paintFaction],
  );

  const bind = useGesture(
    {
      onDrag: ({ delta: [dx, dy], touches, event, first, tap }) => {
        if (tap) return; // Handled by onTap

        if (touches >= 2) {
          // Two-finger drag = pan camera
          setCamera({
            x: editor.camera.x - dx / editor.camera.zoom,
            y: editor.camera.y - dy / editor.camera.zoom,
          });
        } else if (touches <= 1) {
          if (options.mode === 'editor') {
            // In editor mode with paint tools, drag paints
            if (
              editor.tool === 'paint_biome' ||
              editor.tool === 'erase' ||
              editor.tool === 'faction_paint'
            ) {
              const target = event.target as HTMLElement;
              const rect = target.getBoundingClientRect?.() ?? containerRef.current?.getBoundingClientRect();
              if (rect && 'clientX' in event) {
                const me = event as unknown as MouseEvent;
                const tile = screenToTile(me.clientX, me.clientY);
                if (tile) applyTool(tile.tileX, tile.tileY);
              }
              return;
            }
          }

          // Default: one-finger drag = pan (or shift+drag on desktop)
          setCamera({
            x: editor.camera.x - dx / editor.camera.zoom,
            y: editor.camera.y - dy / editor.camera.zoom,
          });
        }
      },

      onPinch: ({ offset: [scale], origin: [ox, oy], first }) => {
        if (first) {
          lastPinchScale.current = editor.camera.zoom;
        }
        const newZoom = Math.max(0.25, Math.min(4, lastPinchScale.current * scale));
        setCamera({ zoom: newZoom });
      },

      onWheel: ({ delta: [, dy], event }) => {
        event.preventDefault();
        const zoomDelta = dy > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(0.25, Math.min(4, editor.camera.zoom + zoomDelta));
        setCamera({ zoom: newZoom });
      },

      onClick: ({ event }) => {
        if (!('clientX' in event)) return;
        const me = event as MouseEvent;
        const tile = screenToTile(me.clientX, me.clientY);
        if (!tile) return;

        if (options.mode === 'editor') {
          applyTool(tile.tileX, tile.tileY);
        } else if (options.mode === 'play') {
          // In play mode, tapping = move or interact
          options.onTap?.(tile.tileX, tile.tileY);
        } else {
          // Observe mode = select
          handleSelectTap(tile.tileX, tile.tileY);
        }
      },

      onContextMenu: ({ event }) => {
        event.preventDefault();
        if (!('clientX' in event)) return;
        const me = event as MouseEvent;
        const tile = screenToTile(me.clientX, me.clientY);
        if (tile) {
          options.onContextMenu?.(tile.tileX, tile.tileY);
        }
      },

      onDoubleClick: ({ event }) => {
        if (!('clientX' in event)) return;
        // Double-click = zoom in toward point
        const newZoom = Math.min(4, editor.camera.zoom * 1.5);
        setCamera({ zoom: newZoom });
      },
    },
    {
      target: containerRef,
      drag: {
        filterTaps: true,
        threshold: 8,
        pointer: { touch: true },
      },
      pinch: {
        scaleBounds: { min: 0.25, max: 4 },
        pointer: { touch: true },
      },
      wheel: {
        eventOptions: { passive: false },
      },
      eventOptions: { passive: false },
    },
  );

  return { bind, screenToTile, screenToWorld };
}
