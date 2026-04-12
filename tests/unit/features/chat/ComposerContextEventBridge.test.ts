import { ComposerContextEventBridge } from '../../../../src/features/chat/services/ComposerContextEventBridge';

describe('ComposerContextEventBridge', () => {
  it('starts and disposes the focus and catalog bridges together', () => {
    const focusContextEventBridge = {
      start: jest.fn(),
      dispose: jest.fn(),
    };
    const contextFileCatalogEventBridge = {
      start: jest.fn(),
      dispose: jest.fn(),
    };
    const bridge = new ComposerContextEventBridge(
      focusContextEventBridge,
      contextFileCatalogEventBridge,
    );

    bridge.start();
    bridge.dispose();

    expect(focusContextEventBridge.start).toHaveBeenCalledTimes(1);
    expect(contextFileCatalogEventBridge.start).toHaveBeenCalledTimes(1);
    expect(contextFileCatalogEventBridge.dispose).toHaveBeenCalledTimes(1);
    expect(focusContextEventBridge.dispose).toHaveBeenCalledTimes(1);
  });
});
