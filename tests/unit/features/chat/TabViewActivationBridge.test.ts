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
    };
    const bridge = new TabViewActivationBridge(host);

    bridge.applyActivationPreflight('tab-1');

    expect(host.setActiveMessagesPane).toHaveBeenCalledWith('tab-1');
    expect(host.updateSessionTodoDockForTab).toHaveBeenCalledWith('tab-1');
    expect(callOrder).toEqual(['pane', 'focus', 'question', 'todo']);
  });
});
