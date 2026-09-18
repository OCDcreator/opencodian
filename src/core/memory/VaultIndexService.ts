/**
 * VaultIndexService: background, incremental, time-budgeted lexical index
 * over the vault's Markdown notes (R-C1). Storage lives under
 * `.opencodian/vault-index/` inside the vault — a dot-prefixed directory
 * Obsidian never lists or searches — and stores tokens + line numbers only.
 *
 * Everything vault-facing goes through the injected `VaultIndexFs` port so
 * the service is unit-testable and stays backend/Obsidian-free
 * (MemoryBackendService pattern). The service is dormant until
 * `vaultRetrievalEnabled` turns true: off means no listeners, no reads, no
 * writes and no query cost.
 */

import { createLogger } from '../../shared';
import { scanForSecrets } from './memorySecretScan';
import {
  buildVaultIndexEntry,
  fitShardToBudget,
  isExcludedPath,
  isIndexablePath,
  MAX_MANIFEST_BYTES,
  selectVaultSnippets,
  shardNameFor,
  truncateNoteSnippet,
  VAULT_INDEX_ROOT,
  type VaultIndexEntry,
  type VaultIndexManifest,
  type VaultManifestRow,
} from './vaultRetrievalIndex';

const logger = createLogger('VaultIndexService');

/** One vault note as the fs port sees it. */
export interface VaultFileMeta {
  readonly path: string;
  readonly mtimeMs: number;
}

export type VaultChangeKind = 'modify' | 'create' | 'delete' | 'rename';

/**
 * Vault + index-storage port. Index writes are constrained to
 * `.opencodian/vault-index/**` by contract (the adapter enforces the prefix).
 */
export interface VaultIndexFs {
  listMarkdownFiles(): Promise<readonly VaultFileMeta[]>;
  /** Read a vault note's current text; null when it vanished. */
  read(path: string): Promise<string | null>;
  writeIndexFile(path: string, data: string): Promise<void>;
  readIndexFile(path: string): Promise<string | null>;
  deleteIndexFile(path: string): Promise<void>;
  onVaultChanged(handler: (path: string, kind: VaultChangeKind) => void): () => void;
}

/** The plugin settings slice this service consumes. */
export interface VaultRetrievalSettingsSlice {
  readonly vaultRetrievalEnabled: boolean;
  readonly vaultRetrievalTopK: number;
  readonly vaultRetrievalMaxCharsPerNote: number;
  readonly vaultRetrievalExcludedPaths: readonly string[];
}

/** One injected snippet: located lines plus the already-truncated text. */
export interface VaultRetrievalSnippet {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly score: number;
  readonly verbatim: boolean;
  /** Snippet text after the per-note character cap (never cut mid-fence). */
  readonly text: string;
  readonly truncated: boolean;
}

/** How long a single rebuild tick may run before yielding to the UI. */
const DEFAULT_TICK_BUDGET_MS = 8;
/** Coalesce bursts of vault writes before re-indexing one note. */
const CHANGE_DEBOUNCE_MS = 2000;

export const VAULT_MANIFEST_PATH = `${VAULT_INDEX_ROOT}/manifest.json`;

function shardPathFor(path: string): string {
  return `${VAULT_INDEX_ROOT}/shards/${shardNameFor(path)}`;
}

function emptyManifest(): VaultIndexManifest {
  return { version: 1, entries: {} };
}

export class VaultIndexService {
  private fs: VaultIndexFs | null = null;
  private getSettings: (() => VaultRetrievalSettingsSlice) | null = null;
  private unsubscribeChanges: (() => void) | null = null;
  private manifest: VaultIndexManifest = emptyManifest();
  private entries = new Map<string, VaultIndexEntry>();
  private pendingChanges = new Map<string, VaultChangeKind>();
  private changeTimer: ReturnType<typeof setTimeout> | null = null;
  private rebuildChain: Promise<void> = Promise.resolve();
  private lastExcludedSignature: string | null = null;
  private disposed = false;

