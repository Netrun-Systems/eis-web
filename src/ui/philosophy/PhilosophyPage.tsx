import React, { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchReport } from '../../api/client';
import { useApi } from '../../api/useApi';
import { PHILOSOPHY_DOC_PATH, PHILOSOPHY_DOC_VERSION } from '../../content/method';
import { ErrorBox, LoadingBox } from '../tables/badges';
import { extractHeadings, Markdown } from '../markdown/Markdown';

/**
 * WEB-014 — the canonical methodology document, served in-app. Read-only:
 * the source of truth stays `Documentation/world-development philosophy.md`
 * in the EISCORE repo (the `world-philosophy` report allow-list entry).
 * A table of contents is generated from the document's own headings; every
 * heading carries a stable anchor (`/philosophy#s21`), which is what all
 * §-cites across the app link to.
 */
export function PhilosophyPage() {
  const state = useApi(() => fetchReport('world-philosophy'), []);
  const location = useLocation();

  const headings = useMemo(
    () => (state.data === null ? [] : extractHeadings(state.data.markdown)),
    [state.data],
  );

  // Once the document is rendered, honor the URL hash (deep links from the
  // §-cites arrive before the content exists, so the browser can't).
  useEffect(() => {
    if (state.data === null) return;
    const id = location.hash.replace(/^#/, '');
    if (id === '') return;
    const el = document.getElementById(id);
    if (el !== null) el.scrollIntoView();
  }, [state.data, location.hash]);

  return (
    <div className="max-w-5xl space-y-3">
      {/* Sticky provenance header. */}
      <div className="sticky top-0 z-10 -mx-1 rounded border border-petrol-dark bg-petrol-tint px-3 py-2 backdrop-blur">
        <p className="text-sm text-dust-100">
          <span className="font-semibold text-petrol-light">
            You are reading the canonical methodology
          </span>
          {' — '}
          <code className="font-mono text-xs">{PHILOSOPHY_DOC_PATH}</code>
          {' · '}
          <span className="font-mono text-xs">{PHILOSOPHY_DOC_VERSION}</span>
          {state.data && (
            <span className="font-mono text-xs text-dust-300">
              {' · '}mtime {state.data.mtime.slice(0, 16).replace('T', ' ')}
            </span>
          )}
        </p>
        <p className="text-xs text-dust-300">
          Read-only — the document lives in the EISCORE repo. Every &sect;-cite in this app links
          into this page.
        </p>
      </div>

      {state.loading && <LoadingBox label="Loading the philosophy document" />}
      {state.error != null && <ErrorBox error={state.error} />}

      {state.data && (
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* TOC — generated from the document's headings. */}
          <nav className="shrink-0 lg:w-72">
            <details
              className="rounded border border-dust-700 bg-dust-800 p-2 lg:sticky lg:top-16 lg:max-h-[80vh] lg:overflow-y-auto"
              open
            >
              <summary className="cursor-pointer text-sm font-semibold text-dust-100">
                Contents
              </summary>
              <ul className="mt-1 space-y-0.5">
                {headings
                  .filter((h) => h.level <= 3)
                  .map((h, i) => (
                    <li key={`${h.anchor}-${i}`}>
                      <a
                        href={`#${h.anchor}`}
                        className={`block truncate text-xs hover:text-petrol hover:underline ${
                          h.level === 1
                            ? 'mt-1 font-semibold text-petrol-light'
                            : h.level === 2
                              ? 'pl-3 text-dust-300'
                              : 'pl-6 text-dust-500'
                        }`}
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
              </ul>
            </details>
          </nav>

          <article className="min-w-0 flex-1">
            <Markdown source={state.data.markdown} withAnchors />
          </article>
        </div>
      )}
    </div>
  );
}
