import React from 'react';
import type { Classification } from '../../api/types';
import { API_DOWN_MESSAGE, describeApiError } from '../../api/client';

/**
 * Classification badges and hazard chips (WEB-004). Every chip carries its
 * word — color is reinforcement, never the sole signal.
 */

const CLASSIFICATION_STYLE: Record<Classification, string> = {
  authored: 'border-petrol-dark bg-petrol-tint text-petrol-light',
  generated: 'border-eis-info/50 bg-eis-info/10 text-eis-info',
  generated_unverified: 'border-eis-warning/50 bg-eis-warning/10 text-eis-warning',
  legacy: 'border-dust-700 bg-dust-800 text-dust-300',
  raw_read: 'border-eis-warning/60 bg-eis-warning/15 text-eis-warning',
};

export function ClassificationBadge({ classification }: { classification: Classification }) {
  const style = CLASSIFICATION_STYLE[classification] ?? CLASSIFICATION_STYLE.legacy;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-mono leading-4 whitespace-nowrap ${style}`}
    >
      {classification}
    </span>
  );
}

/** Rust is reserved for exactly these: hazard chips. */
export function HazardChip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center rounded border border-rust-dark bg-rust-tint px-1.5 py-0.5 text-[11px] leading-4 text-rust-light whitespace-nowrap"
    >
      {children}
    </span>
  );
}

/** Shared explicit error box — same wording everywhere, incl. the API-down case. */
export function ErrorBox({ error }: { error: unknown }) {
  const msg = describeApiError(error);
  return (
    <div className="rounded border border-rust-dark bg-rust-tint px-3 py-2 text-sm text-rust-light">
      {msg === API_DOWN_MESSAGE ? (
        <>
          API not running — start with <code className="font-mono">npm run dev:api</code>
        </>
      ) : (
        msg
      )}
    </div>
  );
}

export function LoadingBox({ label }: { label: string }) {
  return (
    <div className="rounded border border-dust-700 px-3 py-2 text-sm text-dust-300">{label}…</div>
  );
}
