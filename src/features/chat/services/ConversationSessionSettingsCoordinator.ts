/* eslint-disable max-lines -- This coordinator owns session settings modal orchestration, sharing bridge, Codex overrides + live-thread re-resume, thread goal/review delegation, and effective-settings resolution in one cohesive owner; splitting would add indirection without removing real complexity. */
import type { App } from 'obsidian';

import { readBackendSessionShareUrl } from '../../../core/agents/backend/AgentBackendRouting';
import type { AgentServiceRegistry } from '../../../core/agents/backend/AgentServiceRegistry';
import type { CodexModelSummary } from '../../../core/agents/backend/CodexAdapter';
import type { AppServerReviewResult, AppServerReviewTarget, AppServerThreadGoal } from '../../../core/agents/backend/CodexAppServerClient';
import type {
  Conversation,
  ConversationSessionSettings,
  OpencodeShareMode,
} from '../../../core/types';
import {
  getConversationBackendSessionId,
  normalizeConversationSessionSettings,
} from '../../../core/types';
import type { CodexReasoningEffort, CodexSandboxMode, CodexWebSearchMode } from '../../../core/types/settings';
import { t } from '../../../i18n';
import {
  ConversationSessionSettingsModal,
} from '../ui/ConversationSessionSettingsModal';

/**
 * Minimal inspection-only shape for reading share URLs from session data.
 *
 * This is NOT a stable cross-backend session contract.  It is the narrowest
 * type the coordinator needs to extract `id` and `share.url` from either
 * host-provided listSessions results or OpenCode share/unshare responses.
 */
export interface ShareInspectionEntry {
  id?: string;
  share?: unknown;
}

export interface ResolvedConversationSessionSettings {
  chatFontSizePx: number;
  codexSandboxMode?: CodexSandboxMode;
  codexModelReasoningEffort?: CodexReasoningEffort;
  codexModelOverride?: string;
  codexAdditionalDirectories?: string[];
  codexNetworkAccessEnabled?: boolean;
  codexWebSearchMode?: CodexWebSearchMode;
}

export interface ConversationSessionSettingsCoordinatorHost {
  app: App;
  getCurrentConversation(): Conversation | null;
  getSessionSettingsDefaults(): ResolvedConversationSessionSettings;
  getChatContainerEl(): HTMLElement | null;
  saveConversation(conversation: Conversation): Promise<void>;
  showNotice(message: string): void;
  shareSession?(sessionId: string): Promise<ShareInspectionEntry>;
  unshareSession?(sessionId: string): Promise<ShareInspectionEntry>;
  listSessions?(): Promise<ShareInspectionEntry[]>;
  copyText?(text: string): Promise<void>;
  getProjectShareMode?(): Promise<OpencodeShareMode | undefined>;
  supportsSessionSharing?(): boolean;
  supportsTitleGeneration?(): boolean;
  supportsCompaction?(): boolean;
  supportsQuestions?(): boolean;
  canOpenExperimentalActions?(): boolean;
  openExperimentalActions?(): void;
  getCodexGlobalDefaults?(): { sandboxMode: CodexSandboxMode; modelReasoningEffort: CodexReasoningEffort; model: string; additionalDirectories: string[]; networkAccessEnabled: boolean; webSearchMode: CodexWebSearchMode };
  applyCodexRuntimeOverrides?(overrides: { sandboxMode: CodexSandboxMode; modelReasoningEffort: CodexReasoningEffort; model?: string; additionalDirectories?: string[]; networkAccessEnabled?: boolean; webSearchMode?: CodexWebSearchMode }): void;
  agentServiceRegistry?: AgentServiceRegistry;
  /** Open a backend session as a new conversation in the chat view. */
  openBackendSessionAsConversation?(sessionId: string, title: string): Promise<string | null>;
}

export class ConversationSessionSettingsCoordinator {
  private activeModal: ConversationSessionSettingsModal | null = null;

  constructor(private readonly host: ConversationSessionSettingsCoordinatorHost) {}

