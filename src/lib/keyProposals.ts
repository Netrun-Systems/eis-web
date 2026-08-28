/**
 * WEB-011 — the LootTables fix path: a deterministic "make keys unique"
 * suffix proposal for one column-0 collision group. The proposal is applied
 * into the editor's DIRTY state for review — never auto-saved; Discard
 * restores the loaded snapshot.
 *
 * Rules:
 *  - the FIRST occurrence keeps the original key. Honest caveat for review:
 *    on import TODAY the LAST duplicate silently wins, so a consumer of the
 *    bare key currently gets the last row — after this fix it gets the first.
 *    That is a semantic choice, which is exactly why the proposal lands in
 *    the dirty state for the designer to review row by row;
 *  - later occurrences get `<key>_2`, `<key>_3`, … in row order;
 *  - a candidate already used ANYWHERE in the table (or already proposed) is
 *    skipped, so applying a proposal can never create a new collision;
 *  - deterministic: same input, same output.
 */

export interface KeyProposal {
  /** 0-based index into the data rows. */
  rowIndex: number;
  oldKey: string;
  newKey: string;
}

/** Propose suffixed keys for one colliding key. Returns [] when the key does
 * not collide (0 or 1 occurrences). */
export function proposeSuffixes(rows: readonly string[][], key: string): KeyProposal[] {
  const used = new Set<string>();
  const occurrences: number[] = [];
  rows.forEach((r, i) => {
    const k = r[0] ?? '';
    used.add(k);
    if (k === key) occurrences.push(i);
  });
  if (occurrences.length < 2) return [];

  const proposals: KeyProposal[] = [];
  let n = 2;
  for (const rowIndex of occurrences.slice(1)) {
    let candidate = `${key}_${n}`;
    while (used.has(candidate)) {
      n++;
      candidate = `${key}_${n}`;
    }
    used.add(candidate);
    n++;
    proposals.push({ rowIndex, oldKey: key, newKey: candidate });
  }
  return proposals;
}

/** Apply proposals to a copy of the rows (column 0 only). */
export function applyProposals(rows: readonly string[][], proposals: KeyProposal[]): string[][] {
  const byIndex = new Map(proposals.map((p) => [p.rowIndex, p.newKey]));
  return rows.map((r, i) => {
    const newKey = byIndex.get(i);
    if (newKey === undefined) return [...r];
    const next = [...r];
    next[0] = newKey;
    return next;
  });
}