  /**
   * Attach the fs port and settings source. Does not start anything until
   * `onSettingsChanged()` observes an enabled setting.
   */
  attach(fs: VaultIndexFs, getSettings: () => VaultRetrievalSettingsSlice): void {
    this.fs = fs;
    this.getSettings = getSettings;
  }

  /** React to settings changes: start, stop, or invalidate on rule changes. */
  async onSettingsChanged(): Promise<void> {
    if (!this.fs || !this.getSettings || this.disposed) {
      return;
    }
    const settings = this.getSettings();
    const excludedSignature = JSON.stringify(settings.vaultRetrievalExcludedPaths);
    if (!settings.vaultRetrievalEnabled) {
      this.stop();
      this.lastExcludedSignature = null;
      return;
    }
    if (this.lastExcludedSignature !== null && this.lastExcludedSignature !== excludedSignature) {
      await this.invalidateAll();
    }
    this.lastExcludedSignature = excludedSignature;
    this.start();
    // Fire-and-forget: the rebuild is time-budgeted internally and must never
    // delay startup or a settings toggle (acceptance 4 — non-blocking).
    void this.requestRebuild();
  }

  /** True once the service holds at least a loaded manifest. */
  isStarted(): boolean {
    return this.unsubscribeChanges !== null;
  }

  /** Number of notes currently indexed (cache + manifest union). */
  indexedNoteCount(): number {
    return this.entries.size > 0 ? this.entries.size : Object.keys(this.manifest.entries).length;
  }

  /**
   * Query the index: pure in-memory token intersection, then fresh snippet
   * reads. Fail-closed — any error yields no snippets and never throws to
   * the chat path.
   */
  async select(query: string): Promise<readonly VaultRetrievalSnippet[]> {
    if (!this.getSettings || !this.getSettings().vaultRetrievalEnabled) {
      return [];
    }
    if (query.trim() === '' || this.entries.size === 0) {
      return [];
    }
    try {
      const settings = this.getSettings();
      const ranked = selectVaultSnippets({
        query,
        entries: [...this.entries.values()],
        topK: settings.vaultRetrievalTopK,
      });
      const snippets: VaultRetrievalSnippet[] = [];
      let skippedSecretGuard = 0;
      for (const candidate of ranked) {
        const content = await this.fs?.read(candidate.path);
        if (content === null || content === undefined) {
          continue;
        }
        const lines = content.replace(/^\uFEFF/u, '').replace(/\r\n/gu, '\n').split('\n');
        const startLine = Math.max(1, candidate.startLine);
        const endLine = Math.min(lines.length, candidate.endLine);
        if (startLine > endLine) {
          continue;
        }
        const raw = lines.slice(startLine - 1, endLine).join('\n');
        const { text, truncated } = truncateNoteSnippet(raw, settings.vaultRetrievalMaxCharsPerNote);
        if (text.trim() === '') {
          continue;
        }
        if (scanForSecrets(text).hit) {
          // Same guard as memory recall: possible credentials are never
          // injected; the file on disk stays untouched.
          skippedSecretGuard += 1;
          continue;
        }
        snippets.push({
          path: candidate.path,
          startLine,
          endLine,
          score: candidate.score,
          verbatim: candidate.verbatim,
          text,
          truncated,
        });
      }
      if (skippedSecretGuard > 0) {
        logger.debug('vault retrieval secret guard withheld snippets', { skippedSecretGuard });
      }
      return snippets;
    } catch (error) {
      logger.warn('vault retrieval select failed; injecting nothing this turn', { error });
      return [];
    }
  }

  /** Drop the whole index (memory + disk) and rebuild from scratch. */
  async invalidateAll(): Promise<void> {
    const shardNames = Object.values(this.manifest.entries).map((row) => row.shard);
    this.manifest = emptyManifest();
    this.entries.clear();
    for (const shard of shardNames) {
      try {
        await this.fs?.deleteIndexFile(`${VAULT_INDEX_ROOT}/shards/${shard}`);
      } catch (error) {
        logger.debug('failed to delete shard during invalidate', { shard, error });
      }
    }
    try {
      await this.fs?.deleteIndexFile(VAULT_MANIFEST_PATH);
    } catch (error) {
      logger.debug('failed to delete manifest during invalidate', { error });
    }
  }

