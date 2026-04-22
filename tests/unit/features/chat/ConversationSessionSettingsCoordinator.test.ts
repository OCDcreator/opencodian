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
    const saveConversation = jest.fn().mockResolvedValue(undefined);
    const host = {
      app: {} as never,
      getCurrentConversation: jest.fn().mockReturnValue(options?.currentConversation ?? null),
      getSessionSettingsDefaults: jest.fn().mockReturnValue({
        chatFontSizePx: 13,
      }),
      getChatContainerEl: jest.fn().mockReturnValue(chatContainerEl),
      saveConversation,
      showNotice: jest.fn(),
    } as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;

    return {
      coordinator: new ConversationSessionSettingsCoordinator(host),
      host,
      chatContainerEl,
      saveConversation,
    };
  }

  it('resolves effective settings from conversation overrides and applies them to runtime state', async () => {
    const conversation = createConversation({
      chatFontSizePx: 15,
    });
    const {
      coordinator,
      chatContainerEl,
    } = createCoordinator({
      currentConversation: conversation,
    });

    const effective = await coordinator.applyConversationRuntimeState(conversation);

    expect(effective).toEqual({
      chatFontSizePx: 15,
    });
    expect(chatContainerEl.style.getPropertyValue('--opencodian-chat-font-size')).toBe('15px');
  });

  it('falls back to global defaults when overrides inherit', async () => {
    const conversation = createConversation({
      chatFontSizePx: null,
    });
    const { coordinator, chatContainerEl } = createCoordinator({
      currentConversation: conversation,
    });

    const effective = await coordinator.applyConversationRuntimeState(conversation);

    expect(effective).toEqual({
      chatFontSizePx: 13,
    });
    expect(chatContainerEl.style.getPropertyValue('--opencodian-chat-font-size')).toBe('13px');
  });

  it('persists normalized conversation overrides and reapplies the active runtime state', async () => {
    const conversation = createConversation();
    const { coordinator, saveConversation, host } = createCoordinator({
      currentConversation: conversation,
    });

    await coordinator.saveConversationOverrides(conversation, {
      chatFontSizePx: 14,
    });

    expect(conversation.sessionSettings).toEqual({
      chatFontSizePx: 14,
    });
    expect(conversation.updatedAt).toBeGreaterThan(1);
    expect(saveConversation).toHaveBeenCalledWith(conversation);
    expect(host.showNotice).toHaveBeenCalledWith('Session settings saved');
  });

  it('drops empty inherit-only overrides before saving', async () => {
    const conversation = createConversation({
      chatFontSizePx: 15,
    });
    const { coordinator, saveConversation } = createCoordinator({
      currentConversation: conversation,
    });

    await coordinator.saveConversationOverrides(conversation, {
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
