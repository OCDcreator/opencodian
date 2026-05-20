import type {
  Conversation,
  ConversationSessionSettings,
} from '../../../../src/core/types';
import {
  ConversationSessionSettingsCoordinator,
  type ConversationSessionSettingsCoordinatorHost,
} from '../../../../src/features/chat/services/ConversationSessionSettingsCoordinator';

jest.mock('../../../../src/features/chat/ui/ConversationSessionSettingsModal', () => ({
  ConversationSessionSettingsModal: jest.fn().mockImplementation((_app, options) => ({
    open: jest.fn(),
    options,
  })),
}));

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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createCoordinator(options?: {
    currentConversation?: Conversation | null;
    projectShareMode?: 'manual' | 'auto' | 'disabled';
    supportsSessionSharing?: boolean;
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
      shareSession: jest.fn().mockResolvedValue({ share: { url: 'https://opencode.ai/s/session-1' } }),
      unshareSession: jest.fn().mockResolvedValue({ share: undefined }),
      listSessions: jest.fn().mockResolvedValue([]),
      copyText: jest.fn().mockResolvedValue(undefined),
      getProjectShareMode: jest.fn().mockResolvedValue(options?.projectShareMode),
      supportsSessionSharing: jest.fn().mockReturnValue(options?.supportsSessionSharing ?? false),
      supportsCompaction: jest.fn().mockReturnValue(false),
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

  it('previews session font overrides without mutating or saving the conversation', async () => {
    const conversation = createConversation({
      chatFontSizePx: 15,
    });
    const { coordinator, chatContainerEl, saveConversation } = createCoordinator({
      currentConversation: conversation,
    });

    await coordinator.openCurrentConversationSettings();
    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    modalOptions.onPreview({ chatFontSizePx: 18 });

    expect(chatContainerEl.style.getPropertyValue('--opencodian-chat-font-size')).toBe('18px');
    expect(conversation.sessionSettings).toEqual({ chatFontSizePx: 15 });
    expect(saveConversation).not.toHaveBeenCalled();

    modalOptions.onCancelPreview();

    expect(chatContainerEl.style.getPropertyValue('--opencodian-chat-font-size')).toBe('15px');
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

  it('shares and unshares the current OpenCode session from modal actions', async () => {
    const conversation = createConversation();
    const { coordinator, host } = createCoordinator({
      currentConversation: conversation,
      supportsSessionSharing: true,
    });

    await coordinator.openCurrentConversationSettings();
    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    await modalOptions.onShare();
    await modalOptions.onUnshare();

    expect(host.shareSession).toHaveBeenCalledWith('session-1');
    expect(host.copyText).toHaveBeenCalledWith('https://opencode.ai/s/session-1');
    expect(host.unshareSession).toHaveBeenCalledWith('session-1');
    expect(host.showNotice).toHaveBeenCalledWith('Share link copied');
    expect(host.showNotice).toHaveBeenCalledWith('Session sharing canceled');
  });

  it('passes the current session share URL into the modal when the session is already shared', async () => {
    const conversation = createConversation();
    const { coordinator, host } = createCoordinator({
      currentConversation: conversation,
      supportsSessionSharing: true,
    });
    (host.listSessions as jest.Mock).mockResolvedValue([
      {
        id: 'session-1',
        title: 'Shared session',
        share: { url: 'https://opencode.ai/s/session-1' },
        time: { created: 1, updated: 2 },
      },
    ]);

    await coordinator.openCurrentConversationSettings();
    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    expect(modalOptions.shareUrl).toBe('https://opencode.ai/s/session-1');
  });

  it('passes disabled project share mode into the modal', async () => {
    const conversation = createConversation();
    const { coordinator } = createCoordinator({
      currentConversation: conversation,
      projectShareMode: 'disabled',
      supportsSessionSharing: true,
    });

    await coordinator.openCurrentConversationSettings();
    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    expect(modalOptions.shareMode).toBe('disabled');
  });

  it('hides OpenCode-only summaries for Claude Code conversations without host support', async () => {
    const conversation = createConversation();
    conversation.backend = 'claude-code';
    conversation.backendSessionId = 'claude-code-session';
    delete conversation.openCodeSessionId;
    const { coordinator } = createCoordinator({
      currentConversation: conversation,
    });

    await coordinator.openCurrentConversationSettings();
    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    expect(modalOptions.showTitleSummary).toBe(false);
    expect(modalOptions.showQuestionsSummary).toBe(false);
    expect(modalOptions.showCompactionSummary).toBe(false);
  });

  it('normalizes OpenCode share 500 failures into user-facing guidance', async () => {
    const conversation = createConversation();
    const { coordinator, host } = createCoordinator({
      currentConversation: conversation,
      supportsSessionSharing: true,
    });
    (host.shareSession as jest.Mock).mockRejectedValue(new Error('Request failed, status 500'));

    await coordinator.openCurrentConversationSettings();
    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    await expect(modalOptions.onShare()).rejects.toThrow(
      'OpenCode could not create a share link.',
    );
  });
});
