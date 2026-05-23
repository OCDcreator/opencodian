import { readBackendSessionShareUrl } from '../../../../src/core/agents/backend/AgentBackendRouting';
import type {
  Conversation,
  ConversationSessionSettings,
} from '../../../../src/core/types';
import {
  ConversationSessionSettingsCoordinator,
  type ConversationSessionSettingsCoordinatorHost,
} from '../../../../src/features/chat/services/ConversationSessionSettingsCoordinator';

jest.mock('../../../../src/core/agents/backend/AgentBackendRouting', () => ({
  readBackendSessionShareUrl: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../../src/features/chat/ui/ConversationSessionSettingsModal', () => ({
  ConversationSessionSettingsModal: jest.fn().mockImplementation((_app, options) => ({
    open: jest.fn(),
    options,
  })),
}));

const mockedReadBackendSessionShareUrl = jest.mocked(readBackendSessionShareUrl);

function createConversation(overrides?: ConversationSessionSettings): Conversation {
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
  supportsSessionSharing?: boolean;
  agentServiceRegistry?: unknown;
}) {
  const host = {
    app: {} as never,
    getCurrentConversation: jest.fn().mockReturnValue(options?.currentConversation ?? null),
    getSessionSettingsDefaults: jest.fn().mockReturnValue({
      chatFontSizePx: 13,
    }),
    getChatContainerEl: jest.fn().mockReturnValue(document.createElement('div')),
    saveConversation: jest.fn().mockResolvedValue(undefined),
    showNotice: jest.fn(),
    shareSession: jest.fn().mockResolvedValue({ share: { url: 'https://opencode.ai/s/session-1' } }),
    unshareSession: jest.fn().mockResolvedValue({ share: undefined }),
    listSessions: jest.fn().mockResolvedValue([]),
    copyText: jest.fn().mockResolvedValue(undefined),
    getProjectShareMode: jest.fn().mockResolvedValue(undefined),
    supportsSessionSharing: jest.fn().mockReturnValue(options?.supportsSessionSharing ?? false),
    supportsCompaction: jest.fn().mockReturnValue(false),
    agentServiceRegistry: options?.agentServiceRegistry as ConversationSessionSettingsCoordinatorHost['agentServiceRegistry'],
  } as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;

  return {
    coordinator: new ConversationSessionSettingsCoordinator(host),
    host,
  };
}

describe('ConversationSessionSettingsCoordinator share URL routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes share-URL read through readBackendSessionShareUrl when registry is present', async () => {
    const conversation = createConversation();
    const mockRegistry = { get: jest.fn(), getActive: jest.fn() } as never;
    mockedReadBackendSessionShareUrl.mockResolvedValue('https://opencode.ai/s/session-1');
    const { coordinator } = createCoordinator({
      currentConversation: conversation,
      supportsSessionSharing: true,
      agentServiceRegistry: mockRegistry,
    });

    await coordinator.openCurrentConversationSettings();
    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    expect(mockedReadBackendSessionShareUrl).toHaveBeenCalledWith(
      mockRegistry,
      conversation,
      'session-1',
    );
    expect(modalOptions.shareUrl).toBe('https://opencode.ai/s/session-1');
  });

  it('falls back to host.listSessions when no registry is provided', async () => {
    const conversation = createConversation();
    const { coordinator, host } = createCoordinator({
      currentConversation: conversation,
      supportsSessionSharing: true,
    });
    host.listSessions.mockResolvedValue([
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

    expect(mockedReadBackendSessionShareUrl).not.toHaveBeenCalled();
    expect(host.listSessions).toHaveBeenCalled();
    expect(modalOptions.shareUrl).toBe('https://opencode.ai/s/session-1');
  });

  it('returns null shareUrl when registry read returns null', async () => {
    const conversation = createConversation();
    const mockRegistry = { get: jest.fn(), getActive: jest.fn() } as never;
    mockedReadBackendSessionShareUrl.mockResolvedValue(null);
    const { coordinator } = createCoordinator({
      currentConversation: conversation,
      supportsSessionSharing: true,
      agentServiceRegistry: mockRegistry,
    });

    await coordinator.openCurrentConversationSettings();
    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    expect(modalOptions.shareUrl).toBeNull();
  });

  it('uses registry routing for Claude conversations and returns null', async () => {
    const conversation = createConversation();
    const mockRegistry = { get: jest.fn(), getActive: jest.fn() } as never;

    conversation.backend = 'claude-code';
    conversation.backendSessionId = 'claude-session';
    delete conversation.openCodeSessionId;
    mockedReadBackendSessionShareUrl.mockResolvedValue(null);

    const { coordinator } = createCoordinator({
      currentConversation: conversation,
      supportsSessionSharing: true,
      agentServiceRegistry: mockRegistry,
    });

    await coordinator.openCurrentConversationSettings();
    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    expect(mockedReadBackendSessionShareUrl).toHaveBeenCalledWith(
      mockRegistry,
      conversation,
      'claude-session',
    );
    expect(modalOptions.shareUrl).toBeNull();
  });
});
