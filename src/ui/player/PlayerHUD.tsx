import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';
import { playerSystem, getVisibleTiles } from '../../engine/player';
import { getFactionForNPC, getFactionColor } from '../../engine/world';
import type { NPC, PlayerAction, WorldState } from '../../engine/types';

// --- Need Bar ---
function NeedBar({ label, value, icon }: { label: string; value: number; icon: string }) {
  const pct = Math.round(value);
  const color = pct > 70 ? 'bg-red-500' : pct > 40 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="w-4">{icon}</span>
      <div className="flex-1 h-2 bg-eis-bg rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-eis-text-muted w-6 text-right">{pct}</span>
    </div>
  );
}

// --- Player Minimap ---
function PlayerMinimap({ player, world }: { player: NPC; world: WorldState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 160;
    canvas.width = size;
    canvas.height = size;

    // Background
    ctx.fillStyle = '#0a0e12';
    ctx.fillRect(0, 0, size, size);

    const sightRadius = 8;
    const visible = getVisibleTiles(player.position, sightRadius);

    // Scale: show 20x20 tile area around player
    const viewRadius = 20;
    const scale = size / (viewRadius * 2);
    const ox = player.position.x - viewRadius;
    const oy = player.position.y - viewRadius;

    // Fog of war — visible area
    ctx.fillStyle = '#1a2028';
    for (const key of visible) {
      const [tx, ty] = key.split(',').map(Number);
      const sx = (tx - ox) * scale;
      const sy = (ty - oy) * scale;
      ctx.fillRect(sx, sy, scale, scale);
    }

    // Draw nearby NPCs
    for (const npc of world.npcs) {
      if (npc.id === player.id) continue;
      if (npc.isDowned) continue;
      const dx = npc.position.x - player.position.x;
      const dy = npc.position.y - player.position.y;
      if (Math.abs(dx) > viewRadius || Math.abs(dy) > viewRadius) continue;

      const sx = (npc.position.x - ox) * scale;
      const sy = (npc.position.y - oy) * scale;

      // Color by faction
      const faction = getFactionForNPC(world, npc);
      ctx.fillStyle = faction ? getFactionColor(faction.name) : '#5a6878';
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw player (center)
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Sight radius circle
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, sightRadius * scale, 0, Math.PI * 2);
    ctx.stroke();

  }, [player.position.x, player.position.y, world.npcs, world.tickCount]);

  return <canvas ref={canvasRef} className="rounded border border-eis-border" />;
}

