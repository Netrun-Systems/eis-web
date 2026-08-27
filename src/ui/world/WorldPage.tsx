// ============================================================
// WEB-010 — /world. The EISCORE world view (real WorldLayout /
// WorldRegions / WorldPOIs / crosswalk data) is the landing
// state; the WEB-002 JSON sandbox survives behind a tab — its
// object catalog informs later tickets.
// ============================================================

import React, { useState } from 'react';
import { MethodContext } from '../method/MethodContext';
import { EiscoreWorld } from './EiscoreWorld';
import { WorldCanvas } from './WorldCanvas';

type WorldTab = 'world' | 'sandbox';

export function WorldPage() {
  const [tab, setTab] = useState<WorldTab>('world');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-dust-200 bg-dust-0 px-3 pt-2 dark:border-dust-700 dark:bg-dust-800">
        <div className="flex items-end gap-4">
          <h2 className="page-title !text-xl">World</h2>
          <div className="flex gap-1">
            <TabButton active={tab === 'world'} onClick={() => setTab('world')}>
              EISCORE world
            </TabButton>
            <TabButton active={tab === 'sandbox'} onClick={() => setTab('sandbox')}>
              Sandbox
            </TabButton>
          </div>
        </div>
        {tab === 'world' && (
          <div className="pb-2 pt-1.5">
            <MethodContext surface="world-canvas" />
          </div>
        )}
        {tab === 'sandbox' && (
          <p className="pb-2 pt-1.5 text-xs text-dust-600 dark:text-dust-400">
            The WEB-002 JSON sandbox — a local toy world, disconnected from EISCORE data.
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1">{tab === 'world' ? <EiscoreWorld /> : <WorldCanvas />}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-t border border-b-0 px-3 py-1.5 text-xs transition-colors ${
        active
          ? 'border-dust-200 bg-dust-50 font-medium text-petrol-ink dark:border-dust-700 dark:bg-dust-900 dark:text-petrol-light'
          : 'border-transparent text-dust-600 hover:text-dust-900 dark:text-dust-400 dark:hover:text-dust-100'
      }`}
    >
      {children}
    </button>
  );
}
