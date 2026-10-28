/**
 * `MemoryRuntimeCoordinator` — the composition-layer owner of the memory
 * runtime (`app.memory-runtime`). Mirrors the `DiagnosticsRuntimeCoordinator`
 * pattern: `main.ts` never touches memory services directly; this class
 * binds the backend-neutral `core.memory` core to concrete infrastructure
 * (Obsidian vault adapter filesystem, owning-backend read-only auxiliary-session
 * model invoker) and exposes the narrow `MemoryRuntimePort` plus the
 * maintenance command surface.
 *
 * Everything here is fail-soft by contract: a memory failure must never
 * surface in or block a user turn.
 */

import * as nodePath from 'node:path';

import { App, Modal, Notice, Setting } from 'obsidian';

import { type AgentAuxQueryCapability, AUX_DENIED_CAPABILITIES, type AuxQuerySession, type BackendModelSelection,findWriteToolCalls } from '../../core/agents/backend/AgentAuxQueryCapability';
import type { AgentServiceRegistry } from '../../core/agents/backend/AgentServiceRegistry';
import {
  compactionMarkerCount,
  completedAgentTranscripts,
  externalMemoryProjectDir,
  MemoryBackendService,
  type MemoryLintReport,
  type MemoryModelInvoker,
  type MemoryRuntimePort,
  type MemorySettingsSnapshot,
  type MemoryStatusReport,
  type MemoryTranscriptMessage,
} from '../../core/memory';
import { MEMORY_STORE_ROOT, memoryAgentKey, type MemoryEmbeddingInvoker,memoryProjectDir } from '../../core/memory';
import type { AgentBackendKind, Conversation } from '../../core/types/chat';
import { t } from '../../i18n';
import { expandHomeDir, ExternalMemoryFileSystem } from './ExternalMemoryFileSystem';
import { MemoryGitSyncService } from './MemoryGitSyncService';
import { VaultMemoryFileSystem } from './VaultMemoryFileSystem';
export { VaultMemoryFileSystem } from './VaultMemoryFileSystem';

/** Debounce between turn settle and background distillation (ms). */
const TURN_SETTLE_DELAY_MS = 1_500;

export interface MemoryRuntimeCoordinatorOptions {
  readonly app: App;
  readonly registry: Pick<AgentServiceRegistry, 'get' | 'isEnabled'>;
  readonly getConversationContext: (id: string) => Promise<Pick<Conversation, 'backend' | 'backendAgentId' | 'backendSessionId' | 'sessionSettings' | 'lastContextUsage'> | null>;
  readonly getEmbeddingClient?: () => MemoryEmbeddingInvoker | null;
  readonly getSettings: () => MemorySettingsSnapshot;
  readonly getConversationMessages: (
    conversationId: string,
  ) => Promise<ReadonlyArray<MemoryTranscriptMessage> | null>;
  /** Test hook: override the turn-settle debounce (default 1500ms). */
  readonly turnSettleDelayMs?: number;
}

type MemoryConversationContext = NonNullable<Awaited<ReturnType<MemoryRuntimeCoordinatorOptions['getConversationContext']>>>;
type MemoryAuxAdapter = AgentAuxQueryCapability & {
  getDefaultModel?: () => { provider: string; model: string } | null;
  getDefaultModelSelection?: (sessionId?: string) => { provider: string; model: string } | null;
};

function conversationModel(kind: AgentBackendKind, context: MemoryConversationContext): { provider: string; model: string } | null {
  const session = context.sessionSettings;
  let selected: { provider: string; model: string } | null | undefined;
  switch (kind) {
    case 'claude-code': selected = session?.claudeModelOverride; break;
    case 'pi': selected = session?.piModelOverride; break;
    case 'zcode': selected = session?.zcodeModelOverride; break;
    case 'dsh': selected = session?.dshModelOverride; break;
  }
  if (selected) return selected;
  const usage = context.lastContextUsage;
  return usage?.providerId && usage.modelId ? { provider: usage.providerId, model: usage.modelId } : null;
}

