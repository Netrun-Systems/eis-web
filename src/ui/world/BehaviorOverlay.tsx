import React from 'react';
import { useWorldEditorStore } from '../../hooks/useWorldEditor';
import { useSimulationStore } from '../../hooks/useSimulation';

/**
 * BehaviorOverlay renders NPC behavior indicators as an HTML overlay
 * on top of the canvas. Used for toast-style event notifications
 * that would be difficult to render on canvas.
 *
 * The actual behavior lines, need bubbles, and path visualizations
 * are drawn directly on the canvas in WorldMapEditor.tsx for performance.
 */
export function BehaviorOverlay() {
  const { worldMap, editor } = useWorldEditorStore();
  const { world, recentEvents } = useSimulationStore();

  if (!worldMap || !world || !editor.showOverlays.behaviorLines) return null;

  // Show recent location-related events as toasts
  const locationEvents = recentEvents
    .filter(e => e.type === 'behavior' && e.data?.objectId)
    .slice(-5);

  if (locationEvents.length === 0) return null;

  return (
    <div className="absolute top-2 right-2 z-10 space-y-1 pointer-events-none max-w-56">
      {locationEvents.map(event => (
        <div
          key={event.id}
          className="px-2 py-1 bg-eis-bg-card/90 border border-eis-border rounded text-[10px] text-eis-text-secondary animate-fade-in"
        >
          {event.description}
        </div>
      ))}
    </div>
  );
}

/**
 * Legend for behavior colors.
 */
export function BehaviorLegend() {
  const behaviors = [
    { label: 'Seek Food', color: '#22c55e' },
    { label: 'Drink', color: '#3b82f6' },
    { label: 'Combat', color: '#ef4444' },
    { label: 'Trade', color: '#eab308' },
    { label: 'Socialize', color: '#a855f7' },
    { label: 'Rest', color: '#6366f1' },
    { label: 'Train', color: '#f97316' },
    { label: 'Other', color: '#90b9ab' },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {behaviors.map(b => (
        <div key={b.label} className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
          <span className="text-[10px] text-eis-text-muted">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
