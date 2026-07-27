import type { ConversationNoticeCoordinatorHost } from '../../../../src/features/chat/services/ConversationNoticeCoordinator';
import { ConversationNoticeCoordinator } from '../../../../src/features/chat/services/ConversationNoticeCoordinator';
import { t } from '../../../../src/i18n';

const mockGetCurrentSessionModel = jest.fn();
const mockFormatModelId = jest.fn();
const mockIsConversationRewound = jest.fn();
const mockGetActiveTabId = jest.fn();
const mockGetSessionDiff = jest.fn();
const mockGetCachedSessionDiffEntries = jest.fn();
const mockAppendPersistentNotice = jest.fn();
const mockRenderBackgroundTaskIndicatorIfNeeded = jest.fn();
const mockHandleRestoreRewindRequest = jest.fn();
const mockOpenPluginSettingsPreservingScroll = jest.fn();
const mockHasAnyEnabledBackend = jest.fn();
const mockHasBackendConnection = jest.fn();

let savedApp: MockApp | undefined;

type MockApp = {
  plugins?: {
    plugins?: {
      opencodian?: {
        settings?: { activeBackend?: string };
        agentServiceRegistry?: { get?: (id: string) => { displayName?: string } | null };
      };
    };
  };
};

function mockGlobalApp(app: MockApp): () => void {
  const originalApp = (globalThis as { app?: MockApp }).app;
  (globalThis as { app?: MockApp }).app = app;
  return () => {
    (globalThis as { app?: MockApp }).app = originalApp;
  };
}

function createHost(): ConversationNoticeCoordinatorHost {
  return {
    getCurrentSessionModel: mockGetCurrentSessionModel,
    formatModelId: mockFormatModelId,
    isConversationRewound: mockIsConversationRewound,
    getActiveTabId: mockGetActiveTabId,
    getSessionDiff: mockGetSessionDiff,
    getCachedSessionDiffEntries: mockGetCachedSessionDiffEntries,
    appendPersistentNotice: mockAppendPersistentNotice,
    renderBackgroundTaskIndicatorIfNeeded: mockRenderBackgroundTaskIndicatorIfNeeded,
    handleRestoreRewindRequest: mockHandleRestoreRewindRequest,
    openPluginSettingsPreservingScroll: mockOpenPluginSettingsPreservingScroll,
    hasAnyEnabledBackend: mockHasAnyEnabledBackend,
    hasBackendConnection: mockHasBackendConnection,
  };
}

function resetConversationNoticeMocks(): void {
  jest.clearAllMocks();
  mockGetActiveTabId.mockReturnValue('tab-active');
  mockGetCurrentSessionModel.mockReturnValue({ provider: 'anthropic', model: 'claude' });
  mockFormatModelId.mockReturnValue('anthropic/claude');
  mockIsConversationRewound.mockReturnValue(false);
  mockGetSessionDiff.mockResolvedValue([]);
  mockGetCachedSessionDiffEntries.mockReturnValue([]);
  mockAppendPersistentNotice.mockResolvedValue(undefined);
  mockRenderBackgroundTaskIndicatorIfNeeded.mockResolvedValue(undefined);
  mockHandleRestoreRewindRequest.mockResolvedValue(undefined);
  mockHasAnyEnabledBackend.mockReturnValue(true);
  mockHasBackendConnection.mockReturnValue(true);
}

describe('ConversationNoticeCoordinator stream notices', () => {
  beforeEach(resetConversationNoticeMocks);

  describe('createStreamErrorNotice', () => {
    it('builds a timestamped error notice with model id', () => {
      jest.spyOn(Date, 'now').mockReturnValue(12345);
      const coordinator = new ConversationNoticeCoordinator(createHost());

      expect(coordinator.createStreamErrorNotice('boom')).toEqual(expect.objectContaining({
        id: 'assistant-error-notice-12345',
        role: 'assistant',
        content: 'boom',
        timestamp: 12345,
        modelId: 'anthropic/claude',
        displayStyle: 'notice',
        noticeTone: 'error',
      }));
    });
  });
});