  async openCurrentConversationSettings(): Promise<void> {
    const conversation = this.host.getCurrentConversation();
    if (!conversation) {
      this.host.showNotice(t('chat.sessionSettings.noConversation'));
      return;
    }

    await this.openConversationSettingsModal(conversation);
  }

  private async openConversationSettingsModal(conversation: Conversation): Promise<void> {
    const showSharing = this.host.supportsSessionSharing?.() === true;
    const showCompaction = this.host.supportsCompaction?.() === true;
    const showExperimentalActions = this.isOpenCodeConversation(conversation)
      && this.host.canOpenExperimentalActions?.() === true;
    const isCodex = this.isCodexConversation(conversation);
    const codexDefaults = isCodex ? this.host.getCodexGlobalDefaults?.() : undefined;
    const codexAvailableModels = isCodex ? await this.loadCodexModelOptions() : undefined;
    const codexThreadGoal = isCodex ? await this.loadCodexThreadGoal(conversation) : undefined;

    const sessionId = getConversationBackendSessionId(conversation);
    const shareUrl = showSharing && sessionId ? await this.getCurrentShareUrl(conversation, sessionId) : undefined;
    const shareMode = showSharing ? await this.getProjectShareMode() : undefined;

    const modal = new ConversationSessionSettingsModal(this.host.app, {
      conversationTitle: conversation.title || t('chat.history.untitled'),
      defaults: {
        ...this.resolveEffectiveSettings(conversation),
      ...(codexDefaults ? {
        codexSandboxMode: codexDefaults.sandboxMode,
        codexModelReasoningEffort: codexDefaults.modelReasoningEffort,
        codexModelOverride: codexDefaults.model,
        codexAdditionalDirectories: codexDefaults.additionalDirectories,
        codexNetworkAccessEnabled: codexDefaults.networkAccessEnabled,
        codexWebSearchMode: codexDefaults.webSearchMode,
        codexAvailableModels,
        codexThreadGoal,
      } : {}),
      },
      initialOverrides: conversation.sessionSettings,
      showTitleSummary: this.shouldShowTitleSummary(conversation),
      showCompactionSummary: showCompaction,
      showQuestionsSummary: this.shouldShowQuestionsSummary(conversation),
      showCodexControls: isCodex,
      shareUrl,
      shareMode,
      onSave: async (overrides) => {
        await this.saveConversationOverrides(conversation, overrides);
      },
      onPreview: (overrides) => {
        this.previewConversationOverrides(conversation, overrides);
      },
      onCancelPreview: () => {
        this.applyConversationVisualState(conversation);
      },
      onShare: showSharing ? async () => {
        await this.shareCurrentConversation(conversation);
      } : undefined,
      onUnshare: showSharing ? async () => {
        await this.unshareCurrentConversation(conversation);
      } : undefined,
      onOpenExperimentalActions: showExperimentalActions
        ? () => this.host.openExperimentalActions?.()
        : undefined,
      onSetThreadGoal: isCodex ? async (objective: string, options?: { tokenBudget?: number }) => {
        return this.setCodexThreadGoal(conversation, objective, options);
      } : undefined,
      onClearThreadGoal: isCodex ? async () => {
        return this.clearCodexThreadGoal(conversation);
      } : undefined,
      onStartReview: isCodex ? async (target: AppServerReviewTarget) => {
        return this.startCodexReview(conversation, target);
      } : undefined,
    });
    if (this.activeModal) {
      this.activeModal.close();
    }
    document.querySelectorAll('.modal-container .modal.opencodian-session-settings-modal').forEach((el) => {
      const container = el.closest('.modal-container');
      container?.remove();
    });
    this.activeModal = modal;
    modal.open();
  }

  private shouldShowTitleSummary(conversation: Conversation): boolean {
    const hostSupport = this.host.supportsTitleGeneration?.();
    if (hostSupport !== undefined) {
      return hostSupport;
    }
    return (conversation.backend ?? 'opencode') === 'opencode';
  }

