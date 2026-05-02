import { ConversationNoticeCoordinator } from '../../../../src/features/chat/services/ConversationNoticeCoordinator';
import { t } from '../../../../src/i18n';

describe('OpenCodianView turn diff notice routing', () => {
  const mockGetActiveTabId = jest.fn();
  const mockGetSessionDiff = jest.fn();
  const mockGetCachedSessionDiffEntries = jest.fn();
  const mockAppendPersistentNotice = jest.fn();
  const mockRenderBackgroundTaskIndicatorIfNeeded = jest.fn();

  function createCoordinator() {
    return new ConversationNoticeCoordinator({
      getCurrentSessionModel: jest.fn(),
      formatModelId: jest.fn(),
      isConversationRewound: jest.fn(),
      getActiveTabId: mockGetActiveTabId,
      getSessionDiff: mockGetSessionDiff,
      getCachedSessionDiffEntries: mockGetCachedSessionDiffEntries,
      appendPersistentNotice: mockAppendPersistentNotice,
      renderBackgroundTaskIndicatorIfNeeded: mockRenderBackgroundTaskIndicatorIfNeeded,
      handleRestoreRewindRequest: jest.fn(),
      openPluginSettingsPreservingScroll: jest.fn(),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveTabId.mockReturnValue('tab-new');
    mockGetSessionDiff.mockResolvedValue([]);
    mockGetCachedSessionDiffEntries.mockReturnValue([]);
    mockAppendPersistentNotice.mockResolvedValue(undefined);
    mockRenderBackgroundTaskIndicatorIfNeeded.mockResolvedValue(undefined);
  });

  it('stores a completed background diff notice on the original conversation after switching tabs', async () => {
    mockGetSessionDiff.mockResolvedValue([
      {
        file: 'notes.md',
        additions: 3,
        deletions: 1,
        status: 'modified',
      },
    ]);
    const coordinator = createCoordinator();

    const sendingConversation = {
      id: 'conversation-old',
      openCodeSessionId: 'session-old',
      updatedAt: 0,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'please update the file',
          timestamp: 1,
          sourceMessageId: 'msg-user-1',
        },
      ],
    };

    await coordinator.appendTurnDiffNoticeIfNeeded(sendingConversation as never, ['notes.md'], 'tab-old');

    expect(mockGetSessionDiff).toHaveBeenCalledWith('session-old', 'msg-user-1');
    expect(mockAppendPersistentNotice).toHaveBeenCalledWith(expect.objectContaining({
      title: t('chat.diffNotice.title'),
      conversation: sendingConversation,
      tabId: 'tab-old',
    }));
  });

  it('uses cached session.diff entries when the final diff fetch is empty', async () => {
    mockGetSessionDiff.mockResolvedValue([]);
    mockGetCachedSessionDiffEntries.mockReturnValue([
      {
        file: 'notes.md',
        additions: 5,
        deletions: 2,
        status: 'modified',
      },
    ]);
    const coordinator = createCoordinator();

    const sendingConversation = {
      id: 'conversation-old',
      openCodeSessionId: 'session-old',
      updatedAt: 0,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'please update the file',
          timestamp: 1,
          sourceMessageId: 'msg-user-1',
        },
      ],
    };

    await coordinator.appendTurnDiffNoticeIfNeeded(sendingConversation as never, ['notes.md'], 'tab-old');

    expect(mockGetSessionDiff).toHaveBeenCalledWith('session-old', 'msg-user-1');
    expect(mockGetCachedSessionDiffEntries).toHaveBeenCalledWith('session-old');
    expect(mockAppendPersistentNotice).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('(+5 / -2)'),
    }));
  });
});
