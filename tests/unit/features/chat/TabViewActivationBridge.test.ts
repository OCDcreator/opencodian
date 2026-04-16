import {
  TabViewActivationBridge,
  type TabViewActivationBridgeHost,
} from '../../../../src/features/chat/runtime/TabViewActivationBridge';
import type { ActiveTabContextUsageCoordinator } from '../../../../src/features/chat/services/ActiveTabContextUsageCoordinator';
import type { BackgroundTaskActivationIndicatorCoordinator } from '../../../../src/features/chat/services/BackgroundTaskActivationIndicatorCoordinator';
import type { FocusContextPreviewCoordinator } from '../../../../src/features/chat/services/FocusContextPreviewCoordinator';
import type { QuestionTodoActivationRefreshCoordinator } from '../../../../src/features/chat/services/QuestionTodoActivationRefreshCoordinator';

type ActiveTabContextUsagePort = Pick<
  ActiveTabContextUsageCoordinator,
  'syncIdentity' | 'refreshFromServer'
>;

type FocusContextPreviewPort = Pick<
  FocusContextPreviewCoordinator,
  'refreshActiveFocusContextPreview'
>;

type BackgroundTaskActivationIndicatorPort = Pick<
  BackgroundTaskActivationIndicatorCoordinator,
  'renderLoadedConversationIndicator'
>;

type QuestionTodoActivationRefreshPort = Pick<
  QuestionTodoActivationRefreshCoordinator,
  'applyActivationPreflight' | 'applyConversationActivation' | 'applyEmptyActivation'
>;

function createHost(callOrder: string[]): jest.Mocked<TabViewActivationBridgeHost> {
  return {
    setActiveMessagesPane: jest.fn(() => {
      callOrder.push('pane');
    }),
    scheduleComposerLayoutSync: jest.fn(() => {
      callOrder.push('layout');
    }),
    updateModelSelectorDisplay: jest.fn(() => {
      callOrder.push('selector');
    }),
    updateSendButtonState: jest.fn(() => {
      callOrder.push('send');
    }),
  };
}

function createFocusContextPreviewCoordinator(
  callOrder: string[],
): jest.Mocked<FocusContextPreviewPort> {
  return {
    refreshActiveFocusContextPreview: jest.fn(() => {
      callOrder.push('focus');
    }),
  };
}

function createContextUsageCoordinator(
  callOrder: string[],
): jest.Mocked<ActiveTabContextUsagePort> {
  return {
    syncIdentity: jest.fn(() => {
      callOrder.push('context');
    }),
    refreshFromServer: jest.fn(() => {
      callOrder.push('fetch-context');
      return Promise.resolve(undefined);
    }),
  };
}

function createBackgroundTaskCoordinator(
  callOrder: string[],
): jest.Mocked<BackgroundTaskActivationIndicatorPort> {
  return {
    renderLoadedConversationIndicator: jest.fn(() => {
      callOrder.push('indicator');
      return Promise.resolve(undefined);
    }),
  };
}

function createRefreshCoordinator(
  callOrder: string[],
): jest.Mocked<QuestionTodoActivationRefreshPort> {
  return {
    applyActivationPreflight: jest.fn(() => {
      callOrder.push('preflight-refresh');
    }),
    applyConversationActivation: jest.fn(() => {
      callOrder.push('activation-refresh');
    }),
    applyEmptyActivation: jest.fn(() => {
      callOrder.push('empty-refresh');
    }),
  };
}