  private isOpenCodeConversation(conversation: Conversation): boolean {
    return (conversation.backend ?? 'opencode') === 'opencode';
  }

  private shouldShowQuestionsSummary(conversation: Conversation): boolean {
    const hostSupport = this.host.supportsQuestions?.();
    if (hostSupport !== undefined) {
      return hostSupport;
    }
    return (conversation.backend ?? 'opencode') === 'opencode';
  }

  private async loadCodexModelOptions(): Promise<CodexModelSummary[] | undefined> {
    const registry = this.host.agentServiceRegistry;
    if (!registry) {
      return undefined;
    }
    const adapter = registry.get('codex') as {
      getModelList?: () => Promise<CodexModelSummary[] | null>;
    } | null;
    if (typeof adapter?.getModelList !== 'function') {
      return undefined;
    }
    try {
      const models = await adapter.getModelList();
      return models ?? undefined;
    } catch {
      return undefined;
    }
  }

  private async getCurrentShareUrl(conversation: Conversation, sessionId: string): Promise<string | null> {
    try {
      // Prefer registry routing (backend-aware getSession) over listing all sessions.
      const registry = this.host.agentServiceRegistry;
      if (registry) {
        return await readBackendSessionShareUrl(registry, conversation, sessionId);
      }
      // Legacy fallback: host.listSessions. No longer falls through to
      // openCodeService.listSessions — the coordinator should not read session
      // detail by binding directly to openCodeService. If no host method is
      // available, return null (no share URL).
      if (this.host.listSessions) {
        const sessions = await this.host.listSessions();
        return this.getShareUrl(sessions.find((session) => session.id === sessionId) ?? null);
      }
      return null;
    } catch {
      return null;
    }
  }

  private async getProjectShareMode(): Promise<OpencodeShareMode | undefined> {
    try {
      if (this.host.getProjectShareMode) {
        return await this.host.getProjectShareMode();
      }
      const manager = this.resolveOpenCodianPlugin()?.opencodeConfigManager;
      return await manager?.getShareConfig?.();
    } catch {
      return undefined;
    }
  }

  resolveEffectiveSettings(
    conversation: Conversation | null | undefined,
  ): ResolvedConversationSessionSettings {
    const defaults = this.host.getSessionSettingsDefaults();
    const overrides = conversation?.sessionSettings;
    const result: ResolvedConversationSessionSettings = {
      chatFontSizePx:
        overrides?.chatFontSizePx ?? defaults.chatFontSizePx,
    };

    if (this.isCodexConversation(conversation)) {
      const codexDefaults = this.host.getCodexGlobalDefaults?.();
      if (codexDefaults) {
        result.codexSandboxMode =
          overrides?.codexSandboxMode === null || overrides?.codexSandboxMode === undefined
            ? codexDefaults.sandboxMode
            : overrides.codexSandboxMode;
        result.codexModelReasoningEffort =
          overrides?.codexModelReasoningEffort === null || overrides?.codexModelReasoningEffort === undefined
            ? codexDefaults.modelReasoningEffort
            : overrides.codexModelReasoningEffort;
        result.codexModelOverride =
          overrides?.codexModelOverride === null || overrides?.codexModelOverride === undefined
            ? codexDefaults.model
            : overrides.codexModelOverride;
        result.codexAdditionalDirectories =
          overrides?.codexAdditionalDirectories === null || overrides?.codexAdditionalDirectories === undefined
            ? codexDefaults.additionalDirectories
            : overrides.codexAdditionalDirectories;
        result.codexNetworkAccessEnabled =
          overrides?.codexNetworkAccessEnabled === null || overrides?.codexNetworkAccessEnabled === undefined
            ? codexDefaults.networkAccessEnabled
            : overrides.codexNetworkAccessEnabled;
        result.codexWebSearchMode =
          overrides?.codexWebSearchMode === null || overrides?.codexWebSearchMode === undefined
            ? codexDefaults.webSearchMode
            : overrides.codexWebSearchMode;
      }
    }

    return result;
  }

