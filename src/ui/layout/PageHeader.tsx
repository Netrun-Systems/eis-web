import React from 'react';

/**
 * WEB-015 — the one page-header pattern: eyebrow / title / context line,
 * with an optional right-aligned action cluster. The eyebrow names the
 * sidebar group the route belongs to, so the navigation taxonomy is
 * restated at the top of every page. Purely presentational.
 */
export function PageHeader({
  eyebrow,
  title,
  context,
  actions,
}: {
  eyebrow: string;
  title: React.ReactNode;
  context?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-dust-200 pb-4 dark:border-dust-700">
      <div className="min-w-0 space-y-1.5">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="page-title">{title}</h2>
        {context !== undefined && (
          <div className="max-w-[65ch] pt-0.5 text-sm leading-relaxed text-dust-600 dark:text-dust-300">
            {context}
          </div>
        )}
      </div>
      {actions !== undefined && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 pb-0.5">{actions}</div>
      )}
    </header>
  );
}
