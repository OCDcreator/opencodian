import type { Conversation } from '../../../../src/core/types';
import {
  TabConversationActivationBridge,
  type TabConversationActivationBridgeHost,
} from '../../../../src/features/chat/runtime/TabConversationActivationBridge';
import type { TabConversationStateBridge } from '../../../../src/features/chat/runtime/TabConversationStateBridge';
import type { TabViewActivationBridge } from '../../../../src/features/chat/runtime/TabViewActivationBridge';
import type { ActiveTabContextUsageCoordinator } from '../../../../src/features/chat/services/ActiveTabContextUsageCoordinator';
import type { QuestionTodoActivationRefreshCoordinator } from '../../../../src/features/chat/services/QuestionTodoActivationRefreshCoordinator';
import type { BackgroundTaskActivationIndicatorPort as BackgroundTaskActivationIndicatorSourcePort } from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter';

type TabConversationStatePort = Pick<
  TabConversationStateBridge,
  'applyActiveConversation' | 'clearActiveConversation' | 'commitConversationSyncBaseline'
>;

type QuestionTodoActivationRefreshPort = Pick<
  QuestionTodoActivationRefreshCoordinator,
  'applyConversationActivation'
>;

type ActiveTabContextUsagePort = Pick<
  ActiveTabContextUsageCoordinator,
  'syncIdentity' | 'refreshFromServer'
>;

type BackgroundTaskActivationIndicatorPort = Pick<
  BackgroundTaskActivationIndicatorSourcePort,
  | 'prepareOpenConversation'
  | 'syncOpenConversationState'
  | 'renderOpenConversationIndicator'
>;

type TabViewActivationPort = Pick<
  TabViewActivationBridge,
  'applyEmptyActivationOutcome' | 'applyStreamingActivationOutcome'
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
  overrides: Partial<jest.Mocked<TabConversationActivationBridgeHost>> = {},
): jest.Mocked<TabConversationActivationBridgeHost> {
  return {
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    clearMessagesContainer: jest.fn(() => {
      callOrder.push('clearMessagesContainer');
    }),
    resetTurnState: jest.fn(() => {
      callOrder.push('resetTurnState');
    }),
    updateModelSelectorDisplay: jest.fn(() => {
      callOrder.push('updateModelSelectorDisplay');
    }),
    scheduleSettledScrollToBottom: jest.fn(() => {
      callOrder.push('scheduleSettledScrollToBottom');
    }),
    ...overrides,
  };
}

function createContextUsageCoordinator(
  callOrder: string[],
): jest.Mocked<ActiveTabContextUsagePort> {
  return {
    syncIdentity: jest.fn(() => {
      callOrder.push('syncActiveTabContextUsageIdentity');
    }),
    refreshFromServer: jest.fn(() => {
      callOrder.push('refreshActiveTabContextUsageFromServer');
      return Promise.resolve(undefined);
    }),
  };
}

function createBackgroundTaskCoordinator(
  callOrder: string[],
): jest.Mocked<BackgroundTaskActivationIndicatorPort> {
  return {
    prepareOpenConversation: jest.fn(() => {
      callOrder.push('prepareOpenConversation');
    }),
    syncOpenConversationState: jest.fn(() => {
      callOrder.push('syncOpenConversationState');
    }),
    renderOpenConversationIndicator: jest.fn(() => {
      callOrder.push('renderOpenConversationIndicator');
    }),
  };
}

function createTabConversationStateBridge(
  callOrder: string[],
): jest.Mocked<TabConversationStatePort> {
  return {
    applyActiveConversation: jest.fn(() => {
      callOrder.push('applyActiveConversation');
    }),
    clearActiveConversation: jest.fn(() => {
      callOrder.push('clearActiveConversation');
    }),
    commitConversationSyncBaseline: jest.fn(() => {
      callOrder.push('commitConversationSyncBaseline');
    }),
  };
}

