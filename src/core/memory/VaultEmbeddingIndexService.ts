/**
 * VaultEmbeddingIndexService — R-E4 (advantage-parity): the optional
 * embedding channel on top of the R-C1 lexical index.
 *
 * Design: docs/requirements/advantage-parity-re4-design.md (storage scale,
 * endpoint selection, merge semantics). Key points:
 * - NOTE-level vectors (10k notes × 1536-dim float32 ≈ 61MB worst case — the
 *   documented "万篇级可控" bound); chunking rejected by scale math.
 * - Content-addressed increments: a note re-embeds only when its cleaned-text
 *   hash changes; deletions remove vectors; shards hold ≤256 base64
 *   float32 vectors under `.opencodian/vault-embeddings/`.
 * - Embedding endpoint: the user-configured provider's OpenAI-compatible
 *   POST {baseUrl}/embeddings (no SSRF loopback guard — local Ollama et al.
 *   are legitimate user-configured targets, unlike R-E1's arbitrary URLs).
 * - Honest degradation: every failure mode maps to a reason string the app
 *   layer can notice; the query then returns [] and lexical-only survives.
 */

import * as http from 'node:http';
import * as https from 'node:https';

import { createLogger } from '../../shared';
import { isIndexablePath } from './vaultRetrievalIndex';

const logger = createLogger('VaultEmbeddingIndexService');

const EMBEDDINGS_DIR = '.opencodian/vault-embeddings';
const MANIFEST_FILE = `${EMBEDDINGS_DIR}/manifest.json`;
const SHARD_MAX_ENTRIES = 256;
/** Note text cap fed to the embedding endpoint (chars, design §3). */
const NOTE_TEXT_CAP_CHARS = 4000;
/** Serial embed pacing (ms) to stay friendly to provider rate limits. */
const EMBED_PACE_MS = 150;
const EMBED_TIMEOUT_MS = 30_000;
const MAX_DIMS = 1536;

/** The embedding client seam (tests inject a fake). */
export interface EmbeddingClient {
  embed(inputs: readonly string[]): Promise<number[][]>;
}

export interface EmbeddingEndpointConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export type SemanticDegradationReason =
  | 'disabled'
  | 'not-configured'
  | 'index-empty'
  | 'embed-failed'
  | 'unavailable';

export interface SemanticQueryOptions {
  /** Callback for one-time honest degradation notices. */
  reportDegradation?: (reason: SemanticDegradationReason, detail?: string) => void;
}

/**
 * OpenAI-compatible /embeddings client over node:http(s) (build-external
 * precedent: R-E1 transport). Local endpoints (Ollama, LM Studio) are
 * explicitly allowed — this is the user's own configured provider.
 */
export function createOpenAiCompatibleEmbeddingClient(
  config: EmbeddingEndpointConfig,
): EmbeddingClient {
  const requestOnce = (body: string): Promise<{ status: number; text: string }> =>
    new Promise((resolve, reject) => {
      const url = new URL('embeddings', ensureTrailingSlash(config.baseUrl));
      const client = url.protocol === 'https:' ? https : http;
      const request = client.request(
        url,
        {
          method: 'POST',
          timeout: EMBED_TIMEOUT_MS,
          headers: {
            'content-type': 'application/json',
            ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => resolve({
            status: response.statusCode ?? 0,
            text: Buffer.concat(chunks).toString('utf8'),
          }));
        },
      );
      request.on('timeout', () => request.destroy(new Error('timeout')));
      request.on('error', reject);
      request.end(body);
    });

  return {
    embed: async (inputs) => {
      const response = await requestOnce(JSON.stringify({ model: config.model, input: inputs }));
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`embeddings endpoint returned ${response.status}`);
      }
      const parsed = JSON.parse(response.text) as { data?: Array<{ embedding?: unknown }> };
      const embeddings = parsed.data?.map((entry) => entry.embedding) ?? [];
      if (embeddings.length !== inputs.length || embeddings.some((e) => !Array.isArray(e))) {
        throw new Error('embeddings endpoint returned a mismatched payload');
      }
      return embeddings as number[][];
    },
  };
}

function ensureTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

// ─── Storage codec (pure, exported for tests) ──────────────────────────────

export function encodeFloat32(vector: readonly number[]): string {
  const floats = new Float32Array(vector.length);
  for (let index = 0; index < vector.length; index += 1) {
    floats[index] = vector[index];
  }
  return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength).toString('base64');
}

export function decodeFloat32(encoded: string): Float32Array {
  const buffer = Buffer.from(encoded, 'base64');
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
}

/** Content hash of the cleaned note text (design §3, djb2-64 family). */
export function hashEmbeddingContent(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  }
  return `${hash.toString(16).padStart(8, '0')}-${text.length.toString(16)}`;
}

