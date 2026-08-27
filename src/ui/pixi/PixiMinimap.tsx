// ============================================================
// EIS Minimap — Small world overview with viewport indicator
// ============================================================

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { WorldMapState } from '../../engine/world-map-types';
import { BIOME_COLORS } from '../../engine/world-map-types';
import { getFactionColor } from '../../engine/world';

interface MinimapProps {
  worldMap: WorldMapState;
  camera: { x: number; y: number; zoom: number };
  viewportWidth: number;
  viewportHeight: number;
  onJump: (worldX: number, worldY: number) => void;
}

export function PixiMinimap({
  worldMap,
  camera,
  viewportWidth,
  viewportHeight,
  onJump,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const minimapSize = 160;

  const scaleX = minimapSize / worldMap.config.width;
  const scaleY = minimapSize / worldMap.config.height;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = minimapSize;
    canvas.height = minimapSize;

    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, minimapSize, minimapSize);

    // Biome tiles
    for (let y = 0; y < worldMap.config.height; y++) {
      for (let x = 0; x < worldMap.config.width; x++) {
        const tile = worldMap.tiles[y]?.[x];
        if (!tile) continue;
        ctx.fillStyle = BIOME_COLORS[tile.biome];
        ctx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
      }
    }

    // Faction territories (semi-transparent overlay)
    for (let y = 0; y < worldMap.config.height; y++) {
      for (let x = 0; x < worldMap.config.width; x++) {
        const tile = worldMap.tiles[y]?.[x];
        if (!tile?.factionControl) continue;
        const color = getFactionColor(tile.factionControl);
        ctx.fillStyle = color + '30';
        ctx.fillRect(x * scaleX, y * scaleY, scaleX + 0.5, scaleY + 0.5);
      }
    }

    // Viewport rectangle
    const ts = worldMap.config.tileSize * camera.zoom;
    const vpX = (camera.x / worldMap.config.tileSize) * scaleX;
    const vpY = (camera.y / worldMap.config.tileSize) * scaleY;
    const vpW = (viewportWidth / ts) * scaleX;
    const vpH = (viewportHeight / ts) * scaleY;
    ctx.strokeStyle = '#90b9ab';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpX, vpY, vpW, vpH);
  }, [worldMap, camera, viewportWidth, viewportHeight, scaleX, scaleY]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const worldX = (mx / scaleX) * worldMap.config.tileSize;
      const worldY = (my / scaleY) * worldMap.config.tileSize;
      onJump(worldX, worldY);
    },
    [scaleX, scaleY, worldMap.config.tileSize, onJump],
  );

  // Draggable minimap
  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === canvasRef.current) return; // clicking on canvas = jump
    setIsDragging(true);
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleDrag = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    },
    [isDragging, dragOffset],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDrag);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDrag, handleDragEnd]);

  return (
    <div
      className="absolute bottom-2 right-2 border border-dust-200 dark:border-dust-700 rounded overflow-hidden bg-dust-0/80 dark:bg-dust-800/80 cursor-grab active:cursor-grabbing z-20"
      style={{
        transform: position.x || position.y ? `translate(${position.x}px, ${position.y}px)` : undefined,
      }}
      onMouseDown={handleDragStart}
    >
      <canvas
        ref={canvasRef}
        width={minimapSize}
        height={minimapSize}
        className="block cursor-pointer"
        onClick={handleClick}
      />
    </div>
  );
}