  /**
   * Full background pass: index missing/changed notes, prune deletions.
   * Rebuilds and change flushes share one serialization chain, so a
   * fire-and-forget rebuild plus an explicit awaited pass never interleave;
   * an awaited call waits for its own turn (and everything queued earlier).
   */
  async rebuildMissing(maxMsPerTick: number = DEFAULT_TICK_BUDGET_MS): Promise<void> {
    if (!this.fs || !this.getSettings) {
      return;
    }
    await this.enqueue(() => this.runRebuild(maxMsPerTick));
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = this.rebuildChain.then(job);
    this.rebuildChain = run.then(() => undefined, () => undefined);
    return run;
  }

  private async runRebuild(maxMsPerTick: number): Promise<void> {
    if (!this.fs || !this.getSettings) {
      return;
    }
    await this.loadManifest();
    const settings = this.getSettings();
    const files = await this.fs.listMarkdownFiles();
    const listedPaths = new Set<string>();

    let tickStart = Date.now();
    for (const file of files) {
      if (!isIndexablePath(file.path, settings.vaultRetrievalExcludedPaths)) {
        continue;
      }
      listedPaths.add(file.path);
      const known = this.manifest.entries[file.path];
      if (known && known.mtimeMs === file.mtimeMs) {
        // Restart resume: hydrate unchanged notes from their shards instead
        // of re-reading and re-hashing every note.
        if (!this.entries.has(file.path)) {
          await this.hydrateEntry(file.path, known);
        }
        continue;
      }
      await this.indexNote(file.path, file.mtimeMs);
      if (Date.now() - tickStart >= maxMsPerTick) {
        await this.persistManifest();
        await yieldToLoop();
        tickStart = Date.now();
      }
    }

    // Prune notes deleted (or excluded) since the last pass.
    for (const path of [...Object.keys(this.manifest.entries)]) {
      if (!listedPaths.has(path)) {
        await this.removeNote(path);
      }
    }
    await this.persistManifest();
  }

  private async indexNote(path: string, mtimeMs: number): Promise<void> {
    if (!this.fs) {
      return;
    }
    const content = await this.fs.read(path);
    if (content === null) {
      return;
    }
    const built = buildVaultIndexEntry({ path, mtimeMs, content });
    const known = this.manifest.entries[path];
    if (known && known.contentHash === built.contentHash && this.entries.has(path)) {
      // Content unchanged (touch without edit): keep the existing shard but
      // still advance the mtime so later passes stop re-hashing this note.
      if (known.mtimeMs !== mtimeMs) {
        this.manifest = {
          version: 1,
          entries: { ...this.manifest.entries, [path]: { ...known, mtimeMs } },
        };
      }
      return;
    }
    const { entry } = fitShardToBudget(built);
    const shard = shardNameFor(path);
    try {
      await this.fs.writeIndexFile(shardPathFor(path), JSON.stringify(entry));
    } catch (error) {
      logger.debug('failed to write shard', { path, error });
      return;
    }
    this.entries.set(path, entry);
    this.manifest = {
      version: 1,
      entries: { ...this.manifest.entries, [path]: { mtimeMs, contentHash: entry.contentHash, shard } },
    };
  }

  private async hydrateEntry(path: string, row: VaultManifestRow): Promise<void> {
    let raw: string | null = null;
    try {
      raw = await this.fs?.readIndexFile(`${VAULT_INDEX_ROOT}/shards/${row.shard}`) ?? null;
    } catch (error) {
      logger.debug('failed to read shard during hydrate', { path, error });
      return;
    }
    if (!raw) {
      return;
    }
    try {
      const entry = JSON.parse(raw) as VaultIndexEntry;
      if (entry && entry.path === path && entry.contentHash === row.contentHash) {
        this.entries.set(path, entry);
      }
    } catch {
      logger.debug('vault index shard corrupt; will re-index', { path });
    }
  }

