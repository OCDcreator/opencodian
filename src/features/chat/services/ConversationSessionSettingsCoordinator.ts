import type { App } from 'obsidian';

import type { Session } from '../../../core/opencode/OpenCodeSessionLifecycleCoordinator';
import type {
  Conversation,
  ConversationSessionSettings,
  OpencodeShareMode,
} from '../../../core/types';
import {
  getConversationBackendSessionId,
  normalizeConversationSessionSettings,
} from '../../../core/types';
import { t } from '../../../i18n';
import {
  ConversationSessionSettingsModal,
} from '../ui/ConversationSessionSettingsModal';

export interface ResolvedConversationSessionSettings {
  chatFontSizePx: number;
}

export interface ConversationSessionSettingsCoordinatorHost {
  app: App;
  getCurrentConversation(): Conversation | null;
  getSessionSettingsDefaults(): ResolvedConversationSessionSettings;
  getChatContainerEl(): HTMLElement | null;
  saveConversation(conversation: Conversation): Promise<void>;
  showNotice(message: string): void;
  shareSession?(sessionId: string): Promise<Session>;
  unshareSession?(sessionId: string): Promise<Session>;
  listSessions?(): Promise<Session[]>;
  copyText?(text: string): Promise<void>;
  getProjectShareMode?(): Promise<OpencodeShareMode | undefined>;
  /** Whether to show session sharing controls. Defaults to false. */
  supportsSessionSharing?(): boolean;
  /** Whether to show compaction summary row. Defaults to false. */
  supportsCompaction?(): boolean;
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

    const sessionId = getConversationBackendSessionId(conversation);
    const shareUrl = showSharing && sessionId ? await this.getCurrentShareUrl(sessionId) : undefined;
    const shareMode = showSharing ? await this.getProjectShareMode() : undefined;

    new ConversationSessionSettingsModal(this.host.app, {
      conversationTitle: conversation.title || t('chat.history.untitled'),
      defaults: this.resolveEffectiveSettings(conversation),
      initialOverrides: conversation.sessionSettings,
      showCompactionSummary: showCompaction,
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

  private async getCurrentShareUrl(sessionId: string): Promise<string | null> {
    try {
      const sessions = this.host.listSessions
        ? await this.host.listSessions()
        : await this.resolveOpenCodeService().listSessions?.() ?? [];
      return this.getShareUrl(sessions.find((session) => session.id === sessionId) ?? null);
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
    return {
      chatFontSizePx:
        overrides?.chatFontSizePx ?? defaults.chatFontSizePx,
    };
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
    return this.applyConversationVisualState(conversation);
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
      this.applyConversationVisualState(conversation);
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
    const sessionId = getConversationBackendSessionId(conversation);
    if (!sessionId) {
      throw new Error(t('chat.sessionSharing.shareFailed'));
    }
    let session: Session;
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
    const sessionId = getConversationBackendSessionId(conversation);
    if (!sessionId) {
      throw new Error(t('chat.sessionSharing.serviceUnavailable'));
    }
    await this.unshareSession(sessionId);
    this.host.showNotice(t('chat.sessionSharing.unshared'));
  }

  private async shareSession(sessionId: string): Promise<Session> {
    if (this.host.shareSession) {
      return this.host.shareSession(sessionId);
    }
    return this.resolveOpenCodeService().shareSession(sessionId);
  }

  private async unshareSession(sessionId: string): Promise<Session> {
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
    listSessions?(): Promise<Session[]>;
    shareSession(sessionId: string): Promise<Session>;
    unshareSession(sessionId: string): Promise<Session>;
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
      listSessions?(): Promise<Session[]>;
      shareSession(sessionId: string): Promise<Session>;
      unshareSession(sessionId: string): Promise<Session>;
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
          listSessions?(): Promise<Session[]>;
          shareSession(sessionId: string): Promise<Session>;
          unshareSession(sessionId: string): Promise<Session>;
        };
      }
      | undefined;
  }

  private getShareUrl(session: Session | null): string | null {
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
}
