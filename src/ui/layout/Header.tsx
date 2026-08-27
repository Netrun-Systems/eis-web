import React from 'react';

export function Header() {
  return (
    <header className="h-14 bg-eis-bg-card border-b border-eis-border flex items-center justify-between px-4 shrink-0">
      <span className="text-sm font-mono text-eis-text">EISWeb — world-design front-end for EISCORE</span>
      <span className="text-xs text-eis-text-muted">revival/worldgen</span>
    </header>
  );
}