function resolveMemoryModel(input: {
  kind: Exclude<AgentBackendKind, 'opencode' | 'copilot'>;
  context: MemoryConversationContext;
  settings: MemorySettingsSnapshot;
  fallback: { provider: string; model: string } | null;
  request: Parameters<MemoryModelInvoker['invoke']>[0];
}): BackendModelSelection | undefined {
  const { kind, context, settings, fallback, request } = input;
  const override = request.purpose === 'selection' ? settings.memorySelectorModelOverrides?.[kind]
    : settings.memoryModelOverrides?.[kind] || (kind === 'opencode2' ? request.modelRef : '');
  const pair = conversationModel(kind, context) || fallback;
  const bare = kind === 'claude-code' || kind === 'codex';
  const raw = override?.trim() || (kind === 'codex' ? context.sessionSettings?.codexModelOverride?.trim() : '')
    || (pair ? (bare ? pair.model : `${pair.provider}/${pair.model}`) : '');
  if (!raw) return undefined;
  if (/\s/u.test(raw)) throw new Error('invalid-memory-model-reference');
  if (kind === 'claude-code' || kind === 'codex') return { kind, model: raw };
  const slash = raw.indexOf('/');
  if (slash <= 0 || slash === raw.length - 1) throw new Error('invalid-memory-model-reference');
  return { kind, provider: raw.slice(0, slash), model: raw.slice(slash + 1) };
}

