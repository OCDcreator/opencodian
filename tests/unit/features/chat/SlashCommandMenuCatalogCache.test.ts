import type { Command as RuntimeCommand } from '@opencode-ai/sdk/v2/client';

import {
  SlashCommandMenuCatalogCache,
  type SlashCommandMenuCatalogCacheHost,
} from '../../../../src/features/chat/services/SlashCommandMenuCatalogCache';

function createRuntimeCommand(
  overrides: Partial<RuntimeCommand> & { name: string },
): RuntimeCommand {
  return {
    name: overrides.name,
    template: '',
    description: '',
    source: 'command',
    subtask: false,
    agent: '',
    model: '',
    ...overrides,
  } as RuntimeCommand;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function createHost(
  overrides: Partial<SlashCommandMenuCatalogCacheHost> = {},
): jest.Mocked<SlashCommandMenuCatalogCacheHost> {
  return {
    getHiddenCommandIds: jest.fn(() => []),
    loadProjectAgents: jest.fn().mockResolvedValue({}),
    loadProjectCommands: jest.fn().mockResolvedValue({}),
    loadRuntimeCommands: jest.fn().mockResolvedValue([
      createRuntimeCommand({
        name: 'review',
        description: 'Review code',
      }),
    ]),
    onWarmLoadFailed: jest.fn(),
    ...overrides,
  } as jest.Mocked<SlashCommandMenuCatalogCacheHost>;
}

describe('SlashCommandMenuCatalogCache', () => {
  it('caches merged slash menu items for repeated loads', async () => {
    const host = createHost();
    const cache = new SlashCommandMenuCatalogCache(host);

    const first = await cache.load();
    const second = await cache.load();

    expect(first).toEqual([{
      id: 'review',
      description: 'Review code',
      hasProjectOverride: false,
      runtimeAvailable: true,
      subtask: false,
    }]);
    expect(second).toBe(first);
    expect(host.loadRuntimeCommands).toHaveBeenCalledTimes(1);
    expect(host.loadProjectCommands).toHaveBeenCalledTimes(1);
    expect(host.loadProjectAgents).toHaveBeenCalledTimes(1);
  });

  it('shares an in-flight warm load with the first user-triggered load', async () => {
    const deferredRuntimeCommands = createDeferred<RuntimeCommand[]>();
    const host = createHost({
      loadRuntimeCommands: jest.fn(() => deferredRuntimeCommands.promise),
    });
    const cache = new SlashCommandMenuCatalogCache(host);

    cache.warm();
    const userLoad = cache.load();

    expect(host.loadRuntimeCommands).toHaveBeenCalledTimes(1);

    deferredRuntimeCommands.resolve([
      createRuntimeCommand({
        name: 'commit',
        description: 'Create commit',
      }),
    ]);

    await expect(userLoad).resolves.toEqual([{
      id: 'commit',
      description: 'Create commit',
      hasProjectOverride: false,
      runtimeAvailable: true,
      subtask: false,
    }]);
    expect(host.onWarmLoadFailed).not.toHaveBeenCalled();
  });

  it('reloads when hidden command ids change', async () => {
    let hiddenCommandIds: string[] = [];
    const host = createHost({
      getHiddenCommandIds: jest.fn(() => hiddenCommandIds),
      loadRuntimeCommands: jest.fn().mockResolvedValue([
        createRuntimeCommand({ name: 'commit' }),
        createRuntimeCommand({ name: 'review' }),
      ]),
    });
    const cache = new SlashCommandMenuCatalogCache(host);

    expect((await cache.load()).map((item) => item.id)).toEqual(['commit', 'review']);

    hiddenCommandIds = ['review'];

    expect((await cache.load()).map((item) => item.id)).toEqual(['commit']);
    expect(host.loadRuntimeCommands).toHaveBeenCalledTimes(2);
  });

  it('keeps warm-load failures out of the user-visible load cache', async () => {
    const host = createHost({
      loadRuntimeCommands: jest.fn()
        .mockRejectedValueOnce(new Error('server not ready'))
        .mockResolvedValueOnce([
          createRuntimeCommand({
            name: 'init',
            description: 'Guided setup',
          }),
        ]),
    });
    const cache = new SlashCommandMenuCatalogCache(host);

    cache.warm();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(host.onWarmLoadFailed).toHaveBeenCalledTimes(1);
    await expect(cache.load()).resolves.toEqual([{
      id: 'init',
      description: 'Guided setup',
      hasProjectOverride: false,
      runtimeAvailable: true,
      subtask: false,
    }]);
    expect(host.loadRuntimeCommands).toHaveBeenCalledTimes(2);
  });
});
