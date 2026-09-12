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
    list(path: string): Promise<{ files: { path: string }[] }>;
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
    const listing = await this.adapter().list(normalizePath(relativePath));
    return listing.files.map((f) => nodePath.basename(f.path));
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
  private readonly service: MemoryBackendService;
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
    const vaultBasePath = (options.app.vault.adapter as { basePath?: string }).basePath ?? '.';
    this.service = new MemoryBackendService(this.fs, vaultBasePath);
    this.invoker = {
      invoke: (input) => this.invokeModel(input),
    };
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
      const epoch = compactionMarkerCount(input.messages);
      const alreadyInjected = this.injectedEpochs.get(input.conversationId) === epoch;
      const outcome = await this.service.planInjection({
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
  }

  // -------------------------------------------------------------------------
  // Maintenance surface (Obsidian commands)
  // -------------------------------------------------------------------------

  async status(): Promise<MemoryStatusReport> {
    await this.service.ensureRoot();
    return this.service.status();
  }

  async lint(): Promise<MemoryLintReport> {
    await this.service.ensureRoot();
    return this.service.lint();
  }

  async forget(name: string): Promise<{ removed: string[] }> {
    return this.service.forget(name);
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
      await this.service.runExtraction({
        conversationId: input.conversationId,
        sessionId: input.sessionId ?? input.conversationId,
        settings: this.settings(),
        invoker: this.invoker,
        lastExtractedMessageCount: this.extractionWatermarks.get(input.conversationId) ?? 0,
        messages,
      });
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
      await this.service.runReflection({
        conversationId: input.conversationId,
        sessionId: input.sessionId ?? input.conversationId,
        settings: this.settings(),
        invoker: this.invoker,
        messages,
      });
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
