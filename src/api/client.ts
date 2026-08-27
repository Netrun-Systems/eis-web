/**
 * The single client-side API module (WEB-004). Every fetch to the WEB-003 API
 * goes through here — components never call fetch themselves. All calls hit
 * relative `/api/...` paths, so in dev they ride the Vite proxy to :3001.
 */

import type {
  BriefCheckResponse,
  BriefGetResponse,
  BriefListResponse,
  BriefPutBody,
  BriefPutResponse,
  GitLogResponse,
  HealthResponse,
  ManifestResponse,
  ReportResponse,
  TableGuardCheckResponse,
  TablePutBody,
  TablePutResponse,
  TableRowsResponse,
  TablesResponse,
  WorldgenPutBody,
  WorldgenPutResponse,
  WorldgenSourcesResponse,
  WorldgenValidationResponse,
  WorldgenWebResponse,
} from './types';

/** The one message every component shows on connection failure — kept
 * identical to the WEB-003 status-page wording. */
export const API_DOWN_MESSAGE = 'API not running — start with npm run dev:api';

export class ApiError extends Error {
  /** True when the API itself was unreachable (proxy refused / network),
   * as opposed to the API answering with an error status. */
  readonly connectionFailed: boolean;
  readonly status: number | null;

  constructor(message: string, opts: { connectionFailed: boolean; status: number | null }) {
    super(message);
    this.name = 'ApiError';
    this.connectionFailed = opts.connectionFailed;
    this.status = opts.status;
  }
}

/** User-facing text for a failed call. */
export function describeApiError(err: unknown): string {
  if (err instanceof ApiError && err.connectionFailed) return API_DOWN_MESSAGE;
  if (err instanceof Error) return err.message;
  return String(err);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    // fetch rejects (TypeError) only on network-level failure. With the Vite
    // proxy in front, a dead API surfaces as a 500 from the proxy instead —
    // handled below.
    throw new ApiError(API_DOWN_MESSAGE, { connectionFailed: true, status: null });
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    let gotJson = false;
    try {
      const body = (await res.json()) as { reason?: string; detail?: string };
      gotJson = true;
      if (body.reason) detail = `${body.reason}${body.detail ? `: ${body.detail}` : ''}`;
    } catch {
      /* non-JSON error body; keep the status text */
    }
    // The API always answers JSON. A non-JSON 5xx is the Vite proxy reporting
    // that the API target refused the connection — i.e. the API is down.
    const connectionFailed = !gotJson && res.status >= 500;
    throw new ApiError(connectionFailed ? API_DOWN_MESSAGE : detail, {
      connectionFailed,
      status: res.status,
    });
  }
  return (await res.json()) as T;
}

const getJson = <T,>(url: string): Promise<T> => requestJson<T>(url);
const postJson = <T,>(url: string): Promise<T> => requestJson<T>(url, { method: 'POST' });

export function fetchHealth(): Promise<HealthResponse> {
  return getJson('/api/health');
}

export function fetchTables(): Promise<TablesResponse> {
  return getJson('/api/tables');
}

export function fetchManifest(check = false): Promise<ManifestResponse> {
  return getJson(`/api/manifest${check ? '?check=1' : ''}`);
}

export function fetchTableRows(path: string): Promise<TableRowsResponse> {
  return getJson(`/api/tables/rows?path=${encodeURIComponent(path)}`);
}

/**
 * WEB-008: save an authored table over the WEB-003 PUT contract. Like
 * putWorldgenWeb, a refusal (409/400) RESOLVES with the failure body — the
 * caller needs the full {reason, detail} (collision groups, diff stats) to
 * render, not a one-line message. Only network/proxy failures throw.
 */
