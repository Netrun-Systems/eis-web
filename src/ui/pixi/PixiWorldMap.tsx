// ============================================================
// EIS PixiJS World Map Renderer
// Replaces raw canvas with WebGL-accelerated tile rendering
// ============================================================

import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  type Renderer,
} from 'pixi.js';
import { useWorldEditorStore } from '../../hooks/useWorldEditor';
import { getFactionColor } from '../../engine/world';
import { getBiomeTexture, clearTileTextureCache } from './tile-textures';
import { renderObjectDurability } from './PixiNPCSprite';

interface PixiWorldMapProps {
  width: number;
  height: number;
}

// Animation frame counter
let globalAnimTick = 0;

export function PixiWorldMap({ width, height }: PixiWorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const layersRef = useRef<{
    tileLayer: Container;
    factionLayer: Container;
    locationLayer: Container;
    pathLayer: Container;
    objectLayer: Container;
    uiLayer: Container;
  } | null>(null);
  const rafRef = useRef<number>(0);

  const { worldMap, editor } = useWorldEditorStore();
  const { camera, showOverlays } = editor;

  // Initialize PixiJS Application
  useEffect(() => {
    if (!containerRef.current || width <= 0 || height <= 0) return;

    const app = new Application();
    const initPromise = app.init({
      width,
      height,
      backgroundColor: 0x0a0a0a,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    initPromise.then(() => {
      if (!containerRef.current) return;
      containerRef.current.appendChild(app.canvas as HTMLCanvasElement);
      appRef.current = app;

      // Create layer hierarchy
      const tileLayer = new Container();
      const factionLayer = new Container();
      const locationLayer = new Container();
      const pathLayer = new Container();
      const objectLayer = new Container();
      const uiLayer = new Container();

      app.stage.addChild(tileLayer);
      app.stage.addChild(factionLayer);
      app.stage.addChild(locationLayer);
      app.stage.addChild(pathLayer);
      app.stage.addChild(objectLayer);
      app.stage.addChild(uiLayer);

      layersRef.current = {
        tileLayer,
        factionLayer,
        locationLayer,
        pathLayer,
        objectLayer,
        uiLayer,
      };
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTileTextureCache();
      app.destroy(true, { children: true, texture: true });
      appRef.current = null;
      layersRef.current = null;
    };
  }, []); // Only run once on mount

  // Resize
  useEffect(() => {
    if (appRef.current && width > 0 && height > 0) {
      appRef.current.renderer.resize(width, height);
    }
  }, [width, height]);

  // Main render loop
  const renderFrame = useCallback(() => {
    const app = appRef.current;
    const layers = layersRef.current;
    if (!app || !layers || !worldMap) return;

    globalAnimTick++;
    const renderer = app.renderer as Renderer;
    const ts = worldMap.config.tileSize * camera.zoom;
    const offsetX = -camera.x * camera.zoom;
    const offsetY = -camera.y * camera.zoom;

    // Calculate visible tile range (with 2 tile buffer)
    const startTileX = Math.max(0, Math.floor(-offsetX / ts) - 2);
    const startTileY = Math.max(0, Math.floor(-offsetY / ts) - 2);
    const endTileX = Math.min(worldMap.config.width, Math.ceil((-offsetX + width) / ts) + 2);
    const endTileY = Math.min(worldMap.config.height, Math.ceil((-offsetY + height) / ts) + 2);

    // --- TILES ---
    layers.tileLayer.removeChildren();
    if (showOverlays.biomes) {
      for (let y = startTileY; y < endTileY; y++) {
        for (let x = startTileX; x < endTileX; x++) {
          const tile = worldMap.tiles[y]?.[x];
          if (!tile) continue;
          const tex = getBiomeTexture(renderer, tile.biome, Math.round(ts));
          const sprite = new Sprite(tex);
          sprite.position.set(x * ts + offsetX, y * ts + offsetY);
          sprite.width = ts + 0.5;
          sprite.height = ts + 0.5;
          layers.tileLayer.addChild(sprite);
        }
      }
    }

    // --- FACTION OVERLAY ---
    layers.factionLayer.removeChildren();
    if (showOverlays.factions) {
      const fg = new Graphics();
      for (let y = startTileY; y < endTileY; y++) {
        for (let x = startTileX; x < endTileX; x++) {
          const tile = worldMap.tiles[y]?.[x];
          if (!tile?.factionControl) continue;
          const color = parseInt(getFactionColor(tile.factionControl).replace('#', ''), 16);
          fg.rect(x * ts + offsetX, y * ts + offsetY, ts + 0.5, ts + 0.5)
            .fill({ color, alpha: 0.25 });
        }
      }
      layers.factionLayer.addChild(fg);
    }

    // --- LOCATIONS ---
    layers.locationLayer.removeChildren();
    if (showOverlays.biomes) {
      const lg = new Graphics();
      for (const loc of worldMap.locations) {
        const cx = loc.x * ts + offsetX + ts / 2;
        const cy = loc.y * ts + offsetY + ts / 2;
        const r = loc.radius * ts;

        // Check if in view
        if (cx + r < 0 || cx - r > width || cy + r < 0 || cy - r > height) continue;

        // Border circle
        const borderColor = loc.faction
          ? parseInt(getFactionColor(loc.faction).replace('#', ''), 16)
          : 0x90b9ab;
        lg.circle(cx, cy, r).stroke({ color: borderColor, width: 1.5, alpha: 0.5 });

        // Label
        if (camera.zoom > 0.5) {
          const label = new Text({
            text: loc.name,
            style: new TextStyle({
              fontSize: Math.max(9, 11 * camera.zoom),
              fontFamily: 'Inter, sans-serif',
              fill: 0xe0e6ed,
              align: 'center',
            }),
          });
          label.anchor.set(0.5, 1);
          label.position.set(cx, cy - r - 4);
          layers.locationLayer.addChild(label);
        }
      }
      layers.locationLayer.addChild(lg);
    }

    // --- PATHS ---
    layers.pathLayer.removeChildren();
    if (showOverlays.paths) {
      const pg = new Graphics();
      for (const path of worldMap.paths) {
        const fromLoc = worldMap.locations.find(l => l.id === path.from);
        const toLoc = worldMap.locations.find(l => l.id === path.to);
        if (!fromLoc || !toLoc) continue;

        const x1 = fromLoc.x * ts + offsetX + ts / 2;
        const y1 = fromLoc.y * ts + offsetY + ts / 2;
        const x2 = toLoc.x * ts + offsetX + ts / 2;
        const y2 = toLoc.y * ts + offsetY + ts / 2;

        const color = path.type === 'trade_route' ? 0xfbbf24 : 0xffffff;
        const alpha = path.type === 'trade_route' ? 0.35 : 0.12;
        const lineWidth = path.type === 'trade_route' ? 2 : 1;
        pg.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, width: lineWidth, alpha });
      }
      layers.pathLayer.addChild(pg);
    }

    // --- OBJECTS ---
    layers.objectLayer.removeChildren();
    if (showOverlays.objects) {
      const og = new Graphics();
      for (const obj of worldMap.objects) {
        const px = obj.x * ts + offsetX;
        const py = obj.y * ts + offsetY;
        if (px < -ts || py < -ts || px > width + ts || py > height + ts) continue;

        const isSelected = editor.selectedObjectId === obj.id;

        // Selection highlight
        if (isSelected) {
          og.circle(px + ts / 2, py + ts / 2, ts * 0.7).fill({ color: 0x90b9ab, alpha: 0.25 });
        }

        // Active indicator
        if (obj.currentUsers.length > 0) {
          const pulseR = ts * 0.6 + Math.sin(globalAnimTick * 0.08) * 2;
          og.circle(px + ts / 2, py + ts / 2, pulseR).stroke({ color: 0x22c55e, width: 1.5 });
        }

        // Durability bar
        if (obj.durability < 100) {
          renderObjectDurability(og, obj.x, obj.y, obj.durability, ts);
        }

        // Icon (emoji text)
        const iconSize = Math.max(10, ts * 0.7);
        const iconText = new Text({
          text: obj.icon,
          style: new TextStyle({ fontSize: iconSize, fontFamily: 'sans-serif' }),
        });
        iconText.anchor.set(0.5, 0.5);
        iconText.position.set(px + ts / 2, py + ts / 2);
        layers.objectLayer.addChild(iconText);

        // Name on select
        if (isSelected && camera.zoom > 0.8) {
          const nameText = new Text({
            text: obj.name,
            style: new TextStyle({
              fontSize: Math.max(8, 10 * camera.zoom),
              fontFamily: 'Inter, sans-serif',
              fill: 0xe0e6ed,
              align: 'center',
            }),
          });
          nameText.anchor.set(0.5, 1);
          nameText.position.set(px + ts / 2, py - 4);
          layers.objectLayer.addChild(nameText);
        }
      }
      layers.objectLayer.addChild(og);
    }

    // --- SELECTION HIGHLIGHT ---
    if (editor.selectedTile) {
      const sg = new Graphics();
      const px = editor.selectedTile.x * ts + offsetX;
      const py = editor.selectedTile.y * ts + offsetY;
      sg.rect(px, py, ts, ts).stroke({ color: 0x90b9ab, width: 2 });
      layers.uiLayer.removeChildren();
      layers.uiLayer.addChild(sg);
    } else {
      layers.uiLayer.removeChildren();
    }

    // Render
    app.render();

    // Continue animation loop
    rafRef.current = requestAnimationFrame(renderFrame);
  }, [worldMap, camera, showOverlays, editor, width, height]);

  // Start/restart render loop when dependencies change
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    // Small delay to ensure app is initialized
    const timeout = setTimeout(() => {
      rafRef.current = requestAnimationFrame(renderFrame);
    }, 50);
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(rafRef.current);
    };
  }, [renderFrame]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden"
      style={{ touchAction: 'none' }}
    />
  );
}
