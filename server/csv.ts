import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Papa from 'papaparse';
import type { TablePayload } from './types.ts';

export type Eol = '\r\n' | '\n';

/** Which line ending does this text use? First CRLF/LF found wins; a file with
 * no newline at all defaults to LF. */
export function detectEol(text: string): Eol {
  const idx = text.indexOf('\n');
  if (idx > 0 && text[idx - 1] === '\r') return '\r\n';
  return '\n';
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Parse CSV text (BOM tolerated) into {columns, rows}. Rows are string[][]
 * aligned to columns; short rows are padded, so downstream guards can index
 * by column safely. */
export function parseCsvText(text: string): TablePayload {
  const parsed = Papa.parse<string[]>(stripBom(text), {
    header: false,
    skipEmptyLines: true,
  });
  const fatal = parsed.errors.filter((e) => e.type !== 'FieldMismatch');
  if (fatal.length > 0) {
    throw new Error(`CSV parse failed: ${fatal[0].message} (row ${fatal[0].row ?? '?'})`);
  }
  const data = parsed.data;
  if (data.length === 0) return { columns: [], rows: [] };
  const columns = data[0].map((c) => c.trim());
  const rows = data.slice(1).map((r) => {
    if (r.length === columns.length) return r;
    const padded = r.slice(0, columns.length);
    while (padded.length < columns.length) padded.push('');
    return padded;
  });
  return { columns, rows };
}

export function readCsvFile(absPath: string): { payload: TablePayload; eol: Eol; raw: string } {
  const raw = fs.readFileSync(absPath, 'utf-8');
  return { payload: parseCsvText(raw), eol: detectEol(raw), raw };
}

/** Serialize with papaparse, preserving column order as sent and the caller's
 * line-ending choice. Ends with a trailing newline (the corpus convention). */
export function serializeCsv(payload: TablePayload, eol: Eol): string {
  const text = Papa.unparse([payload.columns, ...payload.rows], {
    newline: eol,
    // default quoting: only when a field contains delimiter/quote/newline
  });
  return text.endsWith(eol) ? text : text + eol;
}

export interface AtomicWriteOptions {
  /** Test seam: called with the re-read raw text before the rename; throw to
   * simulate a round-trip verification failure. */
  verifyHook?: (rereadText: string) => void;
}

/**
 * Write-then-verify-then-rename. The content is written to a sibling temp
 * file, re-read and re-parsed, and compared field-for-field against the
 * intended payload; only then is it renamed into place. A failure at any point
 * removes the temp file and leaves the target untouched — no torn files.
 */
export function writeCsvAtomic(
  absPath: string,
  payload: TablePayload,
  eol: Eol,
  options: AtomicWriteOptions = {},
): void {
  const dir = path.dirname(absPath);
  const tmp = path.join(
    dir,
    `.${path.basename(absPath)}.eisweb-${crypto.randomBytes(6).toString('hex')}.tmp`,
  );
  const content = serializeCsv(payload, eol);
  try {
    fs.writeFileSync(tmp, content, 'utf-8');
    const reread = fs.readFileSync(tmp, 'utf-8');
    if (options.verifyHook) options.verifyHook(reread);
    const roundTrip = parseCsvText(reread);
    assertPayloadsEqual(payload, roundTrip);
    if (detectEol(reread) !== eol && reread.includes('\n')) {
      throw new Error(`round-trip check: line ending changed (wanted ${JSON.stringify(eol)})`);
    }
    fs.renameSync(tmp, absPath); // atomic replace on the same volume
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best effort */
    }
    throw err;
  }
}

function assertPayloadsEqual(sent: TablePayload, reread: TablePayload): void {
  if (sent.columns.length !== reread.columns.length) {
    throw new Error(
      `round-trip check: column count changed (${sent.columns.length} -> ${reread.columns.length})`,
    );
  }
  sent.columns.forEach((c, i) => {
    if (reread.columns[i] !== c) {
      throw new Error(`round-trip check: column ${i} changed (${c} -> ${reread.columns[i]})`);
    }
  });
  if (sent.rows.length !== reread.rows.length) {
    throw new Error(
      `round-trip check: row count changed (${sent.rows.length} -> ${reread.rows.length})`,
    );
  }
  for (let r = 0; r < sent.rows.length; r++) {
    for (let c = 0; c < sent.columns.length; c++) {
      const a = sent.rows[r][c] ?? '';
      const b = reread.rows[r][c] ?? '';
      if (a !== b) {
        throw new Error(
          `round-trip check: value changed at row ${r + 1}, column ${sent.columns[c]}: ` +
            `${JSON.stringify(a)} -> ${JSON.stringify(b)}`,
        );
      }
    }
  }
}