export async function putTableRows(path: string, body: TablePutBody): Promise<TablePutResponse> {
  let res: Response;
  try {
    res = await fetch(`/api/tables/rows?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(API_DOWN_MESSAGE, { connectionFailed: true, status: null });
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON body handled below */
  }
  if (parsed === null || typeof parsed !== 'object') {
    const connectionFailed = res.status >= 500;
    throw new ApiError(connectionFailed ? API_DOWN_MESSAGE : `HTTP ${res.status}`, {
      connectionFailed,
      status: res.status,
    });
  }
  return parsed as TablePutResponse;
}

export function fetchGitLog(path: string, n = 10): Promise<GitLogResponse> {
  return getJson(`/api/git/log?path=${encodeURIComponent(path)}&n=${n}`);
}

export function fetchReport(name: string): Promise<ReportResponse> {
  return getJson(`/api/reports/${encodeURIComponent(name)}`);
}

/** WEB-005: run the repo's worldgen validator server-side. exitCode 1 in the
 * response means errors were found — the call still resolves. */
export function runWorldgenValidation(): Promise<WorldgenValidationResponse> {
  return postJson('/api/validate/worldgen');
}

/** WEB-005: dry-run the hard-rule write guards against the file on disk. */
export function runTableGuardCheck(path: string): Promise<TableGuardCheckResponse> {
  return postJson(`/api/validate/table?path=${encodeURIComponent(path)}`);
}

/** WEB-007: the location briefs on disk (name, Location:, mtime, notes). */
export function fetchBriefs(): Promise<BriefListResponse> {
  return getJson('/api/briefs');
}

/** WEB-007: one brief — raw text + the parsed comments/entries. */
export function fetchBrief(name: string): Promise<BriefGetResponse> {
  return getJson(`/api/briefs/${encodeURIComponent(name)}`);
}

/** WEB-007: run location_brief.py against a SAVED brief. exitCode 1 in the
 * response means blockers — the call still resolves. */
export function checkBrief(name: string): Promise<BriefCheckResponse> {
  return postJson(`/api/briefs/${encodeURIComponent(name)}/check`);
}

/** WEB-007: check an UNSAVED draft buffer — runs against a temp file outside
 * the repo, so EISCORE is never touched. */
export function checkBriefDraft(raw: string): Promise<BriefCheckResponse> {
  return requestJson('/api/briefs/check-draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
}

/**
 * WEB-007: save a brief (write -> informational check -> single-file commit).
 * Like putWorldgenWeb, a refusal RESOLVES with the failure body; only
 * network/proxy failures throw.
 */
export async function putBrief(name: string, body: BriefPutBody): Promise<BriefPutResponse> {
  let res: Response;
  try {
    res = await fetch(`/api/briefs/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(API_DOWN_MESSAGE, { connectionFailed: true, status: null });
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON body handled below */
  }
  if (parsed === null || typeof parsed !== 'object') {
    const connectionFailed = res.status >= 500;
    throw new ApiError(connectionFailed ? API_DOWN_MESSAGE : `HTTP ${res.status}`, {
      connectionFailed,
      status: res.status,
    });
  }
  return parsed as BriefPutResponse;
}

/** WEB-006: which world-gen source fragments exist per stem. */
export function fetchWorldgenSources(): Promise<WorldgenSourcesResponse> {
  return getJson('/api/worldgen/sources');
}

/** WEB-006: everything the vocabulary editor needs for one stem. */
export function fetchWorldgenWeb(stem: string): Promise<WorldgenWebResponse> {
  return getJson(`/api/worldgen/web/${encodeURIComponent(stem)}`);
}

/**
 * WEB-006: save the web-owned fragments for one stem. Unlike the generic
 * helpers, a refusal (409/400) RESOLVES with the failure body — the caller
 * needs the full findings that caused a rollback, not a one-line message.
 * Only network/proxy failures throw.
 */
export async function putWorldgenWeb(
  stem: string,
  body: WorldgenPutBody,
): Promise<WorldgenPutResponse> {
  let res: Response;
  try {
    res = await fetch(`/api/worldgen/web/${encodeURIComponent(stem)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(API_DOWN_MESSAGE, { connectionFailed: true, status: null });
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON body handled below */
  }
  if (parsed === null || typeof parsed !== 'object') {
    const connectionFailed = res.status >= 500;
    throw new ApiError(connectionFailed ? API_DOWN_MESSAGE : `HTTP ${res.status}`, {
      connectionFailed,
      status: res.status,
    });
  }
  return parsed as WorldgenPutResponse;
}