/** Cleaned note text: frontmatter/code dropped, markup flattened, capped. */
export function buildEmbeddingText(title: string, content: string): string {
  const body = content
    .replace(/^---[\s\S]*?---\s*/u, '')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/[#*`>[\]]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return `${title}\n${body}`.slice(0, NOTE_TEXT_CAP_CHARS);
}

/** Plain cosine over normalized float32 vectors (design §3 query path). */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Service ───────────────────────────────────────────────────────────────

export interface VaultEmbeddingFsAdapter {
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, data: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  listMarkdownFiles(): Promise<Array<{ path: string; content: string; title: string }>>;
  onFilesChanged?(callback: () => void): (() => void) | void;
}

interface ManifestEntry {
  path: string;
  hash: string;
  shard: number;
  offset: number;
}

interface Manifest {
  version: 1;
  entries: Record<string, ManifestEntry>;
}

function emptyManifest(): Manifest {
  return { version: 1, entries: {} };
}

export interface SemanticHit {
  path: string;
  score: number;
}

export class VaultEmbeddingIndexService {
  private manifest: Manifest = emptyManifest();
  private shards = new Map<number, Map<string, Float32Array>>();
  private loaded = false;
  private indexing = false;
  private lastDegradationReported: SemanticDegradationReason | null = null;
  private disposeWatcher: (() => void) | null = null;

  constructor(
    private readonly fsAdapter: VaultEmbeddingFsAdapter,
    private readonly getClient: () => EmbeddingClient | null,
    private readonly isPathInScope: (path: string) => boolean = () => true,
  ) {}

  dispose(): void {
    this.disposeWatcher?.();
    this.disposeWatcher = null;
  }

  isIndexing(): boolean {
    return this.indexing;
  }

  indexedCount(): number {
    return Object.keys(this.manifest.entries).length;
  }

  async onSettingsChanged(watch: boolean): Promise<void> {
    if (watch && this.fsAdapter.onFilesChanged && !this.disposeWatcher) {
      this.fsAdapter.onFilesChanged(() => {
        void this.ensureIndexed().catch(() => undefined);
      });
    }
    await this.ensureIndexed();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    try {
      if (await this.fsAdapter.exists(MANIFEST_FILE)) {
        const raw = await this.fsAdapter.readFile(MANIFEST_FILE);
        const parsed = raw ? JSON.parse(raw) as Partial<Manifest> : null;
        if (parsed && parsed.version === 1 && parsed.entries) {
          this.manifest = { version: 1, entries: parsed.entries };
        }
      }
    } catch {
      this.manifest = emptyManifest();
    }
    this.loaded = true;
  }

  /** Incremental index pass (design §3): add/update/remove with pacing. */
  async ensureIndexed(): Promise<number> {
    await this.ensureLoaded();
    if (this.indexing) {
      return 0;
    }
    const client = this.getClient();
    if (!client) {
      return 0;
    }
    this.indexing = true;
    let embedded = 0;
    try {
      const files = (await this.fsAdapter.listMarkdownFiles())
        .filter((file) => this.isPathInScope(file.path));
      const seen = new Set<string>();
      for (const file of files) {
        seen.add(file.path);
        const text = buildEmbeddingText(file.title, file.content);
        const hash = hashEmbeddingContent(text);
        const existing = this.manifest.entries[file.path];
        if (existing && existing.hash === hash) {
          continue;
        }
        try {
          const [vector] = await client.embed([text]);
          if (!vector || vector.length === 0 || vector.length > MAX_DIMS) {
            continue;
          }
          await this.upsertVector(file.path, hash, vector);
          embedded += 1;
          if (EMBED_PACE_MS > 0) {
            await new Promise((resolve) => setTimeout(resolve, EMBED_PACE_MS));
          }
        } catch (error) {
          logger.warn('embedding failed for note; leaving previous vector', {
            path: file.path,
            error: String(error),
          });
        }
      }
      const removed = Object.keys(this.manifest.entries)
        .filter((p) => !seen.has(p));
      for (const gone of removed) {
        await this.removeVector(gone);
      }
      await this.persistManifest();
    } finally {
      this.indexing = false;
    }
    return embedded;
  }

  private async upsertVector(notePath: string, hash: string, vector: number[]): Promise<void> {
    const shardIndex = this.nextShardIndexFor(notePath);
    await this.loadShard(shardIndex);
    let shard = this.shards.get(shardIndex);
    if (!shard) {
      shard = new Map<string, Float32Array>();
      this.shards.set(shardIndex, shard);
    }
    shard.set(notePath, decodeFloat32(encodeFloat32(vector)));
    this.manifest.entries[notePath] = { path: notePath, hash, shard: shardIndex, offset: shard.size - 1 };
    await this.persistShard(shardIndex);
  }

  private nextShardIndexFor(notePath: string): number {
    const existing = this.manifest.entries[notePath];
    if (existing) {
      return existing.shard;
    }
    // First shard with room, else a new one.
    for (const [index, shard] of this.shards) {
      if (shard.size < SHARD_MAX_ENTRIES) {
        return index;
      }
    }
    return this.shards.size;
  }

  private async removeVector(notePath: string): Promise<void> {
    const entry = this.manifest.entries[notePath];
    if (!entry) {
      return;
    }
    await this.loadShard(entry.shard);
    this.shards.get(entry.shard)?.delete(notePath);
    delete this.manifest.entries[notePath];
    await this.persistShard(entry.shard);
  }

  private async loadShard(shardIndex: number): Promise<void> {
    if (this.shards.has(shardIndex)) {
      return;
    }
    const shardPath = `${EMBEDDINGS_DIR}/shard-${shardIndex}.json`;
    try {
      if (await this.fsAdapter.exists(shardPath)) {
        const raw = await this.fsAdapter.readFile(shardPath);
        const parsed = raw ? JSON.parse(raw) as Record<string, string> : {};
        const shard = new Map<string, Float32Array>();
        for (const [p, encoded] of Object.entries(parsed)) {
          shard.set(p, decodeFloat32(encoded));
        }
        this.shards.set(shardIndex, shard);
        return;
      }
    } catch {
      // Unreadable shard: start it fresh (the manifest drives truth).
    }
    this.shards.set(shardIndex, new Map());
  }

  private async persistShard(shardIndex: number): Promise<void> {
    const shard = this.shards.get(shardIndex);
    if (!shard) {
      return;
    }
    const record: Record<string, string> = {};
    for (const [p, vector] of shard) {
      record[p] = encodeFloat32(Array.from(vector));
    }
    await this.fsAdapter.writeFile(`${EMBEDDINGS_DIR}/shard-${shardIndex}.json`, JSON.stringify(record));
  }

  private async persistManifest(): Promise<void> {
    try {
      if (!(await this.fsAdapter.exists(EMBEDDINGS_DIR))) {
        await this.fsAdapter.mkdir(EMBEDDINGS_DIR);
      }
      await this.fsAdapter.writeFile(MANIFEST_FILE, JSON.stringify(this.manifest));
    } catch (error) {
      logger.warn('failed to persist embedding manifest', { error: String(error) });
    }
  }

  /**
   * Semantic query: embed the query text and rank all note vectors by
   * cosine (flat, in-memory). Returns [] with an honest degradation reason
   * on every failure path — never a fabricated hit.
   */
  async query(
    queryText: string,
    options: SemanticQueryOptions = {},
  ): Promise<{ hits: SemanticHit[]; degradation: SemanticDegradationReason | null }> {
    await this.ensureLoaded();
    const report = (reason: SemanticDegradationReason, detail?: string) => {
      if (this.lastDegradationReported !== reason) {
        this.lastDegradationReported = reason;
        options.reportDegradation?.(reason, detail);
      }
    };
    const client = this.getClient();
    if (!client) {
      report('not-configured');
      return { hits: [], degradation: 'not-configured' };
    }
    if (Object.keys(this.manifest.entries).length === 0) {
      report('index-empty');
      return { hits: [], degradation: 'index-empty' };
    }
    let queryVector: number[];
    try {
      [queryVector] = await client.embed([buildEmbeddingText('', queryText)]);
    } catch (error) {
      report('embed-failed', String(error));
      return { hits: [], degradation: 'embed-failed' };
    }
    if (!queryVector) {
      report('embed-failed');
      return { hits: [], degradation: 'embed-failed' };
    }
    const query = decodeFloat32(encodeFloat32(queryVector));
    const hits: SemanticHit[] = [];
    for (const [notePath, entry] of Object.entries(this.manifest.entries)) {
      await this.loadShard(entry.shard);
      const vector = this.shards.get(entry.shard)?.get(notePath);
      if (!vector) {
        continue;
      }
      hits.push({ path: notePath, score: cosineSimilarity(query, vector) });
    }
    hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    this.lastDegradationReported = null;
    return { hits, degradation: null };
  }

  /** Static scope matcher re-exported for the app wiring (R-C1 rules). */
  static scopeMatcher(excludedPaths: readonly string[]): (p: string) => boolean {
    return (p: string) => isIndexablePath(p, excludedPaths);
  }
}

export const VAULT_EMBEDDINGS_DIR = EMBEDDINGS_DIR;
export const VAULT_EMBEDDINGS_MANIFEST_FILE = MANIFEST_FILE;