function createTabViewActivationBridge(
  callOrder: string[],
): jest.Mocked<TabViewActivationPort> {
  return {
    applyEmptyActivationOutcome: jest.fn(() => {
      callOrder.push('applyEmptyActivationOutcome');
    }),
    applyStreamingActivationOutcome: jest.fn(() => {
      callOrder.push('applyStreamingActivationOutcome');
    }),
  };
}

function createRefreshCoordinator(
  callOrder: string[],
): jest.Mocked<QuestionTodoActivationRefreshPort> {
  return {
    applyConversationActivation: jest.fn(() => {
      callOrder.push('applyConversationActivation');
    }),
  };
}

describe('TabConversationActivationBridge', () => {
  it('applies empty-tab activation in bridge order', () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const tabConversationStateBridge = createTabConversationStateBridge(callOrder);
    const tabViewActivationBridge = createTabViewActivationBridge(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const backgroundTaskCoordinator = createBackgroundTaskCoordinator(callOrder);
    const contextUsageCoordinator = createContextUsageCoordinator(callOrder);
    const bridge = new TabConversationActivationBridge({
      host,
      tabConversationStateBridge,
      tabViewActivationBridge,
      questionTodoActivationRefreshCoordinator: refreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator: backgroundTaskCoordinator,
      activeTabContextUsageCoordinator: contextUsageCoordinator,
    });

    bridge.applyEmptyTabActivation('tab-1');

    expect(tabConversationStateBridge.clearActiveConversation).toHaveBeenCalledWith('tab-1');
    expect(tabViewActivationBridge.applyEmptyActivationOutcome).toHaveBeenCalledWith('tab-1');
    expect(refreshCoordinator.applyConversationActivation).not.toHaveBeenCalled();
    expect(callOrder).toEqual([
      'clearActiveConversation',
      'clearMessagesContainer',
      'resetTurnState',
      'applyEmptyActivationOutcome',
    ]);
  });

  it('applies streaming activation in bridge order', () => {
    const callOrder: string[] = [];
    const conversation = createConversation('streaming-conversation');
    const host = createHost(callOrder);
    const tabConversationStateBridge = createTabConversationStateBridge(callOrder);
    const tabViewActivationBridge = createTabViewActivationBridge(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const backgroundTaskCoordinator = createBackgroundTaskCoordinator(callOrder);
    const contextUsageCoordinator = createContextUsageCoordinator(callOrder);
    const bridge = new TabConversationActivationBridge({
      host,
      tabConversationStateBridge,
      tabViewActivationBridge,
      questionTodoActivationRefreshCoordinator: refreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator: backgroundTaskCoordinator,
      activeTabContextUsageCoordinator: contextUsageCoordinator,
    });

    bridge.applyStreamingConversationActivation('tab-1', conversation);

    expect(tabConversationStateBridge.applyActiveConversation).toHaveBeenCalledWith(
      'tab-1',
      conversation,
      {
        clearRevertState: true,
        resetSessionState: true,
      },
    );
    expect(tabConversationStateBridge.commitConversationSyncBaseline).toHaveBeenCalledWith(
      conversation.messages,
    );
    expect(tabViewActivationBridge.applyStreamingActivationOutcome).toHaveBeenCalledWith(
      'tab-1',
      conversation.openCodeSessionId,
    );
    expect(backgroundTaskCoordinator.prepareOpenConversation).not.toHaveBeenCalled();
    expect(callOrder).toEqual([
      'applyActiveConversation',
      'commitConversationSyncBaseline',
      'applyStreamingActivationOutcome',
    ]);
  });

  it('applies loaded-conversation activation state through the shared state bridge', () => {
    const callOrder: string[] = [];
    const conversation = createConversation('loaded-conversation');
    const host = createHost(callOrder);
    const tabConversationStateBridge = createTabConversationStateBridge(callOrder);
    const tabViewActivationBridge = createTabViewActivationBridge(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const backgroundTaskCoordinator = createBackgroundTaskCoordinator(callOrder);
    const contextUsageCoordinator = createContextUsageCoordinator(callOrder);
    const bridge = new TabConversationActivationBridge({
      host,
      tabConversationStateBridge,
      tabViewActivationBridge,
      questionTodoActivationRefreshCoordinator: refreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator: backgroundTaskCoordinator,
      activeTabContextUsageCoordinator: contextUsageCoordinator,
    });

    bridge.applyLoadedConversationActivation('tab-1', conversation);

    expect(tabConversationStateBridge.applyActiveConversation).toHaveBeenCalledWith(
      'tab-1',
      conversation,
      {
        clearRevertState: true,
        resetSessionState: true,
        resetBackgroundTaskSuppressedFingerprint: true,
      },
    );
    expect(tabConversationStateBridge.commitConversationSyncBaseline).not.toHaveBeenCalled();
    expect(tabViewActivationBridge.applyStreamingActivationOutcome).not.toHaveBeenCalled();
    expect(callOrder).toEqual([
      'applyActiveConversation',
    ]);
  });

  it('opens the current-tab conversation shell in bridge order', () => {
    const callOrder: string[] = [];
    const conversation = createConversation('next-conversation');
    const host = createHost(callOrder);
    const tabConversationStateBridge = createTabConversationStateBridge(callOrder);
    const tabViewActivationBridge = createTabViewActivationBridge(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const backgroundTaskCoordinator = createBackgroundTaskCoordinator(callOrder);
    const contextUsageCoordinator = createContextUsageCoordinator(callOrder);
    const bridge = new TabConversationActivationBridge({
      host,
      tabConversationStateBridge,
      tabViewActivationBridge,
      questionTodoActivationRefreshCoordinator: refreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator: backgroundTaskCoordinator,
      activeTabContextUsageCoordinator: contextUsageCoordinator,
    });

    bridge.openConversation(conversation);

    expect(tabConversationStateBridge.applyActiveConversation).toHaveBeenCalledWith(
      'tab-1',
      conversation,
      {
        clearRevertState: true,
        resetSessionState: true,
      },
    );
    expect(backgroundTaskCoordinator.prepareOpenConversation).toHaveBeenCalledWith(conversation);
    expect(backgroundTaskCoordinator.syncOpenConversationState).toHaveBeenCalledWith(
      conversation,
      'tab-1',
    );
    expect(refreshCoordinator.applyConversationActivation).toHaveBeenCalledWith(
      'tab-1',
      conversation.openCodeSessionId,
    );
    expect(callOrder).toEqual([
      'prepareOpenConversation',
      'applyActiveConversation',
      'clearMessagesContainer',
      'resetTurnState',
      'commitConversationSyncBaseline',
      'updateModelSelectorDisplay',
      'syncActiveTabContextUsageIdentity',
      'syncOpenConversationState',
      'applyConversationActivation',
      'renderOpenConversationIndicator',
      'refreshActiveTabContextUsageFromServer',
      'scheduleSettledScrollToBottom',
    ]);
  });

  it('delegates open-conversation background-task preparation', () => {
    const callOrder: string[] = [];
    const conversation = createConversation('same-conversation');
    const host = createHost(callOrder);
    const tabConversationStateBridge = createTabConversationStateBridge(callOrder);
    const tabViewActivationBridge = createTabViewActivationBridge(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const backgroundTaskCoordinator = createBackgroundTaskCoordinator(callOrder);
    const contextUsageCoordinator = createContextUsageCoordinator(callOrder);
    const bridge = new TabConversationActivationBridge({
      host,
      tabConversationStateBridge,
      tabViewActivationBridge,
      questionTodoActivationRefreshCoordinator: refreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator: backgroundTaskCoordinator,
      activeTabContextUsageCoordinator: contextUsageCoordinator,
    });

    bridge.openConversation(conversation);

    expect(backgroundTaskCoordinator.prepareOpenConversation).toHaveBeenCalledWith(conversation);
    expect(tabConversationStateBridge.commitConversationSyncBaseline).toHaveBeenCalledWith(
      conversation.messages,
    );
  });
});