// --- Context Menu ---
function ContextMenu({
  x, y, target, onAction, onClose,
}: {
  x: number;
  y: number;
  target: NPC;
  onAction: (action: PlayerAction) => void;
  onClose: () => void;
}) {
  const menuItems = [
    { label: 'Talk', action: 'talk' as const, color: 'text-blue-400' },
    { label: 'Trade', action: 'trade' as const, color: 'text-green-400' },
    { label: 'Attack', action: 'attack' as const, color: 'text-red-400' },
  ];

  return (
    <div
      className="absolute bg-eis-bg-card border border-eis-border rounded shadow-lg z-50 py-1"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-1 text-xs text-eis-text-muted border-b border-eis-border">
        {target.name}
      </div>
      {menuItems.map(item => (
        <button
          key={item.action}
          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-eis-bg-hover ${item.color}`}
          onClick={() => {
            onAction({ type: item.action, target: target.id });
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
      <button
        className="w-full text-left px-3 py-1.5 text-sm hover:bg-eis-bg-hover text-eis-text-muted"
        onClick={onClose}
      >
        Cancel
      </button>
    </div>
  );
}

// --- Main HUD ---
export function PlayerHUD() {
  const { world, tickCounter } = useSimulationStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: NPC } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const player = useMemo(() => {
    if (!world?.playerId) return null;
    return world.npcs.find(n => n.id === world.playerId) ?? null;
  }, [world, tickCounter]);

  const controlMode = playerSystem.controlMode;

  const queueAction = useCallback((action: PlayerAction) => {
    if (!world) return;
    world.playerActionQueue.push(action);
  }, [world]);

  const toggleControlMode = useCallback(() => {
    const newMode = controlMode === 'direct' ? 'autonomous' : 'direct';
    playerSystem.setControlMode(newMode);
  }, [controlMode]);

  // Player action log
  const actionLog = useMemo(() => {
    if (!world || !player) return [];
    return world.eventLog
      .filter(e => e.actorId === player.id || e.targetId === player.id)
      .slice(-8);
  }, [world, player, tickCounter]);

  // Nearby NPCs
  const nearbyNPCs = useMemo(() => {
    if (!world || !player) return [];
    return world.npcs.filter(n => {
      if (n.id === player.id || n.isDowned) return false;
      const dx = n.position.x - player.position.x;
      const dy = n.position.y - player.position.y;
      return Math.sqrt(dx * dx + dy * dy) < 8;
    }).slice(0, 6);
  }, [world, player, tickCounter]);

  // World map canvas with fog of war
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !world || !player) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#080c10';
    ctx.fillRect(0, 0, w, h);

    // Camera centered on player
    const camX = player.position.x - w / 2;
    const camY = player.position.y - h / 2;

    // Grid
    ctx.strokeStyle = '#0f1419';
    ctx.lineWidth = 0.5;
    for (let x = -camX % 50; x < w; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = -camY % 50; y < h; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Fog of war circle
    const sightRadius = 8 * 16; // 8 tiles * 16px per tile scale
    const centerX = w / 2;
    const centerY = h / 2;

    // Visible area gradient
    const gradient = ctx.createRadialGradient(centerX, centerY, sightRadius * 0.7, centerX, centerY, sightRadius);
    gradient.addColorStop(0, 'rgba(30, 40, 50, 0)');
    gradient.addColorStop(1, 'rgba(8, 12, 16, 0.9)');

    // Draw NPCs
    for (const npc of world.npcs) {
      if (npc.isDowned) continue;
      const screenX = npc.position.x - camX;
      const screenY = npc.position.y - camY;

      if (screenX < -20 || screenX > w + 20 || screenY < -20 || screenY > h + 20) continue;

      // Distance from player
      const dx = npc.position.x - player.position.x;
      const dy = npc.position.y - player.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > sightRadius / 12) continue; // Beyond sight

      const isPlayer = npc.id === player.id;
      const faction = getFactionForNPC(world, npc);
      const color = isPlayer ? '#22d3ee' : faction ? getFactionColor(faction.name) : '#5a6878';
      const radius = isPlayer ? 6 : 4;

      // Player glow
      if (isPlayer) {
        ctx.beginPath();
        ctx.arc(screenX, screenY, 14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(34, 211, 238, 0.15)';
        ctx.fill();
      }

      // NPC in combat glow
      if (npc.isInCombat) {
        ctx.beginPath();
        ctx.arc(screenX, screenY, 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.fill();
      }

      // Dot
      ctx.beginPath();
      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Name
      ctx.font = '9px Inter, sans-serif';
      ctx.fillStyle = isPlayer ? '#22d3ee' : '#8899aa';
      ctx.textAlign = 'center';
      ctx.fillText(npc.name, screenX, screenY - 10);
    }

    // Tension indicators
    for (const tension of world.activeTensions ?? []) {
      if (tension.status !== 'building' && tension.status !== 'peaked') continue;
      const screenX = tension.location.x - camX;
      const screenY = tension.location.y - camY;

      const pulseRadius = 15 + tension.tensionLevel / 10;
      const alpha = 0.2 + (tension.tensionLevel / 100) * 0.5;

      ctx.beginPath();
      ctx.arc(screenX, screenY, pulseRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(239, 68, 68, ${alpha + 0.2})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Fog overlay
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }, [world, player, tickCounter]);

  useEffect(() => { draw(); }, [draw]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!world || !player || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const camX = player.position.x - rect.width / 2;
    const camY = player.position.y - rect.height / 2;

    const worldX = clickX + camX;
    const worldY = clickY + camY;

    // Check if clicking on an NPC
    for (const npc of world.npcs) {
      if (npc.id === player.id || npc.isDowned) continue;
      const dx = npc.position.x - worldX;
      const dy = npc.position.y - worldY;
      if (Math.sqrt(dx * dx + dy * dy) < 10) {
        // Right-click behavior via context menu (left click = select)
        return;
      }
    }

    // Click to move
    queueAction({ type: 'move', target: { x: worldX, y: worldY } });
  }, [world, player, queueAction]);

  const handleCanvasContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!world || !player || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const camX = player.position.x - rect.width / 2;
    const camY = player.position.y - rect.height / 2;
    const worldX = clickX + camX;
    const worldY = clickY + camY;

    for (const npc of world.npcs) {
      if (npc.id === player.id || npc.isDowned) continue;
      const dx = npc.position.x - worldX;
      const dy = npc.position.y - worldY;
      if (Math.sqrt(dx * dx + dy * dy) < 10) {
        setContextMenu({ x: clickX, y: clickY, target: npc });
        return;
      }
    }
    setContextMenu(null);
  }, [world, player]);

  if (!world || !player) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="eis-card text-center">
          <h2 className="text-xl font-bold text-eis-text mb-2">No Player Character</h2>
          <p className="text-eis-text-muted text-sm">
            Create a player character to enter Play mode.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-0 overflow-hidden">
      {/* Left sidebar: stats */}
      <div className="w-48 bg-eis-bg-card border-r border-eis-border flex flex-col p-3 shrink-0 overflow-y-auto">
        {/* Portrait */}
        <div className="text-center mb-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-cyan-900/30 border-2 border-cyan-500 flex items-center justify-center text-2xl">
            {player.name.charAt(0)}
          </div>
          <h3 className="text-sm font-bold text-cyan-400 mt-1">{player.name}</h3>
          <p className="text-[10px] text-eis-text-muted">
            {player.groupAffiliations[0] ?? 'Independent'} | {player.emotionalState}
          </p>
        </div>

        {/* Health */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-eis-text-muted">HP</span>
            <span className="text-eis-text">{Math.round(player.currentHealth)}/{Math.round(player.maxHealth)}</span>
          </div>
          <div className="h-3 bg-eis-bg rounded-full overflow-hidden">
            <div
              className={`h-full ${player.currentHealth / player.maxHealth > 0.5 ? 'bg-green-500' : player.currentHealth / player.maxHealth > 0.25 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${(player.currentHealth / player.maxHealth) * 100}%` }}
            />
          </div>
        </div>

        {/* Attributes */}
        <div className="mb-3">
          <div className="text-[10px] text-eis-text-muted uppercase mb-1">Attributes</div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
            <span className="text-eis-text-secondary">STR</span><span className="text-eis-text text-right">{player.attributes.strength}</span>
            <span className="text-eis-text-secondary">DEX</span><span className="text-eis-text text-right">{player.attributes.dexterity}</span>
            <span className="text-eis-text-secondary">END</span><span className="text-eis-text text-right">{player.attributes.endurance}</span>
            <span className="text-eis-text-secondary">INT</span><span className="text-eis-text text-right">{player.attributes.intelligence}</span>
            <span className="text-eis-text-secondary">WIS</span><span className="text-eis-text text-right">{player.attributes.wisdom}</span>
            <span className="text-eis-text-secondary">CHA</span><span className="text-eis-text text-right">{player.attributes.charisma}</span>
          </div>
        </div>

        {/* Needs */}
        <div className="mb-3 space-y-1">
          <div className="text-[10px] text-eis-text-muted uppercase mb-1">Needs</div>
          <NeedBar label="Hunger" value={player.needs.hunger} icon="H" />
          <NeedBar label="Thirst" value={player.needs.thirst} icon="T" />
          <NeedBar label="Rest" value={player.needs.rest} icon="R" />
          <NeedBar label="Social" value={player.needs.socialInteraction} icon="S" />
          <NeedBar label="Safety" value={player.needs.safety} icon="!" />
        </div>

        {/* Inventory */}
        <div className="mb-3">
          <div className="text-[10px] text-eis-text-muted uppercase mb-1">
            Inventory | Gold: {player.gold}g
          </div>
          <div className="space-y-0.5">
            {player.inventory.length === 0 ? (
              <span className="text-xs text-eis-text-muted">Empty</span>
            ) : (
              // Group inventory items
              Object.entries(
                player.inventory.reduce((acc: Record<string, number>, item) => {
                  acc[item] = (acc[item] ?? 0) + 1;
                  return acc;
                }, {}),
              ).map(([item, count]) => (
                <button
                  key={item}
                  className="w-full text-left text-xs text-eis-text-secondary hover:text-eis-text hover:bg-eis-bg-hover px-1 py-0.5 rounded"
                  onClick={() => queueAction({ type: 'use_item', data: { item } })}
                >
                  {item} {count > 1 ? `(${count})` : ''}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Nearby NPCs */}
        <div className="mb-3">
          <div className="text-[10px] text-eis-text-muted uppercase mb-1">Nearby</div>
          {nearbyNPCs.length === 0 ? (
            <span className="text-xs text-eis-text-muted">Nobody nearby</span>
          ) : (
            nearbyNPCs.map(npc => (
              <div key={npc.id} className="flex items-center gap-1 text-xs py-0.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: getFactionColor(getFactionForNPC(world, npc)?.name ?? '') }}
                />
                <span className="text-eis-text-secondary truncate flex-1">{npc.name}</span>
                {npc.isInCombat && <span className="text-red-400 text-[10px]">COMBAT</span>}
              </div>
            ))
          )}
        </div>

        {/* Minimap */}
        <div>
          <div className="text-[10px] text-eis-text-muted uppercase mb-1">Minimap</div>
          <PlayerMinimap player={player} world={world} />
        </div>
      </div>

      {/* Main area: world map canvas */}
      <div className="flex-1 flex flex-col relative">
        <canvas
          ref={canvasRef}
          className="flex-1 cursor-crosshair"
          onClick={handleCanvasClick}
          onContextMenu={handleCanvasContextMenu}
        />

        {/* Context menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            target={contextMenu.target}
            onAction={queueAction}
            onClose={() => setContextMenu(null)}
          />
        )}

        {/* Bottom action bar */}
        <div className="bg-eis-bg-card border-t border-eis-border p-2 flex items-center gap-2">
          {/* Action buttons */}
          <button
            className="eis-btn-sm text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
            onClick={() => {
              if (nearbyNPCs.length > 0) queueAction({ type: 'talk', target: nearbyNPCs[0].id });
            }}
            disabled={nearbyNPCs.length === 0}
          >
            Talk
          </button>
          <button
            className="eis-btn-sm text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded"
            onClick={() => {
              if (nearbyNPCs.length > 0) queueAction({ type: 'trade', target: nearbyNPCs[0].id });
            }}
            disabled={nearbyNPCs.length === 0}
          >
            Trade
          </button>
          <button
            className="eis-btn-sm text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
            onClick={() => {
              if (nearbyNPCs.length > 0) queueAction({ type: 'attack', target: nearbyNPCs[0].id });
            }}
            disabled={nearbyNPCs.length === 0}
          >
            Attack
          </button>
          <button
            className="eis-btn-sm text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded"
            onClick={() => queueAction({ type: 'wait' })}
          >
            Wait
          </button>

          <div className="flex-1" />

          {/* Control mode toggle */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-eis-text-muted">Mode:</span>
            <button
              className={`px-2 py-1 rounded ${controlMode === 'direct' ? 'bg-cyan-700 text-white' : 'bg-eis-bg text-eis-text-muted'}`}
              onClick={toggleControlMode}
            >
              Direct
            </button>
            <button
              className={`px-2 py-1 rounded ${controlMode === 'autonomous' ? 'bg-cyan-700 text-white' : 'bg-eis-bg text-eis-text-muted'}`}
              onClick={toggleControlMode}
            >
              Auto
            </button>
          </div>
        </div>

        {/* Action log overlay */}
        <div className="absolute bottom-12 right-3 w-64 bg-eis-bg-card/90 border border-eis-border rounded p-2 max-h-40 overflow-y-auto">
          <div className="text-[10px] text-eis-text-muted uppercase mb-1">Action Log</div>
          {actionLog.map(event => (
            <div key={event.id} className="text-[10px] text-eis-text-secondary py-0.5">
              {event.description}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
