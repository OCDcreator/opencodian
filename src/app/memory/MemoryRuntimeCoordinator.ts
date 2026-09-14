/**
 * `MemoryRuntimeCoordinator` — the composition-layer owner of the memory
 * runtime (`app.memory-runtime`). Mirrors the `DiagnosticsRuntimeCoordinator`
 * pattern: `main.ts` never touches memory services directly; this class
 * binds the backend-neutral `core.memory` core to concrete infrastructure
 * (Obsidian vault adapter filesystem, `OpenCodeService` throwaway-session
 * model invoker) and exposes the narrow `MemoryRuntimePort` plus the
 * maintenance command surface.
 *
 * Everything here is fail-soft by contract: a memory failure must never
 * surface in or block a user turn.
 */

import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';

import { App, Modal, normalizePath, Notice, Setting } from 'obsidian';

import {
  compactionMarkerCount,
  externalMemoryProjectDir,
  MemoryBackendService,
  type MemoryFileSystem,
  type MemoryLintReport,
  type MemoryModelInvoker,
  type MemoryRuntimePort,
  type MemorySettingsSnapshot,
  type MemoryStatusReport,
  type MemoryTranscriptMessage,
} from '../../core/memory';
import type { OpenCodeService } from '../../core/opencode/OpenCodeService';
import { t } from '../../i18n';
import { expandHomeDir, ExternalMemoryFileSystem } from './ExternalMemoryFileSystem';
import { MemoryGitSyncService } from './MemoryGitSyncService';

/** Debounce between turn settle and background distillation (ms). */
const TURN_SETTLE_DELAY_MS = 1_500;

/**
 * `MemoryFileSystem` over the Obsidian vault adapter, rooted at the vault
 * base. All writes go through `normalizePath` (repo storage convention).
 * `mtimeMs` resolves through node fs when available (hidden dotfolders are
 * not indexed by Obsidian) and degrades to null.
 */
export class VaultMemoryFileSystem implements MemoryFileSystem {
  constructor(private readonly app: App) {}

  private adapter(): {
    exists(path: string): Promise<boolean>;
    read(path: string): Promise<string>;
    write(path: string, data: string): Promise<void>;
    mkdir(path: string): Promise<void>;
    list(path: string): Promise<{ files: string[]; folders: string[] }>;
    remove(path: string): Promise<void>;
  } {
    return this.app.vault.adapter as never;
  }

  private async ensureParent(relativePath: string): Promise<void> {
    const parts = normalizePath(relativePath).split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!(await this.adapter().exists(dir))) {
        await this.adapter().mkdir(dir).catch(() => undefined);
      }
    }
  }

  async readFile(relativePath: string): Promise<string | null> {
    try {
      if (!(await this.adapter().exists(normalizePath(relativePath)))) return null;
      return await this.adapter().read(normalizePath(relativePath));
    } catch {
      return null;
    }
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const normalized = normalizePath(relativePath);
    await this.ensureParent(normalized);
    await this.adapter().write(normalized, content);
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      return await this.adapter().exists(normalizePath(relativePath));
    } catch {
      return false;
    }
  }

  async listFiles(relativePath: string): Promise<string[]> {
    // Obsidian's DataAdapter.list() returns full vault-relative path strings
    // (ListedFiles), not TFile objects.
    const listing = await this.adapter().list(normalizePath(relativePath));
    return listing.files.map((f) => nodePath.basename(f));
  }

  async mkdir(relativePath: string): Promise<void> {
    await this.ensureParent(relativePath);
  }

  async remove(relativePath: string): Promise<void> {
    await this.adapter().remove(normalizePath(relativePath));
  }

  async mtimeMs(relativePath: string): Promise<number | null> {
    try {
      const absolute = this.nativeAbsolutePath(relativePath);
      const stat = await nodeFs.promises.stat(absolute);
      return stat.mtimeMs;
    } catch {
      return null;
    }
  }

  nativeAbsolutePath(relativePath: string): string {
    const base = (this.app.vault.adapter as { basePath?: string }).basePath ?? '';
    return nodePath.join(base, normalizePath(relativePath));
  }
}

/** Parse `provider/model` into its parts (empty strings when absent). */
function splitModelRef(modelRef: string): { provider: string; model: string } {
  const trimmed = modelRef.trim();
  if (!trimmed) return { provider: '', model: '' };
  const slash = trimmed.indexOf('/');
  if (slash <= 0) return { provider: '', model: trimmed };
  return {
    provider: trimmed.slice(0, slash),
    model: trimmed.slice(slash + 1),
  };
}

