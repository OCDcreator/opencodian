import type { App } from 'obsidian';

import type {
  Conversation,
  ConversationSessionSettings,
  OpencodeCompactionConfig,
} from '../../../core/types';
import {
  normalizeConversationSessionSettings,
} from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import {
  ConversationSessionSettingsModal,
} from '../ui/ConversationSessionSettingsModal';

const logger = createLogger('ConversationSessionSettingsCoordinator');

export interface ResolvedConversationSessionSettings {
  autoCompactionEnabled: boolean;
  compactionReservedTokens: number;
  chatFontSizePx: number;
}

interface ConversationSessionSettingsConfigPort {
  updateCompactionConfig(
    compaction: OpencodeCompactionConfig | null | undefined,
  ): Promise<void>;
}

export interface ConversationSessionSettingsCoordinatorHost {
  app: App;
  getCurrentConversation(): Conversation | null;
  getSessionSettingsDefaults(): ResolvedConversationSessionSettings;
  getChatContainerEl(): HTMLElement | null;
  getOpencodeConfigManager(): ConversationSessionSettingsConfigPort | null;
  saveConversation(conversation: Conversation): Promise<void>;
  showNotice(message: string): void;
}

interface ApplyConversationRuntimeStateOptions {
  silent?: boolean;
}

export class ConversationSessionSettingsCoordinator {
  private queuedCompactionConfig: OpencodeCompactionConfig | null = null;
  private compactionFlushPromise: Promise<void> | null = null;

  constructor(private readonly host: ConversationSessionSettingsCoordinatorHost) {}

  openCurrentConversationSettings(): void {
    const conversation = this.host.getCurrentConversation();
    if (!conversation) {
      this.host.showNotice(t('chat.sessionSettings.noConversation'));
      return;
    }

    new ConversationSessionSettingsModal(this.host.app, {
      conversationTitle: conversation.title || t('chat.history.untitled'),
      defaults: this.resolveEffectiveSettings(conversation),
      initialOverrides: conversation.sessionSettings,
      onSave: async (overrides) => {
        await this.saveConversationOverrides(conversation, overrides);
      },
    }).open();
  }

  resolveEffectiveSettings(
    conversation: Conversation | null | undefined,
  ): ResolvedConversationSessionSettings {
    const defaults = this.host.getSessionSettingsDefaults();
    const overrides = conversation?.sessionSettings;
    return {
      autoCompactionEnabled:
        overrides?.autoCompactionEnabled ?? defaults.autoCompactionEnabled,
      compactionReservedTokens:
        overrides?.compactionReservedTokens ?? defaults.compactionReservedTokens,
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
    options: ApplyConversationRuntimeStateOptions = {},
  ): Promise<ResolvedConversationSessionSettings> {
    const effective = this.applyConversationVisualState(conversation);
    const configManager = this.host.getOpencodeConfigManager();
    if (!configManager) {
      return effective;
    }

    try {
      await this.queueCompactionConfigWrite(configManager, {
        auto: effective.autoCompactionEnabled,
        reserved: effective.compactionReservedTokens,
      });
    } catch (error) {
      logger.warn('Failed to apply conversation session runtime state', error);
      if (!options.silent) {
        throw error;
      }
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
    let runtimeApplyFailed = false;

    if (isCurrentConversation) {
      try {
        await this.applyConversationRuntimeState(conversation, { silent: false });
      } catch (error) {
        runtimeApplyFailed = true;
        logger.warn('Failed to reapply runtime after saving conversation session settings', error);
      }
    }

    this.host.showNotice(
      runtimeApplyFailed
        ? t('chat.sessionSettings.savedRuntimeWarning')
        : t('chat.sessionSettings.saved'),
    );
  }

  private async queueCompactionConfigWrite(
    configManager: ConversationSessionSettingsConfigPort,
    compaction: OpencodeCompactionConfig,
  ): Promise<void> {
    this.queuedCompactionConfig = compaction;

    if (this.compactionFlushPromise) {
      await this.compactionFlushPromise;
      return;
    }

    this.compactionFlushPromise = (async () => {
      while (this.queuedCompactionConfig) {
        const nextCompaction = this.queuedCompactionConfig;
        this.queuedCompactionConfig = null;
        await configManager.updateCompactionConfig(nextCompaction);
      }
    })().finally(() => {
      this.compactionFlushPromise = null;
    });

    await this.compactionFlushPromise;
  }
}
