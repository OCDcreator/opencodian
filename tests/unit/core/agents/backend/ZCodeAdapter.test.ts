/**
 * ZCodeAdapter.test.ts — registration surface, handshake, failure, and
 * cleanup semantics for the ZCode backend.
 *
 * Failure-path focused: absent runtime, handshake timeout, spawn failure and
 * premature exit must all end in honest error states with no orphan process.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { ZCodeAdapter } from '../../../../../src/core/agents/backend/zcode/ZCodeAdapter';
import type { ZCodeAppServerTransport } from '../../../../../src/core/agents/backend/zcode/ZCodeAppServerTransport';
import { ZCodeTransportError } from '../../../../../src/core/agents/backend/zcode/ZCodeAppServerTransport';
import type { ZCodeProviderConfigSnapshot } from '../../../../../src/core/agents/backend/zcode/ZCodeProviderConfigDiscovery';
import type {
  ZCodeRuntimeLaunch,
  ZCodeRuntimeResolution,
} from '../../../../../src/core/agents/backend/zcode/ZCodeRuntimeResolver';

const launch: ZCodeRuntimeLaunch = {
  command: '/runtime/zcode-agent',
  args: ['app-server', '--stdio'],
  entryKind: 'native-binary',
  entryPath: '/runtime/zcode-agent',
  source: 'app-bundled',
  extraEnv: {},
};

const readyResolution: ZCodeRuntimeResolution = { mode: 'ready', launch };

const providerConfig: ZCodeProviderConfigSnapshot = {
  dataRoot: '/home/tester/.zcode',
  configPath: '/home/tester/.zcode/cli/config.json',
  state: 'validated',
  providerCount: 3,
  detail: null,
  env: { ZCODE_STORAGE_DIR: '/home/tester/.zcode' },
};

interface FakeTransport {
  start: jest.Mock<() => Promise<void>>;
  request: jest.Mock<(method: string, params?: Record<string, unknown>) => Promise<unknown>>;
  dispose: jest.Mock<() => void>;
  onNotification: jest.Mock<() => { dispose: () => void }>;
  onServerRequest: jest.Mock<() => { dispose: () => void }>;
}

function createFakeTransport(overrides: Partial<FakeTransport> = {}): FakeTransport {
  return {
    start: jest.fn(async () => {}),
    request: jest.fn(async () => ({ independentPlanState: true })),
    dispose: jest.fn(),
    onNotification: jest.fn(() => ({ dispose: jest.fn() })),
    onServerRequest: jest.fn(() => ({ dispose: jest.fn() })),
    ...overrides,
  };
}

describe('ZCodeAdapter — start, handshake, failure, cleanup', () => {
  let fakeTransport: FakeTransport;
  let capturedTransportOptions: ConstructorParameters<typeof ZCodeAppServerTransport>[0] | null;

  function createAdapter(options: {
    resolution?: ZCodeRuntimeResolution;
    handshakeError?: unknown;
  } = {}): ZCodeAdapter {
    fakeTransport = createFakeTransport(options.handshakeError
      ? { request: jest.fn(async () => { throw options.handshakeError; }) }
      : {});
    capturedTransportOptions = null;
    return new ZCodeAdapter({
      workingDirectory: '/vault',
      resolveRuntime: () => options.resolution ?? readyResolution,
      discoverProviderConfig: () => providerConfig,
      createTransport: (transportOptions) => {
        capturedTransportOptions = transportOptions;
        return fakeTransport as unknown as ZCodeAppServerTransport;
      },
      handshakeTimeoutMs: 500,
    });
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('completes the capability handshake and reports ready', async () => {
    const adapter = createAdapter();
    const statuses: string[] = [];
    adapter.onStatusChange((status) => { statuses.push(status); });

    await adapter.start();

    expect(adapter.status).toBe('connected');
    expect(statuses).toEqual(['connecting', 'connected']);
    expect(fakeTransport.request).toHaveBeenCalledWith('runtime/capabilities', {});
    const diagnostics = adapter.getRuntimeDiagnostics();
    expect(diagnostics.handshake).toBe('ready');
    expect(diagnostics.capabilities?.independentPlanState).toBe(true);
    expect(diagnostics.resolution).toEqual(readyResolution);
  });

  it('injects the discovered provider configuration env into the owned process', async () => {
    const adapter = createAdapter();
    await adapter.start();
    expect(capturedTransportOptions?.extraEnv).toEqual({
      ZCODE_STORAGE_DIR: '/home/tester/.zcode',
    });
    expect(capturedTransportOptions?.workingDirectory).toBe('/vault');
    expect(adapter.getRuntimeDiagnostics().providerConfig?.state).toBe('validated');
  });

  it('fails honestly and actionably when the runtime is missing', async () => {
    const adapter = createAdapter({
      resolution: { mode: 'missing', reason: 'runtime-not-found', searched: ['/opt/glm'] },
    });

    await expect(adapter.start()).rejects.toThrow('ZCode runtime was not found');
    expect(adapter.status).toBe('error');
    expect(fakeTransport.start).not.toHaveBeenCalled();
    const diagnostics = adapter.getRuntimeDiagnostics();
    expect(diagnostics.handshake).toBe('failed');
    expect(diagnostics.lastError).toContain('ZCODE_AGENT_WORKDIR');
  });

  it('fails on a bad configured override without starting a process', async () => {
    const adapter = createAdapter({
      resolution: { mode: 'missing', reason: 'configured-path-not-found', configuredPath: '/bad/path', searched: ['/bad/path'] },
    });
    await expect(adapter.start()).rejects.toThrow('/bad/path');
    expect(fakeTransport.start).not.toHaveBeenCalled();
    expect(adapter.status).toBe('error');
  });

  it('disposes the owned process and reports failure when the handshake times out', async () => {
    const adapter = createAdapter({
      handshakeError: new ZCodeTransportError('timeout', 'timed out', { method: 'runtime/capabilities' }),
    });

    await expect(adapter.start()).rejects.toThrow('capability handshake timed out');
    expect(fakeTransport.dispose).toHaveBeenCalledTimes(1);
    expect(adapter.status).toBe('error');
    expect(adapter.getRuntimeDiagnostics().lastError).toContain('timed out');
  });

  it('normalizes premature process exit into a scoped handshake failure', async () => {
    const adapter = createAdapter({
      handshakeError: new ZCodeTransportError('process-exit', 'ZCode app-server process exited', { exitCode: 1 }),
    });

    await expect(adapter.start()).rejects.toThrow('exited before the capability handshake completed');
    expect(fakeTransport.dispose).toHaveBeenCalledTimes(1);
    expect(adapter.status).toBe('error');
  });

  it('propagates spawn failure without leaving an orphan', async () => {
    fakeTransport = createFakeTransport({ start: jest.fn(async () => { throw new ZCodeTransportError('spawn-failed', 'ENOENT'); }) });
    capturedTransportOptions = null;
    const adapter = new ZCodeAdapter({
      resolveRuntime: () => readyResolution,
      discoverProviderConfig: () => providerConfig,
      createTransport: () => fakeTransport as unknown as ZCodeAppServerTransport,
    });

    await expect(adapter.start()).rejects.toThrow();
    expect(fakeTransport.dispose).toHaveBeenCalledTimes(1);
    expect(adapter.status).toBe('error');
  });

  it('routes a connected-phase process exit to an honest error state', async () => {
    const adapter = createAdapter();
    await adapter.start();
    expect(capturedTransportOptions?.onExit).toBeDefined();

    capturedTransportOptions?.onExit?.({ exitCode: 1, signal: null });

    expect(adapter.status).toBe('error');
    expect(adapter.getRuntimeDiagnostics().lastError).toContain('process exited');
  });

  it('ignores process exit after an explicit stop (no stale error state)', async () => {
    const adapter = createAdapter();
    await adapter.start();
    await adapter.stop();

    capturedTransportOptions?.onExit?.({ exitCode: null, signal: 'SIGTERM' });

    expect(adapter.status).toBe('disconnected');
  });

  it('stop disposes the owned process and resets to disconnected (idempotent)', async () => {
    const adapter = createAdapter();
    await adapter.start();

    await adapter.stop();
    await adapter.stop();

    expect(fakeTransport.dispose).toHaveBeenCalledTimes(1);
    expect(adapter.status).toBe('disconnected');
  });

  it('dispose cleans up without throwing', async () => {
    const adapter = createAdapter();
    await adapter.start();
    adapter.dispose();
    adapter.dispose();
    expect(fakeTransport.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('ZCodeAdapter — settings-driven resolution', () => {
  it('passes the live executable override to the resolver on start', async () => {
    const resolveRuntime = jest.fn(() => readyResolution);
    const fakeTransport = createFakeTransport();
    const adapter = new ZCodeAdapter({
      getSettings: () => ({ executablePath: '/custom/zcode-agent' }),
      resolveRuntime: resolveRuntime as unknown as (options: never) => ZCodeRuntimeResolution,
      discoverProviderConfig: () => providerConfig,
      createTransport: () => fakeTransport as unknown as ZCodeAppServerTransport,
    });

    await adapter.start();
    expect(resolveRuntime).toHaveBeenCalledWith(expect.objectContaining({ executablePath: '/custom/zcode-agent' }));
    await adapter.stop();
  });
});