function validateMemoryAuxiliary(aux: AuxQuerySession, kind: AgentBackendKind): void {
  const proof = aux.safety;
  if (proof.backend !== kind || !['none', 'read-only-allowlist'].includes(proof.enforcedPolicy)
    || (proof.enforcedPolicy === 'none' && proof.effectiveTools.length > 0)
    || AUX_DENIED_CAPABILITIES.some(cap => !proof.deniedCapabilities.includes(cap))
    || findWriteToolCalls(proof.effectiveTools.map(name => ({ name }))).length) throw new Error('memory-auxiliary-safety-rejected');
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
  private readonly sessions = new Set<AuxQuerySession>();
  private readonly recalled = new Map<string, { epoch: number; paths: string[]; characters: number }>();
  private readonly timers = new Map<string, number>();
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;
  private readonly agentWatermarks = new Map<string, string>();

  /** Per-conversation transcript watermark already distilled. */
  private readonly extractionWatermarks = new Map<string, number>();
  /** Compaction-marker count when the epoch's injection was planned. */
  private readonly injectedEpochs = new Map<string, number>();
  /** Compaction-marker count at the last settle observation. */
  private readonly compactionCounts = new Map<string, number>();
  private disposed = false;

  private readonly turnSettleDelayMs: number;

  constructor(private readonly options: MemoryRuntimeCoordinatorOptions) {
    this.turnSettleDelayMs = options.turnSettleDelayMs ?? TURN_SETTLE_DELAY_MS;
    this.fs = new VaultMemoryFileSystem(options.app);
    this.vaultBasePath = (options.app.vault.adapter as { basePath?: string }).basePath ?? '.';
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
  private ensureService(agentKey?: string | null): MemoryBackendService {
    const settings = this.settings();
    const root = (settings.memoryExternalRoot ?? '').trim();
    const identity = { workspaceIdentity: settings.memoryWorkspaceIdentity, workspacePathAliases: settings.memoryWorkspacePathAliases };
    const agent = settings.memoryAgentNotebooksEnabled !== false && agentKey ? memoryAgentKey(agentKey) : null;
    const agentRoot = settings.memoryAgentStorageRoot?.trim();
    const rootKey = JSON.stringify([root, identity, agent, agentRoot]);
    if (this.service && this.serviceRootKey === rootKey) return this.service;
    if (root || (agent && agentRoot)) {
      const expandedRoot = expandHomeDir(agent && agentRoot ? agentRoot : root);
      const externalFs = new ExternalMemoryFileSystem(expandedRoot);
      this.service = new MemoryBackendService(externalFs, this.vaultBasePath, {
        projectDir: agent ? nodePath.join(expandedRoot, ...(agentRoot ? [] : ['agent-memory']), agent)
          : externalMemoryProjectDir(expandedRoot, this.vaultBasePath, identity),
        metricsFs: this.fs,
        agentKey: agent ?? undefined,
      });
    } else {
      this.service = new MemoryBackendService(this.fs, this.vaultBasePath, {
        projectDir: agent ? `${MEMORY_STORE_ROOT}/agent-memory/${agent}` : memoryProjectDir(this.vaultBasePath, identity),
        agentKey: agent ?? undefined,
      });
    }
    this.serviceRootKey = rootKey;
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
    const key = `${rawRoot};;${remoteUrl}`;
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
      if (this.disposed || !this.settings().memoryBackendEnabled) return null;
      const generation = this.generation;
      const context = await this.options.getConversationContext(input.conversationId);
      const service = this.ensureService(context?.backendAgentId);
      const key = `${input.conversationId}:${service.projectDir}`;
      const epoch = compactionMarkerCount(input.messages);
      const alreadyInjected = this.injectedEpochs.get(key) === epoch;
      const recall = this.recalled.get(key);
      const sameEpoch = recall?.epoch === epoch;
      const outcome = await service.planInjection({
        conversationId: input.conversationId,
        messages: input.messages,
        latestUserText: input.latestUserText,
        settings: this.settings(),
        invoker: this.invokerFor(input.conversationId),
        embedding: this.settings().memoryEmbeddingEnabled ? this.options.getEmbeddingClient?.() : null,
        alreadyRecalledPaths: sameEpoch ? recall.paths : [],
        alreadyRecalledContentCharacters: sameEpoch ? recall.characters : 0,
        ...(alreadyInjected ? { alreadyInjectedThisEpochOverride: true } : {}),
      });
      if (this.disposed || generation !== this.generation) return null;
      if (outcome.text) {
        this.injectedEpochs.set(key, epoch);
        this.recalled.set(key, { epoch, paths: [...(sameEpoch ? recall.paths : []), ...outcome.recalledPaths],
          characters: outcome.recalledContentCharacters ?? (sameEpoch ? recall.characters : 0) });
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
      const pending = this.timers.get(input.conversationId);
      if (pending !== undefined) window.clearTimeout(pending);
      const timer = window.setTimeout(() => {
        this.timers.delete(input.conversationId);
        this.queue = this.queue.then(() => this.handleTurnSettled(input)).catch(() => undefined);
      }, this.turnSettleDelayMs);
      this.timers.set(input.conversationId, timer);
    } catch {
      // fail-soft
    }
  }

  onSettingsChanged(): void {
    this.generation++;
    this.recalled.clear();
    this.agentWatermarks.clear();
    this.injectedEpochs.clear();
    this.extractionWatermarks.clear();
    this.compactionCounts.clear();
    this.service = null;
    this.serviceRootKey = '__unset__';
    for (const session of this.sessions) session.cancel();
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
    this.generation++;
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    this.recalled.clear();
    this.agentWatermarks.clear();
    for (const session of this.sessions) { session.cancel(); void session.dispose().catch(() => undefined); }
    this.sessions.clear();
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
      if (markers > lastMarkers && settings.memoryExtractionEnabled) {
        const reflected = await this.runReflectionGuarded(input, messages);
        if (reflected) this.compactionCounts.set(input.conversationId, markers);
      }

      if (settings.memoryExtractionEnabled) {
        await this.runExtractionGuarded(input, messages);
        await this.runAgentExtraction(input, messages);
      }
    } catch {
      // fail-soft by contract
    }
  }

  private async runAgentExtraction(input: { conversationId: string; sessionId?: string }, messages: ReadonlyArray<MemoryTranscriptMessage>): Promise<void> {
    if (this.settings().memoryAgentNotebooksEnabled === false) return;
    const generation = this.generation;
    for (const agent of completedAgentTranscripts(messages)) {
      const key = `${input.conversationId}:${agent.key}`;
      if (this.agentWatermarks.get(key) === agent.fingerprint) continue;
      const outcome = await this.ensureService(agent.agent).runExtraction({
        conversationId: input.conversationId, sessionId: `${input.sessionId ?? input.conversationId}:${agent.key}`,
        settings: this.settings(), invoker: this.invokerFor(input.conversationId), messages: agent.messages,
        lastExtractedMessageCount: 0, isCurrent: () => !this.disposed && generation === this.generation,
      });
      if (outcome.status !== 'error') this.agentWatermarks.set(key, agent.fingerprint);
      if (outcome.status === 'written') this.sync?.scheduleSync();
    }
  }

  private async runExtractionGuarded(
    input: { conversationId: string; sessionId?: string },
    messages: ReadonlyArray<MemoryTranscriptMessage>,
  ): Promise<void> {
    const generation = this.generation;
    const context = await this.options.getConversationContext(input.conversationId);
    const service = this.ensureService(context?.backendAgentId);
    const outcome = await service.runExtraction({
        conversationId: input.conversationId,
        sessionId: input.sessionId ?? input.conversationId,
        settings: this.settings(),
        invoker: this.invokerFor(input.conversationId),
        isCurrent: () => !this.disposed && this.generation === generation,
        lastExtractedMessageCount: this.extractionWatermarks.get(input.conversationId) ?? 0,
        messages,
      });
    if (outcome.status === 'written') this.sync?.scheduleSync();
    if (outcome.status !== 'error') this.extractionWatermarks.set(input.conversationId, messages.length);
  }

  private async runReflectionGuarded(
    input: { conversationId: string; sessionId?: string },
    messages: ReadonlyArray<MemoryTranscriptMessage>,
  ): Promise<boolean> {
    const generation = this.generation;
    const context = await this.options.getConversationContext(input.conversationId);
    const service = this.ensureService(context?.backendAgentId);
    const outcome = await service.runReflection({
        conversationId: input.conversationId,
        sessionId: input.sessionId ?? input.conversationId,
        settings: this.settings(),
        invoker: this.invokerFor(input.conversationId),
        isCurrent: () => !this.disposed && this.generation === generation,
        messages,
      });
    if (outcome.status === 'written') this.sync?.scheduleSync();
    return outcome.status !== 'error';
  }

  private invokerFor(conversationId: string): MemoryModelInvoker {
    return { invoke: input => this.invokeModel(input, conversationId) };
  }

  /** Isolated read-only auxiliary query on the persisted conversation owner. */
  private async invokeModel(input: Parameters<MemoryModelInvoker['invoke']>[0], conversationId: string): Promise<string> {
    const generation = this.generation;
    const context = await this.options.getConversationContext(conversationId);
    const kind = context?.backend;
    if (!kind || kind === 'opencode' || kind === 'copilot' || !this.options.registry.isEnabled(kind)) {
      throw new Error('memory-backend-unavailable');
    }
    const adapter = this.options.registry.get(kind) as MemoryAuxAdapter | undefined;
    if (!adapter?.startAuxQuerySession) throw new Error('memory-auxiliary-capability-unavailable');
    // Pi/Claude construct their auxiliary runtime independently; starting chat
    // first would bind a background query to an unrelated native default model.
    if (['codex', 'zcode'].includes(kind) && adapter.status !== 'connected') await adapter.start();
    const settings = this.settings();
    const model = resolveMemoryModel({ kind, context, settings, request: input,
      fallback: adapter.getDefaultModel?.() ?? adapter.getDefaultModelSelection?.(context.backendSessionId) ?? null });
    if (this.disposed || generation !== this.generation || !settings.memoryBackendEnabled) throw new Error('memory-runtime-inactive');
    const aux = await adapter.startAuxQuerySession({ systemPrompt: input.system,
      workingDirectory: this.vaultBasePath, model,
      turnTimeoutMs: input.purpose === 'selection' ? 30_000 : 180_000 });
    this.sessions.add(aux);
    try {
      if (this.disposed || generation !== this.generation) throw new Error('memory-runtime-inactive');
      validateMemoryAuxiliary(aux, kind);
      const response = await aux.query({ prompt: input.user });
      if (!response.success) throw new Error(response.error);
      if (findWriteToolCalls(response.toolCalls).length) throw new Error('memory-auxiliary-write-observed');
      if (this.disposed || generation !== this.generation) throw new Error('memory-runtime-inactive');
      return response.text;
    } finally {
      this.sessions.delete(aux);
      await aux.dispose();
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
