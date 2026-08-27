import React from 'react';
import { Link } from 'react-router-dom';
import type { Finding, FindingSeverity, FindingSummaryCounts } from '../../api/types';

/**
 * WEB-005 shared findings rendering. Severity color language, project-wide:
 * rust is reserved for ERROR (the only refusal-grade severity), WARN wears
 * amber — distinct from rust on purpose — and INFO stays quiet dust.
 */

const SEVERITY_STYLE: Record<FindingSeverity, string> = {
  ERROR: 'border-rust-dark bg-rust-tint text-rust-light',
  WARN: 'border-amber-dark bg-amber-tint text-amber-light',
  INFO: 'border-dust-700 bg-dust-800 text-dust-300',
};

export function SeverityChip({ severity }: { severity: FindingSeverity }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[11px] leading-4 whitespace-nowrap ${SEVERITY_STYLE[severity]}`}
    >
      {severity}
    </span>
  );
}

/** Counts strip + run timestamp — the one-line summary of a validation run. */
export function FindingCountsStrip({
  counts,
  ranAt,
  exitCode,
}: {
  counts: FindingSummaryCounts;
  ranAt: string;
  exitCode?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className={counts.ERROR > 0 ? 'font-semibold text-rust-light' : 'text-dust-500'}>
        {counts.ERROR} error{counts.ERROR === 1 ? '' : 's'}
      </span>
      <span className={counts.WARN > 0 ? 'font-semibold text-amber-light' : 'text-dust-500'}>
        {counts.WARN} warning{counts.WARN === 1 ? '' : 's'}
      </span>
      <span className="text-dust-500">{counts.INFO} info</span>
      {exitCode !== undefined && (
        <span className="font-mono text-dust-500">exit {exitCode}</span>
      )}
      <span className="font-mono text-dust-500">
        ran {ranAt.slice(0, 19).replace('T', ' ')}
      </span>
    </div>
  );
}

export interface FindingListItemProps {
  finding: Finding;
  /** Render the table name as a link (dashboard view). */
  tableLinkTo?: string;
  /** Jump the grid to the finding's row (table-detail view). */
  onJumpToRow?: () => void;
}

/** One finding: severity chip, code, message, row/column when present. */
export function FindingListItem({ finding, tableLinkTo, onJumpToRow }: FindingListItemProps) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1">
      <SeverityChip severity={finding.severity} />
      <code className="font-mono text-xs text-petrol-light">{finding.code}</code>
      {finding.table !== undefined &&
        (tableLinkTo !== undefined ? (
          <TableLink to={tableLinkTo} label={finding.table} />
        ) : (
          <span className="font-mono text-xs text-dust-500">{finding.table}</span>
        ))}
      {(finding.row !== undefined || finding.column !== undefined) && (
        <span className="font-mono text-xs text-dust-500">
          {finding.row !== undefined && <>row {finding.row}</>}
          {finding.row !== undefined && finding.column !== undefined && ' · '}
          {finding.column !== undefined && <>col {finding.column}</>}
        </span>
      )}
      {onJumpToRow !== undefined && (
        <button
          type="button"
          onClick={onJumpToRow}
          className="rounded border border-petrol-dark bg-petrol-tint px-1.5 text-[11px] leading-4 text-petrol-light hover:bg-petrol-dark"
        >
          jump to row
        </button>
      )}
      <span className="w-full text-sm leading-snug text-dust-300 sm:w-auto sm:flex-1 sm:basis-full">
        {finding.message}
      </span>
    </li>
  );
}

function TableLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="font-mono text-xs text-petrol-light hover:text-petrol hover:underline">
      {label}
    </Link>
  );
}

export function bySeverity(findings: Finding[], severity: FindingSeverity): Finding[] {
  return findings.filter((f) => f.severity === severity);
}
