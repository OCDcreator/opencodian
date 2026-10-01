/**
 * Real unit tests for CodexAdapter reconnect integration, deprecation notice
 * handling, and the settings-facing account-usage / plugin passthrough
 * methods (the B4 consumption seam).
 *
 * Reconnect: the transport constructor options (`onReconnect` /
 * `onReconnectFailed`) are captured from the default client construction and
 * invoked directly; loaded threads are re-resumed and in-flight streams
 * receive an interruption error chunk.
 */

const mockRegisterServerRequestHandler = jest.fn();
const mockUnregisterServerRequestHandler = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();
const mockStartThread = jest.fn();
const mockStartTurn = jest.fn();
const mockResumeThread = jest.fn();
const mockInterruptTurn = jest.fn();
const mockGetAccountUsage = jest.fn();
const mockListPlugins = jest.fn();
const mockListInstalledPlugins = jest.fn();
const mockInstallPlugin = jest.fn();
const mockUninstallPlugin = jest.fn();
const mockReconcilePlugins = jest.fn();
const mockSubscribeToDeprecationNotice = jest.fn();
let deprecationNoticeHandler: ((notice: { summary: string; details?: string | null }) => void) | null = null;
const constructorOptions: Array<Record<string, unknown>> = [];

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => {
  const actual = jest.requireActual('../../../../../src/core/agents/backend/CodexAppServerClient');
  return {
    ...actual,
    CodexAppServerClient: jest.fn().mockImplementation((options: Record<string, unknown>) => {
      constructorOptions.push(options);
      return {
        start: mockAppServerClientStart,
        stop: mockAppServerClientStop,
        registerServerRequestHandler: mockRegisterServerRequestHandler,
        unregisterServerRequestHandler: mockUnregisterServerRequestHandler,
        startThread: mockStartThread,
        startTurn: mockStartTurn,
        resumeThread: mockResumeThread,
        interruptTurn: mockInterruptTurn,
        subscribeToThreadNotifications: jest.fn(() => ({ dispose: jest.fn() })),
        getThreadEffectiveSettings: jest.fn().mockReturnValue(null),
        getAccountUsage: mockGetAccountUsage,
        listPlugins: mockListPlugins,
        listInstalledPlugins: mockListInstalledPlugins,
        installPlugin: mockInstallPlugin,
        uninstallPlugin: mockUninstallPlugin,
        reconcilePlugins: mockReconcilePlugins,
        subscribeToDeprecationNotice: mockSubscribeToDeprecationNotice,
        listThreads: jest.fn().mockResolvedValue([]),
        readThread: jest.fn().mockResolvedValue(null),
      };
    }),
  };
});

import { capturedNotices, clearCapturedNotices } from 'obsidian';

import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';
import type { StreamChunk } from '../../../../../src/core/types/chat';

function createMockCodex(): unknown {
  return {
    startThread: jest.fn(),
    resumeThread: jest.fn(),
  };
}

interface ReconnectHooks {
  onReconnect?: () => void | Promise<void>;
  onReconnectFailed?: (error: Error) => void;
}

function lastConstructorHooks(): ReconnectHooks {
  const options = constructorOptions[constructorOptions.length - 1];
  return options as ReconnectHooks;
}

