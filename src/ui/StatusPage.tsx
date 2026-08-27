import React from 'react';

/**
 * Plain status page for the revival branch. No hero, no decoration.
 */
export function StatusPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-xl font-bold text-eis-text">EISWeb — revival in progress</h2>
      <p className="text-sm text-eis-text-secondary leading-relaxed">
        This repo was stripped to its salvage core on branch <code className="font-mono text-eis-green">revival/worldgen</code> (WEB-002).
        EISWeb is being rebuilt as a world-design and CSV-authoring front-end for the EISCORE
        Unreal project: the EISCORE repository is the database (files + git), and the repo&apos;s own
        Python validators are the single validation authority. The old simulation engine,
        Express/Postgres backend, and stale CSV snapshot are gone — git history preserves them.
      </p>
      <p className="text-sm text-eis-text-secondary leading-relaxed">
        The canonical charter and ticket ledger live in the EISCORE repo:
        {' '}<code className="font-mono text-xs">Documentation/Web/EISWEB_CHARTER.md</code> and
        {' '}<code className="font-mono text-xs">todo.md &sect; EISWeb revival</code>.
        A one-page summary is mirrored here at <code className="font-mono text-xs">docs/CHARTER.md</code>.
      </p>
    </div>
  );
}
