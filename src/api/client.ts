/**
 * The single client-side API module (WEB-004). Every fetch to the WEB-003 API
 * goes through here — components never call fetch themselves. All calls hit
 * relative `/api/...` paths, so in dev they ride the Vite proxy to :3001.
 */

import type {
  GitLogResponse,
  HealthResponse,
  ManifestResponse,
  ReportResponse,
  TableRowsResponse,
  TablesResponse,
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

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
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

export function fetchGitLog(path: string, n = 10): Promise<GitLogResponse> {
  return getJson(`/api/git/log?path=${encodeURIComponent(path)}&n=${n}`);
}

export function fetchReport(name: string): Promise<ReportResponse> {
  return getJson(`/api/reports/${encodeURIComponent(name)}`);
}