export interface MemoryRuntimeCoordinatorOptions {
  readonly app: App;
  readonly openCodeService: OpenCodeService;
  readonly getSettings: () => MemorySettingsSnapshot;
  readonly getConversationMessages: (
    conversationId: string,
  ) => Promise<ReadonlyArray<MemoryTranscriptMessage> | null>;
  /** Test hook: override the turn-settle debounce (default 1500ms). */
  readonly turnSettleDelayMs?: number;
}

export class MemoryRuntimeCoordinator implements MemoryRuntimePort {
  private readonly fs: VaultMemoryFileSystem;
  private readonly vaultBasePath: string;
  private service: MemoryBackendService | null = null;
  /** Root identity the current service was built for ('' = vault-local). */
  private serviceRootKey = '__unset__';
  private sync: MemoryGitSyncService | null = null;
  /** Identity the sync service was built for (root + remote url). */
  private syncKey = '__unset__';
  private readonly invoker: MemoryModelInvoker;

  /** Per-conversation transcript watermark already distilled. */
  private readonly extractionWatermarks = new Map<string, number>();
  /** Compaction-marker count when the epoch's injection was planned. */
  private readonly injectedEpochs = new Map<string, number>();
  /** Compaction-marker count at the last settle observation. */
  private readonly compactionCounts = new Map<string, number>();
  private extractionInFlight = false;
  private reflectionInFlight = false;
  private disposed = false;

  private readonly turnSettleDelayMs: number;

  constructor(private readonly options: MemoryRuntimeCoordinatorOptions) {
    this.turnSettleDelayMs = options.turnSettleDelayMs ?? TURN_SETTLE_DELAY_MS;
    this.fs = new VaultMemoryFileSystem(options.app);
    this.vaultBasePath = (options.app.vault.adapter as { basePath?: string }).basePath ?? '.';
    this.invoker = {
      invoke: (input) => this.invokeModel(input),
    };
    // Plugin load with a pre-configured sync remote starts syncing without
    // waiting for the first memory operation.
    this.ensureSyncService((this.settings().memoryExternalRoot ?? '').trim());
  }

  /**
   * Build (or rebuild) the store service for the currently configured root.
   * Empty root = vault-local `.opencodian/memory`; non-empty = the shared
   * external tree (`<root>/projects/<bucket>/memory`, zmem / ZCode layout)
   * with the metrics journal kept in the vault either way. Switching roots
   * resets per-conversation epoch state — the injected protocol text names a
   * different store, so every conversation deserves one fresh epoch.
   */
  private ensureService(): MemoryBackendService {
    const root = (this.settings().memoryExternalRoot ?? '').trim();
    const rootKey = root.toLowerCase();
    if (this.service && this.serviceRootKey === rootKey) return this.service;
    if (root) {
      const expandedRoot = expandHomeDir(root);
      const externalFs = new ExternalMemoryFileSystem(expandedRoot);
      this.service = new MemoryBackendService(externalFs, this.vaultBasePath, {
        projectDir: externalMemoryProjectDir(expandedRoot, this.vaultBasePath),
        metricsFs: this.fs,
      });
    } else {
      this.service = new MemoryBackendService(this.fs, this.vaultBasePath);
    }
    this.serviceRootKey = rootKey;
    this.extractionWatermarks.clear();
    this.injectedEpochs.clear();
    this.compactionCounts.clear();
    this.ensureSyncService(root);
    return this.service;
  }

  /**
   * Rebuild the git sync service when the (root, remoteUrl) wiring changes.
   * The service no-ops internally when either value is empty, so it can be
   * constructed eagerly whenever an external root is configured.
   */
  private ensureSyncService(rawRoot: string): void {
    const remoteUrl = (this.settings().memorySyncRemoteUrl ?? '').trim();
    const key = `${rawRoot.toLowerCase()};;${remoteUrl.toLowerCase()}`;
    if (this.syncKey === key) return;
    this.sync?.dispose();
    if (rawRoot && remoteUrl) {
      const expandedRoot = expandHomeDir(rawRoot);
      this.sync = new MemoryGitSyncService(
        () => expandedRoot,
        () => (this.settings().memorySyncRemoteUrl ?? ''),
      );
      this.sync.start();
    } else {
      this.sync = null;
    }
    this.syncKey = key;
  }

  // -------------------------------------------------------------------------
  // MemoryRuntimePort
  // -------------------------------------------------------------------------

