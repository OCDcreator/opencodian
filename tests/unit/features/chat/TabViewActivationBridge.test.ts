import {
  TabViewActivationBridge,
  type TabViewActivationBridgeHost,
} from '../../../../src/features/chat/runtime/TabViewActivationBridge';
import type { QuestionTodoStatusRefreshCoordinator } from '../../../../src/features/chat/services/QuestionTodoStatusRefreshCoordinator';

type QuestionTodoStatusRefreshPort = Pick<
  QuestionTodoStatusRefreshCoordinator,
  'refreshAfterActivation'
>;

function createHost(callOrder: string[]): jest.Mocked<TabViewActivationBridgeHost> {
  return {
    setActiveMessagesPane: jest.fn(() => {
      callOrder.push('pane');
    }),
    refreshActiveFocusContextPreview: jest.fn(() => {
      callOrder.push('focus');
    }),
    renderQuestionDock: jest.fn(() => {
      callOrder.push('question');
    }),
    updateSessionTodoDockForTab: jest.fn(() => {
      callOrder.push('todo');
    }),
    renderSessionTodoDock: jest.fn(() => {
      callOrder.push('todo');
    }),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn(() => {
      callOrder.push('indicator');
      return Promise.resolve(undefined);
    }),
    scheduleComposerLayoutSync: jest.fn(() => {
      callOrder.push('layout');
    }),
    updateModelSelectorDisplay: jest.fn(() => {
      callOrder.push('selector');
    }),
    syncActiveTabContextUsageIdentity: jest.fn(() => {
      callOrder.push('context');
    }),
    refreshActiveTabContextUsageFromServer: jest.fn(() => {
      callOrder.push('fetch-context');
      return Promise.resolve(undefined);
    }),
    updateSendButtonState: jest.fn(() => {
      callOrder.push('send');
    }),
  };
}

function createRefreshCoordinator(
  callOrder: string[],
): jest.Mocked<QuestionTodoStatusRefreshPort> {
  return {
    refreshAfterActivation: jest.fn(() => {
      callOrder.push('supplemental-refresh');
      return Promise.resolve(undefined);
    }),
  };
}

describe('TabViewActivationBridge', () => {
  it('applies pane activation preflight UI refreshes in order', () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const bridge = new TabViewActivationBridge(host, refreshCoordinator);

    bridge.applyActivationPreflight('tab-1');

    expect(host.setActiveMessagesPane).toHaveBeenCalledWith('tab-1');
    expect(host.updateSessionTodoDockForTab).toHaveBeenCalledWith('tab-1');
    expect(refreshCoordinator.refreshAfterActivation).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['pane', 'focus', 'question', 'todo']);
  });

  it('applies streaming activation outcome UI refreshes in order', () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const bridge = new TabViewActivationBridge(host, refreshCoordinator);

    bridge.applyStreamingActivationOutcome('tab-1', 'session-1');

    expect(host.renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
    expect(refreshCoordinator.refreshAfterActivation).toHaveBeenCalledWith('tab-1', 'session-1');
    expect(callOrder).toEqual([
      'selector',
      'context',
      'todo',
      'question',
      'supplemental-refresh',
      'send',
    ]);
  });

  it('applies empty-tab activation outcome UI refreshes in order', () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const bridge = new TabViewActivationBridge(host, refreshCoordinator);

    bridge.applyEmptyActivationOutcome('tab-1');

    expect(host.renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
    expect(refreshCoordinator.refreshAfterActivation).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['todo', 'question', 'selector', 'context', 'send']);
  });

  it('applies loaded-conversation post-render outcome in order', async () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const bridge = new TabViewActivationBridge(host, refreshCoordinator);

    await bridge.applyLoadedConversationPostRenderOutcome('tab-1', 'session-1');

    expect(host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-1');
    expect(host.renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
    expect(refreshCoordinator.refreshAfterActivation).toHaveBeenCalledWith('tab-1', 'session-1');
    expect(callOrder).toEqual(['indicator', 'todo', 'question', 'supplemental-refresh']);
  });

  it('applies loaded-conversation hydration tail refreshes in order', async () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const bridge = new TabViewActivationBridge(host, refreshCoordinator);

    await bridge.applyLoadedConversationHydrationTail();

    expect(refreshCoordinator.refreshAfterActivation).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['layout', 'selector', 'context', 'fetch-context']);
  });
});
