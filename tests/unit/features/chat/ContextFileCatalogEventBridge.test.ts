import type { App, EventRef } from 'obsidian';

import {
  ContextFileCatalogEventBridge,
  type ContextFileCatalogEventBridgeHost,
} from '../../../../src/features/chat/services/ContextFileCatalogEventBridge';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createHarness() {
  const vaultListeners = new Map<string, (...args: unknown[]) => void>();
  const vaultOn = jest.fn((name: string, listener: (...args: unknown[]) => void) => {
    vaultListeners.set(name, listener);
    return { name } as EventRef;
  });
  const app = {
    vault: {
      on: vaultOn,
    },
  } as unknown as App;
  const contextFileCatalogService = {
    handleCreate: jest.fn(),
    handleDelete: jest.fn(),
    handleRename: jest.fn(),
  };
  const host: Mocked<ContextFileCatalogEventBridgeHost> = {
    registerEvent: jest.fn(),
  };
  const bridge = new ContextFileCatalogEventBridge(app, contextFileCatalogService, host);

  return {
    bridge,
    contextFileCatalogService,
    host,
    vaultOn,
    emitVault: (name: string, ...args: unknown[]) => {
      const listener = vaultListeners.get(name);
      if (!listener) {
        throw new Error(`Missing vault listener for ${name}`);
      }
      listener(...args);
    },
  };
}

describe('ContextFileCatalogEventBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers vault mutation listeners through the catalog service', () => {
    const { bridge, host, vaultOn, contextFileCatalogService, emitVault } = createHarness();

    bridge.start();

    expect(vaultOn).toHaveBeenNthCalledWith(1, 'create', expect.any(Function));
    expect(vaultOn).toHaveBeenNthCalledWith(2, 'delete', expect.any(Function));
    expect(vaultOn).toHaveBeenNthCalledWith(3, 'rename', expect.any(Function));
    expect(host.registerEvent).toHaveBeenCalledTimes(3);

    emitVault('create', { path: 'notes/new.md' });
    emitVault('delete', { path: 'notes/old.md' });
    emitVault('rename', { path: 'notes/next.md' }, 'notes/prev.md');

    expect(contextFileCatalogService.handleCreate).toHaveBeenCalledWith({ path: 'notes/new.md' });
    expect(contextFileCatalogService.handleDelete).toHaveBeenCalledWith({ path: 'notes/old.md' });
    expect(contextFileCatalogService.handleRename).toHaveBeenCalledWith(
      { path: 'notes/next.md' },
      'notes/prev.md',
    );
  });

  it('treats dispose as a no-op', () => {
    const { bridge } = createHarness();

    expect(() => bridge.dispose()).not.toThrow();
  });
});
