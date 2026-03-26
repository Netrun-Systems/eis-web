// ============================================================
// EIS A* Pathfinding — Tile-based NPC movement
// ============================================================

import type { WorldTile } from './world-map-types';

interface PathNode {
  x: number;
  y: number;
  g: number; // Cost from start
  h: number; // Heuristic to end
  f: number; // g + h
  parent: PathNode | null;
}

interface PathOptions {
  avoidFactions?: string[];
  preferRoads?: boolean;
  maxIterations?: number;
}

/**
 * A* pathfinding on the tile grid.
 * Returns array of {x,y} positions from start to end, or null if no path.
 */
export function findPath(
  start: { x: number; y: number },
  end: { x: number; y: number },
  tiles: WorldTile[][],
  options?: PathOptions,
): { x: number; y: number }[] | null {
  const height = tiles.length;
  const width = tiles[0]?.length ?? 0;
  if (width === 0 || height === 0) return null;

  const sx = Math.round(start.x);
  const sy = Math.round(start.y);
  const ex = Math.round(end.x);
  const ey = Math.round(end.y);

  // Bounds check
  if (sx < 0 || sx >= width || sy < 0 || sy >= height) return null;
  if (ex < 0 || ex >= width || ey < 0 || ey >= height) return null;

  // Start or end not passable — find nearest passable
  if (!tiles[ey][ex].isPassable) return null;

  const maxIterations = options?.maxIterations ?? 2000;
  const avoidFactions = options?.avoidFactions;

  // Open set as a simple sorted array (fine for grids up to 128x128)
  const open: PathNode[] = [];
  const closed = new Set<number>();

  const key = (x: number, y: number) => y * width + x;

  const heuristic = (x: number, y: number) =>
    Math.abs(x - ex) + Math.abs(y - ey); // Manhattan distance

  const startNode: PathNode = {
    x: sx,
    y: sy,
    g: 0,
    h: heuristic(sx, sy),
    f: heuristic(sx, sy),
    parent: null,
  };
  open.push(startNode);

  // Track best g-cost per cell
  const bestG = new Map<number, number>();
  bestG.set(key(sx, sy), 0);

  const neighbors = [
    [0, -1], [0, 1], [-1, 0], [1, 0], // Cardinal
    [-1, -1], [-1, 1], [1, -1], [1, 1], // Diagonal
  ];
  const DIAG_COST = 1.414;

  let iterations = 0;

  while (open.length > 0 && iterations < maxIterations) {
    iterations++;

    // Find node with lowest f
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open[bestIdx];
    open.splice(bestIdx, 1);

    if (current.x === ex && current.y === ey) {
      // Reconstruct path
      const path: { x: number; y: number }[] = [];
      let node: PathNode | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    const ck = key(current.x, current.y);
    if (closed.has(ck)) continue;
    closed.add(ck);

    for (const [dx, dy] of neighbors) {
      const nx = current.x + dx;
      const ny = current.y + dy;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const nk = key(nx, ny);
      if (closed.has(nk)) continue;

      const tile = tiles[ny][nx];
      if (!tile.isPassable) continue;

      // Avoid faction-controlled tiles
      if (avoidFactions && tile.factionControl && avoidFactions.includes(tile.factionControl)) {
        continue;
      }

      // Diagonal check — both adjacent cardinal tiles must be passable
      if (dx !== 0 && dy !== 0) {
        if (!tiles[current.y][nx].isPassable || !tiles[ny][current.x].isPassable) {
          continue;
        }
      }

      const moveCost = dx !== 0 && dy !== 0 ? DIAG_COST : 1;
      // Terrain cost modifiers
      let terrainCost = 1;
      if (tile.biome === 'swamp') terrainCost = 2;
      else if (tile.biome === 'dense_forest') terrainCost = 1.5;
      else if (tile.biome === 'desert') terrainCost = 1.3;
      else if (tile.locationId && options?.preferRoads) terrainCost = 0.7;

      const g = current.g + moveCost * terrainCost;
      const prevG = bestG.get(nk);
      if (prevG !== undefined && g >= prevG) continue;

      bestG.set(nk, g);
      const h = heuristic(nx, ny);
      open.push({
        x: nx,
        y: ny,
        g,
        h,
        f: g + h,
        parent: current,
      });
    }
  }

  return null; // No path found
}

/**
 * Simple direct-line movement (fallback when pathfinding is too expensive).
 * Moves one step toward the target.
 */
export function moveToward(
  pos: { x: number; y: number },
  target: { x: number; y: number },
  speed: number,
): { x: number; y: number } {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist <= speed) return { x: target.x, y: target.y };

  return {
    x: pos.x + (dx / dist) * speed,
    y: pos.y + (dy / dist) * speed,
  };
}
