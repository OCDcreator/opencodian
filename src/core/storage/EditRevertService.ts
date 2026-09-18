/**
 * EditRevertService — backend-neutral edit revert (R-B3) built on plugin-side
 * content snapshots.
 *
 * docs/requirements/flowtext-parity.md R-B3: single-file and whole-turn revert
 * that never touches backend revert APIs (OpenCode `revertSession` stays an
 * independent, coexisting session-level feature). This service owns the
 * orchestration:
 *
 * - pre-image capture BEFORE writes: budgeted turn-start candidate snapshot,
 *   write-tool-declared snapshot at tool_use time, and a frozen idle-content
 *   fallback (Obsidian modify events are post-hoc, so the vault-event layer is
 *   the authoritative "what changed" record but never the pre-image source);
 * - the authoritative per-turn touched-file record fed by vault
 *   modify/create/delete events (covers shell redirection and any write path
 *   that never declares itself);
 * - round retention orchestration (pure planning lives in
 *   shared.editRevertPlan; disk execution in EditRevertStore);
 * - the revert/restore vault writes are delegated to EditRevertVaultWriteback,
 *   the only destructive-write seam, which never bypasses the vault API.
 *
 * Fail-closed honesty: files without a pre-image (wrote before any capture
 * could run, or oversized) stay listed but are explicitly marked not
 * revertible, and the sidebar derives those labels from buildSidebarModel.
 */

import {
  type App,
  type EventRef,
  normalizePath,
  type TAbstractFile,
} from 'obsidian';

import { createLogger, toVaultRelativePath } from '../../shared';
import {
  buildSidebarModel,
  computeRoundBytes,
  EDIT_REVERT_IDLE_CACHE_MAX_BYTES,
  EDIT_REVERT_IDLE_CACHE_MAX_FILES,
  EDIT_REVERT_MAX_ROUNDS_PER_CONVERSATION,
  EDIT_REVERT_MAX_ROUNDS_TOTAL,
  EDIT_REVERT_MAX_SNAPSHOT_BYTES,
  EDIT_REVERT_POST_TURN_GRACE_MS,
  EDIT_REVERT_SNAPSHOT_BUDGET_MS,
  extractCandidatePathsFromPrompt,
  extractWriteToolTargets,
  isEntryRestorable,
  isEntryRevertible,
  isMarkdownPath,
  planRoundEvictions,
} from '../../shared';
import type {
  EditRevertActionResult,
  EditRevertFileStatus,
  EditRevertRoundMeta,
  EditRevertServicePort,
  EditRevertSidebarModel,
  EditRevertTurnBeginInfo,
  EditRevertWriteToolInfo,
} from '../types';
import { CHECKPOINTS_DIR, EditRevertStore, type StoredImage } from './EditRevertStore';
import { EditRevertVaultWriteback } from './EditRevertVaultWriteback';

const logger = createLogger('EditRevertService');

const PLUGIN_DATA_PREFIX = '.opencodian/';
const PERSIST_DEBOUNCE_MS = 400;

interface StandbyImage {
  hash: string;
  bytes: number;
}

interface IdleImage extends StandbyImage {
  at: number;
}

interface RoundState {
  meta: EditRevertRoundMeta;
  /** Turn-start / tool-declared pre-images awaiting (or backing) an entry. */
  standby: Map<string, StandbyImage>;
  /** Paths known to exceed the per-file snapshot cap before any write. */
  standbyOversize: Set<string>;
  dirty: boolean;
}

function isMarkdownVaultFile(file: TAbstractFile): file is import('obsidian').TFile {
  return (
    !!file
    && typeof file.path === 'string'
    && (file as { extension?: string }).extension === 'md'
    && !Array.isArray((file as { children?: unknown }).children)
  );
}

export class EditRevertService implements EditRevertServicePort {
  private readonly app: App;
  private readonly isEnabled: () => boolean;
  private readonly getSnapshotLimitBytes: () => number;
  private readonly now: () => number;
  private readonly store: EditRevertStore;
  private readonly writeback: EditRevertVaultWriteback;

