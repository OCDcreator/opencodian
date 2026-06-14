import type { AppServerReviewResult, AppServerReviewTarget } from '../../../../src/core/agents/backend/CodexAppServerClient';
import type { Conversation } from '../../../../src/core/types';
import {
  ConversationSessionSettingsCoordinator,
  type ConversationSessionSettingsCoordinatorHost,
} from '../../../../src/features/chat/services/ConversationSessionSettingsCoordinator';

jest.mock('../../../../src/features/chat/ui/ConversationSessionSettingsModal', () => ({
  ConversationSessionSettingsModal: jest.fn().mockImplementation((_app, options) => ({
    open: jest.fn(),
    close: jest.fn(),
    options,
  })),
}));

const MODAL_PATH = '../../../../src/features/chat/ui/ConversationSessionSettingsModal';

function createCodexConversation(): Conversation {
  return {
    id: 'codex-conv-1',
    title: 'Codex Session',
    createdAt: 1,
    updatedAt: 1,
    backend: 'codex',
    backendSessionId: 'codex-session-1',
    messages: [],
  };
}

function makeReviewResult(status: string, messages?: string[]): AppServerReviewResult {
  return {
    turn: { id: 'turn-1', status, items: [], error: null },
    reviewThreadId: 'codex-session-1',
    ...(messages ? { reviewMessages: messages } : {}),
  };
}

/** Build a coordinator host whose codex backend delegates to `startReview`. */
function createReviewHost(overrides: {
  startReview: jest.Mock;
  openBackendSessionAsConversation?: jest.Mock;
  showNotice?: jest.Mock;
}): ConversationSessionSettingsCoordinatorHost {
  const conv = createCodexConversation();
  return {
    app: {} as never,
    getCurrentConversation: jest.fn().mockReturnValue(conv),
    getSessionSettingsDefaults: jest.fn().mockReturnValue({ chatFontSizePx: 13 }),
    getCodexGlobalDefaults: jest.fn().mockReturnValue({
      sandboxMode: 'workspace-write' as const,
      modelReasoningEffort: 'medium' as const,
      model: 'codex-mini-latest',
      additionalDirectories: [] as string[],
      networkAccessEnabled: false,
    }),
    getChatContainerEl: jest.fn().mockReturnValue(document.createElement('div')),
    saveConversation: jest.fn().mockResolvedValue(undefined),
    showNotice: overrides.showNotice ?? jest.fn(),
    applyCodexRuntimeOverrides: jest.fn(),
    supportsSessionSharing: jest.fn().mockReturnValue(false),
    supportsCompaction: jest.fn().mockReturnValue(false),
    agentServiceRegistry: {
      get: jest.fn(() => ({ startReview: overrides.startReview })),
    },
    openBackendSessionAsConversation: overrides.openBackendSessionAsConversation,
  } as unknown as ConversationSessionSettingsCoordinatorHost;
}

/** Grab the options object passed to the most recently opened settings modal. */
function getLatestModalOptions(): { onStartReview: (target: AppServerReviewTarget) => Promise<void> } {
  return (jest.requireMock(MODAL_PATH).ConversationSessionSettingsModal as jest.Mock).mock.calls.at(-1)[1];
}

describe('ConversationSessionSettingsCoordinator Codex review', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes onStartReview callback that forwards target to adapter', async () => {
    const startReview = jest.fn().mockResolvedValue(makeReviewResult('completed'));
    const host = createReviewHost({ startReview });
    const coordinator = new ConversationSessionSettingsCoordinator(host);

    await coordinator.openCurrentConversationSettings();

    const target: AppServerReviewTarget = { type: 'uncommittedChanges' };
    await getLatestModalOptions().onStartReview(target);

    expect(startReview).toHaveBeenCalledWith('codex-session-1', target);
  });

  it('opens review conversation after review completes', async () => {
    const startReview = jest.fn().mockResolvedValue(makeReviewResult('completed', ['LGTM']));
    const openBackend = jest.fn().mockResolvedValue('new-conv-1');
    const host = createReviewHost({ startReview, openBackendSessionAsConversation: openBackend });
    const coordinator = new ConversationSessionSettingsCoordinator(host);

    await coordinator.openCurrentConversationSettings();

    await getLatestModalOptions().onStartReview({ type: 'uncommittedChanges' });

    // Should open the review thread as a conversation
    expect(openBackend).toHaveBeenCalledWith('codex-session-1', expect.any(String));
  });

  it('closes modal after review conversation opens', async () => {
    const startReview = jest.fn().mockResolvedValue(makeReviewResult('completed'));
    const mockModalClose = jest.fn();
    const host = createReviewHost({
      startReview,
      openBackendSessionAsConversation: jest.fn().mockResolvedValue('new-conv-1'),
    });
    const coordinator = new ConversationSessionSettingsCoordinator(host);

    await coordinator.openCurrentConversationSettings();

    // Get the modal instance to check close was called
    const modalInstance = (jest.requireMock(MODAL_PATH).ConversationSessionSettingsModal as jest.Mock).mock.results.at(-1)?.value;
    if (modalInstance) {
      modalInstance.close = mockModalClose;
    }

    await getLatestModalOptions().onStartReview({ type: 'uncommittedChanges' });

    expect(mockModalClose).toHaveBeenCalled();
  });

  it('falls back to notice when openBackendSessionAsConversation is not available', async () => {
    const startReview = jest.fn().mockResolvedValue(makeReviewResult('completed', ['LGTM']));
    const showNotice = jest.fn();
    const host = createReviewHost({ startReview, showNotice });
    // openBackendSessionAsConversation intentionally absent
    delete (host as { openBackendSessionAsConversation?: unknown }).openBackendSessionAsConversation;
    const coordinator = new ConversationSessionSettingsCoordinator(host);

    await coordinator.openCurrentConversationSettings();

    await getLatestModalOptions().onStartReview({ type: 'uncommittedChanges' });

    expect(showNotice).toHaveBeenCalled();
  });

  it('opens conversation even for interrupted review (partial results)', async () => {
    const startReview = jest.fn().mockResolvedValue(makeReviewResult('interrupted'));
    const openBackend = jest.fn().mockResolvedValue('new-conv-1');
    const host = createReviewHost({ startReview, openBackendSessionAsConversation: openBackend });
    const coordinator = new ConversationSessionSettingsCoordinator(host);

    await coordinator.openCurrentConversationSettings();

    await getLatestModalOptions().onStartReview({ type: 'custom', instructions: 'Review for bugs' });

    // Even interrupted reviews should open the conversation — partial results may be visible
    expect(openBackend).toHaveBeenCalled();
  });

  it('does not open conversation when adapter returns null', async () => {
    const startReview = jest.fn().mockResolvedValue(null);
    const openBackend = jest.fn();
    const host = createReviewHost({ startReview, openBackendSessionAsConversation: openBackend });
    const coordinator = new ConversationSessionSettingsCoordinator(host);

    await coordinator.openCurrentConversationSettings();

    await getLatestModalOptions().onStartReview({ type: 'uncommittedChanges' });

    expect(openBackend).not.toHaveBeenCalled();
  });
});
