// ============================================================
// EIS Touch Context Menu — Radial/arc menu on long-press
// Shows interaction options around the touch point
// ============================================================

import React, { useCallback, useMemo } from 'react';
import { useSpring, animated, config } from 'react-spring';

interface MenuItem {
  id: string;
  icon: string;
  label: string;
  color?: string;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

const ITEM_RADIUS = 70; // distance from center
const ITEM_SIZE = 48;

export function ContextMenu({ x, y, items, onSelect, onClose }: ContextMenuProps) {
  const springProps = useSpring({
    from: { scale: 0, opacity: 0 },
    to: { scale: 1, opacity: 1 },
    config: config.wobbly,
  });

  // Calculate positions in a circle
  const positions = useMemo(() => {
    const angleStep = (2 * Math.PI) / items.length;
    const startAngle = -Math.PI / 2; // Start from top
    return items.map((item, i) => {
      const angle = startAngle + i * angleStep;
      return {
        ...item,
        cx: Math.cos(angle) * ITEM_RADIUS,
        cy: Math.sin(angle) * ITEM_RADIUS,
      };
    });
  }, [items]);

  // Clamp position to stay within viewport
  const menuX = Math.max(ITEM_RADIUS + ITEM_SIZE, Math.min(window.innerWidth - ITEM_RADIUS - ITEM_SIZE, x));
  const menuY = Math.max(ITEM_RADIUS + ITEM_SIZE, Math.min(window.innerHeight - ITEM_RADIUS - ITEM_SIZE, y));

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50" onClick={onClose} onTouchEnd={onClose} />

      {/* Menu */}
      <animated.div
        className="fixed z-50 pointer-events-none"
        style={{
          left: menuX,
          top: menuY,
          transform: springProps.scale.to(s => `scale(${s})`),
          opacity: springProps.opacity,
        }}
      >
        {/* Center dot */}
        <div className="absolute w-3 h-3 bg-eis-text-muted/30 rounded-full -translate-x-1.5 -translate-y-1.5" />

        {/* Items */}
        {positions.map(item => (
          <button
            key={item.id}
            className={`
              absolute pointer-events-auto
              w-12 h-12 rounded-full flex flex-col items-center justify-center
              bg-eis-bg-card border border-eis-border shadow-lg
              active:scale-110 transition-transform touch-manipulation
              ${item.color ?? 'text-eis-text'}
            `}
            style={{
              left: item.cx - ITEM_SIZE / 2,
              top: item.cy - ITEM_SIZE / 2,
            }}
            onClick={() => {
              onSelect(item.id);
              onClose();
            }}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="text-[8px] mt-0.5 leading-none text-eis-text-muted">{item.label}</span>
          </button>
        ))}
      </animated.div>
    </>
  );
}

// Predefined menus for different target types
export const NPC_CONTEXT_ITEMS: MenuItem[] = [
  { id: 'talk', icon: '\u{1F4AC}', label: 'Talk', color: 'text-blue-400' },
  { id: 'trade', icon: '\u{1F91D}', label: 'Trade', color: 'text-green-400' },
  { id: 'attack', icon: '\u{2694}', label: 'Attack', color: 'text-red-400' },
  { id: 'examine', icon: '\u{1F50D}', label: 'Examine' },
  { id: 'follow', icon: '\u{1F463}', label: 'Follow', color: 'text-purple-400' },
];

export const OBJECT_CONTEXT_ITEMS: MenuItem[] = [
  { id: 'use', icon: '\u{1F91A}', label: 'Use', color: 'text-green-400' },
  { id: 'examine', icon: '\u{1F50D}', label: 'Examine' },
  { id: 'pickup', icon: '\u{1F4E5}', label: 'Pick Up', color: 'text-yellow-400' },
];

export const TILE_CONTEXT_ITEMS: MenuItem[] = [
  { id: 'paint_biome', icon: '\u{1F3A8}', label: 'Biome' },
  { id: 'place_object', icon: '\u{1F4E6}', label: 'Object' },
  { id: 'create_location', icon: '\u{1F4CD}', label: 'Location' },
  { id: 'info', icon: '\u{2139}', label: 'Info' },
];
