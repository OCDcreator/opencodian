/**
 * ServerManager occupied local endpoint resolution tests
 */

import { ServerManager } from '../../../../src/core/opencode/ServerManager';

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  requestUrl: jest.fn(),
}));

jest.mock('child_process', () => ({
  spawn: jest.fn().mockReturnValue({
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    kill: jest.fn(),
    stdout: { on: jest.fn(), removeListener: jest.fn() },
    stderr: { on: jest.fn(), removeListener: jest.fn() },
    killed: false,
  }),
  spawnSync: jest.fn().mockReturnValue({ status: 0, error: null }),
}));

jest.mock('net', () => ({
  createServer: jest.fn().mockReturnValue({
    once: jest.fn().mockReturnThis(),
    listen: jest.fn().mockReturnThis(),
    close: jest.fn(),
  }),
}));

const defaultConfig = {
  mode: 'local' as const,
  baseUrl: 'http://127.0.0.1:4196',
  local: {
    host: '127.0.0.1',
    port: 4196,
    autoStart: true,
  },
  auth: {
    type: 'none' as const,
    username: 'opencode',
    password: '',
    token: '',
  },
  modelSourceMode: 'merge' as const,
  pluginIsolationMode: 'default' as const,
};

describe('ServerManager occupied local endpoint resolution', () => {
  let manager: ServerManager;

  beforeEach(() => {
    manager = new ServerManager(defaultConfig);
    jest.clearAllMocks();
  });

  it('centralizes healthy occupied local endpoint resolution for stale managed servers', async () => {
    jest.spyOn(manager as never, 'tryAdoptManagedServer').mockResolvedValue('restart');

    await expect((manager as never).resolveOccupiedHealthyLocalEndpoint()).resolves.toEqual({
      action: 'restart-managed',
    });
  });

  it('marks a custom-port healthy server as conflict instead of silently reusing it', async () => {
    manager = new ServerManager({
      ...defaultConfig,
      baseUrl: 'http://127.0.0.1:5000',
      local: {
        host: '127.0.0.1',
        port: 5000,
        autoStart: true,
      },
    });

    jest.spyOn(manager as never, 'isPortAvailable').mockResolvedValue(false);
    jest.spyOn(manager, 'checkHealth').mockResolvedValue(true);
    jest.spyOn(manager as never, 'tryAdoptManagedServer').mockResolvedValue('skip');
    jest.spyOn(manager as never, 'inspectExistingHealthyServer').mockResolvedValue({
      pid: 4321,
      commandLine: 'opencode serve --port 5000 --hostname 127.0.0.1',
      looksLikeOpenCodeServe: true,
    });

    await expect(manager.start()).rejects.toThrow(/occupies local endpoint 127.0.0.1:5000/i);
    expect(manager.getStatus()).toBe('conflict');
    expect(manager.getServerDiagnosticsSnapshot()).toMatchObject({
      reason: 'local-conflict',
      host: '127.0.0.1',
      port: 5000,
      pid: 4321,
    });
  });

  it('builds conflict diagnostics from the occupied local endpoint resolution seam', async () => {
    manager = new ServerManager({
      ...defaultConfig,
      baseUrl: 'http://127.0.0.1:5000',
      local: {
        host: '127.0.0.1',
        port: 5000,
        autoStart: true,
      },
    });

    jest.spyOn(manager as never, 'tryAdoptManagedServer').mockResolvedValue('skip');
    jest.spyOn(manager as never, 'inspectExistingHealthyServer').mockResolvedValue({
      pid: 4321,
      commandLine: 'opencode serve --port 5000 --hostname 127.0.0.1',
      looksLikeOpenCodeServe: true,
    });
    jest.spyOn(manager as never, 'shouldRecycleUnknownLocalServer').mockResolvedValue(false);

    await expect((manager as never).resolveOccupiedHealthyLocalEndpoint()).resolves.toMatchObject({
      action: 'conflict',
      diagnostics: {
        reason: 'local-conflict',
        host: '127.0.0.1',
        port: 5000,
        pid: 4321,
        commandLine: 'opencode serve --port 5000 --hostname 127.0.0.1',
      },
    });
  });

  it('does not recycle a healthy default-port OpenCode server unless it looks plugin-managed', async () => {
    jest.spyOn(manager as never, 'tryAdoptManagedServer').mockResolvedValue('skip');
    jest.spyOn(manager as never, 'inspectExistingHealthyServer').mockResolvedValue({
      pid: 5678,
      commandLine: 'opencode serve --port 4196 --hostname 127.0.0.1',
      looksLikeOpenCodeServe: true,
      looksLikePluginManagedSidecar: false,
    });

    await expect((manager as never).resolveOccupiedHealthyLocalEndpoint()).resolves.toMatchObject({
      action: 'conflict',
      diagnostics: {
        reason: 'local-conflict',
        pid: 5678,
      },
    });
  });

  it('recycles an orphaned default-port OpenCode sidecar and restarts the current vault service', async () => {
    jest.spyOn(manager as never, 'isPortAvailable').mockResolvedValue(false);
    jest.spyOn(manager, 'checkHealth').mockResolvedValue(true);
    jest.spyOn(manager as never, 'tryAdoptManagedServer').mockResolvedValue('skip');
    jest.spyOn(manager as never, 'inspectExistingHealthyServer').mockResolvedValue({
      pid: 5678,
      commandLine: 'opencode serve --port 4196 --hostname 127.0.0.1 --cors app://obsidian.md --cors app://obsidian',
      looksLikeOpenCodeServe: true,
      looksLikePluginManagedSidecar: true,
    });
    const recycleUnknownLocalServer = jest.spyOn(manager as never, 'recycleUnknownLocalServer').mockResolvedValue(undefined);
    const spawnServer = jest.spyOn(manager as never, 'spawnServer').mockResolvedValue(undefined);
    const waitForHealthy = jest.spyOn(manager as never, 'waitForHealthy').mockResolvedValue(undefined);
    jest.spyOn(manager as never, 'getListeningProcessId').mockResolvedValue(5678);

    await expect(manager.start()).resolves.toBeUndefined();

    expect(recycleUnknownLocalServer).toHaveBeenCalled();
    expect(spawnServer).toHaveBeenCalled();
    expect(waitForHealthy).toHaveBeenCalledWith(30000);
    expect(manager.getStatus()).toBe('running');
    expect(manager.getServerDiagnosticsSnapshot()).toMatchObject({
      reason: 'local-orphan-restarted',
      host: '127.0.0.1',
      port: 4196,
      pid: 5678,
    });
  });
});
