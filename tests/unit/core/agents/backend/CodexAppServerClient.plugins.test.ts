/**
 * Real unit tests for the Codex 0.159.0 client plugin routes
 * (plugin/list|read|installed|install|uninstall|reconcile|skill/read) and the
 * per-thread `account/usage/read` param.
 *
 * Mocks node:child_process and ws at the module level so the real
 * CodexAppServerClient implementation is exercised.
 */

import type { spawn as SpawnFn } from 'node:child_process';
import { EventEmitter } from 'node:events';

const mockSpawn = jest.fn<ReturnType<typeof SpawnFn>, Parameters<typeof SpawnFn>>();

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  spawn: (...args: Parameters<typeof SpawnFn>) => mockSpawn(...args),
}));

const mockWsInstance = {
  send: jest.fn(),
  close: jest.fn(),
  readyState: 1,
  onopen: null as ((event?: unknown) => void) | null,
  onmessage: null as ((event: { data: string }) => void) | null,
  onerror: null as ((event?: unknown) => void) | null,
  onclose: null as ((event?: unknown) => void) | null,
};

const MockWebSocket = jest.fn().mockImplementation(() => mockWsInstance);

jest.mock('ws', () => MockWebSocket);

import { CodexAppServerClient } from '../../../../../src/core/agents/backend/CodexAppServerClient';

function emitWsUrl(proc: EventEmitter) {
  setTimeout(() => {
    proc.emit('data', Buffer.from('App server listening on ws://127.0.0.1:12345\n'));
  }, 5);
}

function simulateResponse(id: number, result: unknown) {
  mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, result }) });
}

function simulateError(id: number, error: { code: number; message: string }) {
  mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, error }) });
}

function createMockProcess(): ReturnType<typeof SpawnFn> {
  const proc = new EventEmitter() as unknown as ReturnType<typeof SpawnFn>;
  (proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  (proc as unknown as { kill: jest.Mock }).kill = jest.fn();
  return proc;
}

function lastSentMessage(): Record<string, unknown> {
  const calls = mockWsInstance.send.mock.calls;
  const last = calls[calls.length - 1];
  return JSON.parse(last[0] as string) as Record<string, unknown>;
}


function resetMocks(): void {
  jest.clearAllMocks();
  mockWsInstance.send.mockClear();
  mockWsInstance.close.mockClear();
  mockWsInstance.readyState = 1;
  mockWsInstance.onopen = null;
  mockWsInstance.onmessage = null;
  mockWsInstance.onerror = null;
  mockWsInstance.onclose = null;
}

async function createClient(): Promise<CodexAppServerClient> {
  const proc = createMockProcess();
  mockSpawn.mockReturnValue(proc);
  emitWsUrl(proc.stdout!);
  setTimeout(() => mockWsInstance.onopen?.(), 10);
  const client = new CodexAppServerClient({ codexPathOverride: '/path/to/codex' });
  mockWsInstance.send.mockImplementation((data: string) => {
    const msg = JSON.parse(data);
    if (msg.method === 'initialize') {
      setTimeout(() => simulateResponse(msg.id, {}), 5);
    }
  });
  await client.start();
  mockWsInstance.send.mockClear();
  return client;
}

describe('CodexAppServerClient 0.159.0 plugin marketplace routes', () => {
  beforeEach(resetMocks);

  describe('listPlugins', () => {
    it('serializes cwds/forceRefetch/marketplaceKinds and parses the result', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'plugin/list') {
          setTimeout(() => simulateResponse(msg.id, {
            marketplaces: [{
              name: 'local',
              path: '/vault/.codex/plugins',
              plugins: [{ id: 'p1', name: 'plugin-one', installed: true, enabled: true, installPolicy: 'AVAILABLE', authPolicy: 'ON_INSTALL', source: { type: 'local', path: '/x' } }],
            }],
            featuredPluginIds: ['p1'],
            marketplaceLoadErrors: [{ marketplacePath: '/bad', message: 'nope' }],
          }), 5);
        }
      });

      const result = await client.listPlugins({
        cwds: ['/vault'],
        forceRefetch: true,
        marketplaceKinds: ['local', 'vertical'],
      });

      expect(result).toEqual({
        marketplaces: [{
          name: 'local',
          path: '/vault/.codex/plugins',
          plugins: [{ id: 'p1', name: 'plugin-one', installed: true, enabled: true, installPolicy: 'AVAILABLE', authPolicy: 'ON_INSTALL', source: { type: 'local', path: '/x' } }],
        }],
        featuredPluginIds: ['p1'],
        marketplaceLoadErrors: [{ marketplacePath: '/bad', message: 'nope' }],
      });
      expect(lastSentMessage().params).toEqual({
        cwds: ['/vault'],
        forceRefetch: true,
        marketplaceKinds: ['local', 'vertical'],
      });
    });

    it('defaults optional arrays and returns null on route failure', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'plugin/list') {
          setTimeout(() => simulateResponse(msg.id, { marketplaces: [] }), 5);
        }
      });

      await expect(client.listPlugins()).resolves.toEqual({
        marketplaces: [],
        featuredPluginIds: [],
        marketplaceLoadErrors: [],
      });
      expect(lastSentMessage().params).toEqual({});

      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'plugin/list') {
          setTimeout(() => simulateError(msg.id, { code: -32601, message: 'Method not found: plugin/list' }), 5);
        }
      });
      await expect(client.listPlugins()).resolves.toBeNull();
    });
  });

  describe('readPlugin', () => {
    it('returns the plugin payload by name', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'plugin/read') {
          setTimeout(() => simulateResponse(msg.id, { plugin: { name: 'plugin-one', interface: { displayName: 'One' } } }), 5);
        }
      });

      await expect(client.readPlugin('plugin-one', { marketplacePath: '/m' })).resolves.toEqual({
        name: 'plugin-one',
        interface: { displayName: 'One' },
      });
      expect(lastSentMessage().params).toEqual({ pluginName: 'plugin-one', marketplacePath: '/m' });
    });

    it('returns null when the plugin is absent or the route fails', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'plugin/read') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        }
      });
      await expect(client.readPlugin('missing')).resolves.toBeNull();
    });
  });

  describe('listInstalledPlugins', () => {
    it('parses the installed marketplaces shape', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'plugin/installed') {
          setTimeout(() => simulateResponse(msg.id, { marketplaces: [{ name: 'local', plugins: [] }] }), 5);
        }
      });

      await expect(client.listInstalledPlugins({ cwds: ['/vault'] })).resolves.toEqual({
        marketplaces: [{ name: 'local', plugins: [] }],
        featuredPluginIds: [],
        marketplaceLoadErrors: [],
      });
      expect(lastSentMessage().params).toEqual({ cwds: ['/vault'] });
    });
  });

});