describe('ConversationNoticeCoordinator empty conversation notices', () => {
  beforeEach(() => {
    resetConversationNoticeMocks();
    savedApp = (globalThis as { app?: MockApp }).app;
  });

  afterEach(() => {
    (globalThis as { app?: MockApp }).app = savedApp;
  });

  describe('empty conversation notice', () => {
    it('checks rewound state', () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());
      expect(coordinator.shouldRenderEmptyConversationNotice()).toBe(false);
      mockIsConversationRewound.mockReturnValue(true);
      expect(coordinator.shouldRenderEmptyConversationNotice()).toBe(true);
    });

    it('builds normal and rewound notices', () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());
      expect(coordinator.createEmptyConversationNotice()).toEqual(expect.objectContaining({
        id: 'opencodian-empty-state',
        noticeTitle: t('chat.empty.title'),
        content: t('chat.empty.description'),
        noticeTone: 'info',
      }));

      mockIsConversationRewound.mockReturnValue(true);
      expect(coordinator.createEmptyConversationNotice()).toEqual(expect.objectContaining({
        id: 'opencodian-empty-rewind',
        noticeTitle: t('chat.rewind.empty.title'),
        content: t('chat.rewind.empty.description'),
        noticeTone: 'warning',
        noticeActions: [{ type: 'restore_rewind' }],
      }));
    });

    it('builds a backend-guidance notice when no backend is enabled', () => {
      mockHasAnyEnabledBackend.mockReturnValue(false);
      const coordinator = new ConversationNoticeCoordinator(createHost());

      expect(coordinator.createEmptyConversationNotice()).toEqual(expect.objectContaining({
        id: 'opencodian-empty-state-no-backend',
        noticeTone: 'warning',
      }));
      expect(coordinator.createEmptyConversationNotice().content).not.toBe(t('chat.empty.description'));
    });

    it('names the active backend in the backend-offline empty conversation notice', () => {
      mockHasBackendConnection.mockReturnValue(false);
      const restoreApp = mockGlobalApp({
        plugins: {
          plugins: {
            opencodian: {
              settings: { activeBackend: 'codex' },
              agentServiceRegistry: {
                get: jest.fn(() => ({ displayName: 'Codex' })),
              },
            },
          },
        },
      });
      try {

      const coordinator = new ConversationNoticeCoordinator(createHost());
      const notice = coordinator.createEmptyConversationNotice();

      expect(notice.id).toBe('opencodian-empty-state-backend-offline');
      expect(notice.noticeTitle).toBe(t('chat.empty.backendOffline.titleWithBackend', { backend: 'Codex' }));
      expect(notice.content).toBe(t('chat.empty.backendOffline.descriptionWithBackend', { backend: 'Codex' }));
      } finally {
        restoreApp();
      }
    });
  });
});

describe('ConversationNoticeCoordinator diff notices', () => {
  beforeEach(resetConversationNoticeMocks);

  describe('formatDiffNoticeMarkdown', () => {
    it('renders vault links, stats, and status', () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());
      expect(
        coordinator.formatDiffNoticeMarkdown([
          { file: 'notes.md', additions: 3, deletions: 1, status: 'modified' },
          { file: 'draft.md', additions: 0, deletions: 0 },
        ]),
      ).toBe([
        t('chat.diffNotice.description'),
        '',
        '- [[notes.md]] modified (+3 / -1)',
        '- [[draft.md]]',
      ].join('\n'));
    });
  });

  describe('appendTurnDiffNoticeIfNeeded', () => {
    it('skips when the session id is missing', async () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());
      await coordinator.appendTurnDiffNoticeIfNeeded({ messages: [], updatedAt: 0 } as never, ['a.md']);
      expect(mockGetSessionDiff).not.toHaveBeenCalled();
    });

    it('skips when there are no edited files', async () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());
      await coordinator.appendTurnDiffNoticeIfNeeded({
        openCodeSessionId: 'session',
        messages: [{ role: 'user', sourceMessageId: 'msg-1' }],
      } as never, []);
      expect(mockGetSessionDiff).not.toHaveBeenCalled();
    });

    it('skips when there is no user source message', async () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());
      await coordinator.appendTurnDiffNoticeIfNeeded({
        openCodeSessionId: 'session',
        messages: [{ role: 'assistant' }],
      } as never, ['a.md']);
      expect(mockGetSessionDiff).not.toHaveBeenCalled();
    });

    it('uses diff entries and renders the active tab indicator', async () => {
      mockGetSessionDiff.mockResolvedValue([
        { file: 'notes.md', additions: 1, deletions: 0, status: 'modified' },
      ]);
      const coordinator = new ConversationNoticeCoordinator(createHost());

      await coordinator.appendTurnDiffNoticeIfNeeded({
        openCodeSessionId: 'session',
        messages: [{ role: 'user', sourceMessageId: 'msg-1' }],
      } as never, ['notes.md']);

      expect(mockAppendPersistentNotice).toHaveBeenCalledWith(expect.objectContaining({
        title: t('chat.diffNotice.title'),
        content: expect.stringContaining('[[notes.md]] modified (+1 / -0)'),
      }));
      expect(mockRenderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-active');
    });

    it('uses cached entries when the live diff is empty', async () => {
      mockGetCachedSessionDiffEntries.mockReturnValue([
        { file: 'cache.md', additions: 2, deletions: 1, status: 'modified' },
      ]);
      const coordinator = new ConversationNoticeCoordinator(createHost());

      await coordinator.appendTurnDiffNoticeIfNeeded({
        openCodeSessionId: 'session',
        messages: [{ role: 'user', sourceMessageId: 'msg-1' }],
      } as never, ['cache.md']);

      expect(mockGetCachedSessionDiffEntries).toHaveBeenCalledWith('session');
      expect(mockAppendPersistentNotice).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('[[cache.md]] modified (+2 / -1)'),
      }));
    });

    it('falls back to unique edited files', async () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());

      await coordinator.appendTurnDiffNoticeIfNeeded({
        openCodeSessionId: 'session',
        messages: [{ role: 'user', sourceMessageId: 'msg-1' }],
      } as never, ['a.md', 'a.md', 'b.md']);

      expect(mockAppendPersistentNotice).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('- [[a.md]]'),
      }));
      expect(mockAppendPersistentNotice.mock.calls[0][0].content).toContain('- [[b.md]]');
    });

    it('does not render the indicator for inactive tabs', async () => {
      mockGetActiveTabId.mockReturnValue('tab-other');
      mockGetSessionDiff.mockResolvedValue([
        { file: 'notes.md', additions: 1, deletions: 0 },
      ]);
      const coordinator = new ConversationNoticeCoordinator(createHost());

      await coordinator.appendTurnDiffNoticeIfNeeded({
        openCodeSessionId: 'session',
        messages: [{ role: 'user', sourceMessageId: 'msg-1' }],
      } as never, ['notes.md'], 'tab-old');

      expect(mockRenderBackgroundTaskIndicatorIfNeeded).not.toHaveBeenCalled();
    });
  });
});

