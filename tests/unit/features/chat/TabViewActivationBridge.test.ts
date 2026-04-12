import {
  TabViewActivationBridge,
  type TabViewActivationBridgeHost,
} from '../../../../src/features/chat/runtime/TabViewActivationBridge';

describe('TabViewActivationBridge', () => {
  it('applies pane activation preflight UI refreshes in order', () => {
    const callOrder: string[] = [];
    const host: jest.Mocked<TabViewActivationBridgeHost> = {
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
        callOrder.push('render-todo');
      }),
      scheduleComposerLayoutSync: jest.fn(),
      updateModelSelectorDisplay: jest.fn(() => {
        callOrder.push('selector');
      }),
      syncActiveTabContextUsageIdentity: jest.fn(() => {
        callOrder.push('context');
      }),
      refreshActiveTabContextUsageFromServer: jest.fn().mockResolvedValue(undefined),
      refreshTabSessionStatus: jest.fn(() => {
        callOrder.push('status');
        return Promise.resolve(null);
      }),
      refreshPendingQuestionsForTab: jest.fn(() => {
        callOrder.push('pending-question');
        return Promise.resolve([]);
      }),
      refreshTabSessionTodos: jest.fn(() => {
        callOrder.push('refresh-todo');
        return Promise.resolve([]);
      }),
      updateSendButtonState: jest.fn(() => {
        callOrder.push('send');
      }),
    };
    const bridge = new TabViewActivationBridge(host);

    bridge.applyActivationPreflight('tab-1');

    expect(host.setActiveMessagesPane).toHaveBeenCalledWith('tab-1');
    expect(host.updateSessionTodoDockForTab).toHaveBeenCalledWith('tab-1');
    expect(callOrder).toEqual(['pane', 'focus', 'question', 'todo']);
  });

  it('applies streaming activation outcome UI refreshes in order', () => {
    const callOrder: string[] = [];
    const host: jest.Mocked<TabViewActivationBridgeHost> = {
      setActiveMessagesPane: jest.fn(),
      refreshActiveFocusContextPreview: jest.fn(),
      renderQuestionDock: jest.fn(() => {
        callOrder.push('question');
      }),
      updateSessionTodoDockForTab: jest.fn(),
      renderSessionTodoDock: jest.fn(() => {
        callOrder.push('todo');
      }),
      scheduleComposerLayoutSync: jest.fn(),
      updateModelSelectorDisplay: jest.fn(() => {
        callOrder.push('selector');
      }),
      syncActiveTabContextUsageIdentity: jest.fn(() => {
        callOrder.push('context');
      }),
      refreshActiveTabContextUsageFromServer: jest.fn().mockResolvedValue(undefined),
      refreshTabSessionStatus: jest.fn(() => {
        callOrder.push('status');
        return Promise.resolve(null);
      }),
      refreshPendingQuestionsForTab: jest.fn(() => {
        callOrder.push('pending-question');
        return Promise.resolve([]);
      }),
      refreshTabSessionTodos: jest.fn(() => {
        callOrder.push('refresh-todo');
        return Promise.resolve([]);
      }),
      updateSendButtonState: jest.fn(() => {
        callOrder.push('send');
      }),
    };
    const bridge = new TabViewActivationBridge(host);

    bridge.applyStreamingActivationOutcome('tab-1', 'session-1');

    expect(host.renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
    expect(host.refreshTabSessionStatus).toHaveBeenCalledWith('tab-1', 'session-1', { suppressErrors: true });
    expect(host.refreshPendingQuestionsForTab).toHaveBeenCalledWith('tab-1', 'session-1');
    expect(host.refreshTabSessionTodos).toHaveBeenCalledWith('tab-1', 'session-1', { suppressErrors: true });
    expect(callOrder).toEqual([
      'selector',
      'context',
      'todo',
      'question',
      'status',
      'pending-question',
      'refresh-todo',
      'send',
    ]);
  });

  it('applies empty-tab activation outcome UI refreshes in order', () => {
    const callOrder: string[] = [];
    const host: jest.Mocked<TabViewActivationBridgeHost> = {
      setActiveMessagesPane: jest.fn(),
      refreshActiveFocusContextPreview: jest.fn(),
      renderQuestionDock: jest.fn(() => {
        callOrder.push('question');
      }),
      updateSessionTodoDockForTab: jest.fn(),
      renderSessionTodoDock: jest.fn(() => {
        callOrder.push('todo');
      }),
      scheduleComposerLayoutSync: jest.fn(),
      updateModelSelectorDisplay: jest.fn(() => {
        callOrder.push('selector');
      }),
      syncActiveTabContextUsageIdentity: jest.fn(() => {
        callOrder.push('context');
      }),
      refreshActiveTabContextUsageFromServer: jest.fn().mockResolvedValue(undefined),
      refreshTabSessionStatus: jest.fn().mockResolvedValue(null),
      refreshPendingQuestionsForTab: jest.fn().mockResolvedValue([]),
      refreshTabSessionTodos: jest.fn().mockResolvedValue([]),
      updateSendButtonState: jest.fn(() => {
        callOrder.push('send');
      }),
    };
    const bridge = new TabViewActivationBridge(host);

    bridge.applyEmptyActivationOutcome('tab-1');

    expect(host.renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
    expect(host.refreshTabSessionStatus).not.toHaveBeenCalled();
    expect(host.refreshPendingQuestionsForTab).not.toHaveBeenCalled();
    expect(host.refreshTabSessionTodos).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['todo', 'question', 'selector', 'context', 'send']);
  });

  it('applies loaded-conversation post-render refreshes in order', () => {
    const callOrder: string[] = [];
    const host: jest.Mocked<TabViewActivationBridgeHost> = {
      setActiveMessagesPane: jest.fn(),
      refreshActiveFocusContextPreview: jest.fn(),
      renderQuestionDock: jest.fn(() => {
        callOrder.push('question');
      }),
      updateSessionTodoDockForTab: jest.fn(),
      renderSessionTodoDock: jest.fn(() => {
        callOrder.push('todo');
      }),
      scheduleComposerLayoutSync: jest.fn(),
      updateModelSelectorDisplay: jest.fn(),
      syncActiveTabContextUsageIdentity: jest.fn(),
      refreshActiveTabContextUsageFromServer: jest.fn().mockResolvedValue(undefined),
      refreshTabSessionStatus: jest.fn(() => {
        callOrder.push('status');
        return Promise.resolve(null);
      }),
      refreshPendingQuestionsForTab: jest.fn(() => {
        callOrder.push('pending-question');
        return Promise.resolve([]);
      }),
      refreshTabSessionTodos: jest.fn(() => {
        callOrder.push('refresh-todo');
        return Promise.resolve([]);
      }),
      updateSendButtonState: jest.fn(),
    };
    const bridge = new TabViewActivationBridge(host);

    bridge.applyLoadedConversationPostRenderRefreshes('tab-1', 'session-1');

    expect(host.renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
    expect(host.refreshTabSessionStatus).toHaveBeenCalledWith('tab-1', 'session-1', { suppressErrors: true });
    expect(host.refreshPendingQuestionsForTab).toHaveBeenCalledWith('tab-1', 'session-1');
    expect(host.refreshTabSessionTodos).toHaveBeenCalledWith('tab-1', 'session-1', { suppressErrors: true });
    expect(callOrder).toEqual(['todo', 'question', 'status', 'pending-question', 'refresh-todo']);
  });

  it('applies loaded-conversation hydration tail refreshes in order', async () => {
    const callOrder: string[] = [];
    const host: jest.Mocked<TabViewActivationBridgeHost> = {
      setActiveMessagesPane: jest.fn(),
      refreshActiveFocusContextPreview: jest.fn(),
      renderQuestionDock: jest.fn(),
      updateSessionTodoDockForTab: jest.fn(),
      renderSessionTodoDock: jest.fn(),
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
      refreshTabSessionStatus: jest.fn().mockResolvedValue(null),
      refreshPendingQuestionsForTab: jest.fn().mockResolvedValue([]),
      refreshTabSessionTodos: jest.fn().mockResolvedValue([]),
      updateSendButtonState: jest.fn(),
    };
    const bridge = new TabViewActivationBridge(host);

    await bridge.applyLoadedConversationHydrationTail();

    expect(host.refreshTabSessionStatus).not.toHaveBeenCalled();
    expect(host.refreshPendingQuestionsForTab).not.toHaveBeenCalled();
    expect(host.refreshTabSessionTodos).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['layout', 'selector', 'context', 'fetch-context']);
  });
});
