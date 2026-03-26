import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';
import { getFactionForNPC, getFactionColor } from '../../engine/world';
import { useNavigate } from 'react-router-dom';

const BIOME_ZONES = [
  { name: 'Forests', x: 50, y: 50, w: 250, h: 200, color: 'rgba(40, 80, 40, 0.3)' },
  { name: 'Desert Wastelands', x: 400, y: 300, w: 350, h: 250, color: 'rgba(120, 90, 40, 0.3)' },
  { name: 'Remnant Enclave', x: 100, y: 300, w: 200, h: 200, color: 'rgba(40, 60, 100, 0.3)' },
  { name: 'Raider Territory', x: 350, y: 50, w: 250, h: 200, color: 'rgba(100, 40, 40, 0.3)' },
  { name: 'Peaceful Village', x: 200, y: 150, w: 150, h: 150, color: 'rgba(80, 100, 40, 0.3)' },
  { name: 'Machine Zones', x: 600, y: 100, w: 180, h: 180, color: 'rgba(60, 60, 80, 0.3)' },
];

export function WorldMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { world, selectedNPCId, selectNPC, tickCounter } = useSimulationStore();
  const [hoveredNPC, setHoveredNPC] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const navigate = useNavigate();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !world) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0f1419';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#1a2028';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Biome zones
    for (const zone of BIOME_ZONES) {
      ctx.fillStyle = zone.color;
      ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);

      ctx.font = '11px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.textAlign = 'center';
      ctx.fillText(zone.name, zone.x + zone.w / 2, zone.y + zone.h / 2);
    }

    // Draw NPCs
    for (const npc of world.npcs) {
      const faction = getFactionForNPC(world, npc);
      const color = faction ? getFactionColor(faction.name) : '#5a6878';
      const isSelected = npc.id === selectedNPCId;
      const isHovered = npc.id === hoveredNPC;

      const radius = isSelected ? 6 : isHovered ? 5 : 4;

      // Glow for selected
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(npc.position.x, npc.position.y, 12, 0, 2 * Math.PI);
        ctx.fillStyle = color + '30';
        ctx.fill();
      }

      // Dot
      ctx.beginPath();
      ctx.arc(npc.position.x, npc.position.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Border
      if (isSelected || isHovered) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Name label for selected/hovered
      if (isSelected || isHovered) {
        ctx.font = '10px Inter, sans-serif';
        ctx.fillStyle = '#e0e6ed';
        ctx.textAlign = 'center';
        ctx.fillText(npc.name, npc.position.x, npc.position.y - 10);
      }
    }
  }, [world, selectedNPCId, hoveredNPC, tickCounter]);

  useEffect(() => { draw(); }, [draw]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!world || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find closest NPC
    let closest: string | null = null;
    let closestDist = Infinity;
    for (const npc of world.npcs) {
      const dx = npc.position.x - x;
      const dy = npc.position.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 15 && dist < closestDist) {
        closest = npc.id;
        closestDist = dist;
      }
    }
    selectNPC(closest);
  }, [world, selectNPC]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!world || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const npc of world.npcs) {
      const dx = npc.position.x - x;
      const dy = npc.position.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < 15) {
        navigate(`/npcs/${npc.id}`);
        break;
      }
    }
  }, [world, navigate]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!world || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let found: string | null = null;
    for (const npc of world.npcs) {
      const dx = npc.position.x - x;
      const dy = npc.position.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < 15) {
        found = npc.id;
        setTooltip({
          x: e.clientX - rect.left + 10,
          y: e.clientY - rect.top - 10,
          text: `${npc.name} (${npc.species}) - ${npc.emotionalState}`,
        });
        break;
      }
    }
    setHoveredNPC(found);
    if (!found) setTooltip(null);
  }, [world]);

  if (!world) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-eis-text">World Map</h2>
      <div className="relative eis-card p-0 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair"
          style={{ height: '600px' }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { setHoveredNPC(null); setTooltip(null); }}
        />
        {tooltip && (
          <div
            className="absolute bg-eis-bg-card border border-eis-border rounded px-2 py-1 text-xs text-eis-text pointer-events-none z-10"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {world.factions.map(f => (
          <div key={f.id} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getFactionColor(f.name) }} />
            <span className="text-xs text-eis-text-secondary">{f.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