  applyConversationVisualState(
    conversation: Conversation | null | undefined,
  ): ResolvedConversationSessionSettings {
    const effective = this.resolveEffectiveSettings(conversation);
    this.host.getChatContainerEl()?.style.setProperty(
      '--opencodian-chat-font-size',
      `${effective.chatFontSizePx}px`,
    );
    return effective;
  }

  async applyConversationRuntimeState(
    conversation: Conversation | null | undefined,
  ): Promise<ResolvedConversationSessionSettings> {
    const effective = this.applyConversationVisualState(conversation);

    if (this.isCodexConversation(conversation)
      && this.host.applyCodexRuntimeOverrides
      && effective.codexSandboxMode
      && effective.codexModelReasoningEffort) {
      this.host.applyCodexRuntimeOverrides({
        sandboxMode: effective.codexSandboxMode,
        modelReasoningEffort: effective.codexModelReasoningEffort,
        model: effective.codexModelOverride,
        additionalDirectories: effective.codexAdditionalDirectories,
        networkAccessEnabled: effective.codexNetworkAccessEnabled,
        webSearchMode: effective.codexWebSearchMode,
      });
      // Drop the cached SDK Thread so the next turn re-resumes the backend
      // thread with the freshly-updated options. The SDK freezes per-thread
      // options at Thread creation; without invalidation the live thread
      // keeps using the old CLI args until a brand-new thread is created.
      // Only invalidate when the conversation has a real backend session id
      // (a real Codex thread id), not a provisional-only conversation.
      this.invalidateCodexLiveThread(conversation);
    }

    return effective;
  }

  /**
   * Ask the Codex adapter (via the registry the coordinator already holds) to
   * invalidate the cached SDK Thread for the current conversation's backend
   * session. No-op for non-Codex conversations, provisional-only conversations,
   * or when the adapter does not expose `invalidateLiveThread`.
   */
  private invalidateCodexLiveThread(conversation: Conversation | null | undefined): void {
    if (!this.isCodexConversation(conversation)) {
      return;
    }
    const sessionId = conversation ? getConversationBackendSessionId(conversation) : null;
    if (!sessionId) {
      return;
    }
    const registry = this.host.agentServiceRegistry;
    if (!registry) {
      return;
    }
    const adapter = registry.get('codex') as {
      invalidateLiveThread?(id: string): boolean;
    } | null;
    if (typeof adapter?.invalidateLiveThread === 'function') {
      adapter.invalidateLiveThread(sessionId);
    }
  }

  async saveConversationOverrides(
    conversation: Conversation,
    overrides?: Partial<ConversationSessionSettings> | null,
  ): Promise<void> {
    const normalizedOverrides = normalizeConversationSessionSettings(overrides);
    conversation.sessionSettings = normalizedOverrides
      && Object.values(normalizedOverrides).every((value) => value === null)
      ? undefined
      : normalizedOverrides;
    conversation.updatedAt = Date.now();
    await this.host.saveConversation(conversation);

    const isCurrentConversation = this.host.getCurrentConversation()?.id === conversation.id;

    if (isCurrentConversation) {
      await this.applyConversationRuntimeState(conversation);
    }

    this.host.showNotice(t('chat.sessionSettings.saved'));
  }

  private previewConversationOverrides(
    conversation: Conversation,
    overrides?: Partial<ConversationSessionSettings> | null,
  ): void {
    const normalizedOverrides = normalizeConversationSessionSettings(overrides);
    const previewConversation = {
      ...conversation,
      sessionSettings: normalizedOverrides
        && Object.values(normalizedOverrides).every((value) => value === null)
        ? undefined
        : normalizedOverrides,
    };

    this.applyConversationVisualState(previewConversation);
  }