describe('CodexAdapter reconnect integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    constructorOptions.length = 0;
    deprecationNoticeHandler = null;
    clearCapturedNotices();
    mockAppServerClientStart.mockResolvedValue(undefined);
    mockStartThread.mockResolvedValue({ id: 'thread-new' });
    mockResumeThread.mockResolvedValue({ id: 'thread-new' });
    mockSubscribeToDeprecationNotice.mockImplementation((handler: (notice: { summary: string; details?: string | null }) => void) => {
      deprecationNoticeHandler = handler;
      return jest.fn();
    });
  });

  it('passes onReconnect/onReconnectFailed hooks to the default client construction', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();

    const hooks = lastConstructorHooks();
    expect(typeof hooks.onReconnect).toBe('function');
    expect(typeof hooks.onReconnectFailed).toBe('function');
    await adapter.stop();
  });

  it('onReconnect interrupts the in-flight stream with an error chunk and re-resumes loaded threads', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();
    mockStartTurn.mockResolvedValue({ id: 'turn-1' });

    const sessionId = await adapter.createSession();
    const chunks: StreamChunk[] = [];
    const collector = (async () => {
      for await (const chunk of adapter.sendMessage({ sessionId, content: 'Inspect this' })) {
        chunks.push(chunk);
      }
    })();

    // Let the stream reach its wait loop, then simulate a transport reconnect.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await lastConstructorHooks().onReconnect?.();
    await collector;

    expect(chunks.some((chunk) => chunk.type === 'error' && /re-established/.test(chunk.content))).toBe(true);
    expect(mockResumeThread).toHaveBeenCalledWith('thread-new', expect.anything());
    await adapter.stop();
  });

  it('onReconnectFailed interrupts streams with the failure reason and sets status error', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();
    mockStartTurn.mockResolvedValue({ id: 'turn-1' });

    const sessionId = await adapter.createSession();
    const chunks: StreamChunk[] = [];
    const collector = (async () => {
      for await (const chunk of adapter.sendMessage({ sessionId, content: 'Inspect this' })) {
        chunks.push(chunk);
      }
    })();

    await new Promise((resolve) => setTimeout(resolve, 10));
    lastConstructorHooks().onReconnectFailed?.(new Error('backoff exhausted'));
    await collector;

    expect(chunks.some((chunk) => chunk.type === 'error' && /backoff exhausted/.test(chunk.content))).toBe(true);
    expect(adapter.status).toBe('error');
    await adapter.stop();
  });

  it('subscribes to deprecationNotice and surfaces a one-time Notice', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();

    expect(mockSubscribeToDeprecationNotice).toHaveBeenCalledWith(expect.any(Function));

    deprecationNoticeHandler?.({ summary: 'turn/steer will move', details: 'see docs' });
    deprecationNoticeHandler?.({ summary: 'turn/steer will move' });

    expect(capturedNotices).toHaveLength(1);
    expect(capturedNotices[0]).toContain('turn/steer will move');
    await adapter.stop();
  });
});

describe('CodexAdapter settings passthrough (B4 seam)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    constructorOptions.length = 0;
    mockAppServerClientStart.mockResolvedValue(undefined);
  });

  it('delegates account usage and plugin routes and unwraps usage', async () => {
    const usage = { summary: { lifetimeTokens: 42 } };
    mockGetAccountUsage.mockResolvedValue({ usage });
    mockListPlugins.mockResolvedValue({ marketplaces: [], featuredPluginIds: [], marketplaceLoadErrors: [] });
    mockListInstalledPlugins.mockResolvedValue({ marketplaces: [], featuredPluginIds: [], marketplaceLoadErrors: [] });
    mockInstallPlugin.mockResolvedValue({ appsNeedingAuth: [], authPolicy: 'ON_INSTALL' });
    mockUninstallPlugin.mockResolvedValue(true);
    mockReconcilePlugins.mockResolvedValue({ changedPlugins: [], failedRemotePluginIds: [], failedMaterializationRemotePluginIds: [] });

    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();

    await expect(adapter.readAccountUsage()).resolves.toEqual(usage);
    await expect(adapter.listCodexPlugins()).resolves.toEqual({ marketplaces: [], featuredPluginIds: [], marketplaceLoadErrors: [] });
    await expect(adapter.listInstalledCodexPlugins()).resolves.toEqual({ marketplaces: [], featuredPluginIds: [], marketplaceLoadErrors: [] });
    await expect(adapter.installCodexPlugin('plugin-a', { marketplacePath: '/m' })).resolves.toEqual({ appsNeedingAuth: [], authPolicy: 'ON_INSTALL' });
    expect(mockInstallPlugin).toHaveBeenCalledWith('plugin-a', { marketplacePath: '/m' });
    await expect(adapter.uninstallCodexPlugin('plugin-a')).resolves.toBe(true);
    await expect(adapter.reconcileCodexPlugins()).resolves.toEqual({ changedPlugins: [], failedRemotePluginIds: [], failedMaterializationRemotePluginIds: [] });
    await adapter.stop();
  });

  it('returns null/false when the app-server client is unavailable', async () => {
    const adapter = new CodexAdapter({
      createAppServerClient: () => null,
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();

    await expect(adapter.readAccountUsage()).resolves.toBeNull();
    await expect(adapter.listCodexPlugins()).resolves.toBeNull();
    await expect(adapter.listInstalledCodexPlugins()).resolves.toBeNull();
    await expect(adapter.installCodexPlugin('x')).resolves.toBeNull();
    await expect(adapter.uninstallCodexPlugin('x')).resolves.toBe(false);
    await expect(adapter.reconcileCodexPlugins()).resolves.toBeNull();
    expect(mockGetAccountUsage).not.toHaveBeenCalled();
    await adapter.stop();
  });
});
