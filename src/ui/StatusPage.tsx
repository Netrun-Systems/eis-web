import React, { useEffect, useState } from 'react';

interface ApiHealth {
  ok: boolean;
  repoPath: string;
  head: string | null;
  manifestGeneratedAt: string;
}

/** Live strip over /api/health (WEB-003). Shows the connected EISCORE repo +
 * HEAD, or how to start the API when the fetch fails. */
function ApiHealthStrip() {
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiHealth>;
      })
      .then((h) => {
        if (!cancelled) setHealth(h);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="rounded border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-300">
        API not running — start with <code className="font-mono">npm run dev:api</code>
      </div>
    );
  }
  if (!health) {
    return (
      <div className="rounded border border-eis-border px-3 py-2 text-sm text-eis-text-secondary">
        Checking API…
      </div>
    );
  }
  return (
    <div className="rounded border border-eis-green/50 bg-eis-green/5 px-3 py-2 text-sm text-eis-text">
      <span className="text-eis-green font-semibold">API connected</span>
      {' — '}
      <code className="font-mono text-xs">{health.repoPath}</code>
      {' @ '}
      <code className="font-mono text-xs text-eis-green">{health.head ?? '?'}</code>
    </div>
  );
}

/**
 * Plain status page for the revival branch. No hero, no decoration.
 */
export function StatusPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-xl font-bold text-eis-text">EISWeb — revival in progress</h2>
      <ApiHealthStrip />
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
