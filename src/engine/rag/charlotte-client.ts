// ============================================================
// EIS RAG Client — Charlotte Ingest API
// Connects to charlotte-ingest Cloud Run for semantic storage/retrieval
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CHARLOTTE_INGEST_URL: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_CHARLOTTE_INGEST_URL) ||
  'https://charlotte-ingest-216929447130.us-central1.run.app';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChunkMetadata {
  /** RAG collection name, e.g. 'eis_npc_memories' */
  collection: string;
  /** NPC ID or 'world' for world-level lore */
  source: string;
  /** Semantic type of this chunk */
  type: 'memory' | 'knowledge' | 'dialogue' | 'personality' | 'faction_lore' | 'conversation_pattern';
  npc_id?: string;
  faction?: string;
  emotional_context?: string;
  /** Simulation tick when stored */
  timestamp?: number;
  /** Per-NPC decay rate (0-1). 0 = permanent. */
  decay_rate?: number;
}

export interface QueryOptions {
  collection: string;
  top_k?: number;
  min_score?: number;
  /** Limit results to memories belonging to this NPC */
  filter_npc?: string;
  /** Limit results to a specific type */
  filter_type?: string;
  /** Limit results to a specific faction */
  filter_faction?: string;
}

export interface RAGResult {
  content: string;
  source: string;
  similarity_score: number;
  metadata?: Record<string, unknown>;
}

export interface RAGClient {
  store(content: string, metadata: ChunkMetadata): Promise<void>;
  query(queryText: string, options: QueryOptions): Promise<RAGResult[]>;
  batchStore(chunks: Array<{ content: string; metadata: ChunkMetadata }>): Promise<number>;
  isAvailable(): boolean;
}

// ---------------------------------------------------------------------------
// Auth token management
// ---------------------------------------------------------------------------

let cachedToken: string | null = null;
let tokenExpiry = 0;

/**
 * Get GCP identity token for Cloud Run IAM auth.
 * In browser context we proxy through the local API server.
 * In Node.js (seed script), we use google-auth-library.
 */
async function getAuthToken(): Promise<string | null> {
  // Check env var first (set by seed script or local dev)
  const envToken = typeof process !== 'undefined'
    ? process.env.CHARLOTTE_INGEST_TOKEN
    : undefined;
  if (envToken) return envToken;

  // Check if we have a valid cached token
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  // Try to fetch from GCE metadata server (server-side only)
  if (typeof window === 'undefined') {
    try {
      const res = await fetch(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(2000) }
      );
      if (res.ok) {
        const data = await res.json() as { access_token: string; expires_in: number };
        cachedToken = data.access_token;
        tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
        return cachedToken;
      }
    } catch {
      // Not on GCE — fall through
    }
  }

  // Browser: no direct token; caller must proxy or set token via window.__EIS_RAG_TOKEN
  const windowToken = typeof window !== 'undefined'
    ? (window as unknown as { __EIS_RAG_TOKEN?: string }).__EIS_RAG_TOKEN
    : undefined;
  return windowToken ?? null;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function ingestChunk(content: string, metadata: ChunkMetadata, token: string | null): Promise<void> {
  const form = new FormData();
  const blob = new Blob([content], { type: 'text/plain' });
  form.append('file', blob, `${metadata.source}_${metadata.type}.txt`);
  form.append('collection', metadata.collection);
  form.append('source', metadata.source);
  // Additional metadata fields are passed as JSON in a 'metadata' field
  const metaJson = JSON.stringify({
    type: metadata.type,
    npc_id: metadata.npc_id,
    faction: metadata.faction,
    emotional_context: metadata.emotional_context,
    timestamp: metadata.timestamp,
    decay_rate: metadata.decay_rate,
  });
  form.append('metadata', metaJson);

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${CHARLOTTE_INGEST_URL}/ingest`, {
    method: 'POST',
    headers,
    body: form,
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Charlotte ingest failed (${res.status}): ${text}`);
  }
}

