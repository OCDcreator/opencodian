import {
  TabRuntimeStateBridge,
  type TabRuntimeStateBridgeHost,
} from '../../../../src/features/chat/runtime/TabRuntimeStateBridge';

describe('TabRuntimeStateBridge', () => {
  function createBridge(options?: {
    activeTabId?: string | null;
    runtime?: { isStreaming: boolean } | null;
    messagesContainer?: ParentNode | null;
    hasBackgroundTaskIndicator?: boolean;
  }) {
    const tabManager = {
      setTabStreaming: jest.fn(),
      setTabBackgroundTaskRunning: jest.fn(),
      setTabNeedsAttention: jest.fn(),
    };
    const defaultMessagesContainer = document.createElement('div');
    defaultMessagesContainer.innerHTML = `
      <button class="opencodian-user-action-btn"></button>
      <button class="opencodian-user-action-btn"></button>
    `;
    const host: jest.Mocked<TabRuntimeStateBridgeHost> = {
      getTabManager: jest.fn().mockReturnValue(tabManager),
      getActiveTabId: jest.fn().mockReturnValue(options?.activeTabId ?? 'tab-1'),
      getTabRuntimeState: jest.fn().mockReturnValue(options?.runtime ?? { isStreaming: true }),
      getTabMessagesContainer: jest
        .fn()
        .mockReturnValue(options?.messagesContainer === undefined ? defaultMessagesContainer : options.messagesContainer),
      hasBackgroundTaskIndicator: jest.fn().mockReturnValue(options?.hasBackgroundTaskIndicator ?? true),
      updateSendButtonState: jest.fn(),
    };

    return {
      bridge: new TabRuntimeStateBridge(host),
      host,
      tabManager,
      messagesContainer: defaultMessagesContainer,
    };
  }

  it('syncs tab badges, user message actions, and the active send button', () => {
    const { bridge, host, tabManager, messagesContainer } = createBridge();

    bridge.syncStreamLikeState('tab-1');

    expect(tabManager.setTabStreaming).toHaveBeenCalledWith('tab-1', true);
    expect(tabManager.setTabBackgroundTaskRunning).toHaveBeenCalledWith('tab-1', true);
    messagesContainer.querySelectorAll<HTMLButtonElement>('.opencodian-user-action-btn').forEach((button) => {
      expect(button.disabled).toBe(true);
    });
    expect(host.updateSendButtonState).toHaveBeenCalledTimes(1);
  });

  it('only refreshes the send button when no tab is available', () => {
    const { bridge, host, tabManager } = createBridge();

    bridge.syncStreamLikeState(null);

    expect(host.updateSendButtonState).toHaveBeenCalledTimes(1);
    expect(tabManager.setTabStreaming).not.toHaveBeenCalled();
    expect(tabManager.setTabBackgroundTaskRunning).not.toHaveBeenCalled();
  });

  it('can sync inactive tabs without a messages container', () => {
    const { bridge, host, tabManager, messagesContainer } = createBridge({
      activeTabId: 'tab-2',
      runtime: { isStreaming: false },
      messagesContainer: null,
      hasBackgroundTaskIndicator: false,
    });

    bridge.syncStreamLikeState('tab-1');

    expect(tabManager.setTabStreaming).toHaveBeenCalledWith('tab-1', false);
    expect(tabManager.setTabBackgroundTaskRunning).toHaveBeenCalledWith('tab-1', false);
    expect(host.updateSendButtonState).not.toHaveBeenCalled();
    messagesContainer.querySelectorAll<HTMLButtonElement>('.opencodian-user-action-btn').forEach((button) => {
      expect(button.disabled).toBe(false);
    });
  });

  it('routes attention markers through the tab manager only for concrete tabs', () => {
    const { bridge, tabManager } = createBridge();

    bridge.setNeedsAttention(null, true);
    bridge.setNeedsAttention('tab-1', true);

    expect(tabManager.setTabNeedsAttention).toHaveBeenCalledTimes(1);
    expect(tabManager.setTabNeedsAttention).toHaveBeenCalledWith('tab-1', true);
  });
});
