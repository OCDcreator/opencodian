import type { App } from 'obsidian';

import { readBackendSessionShareUrl } from '../../../core/agents/backend/AgentBackendRouting';
import type { AgentServiceRegistry } from '../../../core/agents/backend/AgentServiceRegistry';
import type {
  Conversation,
  ConversationSessionSettings,
  OpencodeShareMode,
} from '../../../core/types';
import {
  getConversationBackendSessionId,
  normalizeConversationSessionSettings,
} from '../../../core/types';
import type { CodexReasoningEffort, CodexSandboxMode } from '../../../core/types/settings';
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
  /** Whether to show session sharing controls. Defaults to false. */
  supportsSessionSharing?(): boolean;
  /** Whether to show title-generation summary rows. OpenCode conversations default to true. */
  supportsTitleGeneration?(): boolean;
  /** Whether to show compaction summary row. Defaults to false. */
  supportsCompaction?(): boolean;
  /** Whether to show question-card summary rows. OpenCode conversations default to true. */
  supportsQuestions?(): boolean;
  /** Returns Codex global defaults. Only called for Codex conversations. */
  getCodexGlobalDefaults?(): { sandboxMode: CodexSandboxMode; modelReasoningEffort: CodexReasoningEffort; model: string; additionalDirectories: string[]; networkAccessEnabled: boolean };
  /** Pushes Codex runtime overrides to the live adapter for the active conversation. */
  applyCodexRuntimeOverrides?(overrides: { sandboxMode: CodexSandboxMode; modelReasoningEffort: CodexReasoningEffort; model?: string; additionalDirectories?: string[]; networkAccessEnabled?: boolean }): void;
  /**
   * Optional registry for backend-aware session detail reads.
   * When provided, share-URL reads route through the registry instead of
   * falling back to `openCodeService.listSessions()`.
   */
  agentServiceRegistry?: AgentServiceRegistry;
}

export class ConversationSessionSettingsCoordinator {
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
    const isCodex = this.isCodexConversation(conversation);
    const codexDefaults = isCodex ? this.host.getCodexGlobalDefaults?.() : undefined;

    const sessionId = getConversationBackendSessionId(conversation);
    const shareUrl = showSharing && sessionId ? await this.getCurrentShareUrl(conversation, sessionId) : undefined;
    const shareMode = showSharing ? await this.getProjectShareMode() : undefined;

    new ConversationSessionSettingsModal(this.host.app, {
      conversationTitle: conversation.title || t('chat.history.untitled'),
      defaults: {
        ...this.resolveEffectiveSettings(conversation),
      ...(codexDefaults ? {
        codexSandboxMode: codexDefaults.sandboxMode,
        codexModelReasoningEffort: codexDefaults.modelReasoningEffort,
        codexModelOverride: codexDefaults.model,
        codexAdditionalDirectories: codexDefaults.additionalDirectories,
        codexNetworkAccessEnabled: codexDefaults.networkAccessEnabled,
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
    }).open();
  }

  private shouldShowTitleSummary(conversation: Conversation): boolean {
    const hostSupport = this.host.supportsTitleGeneration?.();
    if (hostSupport !== undefined) {
      return hostSupport;
    }
    return (conversation.backend ?? 'opencode') === 'opencode';
  }

  private shouldShowQuestionsSummary(conversation: Conversation): boolean {
    const hostSupport = this.host.supportsQuestions?.();
    if (hostSupport !== undefined) {
      return hostSupport;
    }
    return (conversation.backend ?? 'opencode') === 'opencode';
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
      });
    }

    return effective;
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

  private isCodexConversation(
    conversation: Conversation | null | undefined,
  ): boolean {
    return (conversation?.backend ?? 'opencode') === 'codex';
  }
}
