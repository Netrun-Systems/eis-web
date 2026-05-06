// ============================================================
// EIS Web — PostgreSQL connection (postgres.js)
// Target: Cloud SQL charlotte-pg-instance
//   Database: eis_simulation
//   User: postgres
//   Host: 127.0.0.1:5499 (via cloud-sql-proxy) or environment
//
// Cloud Run / Cloud SQL Unix socket:
//   Set env vars: DB_SOCKET_PATH, DB_NAME, DB_USER, DB_PASS
//   OR set DATABASE_URL to a standard postgresql:// URL
//
//   postgres.js detects a socket when host contains '/' and
//   connects via the Unix socket file at: <path>/.s.PGSQL.<port>
//   Cloud SQL socket directory: /cloudsql/<project>:<region>:<instance>
// ============================================================

import postgres from 'postgres';

function buildSqlClient() {
  const socketPath = process.env.DB_SOCKET_PATH;

  if (socketPath) {
    // Cloud Run: Unix socket via Cloud SQL connector
    // postgres.js uses path = host + '/.s.PGSQL.' + port when host contains '/'
    return postgres({
      host:            socketPath,   // e.g. /cloudsql/gen-lang-client-0047375361:us-central1:charlotte-pg-instance
      port:            5432,
      database:        process.env.DB_NAME || 'eis_simulation',
      username:        process.env.DB_USER || 'postgres',
      password:        process.env.DB_PASS || '',
      max:             10,
      idle_timeout:    30,
      connect_timeout: 10,
      onnotice: (notice) => console.info('[pg notice]', notice.message),
    });
  }

  // Local dev or DATABASE_URL override
  const DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://postgres:REDACTED-ROTATED-2026-05-06-USE-GCP-SECRET-MANAGER@127.0.0.1:5499/eis_simulation';

  return postgres(DATABASE_URL, {
    max:             10,
    idle_timeout:    30,
    connect_timeout: 10,
    onnotice: (notice) => console.info('[pg notice]', notice.message),
  });
}

const sql = buildSqlClient();

export default sql;

// Helper: verify connectivity (used by import/export scripts)
export async function testConnection(): Promise<void> {
  const [row] = await sql`SELECT current_database() AS db, version() AS ver`;
  console.log(`Connected to: ${row.db}`);
  console.log(`PostgreSQL:   ${row.ver}`);
}
