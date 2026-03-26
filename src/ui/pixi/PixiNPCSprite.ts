// ============================================================
// EIS NPC Rendering — Programmatic NPC sprites for PixiJS
// ============================================================

import { Graphics, Text, TextStyle } from 'pixi.js';
import type { NPC } from '../../engine/types';
import type { WorldMapState, NPCLocationState } from '../../engine/world-map-types';
import { getFactionColor } from '../../engine/world';

const BEHAVIOR_COLORS: Record<string, number> = {
  food: 0x22c55e,
  eat: 0x22c55e,
  cook: 0x22c55e,
  drink: 0x3b82f6,
  water: 0x3b82f6,
  fight: 0xef4444,
  combat: 0xef4444,
  attack: 0xef4444,
  trade: 0xeab308,
  social: 0xa855f7,
  talk: 0xa855f7,
  rest: 0x6366f1,
  sleep: 0x6366f1,
  train: 0xf97316,
  study: 0xf97316,
};

const NEED_EMOJIS: Record<string, string> = {
  hunger: '\u{1F356}',
  thirst: '\u{1F4A7}',
  rest: '\u{1F4A4}',
  socialInteraction: '\u{1F465}',
  energy: '\u{26A1}',
  safety: '\u{1F6E1}',
};

export function getBehaviorColor(behavior: string | null): number {
  if (!behavior) return 0x666666;
  const b = behavior.toLowerCase();
  for (const [key, color] of Object.entries(BEHAVIOR_COLORS)) {
    if (b.includes(key)) return color;
  }
  return 0x90b9ab;
}

function getTopNeed(npc: NPC): { key: string; value: number } {
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

export interface NPCRenderOptions {
  showBehaviorLines: boolean;
  showNeedBubbles: boolean;
  selectedNpcId: string | null;
  zoom: number;
  tileSize: number;
  animTick: number; // for pulsing animations
}

/**
 * Render a single NPC onto a Graphics object.
 * Returns any Text objects that need to be managed separately.
 */
export function renderNPC(
  g: Graphics,
  npc: NPC,
  worldMap: WorldMapState,
  opts: NPCRenderOptions,
): Text[] {
  const ts = opts.tileSize;
  const x = npc.position.x * ts + ts / 2;
  const y = npc.position.y * ts + ts / 2;
  const isSelected = opts.selectedNpcId === npc.id;
  const isPlayer = npc.isPlayer === true;
  const radius = isPlayer ? ts * 0.4 : ts * 0.28;

  // Faction color
  const factionName = npc.groupAffiliations[0] ?? '';
  const colorStr = getFactionColor(factionName);
  const color = parseInt(colorStr.replace('#', ''), 16);

  const texts: Text[] = [];

  // Selection glow
  if (isSelected) {
    const glowAlpha = 0.25 + 0.1 * Math.sin(opts.animTick * 0.08);
    g.circle(x, y, ts * 0.55).fill({ color, alpha: glowAlpha });
  }

  // Combat indicator — pulsing red ring
  if (npc.isInCombat) {
    const pulseR = radius + 4 + 2 * Math.sin(opts.animTick * 0.12);
    const pulseAlpha = 0.4 + 0.2 * Math.sin(opts.animTick * 0.12);
    g.circle(x, y, pulseR).stroke({ color: 0xef4444, width: 2, alpha: pulseAlpha });
  }

  // Base circle
  g.circle(x, y, radius).fill(color);

  // Player white border ring
  if (isPlayer) {
    g.circle(x, y, radius + 2).stroke({ color: 0xffffff, width: 2 });
  }

  // Selected white border
  if (isSelected && !isPlayer) {
    g.circle(x, y, radius + 1.5).stroke({ color: 0xffffff, width: 1.5 });
  }

  // Direction indicator (triangle showing movement direction)
  const locState = worldMap.npcLocations.get(npc.id);
  if (locState?.path && locState.path.length > locState.pathIndex) {
    const nextPoint = locState.path[locState.pathIndex];
    const dx = nextPoint.x * ts + ts / 2 - x;
    const dy = nextPoint.y * ts + ts / 2 - y;
    const angle = Math.atan2(dy, dx);
    const tipDist = radius + 4;
    const tipX = x + Math.cos(angle) * tipDist;
    const tipY = y + Math.sin(angle) * tipDist;
    const baseOffset = 3;
    g.moveTo(tipX, tipY)
      .lineTo(
        tipX - Math.cos(angle - 0.5) * baseOffset,
        tipY - Math.sin(angle - 0.5) * baseOffset,
      )
      .lineTo(
        tipX - Math.cos(angle + 0.5) * baseOffset,
        tipY - Math.sin(angle + 0.5) * baseOffset,
      )
      .closePath()
      .fill({ color: 0xffffff, alpha: 0.6 });
  }

  // Behavior line to target
  if (opts.showBehaviorLines && locState?.targetObjectId) {
    const targetObj = worldMap.objects.find(o => o.id === locState.targetObjectId);
    if (targetObj) {
      const bColor = getBehaviorColor(npc.currentBehavior);
      g.moveTo(x, y)
        .lineTo(targetObj.x * ts + ts / 2, targetObj.y * ts + ts / 2)
        .stroke({ color: bColor, width: 1, alpha: 0.35 });
    }
  }

  // Name label (when selected or zoomed in)
  if ((isSelected || isPlayer) && opts.zoom > 0.6) {
    const nameText = new Text({
      text: npc.name,
      style: new TextStyle({
        fontSize: Math.max(8, 10 * opts.zoom),
        fontFamily: 'Inter, sans-serif',
        fill: isPlayer ? 0x22d3ee : 0xe0e6ed,
        align: 'center',
      }),
    });
    nameText.anchor.set(0.5, 1);
    nameText.position.set(x, y - radius - 4);
    texts.push(nameText);
  }

  // Need bubble
  if (opts.showNeedBubbles && opts.zoom > 0.7) {
    const topNeed = getTopNeed(npc);
    if (topNeed.value > 60) {
      const emoji = NEED_EMOJIS[topNeed.key] ?? '\u{2753}';
      const bubbleText = new Text({
        text: emoji,
        style: new TextStyle({
          fontSize: Math.max(8, 10 * opts.zoom),
          fontFamily: 'sans-serif',
        }),
      });
      bubbleText.anchor.set(0.5, 1);
      bubbleText.position.set(x + ts * 0.3, y - radius - 2);
      texts.push(bubbleText);
    }
  }

  return texts;
}

/**
 * Render durability bar under a world object.
 */
export function renderObjectDurability(
  g: Graphics,
  objX: number,
  objY: number,
  durability: number,
  tileSize: number,
): void {
  const barWidth = tileSize * 0.7;
  const barHeight = 2;
  const barX = objX * tileSize + (tileSize - barWidth) / 2;
  const barY = objY * tileSize + tileSize - 3;

  // Background
  g.rect(barX, barY, barWidth, barHeight).fill({ color: 0x000000, alpha: 0.5 });

  // Fill
  const pct = Math.max(0, Math.min(100, durability)) / 100;
  const fillColor = pct > 0.6 ? 0x22c55e : pct > 0.3 ? 0xeab308 : 0xef4444;
  g.rect(barX, barY, barWidth * pct, barHeight).fill(fillColor);
}
