import React from 'react';

export function Header() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-dust-200 bg-dust-0 px-4 dark:border-dust-700 dark:bg-dust-800">
      <span className="text-xs text-dust-600 dark:text-dust-300">
        EISWeb — world-design front-end for EISCORE
      </span>
      <span className="font-mono text-[11px] text-dust-600 dark:text-dust-400">
        revival/worldgen
      </span>
    </header>
  );
}
