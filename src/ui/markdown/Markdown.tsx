import React from 'react';

/**
 * Tiny markdown renderer for the WEB-004 dashboard reports. Covers exactly the
 * subset the generated reports use: #/## headings, paragraphs, pipe tables,
 * fenced code blocks, bullet lists, and inline bold / code / italics.
 *
 * WEB-014 extended it minimally for the philosophy document: horizontal rules
 * (`---`), blockquotes (`> …`), ordered lists (`1. …`), and — when
 * `withAnchors` is set — stable heading ids so `/philosophy#s21`-style links
 * work (see headingAnchor for the scheme).
 *
 * Everything is emitted as React elements — there is no raw-HTML passthrough,
 * so any HTML in the source renders as literal text.
 */

// ---------- heading anchors (WEB-014) ----------

/**
 * Deterministic anchor for a heading, designed around the philosophy doc's
 * numbering so content cites stay reviewable:
 *   "3. The dependency chain"  -> "s3"
 *   "17.4 Joins between layers" -> "s17-4"
 *   "Part VIII — Failure modes" -> "part-viii"
 *   "Appendix B — Column reference" -> "appendix-b"
 *   anything else -> a plain slug of the text
 */
export function headingAnchor(text: string): string {
  const t = text.trim();
  const num = /^(\d+(?:\.\d+)*)\.?\s/.exec(t);
  if (num) return `s${num[1].replace(/\./g, '-')}`;
  const part = /^part\s+([ivxlc]+)\b/i.exec(t);
  if (part) return `part-${part[1].toLowerCase()}`;
  const appendix = /^appendix\s+([a-z])\b/i.exec(t);
  if (appendix) return `appendix-${appendix[1].toLowerCase()}`;
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface HeadingEntry {
  level: number;
  text: string;
  anchor: string;
}

/** All headings in a markdown source (code fences skipped) — for a TOC. */
export function extractHeadings(source: string): HeadingEntry[] {
  const out: HeadingEntry[] = [];
  let inFence = false;
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,4})\s+(.*)$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2], anchor: headingAnchor(m[2]) });
  }
  return out;
}

// ---------- inline ----------

function splitInline(text: string, key = 0): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Code spans first, so their contents are never bold/italic-parsed.
  const parts = text.split(/(`[^`]+`)/g);
  parts.forEach((part, i) => {
    if (part === '') return;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      out.push(
        <code key={`${key}-c${i}`} className="rounded bg-dust-100 dark:bg-dust-900 px-1 font-mono text-[0.9em] text-petrol-ink dark:text-petrol-light">
          {part.slice(1, -1)}
        </code>,
      );
      return;
    }
    out.push(...splitEmphasis(part, `${key}-${i}`));
  });
  return out;
}

function splitEmphasis(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  boldParts.forEach((part, i) => {
    if (part === '') return;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      out.push(
        <strong key={`${key}-b${i}`} className="font-semibold text-dust-900 dark:text-dust-100">
          {part.slice(2, -2)}
        </strong>,
      );
      return;
    }
    // Italics: _..._ bounded by start/whitespace on the left. Enough for the
    // report footers; never applied inside code spans (handled above).
    const italics = part.split(/(^_[^_]+_$|(?<=\s)_[^_]+_(?=[\s.,;:!?)]|$))/g);
    italics.forEach((seg, j) => {
      if (seg === '') return;
      if (seg.startsWith('_') && seg.endsWith('_') && seg.length > 2) {
        out.push(<em key={`${key}-i${i}-${j}`}>{seg.slice(1, -1)}</em>);
      } else {
        out.push(seg);
      }
    });
  });
  return out;
}

// ---------- blocks ----------

const isTableSeparator = (line: string): boolean => /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

export function Markdown({ source, withAnchors = false }: { source: string; withAnchors?: boolean }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Horizontal rule (--- / ***) — must not swallow table separators, which
    // are only reached via the pipe-table branch below.
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="border-dust-200 dark:border-dust-700" />);
      i += 1;
      continue;
    }

    // Blockquote: consecutive `>`-prefixed lines join into one quote block.
    if (line.trimStart().startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={key++}
          className="border-l-2 border-petrol/40 dark:border-petrol-dark pl-3 text-sm italic leading-relaxed text-dust-900 dark:text-dust-100"
        >
          {splitInline(buf.join(' ').trim(), key)}
        </blockquote>,
      );
      continue;
    }

    // Ordered list (1. / 2. …) — numbering comes from the source order.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={key++} className="list-decimal space-y-1 pl-5 text-sm text-dust-600 dark:text-dust-300">
          {items.map((item, j) => (
            <li key={j}>{splitInline(item, j)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence (or EOF)
      blocks.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded border border-dust-200 dark:border-dust-700 bg-dust-100/60 dark:bg-dust-900 p-3 font-mono text-xs leading-5 text-dust-700 dark:text-dust-300"
        >
          {buf.join('\n')}
        </pre>,
      );
      continue;
    }

    // Heading
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const content = splitInline(heading[2], key);
      const id = withAnchors ? headingAnchor(heading[2]) : undefined;
      const cls =
        (level === 1
          ? 'text-base font-bold text-dust-900 dark:text-dust-100 mt-1'
          : 'text-sm font-semibold text-dust-900 dark:text-dust-100 mt-2') + (withAnchors ? ' scroll-mt-14' : '');
      blocks.push(
        level === 1 ? (
          <h3 key={key++} id={id} className={cls}>
            {content}
          </h3>
        ) : (
          <h4 key={key++} id={id} className={cls}>
            {content}
          </h4>
        ),
      );
      i += 1;
      continue;
    }

    // Pipe table
    if (line.trimStart().startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={key++} className="overflow-x-auto">
          <table className="min-w-[16rem] border-collapse text-xs">
            <thead>
              <tr>
                {header.map((h, c) => (
                  <th
                    key={c}
                    className="border border-dust-200 dark:border-dust-700 bg-dust-0 dark:bg-dust-800 px-2 py-1 text-left font-semibold text-dust-900 dark:text-dust-100"
                  >
                    {splitInline(h, c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((cell, c) => (
                    <td key={c} className="border border-dust-200 dark:border-dust-700 px-2 py-1 text-dust-600 dark:text-dust-300">
                      {splitInline(cell, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={key++} className="list-disc space-y-1 pl-5 text-sm text-dust-600 dark:text-dust-300">
          {items.map((item, j) => (
            <li key={j}>{splitInline(item, j)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Paragraph: gather until a blank line or another block opener
    const buf: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !/^#{1,4}\s+/.test(lines[i]) &&
      !lines[i].trimStart().startsWith('|') &&
      !lines[i].trimStart().startsWith('>') &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*(-{3,}|\*{3,})\s*$/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key++} className="text-sm leading-relaxed text-dust-600 dark:text-dust-300">
        {splitInline(buf.join(' '), key)}
      </p>,
    );
  }

  return <div className="space-y-3">{blocks}</div>;
}
