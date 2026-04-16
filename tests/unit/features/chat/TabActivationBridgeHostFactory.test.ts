import {
  createTabActivationBridgeHosts,
  type TabActivationBridgeHostFactoryHost,
} from '../../../../src/features/chat/runtime/TabActivationBridgeHostFactory';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createHost(): Mocked<TabActivationBridgeHostFactoryHost> {
  return {
    getActiveTabId: jest.fn().mockReturnValue('tab-active'),
    setActiveMessagesPane: jest.fn(),
    scheduleComposerLayoutSync: jest.fn(),
    updateModelSelectorDisplay: jest.fn(),
    updateSendButtonState: jest.fn(),
    clearMessagesContainer: jest.fn(),
    resetTurnState: jest.fn(),
    scheduleSettledScrollToBottom: jest.fn(),
  };
}

describe('TabActivationBridgeHostFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives view and conversation activation bridge hosts from one shared seam', () => {
    const host = createHost();
    const {
      tabViewActivationBridgeHost,
      tabConversationActivationBridgeHost,
    } = createTabActivationBridgeHosts(host);

    tabViewActivationBridgeHost.setActiveMessagesPane('tab-1');
    tabViewActivationBridgeHost.scheduleComposerLayoutSync();
    tabViewActivationBridgeHost.updateModelSelectorDisplay();
    tabViewActivationBridgeHost.updateSendButtonState();

    expect(tabConversationActivationBridgeHost.getActiveTabId()).toBe('tab-active');
    tabConversationActivationBridgeHost.clearMessagesContainer();
    tabConversationActivationBridgeHost.resetTurnState();
    tabConversationActivationBridgeHost.updateModelSelectorDisplay();
    tabConversationActivationBridgeHost.scheduleSettledScrollToBottom('tab-2');

    expect(host.setActiveMessagesPane).toHaveBeenCalledWith('tab-1');
    expect(host.scheduleComposerLayoutSync).toHaveBeenCalledTimes(1);
    expect(host.updateModelSelectorDisplay).toHaveBeenCalledTimes(2);
    expect(host.updateSendButtonState).toHaveBeenCalledTimes(1);
    expect(host.getActiveTabId).toHaveBeenCalledTimes(1);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);
    expect(host.resetTurnState).toHaveBeenCalledTimes(1);
    expect(host.scheduleSettledScrollToBottom).toHaveBeenCalledWith('tab-2');
  });
});
