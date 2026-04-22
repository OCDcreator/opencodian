import type { App } from 'obsidian';

import type {
  Conversation,
  ConversationSessionSettings,
} from '../../../core/types';
import {
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
}

export class ConversationSessionSettingsCoordinator {
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
}
