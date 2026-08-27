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
      className="whitespace-nowrap font-mono text-[11px] text-petrol-light hover:text-petrol hover:underline"
      title={`Read ${c.label} in the philosophy document`}
    >
      {prefixText}
      {c.label}
    </Link>
  );
}

export function MethodQuote({ text, cite: c }: { text: string; cite: Cite }) {
  return (
    <blockquote className="border-l-2 border-petrol-dark pl-3 text-sm italic leading-relaxed text-dust-100">
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
        className="flex items-center gap-2 rounded border border-dust-700 bg-dust-800/60 px-2.5 py-1 text-xs text-dust-500 hover:border-petrol-dark hover:text-petrol-light"
      >
        <span aria-hidden>▸</span>
        In the method: {content.title}
      </button>
    );
  }

  return (
    <section className="space-y-2 rounded border border-petrol-dark/60 bg-petrol-tint/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-petrol-light">
          <span className="mr-1.5 rounded border border-petrol-dark px-1 py-0.5 font-mono text-[10px] uppercase tracking-wide">
            In the method
          </span>
          {content.title}
        </h3>
        <button
          type="button"
          onClick={toggle}
          className="rounded border border-dust-700 px-1.5 py-0.5 text-[11px] text-dust-500 hover:border-petrol-dark hover:text-petrol-light"
          title="Dismiss — remembered for this surface"
        >
          dismiss
        </button>
      </div>

      <p className="text-sm leading-relaxed text-dust-300">{content.lead}</p>

      {content.quote && <MethodQuote text={content.quote.text} cite={content.quote.cite} />}

      {content.rules.length > 0 && (
        <ul className="space-y-1.5">
          {content.rules.map((r, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm leading-snug text-dust-300">
              <span className="shrink-0">
                <CiteLink cite={r.cite} />
              </span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="flex flex-wrap items-center gap-x-2 text-xs text-dust-500">
        Read more:
        {content.readMore.map((c, i) => (
          <CiteLink key={i} cite={c} />
        ))}
        <Link
          to={PHILOSOPHY_ROUTE}
          className="text-petrol-light hover:text-petrol hover:underline"
        >
          full document →
        </Link>
      </p>
    </section>
  );
}