describe('CodexAppServerClient 0.159.0 plugin mutation + usage routes', () => {
  beforeEach(resetMocks);

  describe('installPlugin', () => {
    it('returns appsNeedingAuth and authPolicy', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'plugin/install') {
          setTimeout(() => simulateResponse(msg.id, {
            appsNeedingAuth: [{ id: 'app-1', name: 'App One' }],
            authPolicy: 'ON_INSTALL',
          }), 5);
        }
      });

      const result = await client.installPlugin('plugin-one', { remoteMarketplaceName: 'official', installAttemptId: 'attempt-1' });

      expect(result).toEqual({ appsNeedingAuth: [{ id: 'app-1', name: 'App One' }], authPolicy: 'ON_INSTALL' });
      expect(lastSentMessage().params).toEqual({
        pluginName: 'plugin-one',
        remoteMarketplaceName: 'official',
        installAttemptId: 'attempt-1',
      });
    });

    it('returns null on malformed responses', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'plugin/install') {
          setTimeout(() => simulateResponse(msg.id, { authPolicy: 'ON_INSTALL' }), 5);
        }
      });

      await expect(client.installPlugin('plugin-one')).resolves.toBeNull();
    });
  });

  describe('uninstallPlugin', () => {
    it('sends plugin/uninstall by plugin id', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'plugin/uninstall') {
          setTimeout(() => simulateResponse(msg.id, {}), 5);
        }
      });

      await expect(client.uninstallPlugin('plugin-one')).resolves.toBe(true);
      expect(lastSentMessage().params).toEqual({ pluginId: 'plugin-one' });
    });
  });

  describe('reconcilePlugins', () => {
    it('parses changed/failed lists and defaults missing arrays', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'plugin/reconcile') {
          setTimeout(() => simulateResponse(msg.id, {
            changedPlugins: [{ id: 'p1' }],
            failedRemotePluginIds: ['p2'],
            failedMaterializationRemotePluginIds: [],
          }), 5);
        }
      });

      await expect(client.reconcilePlugins('startup')).resolves.toEqual({
        changedPlugins: [{ id: 'p1' }],
        failedRemotePluginIds: ['p2'],
        failedMaterializationRemotePluginIds: [],
      });
      expect(lastSentMessage().params).toEqual({ reason: 'startup' });
    });
  });

  describe('readPluginSkill', () => {
    it('returns skill contents', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'plugin/skill/read') {
          setTimeout(() => simulateResponse(msg.id, { contents: '# Skill\nDo things.' }), 5);
        }
      });

      await expect(client.readPluginSkill('official', 'plugin-one', 'review')).resolves.toBe('# Skill\nDo things.');
      expect(lastSentMessage().params).toEqual({
        remoteMarketplaceName: 'official',
        remotePluginId: 'plugin-one',
        skillName: 'review',
      });
    });

    it('returns null for missing skills or failures', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'plugin/skill/read') {
          setTimeout(() => simulateResponse(msg.id, { contents: null }), 5);
        }
      });
      await expect(client.readPluginSkill('official', 'plugin-one', 'missing')).resolves.toBeNull();
    });
  });

  describe('getAccountUsage threadId param', () => {
    it('sends { threadId } when a thread-scoped read is requested', async () => {
      const client = await createClient();
      mockWsInstance.send.mockImplementation((data: string) => {
        const msg = JSON.parse(data);
        if (msg.method === 'account/usage/read') {
          setTimeout(() => simulateResponse(msg.id, {
            summary: { lifetimeTokens: 1 },
            threadUsage: {
              threadId: 'thread-1',
              estimatedUsageCreditsMicros: 123,
              groups: [{ speed: 'fast', totalTokens: 100 }],
            },
          }), 5);
        }
      });

      const result = await client.getAccountUsage({ threadId: 'thread-1' });

      expect(result.usage?.threadUsage).toEqual({
        threadId: 'thread-1',
        estimatedUsageCreditsMicros: 123,
        groups: [{ speed: 'fast', totalTokens: 100 }],
      });
      expect(lastSentMessage().params).toEqual({ threadId: 'thread-1' });
    });
  });
});
