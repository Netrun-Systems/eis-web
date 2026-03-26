// ============================================================
// EIS Tile Texture Generator — Programmatic biome textures
// Generates and caches Pixi textures for each biome type
// ============================================================

import { Graphics, Texture, type Renderer } from 'pixi.js';
import type { BiomeType } from '../../engine/world-map-types';

const textureCache = new Map<string, Texture>();

/** Hex color string to numeric */
function hex(color: string): number {
  return parseInt(color.replace('#', ''), 16);
}

/** Generate a single tile texture for a given biome at a given tile size. */
function generateBiomeGraphics(biome: BiomeType, tileSize: number): Graphics {
  const g = new Graphics();
  const ts = tileSize;

  switch (biome) {
    case 'water': {
      g.rect(0, 0, ts, ts).fill(0x1e40af);
      // Subtle wave lines
      for (let i = 0; i < 3; i++) {
        const y = ts * 0.25 + i * ts * 0.25;
        g.moveTo(0, y).lineTo(ts * 0.25, y - 2).lineTo(ts * 0.5, y).lineTo(ts * 0.75, y + 2).lineTo(ts, y);
        g.stroke({ color: 0x3b82f6, width: 1, alpha: 0.4 });
      }
      break;
    }
    case 'grassland': {
      g.rect(0, 0, ts, ts).fill(0x65a30d);
      // Scattered darker dots for grass tufts
      const dots = [[0.2, 0.3], [0.6, 0.15], [0.8, 0.7], [0.35, 0.8], [0.5, 0.5]];
      for (const [dx, dy] of dots) {
        g.circle(dx * ts, dy * ts, 1.2).fill({ color: 0x4d7c0f, alpha: 0.6 });
      }
      break;
    }
    case 'forest': {
      g.rect(0, 0, ts, ts).fill(0x166534);
      // Triangle tree shapes
      const trees = [[0.3, 0.4], [0.7, 0.6]];
      for (const [tx, ty] of trees) {
        const cx = tx * ts;
        const cy = ty * ts;
        g.moveTo(cx, cy - 4).lineTo(cx - 3, cy + 2).lineTo(cx + 3, cy + 2).closePath();
        g.fill({ color: 0x22c55e, alpha: 0.5 });
      }
      break;
    }
    case 'dense_forest': {
      g.rect(0, 0, ts, ts).fill(0x14532d);
      // More trees with shadow
      const trees = [[0.2, 0.3], [0.5, 0.2], [0.8, 0.5], [0.4, 0.7], [0.7, 0.8]];
      for (const [tx, ty] of trees) {
        const cx = tx * ts;
        const cy = ty * ts;
        g.moveTo(cx, cy - 3).lineTo(cx - 2.5, cy + 2).lineTo(cx + 2.5, cy + 2).closePath();
        g.fill({ color: 0x166534, alpha: 0.7 });
      }
      // Shadow overlay
      g.rect(0, 0, ts, ts).fill({ color: 0x000000, alpha: 0.15 });
      break;
    }
    case 'desert': {
      g.rect(0, 0, ts, ts).fill(0xd97706);
      // Dotted dune lines
      for (let i = 0; i < 2; i++) {
        const y = ts * 0.35 + i * ts * 0.35;
        for (let x = 0; x < ts; x += 4) {
          g.circle(x, y + Math.sin(x * 0.3) * 1.5, 0.5).fill({ color: 0xfbbf24, alpha: 0.4 });
        }
      }
      break;
    }
    case 'mountain': {
      g.rect(0, 0, ts, ts).fill(0x6b7280);
      // White snow cap triangle
      const cx = ts * 0.5;
      g.moveTo(cx, ts * 0.15).lineTo(cx - ts * 0.2, ts * 0.4).lineTo(cx + ts * 0.2, ts * 0.4).closePath();
      g.fill({ color: 0xffffff, alpha: 0.5 });
      // Gray body
      g.moveTo(cx, ts * 0.15).lineTo(cx - ts * 0.35, ts * 0.85).lineTo(cx + ts * 0.35, ts * 0.85).closePath();
      g.fill({ color: 0x9ca3af, alpha: 0.3 });
      break;
    }
    case 'beach': {
      g.rect(0, 0, ts, ts).fill(0xfbbf24);
      // Wave edge at bottom
      g.moveTo(0, ts * 0.85).lineTo(ts * 0.25, ts * 0.8).lineTo(ts * 0.5, ts * 0.85).lineTo(ts * 0.75, ts * 0.8).lineTo(ts, ts * 0.85).lineTo(ts, ts).lineTo(0, ts).closePath();
      g.fill({ color: 0x60a5fa, alpha: 0.25 });
      break;
    }
    case 'swamp': {
      g.rect(0, 0, ts, ts).fill(0x4d7c0f);
      // Murky overlay
      g.rect(0, 0, ts, ts).fill({ color: 0x3b2f1a, alpha: 0.3 });
      // Puddle spots
      g.circle(ts * 0.3, ts * 0.6, 2).fill({ color: 0x1e40af, alpha: 0.25 });
      g.circle(ts * 0.7, ts * 0.35, 1.5).fill({ color: 0x1e40af, alpha: 0.2 });
      break;
    }
    case 'urban': {
      g.rect(0, 0, ts, ts).fill(0x6b7280);
      // Grid pattern
      for (let x = 0; x < ts; x += ts / 3) {
        g.moveTo(x, 0).lineTo(x, ts).stroke({ color: 0x9ca3af, width: 0.5, alpha: 0.3 });
      }
      for (let y = 0; y < ts; y += ts / 3) {
        g.moveTo(0, y).lineTo(ts, y).stroke({ color: 0x9ca3af, width: 0.5, alpha: 0.3 });
      }
      break;
    }
    case 'farmland': {
      g.rect(0, 0, ts, ts).fill(0xa3e635);
      // Striped rows
      for (let y = 0; y < ts; y += 4) {
        g.rect(0, y, ts, 2).fill({ color: 0x78350f, alpha: 0.2 });
      }
      break;
    }
    case 'ruins': {
      g.rect(0, 0, ts, ts).fill(0x78716c);
      // Scattered rubble
      const rubble = [[0.2, 0.4, 2], [0.6, 0.2, 1.5], [0.5, 0.7, 1.8], [0.8, 0.5, 1.2]];
      for (const [rx, ry, rs] of rubble) {
        g.rect(rx * ts - rs / 2, ry * ts - rs / 2, rs, rs).fill({ color: 0x57534e, alpha: 0.5 });
      }
      break;
    }
    case 'tundra': {
      g.rect(0, 0, ts, ts).fill(0x9ca3af);
      // Light blue-white frost
      g.rect(0, 0, ts, ts).fill({ color: 0xe0f2fe, alpha: 0.25 });
      // Sparse white dots
      g.circle(ts * 0.3, ts * 0.3, 1).fill({ color: 0xffffff, alpha: 0.4 });
      g.circle(ts * 0.7, ts * 0.7, 0.8).fill({ color: 0xffffff, alpha: 0.3 });
      break;
    }
  }

  return g;
}

/**
 * Get (or generate and cache) a texture for a biome type.
 * Must be called after the renderer is available.
 */
export function getBiomeTexture(renderer: Renderer, biome: BiomeType, tileSize: number): Texture {
  const key = `${biome}_${tileSize}`;
  let tex = textureCache.get(key);
  if (tex) return tex;

  const g = generateBiomeGraphics(biome, tileSize);
  tex = renderer.generateTexture(g);
  g.destroy();
  textureCache.set(key, tex);
  return tex;
}

/** Clear all cached textures (call on unmount or world change). */
export function clearTileTextureCache() {
  for (const tex of textureCache.values()) {
    tex.destroy(true);
  }
  textureCache.clear();
}