describe('TabViewActivationBridge', () => {
  it('applies pane activation preflight UI refreshes in order', () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const focusContextPreviewCoordinator = createFocusContextPreviewCoordinator(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const backgroundTaskCoordinator = createBackgroundTaskCoordinator(callOrder);
    const contextUsageCoordinator = createContextUsageCoordinator(callOrder);
    const bridge = new TabViewActivationBridge({
      host,
      focusContextPreviewCoordinator,
      questionTodoActivationRefreshCoordinator: refreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator: backgroundTaskCoordinator,
      activeTabContextUsageCoordinator: contextUsageCoordinator,
    });

    bridge.applyActivationPreflight('tab-1');

    expect(host.setActiveMessagesPane).toHaveBeenCalledWith('tab-1');
    expect(focusContextPreviewCoordinator.refreshActiveFocusContextPreview).toHaveBeenCalledTimes(1);
    expect(refreshCoordinator.applyActivationPreflight).toHaveBeenCalledWith('tab-1');
    expect(refreshCoordinator.applyConversationActivation).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['pane', 'focus', 'preflight-refresh']);
  });

  it('applies streaming activation outcome UI refreshes in order', () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const focusContextPreviewCoordinator = createFocusContextPreviewCoordinator(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const backgroundTaskCoordinator = createBackgroundTaskCoordinator(callOrder);
    const contextUsageCoordinator = createContextUsageCoordinator(callOrder);
    const bridge = new TabViewActivationBridge({
      host,
      focusContextPreviewCoordinator,
      questionTodoActivationRefreshCoordinator: refreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator: backgroundTaskCoordinator,
      activeTabContextUsageCoordinator: contextUsageCoordinator,
    });

    bridge.applyStreamingActivationOutcome('tab-1', 'session-1');

    expect(refreshCoordinator.applyConversationActivation).toHaveBeenCalledWith(
      'tab-1',
      'session-1',
    );
    expect(callOrder).toEqual([
      'selector',
      'context',
      'activation-refresh',
      'send',
    ]);
  });

  it('applies empty-tab activation outcome UI refreshes in order', () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const focusContextPreviewCoordinator = createFocusContextPreviewCoordinator(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const backgroundTaskCoordinator = createBackgroundTaskCoordinator(callOrder);
    const contextUsageCoordinator = createContextUsageCoordinator(callOrder);
    const bridge = new TabViewActivationBridge({
      host,
      focusContextPreviewCoordinator,
      questionTodoActivationRefreshCoordinator: refreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator: backgroundTaskCoordinator,
      activeTabContextUsageCoordinator: contextUsageCoordinator,
    });

    bridge.applyEmptyActivationOutcome('tab-1');

    expect(refreshCoordinator.applyEmptyActivation).toHaveBeenCalledWith('tab-1');
    expect(refreshCoordinator.applyConversationActivation).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['empty-refresh', 'selector', 'context', 'send']);
  });

  it('applies loaded-conversation post-render outcome in order', async () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const focusContextPreviewCoordinator = createFocusContextPreviewCoordinator(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const backgroundTaskCoordinator = createBackgroundTaskCoordinator(callOrder);
    const contextUsageCoordinator = createContextUsageCoordinator(callOrder);
    const bridge = new TabViewActivationBridge({
      host,
      focusContextPreviewCoordinator,
      questionTodoActivationRefreshCoordinator: refreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator: backgroundTaskCoordinator,
      activeTabContextUsageCoordinator: contextUsageCoordinator,
    });

    await bridge.applyLoadedConversationPostRenderOutcome('tab-1', 'session-1');

    expect(backgroundTaskCoordinator.renderLoadedConversationIndicator).toHaveBeenCalledWith(
      'tab-1',
    );
    expect(refreshCoordinator.applyConversationActivation).toHaveBeenCalledWith(
      'tab-1',
      'session-1',
    );
    expect(callOrder).toEqual(['indicator', 'activation-refresh']);
  });

  it('applies loaded-conversation hydration tail refreshes in order', async () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const focusContextPreviewCoordinator = createFocusContextPreviewCoordinator(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const backgroundTaskCoordinator = createBackgroundTaskCoordinator(callOrder);
    const contextUsageCoordinator = createContextUsageCoordinator(callOrder);
    const bridge = new TabViewActivationBridge({
      host,
      focusContextPreviewCoordinator,
      questionTodoActivationRefreshCoordinator: refreshCoordinator,
      backgroundTaskActivationIndicatorCoordinator: backgroundTaskCoordinator,
      activeTabContextUsageCoordinator: contextUsageCoordinator,
    });

    await bridge.applyLoadedConversationHydrationTail();

    expect(refreshCoordinator.applyActivationPreflight).not.toHaveBeenCalled();
    expect(refreshCoordinator.applyConversationActivation).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['layout', 'selector', 'context', 'fetch-context']);
  });
});
