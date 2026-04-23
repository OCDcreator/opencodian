import type { App, EventRef } from 'obsidian';

import { ProjectConfigFileWatcher } from '../../../../src/features/settings/ProjectConfigFileWatcher';

type VaultEventName = 'create' | 'modify' | 'delete' | 'rename';

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createHarness(options: {
  basePath?: string;
  configPath?: string;
  onChange?: jest.Mock;
} = {}) {
  const vaultListeners = new Map<EventRef, { name: VaultEventName; listener: (...args: unknown[]) => void }>();
  const vaultOn = jest.fn((name: VaultEventName, listener: (...args: unknown[]) => void) => {
    const eventRef = { name, id: `${name}-${vaultListeners.size + 1}` } as EventRef;
    vaultListeners.set(eventRef, { name, listener });
    return eventRef;
  });
  const offref = jest.fn((ref: EventRef) => {
    vaultListeners.delete(ref);
  });
  const app = {
    vault: {
      adapter: {
        basePath: options.basePath,
      },
      on: vaultOn,
      offref,
    },
  } as unknown as App;
  const onChange = options.onChange ?? jest.fn();
  const watcher = new ProjectConfigFileWatcher({
    app,
    configPath: options.configPath ?? `${options.basePath ?? '/vault'}/.opencode/opencode.json`,
    onChange,
  });

  return {
    emitVault: (name: VaultEventName, ...args: unknown[]) => {
      for (const { name: eventName, listener } of vaultListeners.values()) {
        if (eventName === name) {
          listener(...args);
        }
      }
    },
    offref,
    onChange,
    vaultOn,
    watcher,
  };
}

describe('ProjectConfigFileWatcher', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('notifies once when the watched project config file changes repeatedly', () => {
    const { emitVault, onChange, vaultOn, watcher } = createHarness({
      basePath: '/vault',
      configPath: '/vault/.opencode/opencode.json',
    });

    watcher.start();

    expect(vaultOn).toHaveBeenNthCalledWith(1, 'create', expect.any(Function));
    expect(vaultOn).toHaveBeenNthCalledWith(2, 'modify', expect.any(Function));
    expect(vaultOn).toHaveBeenNthCalledWith(3, 'delete', expect.any(Function));
    expect(vaultOn).toHaveBeenNthCalledWith(4, 'rename', expect.any(Function));

    emitVault('modify', { path: 'notes/unrelated.md' });
    expect(onChange).not.toHaveBeenCalled();

    emitVault('modify', { path: '.opencode/opencode.json' });
    emitVault('create', { path: '.opencode/opencode.json' });
    emitVault('delete', { path: '.opencode/opencode.json' });

    expect(onChange).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('notifies when rename moves the watched config path in either direction', () => {
    const { emitVault, onChange, watcher } = createHarness({
      basePath: '/vault',
      configPath: '/vault/.opencode/opencode.json',
    });

    watcher.start();

    emitVault('rename', { path: '.opencode/opencode.json' }, '.opencode/opencode.tmp');
    jest.advanceTimersByTime(100);
    emitVault('rename', { path: '.opencode/opencode.tmp' }, '.opencode/opencode.json');
    jest.advanceTimersByTime(100);
    emitVault('rename', { path: 'notes/next.md' }, 'notes/prev.md');
    jest.advanceTimersByTime(100);

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('cleans up vault event refs on dispose', () => {
    const { offref, watcher } = createHarness({
      basePath: '/vault',
      configPath: '/vault/.opencode/opencode.json',
    });

    watcher.start();
    watcher.dispose();

    expect(offref).toHaveBeenCalledTimes(4);
  });

  it('cancels pending change notifications on dispose', () => {
    const { emitVault, onChange, watcher } = createHarness({
      basePath: '/vault',
      configPath: '/vault/.opencode/opencode.json',
    });

    watcher.start();
    emitVault('modify', { path: '.opencode/opencode.json' });
    watcher.dispose();
    jest.advanceTimersByTime(100);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not register listeners when the config path is outside the vault', () => {
    const { onChange, vaultOn, watcher } = createHarness({
      basePath: '/vault',
      configPath: '/elsewhere/.opencode/opencode.json',
    });

    watcher.start();

    expect(vaultOn).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('logs rejected async change callbacks', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const onChange = jest.fn().mockRejectedValue(new Error('refresh failed'));
    const { emitVault, watcher } = createHarness({
      basePath: '/vault',
      configPath: '/vault/.opencode/opencode.json',
      onChange,
    });

    watcher.start();
    emitVault('modify', { path: '.opencode/opencode.json' });
    jest.advanceTimersByTime(100);
    await flushAsync();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ProjectConfigFileWatcher] Project config change handler failed'),
      expect.any(Error),
    );
  });
});