  async planInjection(input: {
    conversationId: string;
    messages: ReadonlyArray<MemoryTranscriptMessage>;
    latestUserText: string;
  }): Promise<{ text: string } | null> {
    try {
      // Resolve the service first: a root switch resets epoch state, and the
      // already-injected check below must observe that reset.
      const service = this.ensureService();
      const epoch = compactionMarkerCount(input.messages);
      const alreadyInjected = this.injectedEpochs.get(input.conversationId) === epoch;
      const outcome = await service.planInjection({
        conversationId: input.conversationId,
        messages: input.messages,
        latestUserText: input.latestUserText,
        settings: this.settings(),
        ...(alreadyInjected ? { alreadyInjectedThisEpochOverride: true } : {}),
      });
      if (outcome.text) {
        this.injectedEpochs.set(input.conversationId, epoch);
        // Injection starts a fresh epoch for distillation watermarks too:
        // the injected block is context, not a distilled user turn.
      }
      return outcome.text ? { text: outcome.text } : null;
    } catch {
      return null; // fail-soft: never block a user turn
    }
  }

  onTurnSettled(input: { conversationId: string; sessionId?: string }): void {
    try {
      if (this.disposed || !this.settings().memoryBackendEnabled) return;
      window.setTimeout(() => {
        void this.handleTurnSettled(input);
      }, this.turnSettleDelayMs);
    } catch {
      // fail-soft
    }
  }

  onSettingsChanged(): void {
    if (!this.settings().memoryBackendEnabled) {
      this.extractionWatermarks.clear();
      this.injectedEpochs.clear();
      this.compactionCounts.clear();
    }
    // Re-wire the sync service eagerly: setting the remote URL must start
    // syncing without waiting for the next memory operation.
    this.ensureSyncService((this.settings().memoryExternalRoot ?? '').trim());
  }

  // -------------------------------------------------------------------------
  // Maintenance surface (Obsidian commands)
  // -------------------------------------------------------------------------

  async status(): Promise<MemoryStatusReport> {
    await this.ensureService().ensureRoot();
    return this.ensureService().status();
  }

  async lint(): Promise<MemoryLintReport> {
    await this.ensureService().ensureRoot();
    return this.ensureService().lint();
  }

  async forget(name: string): Promise<{ removed: string[] }> {
    const { removed } = await this.ensureService().forget(name);
    if (removed.length > 0) this.sync?.scheduleSync();
    return { removed };
  }

  /** Register the palette commands on the plugin (idempotent). */
  registerCommands(plugin: { addCommand(cmd: { id: string; name: string; callback: () => void }): unknown }): void {
    plugin.addCommand({
      id: 'memory-status',
      name: t('commands.memory.status'),
      callback: () => {
        void this.runStatusCommand();
      },
    });
    plugin.addCommand({
      id: 'memory-lint',
      name: t('commands.memory.lint'),
      callback: () => {
        void this.runLintCommand();
      },
    });
    plugin.addCommand({
      id: 'memory-forget',
      name: t('commands.memory.forget'),
      callback: () => {
        new MemoryForgetNameModal(this.options.app, this).open();
      },
    });
  }

  private syncStateText(): string {
    const status = this.sync?.getStatus();
    if (!status || !status.active) return 'off';
    if (!status.last) return 'idle';
    const r = status.last;
    if (!r.ok) return `error (${r.detail ?? 'unknown'})`;
    const blocked = r.blockedSecrets?.length ? ` secrets-blocked=${r.blockedSecrets.length}` : '';
    return `ok (commit=${r.committed} pull=${r.pulled} push=${r.pushed})${blocked}`;
  }

  private async runStatusCommand(): Promise<void> {
    try {
      const report = await this.status();
      const lines = [
        t('commands.memory.statusRoot', { root: report.memoryRootDisplay }),
        t('commands.memory.statusIndex', {
          lines: String(report.indexLines),
          bytes: String(report.indexBytes),
        }),
        t('commands.memory.statusTopics', { count: String(report.topicFiles) }),
        Object.entries(report.byType)
          .map(([type, count]) => `${type}: ${count}`)
          .join(', '),
        t('commands.memory.statusSync', { state: this.syncStateText() }),
      ];
      new Notice(lines.join('\n'), 10_000);
    } catch (error) {
      new Notice(t('commands.memory.error', { message: String(error) }));
    }
  }

  private async runLintCommand(): Promise<void> {
    try {
      const report = await this.lint();
      const problems = [
        ...report.secretHits.map((h) => t('commands.memory.lintSecret', { file: h.file })),
        ...report.missingImportance.map((f) => t('commands.memory.lintImportance', { file: f })),
        ...report.strayFiles.map((f) => t('commands.memory.lintStray', { file: f })),
      ];
      new Notice(
        problems.length > 0
          ? problems.join('\n')
          : t('commands.memory.lintClean', { count: String(report.topicFiles) }),
        10_000,
      );
    } catch (error) {
      new Notice(t('commands.memory.error', { message: String(error) }));
    }
  }

