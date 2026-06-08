import fs from 'node:fs';
import path from 'node:path';

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

  it('returns null shareUrl when no registry and no host.listSessions', async () => {
    // After removing the openCodeService.listSessions fallback, the
    // coordinator should return null rather than reaching through to
    // openCodeService for session reads.
    const conversation = createConversation();
    const host = {
      app: {} as never,
      getCurrentConversation: jest.fn().mockReturnValue(conversation),
      getSessionSettingsDefaults: jest.fn().mockReturnValue({ chatFontSizePx: 13 }),
      getChatContainerEl: jest.fn().mockReturnValue(document.createElement('div')),
      saveConversation: jest.fn().mockResolvedValue(undefined),
      showNotice: jest.fn(),
      shareSession: jest.fn().mockResolvedValue({ share: { url: 'https://opencode.ai/s/session-1' } }),
      unshareSession: jest.fn().mockResolvedValue({ share: undefined }),
      // No listSessions — coordinator must not fall through to openCodeService.
      copyText: jest.fn().mockResolvedValue(undefined),
      getProjectShareMode: jest.fn().mockResolvedValue(undefined),
      supportsSessionSharing: jest.fn().mockReturnValue(true),
      supportsCompaction: jest.fn().mockReturnValue(false),
      // No agentServiceRegistry, no listSessions.
    } as jest.Mocked<ConversationSessionSettingsCoordinatorHost>;

    const coordinator = new ConversationSessionSettingsCoordinator(host);
    await coordinator.openCurrentConversationSettings();
    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    expect(modalOptions.shareUrl).toBeNull();
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

  it('does not share a Claude Code backend session from modal actions even when sharing is forced visible', async () => {
    const conversation = createConversation();
    conversation.backend = 'claude-code';
    conversation.backendSessionId = 'claude-session-1';
    delete conversation.openCodeSessionId;
    const { coordinator, host } = createCoordinator({
      currentConversation: conversation,
      supportsSessionSharing: true,
    });

    await coordinator.openCurrentConversationSettings();
    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    let caughtError: unknown;
    try {
      await modalOptions.onShare();
    } catch (error) {
      caughtError = error;
    }

    expect(host.shareSession).not.toHaveBeenCalled();
    expect(host.copyText).not.toHaveBeenCalled();
    expect(caughtError).toEqual(expect.any(Error));
    expect((caughtError as Error).message).toContain(
      'OpenCode could not create a share link.',
    );
  });

  it('does not unshare a Claude Code backend session from modal actions even when sharing is forced visible', async () => {
    const conversation = createConversation();
    conversation.backend = 'claude-code';
    conversation.backendSessionId = 'claude-session-1';
    delete conversation.openCodeSessionId;
    const { coordinator, host } = createCoordinator({
      currentConversation: conversation,
      supportsSessionSharing: true,
    });

    await coordinator.openCurrentConversationSettings();
    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    let caughtError: unknown;
    try {
      await modalOptions.onUnshare();
    } catch (error) {
      caughtError = error;
    }

    expect(host.unshareSession).not.toHaveBeenCalled();
    expect(caughtError).toEqual(expect.any(Error));
    expect((caughtError as Error).message).toContain(
      'OpenCode session sharing is not available yet.',
    );
  });
});

describe('ConversationSessionSettingsCoordinator Session-import audit', () => {
  const coordinatorPath = path.resolve(
    __dirname,
    '../../../../src/features/chat/services/ConversationSessionSettingsCoordinator.ts',
  );
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(coordinatorPath, 'utf-8');
  });

  it('does not import Session from OpenCodeSessionLifecycleCoordinator', () => {
    // The coordinator should not carry a typed dependency on the OpenCode Session
    // shape just for share-URL reads.  The productionized read path uses
    // readBackendSessionShareUrl (which is already Session-free) and the legacy
    // fallback should use a minimal inspection-only local type.
    expect(source).not.toMatch(
      /import\s+.*\{[^}]*Session[^}]*\}\s+from\s+['"].*OpenCodeSessionLifecycleCoordinator/,
    );
  });

  it('does not reference Session as a typed parameter or return in the read path', () => {
    // listSessions host method and getShareUrl should not mention Session type.
    // They should use a minimal inspection-only shape or `unknown`.
    const lines = source.split('\n');
    const listSessionsLine = lines.findIndex((l) => l.includes('listSessions?'));
    expect(listSessionsLine).toBeGreaterThanOrEqual(0);
    expect(lines[listSessionsLine]).not.toContain(': Promise<Session[]');
    const getShareUrlLine = lines.findIndex((l) =>
      l.includes('getShareUrl(') && l.includes('Session'),
    );
    expect(getShareUrlLine).toBe(-1);
  });

  it('legacy fallback listSessions returns a minimal inspection-only shape', async () => {
    // When no registry is provided, the legacy path calls host.listSessions()
    // and reads only .id and .share.url — the host interface should express
    // this with a minimal inspection type, not Session[].
    const conversation = createConversation();
    const { coordinator, host } = createCoordinator({
      currentConversation: conversation,
      supportsSessionSharing: true,
    });

    // Return minimal inspection objects — only id and share, no full Session fields
    host.listSessions.mockResolvedValue([
      { id: 'session-1', share: { url: 'https://opencode.ai/s/session-1' } },
    ] as never);

    await coordinator.openCurrentConversationSettings();
    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    expect(host.listSessions).toHaveBeenCalled();
    expect(modalOptions.shareUrl).toBe('https://opencode.ai/s/session-1');
  });

  it('share and unshare write paths return minimal inspection shapes without Session', async () => {
    // share/unshare are OpenCode-only writes, but the coordinator should use
    // a minimal inspection-only return type for extracting share.url, not the
    // full OpenCode Session type.
    const conversation = createConversation();
    const { coordinator, host } = createCoordinator({
      currentConversation: conversation,
      supportsSessionSharing: true,
    });

    // shareSession returns a minimal object with share.url
    (host.shareSession as jest.Mock).mockResolvedValue({
      share: { url: 'https://opencode.ai/s/new-share' },
    });

    await coordinator.openCurrentConversationSettings();
    const modalOptions = (jest.requireMock('../../../../src/features/chat/ui/ConversationSessionSettingsModal')
      .ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];

    await modalOptions.onShare();

    expect(host.shareSession).toHaveBeenCalledWith('session-1');
    expect(host.copyText).toHaveBeenCalledWith('https://opencode.ai/s/new-share');
  });
});
