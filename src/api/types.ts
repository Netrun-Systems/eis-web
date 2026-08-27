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

/** WEB-008 — PUT /api/tables/rows body (mirror of server WriteRequestBody).
 * Rows are string[][] aligned to columns; message defaults server-side to
 * `eisweb: edit <stem> (<n> rows)`. */
export interface TablePutBody {
  columns: string[];
  rows: string[][];
  message?: string;
  validate?: boolean;
}

export interface TablePutSuccess {
  success: true;
  commit: string;
  validationReport: unknown;
}

/** Any WEB-003 refusal: reason is one of classification_refused | file_dirty |
 * key_collision | semicolon_hazard | raw_read_comma | validation_failed |
 * bad_request | git_error | write_failed | commit_failed. */
export interface TablePutFailure {
  success: false;
  reason: string;
  detail?: unknown;
}

export type TablePutResponse = TablePutSuccess | TablePutFailure;

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

// ---------------------------------------------------------------------------
// WEB-007 — Brief Studio (mirrors of server/types.ts + the location_brief.py
// --json report shape, which the server passes through faithfully).
// ---------------------------------------------------------------------------

export interface BriefListEntry {
  name: string;
  mtime: string;
  location: string;
  commentLines: number;
}

export interface BriefListResponse {
  dir: string;
  briefs: BriefListEntry[];
}

export interface BriefParsedEntry {
  key: string;
  values: string[];
  inline: boolean;
}

export interface BriefGetResponse {
  name: string;
  raw: string;
  parsed: {
    comments: string[];
    entries: BriefParsedEntry[];
  };
}

/** A designer-term -> RowName resolution as the tool reports it. */
export interface BriefResolution {
  asked: string;
  resolved: string | null;
}

export interface BriefPieceEntry {
  piece: string;
  have: number;
  reasons: string[];
  candidates: number;
  /** [pack name, candidate count] pairs from the harvest worklist. */
  packs: [string, number][];
  /** [CityStyle, row count] pairs — the charter's "read the style column". */
  styles: [string, number][];
  consumed: boolean;
  consumers: string[];
  /** Present only when the brief names a City style (WG-209). */
  family_hop?: number | null;
  family_hop_name?: string | null;
  in_family?: number;
  outside_chain?: number;
  family_note?: string | null;
}

export interface BriefFinding {
  severity: 'BLOCKER' | 'GAP' | 'NOTE';
  section: string;
  detail: string;
  fix: string | null;
}

/** location_brief.py's --json report. Loosely typed on purpose: the server
 * passes it through unmodified, so unknown extra fields simply ride along. */
export interface BriefCheckReport {
  brief?: string;
  location?: string;
  purpose?: string;
  region?: BriefResolution;
  landmark?: string | null;
  city_style?: { asked: string; family: string | null; chain: string[] };
  structures?: BriefResolution[];
  spaces?: { required: string[]; preferred: string[] };
  connections?: string[];
  networks?: BriefResolution[];
  traversal?: { asked: string; declared: boolean }[];
  states?: BriefResolution[];
  structure_coverage?: { structure: string; assets: string[] }[];
  pieces?: BriefPieceEntry[];
  rules?: { rule: string; target: string; hard: boolean }[];
  verdict?: string;
  counts?: { blocker: number; gap: number; note: number; style_substitution: number };
  findings?: BriefFinding[];
  [key: string]: unknown;
}

/** One check run. exitCode 1 = at least one blocker — still a 200 result.
 * `failure` is set only when the tool could not run/report (PUT path). */
export interface BriefCheckResponse {
  ranAt: string;
  exitCode: number;
  verdict: string | null;
  result: BriefCheckReport | null;
  failure?: string;
}

export interface BriefPutBody {
  raw: string;
  message?: string;
}

export interface BriefPutSuccess {
  success: true;
  name: string;
  commit: string;
  check: BriefCheckResponse;
}

export interface BriefPutFailure {
  success: false;
  reason: string;
  detail?: unknown;
}

export type BriefPutResponse = BriefPutSuccess | BriefPutFailure;

// ---------------------------------------------------------------------------
// WEB-009 — DAM
// ---------------------------------------------------------------------------

/** The consumed piece-type map, parsed live from Scripts/location_brief.py. */
export interface DamConsumedTypesResponse {
  source: string;
  count: number;
  consumers: string[];
  types: Record<string, string[]>;
}

export interface DamPieceTypeRow {
  name: string;
  consumed: boolean;
  consumers: string[];
  total: number;
  byStyle: Record<string, number>;
}

export interface DamStyleFallback {
  style: string;
  family: string;
  chain: string[];
}

export interface DamKitCoverageResponse {
  ranAt: string;
  catalogPath: string;
  consumedSource: string;
  totalRows: number;
  consumedRows: number;
  /** WG-218's number, computed live. */
  inertRows: number;
  inertPct: number;
  styles: string[];
  pieceTypes: DamPieceTypeRow[];
  fallbacks: DamStyleFallback[];
}

export interface DamPackEntry {
  name: string;
  cityStyle: string;
  onDisk: boolean;
}

export interface DamPackListResponse {
  ranAt: string;
  exitCode: number;
  /** null = the --list output resisted parsing; render `raw` preformatted. */
  packs: DamPackEntry[] | null;
  raw: string;
}

export interface DamMergeSummary {
  kitKept: number;
  kitNew: number;
  kitTotal: number;
  propKept: number;
  propNew: number;
  propTotal: number;
}

export interface DamDryRunResponse {
  pack: string;
  ranAt: string;
  exitCode: number;
  report: string;
  merge: DamMergeSummary | null;
}

export interface DamFallbackCheck {
  exitCode: number;
  output: string;
}

export interface DamPackWriteSuccess {
  success: true;
  pack: string;
  /** null = idempotent — the pack was already registered byte-identically. */
  commit: string | null;
  note?: string;
  diffstat: string | null;
  report: string;
  fallbackCheck: DamFallbackCheck;
}

export interface DamPackWriteFailure {
  success: false;
  reason: string;
  detail?: unknown;
}

export type DamPackWriteResponse = DamPackWriteSuccess | DamPackWriteFailure;
