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
      className="inline-flex items-center gap-2 rounded border border-dust-200 bg-dust-0 px-2.5 py-1 text-xs text-dust-600 transition-colors hover:border-petrol hover:text-petrol-ink dark:border-dust-700 dark:bg-dust-800 dark:text-dust-300 dark:hover:border-petrol-dark dark:hover:text-petrol-light"
      title="Back to the workflow spine"
    >
      <span className="font-mono tabular-nums text-petrol-ink dark:text-petrol-light">
        Stage {idx + 1} of {METHOD_STAGES.length}
      </span>
      <span aria-hidden className="text-dust-400 dark:text-dust-500">
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
    <nav className="flex items-center justify-between gap-2 border-t border-dust-200 pt-3 text-sm dark:border-dust-700">
      {prev !== null ? (
        <Link
          to={prev.route}
          className="text-petrol-ink hover:text-petrol-dark hover:underline dark:text-petrol-light dark:hover:text-petrol"
          title={`Previous stage: ${prev.title}`}
        >
          &larr; Stage {idx}: {prev.title}
        </Link>
      ) : (
        <span className="text-dust-600 dark:text-dust-400">Start of the authoring order</span>
      )}
      {next !== null ? (
        <Link
          to={next.route}
          className="text-right text-petrol-ink hover:text-petrol-dark hover:underline dark:text-petrol-light dark:hover:text-petrol"
          title={`Next stage: ${next.title}`}
        >
          Stage {idx + 2}: {next.title} &rarr;
        </Link>
      ) : (
        <span className="text-right text-dust-600 dark:text-dust-400">
          End — generation runs in the editor
        </span>
      )}
    </nav>
  );
}
