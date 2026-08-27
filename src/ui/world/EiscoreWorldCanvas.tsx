// ============================================================
// WEB-010 — the EISCORE world canvas: WorldLayout's 8x8 as the
// Pixi tile layer, region-center markers, POI markers.
//
// Reuses the WEB-002 renderer's machinery — the same layered
// Container hierarchy and the tile-texture generator — but reads
// props (real table data) instead of the sandbox zustand store,
// which models the JSON toy world and stays untouched behind the
// Sandbox tab.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  type Renderer,
} from 'pixi.js';
import { getBiomeTexture, clearTileTextureCache } from '../pixi/tile-textures';
import type { BiomeType } from '../../engine/world-map-types';
import {
  EISCORE_BIOME_TEXTURE,
  GRID_SIZE,
  stableColor,
  type LayoutGrid,
} from '../../lib/worldBinding';

export interface PoiMarker {
  id: string;
  name: string;
  poiType: string;
  /** Unit canvas coordinates (u right, v down) from fracToUnit. */
  u: number;
  v: number;
  /** RGN id the POI resolved to, or null. */
  regionId: string | null;
}

export interface RegionMarker {
  id: string;
  name: string;
  u: number;
  v: number;
}

export type WorldSelection =
  | { kind: 'cell'; x: number; y: number }
  | { kind: 'poi'; id: string }
  | { kind: 'region'; id: string };

interface HoverInfo {
  /** Screen position inside the container, for the tooltip. */
  px: number;
  py: number;
  title: string;
  subtitle: string;
}

export interface EiscoreWorldCanvasProps {
  grid: LayoutGrid;
  /** cellKey -> painted biome (unsaved edits, drawn over the base tiles). */
  paints: ReadonlyMap<string, string>;
  pois: PoiMarker[];
  regions: RegionMarker[];
  selection: WorldSelection | null;
  mode: 'select' | 'paint';
  showPois: boolean;
  showRegions: boolean;
  onSelect: (sel: WorldSelection) => void;
  onPaint: (gridX: number, gridY: number) => void;
}

const POI_HIT_RADIUS = 9;
const REGION_HIT_RADIUS = 12;

/** Biome fill for cells whose EISCORE biome has no sandbox texture analog:
 * the same stable-color system as regions, namespaced so 'Urban' the biome
 * and a hypothetical 'Urban' region never collide. */
const biomeFallbackColor = (biome: string): number => stableColor(`BIO_${biome}`);

