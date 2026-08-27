/**
 * WEB-007 — the location-brief text format, shared by server and client.
 *
 * Parse semantics MIRROR Scripts/location_brief.py `parse_brief()` exactly:
 *   - a line whose stripped form starts with '#' is a comment;
 *   - a key is a stripped line matching /^([A-Za-z][A-Za-z \/_-]*):\s*(.*)$/;
 *   - values are the stripped non-blank lines under a key, one per line,
 *     until the next key ('Key: value' inline also works; an inline rest
 *     containing '|' splits on it);
 *   - blank lines never end a key's value run.
 *
 * On top of that, this module keeps enough structure (line indices, the
 * leading comment block verbatim) that:
 *   - `serializeBrief(parseBrief(text))` reproduces a canonical-layout brief
 *     byte-for-byte (proven in tests against the two real briefs), and
 *   - the splice helpers edit ONE entry (or the leading comment block) in the
 *     raw text surgically, so unrecognised keys, mid-file comments and layout
 *     the parser does not model are preserved untouched.
 */

export interface BriefEntry {
  /** The key text exactly as written before the ':' (original casing). */
  key: string;
  /** Stripped values, in order (inline values first when both forms occur). */
  values: string[];
  /** True when the values came from the key line itself ('Key: value'). */
  inline: boolean;
  /** 0-based index of the key line in raw.split('\n'). */
  keyLine: number;
  /** 0-based indices of the value lines (empty for pure-inline entries). */
  valueLines: number[];
}

export interface ParsedBrief {
  /** The LEADING comment block, verbatim lines including their '#'. */
  comments: string[];
  entries: BriefEntry[];
  eol: '\n' | '\r\n';
}

/** Same key pattern location_brief.py uses. */
export const BRIEF_KEY_RE = /^([A-Za-z][A-Za-z /_-]*):\s*(.*)$/;

/** The keys location_brief.py recognises (BRIEF_KEYS), display casing. */
export const RECOGNIZED_BRIEF_KEYS = [
  'Location',
  'Region',
  'City style',
  'Purpose',
  'Primary structures',
  'Networks',
  'Traversal',
  'World state',
  'Gameplay',
] as const;

/** Keys the form renders as one-value-per-line textareas. */
export const MULTI_VALUE_BRIEF_KEYS: ReadonlySet<string> = new Set([
  'purpose',
  'primary structures',
  'networks',
  'traversal',
  'world state',
  'gameplay',
]);

const stripCr = (line: string): string => (line.endsWith('\r') ? line.slice(0, -1) : line);

export function parseBrief(raw: string): ParsedBrief {
  const eol: '\n' | '\r\n' = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split('\n');
  const comments: string[] = [];
  const entries: BriefEntry[] = [];
  let current: BriefEntry | null = null;
  let inLeading = true;

  for (let i = 0; i < lines.length; i++) {
    const original = stripCr(lines[i]);
    const t = original.trim();
    if (t === '') continue; // blanks end nothing (same as the Python)
    if (t.startsWith('#')) {
      if (inLeading) comments.push(original);
      continue;
    }
    const m = BRIEF_KEY_RE.exec(t);
    if (m) {
      inLeading = false;
      const rest = m[2].trim();
      const entry: BriefEntry = {
        key: m[1].trim(),
        values: [],
        inline: rest !== '',
        keyLine: i,
        valueLines: [],
      };
      if (rest !== '') {
        entry.values = rest.includes('|')
          ? rest
              .split('|')
              .map((s) => s.trim())
              .filter((s) => s !== '')
          : [rest];
      }
      entries.push(entry);
      current = entry;
      continue;
    }
    inLeading = false;
    if (current !== null) {
      current.values.push(t);
      current.valueLines.push(i);
      current.inline = false; // values below the key line demote the inline form
    }
  }
  return { comments, entries, eol };
}

/**
 * Canonical writer: leading comments, then one block per entry, single blank
 * line between blocks, trailing newline. Byte-identical to a brief already in
 * canonical layout (both real briefs are).
 */
export function serializeBrief(parsed: ParsedBrief): string {
  const blocks: string[] = [];
  if (parsed.comments.length > 0) blocks.push(parsed.comments.join(parsed.eol));
  for (const e of parsed.entries) {
    if (e.inline) blocks.push(`${e.key}: ${e.values.join(' | ')}`);
    else blocks.push([`${e.key}:`, ...e.values].join(parsed.eol));
  }
  return blocks.join(parsed.eol + parsed.eol) + parsed.eol;
}

/** Case-insensitive entry lookup, the way location_brief.py keys its fields. */
export function findBriefEntry(parsed: ParsedBrief, key: string): BriefEntry | undefined {
  const want = key.trim().toLowerCase();
  return parsed.entries.find((e) => e.key.trim().toLowerCase() === want);
}

/**
 * Surgically replace the values of one key in the raw text. Everything the
 * splice does not touch — other keys, unrecognised keys, comments, layout —
 * is preserved byte-for-byte. A missing key with non-empty values is appended
 * as a new block at the end; empty values remove the entry's block.
 */
export function spliceEntryValues(raw: string, key: string, newValues: string[]): string {
  const parsed = parseBrief(raw);
  const entry = findBriefEntry(parsed, key);
  const vals = newValues.map((v) => v.trim()).filter((v) => v !== '');
  const lines = raw.split('\n');

  if (entry === undefined) {
    if (vals.length === 0) return raw;
    let base = raw;
    if (base !== '' && !base.endsWith('\n')) base += '\n';
    const sep = base === '' || base.endsWith('\n\n') ? '' : '\n';
    return `${base}${sep}${key}:\n${vals.join('\n')}\n`;
  }

  const start = entry.keyLine;
  const end = entry.valueLines.length > 0 ? Math.max(...entry.valueLines) : entry.keyLine;
  if (vals.length === 0) {
    let removeEnd = end;
    if (removeEnd + 1 < lines.length && lines[removeEnd + 1].trim() === '') removeEnd++;
    lines.splice(start, removeEnd - start + 1);
    return lines.join('\n');
  }
  lines.splice(start, end - start + 1, `${entry.key}:`, ...vals);
  return lines.join('\n');
}

/**
 * Replace the LEADING comment block with new verbatim comment lines (each
 * already carrying its '#'). Empty input removes the block.
 */
export function spliceComments(raw: string, newCommentLines: string[]): string {
  const lines = raw.split('\n');
  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = stripCr(lines[i]).trim();
    if (t === '') continue;
    if (t.startsWith('#')) {
      if (firstIdx < 0) firstIdx = i;
      lastIdx = i;
      continue;
    }
    break; // first real content ends the leading block scan
  }
  if (firstIdx < 0) {
    if (newCommentLines.length === 0) return raw;
    return `${newCommentLines.join('\n')}\n\n${raw}`;
  }
  if (newCommentLines.length === 0) {
    let removeEnd = lastIdx;
    if (removeEnd + 1 < lines.length && lines[removeEnd + 1].trim() === '') removeEnd++;
    lines.splice(firstIdx, removeEnd - firstIdx + 1);
    return lines.join('\n');
  }
  lines.splice(firstIdx, lastIdx - firstIdx + 1, ...newCommentLines);
  return lines.join('\n');
}

/** Display helper: '# text' -> 'text' (one marker, at most one space). */
export const stripCommentMarker = (line: string): string => line.replace(/^\s*#\s?/, '');

/** Display helper inverse: 'text' -> '# text'; empty stays a bare '#'. */
export const toCommentLine = (text: string): string =>
  text.trim() === '' ? '#' : text.trimStart().startsWith('#') ? text : `# ${text}`;
