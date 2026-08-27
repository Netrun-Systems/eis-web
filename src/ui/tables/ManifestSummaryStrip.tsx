import React from 'react';
import type { Classification, ManifestSummary } from '../../api/types';
import { ClassificationBadge } from './badges';

/**
 * Summary strip over the WEB-001 manifest summary (WEB-004). Everything here
 * comes straight from `manifest.summary` — nothing is recomputed client-side.
 */

const CLASSIFICATION_ORDER: Classification[] = [
  'authored',
  'generated',
  'generated_unverified',
  'legacy',
  'raw_read',
];

export function ManifestSummaryStrip({ summary }: { summary: ManifestSummary }) {
  const rowLossCount = summary.tables_losing_rows_on_import?.length ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-dust-700 bg-dust-800 px-3 py-2 text-sm">
      <span className="text-dust-100">
        <span className="font-semibold">{summary.total_tables}</span> tables
      </span>
      {CLASSIFICATION_ORDER.map((c) => {
        const count = summary.classification_counts[c];
        if (count === undefined) return null;
        return (
          <span key={c} className="flex items-center gap-1.5 text-dust-300">
            <ClassificationBadge classification={c} />
            <span className="font-mono text-xs">{count}</span>
          </span>
        );
      })}
      <span className={rowLossCount > 0 ? 'text-rust-light' : 'text-dust-300'}>
        <span className="font-semibold font-mono">{rowLossCount}</span> losing rows on import
      </span>
    </div>
  );
}