  private async shareCurrentConversation(conversation: Conversation): Promise<void> {
    if ((conversation.backend ?? 'opencode') !== 'opencode') {
      throw new Error(t('chat.sessionSharing.shareFailed'));
    }
    const sessionId = getConversationBackendSessionId(conversation);
    if (!sessionId) {
      throw new Error(t('chat.sessionSharing.shareFailed'));
    }
    let session: ShareInspectionEntry;
    try {
      session = await this.shareSession(sessionId);
    } catch (error) {
      throw new Error(this.getShareFailureMessage(error));
    }
    const shareUrl = this.getShareUrl(session);
    if (!shareUrl) {
      this.host.showNotice(t('chat.sessionSharing.shareNoUrl'));
      return;
    }

    await this.copyText(shareUrl);
    this.host.showNotice(t('chat.sessionSharing.shareCopied'));
  }

  private async unshareCurrentConversation(conversation: Conversation): Promise<void> {
    if ((conversation.backend ?? 'opencode') !== 'opencode') {
      throw new Error(t('chat.sessionSharing.serviceUnavailable'));
    }
    const sessionId = getConversationBackendSessionId(conversation);
    if (!sessionId) {
      throw new Error(t('chat.sessionSharing.serviceUnavailable'));
    }
    await this.unshareSession(sessionId);
    this.host.showNotice(t('chat.sessionSharing.unshared'));
  }

  private async shareSession(sessionId: string): Promise<ShareInspectionEntry> {
    if (this.host.shareSession) {
      return this.host.shareSession(sessionId);
    }
    return this.resolveOpenCodeService().shareSession(sessionId);
  }

  private async unshareSession(sessionId: string): Promise<ShareInspectionEntry> {
    if (this.host.unshareSession) {
      return this.host.unshareSession(sessionId);
    }
    return this.resolveOpenCodeService().unshareSession(sessionId);
  }

  private async copyText(text: string): Promise<void> {
    if (this.host.copyText) {
      await this.host.copyText(text);
      return;
    }
    await navigator.clipboard.writeText(text);
  }

  private resolveOpenCodeService(): {
    shareSession(sessionId: string): Promise<ShareInspectionEntry>;
    unshareSession(sessionId: string): Promise<ShareInspectionEntry>;
  } {
    const plugin = this.resolveOpenCodianPlugin();

    if (!plugin?.openCodeService) {
      throw new Error(t('chat.sessionSharing.serviceUnavailable'));
    }

    return plugin.openCodeService;
  }

  private resolveOpenCodianPlugin(): {
    opencodeConfigManager?: {
      getShareConfig?(): Promise<OpencodeShareMode | undefined>;
    };
    openCodeService?: {
      shareSession(sessionId: string): Promise<ShareInspectionEntry>;
      unshareSession(sessionId: string): Promise<ShareInspectionEntry>;
    };
  } | undefined {
    return (this.host.app as typeof this.host.app & {
      plugins?: {
        plugins?: Record<string, unknown>;
      };
    }).plugins?.plugins?.opencodian as
      | {
        opencodeConfigManager?: {
          getShareConfig?(): Promise<OpencodeShareMode | undefined>;
        };
        openCodeService?: {
          listSessions?(): Promise<ShareInspectionEntry[]>;
          shareSession(sessionId: string): Promise<ShareInspectionEntry>;
          unshareSession(sessionId: string): Promise<ShareInspectionEntry>;
        };
      }
      | undefined;
  }

  private getShareUrl(session: ShareInspectionEntry | null): string | null {
    const share = session?.share;
    if (!share || typeof share !== 'object') {
      return null;
    }
    const url = (share as { url?: unknown }).url;
    return typeof url === 'string' && url.trim().length > 0 ? url : null;
  }

