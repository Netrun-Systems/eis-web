// ============================================================
// EIS Bottom Action Bar — Context-sensitive action buttons
// Changes buttons based on mode (editor/play/observe) and
// selected entity
// ============================================================

import React from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';
import { useWorldEditorStore } from '../../hooks/useWorldEditor';
import type { EditorTool } from '../../engine/world-map-types';

interface ActionButton {
  id: string;
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  color?: string;
}

interface BottomActionBarProps {
  mode: 'play' | 'editor' | 'observe';
  selectedNpcId?: string | null;
  onPlayerAction?: (action: string) => void;
}

export function BottomActionBar({ mode, selectedNpcId, onPlayerAction }: BottomActionBarProps) {
  const { isPaused, speed, world } = useSimulationStore();
  const { editor, setTool } = useWorldEditorStore();

  const play = () => useSimulationStore.getState().play();
  const pause = () => useSimulationStore.getState().pause();
  const step = () => useSimulationStore.getState().step();
  const setSpeed = (s: 1 | 2 | 5 | 10) => useSimulationStore.getState().setSpeed(s);

  const cycleSpeed = () => {
    const speeds: (1 | 2 | 5 | 10)[] = [1, 2, 5, 10];
    const idx = speeds.indexOf(speed as 1 | 2 | 5 | 10);
    setSpeed(speeds[(idx + 1) % speeds.length]);
  };

  let buttons: ActionButton[] = [];

  if (mode === 'editor') {
    const editorTools: { tool: EditorTool; icon: string; label: string }[] = [
      { tool: 'select', icon: '\u{1F5B1}', label: 'Select' },
      { tool: 'paint_biome', icon: '\u{1F3A8}', label: 'Biome' },
      { tool: 'place_object', icon: '\u{1F4E6}', label: 'Object' },
      { tool: 'place_npc', icon: '\u{1F464}', label: 'NPC' },
      { tool: 'create_location', icon: '\u{1F4CD}', label: 'Location' },
      { tool: 'erase', icon: '\u{1F9F9}', label: 'Erase' },
    ];

    buttons = editorTools.map(t => ({
      id: t.tool,
      icon: t.icon,
      label: t.label,
      onClick: () => setTool(t.tool),
      active: editor.tool === t.tool,
    }));

    // Sim controls
    buttons.push({
      id: 'playpause',
      icon: isPaused ? '\u{25B6}' : '\u{23F8}',
      label: isPaused ? 'Play' : 'Pause',
      onClick: () => (isPaused ? play() : pause()),
    });
  } else if (mode === 'play') {
    if (selectedNpcId && selectedNpcId !== world?.playerId) {
      // NPC interaction mode
      buttons = [
        { id: 'talk', icon: '\u{1F4AC}', label: 'Talk', onClick: () => onPlayerAction?.('talk'), color: 'text-blue-400' },
        { id: 'trade', icon: '\u{1F91D}', label: 'Trade', onClick: () => onPlayerAction?.('trade'), color: 'text-green-400' },
        { id: 'attack', icon: '\u{1F5E1}', label: 'Attack', onClick: () => onPlayerAction?.('attack'), color: 'text-red-400' },
        { id: 'examine', icon: '\u{1F50D}', label: 'Examine', onClick: () => onPlayerAction?.('examine') },
        { id: 'cancel', icon: '\u{2716}', label: 'Cancel', onClick: () => onPlayerAction?.('cancel') },
      ];
    } else {
      // Default play mode
      buttons = [
        { id: 'select', icon: '\u{1F446}', label: 'Select', onClick: () => {} },
        { id: 'center', icon: '\u{1F3AF}', label: 'Center', onClick: () => onPlayerAction?.('center') },
        { id: 'playpause', icon: isPaused ? '\u{25B6}' : '\u{23F8}', label: isPaused ? 'Play' : 'Pause', onClick: () => (isPaused ? play() : pause()) },
        { id: 'speed', icon: `${speed}x`, label: 'Speed', onClick: cycleSpeed },
        { id: 'menu', icon: '\u{2630}', label: 'Menu', onClick: () => onPlayerAction?.('menu') },
      ];
    }
  } else {
    // Observe mode
    buttons = [
      { id: 'select', icon: '\u{1F446}', label: 'Select', onClick: () => {} },
      { id: 'playpause', icon: isPaused ? '\u{25B6}' : '\u{23F8}', label: isPaused ? 'Play' : 'Pause', onClick: () => (isPaused ? play() : pause()) },
      { id: 'step', icon: '\u{23ED}', label: 'Step', onClick: step },
      { id: 'speed', icon: `${speed}x`, label: 'Speed', onClick: cycleSpeed },
      { id: 'menu', icon: '\u{2630}', label: 'Menu', onClick: () => onPlayerAction?.('menu') },
    ];
  }

  return (
    <div className="flex items-center justify-around bg-eis-bg-card border-t border-eis-border px-2 py-1 shrink-0">
      {buttons.map(btn => (
        <button
          key={btn.id}
          onClick={btn.onClick}
          disabled={btn.disabled}
          className={`
            flex flex-col items-center justify-center min-w-[56px] h-14 rounded-lg
            transition-colors touch-manipulation
            ${btn.active
              ? 'bg-eis-green/20 text-eis-green'
              : btn.disabled
                ? 'text-eis-text-muted/40'
                : `${btn.color ?? 'text-eis-text-secondary'} hover:bg-eis-bg-hover active:bg-eis-bg-hover`
            }
          `}
        >
          <span className="text-lg leading-none">{btn.icon}</span>
          <span className="text-[9px] mt-0.5 leading-none">{btn.label}</span>
        </button>
      ))}
    </div>
  );
}