export function EiscoreWorldCanvas({
  grid,
  paints,
  pois,
  regions,
  selection,
  mode,
  showPois,
  showRegions,
  onSelect,
  onPaint,
}: EiscoreWorldCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const layersRef = useRef<{
    tileLayer: Container;
    gridLayer: Container;
    regionLayer: Container;
    poiLayer: Container;
    uiLayer: Container;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const paintingRef = useRef(false);

  // Track the container size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Init the Pixi application once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const app = new Application();
    let cancelled = false;
    app
      .init({
        width: Math.max(1, el.clientWidth),
        height: Math.max(1, el.clientHeight),
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })
      .then(() => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.appendChild(app.canvas as HTMLCanvasElement);
        appRef.current = app;
        const tileLayer = new Container();
        const gridLayer = new Container();
        const regionLayer = new Container();
        const poiLayer = new Container();
        const uiLayer = new Container();
        app.stage.addChild(tileLayer, gridLayer, regionLayer, poiLayer, uiLayer);
        layersRef.current = { tileLayer, gridLayer, regionLayer, poiLayer, uiLayer };
        setReady(true);
      });
    return () => {
      cancelled = true;
      clearTileTextureCache();
      app.destroy(true, { children: true, texture: true });
      appRef.current = null;
      layersRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (appRef.current && size.width > 0 && size.height > 0) {
      appRef.current.renderer.resize(size.width, size.height);
    }
  }, [size]);

  /** Geometry: the 8x8 board fits the container, centered, with a margin. */
  const geometry = useCallback(() => {
    const margin = 8;
    const side = Math.max(GRID_SIZE, Math.min(size.width, size.height) - margin * 2);
    const ts = Math.floor(side / GRID_SIZE);
    const board = ts * GRID_SIZE;
    return {
      ts,
      board,
      ox: Math.floor((size.width - board) / 2),
      oy: Math.floor((size.height - board) / 2),
    };
  }, [size]);

  // Draw the scene. Static data, so a plain effect-driven redraw — no RAF loop.
  useEffect(() => {
    const app = appRef.current;
    const layers = layersRef.current;
    if (!app || !layers || !ready || size.width <= 0 || size.height <= 0) return;
    const renderer = app.renderer as Renderer;
    const { ts, board, ox, oy } = geometry();

    // --- TILES: base biome (texture where a faithful analog exists,
    //     stable flat color otherwise), painted biome drawn the same way ---
    layers.tileLayer.removeChildren();
    const flat = new Graphics();
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = grid.cells[y][x];
        const px = ox + x * ts;
        const py = oy + y * ts;
        if (!cell) {
          flat.rect(px, py, ts, ts).fill({ color: 0x000000, alpha: 0.15 });
          continue;
        }
        const biome = paints.get(cell.name) ?? cell.biomeType;
        const texKey = EISCORE_BIOME_TEXTURE[biome];
        if (texKey !== undefined) {
          const sprite = new Sprite(getBiomeTexture(renderer, texKey as BiomeType, ts));
          sprite.position.set(px, py);
          sprite.width = ts;
          sprite.height = ts;
          layers.tileLayer.addChild(sprite);
        } else {
          flat.rect(px, py, ts, ts).fill({ color: biomeFallbackColor(biome) });
        }
        // Unsaved paint marker: a petrol corner triangle.
        if (paints.has(cell.name) && paints.get(cell.name) !== cell.biomeType) {
          flat
            .moveTo(px + ts, py)
            .lineTo(px + ts - Math.max(8, ts * 0.22), py)
            .lineTo(px + ts, py + Math.max(8, ts * 0.22))
            .closePath()
            .fill({ color: 0x3a8a99, alpha: 0.95 });
        }
        // Settlement glyph: a small hollow square for any settled cell.
        if (cell.settlementType !== '' && cell.settlementType !== 'None') {
          flat
            .rect(px + ts * 0.08, py + ts * 0.08, Math.max(5, ts * 0.14), Math.max(5, ts * 0.14))
            .stroke({ color: 0xfcfaf5, width: 1.5, alpha: 0.9 });
        }
      }
    }
    layers.tileLayer.addChild(flat);

    // --- GRID LINES + edge coordinates ---
    layers.gridLayer.removeChildren();
    const gl = new Graphics();
    for (let i = 0; i <= GRID_SIZE; i++) {
      gl.moveTo(ox + i * ts, oy).lineTo(ox + i * ts, oy + board);
      gl.moveTo(ox, oy + i * ts).lineTo(ox + board, oy + i * ts);
    }
    gl.stroke({ color: 0x1b1b20, width: 1, alpha: 0.5 });
    layers.gridLayer.addChild(gl);
    const edgeStyle = new TextStyle({
      fontSize: 10,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fill: 0x98917f,
    });
    for (let i = 0; i < GRID_SIZE; i++) {
      const cx = new Text({ text: String(i), style: edgeStyle });
      cx.anchor.set(0.5, 1);
      cx.position.set(ox + i * ts + ts / 2, oy - 2);
      layers.gridLayer.addChild(cx);
      const cy = new Text({ text: String(i), style: edgeStyle });
      cy.anchor.set(1, 0.5);
      cy.position.set(ox - 4, oy + i * ts + ts / 2);
      layers.gridLayer.addChild(cy);
    }

    // --- REGION CENTERS (XFrac/YFrac are data; the marker radius is visual
    //     only — WorldRegions.Radius has no defined world extent to scale by) ---
    layers.regionLayer.removeChildren();
    if (showRegions) {
      const rg = new Graphics();
      for (const region of regions) {
        const px = ox + region.u * board;
        const py = oy + region.v * board;
        const color = stableColor(region.id);
        const isSelected = selection?.kind === 'region' && selection.id === region.id;
        rg.circle(px, py, isSelected ? 8 : 6).fill({ color, alpha: 0.9 });
        rg.circle(px, py, isSelected ? 12 : 9).stroke({
          color,
          width: isSelected ? 2 : 1,
          alpha: isSelected ? 0.9 : 0.5,
        });
        if (isSelected || ts >= 56) {
          const label = new Text({
            text: region.name,
            style: new TextStyle({
              fontSize: 11,
              fontFamily: 'Inter, sans-serif',
              fill: 0xfcfaf5,
              stroke: { color: 0x1b1b20, width: 3 },
            }),
          });
          label.anchor.set(0.5, 1);
          label.position.set(px, py - 12);
          layers.regionLayer.addChild(label);
        }
      }
      layers.regionLayer.addChild(rg);
    }

    // --- POI MARKERS: diamonds colored by their resolved region ---
    layers.poiLayer.removeChildren();
    if (showPois) {
      const pg = new Graphics();
      for (const poi of pois) {
        const px = ox + poi.u * board;
        const py = oy + poi.v * board;
        const color = poi.regionId !== null ? stableColor(poi.regionId) : 0x7d766a;
        const isSelected = selection?.kind === 'poi' && selection.id === poi.id;
        const r = isSelected ? 6 : 3.5;
        pg.moveTo(px, py - r)
          .lineTo(px + r, py)
          .lineTo(px, py + r)
          .lineTo(px - r, py)
          .closePath()
          .fill({ color, alpha: 0.95 })
          .stroke({ color: 0x1b1b20, width: 1, alpha: 0.7 });
        if (isSelected) {
          pg.circle(px, py, 11).stroke({ color: 0x3a8a99, width: 2, alpha: 0.95 });
          const label = new Text({
            text: poi.name,
            style: new TextStyle({
              fontSize: 11,
              fontFamily: 'Inter, sans-serif',
              fill: 0xfcfaf5,
              stroke: { color: 0x1b1b20, width: 3 },
            }),
          });
          label.anchor.set(0.5, 1);
          label.position.set(px, py - 14);
          layers.poiLayer.addChild(label);
        }
      }
      layers.poiLayer.addChild(pg);
    }

    // --- SELECTED CELL ---
    layers.uiLayer.removeChildren();
    if (selection?.kind === 'cell') {
      const sg = new Graphics();
      sg.rect(ox + selection.x * ts, oy + selection.y * ts, ts, ts).stroke({
        color: 0x3a8a99,
        width: 3,
      });
      layers.uiLayer.addChild(sg);
    }

    app.render();
  }, [ready, size, geometry, grid, paints, pois, regions, selection, showPois, showRegions]);

  // ---- pointer interaction (DOM level: an 8x8 board needs no camera) ----

  const locate = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      const { ts, board, ox, oy } = geometry();

      let poiHit: PoiMarker | null = null;
      let poiDist = POI_HIT_RADIUS;
      if (showPois) {
        for (const poi of pois) {
          const d = Math.hypot(ox + poi.u * board - mx, oy + poi.v * board - my);
          if (d < poiDist) {
            poiDist = d;
            poiHit = poi;
          }
        }
      }
      let regionHit: RegionMarker | null = null;
      let regionDist = REGION_HIT_RADIUS;
      if (showRegions) {
        for (const region of regions) {
          const d = Math.hypot(ox + region.u * board - mx, oy + region.v * board - my);
          if (d < regionDist) {
            regionDist = d;
            regionHit = region;
          }
        }
      }
      const cx = Math.floor((mx - ox) / ts);
      const cy = Math.floor((my - oy) / ts);
      const inGrid = cx >= 0 && cx < GRID_SIZE && cy >= 0 && cy < GRID_SIZE;
      return { mx, my, poiHit, regionHit, cell: inGrid ? { x: cx, y: cy } : null };
    },
    [geometry, pois, regions, showPois, showRegions],
  );

  const handleMove = (e: React.MouseEvent) => {
    const at = locate(e.clientX, e.clientY);
    if (!at) return;
    if (mode === 'paint' && paintingRef.current && at.cell) {
      onPaint(at.cell.x, at.cell.y);
    }
    if (at.poiHit) {
      setHover({ px: at.mx, py: at.my, title: at.poiHit.name, subtitle: at.poiHit.poiType });
    } else if (at.regionHit) {
      setHover({ px: at.mx, py: at.my, title: at.regionHit.name, subtitle: at.regionHit.id });
    } else if (at.cell) {
      const cell = grid.cells[at.cell.y][at.cell.x];
      if (cell) {
        const biome = paints.get(cell.name) ?? cell.biomeType;
        setHover({
          px: at.mx,
          py: at.my,
          title: `${cell.name} — ${biome}`,
          subtitle:
            cell.settlementType !== '' && cell.settlementType !== 'None'
              ? `${cell.settlementType} · ${cell.description}`
              : cell.description,
        });
      } else {
        setHover({ px: at.mx, py: at.my, title: `${at.cell.x}_${at.cell.y}`, subtitle: 'no WorldLayout row' });
      }
    } else {
      setHover(null);
    }
  };

  const handleDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const at = locate(e.clientX, e.clientY);
    if (!at) return;
    if (mode === 'paint') {
      if (at.cell) {
        paintingRef.current = true;
        onPaint(at.cell.x, at.cell.y);
      }
      return;
    }
    if (at.poiHit) onSelect({ kind: 'poi', id: at.poiHit.id });
    else if (at.regionHit) onSelect({ kind: 'region', id: at.regionHit.id });
    else if (at.cell) onSelect({ kind: 'cell', x: at.cell.x, y: at.cell.y });
  };

  const endPaint = () => {
    paintingRef.current = false;
  };

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden bg-dust-900 ${
        mode === 'paint' ? 'cursor-crosshair' : 'cursor-pointer'
      }`}
      onMouseMove={handleMove}
      onMouseDown={handleDown}
      onMouseUp={endPaint}
      onMouseLeave={() => {
        endPaint();
        setHover(null);
      }}
    >
      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 max-w-64 rounded border border-dust-700 bg-dust-900/95 px-2 py-1 text-xs"
          style={{
            left: Math.min(hover.px + 12, Math.max(0, size.width - 220)),
            top: Math.min(hover.py + 12, Math.max(0, size.height - 60)),
          }}
        >
          <p className="font-mono text-dust-100">{hover.title}</p>
          {hover.subtitle !== '' && <p className="mt-0.5 text-dust-400">{hover.subtitle}</p>}
        </div>
      )}
    </div>
  );
}