  async runForget(name: string): Promise<void> {
    try {
      const { removed } = await this.forget(name);
      new Notice(
        removed.length > 0
          ? t('commands.memory.forgetDone', { names: removed.join(', ') })
          : t('commands.memory.forgetNone', { name }),
      );
    } catch (error) {
      new Notice(t('commands.memory.error', { message: String(error) }));
    }
  }

  dispose(): void {
    this.disposed = true;
    this.sync?.dispose();
    this.sync = null;
    this.extractionWatermarks.clear();
    this.injectedEpochs.clear();
    this.compactionCounts.clear();
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private settings(): MemorySettingsSnapshot {
    return this.options.getSettings();
  }

  private async handleTurnSettled(input: {
    conversationId: string;
    sessionId?: string;
  }): Promise<void> {
    try {
      const settings = this.settings();
      if (!settings.memoryBackendEnabled || this.disposed) return;

      const messages = await this.options.getConversationMessages(input.conversationId);
      if (!messages || messages.length === 0) return;

      // Backend-neutral compaction signal (D-O6): a new persisted marker
      // since the last observation triggers one reflection pass.
      const markers = compactionMarkerCount(messages);
      const lastMarkers = this.compactionCounts.get(input.conversationId) ?? 0;
      this.compactionCounts.set(input.conversationId, markers);
      if (markers > lastMarkers && settings.memoryExtractionEnabled) {
        await this.runReflectionGuarded(input, messages);
      }

      if (settings.memoryExtractionEnabled) {
        await this.runExtractionGuarded(input, messages);
      }
    } catch {
      // fail-soft by contract
    }
  }

  private async runExtractionGuarded(
    input: { conversationId: string; sessionId?: string },
    messages: ReadonlyArray<MemoryTranscriptMessage>,
  ): Promise<void> {
    if (this.extractionInFlight) return;
    this.extractionInFlight = true;
    try {
      const outcome = await this.ensureService().runExtraction({
        conversationId: input.conversationId,
        sessionId: input.sessionId ?? input.conversationId,
        settings: this.settings(),
        invoker: this.invoker,
        lastExtractedMessageCount: this.extractionWatermarks.get(input.conversationId) ?? 0,
        messages,
      });
      if (outcome.status === 'written') this.sync?.scheduleSync();
    } finally {
      this.extractionWatermarks.set(input.conversationId, messages.length);
      this.extractionInFlight = false;
    }
  }

  private async runReflectionGuarded(
    input: { conversationId: string; sessionId?: string },
    messages: ReadonlyArray<MemoryTranscriptMessage>,
  ): Promise<void> {
    if (this.reflectionInFlight) return;
    this.reflectionInFlight = true;
    try {
      const outcome = await this.ensureService().runReflection({
        conversationId: input.conversationId,
        sessionId: input.sessionId ?? input.conversationId,
        settings: this.settings(),
        invoker: this.invoker,
        messages,
      });
      if (outcome.status === 'written') this.sync?.scheduleSync();
    } finally {
      this.reflectionInFlight = false;
    }
  }

  /**
   * One-shot JSON distillation on a throwaway OpenCode session. The session
   * is created with `setCurrent: false` and always deleted, so memory
   * distillation never pollutes the user's conversation list.
   */
  private async invokeModel(input: {
    system: string;
    user: string;
    modelRef: string;
    title: string;
  }): Promise<string> {
    const service = this.options.openCodeService;
    const sessionId = await service.createSession(input.title, { setCurrent: false });
    try {
      const { provider, model } = splitModelRef(input.modelRef);
      const response = await service.requestAssistantResponse(input.user, {
        sessionId,
        system: input.system,
        format: { type: 'text' },
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
      });
      return response?.content ?? '';
    } finally {
      try {
        await service.deleteSession(sessionId);
      } catch {
        // best-effort cleanup
      }
    }
  }
}

/** Tiny input modal for the forget flow (confirm-first by design). */
class MemoryForgetNameModal extends Modal {
  private value = '';

  constructor(app: App, private readonly runtime: MemoryRuntimeCoordinator) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t('commands.memory.forgetTitle'));
    new Setting(this.contentEl)
      .setName(t('commands.memory.forgetName'))
      .addText((text) => {
        text.setPlaceholder('memory-slug');
        text.onChange((value) => {
          this.value = value;
        });
      });
    new Setting(this.contentEl).addButton((button) => {
      button
        .setButtonText(t('commands.memory.forgetConfirm'))
        .onClick(() => {
          const name = this.value.trim();
          this.close();
          if (name) void this.runtime.runForget(name);
        });
    });
  }
}
