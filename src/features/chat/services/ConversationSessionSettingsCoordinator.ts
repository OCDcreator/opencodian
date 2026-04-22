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

interface ConversationSessionSettingsCompactionApplyResult {
  status: 'applied' | 'deferred' | 'skipped';
  reason?: string;
}

export interface ConversationSessionSettingsCoordinatorHost {
  app: App;
  getCurrentConversation(): Conversation | null;
  getSessionSettingsDefaults(): ResolvedConversationSessionSettings;
  getChatContainerEl(): HTMLElement | null;
  applyCompactionConfig(
    compaction: OpencodeCompactionConfig | null | undefined,
  ): Promise<ConversationSessionSettingsCompactionApplyResult>;
  reapplyCompactionConfigFromProjectConfig?(
    compaction: OpencodeCompactionConfig | null | undefined,
  ): Promise<ConversationSessionSettingsCompactionApplyResult>;
  refreshCurrentSessionState(): Promise<void>;
  getOpencodeConfigManager(): ConversationSessionSettingsConfigPort | null;
  saveConversation(conversation: Conversation): Promise<void>;
  showNotice(message: string): void;
}

interface ApplyConversationRuntimeStateOptions {
  silent?: boolean;
}

export class ConversationSessionSettingsCoordinator {
  private queuedCompactionConfig: OpencodeCompactionConfig | null = null;
  private compactionFlushPromise: Promise<ConversationSessionSettingsCompactionApplyResult> | null = null;
  private lastCompactionApplyResult: ConversationSessionSettingsCompactionApplyResult = {
    status: 'skipped',
  };

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

    try {
      this.lastCompactionApplyResult = await this.queueCompactionConfigApply({
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
    let runtimeApplyDeferred = false;

    if (isCurrentConversation) {
      try {
        await this.applyConversationRuntimeState(conversation, { silent: false });
        runtimeApplyDeferred = this.lastCompactionApplyResult.status === 'deferred';
      } catch (error) {
        runtimeApplyFailed = true;
        logger.warn('Failed to reapply runtime after saving conversation session settings', error);
      }
    }

    this.host.showNotice(
      runtimeApplyFailed
        ? t('chat.sessionSettings.savedRuntimeWarning')
        : runtimeApplyDeferred
          ? t('chat.sessionSettings.savedDeferred')
        : t('chat.sessionSettings.saved'),
    );
  }

  private async queueCompactionConfigApply(
    compaction: OpencodeCompactionConfig,
  ): Promise<ConversationSessionSettingsCompactionApplyResult> {
    this.queuedCompactionConfig = compaction;

    if (this.compactionFlushPromise) {
      return this.compactionFlushPromise;
    }

    this.compactionFlushPromise = (async () => {
      let result: ConversationSessionSettingsCompactionApplyResult = {
        status: 'skipped',
      };
      while (this.queuedCompactionConfig) {
        const nextCompaction = this.queuedCompactionConfig;
        this.queuedCompactionConfig = null;
        result = await this.applyCompactionConfig(nextCompaction);
      }
      return result;
    })().finally(() => {
      this.compactionFlushPromise = null;
    });

    return this.compactionFlushPromise;
  }

  private async applyCompactionConfig(
    compaction: OpencodeCompactionConfig,
  ): Promise<ConversationSessionSettingsCompactionApplyResult> {
    const backendResult = await this.host.applyCompactionConfig(compaction);
    if (backendResult.status === 'applied') {
      await this.host.refreshCurrentSessionState();
      return backendResult;
    }

    const configManager = this.host.getOpencodeConfigManager();
    if (!configManager) {
      return backendResult;
    }

    await configManager.updateCompactionConfig(compaction);
    const projectConfigResult = await this.host.reapplyCompactionConfigFromProjectConfig?.(compaction) ?? {
      status: 'skipped' as const,
    };
    if (projectConfigResult.status === 'applied') {
      await this.host.refreshCurrentSessionState();
      return projectConfigResult;
    }

    return projectConfigResult.status === 'skipped'
      ? backendResult
      : projectConfigResult;
  }
}