  private readonly rounds = new Map<string, RoundState>();
  private readonly idleCache = new Map<string, IdleImage>();
  private idleCacheBytes = 0;
  private readonly frozenIdleByRound = new Map<string, Map<string, StandbyImage>>();
  private readonly changeListeners = new Set<() => void>();
  private eventRefs: EventRef[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  /** Monotonic per-instance sequence guarding round-id uniqueness (retention makes `rounds.size` non-monotonic). */
  private roundSeq = 0;

  constructor(host: EditRevertServiceHost) {
    this.app = host.app;
    this.isEnabled = host.isEnabled;
    this.getSnapshotLimitBytes = host.getSnapshotLimitBytes;
    this.now = host.now ?? (() => Date.now());
    this.store = new EditRevertStore(this.app);
    this.writeback = new EditRevertVaultWriteback(this.app, this.store, this.now);
  }

  get checkpointsDir(): string {
    return CHECKPOINTS_DIR;
  }

  /** Register vault listeners and load persisted rounds. Fail-soft. */
  async initialize(): Promise<void> {
    try {
      await this.store.prepare();
      const metas = await this.store.loadRoundMetas(this.now());
      for (const meta of metas) {
        this.rounds.set(meta.id, {
          meta,
          standby: new Map(),
          standbyOversize: new Set(),
          dirty: false,
        });
      }
      this.registerVaultListeners();
      this.enqueue(() => this.enforceRetention()).catch(() => undefined);
    } catch (error) {
      logger.warn('Edit revert initialization failed; feature stays disabled', { error });
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    for (const ref of this.eventRefs) {
      try {
        this.app.vault.offref(ref);
      } catch {
        // Best-effort listener cleanup.
      }
    }
    this.eventRefs = [];
    void this.flush().catch(() => undefined);
  }

  // --- EditRevertServicePort ------------------------------------------------

  getSidebarModel(conversationId: string): EditRevertSidebarModel {
    if (!this.isEnabled()) {
      return buildSidebarModel(null, false, this.now());
    }
    const round = this.getLatestRound(conversationId);
    return buildSidebarModel(round?.meta ?? null, true, this.now());
  }

  beginTurnCapture(info: EditRevertTurnBeginInfo): void {
    if (this.disposed || !this.isEnabled() || !info.conversationId) {
      return;
    }
    this.enqueue(() => this.performBeginTurnCapture(info)).catch((error) => {
      logger.warn('beginTurnCapture failed', { error, conversationId: info.conversationId });
    });
  }

  endTurnCapture(conversationId: string): void {
    if (this.disposed || !conversationId) {
      return;
    }
    this.enqueue(() => this.performEndTurnCapture(conversationId)).catch((error) => {
      logger.warn('endTurnCapture failed', { error, conversationId });
    });
  }

  noteWriteToolUse(info: EditRevertWriteToolInfo): void {
    if (this.disposed || !this.isEnabled() || !info.conversationId) {
      return;
    }
    this.enqueue(() => this.performNoteWriteToolUse(info)).catch((error) => {
      logger.warn('noteWriteToolUse failed', { error, conversationId: info.conversationId });
    });
  }

  // --- R-B5: plugin-initiated batch capture ---------------------------------

  async beginBatchCapture(conversationId: string, paths: readonly string[]): Promise<boolean> {
    if (this.disposed || !this.isEnabled() || !conversationId) {
      return false;
    }
    try {
      await this.enqueue(() => this.performBeginBatchCapture(conversationId, paths));
      return true;
    } catch (error) {
      // A failed forced snapshot must never let the batch proceed.
      logger.warn('beginBatchCapture failed; refusing batch execution', { error, conversationId });
      return false;
    }
  }

  async notePluginMove(conversationId: string, fromPath: string, toPath: string): Promise<void> {
    if (this.disposed || !conversationId) {
      return;
    }
    await this.enqueue(() => this.performNotePluginMove(conversationId, fromPath, toPath)).catch((error) => {
      logger.warn('notePluginMove failed', { error, conversationId, fromPath, toPath });
    });
  }

  async notePluginWrite(conversationId: string, path: string): Promise<void> {
    if (this.disposed || !conversationId) {
      return;
    }
    await this.enqueue(() => this.performNotePluginWrite(conversationId, path)).catch((error) => {
      logger.warn('notePluginWrite failed', { error, conversationId, path });
    });
  }

  async endBatchCapture(conversationId: string): Promise<void> {
    if (this.disposed || !conversationId) {
      return;
    }
    await this.enqueue(() => this.performEndBatchCapture(conversationId)).catch((error) => {
      logger.warn('endBatchCapture failed', { error, conversationId });
    });
  }

  revertFile(conversationId: string, path: string): Promise<EditRevertActionResult> {
    return this.enqueue(() => this.performRevertFile(conversationId, path));
  }

  revertAll(conversationId: string): Promise<EditRevertActionResult> {
    return this.enqueue(() => this.performRevertAll(conversationId));
  }

  restoreFile(conversationId: string, path: string): Promise<EditRevertActionResult> {
    return this.enqueue(() => this.performRestoreFile(conversationId, path));
  }

  onEntriesChanged(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  // --- vault event funnel (also the test seam) ------------------------------

  handleVaultModify(rawPath: string): void {
    this.enqueue(() => this.performVaultWriteEvent(rawPath, 'modified')).catch((error) => {
      logger.warn('handleVaultModify failed', { error, path: rawPath });
    });
  }

  handleVaultCreate(rawPath: string): void {
    this.enqueue(() => this.performVaultWriteEvent(rawPath, 'created')).catch((error) => {
      logger.warn('handleVaultCreate failed', { error, path: rawPath });
    });
  }

  handleVaultDelete(rawPath: string): void {
    this.enqueue(() => this.performVaultWriteEvent(rawPath, 'deleted')).catch((error) => {
      logger.warn('handleVaultDelete failed', { error, path: rawPath });
    });
  }

  /** Await all queued work and flush pending persistence (test/lifecycle hook). */
  async flush(): Promise<void> {
    await this.queue;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      await this.persistDirtyRounds();
    }
  }

  /** Test hook: direct read access to a round's meta. */
  getRoundMeta(roundId: string): EditRevertRoundMeta | null {
    return this.rounds.get(roundId)?.meta ?? null;
  }

  /** Test hook: list persisted blob hashes. */
  listBlobHashes(): Promise<string[]> {
    return this.store.listBlobHashes();
  }

  // --- internals ------------------------------------------------------------

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private normalizeVaultPath(rawPath: string): string | null {
    if (!rawPath || typeof rawPath !== 'string') {
      return null;
    }
    const basePath = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? null;
    const relative = toVaultRelativePath(rawPath, basePath);
    if (!relative) {
      return null;
    }
    const normalized = normalizePath(relative).replace(/^\.\//, '');
    if (!normalized || normalized.startsWith('..') || normalized.startsWith(PLUGIN_DATA_PREFIX)) {
      return null;
    }
    return normalized;
  }

  private registerVaultListeners(): void {
    const vault = this.app.vault;
    this.eventRefs.push(
      vault.on('modify', (file) => {
        if (isMarkdownVaultFile(file)) {
          this.handleVaultModify(file.path);
        }
      }),
    );
    this.eventRefs.push(
      vault.on('create', (file) => {
        if (isMarkdownVaultFile(file)) {
          this.handleVaultCreate(file.path);
        }
      }),
    );
    this.eventRefs.push(
      vault.on('delete', (file) => {
        if (isMarkdownVaultFile(file)) {
          this.handleVaultDelete(file.path);
        }
      }),
    );
  }

  private notifyChanged(): void {
    for (const listener of [...this.changeListeners]) {
      try {
        listener();
      } catch (error) {
        logger.warn('edit revert change listener failed', { error });
      }
    }
  }

  private getLatestRound(conversationId: string): RoundState | null {
    let latest: RoundState | null = null;
    for (const round of this.rounds.values()) {
      if (round.meta.conversationId !== conversationId) {
        continue;
      }
      if (!latest || round.meta.createdAt > latest.meta.createdAt) {
        latest = round;
      }
    }
    return latest;
  }

  private findTargetRound(): RoundState | null {
    const now = this.now();
    let target: RoundState | null = null;
    for (const round of this.rounds.values()) {
      if (round.meta.acceptsWritesUntil <= now) {
        continue;
      }
      if (
        !target
        || round.meta.lastActivityAtHint > target.meta.lastActivityAtHint
        || (round.meta.lastActivityAtHint === target.meta.lastActivityAtHint
          && round.meta.createdAt > target.meta.createdAt)
      ) {
        target = round;
      }
    }
    return target;
  }

  private async readVaultFileSize(path: string): Promise<number | null> {
    try {
      const stat = await this.app.vault.adapter.stat(normalizePath(path));
      return stat?.size ?? null;
    } catch {
      return null;
    }
  }

  private async readVaultFile(path: string): Promise<string | null> {
    try {
      return await this.app.vault.adapter.read(normalizePath(path));
    } catch {
      return null;
    }
  }

  /** Capture the current content of `path` into the content-addressed store. */
  private async captureContent(path: string): Promise<StoredImage | 'missing' | 'oversize'> {
    const size = await this.readVaultFileSize(path);
    if (size === null) {
      return 'missing';
    }
    if (size > EDIT_REVERT_MAX_SNAPSHOT_BYTES) {
      return 'oversize';
    }
    const content = await this.readVaultFile(path);
    if (content === null) {
      return 'missing';
    }
    return this.store.storeBlob(content);
  }

  private async performBeginTurnCapture(info: EditRevertTurnBeginInfo): Promise<void> {
    const now = this.now();
    // A new turn closes the previous round for this conversation immediately.
    const previous = this.getLatestRound(info.conversationId);
    if (previous && previous.meta.closedAt === null) {
      previous.meta.closedAt = now;
      previous.meta.acceptsWritesUntil = now;
      previous.dirty = true;
    }

    const round: RoundState = {
      meta: {
        id: `round-${now}-${++this.roundSeq}`,
        conversationId: info.conversationId,
        backend: info.backend,
        ...(info.sessionId ? { sessionId: info.sessionId } : {}),
        createdAt: now,
        closedAt: null,
        degraded: false,
        acceptsWritesUntil: Number.MAX_SAFE_INTEGER,
        lastActivityAtHint: now,
        entries: [],
      },
      standby: new Map(),
      standbyOversize: new Set(),
      dirty: true,
    };
    this.rounds.set(round.meta.id, round);
    this.frozenIdleByRound.set(round.meta.id, new Map(this.idleCache));

    // Budgeted turn-start candidate pre-snapshot (degrades to tool-declared only).
    const candidates = new Set<string>();
    for (const contextPath of info.contextPaths ?? []) {
      const normalized = this.normalizeVaultPath(contextPath);
      if (normalized && isMarkdownPath(normalized)) {
        candidates.add(normalized);
      }
    }
    for (const promptPath of extractCandidatePathsFromPrompt(info.userText)) {
      const normalized = this.normalizeVaultPath(promptPath);
      if (normalized && isMarkdownPath(normalized)) {
        candidates.add(normalized);
      }
    }
    const previousEntries = previous?.meta.entries ?? [];
    for (const entry of previousEntries.slice(0, 20)) {
      if (isMarkdownPath(entry.path)) {
        candidates.add(entry.path);
      }
    }

    const deadline = now + EDIT_REVERT_SNAPSHOT_BUDGET_MS;
    for (const candidate of candidates) {
      if (this.now() > deadline) {
        round.meta.degraded = true;
        break;
      }
      if (round.standby.has(candidate) || round.standbyOversize.has(candidate)) {
        continue;
      }
      const captured = await this.captureContent(candidate);
      if (captured === 'oversize') {
        round.standbyOversize.add(candidate);
      } else if (captured !== 'missing') {
        round.standby.set(candidate, captured);
      }
    }

    this.schedulePersist();
    this.notifyChanged();
  }

  private async performEndTurnCapture(conversationId: string): Promise<void> {
    const round = this.getLatestRound(conversationId);
    if (!round || round.meta.closedAt !== null) {
      return;
    }
    const now = this.now();
    round.meta.closedAt = now;
    round.meta.acceptsWritesUntil = now + EDIT_REVERT_POST_TURN_GRACE_MS;
    round.dirty = true;
    this.schedulePersist();
    this.enqueue(() => this.enforceRetention()).catch(() => undefined);
    this.notifyChanged();
  }

  private async performNoteWriteToolUse(info: EditRevertWriteToolInfo): Promise<void> {
    const round = this.getLatestRound(info.conversationId);
    if (!round || round.meta.closedAt !== null) {
      return;
    }
    round.meta.lastActivityAtHint = this.now();
    const targets = extractWriteToolTargets(info.toolName, info.input);
    for (const target of targets) {
      const normalized = this.normalizeVaultPath(target);
      if (!normalized || !isMarkdownPath(normalized)) {
        continue;
      }
      if (round.standby.has(normalized) || round.standbyOversize.has(normalized)) {
        continue;
      }
      const captured = await this.captureContent(normalized);
      if (captured === 'oversize') {
        round.standbyOversize.add(normalized);
      } else if (captured !== 'missing') {
        round.standby.set(normalized, captured);
      }
    }
  }

  /**
   * Open a plugin-initiated batch round (R-B5) and force-capture pre-images
   * for every listed path. Unlike the turn-start path there is no wall-clock
   * budget: the batch is user-initiated, the file list is known upfront from
   * the confirmed preview, and anything over the per-file cap lands in
   * `standbyOversize` so it stays honestly marked not revertible.
   */
  private async performBeginBatchCapture(conversationId: string, paths: readonly string[]): Promise<void> {
    const now = this.now();
    const previous = this.getLatestRound(conversationId);
    if (previous && previous.meta.closedAt === null) {
      previous.meta.closedAt = now;
      previous.meta.acceptsWritesUntil = now;
      previous.dirty = true;
    }
    const round: RoundState = {
      meta: {
        id: `round-${now}-${++this.roundSeq}`,
        conversationId,
        backend: 'plugin',
        createdAt: now,
        closedAt: null,
        degraded: false,
        acceptsWritesUntil: Number.MAX_SAFE_INTEGER,
        lastActivityAtHint: now,
        entries: [],
      },
      standby: new Map(),
      standbyOversize: new Set(),
      dirty: true,
    };
    this.rounds.set(round.meta.id, round);
    this.frozenIdleByRound.set(round.meta.id, new Map(this.idleCache));

    for (const rawPath of paths) {
      const normalized = this.normalizeVaultPath(rawPath);
      if (!normalized || !isMarkdownPath(normalized)) {
        continue;
      }
      if (round.standby.has(normalized) || round.standbyOversize.has(normalized)) {
        continue;
      }
      const captured = await this.captureContent(normalized);
      if (captured === 'oversize') {
        round.standbyOversize.add(normalized);
      } else if (captured !== 'missing') {
        round.standby.set(normalized, captured);
      }
    }

    this.schedulePersist();
    this.notifyChanged();
  }

  /**
   * Record a plugin-performed move/rename (R-B5). Vault `rename` events are
   * not observed by the event funnel, so moves must be recorded explicitly;
   * the entry reverts by renaming `movedTo` back (references included).
   */
  private async performNotePluginMove(conversationId: string, fromPath: string, toPath: string): Promise<void> {
    const round = this.getLatestRound(conversationId);
    if (!round || round.meta.closedAt !== null) {
      return;
    }
    const from = this.normalizeVaultPath(fromPath);
    const to = this.normalizeVaultPath(toPath);
    if (!from || !to || from === to || !isMarkdownPath(from) || !isMarkdownPath(to)) {
      return;
    }
    const now = this.now();
    round.meta.lastActivityAtHint = now;
    let entry = round.meta.entries.find((item) => item.path === from);
    if (!entry) {
      entry = {
        path: from,
        status: 'moved',
        state: 'active',
        preImageStatus: 'unavailable',
        sizeBytes: 0,
        firstWriteAt: now,
        lastWriteAt: now,
        source: 'plugin',
      };
      round.meta.entries.push(entry);
    } else {
      entry.status = 'moved';
      entry.lastWriteAt = now;
      if (entry.state === 'reverted') {
        entry.state = 'active';
      }
    }
    entry.movedTo = to;
    round.dirty = true;
    this.schedulePersist();
    this.notifyChanged();
  }

  /**
   * Record a plugin-performed content write (R-B5) so the batch round stays
   * the authoritative record even when a concurrent chat turn's round would
   * otherwise win vault-event attribution. Pre-images resolve from the forced
   * batch capture; a path with no captured pre-image stays listed but marked
   * not revertible.
   */
  private async performNotePluginWrite(conversationId: string, path: string): Promise<void> {
    const round = this.getLatestRound(conversationId);
    if (!round || round.meta.closedAt !== null) {
      return;
    }
    const normalized = this.normalizeVaultPath(path);
    if (!normalized || !isMarkdownPath(normalized)) {
      return;
    }
    const now = this.now();
    round.meta.lastActivityAtHint = now;
    let entry = round.meta.entries.find((item) => item.path === normalized);
    if (!entry) {
      entry = {
        path: normalized,
        status: 'modified',
        state: 'active',
        preImageStatus: 'unavailable',
        sizeBytes: 0,
        firstWriteAt: now,
        lastWriteAt: now,
        source: 'plugin',
      };
      round.meta.entries.push(entry);
    } else {
      entry.lastWriteAt = now;
      if (entry.state === 'reverted') {
        entry.state = 'active';
      }
    }
    const size = await this.readVaultFileSize(normalized);
    if (size !== null) {
      entry.sizeBytes = size;
    }
    if (entry.state !== 'reverted') {
      const preImage = this.resolvePreImage(round, normalized);
      if (preImage.status === 'available') {
        entry.preImageStatus = 'available';
        entry.preImageHash = preImage.image.hash;
        entry.preImageBytes = preImage.image.bytes;
      } else if (preImage.status === 'oversize') {
        entry.preImageStatus = 'oversize';
      } else {
        entry.preImageStatus = 'unavailable';
      }
    }
    round.dirty = true;
    this.schedulePersist();
    this.notifyChanged();
  }

  /**
   * Close a batch round. No post-close grace: every batch write is recorded
   * explicitly before `endBatchCapture`, so one-click revert is available
   * immediately after the task completes (R-B5 acceptance 1).
   */
  private async performEndBatchCapture(conversationId: string): Promise<void> {
    const round = this.getLatestRound(conversationId);
    if (!round || round.meta.closedAt !== null) {
      return;
    }
    const now = this.now();
    round.meta.closedAt = now;
    round.meta.acceptsWritesUntil = now;
    round.dirty = true;
    this.schedulePersist();
    this.enqueue(() => this.enforceRetention()).catch(() => undefined);
    this.notifyChanged();
  }

  private resolvePreImage(
    round: RoundState,
    path: string,
  ): { status: 'available'; image: StandbyImage } | { status: 'oversize' } | { status: 'unavailable' } {    const standby = round.standby.get(path);
    if (standby) {
      return { status: 'available', image: standby };
    }
    if (round.standbyOversize.has(path)) {
      return { status: 'oversize' };
    }
    const frozen = this.frozenIdleByRound.get(round.meta.id)?.get(path);
    if (frozen) {
      return { status: 'available', image: frozen };
    }
    return { status: 'unavailable' };
  }

  private async performVaultWriteEvent(rawPath: string, kind: EditRevertFileStatus): Promise<void> {
    if (this.disposed || !this.isEnabled()) {
      return;
    }
    const path = this.normalizeVaultPath(rawPath);
    if (!path || !isMarkdownPath(path)) {
      return;
    }

    // Writes performed by our own revert/restore must not be re-recorded.
    if (this.writeback.consumeSelfWrite(path, this.now())) {
      return;
    }

    const now = this.now();
    const round = this.findTargetRound();
    if (!round) {
      if (kind === 'modified') {
        await this.feedIdleCache(path, now);
      }
      return;
    }

    round.meta.lastActivityAtHint = now;
    let entry = round.meta.entries.find((item) => item.path === path);
    if (!entry) {
      entry = {
        path,
        status: kind,
        state: 'active',
        preImageStatus: 'unavailable',
        sizeBytes: 0,
        firstWriteAt: now,
        lastWriteAt: now,
        source: 'vault-event',
      };
      round.meta.entries.push(entry);
    } else {
      // 'created' is sticky: an agent that writes a turn-created file again
      // must not demote it to 'modified' — it has no pre-turn pre-image, so
      // reverting it means trash, not a content restore. Only 'deleted'
      // overrides 'created' (created-then-deleted stays honestly listed but
      // is not revertible).
      entry.status = kind === 'created' || (entry.status === 'created' && kind !== 'deleted')
        ? entry.status
        : kind;
      entry.lastWriteAt = now;
      // The agent re-wrote a file the user already reverted: the entry
      // returns to active with the SAME pre-turn pre-image, keeping the
      // "revert to before this turn" semantics intact.
      if (entry.state === 'reverted') {
        entry.state = 'active';
      }
    }

    const size = await this.readVaultFileSize(path);
    if (size !== null) {
      entry.sizeBytes = size;
    }

    if (entry.state !== 'reverted') {
      const preImage = this.resolvePreImage(round, path);
      if (preImage.status === 'available') {
        entry.preImageStatus = 'available';
        entry.preImageHash = preImage.image.hash;
        entry.preImageBytes = preImage.image.bytes;
      } else if (preImage.status === 'oversize') {
        entry.preImageStatus = 'oversize';
      } else {
        entry.preImageStatus = 'unavailable';
      }
    }

    if (kind === 'created' && !entry.createdHash) {
      const content = await this.readVaultFile(path);
      if (content !== null) {
        entry.createdHash = (await this.store.storeBlob(content)).hash;
      }
    }

    round.dirty = true;
    this.schedulePersist();
    this.notifyChanged();
  }

  private async feedIdleCache(path: string, now: number): Promise<void> {
    const captured = await this.captureContent(path);
    if (captured === 'missing' || captured === 'oversize') {
      return;
    }
    const existing = this.idleCache.get(path);
    if (existing) {
      this.idleCacheBytes -= existing.bytes;
    }
    this.idleCache.set(path, { ...captured, at: now });
    this.idleCacheBytes += captured.bytes;
    while (
      this.idleCache.size > EDIT_REVERT_IDLE_CACHE_MAX_FILES
      || this.idleCacheBytes > EDIT_REVERT_IDLE_CACHE_MAX_BYTES
    ) {
      const oldestKey = this.idleCache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      const oldest = this.idleCache.get(oldestKey);
      this.idleCacheBytes -= oldest?.bytes ?? 0;
      this.idleCache.delete(oldestKey);
    }
  }

  private async performRevertFile(
    conversationId: string,
    path: string,
  ): Promise<EditRevertActionResult> {
    const round = this.getLatestRound(conversationId);
    if (!this.isEnabled()) {
      return { ok: false, changed: 0, skipped: [path], error: 'edit-revert-disabled' };
    }
    if (!round) {
      return { ok: false, changed: 0, skipped: [path], error: 'no-round' };
    }
    if (round.meta.acceptsWritesUntil > this.now()) {
      return { ok: false, changed: 0, skipped: [path], error: 'round-open' };
    }
    const entry = round.meta.entries.find((item) => item.path === path);
    if (!entry) {
      return { ok: false, changed: 0, skipped: [path], error: 'no-entry' };
    }
    if (!isEntryRevertible(entry)) {
      return { ok: false, changed: 0, skipped: [path], error: `not-revertible:${entry.preImageStatus}` };
    }
    const result = await this.writeback.applyRevert(entry);
    round.dirty = true;
    this.schedulePersist();
    this.notifyChanged();
    return result;
  }

  private async performRevertAll(conversationId: string): Promise<EditRevertActionResult> {
    const round = this.getLatestRound(conversationId);
    if (!this.isEnabled()) {
      return { ok: false, changed: 0, skipped: [], error: 'edit-revert-disabled' };
    }
    if (!round) {
      return { ok: false, changed: 0, skipped: [], error: 'no-round' };
    }
    if (round.meta.acceptsWritesUntil > this.now()) {
      return { ok: false, changed: 0, skipped: [], error: 'round-open' };
    }
    const targets = round.meta.entries.filter((entry) => isEntryRevertible(entry));
    const skipped = round.meta.entries
      .filter((entry) => !isEntryRevertible(entry))
      .map((entry) => entry.path);
    let changed = 0;
    const failures: string[] = [];
    for (const entry of targets) {
      const result = await this.writeback.applyRevert(entry);
      if (result.ok) {
        changed += result.changed;
      } else {
        failures.push(entry.path);
      }
    }
    round.dirty = true;
    this.schedulePersist();
    this.notifyChanged();
    return {
      ok: failures.length === 0,
      changed,
      skipped: [...skipped, ...failures],
      ...(failures.length > 0 ? { error: 'partial-failure' } : {}),
    };
  }

  private async performRestoreFile(
    conversationId: string,
    path: string,
  ): Promise<EditRevertActionResult> {
    const round = this.getLatestRound(conversationId);
    if (!this.isEnabled()) {
      return { ok: false, changed: 0, skipped: [path], error: 'edit-revert-disabled' };
    }
    if (!round) {
      return { ok: false, changed: 0, skipped: [path], error: 'no-round' };
    }
    const entry = round.meta.entries.find((item) => item.path === path);
    if (!entry) {
      return { ok: false, changed: 0, skipped: [path], error: 'no-entry' };
    }
    if (!isEntryRestorable(entry)) {
      return { ok: false, changed: 0, skipped: [path], error: 'not-restorable' };
    }
    const result = await this.writeback.applyRestore(entry);
    round.dirty = true;
    this.schedulePersist();
    this.notifyChanged();
    return result;
  }

  // --- persistence & retention ----------------------------------------------

  private schedulePersist(): void {
    if (this.persistTimer || this.disposed) {
      return;
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.enqueue(async () => {
        await this.persistDirtyRounds();
        await this.enforceRetention();
      }).catch(() => undefined);
    }, PERSIST_DEBOUNCE_MS);
  }

  private async persistDirtyRounds(): Promise<void> {
    for (const round of this.rounds.values()) {
      if (!round.dirty) {
        continue;
      }
      try {
        await this.store.saveRound(round.meta);
        round.dirty = false;
      } catch (error) {
        logger.warn('failed to persist edit revert round', {
          error,
          roundId: round.meta.id,
        });
      }
    }
  }

  private collectReferencedBlobs(): Set<string> {
    const referenced = new Set<string>();
    const bump = (hash: string | undefined): void => {
      if (hash) {
        referenced.add(hash);
      }
    };
    for (const round of this.rounds.values()) {
      for (const entry of round.meta.entries) {
        bump(entry.preImageHash);
        bump(entry.createdHash);
        bump(entry.restoreHash);
      }
      for (const image of round.standby.values()) {
        bump(image.hash);
      }
      const frozen = this.frozenIdleByRound.get(round.meta.id);
      if (frozen) {
        for (const image of frozen.values()) {
          bump(image.hash);
        }
      }
    }
    return referenced;
  }

  private async enforceRetention(): Promise<void> {
    if (this.disposed) {
      return;
    }
    try {
      // Refresh blob byte cache for hashes referenced by rounds.
      for (const round of this.rounds.values()) {
        for (const entry of round.meta.entries) {
          for (const hash of [entry.preImageHash, entry.createdHash, entry.restoreHash]) {
            if (hash) {
              await this.store.statBlob(hash, entry.preImageBytes ?? entry.restoreBytes ?? 0);
            }
          }
        }
      }

      const summaries = [...this.rounds.values()].map((round) => ({
        id: round.meta.id,
        conversationId: round.meta.conversationId,
        createdAt: round.meta.createdAt,
        bytes: computeRoundBytes(round.meta, (hash) => this.store.getBlobBytes(hash)),
      }));
      const evictIds = planRoundEvictions(summaries, {
        maxTotal: EDIT_REVERT_MAX_ROUNDS_TOTAL,
        maxPerConversation: EDIT_REVERT_MAX_ROUNDS_PER_CONVERSATION,
        maxBytes: Math.max(this.getSnapshotLimitBytes(), EDIT_REVERT_MAX_SNAPSHOT_BYTES),
      });

      for (const id of evictIds) {
        const round = this.rounds.get(id);
        if (!round) {
          continue;
        }
        try {
          await this.store.removeRound(round.meta);
        } catch {
          // Best-effort cleanup; blobs are re-evaluated below regardless.
        }
        this.rounds.delete(id);
        this.frozenIdleByRound.delete(id);
      }
      if (evictIds.length > 0) {
        this.enqueue(() => this.persistDirtyRounds()).catch(() => undefined);
      }

      // Drop blobs no longer referenced by any round (standby/frozen included).
      const referenced = this.collectReferencedBlobs();
      const onDisk = await this.store.listBlobHashes();
      for (const hash of onDisk) {
        if (referenced.has(hash)) {
          continue;
        }
        try {
          await this.store.removeBlob(hash);
        } catch {
          // Best-effort; an orphaned blob is inert (content-addressed, unreferenced).
        }
      }
      if (evictIds.length > 0) {
        this.notifyChanged();
      }
    } catch (error) {
      logger.warn('edit revert retention enforcement failed', { error });
    }
  }
}

export interface EditRevertServiceHost {
  app: App;
  isEnabled(): boolean;
  /** Active retention cap in bytes (from `editRevertSnapshotLimitMb`). */
  getSnapshotLimitBytes(): number;
  /** Injectable clock for tests. */
  now?(): number;
}
