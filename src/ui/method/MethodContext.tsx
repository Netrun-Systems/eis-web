import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { METHOD_CONTEXT, PHILOSOPHY_ROUTE, type Cite, type SurfaceKey } from '../../content/method';

/**
 * WEB-014 — the reusable "what is this surface in the method" panel. Content
 * lives in src/content/method.ts (one reviewable file, curated from the
 * philosophy doc); this component only renders it.
 *
 * Default expanded until dismissed; dismissal is remembered per-surface in
 * localStorage (best-effort — storage failures fall back to expanded).
 *
 * WEB-015: quotes and the lead paragraph read in Source Serif — this panel is
 * one of the app's long-form reading surfaces; its chrome stays in the UI sans.
 */

const storageKey = (surface: SurfaceKey) => `eisweb.method.dismissed.${surface}`;

function readDismissed(surface: SurfaceKey): boolean {
  try {
    return window.localStorage.getItem(storageKey(surface)) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(surface: SurfaceKey, dismissed: boolean): void {
  try {
    if (dismissed) window.localStorage.setItem(storageKey(surface), '1');
    else window.localStorage.removeItem(storageKey(surface));
  } catch {
    /* storage unavailable — the panel simply won't remember */
  }
}

export function CiteLink({ cite: c, prefixText }: { cite: Cite; prefixText?: string }) {
  return (
    <Link
      to={`${PHILOSOPHY_ROUTE}#${c.anchor}`}
      className="whitespace-nowrap font-mono text-[11px] text-petrol-ink hover:text-petrol-dark hover:underline dark:text-petrol-light dark:hover:text-petrol"
      title={`Read ${c.label} in the philosophy document`}
    >
      {prefixText}
      {c.label}
    </Link>
  );
}

export function MethodQuote({ text, cite: c }: { text: string; cite: Cite }) {
  return (
    <blockquote className="border-l-2 border-petrol/60 pl-3 font-serif text-[0.95rem] italic leading-relaxed text-dust-800 dark:border-petrol-dark dark:text-dust-100">
      &ldquo;{text}&rdquo; <CiteLink cite={c} prefixText="— " />
    </blockquote>
  );
}

export function MethodContext({ surface }: { surface: SurfaceKey }) {
  const content = METHOD_CONTEXT[surface];
  const [dismissed, setDismissed] = useState(() => readDismissed(surface));

  const toggle = () => {
    setDismissed((d) => {
      writeDismissed(surface, !d);
      return !d;
    });
  };

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 rounded border border-dust-200 bg-dust-0/60 px-2.5 py-1 text-xs text-dust-600 transition-colors hover:border-petrol hover:text-petrol-ink dark:border-dust-700 dark:bg-dust-800/60 dark:text-dust-400 dark:hover:border-petrol-dark dark:hover:text-petrol-light"
      >
        <span aria-hidden>▸</span>
        In the method: {content.title}
      </button>
    );
  }

  return (
    <section className="space-y-2 rounded border border-petrol/30 bg-petrol-wash/40 p-3 dark:border-petrol-dark/60 dark:bg-petrol-tint/20">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-petrol-ink dark:text-petrol-light">
          <span className="mr-1.5 rounded-sm border border-petrol/40 px-1 py-0.5 font-mono text-[10px] uppercase tracking-eyebrow dark:border-petrol-dark">
            In the method
          </span>
          {content.title}
        </h3>
        <button
          type="button"
          onClick={toggle}
          className="rounded border border-dust-200 px-1.5 py-0.5 text-[11px] text-dust-600 transition-colors hover:border-petrol hover:text-petrol-ink dark:border-dust-700 dark:text-dust-400 dark:hover:border-petrol-dark dark:hover:text-petrol-light"
          title="Dismiss — remembered for this surface"
        >
          dismiss
        </button>
      </div>

      <p className="max-w-[65ch] font-serif text-[0.95rem] leading-relaxed text-dust-700 dark:text-dust-300">
        {content.lead}
      </p>

      {content.quote && <MethodQuote text={content.quote.text} cite={content.quote.cite} />}

      {content.rules.length > 0 && (
        <ul className="space-y-1.5">
          {content.rules.map((r, i) => (
            <li
              key={i}
              className="flex items-baseline gap-2 text-sm leading-snug text-dust-600 dark:text-dust-300"
            >
              <span className="shrink-0">
                <CiteLink cite={r.cite} />
              </span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="flex flex-wrap items-center gap-x-2 text-xs text-dust-600 dark:text-dust-400">
        Read more:
        {content.readMore.map((c, i) => (
          <CiteLink key={i} cite={c} />
        ))}
        <Link
          to={PHILOSOPHY_ROUTE}
          className="text-petrol-ink hover:text-petrol-dark hover:underline dark:text-petrol-light dark:hover:text-petrol"
        >
          full document →
        </Link>
      </p>
    </section>
  );
}
