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

function createCoordinator(options?: {
  currentConversation?: Conversation | null;
}) {
  const saveConversation = jest.fn().mockResolvedValue(undefined);
  const host = {
    app: {} as never,
    getCurrentConversation: jest.fn().mockReturnValue(options?.currentConversation ?? null),
    getSessionSettingsDefaults: jest.fn().mockReturnValue({
      chatFontSizePx: 13,
    }),
    getChatContainerEl: jest.fn().mockReturnValue(document.createElement('div')),
    saveConversation,
    showNotice: jest.fn(),
  } as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;

  return {
    coordinator: new ConversationSessionSettingsCoordinator(host),
    host,
  };
}

describe('ConversationSessionSettingsCoordinator display-only session settings', () => {
  it('saves only chatFontSizePx overrides for the current conversation', async () => {
    const conversation = createConversation();
    const { coordinator, host } = createCoordinator({
      currentConversation: conversation,
    });

    await coordinator.saveConversationOverrides(conversation, { chatFontSizePx: 15 });

    expect(host.saveConversation).toHaveBeenCalledWith(expect.objectContaining({
      sessionSettings: { chatFontSizePx: 15 },
    }));
    expect(host.showNotice).toHaveBeenCalledWith('Session settings saved');
  });

  it('applies visual state when saving overrides for the current conversation', async () => {
    const conversation = createConversation();
    const { coordinator, host } = createCoordinator({
      currentConversation: conversation,
    });

    await coordinator.saveConversationOverrides(conversation, { chatFontSizePx: 16 });

    expect(host.getChatContainerEl).toHaveBeenCalled();
    expect(host.showNotice).toHaveBeenCalledWith('Session settings saved');
  });

  it('does not call compaction or backend methods', async () => {
    const conversation = createConversation();
    const { coordinator, host } = createCoordinator({
      currentConversation: conversation,
    });

    await coordinator.saveConversationOverrides(conversation, { chatFontSizePx: 14 });

    expect(host.saveConversation).toHaveBeenCalledTimes(1);
    expect(host.showNotice).toHaveBeenCalledTimes(1);
  });
});
