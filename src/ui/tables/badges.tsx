import React from 'react';
import type { Classification } from '../../api/types';
import { API_DOWN_MESSAGE, describeApiError } from '../../api/client';

/**
 * Classification badges and hazard chips (WEB-004). Every chip carries its
 * word — color is reinforcement, never the sole signal. WEB-015: all chips
 * share the one `.chip` system (size, radius, weight); tones are semantic —
 * petrol = authored/ok, info = generated fact, amber = caution, rust = hazard.
 */

const CLASSIFICATION_STYLE: Record<Classification, string> = {
  authored: 'chip-petrol',
  generated: 'chip-info',
  generated_unverified: 'chip-amber',
  legacy: 'chip-dust',
  raw_read: 'chip-amber',
};

export function ClassificationBadge({ classification }: { classification: Classification }) {
  const style = CLASSIFICATION_STYLE[classification] ?? CLASSIFICATION_STYLE.legacy;
  return <span className={`chip ${style}`}>{classification}</span>;
}

/** Rust is reserved for exactly these: hazard chips. */
export function HazardChip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="chip chip-rust">
      {children}
    </span>
  );
}

/** Shared explicit error box — same wording everywhere, incl. the API-down case. */
export function ErrorBox({ error }: { error: unknown }) {
  const msg = describeApiError(error);
  return (
    <div className="flex items-baseline gap-2.5 rounded border border-rust/50 border-l-2 border-l-rust bg-rust-wash px-3 py-2 text-sm text-rust-dark dark:border-rust-dark dark:border-l-rust-light dark:bg-rust-tint dark:text-rust-light">
      <span aria-hidden className="font-mono text-xs font-bold">
        !
      </span>
      <span>
        {msg === API_DOWN_MESSAGE ? (
          <>
            API not running — start with <code className="font-mono">npm run dev:api</code>
          </>
        ) : (
          msg
        )}
      </span>
    </div>
  );
}

export function LoadingBox({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded border border-dust-200 bg-dust-0/60 px-3 py-2 text-sm text-dust-600 dark:border-dust-700 dark:bg-dust-800/60 dark:text-dust-300"
    >
      <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-petrol dark:bg-petrol-light" />
      {label}…
    </div>
  );
}

/** Designed empty state — dashed frame, quiet text; for lists with no rows. */
export function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-dust-200 px-3 py-6 text-center text-sm text-dust-600 dark:border-dust-700 dark:text-dust-400">
      {children}
    </div>
  );
}
