import {
  VisibleConversationPostSyncCoordinator,
} from '../../../../src/features/chat/services/VisibleConversationPostSyncCoordinator';
import type { PostSyncQuestionTodoRefreshFacade } from '../../../../src/features/chat/services/PostSyncQuestionTodoRefreshFacade';
import type {
  VisibleConversationPostSyncOutcome,
  VisibleConversationPostSyncStateCoordinator,
} from '../../../../src/features/chat/services/VisibleConversationPostSyncStateCoordinator';

type VisibleConversationRefreshPort = Pick<
  PostSyncQuestionTodoRefreshFacade,
  'refreshVisibleConversation'
>;
type VisibleConversationPostSyncStatePort = Pick<
  VisibleConversationPostSyncStateCoordinator,
  'commitPostSyncState'
>;

function createVisibleRefreshFacade(): jest.Mocked<VisibleConversationRefreshPort> {
  return {
    refreshVisibleConversation: jest.fn().mockResolvedValue(undefined),
  };
}

function createVisibleStateCoordinator(
  outcome: VisibleConversationPostSyncOutcome = {
    shouldApplySyncedConversationUpdate: true,
    shouldRenderBackgroundTaskIndicator: false,
  },
): jest.Mocked<VisibleConversationPostSyncStatePort> {
  return {
    commitPostSyncState: jest.fn().mockReturnValue(outcome),
  };
}

describe('VisibleConversationPostSyncCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes visible question/todo state before committing visible sync state', async () => {
    const callOrder: string[] = [];
    const refreshFacade = createVisibleRefreshFacade();
    const visibleStateCoordinator = createVisibleStateCoordinator();
    refreshFacade.refreshVisibleConversation.mockImplementation(async () => {
      callOrder.push('refresh');
    });
    visibleStateCoordinator.commitPostSyncState.mockImplementation(() => {
      callOrder.push('commit');
      return {
        shouldApplySyncedConversationUpdate: true,
        shouldRenderBackgroundTaskIndicator: false,
      };
    });
    const coordinator = new VisibleConversationPostSyncCoordinator(
      refreshFacade,
      visibleStateCoordinator,
    );

    const outcome = await coordinator.handleVisibleConversationSyncComplete({
      tabId: 'tab-active',
      expectedConversationId: 'conversation-1',
      questionSessionId: 'session-1',
      syncResult: {
        changed: true,
        fingerprint: 'new',
        revertState: { messageID: 'assistant-1', partID: 'part-1' },
      },
    });

    expect(refreshFacade.refreshVisibleConversation).toHaveBeenCalledWith({
      tabId: 'tab-active',
      questionSessionId: 'session-1',
    });
    expect(visibleStateCoordinator.commitPostSyncState).toHaveBeenCalledWith({
      tabId: 'tab-active',
      expectedConversationId: 'conversation-1',
      syncResult: {
        changed: true,
        fingerprint: 'new',
        revertState: { messageID: 'assistant-1', partID: 'part-1' },
      },
    });
    expect(callOrder).toEqual(['refresh', 'commit']);
    expect(outcome).toEqual({
      shouldApplySyncedConversationUpdate: true,
      shouldRenderBackgroundTaskIndicator: false,
    });
  });

  it('passes through indicator-only outcomes after refresh completes', async () => {
    const refreshFacade = createVisibleRefreshFacade();
    const visibleStateCoordinator = createVisibleStateCoordinator({
      shouldApplySyncedConversationUpdate: false,
      shouldRenderBackgroundTaskIndicator: true,
    });
    const coordinator = new VisibleConversationPostSyncCoordinator(
      refreshFacade,
      visibleStateCoordinator,
    );

    const outcome = await coordinator.handleVisibleConversationSyncComplete({
      tabId: 'tab-active',
      expectedConversationId: 'conversation-1',
      questionSessionId: 'session-1',
      syncResult: {
        changed: false,
        fingerprint: 'same',
        revertState: { messageID: 'assistant-2' },
      },
    });

    expect(refreshFacade.refreshVisibleConversation).toHaveBeenCalledWith({
      tabId: 'tab-active',
      questionSessionId: 'session-1',
    });
    expect(outcome).toEqual({
      shouldApplySyncedConversationUpdate: false,
      shouldRenderBackgroundTaskIndicator: true,
    });
  });
});