  private async removeNote(path: string): Promise<void> {
    const row: VaultManifestRow | undefined = this.manifest.entries[path];
    this.entries.delete(path);
    if (!row) {
      return;
    }
    this.manifest = {
      version: 1,
      entries: Object.fromEntries(
        Object.entries(this.manifest.entries).filter(([key]) => key !== path),
      ),
    };
    try {
      await this.fs?.deleteIndexFile(`${VAULT_INDEX_ROOT}/shards/${row.shard}`);
    } catch (error) {
      logger.debug('failed to delete shard for removed note', { path, error });
    }
  }

  private async loadManifest(): Promise<void> {
    if (Object.keys(this.manifest.entries).length > 0) {
      return;
    }
    let raw: string | null = null;
    try {
      raw = await this.fs?.readIndexFile(VAULT_MANIFEST_PATH) ?? null;
    } catch (error) {
      logger.debug('failed to read vault index manifest', { error });
      return;
    }
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as VaultIndexManifest;
      if (parsed && parsed.version === 1 && typeof parsed.entries === 'object') {
        this.manifest = parsed;
      }
    } catch {
      logger.debug('vault index manifest corrupt; rebuilding');
    }
  }

  private async persistManifest(): Promise<void> {
    const data = JSON.stringify(this.manifest);
    if (data.length > MAX_MANIFEST_BYTES) {
      // Runaway guard: stop growing the index, keep what exists.
      logger.warn('vault index manifest exceeds size cap; refusing to grow');
      return;
    }
    try {
      await this.fs?.writeIndexFile(VAULT_MANIFEST_PATH, data);
    } catch (error) {
      logger.debug('failed to persist vault index manifest', { error });
    }
  }

  private start(): void {
    if (this.unsubscribeChanges || !this.fs) {
      return;
    }
    this.unsubscribeChanges = this.fs.onVaultChanged((path, kind) => {
      this.queueChange(path, kind);
    });
  }

  private stop(): void {
    this.unsubscribeChanges?.();
    this.unsubscribeChanges = null;
    if (this.changeTimer !== null) {
      clearTimeout(this.changeTimer);
      this.changeTimer = null;
    }
    this.pendingChanges.clear();
    this.entries.clear();
  }

  private queueChange(path: string, kind: VaultChangeKind): void {
    if (!this.getSettings?.().vaultRetrievalEnabled) {
      return;
    }
    const settings = this.getSettings();
    if (kind !== 'delete' && isExcludedPath(path, settings.vaultRetrievalExcludedPaths)) {
      return;
    }
    if (!path.toLowerCase().endsWith('.md')) {
      return;
    }
    this.pendingChanges.set(path, kind);
    if (this.changeTimer !== null) {
      clearTimeout(this.changeTimer);
    }
    this.changeTimer = setTimeout(() => {
      this.changeTimer = null;
      void this.enqueue(() => this.flushPendingChanges()).catch((error) => {
        logger.debug('vault index change flush failed', { error });
      });
    }, CHANGE_DEBOUNCE_MS);
  }

  private async flushPendingChanges(): Promise<void> {
    const pending = [...this.pendingChanges.entries()];
    this.pendingChanges.clear();
    if (pending.length === 0 || !this.fs) {
      return;
    }
    const needsListing = pending.some(([, kind]) => kind !== 'delete');
    const listed = needsListing
      ? new Map((await this.fs.listMarkdownFiles()).map((file) => [file.path, file]))
      : new Map<string, VaultFileMeta>();
    for (const [path, kind] of pending) {
      if (kind === 'delete') {
        await this.removeNote(path);
        continue;
      }
      const meta = listed.get(path);
      if (!meta) {
        await this.removeNote(path);
        continue;
      }
      await this.indexNote(path, meta.mtimeMs);
    }
    await this.persistManifest();
  }

  private async requestRebuild(): Promise<void> {
    if (this.disposed) {
      return;
    }
    await this.rebuildMissing().catch((error) => {
      logger.debug('vault index rebuild failed', { error });
    });
  }


  /** Release listeners, timers and caches (plugin unload). */
  dispose(): void {
    this.disposed = true;
    this.stop();
    this.fs = null;
    this.getSettings = null;
  }
}

async function yieldToLoop(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
