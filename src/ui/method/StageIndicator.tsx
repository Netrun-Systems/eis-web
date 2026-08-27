import React from 'react';
import { Link } from 'react-router-dom';
import { METHOD_STAGES, stageIndexById } from '../../content/method';

/**
 * WEB-014 — breadcrumb-style stage indicator: "Stage 4 of 9 — Space Types",
 * linking back to the /workflow spine, plus prev/next links for the foot of
 * each vocabulary editor. Stage numbering is §3's dependency order (the
 * eight vocabulary tables, then the Brief).
 */

export function StageIndicator({ stageId }: { stageId: string }) {
  const idx = stageIndexById(stageId);
  if (idx < 0) return null;
  const stage = METHOD_STAGES[idx];
  return (
    <Link
      to="/workflow"
      className="inline-flex items-center gap-2 rounded border border-dust-700 bg-dust-800 px-2.5 py-1 text-xs text-dust-300 hover:border-petrol-dark hover:text-petrol-light"
      title="Back to the workflow spine"
    >
      <span className="font-mono text-petrol-light">
        Stage {idx + 1} of {METHOD_STAGES.length}
      </span>
      <span aria-hidden className="text-dust-500">
        —
      </span>
      <span>{stage.title}</span>
    </Link>
  );
}

/** Next / previous stage links, in §3 order — the foot of each stage page. */
export function StagePrevNext({ stageId }: { stageId: string }) {
  const idx = stageIndexById(stageId);
  if (idx < 0) return null;
  const prev = idx > 0 ? METHOD_STAGES[idx - 1] : null;
  const next = idx < METHOD_STAGES.length - 1 ? METHOD_STAGES[idx + 1] : null;
  return (
    <nav className="flex items-center justify-between gap-2 border-t border-dust-700 pt-3 text-sm">
      {prev !== null ? (
        <Link
          to={prev.route}
          className="text-petrol-light hover:text-petrol hover:underline"
          title={`Previous stage: ${prev.title}`}
        >
          &larr; Stage {idx}: {prev.title}
        </Link>
      ) : (
        <span className="text-dust-500">Start of the authoring order</span>
      )}
      {next !== null ? (
        <Link
          to={next.route}
          className="text-right text-petrol-light hover:text-petrol hover:underline"
          title={`Next stage: ${next.title}`}
        >
          Stage {idx + 2}: {next.title} &rarr;
        </Link>
      ) : (
        <span className="text-right text-dust-500">End — generation runs in the editor</span>
      )}
    </nav>
  );
}