async function queryRAG(
  queryText: string,
  options: QueryOptions,
  token: string | null
): Promise<RAGResult[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const body: Record<string, unknown> = {
    query: queryText,
    collection: options.collection,
    top_k: options.top_k ?? 5,
    min_score: options.min_score ?? 0.3,
    format: 'raw',
  };

  // Apply NPC/type/faction filters via query augmentation and metadata filter
  const filters: Record<string, string> = {};
  if (options.filter_npc) filters['npc_id'] = options.filter_npc;
  if (options.filter_type) filters['type'] = options.filter_type;
  if (options.filter_faction) filters['faction'] = options.filter_faction;
  if (Object.keys(filters).length > 0) {
    body['filters'] = filters;
  }

  const res = await fetch(`${CHARLOTTE_INGEST_URL}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Charlotte query failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { results: RAGResult[] };
  return data.results ?? [];
}

// ---------------------------------------------------------------------------
// RAGClient implementation
// ---------------------------------------------------------------------------

class CharlotteRAGClient implements RAGClient {
  private _available = true;
  private _failureCount = 0;
  private readonly MAX_FAILURES = 3;
  private _backoffUntil = 0;

  isAvailable(): boolean {
    if (Date.now() < this._backoffUntil) return false;
    return this._available;
  }

  private markFailure(err: unknown): void {
    this._failureCount++;
    console.warn(`[RAG] Charlotte ingest unavailable (failure ${this._failureCount}/${this.MAX_FAILURES}):`, err);
    if (this._failureCount >= this.MAX_FAILURES) {
      this._available = false;
      // Back off for 60 seconds before retrying
      this._backoffUntil = Date.now() + 60_000;
      console.warn('[RAG] Entering backoff mode for 60s');
    }
  }

  private markSuccess(): void {
    this._failureCount = 0;
    this._available = true;
    this._backoffUntil = 0;
  }

  async store(content: string, metadata: ChunkMetadata): Promise<void> {
    if (!this.isAvailable()) {
      console.warn('[RAG] store() skipped — charlotte-ingest unavailable');
      return;
    }
    try {
      const token = await getAuthToken();
      await ingestChunk(content, metadata, token);
      this.markSuccess();
    } catch (err) {
      this.markFailure(err);
      // Graceful degradation — don't throw; RAG is enhancement, not core
    }
  }

  async query(queryText: string, options: QueryOptions): Promise<RAGResult[]> {
    if (!this.isAvailable()) {
      console.warn('[RAG] query() returning [] — charlotte-ingest unavailable');
      return [];
    }
    try {
      const token = await getAuthToken();
      const results = await queryRAG(queryText, options, token);
      this.markSuccess();
      return results;
    } catch (err) {
      this.markFailure(err);
      return [];
    }
  }

  async batchStore(chunks: Array<{ content: string; metadata: ChunkMetadata }>): Promise<number> {
    if (!this.isAvailable()) {
      console.warn(`[RAG] batchStore() skipped — ${chunks.length} chunks dropped`);
      return 0;
    }

    let successCount = 0;
    // Process in batches of 5 to avoid overwhelming the service
    const BATCH_SIZE = 5;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async ({ content, metadata }) => {
          try {
            const token = await getAuthToken();
            await ingestChunk(content, metadata, token);
            successCount++;
          } catch (err) {
            console.warn(`[RAG] batchStore chunk failed for ${metadata.source}:`, err);
          }
        })
      );
      // Throttle to ~5 req/s
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    this.markSuccess();
    console.log(`[RAG] batchStore: ${successCount}/${chunks.length} chunks stored`);
    return successCount;
  }
}

// Singleton client
export const ragClient: RAGClient = new CharlotteRAGClient();

// ---------------------------------------------------------------------------
// Collection name constants
// ---------------------------------------------------------------------------

export const EIS_COLLECTIONS = {
  NPC_MEMORIES: 'eis_npc_memories',
  NPC_KNOWLEDGE: 'eis_npc_knowledge',
  DIALOGUE: 'eis_dialogue',
  WORLD_LORE: 'eis_world_lore',
  PERSONALITY_PROFILES: 'eis_personality_profiles',
  CONVERSATION_PATTERNS: 'eis_conversation_patterns',
} as const;