describe('ConversationNoticeCoordinator error and action helpers', () => {
  beforeEach(resetConversationNoticeMocks);

  describe('getFriendlyStreamErrorMessage', () => {
    it('returns backend-specific no-response guidance for empty input', () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());
      expect(coordinator.getFriendlyStreamErrorMessage('', 'opencode')).toBe(t('chat.error.serverNoResponse'));
      expect(coordinator.getFriendlyStreamErrorMessage('   ', 'opencode')).toBe(t('chat.error.serverNoResponse'));
      expect(coordinator.getFriendlyStreamErrorMessage('', 'claude-code'))
        .toBe(t('chat.error.claudeNoResponse'));
    });

    it('returns server-connection for network error patterns', () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());
      expect(coordinator.getFriendlyStreamErrorMessage('Failed to fetch')).toBe(t('chat.error.serverConnection'));
      expect(coordinator.getFriendlyStreamErrorMessage('ECONNREFUSED')).toBe(t('chat.error.serverConnection'));
      expect(coordinator.getFriendlyStreamErrorMessage('NetworkError')).toBe(t('chat.error.serverConnection'));
      expect(coordinator.getFriendlyStreamErrorMessage('SSE connection failed')).toBe(t('chat.error.serverConnection'));
      expect(coordinator.getFriendlyStreamErrorMessage('fetch failed')).toBe(t('chat.error.serverConnection'));
      expect(coordinator.getFriendlyStreamErrorMessage('HTTP 0 error')).toBe(t('chat.error.serverConnection'));
    });

    it('keeps Claude Code errors backend-specific even when the SDK reports fetch failures', () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());
      const message = 'Claude Code stream failed: TypeError: fetch failed';

      expect(coordinator.getFriendlyStreamErrorMessage(message)).toBe(`${t('chat.error.sendFailed')}\n${message}`);
    });

    it('returns server-binary-missing for opencode-not-found', () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());
      expect(coordinator.getFriendlyStreamErrorMessage('opencode not found')).toBe(t('chat.error.serverBinaryMissing'));
    });

    it('returns send-failed with original message for unknown errors', () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());
      const result = coordinator.getFriendlyStreamErrorMessage('Something went wrong');
      expect(result).toBe(`${t('chat.error.sendFailed')}\nSomething went wrong`);
    });

    it('is case-insensitive for network patterns', () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());
      expect(coordinator.getFriendlyStreamErrorMessage('FAILED TO FETCH')).toBe(t('chat.error.serverConnection'));
    });
  });

  describe('routeNoticeAction', () => {
    it('routes open_model_settings', async () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());
      await coordinator.routeNoticeAction('open_model_settings');
      expect(mockOpenPluginSettingsPreservingScroll).toHaveBeenCalled();
    });

    it('routes restore_rewind', async () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());
      await coordinator.routeNoticeAction('restore_rewind');
      expect(mockHandleRestoreRewindRequest).toHaveBeenCalled();
    });

    it('ignores unknown actions', async () => {
      const coordinator = new ConversationNoticeCoordinator(createHost());
      await coordinator.routeNoticeAction('unknown' as never);
      expect(mockHandleRestoreRewindRequest).not.toHaveBeenCalled();
      expect(mockOpenPluginSettingsPreservingScroll).not.toHaveBeenCalled();
    });
  });
});
