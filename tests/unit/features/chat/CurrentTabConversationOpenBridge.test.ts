import type { Conversation } from '../../../../src/core/types';
import {
  CurrentTabConversationOpenBridge,
  type CurrentTabConversationOpenBridgeHost,
} from '../../../../src/features/chat/runtime/CurrentTabConversationOpenBridge';
import type { QuestionTodoStatusRefreshCoordinator } from '../../../../src/features/chat/services/QuestionTodoStatusRefreshCoordinator';
import type { TabConversationStateBridge } from '../../../../src/features/chat/runtime/TabConversationStateBridge';

type TabConversationStatePort = Pick<
  TabConversationStateBridge,
  'applyActiveConversation' | 'commitConversationSyncBaseline'
>;

type QuestionTodoStatusRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterActivation'
>;

function createConversation(id = 'conversation-1'): Conversation {
  return {
    id,
    title: `Chat ${id}`,
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: `${id}-session`,
    messages: [
      {
        id: `message-${id}`,
        role: 'assistant',
        content: 'Hello',
        timestamp: 1,
      },
    ],
  };
}

function createHost(
  callOrder: string[],
  overrides: Partial<jest.Mocked<CurrentTabConversationOpenBridgeHost>> = {},
): jest.Mocked<CurrentTabConversationOpenBridgeHost> {
  return {
    getCurrentConversationId: jest.fn().mockReturnValue('previous-conversation'),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    resetBackgroundTaskIndicator: jest.fn(() => {
      callOrder.push('resetBackgroundTaskIndicator');
    }),
    clearMessagesContainer: jest.fn(() => {
      callOrder.push('clearMessagesContainer');
    }),
    resetTurnState: jest.fn(() => {
      callOrder.push('resetTurnState');
    }),
    updateModelSelectorDisplay: jest.fn(() => {
      callOrder.push('updateModelSelectorDisplay');
    }),
    syncActiveTabContextUsageIdentity: jest.fn(() => {
      callOrder.push('syncActiveTabContextUsageIdentity');
    }),
    syncBackgroundTaskStateFromConversation: jest.fn(() => {
      callOrder.push('syncBackgroundTaskStateFromConversation');
    }),
    renderSessionTodoDock: jest.fn(() => {
      callOrder.push('renderSessionTodoDock');
    }),
    renderQuestionDock: jest.fn(() => {
      callOrder.push('renderQuestionDock');
    }),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn(() => {
      callOrder.push('renderBackgroundTaskIndicatorIfNeeded');
      return Promise.resolve(undefined);
    }),
    refreshActiveTabContextUsageFromServer: jest.fn(() => {
      callOrder.push('refreshActiveTabContextUsageFromServer');
      return Promise.resolve(undefined);
    }),
    scheduleSettledScrollToBottom: jest.fn(() => {
      callOrder.push('scheduleSettledScrollToBottom');
    }),
    ...overrides,
  };
}

function createTabConversationStateBridge(
  callOrder: string[],
): jest.Mocked<TabConversationStatePort> {
  return {
    applyActiveConversation: jest.fn(() => {
      callOrder.push('applyActiveConversation');
    }),
    commitConversationSyncBaseline: jest.fn(() => {
      callOrder.push('commitConversationSyncBaseline');
    }),
  };
}

function createRefreshCoordinator(
  callOrder: string[],
): jest.Mocked<QuestionTodoStatusRefreshPort> {
  return {
    refreshAfterActivation: jest.fn(() => {
      callOrder.push('refreshAfterActivation');
      return Promise.resolve(undefined);
    }),
  };
}

describe('CurrentTabConversationOpenBridge', () => {
  it('opens the current-tab conversation shell in bridge order', () => {
    const callOrder: string[] = [];
    const conversation = createConversation('next-conversation');
    const host = createHost(callOrder);
    const tabConversationStateBridge = createTabConversationStateBridge(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const bridge = new CurrentTabConversationOpenBridge(
      host,
      tabConversationStateBridge,
      refreshCoordinator,
    );

    bridge.openConversation(conversation);

    expect(tabConversationStateBridge.applyActiveConversation).toHaveBeenCalledWith(
      'tab-1',
      conversation,
      {
        clearRevertState: true,
        resetSessionState: true,
      },
    );
    expect(host.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(
      conversation,
      'tab-1',
    );
    expect(host.renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
    expect(refreshCoordinator.refreshAfterActivation).toHaveBeenCalledWith(
      'tab-1',
      conversation.openCodeSessionId,
    );
    expect(callOrder).toEqual([
      'resetBackgroundTaskIndicator',
      'applyActiveConversation',
      'clearMessagesContainer',
      'resetTurnState',
      'commitConversationSyncBaseline',
      'updateModelSelectorDisplay',
      'syncActiveTabContextUsageIdentity',
      'syncBackgroundTaskStateFromConversation',
      'renderSessionTodoDock',
      'renderQuestionDock',
      'refreshAfterActivation',
      'renderBackgroundTaskIndicatorIfNeeded',
      'refreshActiveTabContextUsageFromServer',
      'scheduleSettledScrollToBottom',
    ]);
  });

  it('keeps the indicator when reopening the same conversation', () => {
    const callOrder: string[] = [];
    const conversation = createConversation('same-conversation');
    const host = createHost(callOrder, {
      getCurrentConversationId: jest.fn().mockReturnValue(conversation.id),
    });
    const tabConversationStateBridge = createTabConversationStateBridge(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const bridge = new CurrentTabConversationOpenBridge(
      host,
      tabConversationStateBridge,
      refreshCoordinator,
    );

    bridge.openConversation(conversation);

    expect(host.resetBackgroundTaskIndicator).not.toHaveBeenCalled();
    expect(tabConversationStateBridge.commitConversationSyncBaseline).toHaveBeenCalledWith(
      conversation.messages,
    );
  });
});
