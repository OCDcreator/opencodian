import type { Conversation } from '../../../../src/core/types';
import {
  ConversationSessionSettingsCoordinator,
  type ConversationSessionSettingsCoordinatorHost,
} from '../../../../src/features/chat/services/ConversationSessionSettingsCoordinator';

jest.mock('../../../../src/features/chat/ui/ConversationSessionSettingsModal', () => ({
  ConversationSessionSettingsModal: jest.fn().mockImplementation((_app, options) => ({
    close: jest.fn(),
    open: jest.fn(),
    options,
  })),
}));

function createConversation(): Conversation {
  return {
    id: 'conversation-1',
    title: 'Experimental actions',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages: [],
  };
}

function latestModalOptions(): { onOpenExperimentalActions?: () => void } {
  return (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
    .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];
}

describe('ConversationSessionSettingsCoordinator experimental actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes the launcher only for an OpenCode conversation with an available action', async () => {
    const conversation = createConversation();
    const openExperimentalActions = jest.fn();
    const host = {
      app: {} as never,
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
      getSessionSettingsDefaults: jest.fn().mockReturnValue({ chatFontSizePx: 13 }),
      getChatContainerEl: jest.fn().mockReturnValue(document.createElement('div')),
      saveConversation: jest.fn().mockResolvedValue(undefined),
      showNotice: jest.fn(),
      supportsSessionSharing: jest.fn().mockReturnValue(false),
      supportsCompaction: jest.fn().mockReturnValue(false),
      canOpenExperimentalActions: jest.fn().mockReturnValue(true),
      openExperimentalActions,
    } as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;
    const coordinator = new ConversationSessionSettingsCoordinator(host);

    await coordinator.openCurrentConversationSettings();
    expect(latestModalOptions().onOpenExperimentalActions).toEqual(expect.any(Function));

    latestModalOptions().onOpenExperimentalActions?.();
    expect(openExperimentalActions).toHaveBeenCalledTimes(1);

    conversation.backend = 'claude-code';
    await coordinator.openCurrentConversationSettings();
    expect(latestModalOptions().onOpenExperimentalActions).toBeUndefined();
  });
});
