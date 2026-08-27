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
