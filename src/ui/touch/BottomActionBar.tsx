// ============================================================
// EIS Bottom Action Bar — editor tool buttons (touch-friendly)
// WEB-002: simulation modes removed; this is an editor tool bar.
// ============================================================

import React from 'react';
import { useWorldEditorStore } from '../../hooks/useWorldEditor';
import type { EditorTool } from '../../engine/world-map-types';

const EDITOR_TOOLS: { tool: EditorTool; icon: string; label: string }[] = [
  { tool: 'select', icon: '\u{1F5B1}', label: 'Select' },
  { tool: 'paint_biome', icon: '\u{1F3A8}', label: 'Biome' },
  { tool: 'place_object', icon: '\u{1F4E6}', label: 'Object' },
  { tool: 'create_location', icon: '\u{1F4CD}', label: 'Location' },
  { tool: 'faction_paint', icon: '\u{1F3F4}', label: 'Faction' },
  { tool: 'erase', icon: '\u{1F9F9}', label: 'Erase' },
];

export function BottomActionBar() {
  const { editor, setTool } = useWorldEditorStore();

  return (
    <div className="flex items-center justify-around bg-dust-0 dark:bg-dust-800 border-t border-dust-200 dark:border-dust-700 px-2 py-1 shrink-0">
      {EDITOR_TOOLS.map(t => (
        <button
          key={t.tool}
          onClick={() => setTool(t.tool)}
          className={`
            flex flex-col items-center justify-center min-w-[56px] h-14 rounded-lg
            transition-colors touch-manipulation
            ${editor.tool === t.tool
              ? 'bg-petrol-wash dark:bg-petrol-tint text-petrol-ink dark:text-petrol-light'
              : 'text-dust-600 dark:text-dust-300 hover:bg-dust-100 dark:hover:bg-dust-700/50 active:bg-dust-100 dark:active:bg-dust-700/50'
            }
          `}
        >
          <span className="text-lg leading-none">{t.icon}</span>
          <span className="text-[9px] mt-0.5 leading-none">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