  private getShareFailureMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('sharing is disabled')) {
      return t('chat.sessionSharing.disabledByProjectConfig');
    }
    return t('chat.sessionSharing.shareFailed');
  }

  private async loadCodexThreadGoal(conversation: Conversation): Promise<AppServerThreadGoal | null | undefined> {
    const sessionId = getConversationBackendSessionId(conversation);
    if (!sessionId) return undefined;
    const registry = this.host.agentServiceRegistry;
    if (!registry) return undefined;
    const adapter = registry.get('codex') as {
      getThreadGoal?: (id: string) => Promise<AppServerThreadGoal | null>;
    } | null;
    if (typeof adapter?.getThreadGoal !== 'function') return undefined;
    try {
      return await adapter.getThreadGoal(sessionId);
    } catch {
      return undefined;
    }
  }

  private async setCodexThreadGoal(conversation: Conversation, objective: string, options?: { tokenBudget?: number }): Promise<AppServerThreadGoal | null> {
    const sessionId = getConversationBackendSessionId(conversation);
    if (!sessionId) return null;
    const registry = this.host.agentServiceRegistry;
    if (!registry) return null;
    const adapter = registry.get('codex') as {
      setThreadGoal?: (id: string, objective: string, options?: { tokenBudget?: number }) => Promise<AppServerThreadGoal | null>;
    } | null;
    if (typeof adapter?.setThreadGoal !== 'function') return null;
    try {
      return await adapter.setThreadGoal(sessionId, objective, options);
    } catch {
      return null;
    }
  }

  private async clearCodexThreadGoal(conversation: Conversation): Promise<boolean> {
    const sessionId = getConversationBackendSessionId(conversation);
    if (!sessionId) return false;
    const registry = this.host.agentServiceRegistry;
    if (!registry) return false;
    const adapter = registry.get('codex') as {
      clearThreadGoal?: (id: string) => Promise<boolean>;
    } | null;
    if (typeof adapter?.clearThreadGoal !== 'function') return false;
    try {
      return await adapter.clearThreadGoal(sessionId);
    } catch {
      return false;
    }
  }

  private async startCodexReview(
    conversation: Conversation,
    target: AppServerReviewTarget,
  ): Promise<AppServerReviewResult | null> {
    const sessionId = getConversationBackendSessionId(conversation);
    if (!sessionId) return null;
    const registry = this.host.agentServiceRegistry;
    if (!registry) return null;
    const adapter = registry.get('codex') as {
      startReview?: (id: string, target: AppServerReviewTarget) => Promise<AppServerReviewResult | null>;
    } | null;
    if (typeof adapter?.startReview !== 'function') return null;
    try {
      const result = await adapter.startReview(sessionId, target);
      // After the review completes, open the review thread as a real
      // conversation so the user can see the results in chat — not just a
      // notice.  `reviewThreadId` is the same thread the review ran on;
      // the new review turn items are persisted and visible via thread/read.
      if (result?.turn && result.reviewThreadId) {
        const status = result.turn.status;
        if (status === 'completed' || status === 'interrupted') {
          const reviewTitle = t('chat.sessionSettings.modal.codexReviewConversationTitle');
          const conversationId = await this.host.openBackendSessionAsConversation?.(result.reviewThreadId, reviewTitle);
          if (conversationId) {
            // The review conversation is now loaded in chat; close the
            // settings modal so the user sees the results immediately.
            this.activeModal?.close();
            if (status === 'completed') {
              this.host.showNotice(t('chat.sessionSettings.modal.codexReviewOpened'));
            } else {
              const reason = result.turn.error || t('chat.sessionSettings.modal.codexReviewInterrupted');
              this.host.showNotice(reason);
            }
          } else if (status === 'completed') {
            const firstMessage = result.reviewMessages?.[0];
            const base = t('chat.sessionSettings.modal.codexReviewCompleted');
            this.host.showNotice(firstMessage ? `${base}: ${firstMessage.slice(0, 200)}` : base);
          } else {
            const reason = result.turn.error || t('chat.sessionSettings.modal.codexReviewInterrupted');
            this.host.showNotice(reason);
          }
        }
      }
      return result;
    } catch {
      return null;
    }
  }

  private isCodexConversation(
    conversation: Conversation | null | undefined,
  ): boolean {
    return (conversation?.backend ?? 'opencode') === 'codex';
  }
}
