/**
 * Client-side mirrors of the WEB-003 API response shapes. The authority is
 * `server/types.ts` + `server/app.ts` (which in turn mirror the WEB-001
 * TableManifest.json contract) — on divergence, the server wins. Duplicated
 * here because the app and server tsconfig projects are separate.
 */

export type Classification =
  | 'authored'
  | 'generated'
  | 'generated_unverified'
  | 'legacy'
  | 'raw_read';

export interface ManifestColumnType {
  name: string;
  ue5_type: string;
  pipe_multi: boolean;
  semicolon_hazard: boolean;
}

export interface ManifestRowKey {
  column0: string;
  unique: boolean;
  rows_lost_on_import: number;
}

export interface ManifestFlagDetail {
  generator?: string;
  source?: string;
  [key: string]: unknown;
}

export interface ManifestForeignKey {
  column: string;
  target_table: string;
  target_prefix: string;
}

export interface ManifestTable {
  path: string;
  folder: string;
  stem: string;
  row_count: number;
  columns: string[];
  column_types: ManifestColumnType[];
  row_key: ManifestRowKey;
  classification: Classification;
  flags: Record<string, ManifestFlagDetail>;
  foreign_keys?: ManifestForeignKey[];
}

export interface RowLossEntry {
  path: string;
  row_count: number;
  rows_lost_on_import: number;
}

export interface ManifestSummary {
  total_tables: number;
  classification_counts: Record<string, number>;
  raw_read_flagged: number;
  tables_losing_rows_on_import?: RowLossEntry[];
  generated_at_note?: string;
  [key: string]: unknown;
}

export interface TableManifest {
  summary: ManifestSummary;
  tables: ManifestTable[];
}

/** Slim listing row from GET /api/tables. */
export interface TableListEntry {
  path: string;
  folder: string;
  stem: string;
  classification: Classification;
  flags: Record<string, ManifestFlagDetail>;
  row_count: number;
}

export interface TablesResponse {
  count: number;
  tables: TableListEntry[];
}

export interface ManifestResponse {
  mtime: string;
  manifest: TableManifest;
  /** Present only when requested with check=1. */
  check?: { stale: boolean; output: string };
}

export interface TableRowsResponse {
  columns: string[];
  rows: string[][];
  manifestEntry: ManifestTable;
}

export interface GitLogEntry {
  hash: string;
  date: string;
  subject: string;
}

export interface GitLogResponse {
  path: string;
  commits: GitLogEntry[];
}

export interface HealthResponse {
  ok: boolean;
  repoPath: string;
  head: string | null;
  manifestGeneratedAt: string;
}

export interface ReportResponse {
  name: string;
  path: string;
  mtime: string;
  markdown: string;
}

/** WEB-005 — one validation finding (mirror of server/types.ts Finding).
 * `table` is a stem for worldgen-validator findings (the validator names
 * tables by stem); row/column are present only when the source knows them. */
export type FindingSeverity = 'ERROR' | 'WARN' | 'INFO';
export type FindingSource = 'worldgen-validator' | 'table-guards';

export interface Finding {
  source: FindingSource;
  severity: FindingSeverity;
  code: string;
  table?: string;
  row?: string;
  column?: string;
  message: string;
  detail?: unknown;
}

export interface FindingSummaryCounts {
  ERROR: number;
  WARN: number;
  INFO: number;
}

/** POST /api/validate/worldgen. exitCode 1 = the validator found errors —
 * still a 200 result. */
export interface WorldgenValidationResponse {
  ranAt: string;
  exitCode: number;
  findings: Finding[];
  summaryCounts: FindingSummaryCounts;
}

/** POST /api/validate/table — dry-run hard-rule guards on the on-disk file. */
export interface TableGuardCheckResponse {
  ranAt: string;
  path: string;
  findings: Finding[];
  summaryCounts: FindingSummaryCounts;
}

// ---------------------------------------------------------------------------
// WEB-006 — vocabulary editor (mirrors of server/types.ts).
// ---------------------------------------------------------------------------

export interface WorldgenFragmentInfo {
  exists: boolean;
  rowCount: number | null;
}

export interface WorldgenSourceEntry {
  stem: string;
  base: WorldgenFragmentInfo & { path: string };
  fragments: {
    ext: WorldgenFragmentInfo;
    web: WorldgenFragmentInfo;
    patch: WorldgenFragmentInfo;
    webPatch: WorldgenFragmentInfo;
  };
}

export interface WorldgenSourcesResponse {
  extDir: string;
  stems: WorldgenSourceEntry[];
}

/** One row of <Stem>.web.patch.csv (RowName,Column,Op,Value,Reason). */
export interface WorldgenPatch {
  rowName: string;
  column: string;
  op: string;
  value: string;
  reason: string;
}

export interface WorldgenBaseRow {
  rowName: string;
  displayName: string;
  owner: 'base' | 'ext';
}

export interface WorldgenFkOptions {
  column: string;
  targetTable: string;
  targetPrefix: string;
  rowNames: string[];
  groupTokens: string[];
  extras: string[];
}

export interface WorldgenGroupToken {
  token: string;
  domain: string;
  members: string[];
}

export interface WorldgenWebResponse {
  stem: string;
  columns: string[];
  columnTypes: ManifestColumnType[];
  baseRows: WorldgenBaseRow[];
  webRows: string[][];
  webPatches: WorldgenPatch[];
  fks: ManifestForeignKey[];
  fkOptions: WorldgenFkOptions[];
  wildcards: string[];
  groupTokens: WorldgenGroupToken[];
  adjacencyCategoryColumns: string[];
  traversalMovementModes: string[];
}

export interface WorldgenPutBody {
  webRows: string[][];
  webPatches: WorldgenPatch[];
  message?: string;
}

export interface WorldgenPutSuccess {
  success: true;
  /** null = nothing changed (byte-identical to HEAD). */
  commit: string | null;
  normalizeOutput: string;
  findings: Finding[];
  summaryCounts: FindingSummaryCounts;
}

/** Any refusal/failure. findings/summaryCounts are present when the reason is
 * 'validation_errors' (the rollback path). */
export interface WorldgenPutFailure {
  success: false;
  reason: string;
  detail?: unknown;
  findings?: Finding[];
  summaryCounts?: FindingSummaryCounts;
}

export type WorldgenPutResponse = WorldgenPutSuccess | WorldgenPutFailure;
