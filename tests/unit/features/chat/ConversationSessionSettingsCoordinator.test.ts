import type {
  Conversation,
  ConversationSessionSettings,
} from '../../../../src/core/types';
import {
  ConversationSessionSettingsCoordinator,
  type ConversationSessionSettingsCoordinatorHost,
} from '../../../../src/features/chat/services/ConversationSessionSettingsCoordinator';

function createConversation(
  overrides?: ConversationSessionSettings,
): Conversation {
  return {
    id: 'conversation-1',
    title: 'Session Settings',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages: [],
    sessionSettings: overrides,
  };
}

describe('ConversationSessionSettingsCoordinator', () => {
  function createCoordinator(options?: {
    currentConversation?: Conversation | null;
  }) {
    const chatContainerEl = document.createElement('div');
    const updateCompactionConfig = jest.fn().mockResolvedValue(undefined);
    const saveConversation = jest.fn().mockResolvedValue(undefined);
    const host: jest.Mocked<ConversationSessionSettingsCoordinatorHost> = {
      app: {} as never,
      getCurrentConversation: jest.fn().mockReturnValue(options?.currentConversation ?? null),
      getSessionSettingsDefaults: jest.fn().mockReturnValue({
        autoCompactionEnabled: true,
        compactionReservedTokens: 10_000,
        chatFontSizePx: 13,
      }),
      getChatContainerEl: jest.fn().mockReturnValue(chatContainerEl),
      getOpencodeConfigManager: jest.fn().mockReturnValue({
        updateCompactionConfig,
      }),
      saveConversation,
      showNotice: jest.fn(),
    };

    return {
      coordinator: new ConversationSessionSettingsCoordinator(host),
      host,
      chatContainerEl,
      updateCompactionConfig,
      saveConversation,
    };
  }

  it('resolves effective settings from conversation overrides and applies them to runtime state', async () => {
    const conversation = createConversation({
      autoCompactionEnabled: false,
      compactionReservedTokens: 16_000,
      chatFontSizePx: 15,
    });
    const { coordinator, chatContainerEl, updateCompactionConfig } = createCoordinator({
      currentConversation: conversation,
    });

    const effective = await coordinator.applyConversationRuntimeState(conversation, {
      silent: false,
    });

    expect(effective).toEqual({
      autoCompactionEnabled: false,
      compactionReservedTokens: 16_000,
      chatFontSizePx: 15,
    });
    expect(chatContainerEl.style.getPropertyValue('--opencodian-chat-font-size')).toBe('15px');
    expect(updateCompactionConfig).toHaveBeenCalledWith({
      auto: false,
      reserved: 16_000,
    });
  });

  it('falls back to global defaults when overrides inherit', async () => {
    const conversation = createConversation({
      autoCompactionEnabled: null,
      compactionReservedTokens: null,
      chatFontSizePx: null,
    });
    const { coordinator, chatContainerEl, updateCompactionConfig } = createCoordinator({
      currentConversation: conversation,
    });

    const effective = await coordinator.applyConversationRuntimeState(conversation, {
      silent: false,
    });

    expect(effective).toEqual({
      autoCompactionEnabled: true,
      compactionReservedTokens: 10_000,
      chatFontSizePx: 13,
    });
    expect(chatContainerEl.style.getPropertyValue('--opencodian-chat-font-size')).toBe('13px');
    expect(updateCompactionConfig).toHaveBeenCalledWith({
      auto: true,
      reserved: 10_000,
    });
  });

  it('persists normalized conversation overrides and reapplies the active runtime state', async () => {
    const conversation = createConversation();
    const { coordinator, saveConversation, host, updateCompactionConfig } = createCoordinator({
      currentConversation: conversation,
    });

    await coordinator.saveConversationOverrides(conversation, {
      autoCompactionEnabled: false,
      compactionReservedTokens: 15_500.2,
      chatFontSizePx: null,
    });

    expect(conversation.sessionSettings).toEqual({
      autoCompactionEnabled: false,
      compactionReservedTokens: 15_500,
      chatFontSizePx: null,
    });
    expect(conversation.updatedAt).toBeGreaterThan(1);
    expect(saveConversation).toHaveBeenCalledWith(conversation);
    expect(updateCompactionConfig).toHaveBeenCalledWith({
      auto: false,
      reserved: 15_500,
    });
    expect(host.showNotice).toHaveBeenCalledWith('Session settings saved');
  });

  it('drops empty inherit-only overrides before saving', async () => {
    const conversation = createConversation({
      autoCompactionEnabled: false,
    });
    const { coordinator, saveConversation } = createCoordinator({
      currentConversation: conversation,
    });

    await coordinator.saveConversationOverrides(conversation, {
      autoCompactionEnabled: null,
      compactionReservedTokens: null,
      chatFontSizePx: null,
    });

    expect(conversation.sessionSettings).toBeUndefined();
    expect(saveConversation).toHaveBeenCalledWith(conversation);
  });

  it('shows a notice when opening session settings without an active conversation', () => {
    const { coordinator, host } = createCoordinator({
      currentConversation: null,
    });

    coordinator.openCurrentConversationSettings();

    expect(host.showNotice).toHaveBeenCalledWith('Open a conversation first');
  });
});
