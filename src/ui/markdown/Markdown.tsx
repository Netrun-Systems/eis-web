import React from 'react';

/**
 * Tiny markdown renderer for the WEB-004 dashboard reports. Covers exactly the
 * subset the generated reports use: #/## headings, paragraphs, pipe tables,
 * fenced code blocks, bullet lists, and inline bold / code / italics.
 *
 * Everything is emitted as React elements — there is no raw-HTML passthrough,
 * so any HTML in the source renders as literal text.
 */

// ---------- inline ----------

function splitInline(text: string, key = 0): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Code spans first, so their contents are never bold/italic-parsed.
  const parts = text.split(/(`[^`]+`)/g);
  parts.forEach((part, i) => {
    if (part === '') return;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      out.push(
        <code key={`${key}-c${i}`} className="rounded bg-dust-900 px-1 font-mono text-[0.9em] text-petrol-light">
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
        <strong key={`${key}-b${i}`} className="font-semibold text-dust-100">
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

export function Markdown({ source }: { source: string }) {
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
          className="overflow-x-auto rounded border border-dust-700 bg-dust-900 p-3 font-mono text-xs leading-5 text-dust-300"
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
      const cls =
        level === 1
          ? 'text-base font-bold text-dust-100 mt-1'
          : 'text-sm font-semibold text-dust-100 mt-2';
      blocks.push(
        level === 1 ? (
          <h3 key={key++} className={cls}>
            {content}
          </h3>
        ) : (
          <h4 key={key++} className={cls}>
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
                    className="border border-dust-700 bg-dust-800 px-2 py-1 text-left font-semibold text-dust-100"
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
                    <td key={c} className="border border-dust-700 px-2 py-1 text-dust-300">
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
        <ul key={key++} className="list-disc space-y-1 pl-5 text-sm text-dust-300">
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
      !/^\s*[-*]\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key++} className="text-sm leading-relaxed text-dust-300">
        {splitInline(buf.join(' '), key)}
      </p>,
    );
  }

  return <div className="space-y-3">{blocks}</div>;
}
