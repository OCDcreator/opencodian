/* eslint-disable max-lines -- Adapter coverage keeps session, resume, model catalog, permission, and streaming fixtures together for one backend contract. */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import {
  ClaudeCodeAdapter,
  type ClaudeCodeSdkFacade,
  type ClaudeCodeSdkLoader,
  createClaudeCodePermissionBridge,
} from '../../../../../src/core/agents/backend';
import {
  clearPromptSuggestionSink,
  getPromptSuggestionSink,
  onPromptSuggestionSinkChange,
} from '../../../../../src/core/agents/backend/promptSuggestionSink';
import { getDefaultClaudeCodeBackendSettings } from '../../../../../src/core/types';
import {
  clearRecentLogs,
  getRecentLogEntries,
  setDebugLoggingEnabled,
  setDebugModuleEnabled,
} from '../../../../../src/shared';

async function collectAsync<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

function createAsyncQueue<T>(): AsyncIterable<T> & {
  push(value: T): void;
  close(): void;
} {
  const values: T[] = [];
  const waiters: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;

  return {
    push(value: T): void {
      const waiter = waiters.shift();
      if (waiter) {
        waiter({ value, done: false });
        return;
      }
      values.push(value);
    },
    close(): void {
      closed = true;
      for (const waiter of waiters.splice(0)) {
        waiter({ value: undefined, done: true });
      }
    },
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return {
        next(): Promise<IteratorResult<T>> {
          const value = values.shift();
          if (value !== undefined) {
            return Promise.resolve({ value, done: false });
          }
          if (closed) {
            return Promise.resolve({ value: undefined, done: true });
          }
          return new Promise((resolve) => waiters.push(resolve));
        },
      };
    },
  };
}

async function nextFrom<T>(iterable: AsyncIterable<T>): Promise<IteratorResult<T>> {
  return await iterable[Symbol.asyncIterator]().next();
}

async function expectAsyncIterableClosedWithoutValues(iterable: AsyncIterable<unknown>): Promise<void> {
  const result = await Promise.race([
    iterable[Symbol.asyncIterator]().next(),
    new Promise<IteratorResult<unknown>>((resolve) => {
      setTimeout(() => resolve({ value: 'timeout', done: false }), 20);
    }),
  ]);
  expect(result).toEqual({ value: undefined, done: true });
}

async function waitForExpect(assertion: () => void, attempts = 10): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await Promise.resolve();
    }
  }
  throw lastError;
}

function createSdk(messages: unknown[]): ClaudeCodeSdkFacade & {
  query: jest.Mock;
  listSessions: jest.Mock;
  getSessionInfo: jest.Mock;
  getSessionMessages: jest.Mock;
  listSubagents: jest.Mock;
  getSubagentMessages: jest.Mock;
  importSessionToStore: jest.Mock;
  forkSession: jest.Mock;
  renameSession: jest.Mock;
} {
  return {
    query: jest.fn(() => Object.assign((async function* () {
      for (const message of messages) {
        yield message;
      }
    })(), {
      supportedModels: jest.fn().mockResolvedValue([]),
      close: jest.fn(),
    })),
    listSessions: jest.fn().mockResolvedValue([]),
    getSessionInfo: jest.fn().mockResolvedValue(undefined),
    getSessionMessages: jest.fn().mockResolvedValue([]),
    listSubagents: jest.fn().mockResolvedValue([]),
    getSubagentMessages: jest.fn().mockResolvedValue([]),
    importSessionToStore: jest.fn().mockResolvedValue(undefined),
    forkSession: jest.fn().mockResolvedValue({ sessionId: 'sdk-fork-session' }),
    renameSession: jest.fn().mockResolvedValue(undefined),
  };
}

// eslint-disable-next-line max-lines-per-function -- Adapter behavior cases share small SDK/session fixtures.
describe('ClaudeCodeAdapter', () => {
  beforeEach(() => {
    clearRecentLogs();
    setDebugLoggingEnabled(true);
    setDebugModuleEnabled('claudeCode', true);
  });

  afterEach(() => {
    setDebugLoggingEnabled(false);
    setDebugModuleEnabled('claudeCode', false);
    clearRecentLogs();
  });

  it('starts and stops without spawning a real Claude process', async () => {
    const sdk = createSdk([]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const statuses: string[] = [];
    adapter.onStatusChange((status) => statuses.push(status));

    await adapter.start();
    expect(adapter.status).toBe('connected');
    await adapter.stop();
    expect(adapter.status).toBe('disconnected');
    expect(statuses).toEqual(['connected', 'disconnected']);
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it('declares Claude Code Phase 1 capabilities without changing implemented backend gates', () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk: createSdk([]),
    });

    expect(adapter.kind).toBe('claude-code');
    expect(adapter.hasCapability(AgentCapability.Chat)).toBe(true);
    expect(adapter.hasCapability(AgentCapability.Sessions)).toBe(true);
    expect(adapter.hasCapability(AgentCapability.Fork)).toBe(true);
    expect(adapter.hasCapability(AgentCapability.Branching)).toBe(false);
    expect(adapter.hasCapability(AgentCapability.Tools)).toBe(false);
    expect(adapter.hasCapability(AgentCapability.Mcp)).toBe(false);
    // Productized 2026-06-07: Chat toolbar permission selector routes to
    // adapter.setPermissionMode() when claude-code backend is active.
    expect(adapter.hasCapability(AgentCapability.Permissions)).toBe(true);
    expect(adapter.hasCapability(AgentCapability.Models)).toBe(true);
    expect(adapter.hasCapability(AgentCapability.Questions)).toBe(false);
    expect(adapter.hasCapability(AgentCapability.Hooks)).toBe(false);
    // Productized 2026-06-07: SessionTodoCoordinator now derives task state
    // from TaskCreate/TaskUpdate tool traffic and feeds the existing dock.
    expect(adapter.hasCapability(AgentCapability.Todos)).toBe(true);
    // Round 11: AgentCapability.Context added to CLAUDE_CODE_PHASE1_CAPABILITIES.
    // getSessionContextUsageSnapshot() converts raw SDK getContextUsage() to
    // ContextUsageSnapshot for the existing chat ContextRing pipeline.
    expect(adapter.hasCapability(AgentCapability.Context)).toBe(true);
  });

  it('returns normalized supported models from the SDK', async () => {
    const sdk = createSdk([]);
    const supportedModels = jest.fn().mockResolvedValue([{
      value: 'claude-sonnet-4-5',
      displayName: 'Claude Sonnet 4.5',
      provider: 'anthropic',
    }, {
      id: 'claude-opus-4-1',
    }]);
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      supportedModels,
      close: jest.fn(),
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.supportedModels()).resolves.toEqual([{
      id: 'claude-sonnet-4-5',
      name: 'Claude Sonnet 4.5',
      provider: 'anthropic',
    }, {
      id: 'claude-opus-4-1',
      name: 'claude-opus-4-1',
      provider: 'claude',
    }]);
    expect(supportedModels).toHaveBeenCalledTimes(1);
    expect(sdk.query.mock.results[0].value.close).toHaveBeenCalledTimes(1);
    expect(sdk.query.mock.calls[0][0].options.spawnClaudeCodeProcess).toEqual(expect.any(Function));
    expect(sdk.query.mock.calls[0][0].options.abortController).toEqual(expect.any(Object));
  });

  it('returns an empty supported model list when the SDK throws', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      supportedModels: jest.fn().mockRejectedValue(new Error('model catalog unavailable')),
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.supportedModels()).resolves.toEqual([]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns an empty supported model list when the SDK method is unavailable', async () => {
    const sdk = createSdk([]);
    sdk.query.mockReturnValue((async function* () {})());
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.supportedModels()).resolves.toEqual([]);
  });

  it('reads runtime command and agent catalog from the SDK Query readback paths', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    const supportedCommands = jest.fn().mockResolvedValue([{
      name: 'review',
      description: 'Review selected files',
      argumentHint: '<path>',
      aliases: ['audit', 'inspect'],
    }]);
    const supportedAgents = jest.fn().mockResolvedValue([{
      name: 'explore',
      description: 'Explore the codebase',
      model: 'sonnet',
    }]);
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      supportedCommands,
      supportedAgents,
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.getRuntimeCatalog()).resolves.toEqual({
      commands: [{
        name: 'review',
        description: 'Review selected files',
        argumentHint: '<path>',
        aliases: ['audit', 'inspect'],
      }],
      agents: [{
        name: 'explore',
        description: 'Explore the codebase',
        model: 'sonnet',
      }],
    });
    expect(supportedCommands).toHaveBeenCalledTimes(1);
    expect(supportedAgents).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    await expectAsyncIterableClosedWithoutValues(sdk.query.mock.calls[0][0].prompt);
  });

  it('reuses active runtime query catalog methods without closing the live runtime query', async () => {
    const close = jest.fn();
    const runtimeQuery = createAsyncQueue<unknown>() as ReturnType<typeof createAsyncQueue<unknown>> & {
      supportedCommands: () => Promise<Array<{ name: string; description: string; argumentHint: string }>>;
      supportedAgents: () => Promise<Array<{ name: string; description: string; model: string }>>;
      close: jest.Mock;
      sentinel: string;
    };
    runtimeQuery.sentinel = 'bound-runtime-catalog-context';
    runtimeQuery.supportedCommands = jest.fn(function (this: { sentinel?: string }) {
      if (this.sentinel !== 'bound-runtime-catalog-context') {
        throw new TypeError('unbound supportedCommands context');
      }
      return Promise.resolve([{ name: 'cost', description: 'Show cost', argumentHint: '' }]);
    });
    runtimeQuery.supportedAgents = jest.fn(function (this: { sentinel?: string }) {
      if (this.sentinel !== 'bound-runtime-catalog-context') {
        throw new TypeError('unbound supportedAgents context');
      }
      return Promise.resolve([{ name: 'reviewer', description: 'Review code', model: 'opus' }]);
    });
    runtimeQuery.close = close;
    const sdk = createSdk([]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();
    const session = (adapter as unknown as {
      sessions: Map<string, {
        runtime?: { query?: unknown };
      }>;
    }).sessions.get(sessionId);
    if (!session) {
      throw new Error('expected local session state');
    }
    session.runtime = { query: runtimeQuery };

    await expect(adapter.getRuntimeCatalog()).resolves.toEqual({
      commands: [{ name: 'cost', description: 'Show cost', aliases: [] }],
      agents: [{ name: 'reviewer', description: 'Review code', model: 'opus' }],
    });
    expect(runtimeQuery.supportedCommands).toHaveBeenCalledTimes(1);
    expect(runtimeQuery.supportedAgents).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(0);
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it('returns null for runtime catalog when an active runtime query lacks catalog methods', async () => {
    const sdk = createSdk([]);
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      supportedCommands: jest.fn().mockResolvedValue([{ name: 'from-temporary-query' }]),
      supportedAgents: jest.fn().mockResolvedValue([{ name: 'from-temporary-agent' }]),
      close: jest.fn(),
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();
    const session = (adapter as unknown as {
      sessions: Map<string, {
        runtime?: { query?: unknown };
      }>;
    }).sessions.get(sessionId);
    if (!session) {
      throw new Error('expected local session state');
    }
    session.runtime = { query: Object.assign((async function* () {})(), { close: jest.fn() }) };

    await expect(adapter.getRuntimeCatalog()).resolves.toBeNull();
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it('returns null for runtime catalog when SDK Query catalog methods are unavailable or throw', async () => {
    const sdk = createSdk([]);
    const missingClose = jest.fn();
    sdk.query.mockReturnValueOnce(Object.assign((async function* () {})(), {
      supportedCommands: jest.fn().mockResolvedValue([]),
      close: missingClose,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.getRuntimeCatalog()).resolves.toBeNull();
    expect(missingClose).toHaveBeenCalledTimes(1);

    const throwingClose = jest.fn();
    sdk.query.mockReturnValueOnce(Object.assign((async function* () {})(), {
      supportedCommands: jest.fn().mockResolvedValue([]),
      supportedAgents: jest.fn().mockRejectedValue(new Error('agent catalog unavailable')),
      close: throwingClose,
    }));

    await expect(adapter.getRuntimeCatalog()).resolves.toBeNull();
    expect(throwingClose).toHaveBeenCalledTimes(1);
  });

  it('sanitizes and sorts malformed runtime catalog entries', async () => {
    const sdk = createSdk([]);
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      supportedCommands: jest.fn().mockResolvedValue([
        { name: ' zeta ', description: ' Last ', argumentHint: ' <file> ', aliases: [' z ', '', 123] },
        { name: 'alpha', description: '', argumentHint: '', aliases: ['two', ' one '] },
        { description: 'missing name', argumentHint: '<x>' },
        null,
      ]),
      supportedAgents: jest.fn().mockResolvedValue([
        { name: ' writer ', description: ' Writes ', model: ' opus ' },
        { name: '', description: 'missing name', model: 'sonnet' },
        { name: 'auditor', description: '', model: '' },
      ]),
      close: jest.fn(),
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.getRuntimeCatalog()).resolves.toEqual({
      commands: [
        { name: 'alpha', aliases: ['one', 'two'] },
        { name: 'zeta', description: 'Last', argumentHint: '<file>', aliases: ['z'] },
      ],
      agents: [
        { name: 'auditor' },
        { name: 'writer', description: 'Writes', model: 'opus' },
      ],
    });
  });

  it('reads runtime settings from the SDK Query getSettings path', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    const runtimeSettings = {
      model: 'claude-sonnet-4-5',
      permissions: { defaultMode: 'acceptEdits' },
    };
    const getSettings = jest.fn().mockResolvedValue(runtimeSettings);
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      getSettings,
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.getRuntimeSettings()).resolves.toBe(runtimeSettings);
    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    await expectAsyncIterableClosedWithoutValues(sdk.query.mock.calls[0][0].prompt);
  });

  it('reuses active runtime query settings without closing the live runtime query', async () => {
    const close = jest.fn();
    const runtimeSettings = { model: 'claude-sonnet-4-5' };
    const runtimeQuery = createAsyncQueue<unknown>() as ReturnType<typeof createAsyncQueue<unknown>> & {
      getSettings: () => Promise<unknown>;
      close: jest.Mock;
      sentinel: string;
    };
    runtimeQuery.sentinel = 'bound-settings-context';
    runtimeQuery.getSettings = jest.fn(function (this: { sentinel?: string }) {
      if (this.sentinel !== 'bound-settings-context') {
        throw new TypeError('unbound getSettings context');
      }
      return Promise.resolve(runtimeSettings);
    });
    runtimeQuery.close = close;
    const sdk = createSdk([]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();
    const session = (adapter as unknown as {
      sessions: Map<string, {
        runtime?: { query?: unknown };
      }>;
    }).sessions.get(sessionId);
    if (!session) {
      throw new Error('expected local session state');
    }
    session.runtime = { query: runtimeQuery };

    await expect(adapter.getRuntimeSettings()).resolves.toBe(runtimeSettings);
    expect(runtimeQuery.getSettings).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(0);
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it('returns null for runtime settings when the active runtime query lacks getSettings', async () => {
    const sdk = createSdk([]);
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      getSettings: jest.fn().mockResolvedValue({ model: 'from-temporary-query' }),
      close: jest.fn(),
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();
    const session = (adapter as unknown as {
      sessions: Map<string, {
        runtime?: { query?: unknown };
      }>;
    }).sessions.get(sessionId);
    if (!session) {
      throw new Error('expected local session state');
    }
    session.runtime = { query: Object.assign((async function* () {})(), { close: jest.fn() }) };

    await expect(adapter.getRuntimeSettings()).resolves.toBeNull();
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it('returns null for runtime settings when the SDK Query getSettings path is unavailable', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.getRuntimeSettings()).resolves.toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns null for runtime settings when the SDK Query getSettings call throws', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      getSettings: jest.fn().mockRejectedValue(new Error('settings unavailable')),
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.getRuntimeSettings()).resolves.toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('reads context usage from the SDK Query getContextUsage path', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    const contextUsage = {
      usedTokens: 1234,
      maxTokens: 200000,
    };
    const getContextUsage = jest.fn().mockResolvedValue(contextUsage);
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      getContextUsage,
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    }) as ClaudeCodeAdapter & { getContextUsage(): Promise<unknown | null> };

    await expect(adapter.getContextUsage()).resolves.toBe(contextUsage);
    expect(getContextUsage).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    await expectAsyncIterableClosedWithoutValues(sdk.query.mock.calls[0][0].prompt);
  });

  it('returns null for context usage when the SDK Query getContextUsage path is unavailable', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    }) as ClaudeCodeAdapter & { getContextUsage(): Promise<unknown | null> };

    await expect(adapter.getContextUsage()).resolves.toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns null for context usage when the SDK Query getContextUsage call throws', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      getContextUsage: jest.fn().mockRejectedValue(new Error('context usage unavailable')),
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    }) as ClaudeCodeAdapter & { getContextUsage(): Promise<unknown | null> };

    await expect(adapter.getContextUsage()).resolves.toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns null for context usage when the active runtime query lacks getContextUsage', async () => {
    const sdk = createSdk([]);
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      getContextUsage: jest.fn().mockResolvedValue({ usedTokens: 99 }),
      close: jest.fn(),
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    }) as ClaudeCodeAdapter & { getContextUsage(): Promise<unknown | null> };
    const sessionId = await adapter.createSession();
    const session = (adapter as unknown as {
      sessions: Map<string, {
        runtime?: { query?: unknown };
      }>;
    }).sessions.get(sessionId);
    if (!session) {
      throw new Error('expected local session state');
    }
    session.runtime = { query: Object.assign((async function* () {})(), { close: jest.fn() }) };

    await expect(adapter.getContextUsage()).resolves.toBeNull();
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it('converts getContextUsage result to ContextUsageSnapshot for getSessionContextUsageSnapshot', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    const contextUsage = {
      totalTokens: 28231,
      maxTokens: 200000,
      percentage: 14,
      model: 'claude-haiku-4-5',
      categories: [
        { name: 'System prompt', tokens: 5581 },
        { name: 'System tools', tokens: 20596 },
      ],
    };
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      getContextUsage: jest.fn().mockResolvedValue(contextUsage),
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    }) as ClaudeCodeAdapter & { getSessionContextUsageSnapshot(sessionId: string): Promise<unknown | null> };

    const result = await adapter.getSessionContextUsageSnapshot('sess-123');
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      sessionId: 'sess-123',
      sessionTitle: '',
      modelId: 'claude-haiku-4-5',
      modelName: 'claude-haiku-4-5',
      contextWindow: 200000,
      inputTokens: 28231,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalCost: 0,
      compactingAt: null,
      providerId: null,
      providerName: null,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns null for getSessionContextUsageSnapshot when getContextUsage returns null', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      getContextUsage: jest.fn().mockResolvedValue(null),
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    }) as ClaudeCodeAdapter & { getSessionContextUsageSnapshot(sessionId: string): Promise<unknown | null> };

    await expect(adapter.getSessionContextUsageSnapshot('sess-123')).resolves.toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns null for getSessionContextUsageSnapshot when getContextUsage throws', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      getContextUsage: jest.fn().mockRejectedValue(new Error('context usage unavailable')),
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    }) as ClaudeCodeAdapter & { getSessionContextUsageSnapshot(sessionId: string): Promise<unknown | null> };

    await expect(adapter.getSessionContextUsageSnapshot('sess-123')).resolves.toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('reads account info from the SDK Query accountInfo path', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    const accountInfo = {
      email: 'user@example.com',
      organization: 'Example Org',
      subscriptionType: 'max',
      apiProvider: 'firstParty',
    };
    const accountInfoReadback = jest.fn().mockResolvedValue(accountInfo);
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      accountInfo: accountInfoReadback,
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    }) as ClaudeCodeAdapter & { getAccountInfo(): Promise<unknown | null> };

    await expect(adapter.getAccountInfo()).resolves.toBe(accountInfo);
    expect(accountInfoReadback).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    await expectAsyncIterableClosedWithoutValues(sdk.query.mock.calls[0][0].prompt);
  });

  it('reuses active runtime query account info without closing the live runtime query', async () => {
    const close = jest.fn();
    const accountInfo = { email: 'user@example.com', apiProvider: 'firstParty' };
    const runtimeQuery = createAsyncQueue<unknown>() as ReturnType<typeof createAsyncQueue<unknown>> & {
      accountInfo: () => Promise<unknown>;
      close: jest.Mock;
      sentinel: string;
    };
    runtimeQuery.sentinel = 'bound-account-context';
    runtimeQuery.accountInfo = jest.fn(function (this: { sentinel?: string }) {
      if (this.sentinel !== 'bound-account-context') {
        throw new TypeError('unbound accountInfo context');
      }
      return Promise.resolve(accountInfo);
    });
    runtimeQuery.close = close;
    const sdk = createSdk([]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    }) as ClaudeCodeAdapter & { getAccountInfo(): Promise<unknown | null> };
    const sessionId = await adapter.createSession();
    const session = (adapter as unknown as {
      sessions: Map<string, {
        runtime?: { query?: unknown };
      }>;
    }).sessions.get(sessionId);
    if (!session) {
      throw new Error('expected local session state');
    }
    session.runtime = { query: runtimeQuery };

    await expect(adapter.getAccountInfo()).resolves.toBe(accountInfo);
    expect(runtimeQuery.accountInfo).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(0);
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it('returns null for account info when the SDK Query accountInfo path is unavailable', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    }) as ClaudeCodeAdapter & { getAccountInfo(): Promise<unknown | null> };

    await expect(adapter.getAccountInfo()).resolves.toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns null for account info when the SDK Query accountInfo call throws', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      accountInfo: jest.fn().mockRejectedValue(new Error('account unavailable')),
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    }) as ClaudeCodeAdapter & { getAccountInfo(): Promise<unknown | null> };

    await expect(adapter.getAccountInfo()).resolves.toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns null for account info when the active runtime query lacks accountInfo', async () => {
    const sdk = createSdk([]);
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      accountInfo: jest.fn().mockResolvedValue({ email: 'from-temporary-query@example.com' }),
      close: jest.fn(),
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    }) as ClaudeCodeAdapter & { getAccountInfo(): Promise<unknown | null> };
    const sessionId = await adapter.createSession();
    const session = (adapter as unknown as {
      sessions: Map<string, {
        runtime?: { query?: unknown };
      }>;
    }).sessions.get(sessionId);
    if (!session) {
      throw new Error('expected local session state');
    }
    session.runtime = { query: Object.assign((async function* () {})(), { close: jest.fn() }) };

    await expect(adapter.getAccountInfo()).resolves.toBeNull();
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it('reads a session file through the SDK Query readFile path', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    const fileReadback = {
      contents: '# Hello from Claude runtime',
      absPath: '/vault/notes/example.md',
      truncated: false,
    };
    const readFile = jest.fn().mockResolvedValue(fileReadback);
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      readFile,
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    }) as ClaudeCodeAdapter & {
      readRuntimeFile(path: string, options?: { maxBytes?: number; encoding?: 'utf-8' | 'base64' }): Promise<unknown | null>;
    };

    await expect(adapter.readRuntimeFile('notes/example.md', {
      maxBytes: 4096,
      encoding: 'utf-8',
    })).resolves.toBe(fileReadback);
    expect(readFile).toHaveBeenCalledWith('notes/example.md', {
      maxBytes: 4096,
      encoding: 'utf-8',
    });
    expect(close).toHaveBeenCalledTimes(1);
    await expectAsyncIterableClosedWithoutValues(sdk.query.mock.calls[0][0].prompt);
  });

  it('returns null for runtime file readback when an active query lacks readFile', async () => {
    const sdk = createSdk([]);
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      readFile: jest.fn().mockResolvedValue({ contents: 'temporary', absPath: '/vault/temporary.md' }),
      close: jest.fn(),
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    }) as ClaudeCodeAdapter & {
      readRuntimeFile(path: string): Promise<unknown | null>;
    };
    const sessionId = await adapter.createSession();
    const session = (adapter as unknown as {
      sessions: Map<string, {
        runtime?: { query?: unknown };
      }>;
    }).sessions.get(sessionId);
    if (!session) {
      throw new Error('expected local session state');
    }
    session.runtime = { query: Object.assign((async function* () {})(), { close: jest.fn() }) };

    await expect(adapter.readRuntimeFile('notes/example.md')).resolves.toBeNull();
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it('reads sanitized MCP server statuses from the SDK Query mcpServerStatus path', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    const mcpServerStatus = jest.fn().mockResolvedValue([{
      name: 'zeta-mcp',
      status: 'connected',
      scope: 'project',
      serverInfo: { name: 'Zeta MCP', version: '1.2.3' },
      tools: [{ name: 'writeTool' }, { name: 'readTool' }],
      config: {
        type: 'stdio',
        command: 'node',
        env: { SECRET_TOKEN: 'do-not-leak' },
      },
    }, {
      name: 'alpha-mcp',
      status: 'failed',
      error: 'failed with token abc123',
      config: {
        type: 'sse',
        url: 'https://example.invalid?token=do-not-leak',
      },
    }]);
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      mcpServerStatus,
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const statuses = await adapter.getMcpServerRuntimeStatuses();
    expect(statuses).toEqual([{
      name: 'zeta-mcp',
      status: 'connected',
      scope: 'project',
      serverInfo: { name: 'Zeta MCP', version: '1.2.3' },
      toolCount: 2,
      toolNames: ['readTool', 'writeTool'],
      hasError: false,
    }, {
      name: 'alpha-mcp',
      status: 'failed',
      toolCount: 0,
      toolNames: [],
      hasError: true,
      errorSummary: 'McpServerError(category=auth, messageLength=24)',
    }]);
    expect(JSON.stringify(statuses)).not.toContain('do-not-leak');
    expect(mcpServerStatus).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns null for MCP server statuses when the SDK Query mcpServerStatus path is unavailable', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.getMcpServerRuntimeStatuses()).resolves.toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns null for MCP server statuses when the SDK Query mcpServerStatus call throws', async () => {
    const sdk = createSdk([]);
    const close = jest.fn();
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      mcpServerStatus: jest.fn().mockRejectedValue(new Error('mcp status unavailable')),
      close,
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.getMcpServerRuntimeStatuses()).resolves.toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('reuses runtime query models without closing the live runtime query', async () => {
    const close = jest.fn();
    const sdk = createSdk([{
      type: 'system',
      subtype: 'init',
      session_id: 'sdk-session-runtime-reuse',
      model: 'claude-sonnet-4-5',
    }]);
    const supportedModels = jest.fn().mockResolvedValue([{
      id: 'claude-sonnet-4-5',
      name: 'Claude Sonnet 4.5',
      provider: 'anthropic',
    }]);
    const runtimeQuery = Object.assign((async function* () {
      yield {
        type: 'assistant',
        session_id: 'sdk-session-runtime-reuse',
        message: {
          id: 'msg-runtime-reuse',
          content: [{ type: 'text', text: 'runtime alive' }],
        },
      };
    })(), {
      supportedModels,
      close,
    });
    sdk.query.mockReturnValue(runtimeQuery);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();

    const chunksPromise = collectAsync(adapter.sendMessage({
      sessionId,
      content: 'keep runtime alive',
    }));
    await waitForExpect(() => {
      expect(sdk.query).toHaveBeenCalledTimes(1);
    });

    await expect(adapter.supportedModels()).resolves.toEqual([{
      id: 'claude-sonnet-4-5',
      name: 'Claude Sonnet 4.5',
      provider: 'anthropic',
    }]);
    expect(supportedModels).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(0);

    await expect(chunksPromise).resolves.toEqual(expect.arrayContaining([{
      type: 'text',
      content: 'runtime alive',
    }]));
  });

  it('binds runtime-reuse supportedModels to the live query context', async () => {
    const close = jest.fn();
    const runtimeQuery = createAsyncQueue<unknown>() as ReturnType<typeof createAsyncQueue<unknown>> & {
      supportedModels: () => Promise<Array<{ id: string; name: string; provider: string }>>;
      close: jest.Mock;
      sentinel: string;
    };
    runtimeQuery.sentinel = 'bound-context';
    runtimeQuery.supportedModels = jest.fn(function (this: { sentinel?: string }) {
      if (this.sentinel !== 'bound-context') {
        throw new TypeError('unbound supportedModels context');
      }
      return Promise.resolve([{
        id: 'claude-opus-4-1',
        name: 'Claude Opus 4.1',
        provider: 'anthropic',
      }]);
    });
    runtimeQuery.close = close;

    const sdk = createSdk([]);

    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();
    const session = (adapter as unknown as {
      sessions: Map<string, {
        runtime?: { query?: unknown };
      }>;
    }).sessions.get(sessionId);
    if (!session) {
      throw new Error('expected local session state');
    }
    session.runtime = { query: runtimeQuery };

    await expect(adapter.supportedModels()).resolves.toEqual([{
      id: 'claude-opus-4-1',
      name: 'Claude Opus 4.1',
      provider: 'anthropic',
    }]);
    expect(runtimeQuery.supportedModels).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(0);
  });

  it('creates, renames, and deletes local session handles', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk: createSdk([]),
    });

    const sessionId = await adapter.createSession('Claude chat');
    expect(sessionId).toMatch(/^claude-code-/);

    await expect(adapter.updateSessionTitle(sessionId, 'Renamed')).resolves.toBeUndefined();
    await expect(adapter.deleteSession(sessionId)).resolves.toBeUndefined();
    await expect(collectAsync(adapter.sendMessage({
      sessionId,
      content: 'hello',
    }))).rejects.toThrow(`Claude Code session not found: ${sessionId}`);
  });

  it('sends a message through injected SDK query and normalizes stream chunks', async () => {
    const sdk = createSdk([{
      type: 'system',
      subtype: 'init',
      session_id: 'sdk-session-1',
      model: 'claude-sonnet-4-5',
    }, {
      type: 'assistant',
      session_id: 'sdk-session-1',
      message: {
        id: 'msg-1',
        content: [{ type: 'text', text: 'Hello from Claude' }],
      },
      usage: { input_tokens: 4, output_tokens: 3 },
    }]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();

    await expect(collectAsync(adapter.sendMessage({
      sessionId,
      content: 'hello',
    }))).resolves.toEqual([{
      type: 'message_metadata',
      messageId: 'sdk-session-1',
      timestamp: expect.any(Number),
      modelId: 'claude-sonnet-4-5',
      sessionId: 'sdk-session-1',
    }, {
      type: 'text',
      content: 'Hello from Claude',
    }, {
      type: 'usage',
      inputTokens: 4,
      outputTokens: 3,
      sessionId: 'sdk-session-1',
    }]);

    expect(sdk.query).toHaveBeenCalledTimes(1);
    const call = sdk.query.mock.calls[0][0];
    expect(call.options).toEqual(expect.objectContaining({
      cwd: '/vault',
      includePartialMessages: true,
      settingSources: ['project'],
      permissionMode: 'default',
    }));
    await expect(collectAsync(call.prompt)).resolves.toEqual([{
      type: 'user',
      message: { role: 'user', content: 'hello' },
    }]);

    await collectAsync(adapter.sendMessage({
      sessionId,
      content: 'again',
    }));
    expect(sdk.query.mock.calls[1][0].options.resume).toBe('sdk-session-1');
  });

  it('omits session title from SDK query options on first send when Claude auto-title is enabled by default', async () => {
    const sdk = createSdk([{
      type: 'system',
      subtype: 'init',
      session_id: 'sdk-title-1',
      model: 'claude-sonnet-4-5',
    }, {
      type: 'assistant',
      message: {
        id: 'msg-title-1',
        content: [{ type: 'text', text: 'Title test' }],
      },
    }]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession('My Custom Title');

    await collectAsync(adapter.sendMessage({
      sessionId,
      content: 'hello',
    }));

    expect(sdk.query).toHaveBeenCalledTimes(1);
    const firstCallOptions = sdk.query.mock.calls[0][0].options;
    expect(firstCallOptions).not.toHaveProperty('title');
  });

  it('passes title on first send and omits it on resumed sends when Claude auto-title is disabled', async () => {
    const sdk = createSdk([{
      type: 'system',
      subtype: 'init',
      session_id: 'sdk-title-resume',
      model: 'claude-sonnet-4-5',
    }, {
      type: 'assistant',
      message: {
        id: 'msg-title-resume-1',
        content: [{ type: 'text', text: 'First' }],
      },
    }, {
      type: 'assistant',
      message: {
        id: 'msg-title-resume-2',
        content: [{ type: 'text', text: 'Second' }],
      },
    }]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        autoTitle: false,
      },
      sdk,
    });
    const sessionId = await adapter.createSession('Title Should Not Appear On Resume');

    // First send: title should be present
    await collectAsync(adapter.sendMessage({
      sessionId,
      content: 'first',
    }));
    expect(sdk.query.mock.calls[0][0].options.title).toBe('Title Should Not Appear On Resume');

    // Second send (resume): title should be omitted
    await collectAsync(adapter.sendMessage({
      sessionId,
      content: 'second',
    }));
    const secondCallOptions = sdk.query.mock.calls[1][0].options;
    expect(secondCallOptions.resume).toBe('sdk-title-resume');
    expect(secondCallOptions).not.toHaveProperty('title');
  });

  it('passes composer model and effort overrides into the Claude Code SDK query options', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-model-effort',
        content: [{ type: 'text', text: 'Override accepted' }],
      },
    }]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();

    await collectAsync(adapter.sendMessage({
      sessionId,
      content: 'hello',
      options: {
        provider: 'claude-code',
        model: 'opus',
        variant: 'xhigh',
      },
    }));

    expect(sdk.query.mock.calls[0][0].options).toEqual(expect.objectContaining({
      model: 'opus',
      effort: 'xhigh',
    }));
  });

  it('passes one-shot outputFormat from send options into the Claude Code SDK query options', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-structured',
        content: [{ type: 'text', text: '{"response":"hi"}' }],
      },
    }]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();
    const outputFormat = {
      type: 'json_schema',
      schema: {
        type: 'object',
        properties: { response: { type: 'string' } },
        required: ['response'],
      },
    };

    await collectAsync(adapter.sendMessage({
      sessionId,
      content: 'hello',
      options: {
        provider: 'claude-code',
        outputFormat,
      },
    }));

    expect(sdk.query.mock.calls[0][0].options).toEqual(expect.objectContaining({
      outputFormat,
    }));
  });

  it('prefers send-time outputFormat over adapter-level outputFormat', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-structured-override',
        content: [{ type: 'text', text: '{"response":"hi"}' }],
      },
    }]);
    const adapterLevelFormat = { type: 'json_schema', schema: { type: 'object' } };
    const sendTimeFormat = { type: 'json_schema', schema: { type: 'object', properties: { a: { type: 'string' } } } };
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
      outputFormat: adapterLevelFormat,
    });
    const sessionId = await adapter.createSession();

    await collectAsync(adapter.sendMessage({
      sessionId,
      content: 'hello',
      options: { outputFormat: sendTimeFormat },
    }));

    expect(sdk.query.mock.calls[0][0].options.outputFormat).toEqual(sendTimeFormat);
  });

  it('prefixes structured-output sends with a hardening prompt constraint', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-structured-hardened',
        content: [{ type: 'text', text: '{"response":"hi"}' }],
      },
    }]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();
    const outputFormat = {
      type: 'json_schema',
      schema: { type: 'object', properties: { response: { type: 'string' } }, required: ['response'] },
    };

    await collectAsync(adapter.sendMessage({
      sessionId,
      content: 'say hello',
      options: { outputFormat },
    }));

    const call = sdk.query.mock.calls[0][0];
    const prompts = await collectAsync(call.prompt);
    expect(prompts).toEqual([{
      type: 'user',
      message: {
        role: 'user',
        content: 'You MUST return your complete response ONLY through the StructuredOutput tool using the provided JSON schema. Do NOT output markdown code blocks, JSON fences, explanations, or any conversational text outside the structured output.\n\nsay hello',
      },
    }]);
  });

  it('does not harden prompt for sends without outputFormat', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-plain',
        content: [{ type: 'text', text: 'Hello' }],
      },
    }]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();

    await collectAsync(adapter.sendMessage({
      sessionId,
      content: 'say hello',
    }));

    const call = sdk.query.mock.calls[0][0];
    const prompts = await collectAsync(call.prompt);
    expect(prompts).toEqual([{
      type: 'user',
      message: { role: 'user', content: 'say hello' },
    }]);
  });

  it('starts a fresh resumed SDK query when composer effort changes', async () => {
    const sdkOutputs = [
      createAsyncQueue<unknown>(),
      createAsyncQueue<unknown>(),
    ];
    const prompts: AsyncIterable<unknown>[] = [];
    const sdk: ClaudeCodeSdkFacade & { query: jest.Mock } = {
      query: jest.fn((input) => {
        prompts.push(input.prompt as AsyncIterable<unknown>);
        return Object.assign(sdkOutputs[prompts.length - 1], {
          supportedModels: jest.fn().mockResolvedValue([]),
          close: jest.fn(),
        });
      }),
    };
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();

    const first = collectAsync(adapter.sendMessage({
      sessionId,
      content: 'first',
      options: { provider: 'claude-code', model: 'sonnet', variant: 'low' },
    }));
    await waitForExpect(() => expect(prompts[0]).toBeDefined());
    await expect(nextFrom(prompts[0])).resolves.toEqual({
      value: {
        type: 'user',
        message: { role: 'user', content: 'first' },
      },
      done: false,
    });
    sdkOutputs[0].push({
      type: 'system',
      subtype: 'init',
      session_id: 'sdk-effort-session',
    });
    sdkOutputs[0].push({
      type: 'assistant',
      message: {
        id: 'msg-effort-1',
        content: [{ type: 'text', text: 'First response' }],
      },
    });
    sdkOutputs[0].push({ type: 'result', subtype: 'success' });
    await expect(first).resolves.toContainEqual({ type: 'text', content: 'First response' });

    const second = collectAsync(adapter.sendMessage({
      sessionId,
      content: 'second',
      options: { provider: 'claude-code', model: 'sonnet', variant: 'max' },
    }));
    await waitForExpect(() => expect(prompts[1]).toBeDefined());
    await expect(nextFrom(prompts[1])).resolves.toEqual({
      value: {
        type: 'user',
        message: { role: 'user', content: 'second' },
      },
      done: false,
    });
    sdkOutputs[1].push({
      type: 'assistant',
      message: {
        id: 'msg-effort-2',
        content: [{ type: 'text', text: 'Second response' }],
      },
    });
    sdkOutputs[1].push({ type: 'result', subtype: 'success' });
    await expect(second).resolves.toContainEqual({ type: 'text', content: 'Second response' });

    expect(sdk.query).toHaveBeenCalledTimes(2);
    expect(sdk.query.mock.calls[0][0].options).toEqual(expect.objectContaining({
      effort: 'low',
    }));
    expect(sdk.query.mock.calls[1][0].options).toEqual(expect.objectContaining({
      effort: 'max',
      resume: 'sdk-effort-session',
    }));
  });

  it('keeps one streaming SDK query alive for sequential sends on the same session', async () => {
    const sdkOutput = createAsyncQueue<unknown>();
    const prompts: AsyncIterable<unknown>[] = [];
    const sdk = createSdk([]);
    sdk.query.mockImplementation((input) => {
      prompts.push(input.prompt as AsyncIterable<unknown>);
      return Object.assign(sdkOutput, {
        supportedModels: jest.fn().mockResolvedValue([]),
        close: jest.fn(),
      });
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();

    const first = collectAsync(adapter.sendMessage({ sessionId, content: 'first' }));
    await waitForExpect(() => expect(prompts[0]).toBeDefined());
    await expect(nextFrom(prompts[0])).resolves.toEqual({
      value: {
        type: 'user',
        message: { role: 'user', content: 'first' },
      },
      done: false,
    });
    sdkOutput.push({
      type: 'system',
      subtype: 'init',
      session_id: 'sdk-streaming-session',
    });
    sdkOutput.push({
      type: 'assistant',
      session_id: 'sdk-streaming-session',
      message: {
        id: 'msg-1',
        content: [{ type: 'text', text: 'First response' }],
      },
    });
    sdkOutput.push({ type: 'result', subtype: 'success' });

    await expect(first).resolves.toEqual([{
      type: 'message_metadata',
      messageId: 'sdk-streaming-session',
      timestamp: expect.any(Number),
      sessionId: 'sdk-streaming-session',
    }, {
      type: 'text',
      content: 'First response',
    }]);

    const second = collectAsync(adapter.sendMessage({ sessionId, content: 'second' }));
    await Promise.resolve();
    await expect(nextFrom(prompts[0])).resolves.toEqual({
      value: {
        type: 'user',
        message: { role: 'user', content: 'second' },
      },
      done: false,
    });
    sdkOutput.push({
      type: 'assistant',
      message: {
        id: 'msg-2',
        content: [{ type: 'text', text: 'Second response' }],
      },
    });
    sdkOutput.push({ type: 'result', subtype: 'success' });

    await expect(second).resolves.toEqual([{ type: 'text', content: 'Second response' }]);
    expect(sdk.query).toHaveBeenCalledTimes(1);
    expect(sdk.getSessionInfo).not.toHaveBeenCalled();
  });

  it('loads dynamic MCP config before the first SDK query even when start was not called', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-mcp',
        content: [{ type: 'text', text: 'MCP ready' }],
      },
    }]);
    const mcpServers = {
      runtimeSmoke: { type: 'stdio' as const, command: 'node', args: ['server.js'] },
    };
    const mcpConfigLoader = jest.fn().mockResolvedValue(mcpServers);
    const statuses: string[] = [];
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
      mcpConfigLoader,
    });
    adapter.onStatusChange((status) => statuses.push(status));
    const sessionId = await adapter.createSession();

    await expect(collectAsync(adapter.sendMessage({
      sessionId,
      content: 'use mcp',
    }))).resolves.toEqual([{ type: 'text', content: 'MCP ready' }]);

    expect(mcpConfigLoader).toHaveBeenCalledTimes(1);
    expect(sdk.query.mock.calls[0][0].options.mcpServers).toEqual(mcpServers);
    expect(adapter.status).toBe('connected');
    expect(statuses).toEqual(['connected']);
  });

  it('uses SDK session APIs for list, lookup, rename, and fork after capture', async () => {
    const sdk = createSdk([{
      type: 'system',
      subtype: 'init',
      session_id: 'sdk-session-2',
    }]);
    sdk.listSessions.mockResolvedValue([{
      sessionId: 'sdk-session-2',
      summary: 'Claude chat',
      lastModified: 123,
    }]);
    sdk.getSessionInfo.mockResolvedValue({
      sessionId: 'sdk-session-2',
      summary: 'Claude chat',
      lastModified: 123,
    });
    sdk.forkSession.mockResolvedValue({ sessionId: 'sdk-session-fork' });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const localSessionId = await adapter.createSession('Claude chat');
    await collectAsync(adapter.sendMessage({ sessionId: localSessionId, content: 'hello' }));

    await expect(adapter.listSessions()).resolves.toEqual([{
      sessionId: 'sdk-session-2',
      summary: 'Claude chat',
      lastModified: 123,
    }]);
    await expect(adapter.getSession(localSessionId)).resolves.toEqual({
      sessionId: 'sdk-session-2',
      summary: 'Claude chat',
      lastModified: 123,
    });
    await adapter.updateSessionTitle(localSessionId, 'Renamed');
    await expect(adapter.forkSession(localSessionId, 'message-1')).resolves.toEqual({
      id: 'sdk-session-fork',
      title: 'Renamed (fork)',
    });

    expect(sdk.listSessions).toHaveBeenCalledWith({ dir: '/vault' });
    expect(sdk.getSessionInfo).toHaveBeenCalledWith('sdk-session-2', { dir: '/vault' });
    expect(sdk.renameSession).toHaveBeenCalledWith('sdk-session-2', 'Renamed', { dir: '/vault' });
    expect(sdk.forkSession).toHaveBeenCalledWith('sdk-session-2', {
      dir: '/vault',
      upToMessageId: 'message-1',
      title: 'Renamed (fork)',
    });
  });

  it('rejects forkSession for a local Claude handle before an SDK session is bound', async () => {
    const sdk = createSdk([]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession('Claude chat');

    await expect(adapter.forkSession(sessionId)).rejects.toThrow(/bound SDK session id/i);
    expect(sdk.forkSession).not.toHaveBeenCalled();
  });

  it('delegates Claude JSONL history and subagent transcript APIs behind diagnostic-only methods', async () => {
    const sdk = createSdk([{
      type: 'system',
      subtype: 'init',
      session_id: 'sdk-session-history',
    }]);
    sdk.getSessionMessages.mockResolvedValue([{ type: 'user', uuid: 'u1' }]);
    sdk.listSubagents.mockResolvedValue(['agent-1']);
    sdk.getSubagentMessages.mockResolvedValue([{ type: 'assistant', uuid: 'a1' }]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const localSessionId = await adapter.createSession('Claude chat');
    await collectAsync(adapter.sendMessage({ sessionId: localSessionId, content: 'hello' }));
    const sessionStore = { append: jest.fn(), load: jest.fn() };
    const mirrorStore = { append: jest.fn(), load: jest.fn() };

    await expect(adapter.getSessionMessages(localSessionId, {
      limit: 20,
      offset: 2,
      includeSystemMessages: true,
      sessionStore,
    })).resolves.toEqual([{ type: 'user', uuid: 'u1' }]);
    await expect(adapter.listSubagents(localSessionId, { sessionStore }))
      .resolves.toEqual(['agent-1']);
    await expect(adapter.getSubagentMessages(localSessionId, 'agent-1', {
      limit: 5,
      offset: 1,
      sessionStore,
    })).resolves.toEqual([{ type: 'assistant', uuid: 'a1' }]);
    await expect(adapter.importSessionToStore(localSessionId, mirrorStore, {
      includeSubagents: true,
      batchSize: 250,
    })).resolves.toBeUndefined();

    expect(sdk.getSessionMessages).toHaveBeenCalledWith('sdk-session-history', {
      dir: '/vault',
      limit: 20,
      offset: 2,
      includeSystemMessages: true,
      sessionStore,
    });
    expect(sdk.listSubagents).toHaveBeenCalledWith('sdk-session-history', {
      dir: '/vault',
      sessionStore,
    });
    expect(sdk.getSubagentMessages).toHaveBeenCalledWith('sdk-session-history', 'agent-1', {
      dir: '/vault',
      limit: 5,
      offset: 1,
      sessionStore,
    });
    expect(sdk.importSessionToStore).toHaveBeenCalledWith('sdk-session-history', mirrorStore, {
      dir: '/vault',
      includeSubagents: true,
      batchSize: 250,
    });
  });

  it('can list sessions from a diagnostic sessionStore source', async () => {
    const sdk = createSdk([]);
    sdk.listSessions.mockResolvedValue([{
      sessionId: 'store-session-1',
      summary: 'Mirrored diagnostic session',
      lastModified: 456,
    }]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionStore = {
      append: jest.fn(),
      load: jest.fn(),
      listSessions: jest.fn(),
    };

    await expect(adapter.listSessions({
      limit: 5,
      offset: 1,
      sessionStore,
    })).resolves.toEqual([{
      sessionId: 'store-session-1',
      summary: 'Mirrored diagnostic session',
      lastModified: 456,
    }]);

    expect(sdk.listSessions).toHaveBeenCalledWith({
      dir: '/vault',
      limit: 5,
      offset: 1,
      sessionStore,
    });
  });

  it('runs diagnostic queries with runtime-only structured output and hook overrides', async () => {
    const sdk = createSdk([{
      type: 'system',
      subtype: 'hook_response',
      hook_id: 'hook-1',
      hook_name: 'capability-lab-session-start',
      hook_event: 'SessionStart',
      output: 'hook ok',
      stdout: 'hook stdout',
      stderr: '',
      exit_code: 0,
      outcome: 'success',
      session_id: 'diag-session-1',
    }, {
      type: 'result',
      subtype: 'success',
      session_id: 'diag-session-1',
      structured_output: { status: 'ok' },
      total_usage: { input_tokens: 1, output_tokens: 2 },
    }]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const hooks = {
      SessionStart: [{
        hooks: [jest.fn().mockResolvedValue({
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: 'Capability Lab hook proof',
          },
        })],
      }],
    };
    const outputFormat = {
      type: 'json_schema',
      schema: {
        type: 'object',
        properties: { status: { type: 'string' } },
        required: ['status'],
      },
    };

    const result = await adapter.runDiagnosticPrompt({
      prompt: 'Return status ok.',
      hooks,
      outputFormat,
      includeHookEvents: true,
      persistSession: false,
    });

    expect(sdk.query).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Return status ok.',
      options: expect.objectContaining({
        hooks,
        outputFormat,
        includeHookEvents: true,
        persistSession: false,
      }),
    }));
    expect(result.sessionId).toBe('diag-session-1');
    expect(result.rawMessages).toHaveLength(2);
    expect(result.chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'backend_event',
        event: 'hook',
        status: 'response',
        name: 'capability-lab-session-start',
      }),
      expect.objectContaining({
        type: 'backend_event',
        event: 'structured_output',
        status: 'received',
        metadata: expect.objectContaining({
          structuredOutput: { status: 'ok' },
        }),
      }),
    ]));
  });

  it('disables file checkpointing automatically for diagnostic sessionStore probes', async () => {
    const sdk = createSdk([{
      type: 'result',
      subtype: 'success',
      session_id: 'diag-store-1',
      result: 'STORE_OK',
    }]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        enableFileCheckpointing: true,
      },
      sdk,
    });
    const sessionStore = {
      append: jest.fn(),
      load: jest.fn(),
      listSessions: jest.fn(),
    };

    await adapter.runDiagnosticPrompt({
      prompt: 'Reply with exactly STORE_OK.',
      sessionStore,
      sessionStoreFlush: 'eager',
      includeHookEvents: true,
    });

    expect(sdk.query).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        sessionStore,
        sessionStoreFlush: 'eager',
      }),
    }));
    expect(sdk.query.mock.calls[0][0].options.enableFileCheckpointing).toBeUndefined();
  });

  it('passes resumeSessionId through diagnostic prompt to SDK query options', async () => {
    const sdk = createSdk([{
      type: 'system',
      subtype: 'init',
      session_id: 'existing-sdk-session-42',
    }, {
      type: 'assistant',
      message: {
        id: 'msg-resume-1',
        content: [{ type: 'text', text: 'Resumed diagnostic output' }],
      },
    }]);
    sdk.getSessionInfo.mockResolvedValue({
      sessionId: 'existing-sdk-session-42',
      summary: 'Existing Claude session',
      lastModified: 1700000000000,
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runDiagnosticPrompt({
      prompt: 'Continue from where we left off.',
      resumeSessionId: 'existing-sdk-session-42',
      _diagnosticResumeAt: true,
    });

    expect(sdk.query).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Continue from where we left off.',
      options: expect.objectContaining({
        resume: 'existing-sdk-session-42',
      }),
    }));
    expect(result.sessionId).toBe('existing-sdk-session-42');
    expect(result.chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'text',
        content: 'Resumed diagnostic output',
      }),
    ]));
  });

  it('rejects diagnostic resume when SDK session cannot be validated', async () => {
    const sdk = createSdk([]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.runDiagnosticPrompt({
      prompt: 'Continue from where we left off.',
      resumeSessionId: 'local-placeholder-session',
      _diagnosticResumeAt: true,
    })).rejects.toThrow('Claude Code diagnostic resume validation failed');

    expect(sdk.getSessionInfo).toHaveBeenCalledWith('local-placeholder-session', { dir: '/vault' });
    expect(sdk.query).not.toHaveBeenCalled();

    const unavailableSdk = createSdk([]);
    unavailableSdk.getSessionInfo = undefined as unknown as jest.Mock;
    const unavailableAdapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk: unavailableSdk,
    });

    await expect(unavailableAdapter.runDiagnosticPrompt({
      prompt: 'Continue from where we left off.',
      resumeSessionId: 'local-placeholder-session',
      _diagnosticResumeAt: true,
    })).rejects.toThrow('Claude Code diagnostic resume validation failed');

    expect(unavailableSdk.query).not.toHaveBeenCalled();
  });

  it('rejects diagnostic resume when SDK lookup returns a different session id', async () => {
    const sdk = createSdk([]);
    sdk.getSessionInfo.mockResolvedValue({
      sessionId: 'sdk-session-2',
      summary: 'Different Claude session',
      lastModified: 1700000000000,
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.runDiagnosticPrompt({
      prompt: 'Continue from where we left off.',
      resumeSessionId: 'sdk-session-1',
      _diagnosticResumeAt: true,
    })).rejects.toThrow('Claude Code diagnostic resume validation failed');

    expect(sdk.getSessionInfo).toHaveBeenCalledWith('sdk-session-1', { dir: '/vault' });
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it('rejects diagnostic resume when SDK lookup returns a different id alias', async () => {
    const sdk = createSdk([]);
    sdk.getSessionInfo.mockResolvedValue({
      id: 'sdk-session-2',
      summary: 'Different Claude session',
      lastModified: 1700000000000,
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.runDiagnosticPrompt({
      prompt: 'Continue from where we left off.',
      resumeSessionId: 'sdk-session-1',
      _diagnosticResumeAt: true,
    })).rejects.toThrow('Claude Code diagnostic resume validation failed');

    expect(sdk.getSessionInfo).toHaveBeenCalledWith('sdk-session-1', { dir: '/vault' });
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it('rejects diagnostic resume when the resumed query returns a different session id', async () => {
    const sdk = createSdk([{
      type: 'system',
      subtype: 'init',
      session_id: 'sdk-session-2',
    }, {
      type: 'assistant',
      message: {
        id: 'msg-resume-mismatch',
        content: [{ type: 'text', text: 'This should not be accepted as a resumed proof' }],
      },
    }]);
    sdk.getSessionInfo.mockResolvedValue({
      sessionId: 'sdk-session-1',
      summary: 'Existing Claude session',
      lastModified: 1700000000000,
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.runDiagnosticPrompt({
      prompt: 'Continue from where we left off.',
      resumeSessionId: 'sdk-session-1',
      _diagnosticResumeAt: true,
    })).rejects.toThrow('Claude Code diagnostic resume validation failed');

    expect(sdk.query).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        resume: 'sdk-session-1',
      }),
    }));
  });

  it('rejects diagnostic resume when the resumed query returns no session id', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-resume-missing-id',
        content: [{ type: 'text', text: 'This output has no comparable resumed session id' }],
      },
    }]);
    sdk.getSessionInfo.mockResolvedValue({
      sessionId: 'sdk-session-1',
      summary: 'Existing Claude session',
      lastModified: 1700000000000,
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.runDiagnosticPrompt({
      prompt: 'Continue from where we left off.',
      resumeSessionId: 'sdk-session-1',
      _diagnosticResumeAt: true,
    })).rejects.toThrow('Claude Code diagnostic resume validation failed');

    expect(sdk.query).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        resume: 'sdk-session-1',
      }),
    }));
  });

  it('allows diagnostic resume when SDK lookup succeeds without comparable id fields', async () => {
    const sdk = createSdk([{
      type: 'system',
      subtype: 'init',
      session_id: 'sdk-session-1',
    }]);
    sdk.getSessionInfo.mockResolvedValue({
      summary: 'Existing Claude session',
      lastModified: 1700000000000,
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await adapter.runDiagnosticPrompt({
      prompt: 'Continue from where we left off.',
      resumeSessionId: 'sdk-session-1',
      _diagnosticResumeAt: true,
    });

    expect(sdk.getSessionInfo).toHaveBeenCalledWith('sdk-session-1', { dir: '/vault' });
    expect(sdk.query).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Continue from where we left off.',
      options: expect.objectContaining({
        resume: 'sdk-session-1',
      }),
    }));
  });

  it('allows diagnostic resume only after resolving the Claude SDK session', async () => {
    const sdk = createSdk([{
      type: 'system',
      subtype: 'init',
      session_id: 'existing-sdk-session-42',
    }]);
    sdk.getSessionInfo.mockResolvedValue({
      sessionId: 'existing-sdk-session-42',
      summary: 'Existing Claude session',
      lastModified: 1700000000000,
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await adapter.runDiagnosticPrompt({
      prompt: 'Continue from where we left off.',
      resumeSessionId: 'existing-sdk-session-42',
      _diagnosticResumeAt: true,
    });

    expect(sdk.getSessionInfo).toHaveBeenCalledWith('existing-sdk-session-42', { dir: '/vault' });
    expect(sdk.query).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Continue from where we left off.',
      options: expect.objectContaining({
        resume: 'existing-sdk-session-42',
      }),
    }));
  });

  it('passes runtime-injected Claude SDK foundation options into query creation', async () => {
    const sdk = createSdk([]);
    const hooks = { SessionStart: [{ hooks: [jest.fn()] }] };
    const sessionStore = { append: jest.fn(), load: jest.fn() };
    const outputFormat = { type: 'json_schema', schema: { type: 'object' } };
    const plugins = [{ type: 'local', path: './claude-plugin' }];
    const agents = {
      reviewer: {
        description: 'Reviews current changes',
        prompt: 'Review the code.',
      },
    };
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
      hooks,
      sessionStore,
      sessionStoreFlush: 'eager',
      outputFormat,
      plugins,
      skills: 'all',
      agent: 'reviewer',
      agents,
    });
    const sessionId = await adapter.createSession('Claude chat');

    await collectAsync(adapter.sendMessage({ sessionId, content: 'hello' }));

    const options = sdk.query.mock.calls[0][0].options;
    expect(options.hooks).toBe(hooks);
    expect(options.sessionStore).toBe(sessionStore);
    expect(options.sessionStoreFlush).toBe('eager');
    expect(options.outputFormat).toBe(outputFormat);
    expect(options.plugins).toEqual(plugins);
    expect(options.skills).toBe('all');
    expect(options.agent).toBe('reviewer');
    expect(options.agents).toEqual(agents);
    expect(options.agents).not.toBe(agents);
  });

  it('surfaces unavailable SDK history APIs instead of returning empty data', async () => {
    const sdk = createSdk([]);
    delete sdk.getSessionMessages;
    delete sdk.listSubagents;
    delete sdk.getSubagentMessages;
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.getSessionMessages('sdk-session')).rejects.toThrow('getSessionMessages is unavailable');
    await expect(adapter.listSubagents('sdk-session')).rejects.toThrow('listSubagents is unavailable');
    await expect(adapter.getSubagentMessages('sdk-session', 'agent-1'))
      .rejects.toThrow('getSubagentMessages is unavailable');
  });

  it('blocks diagnostic history operations for deleted local sessions', async () => {
    const sdk = createSdk([]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession('Claude chat');
    await adapter.deleteSession(sessionId);

    await expect(adapter.getSessionMessages(sessionId)).rejects.toThrow('session not found');
    await expect(adapter.importSessionToStore(sessionId, { append: jest.fn(), load: jest.fn() }))
      .rejects.toThrow('session not found');
    expect(sdk.getSessionMessages).not.toHaveBeenCalled();
    expect(sdk.importSessionToStore).not.toHaveBeenCalled();
  });

  it('recovers a persisted local session handle before sending after adapter restart', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [{ type: 'text', text: 'Recovered session' }],
      },
    }]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(collectAsync(adapter.sendMessage({
      sessionId: 'claude-code-persisted',
      content: 'hello',
    }))).resolves.toEqual([{
      type: 'text',
      content: 'Recovered session',
    }]);

    expect(sdk.query).toHaveBeenCalledTimes(1);
    expect(sdk.query.mock.calls[0][0].options.resume).toBeUndefined();
  });

  it('resumes a persisted Claude SDK session id after adapter restart', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [{ type: 'text', text: 'Resumed session' }],
      },
    }]);
    sdk.getSessionInfo.mockResolvedValue({
      sessionId: 'sdk-persisted-session',
      summary: 'Persisted session',
      lastModified: 123,
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(collectAsync(adapter.sendMessage({
      sessionId: 'sdk-persisted-session',
      content: 'resume me',
    }))).resolves.toEqual([{
      type: 'text',
      content: 'Resumed session',
    }]);

    expect(sdk.query).toHaveBeenCalledTimes(1);
    expect(sdk.getSessionInfo).toHaveBeenCalledWith('sdk-persisted-session', { dir: '/vault' });
    expect(sdk.query.mock.calls[0][0].options.resume).toBe('sdk-persisted-session');
  });

  it('validates a restored persisted Claude SDK session id before starting a resumed query', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [{ type: 'text', text: 'Resumed session' }],
      },
    }]);
    sdk.getSessionInfo.mockResolvedValue({
      sessionId: 'sdk-persisted-session',
      summary: 'Persisted session',
      lastModified: 123,
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(collectAsync(adapter.sendMessage({
      sessionId: 'sdk-persisted-session',
      content: 'resume me',
    }))).resolves.toContainEqual({
      type: 'text',
      content: 'Resumed session',
    });

    expect(sdk.getSessionInfo).toHaveBeenCalledWith('sdk-persisted-session', { dir: '/vault' });
    expect(sdk.query).toHaveBeenCalledTimes(1);
    expect(sdk.query.mock.calls[0][0].options.resume).toBe('sdk-persisted-session');
  });

  it('rejects a restored persisted Claude SDK session id when lookup is missing before query', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [{ type: 'text', text: 'Should not start' }],
      },
    }]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(collectAsync(adapter.sendMessage({
      sessionId: 'sdk-missing-session',
      content: 'resume me',
    }))).resolves.toEqual([{
      type: 'error',
      content: expect.stringMatching(/^Claude Code resume validation failed:/),
    }]);

    expect(sdk.getSessionInfo).toHaveBeenCalledWith('sdk-missing-session', { dir: '/vault' });
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it('rejects a restored persisted Claude SDK session id when lookup has no comparable identity before query', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [{ type: 'text', text: 'Should not start' }],
      },
    }]);
    sdk.getSessionInfo.mockResolvedValue({
      summary: 'Ambiguous session',
      lastModified: 123,
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(collectAsync(adapter.sendMessage({
      sessionId: 'sdk-ambiguous-session',
      content: 'resume me',
    }))).resolves.toEqual([{
      type: 'error',
      content: expect.stringMatching(/^Claude Code resume validation failed:/),
    }]);

    expect(sdk.getSessionInfo).toHaveBeenCalledWith('sdk-ambiguous-session', { dir: '/vault' });
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it('rejects a restored persisted Claude SDK session id when lookup returns a different id before query', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [{ type: 'text', text: 'Should not start' }],
      },
    }]);
    sdk.getSessionInfo.mockResolvedValue({
      sessionId: 'sdk-other-session',
      summary: 'Different session',
      lastModified: 123,
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(collectAsync(adapter.sendMessage({
      sessionId: 'sdk-persisted-session',
      content: 'resume me',
    }))).resolves.toEqual([{
      type: 'error',
      content: expect.stringMatching(/^Claude Code resume validation failed:/),
    }]);

    expect(sdk.getSessionInfo).toHaveBeenCalledWith('sdk-persisted-session', { dir: '/vault' });
    expect(sdk.query).not.toHaveBeenCalled();
  });

  it('rejects a resumed user query when the SDK returns a different session id', async () => {
    const sdk = createSdk([{
      type: 'system',
      subtype: 'init',
      session_id: 'sdk-other-session',
    }, {
      type: 'assistant',
      session_id: 'sdk-other-session',
      message: {
        id: 'msg-1',
        content: [{ type: 'text', text: 'Should not rebind' }],
      },
    }]);
    sdk.getSessionInfo.mockResolvedValue({
      sessionId: 'sdk-persisted-session',
      summary: 'Persisted session',
      lastModified: 123,
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(collectAsync(adapter.sendMessage({
      sessionId: 'sdk-persisted-session',
      content: 'resume me',
    }))).resolves.toEqual([{
      type: 'error',
      content: expect.stringContaining('Claude Code resume validation failed'),
    }]);

    expect(sdk.query).toHaveBeenCalledTimes(1);
    expect(sdk.query.mock.calls[0][0].options.resume).toBe('sdk-persisted-session');
    expect(sdk.getSessionInfo).toHaveBeenCalledTimes(1);
  });

  it('rejects a resumed user query when a non-metadata SDK message returns a different session id', async () => {
    const sdk = createSdk([{
      type: 'result',
      subtype: 'success',
      session_id: 'sdk-other-session',
    }]);
    sdk.getSessionInfo.mockResolvedValue({
      sessionId: 'sdk-persisted-session',
      summary: 'Persisted session',
      lastModified: 123,
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(collectAsync(adapter.sendMessage({
      sessionId: 'sdk-persisted-session',
      content: 'resume me',
    }))).resolves.toEqual([{
      type: 'error',
      content: expect.stringContaining('Claude Code resume validation failed'),
    }]);

    expect(sdk.query).toHaveBeenCalledTimes(1);
    expect(sdk.query.mock.calls[0][0].options.resume).toBe('sdk-persisted-session');
    expect(sdk.getSessionInfo).toHaveBeenCalledTimes(1);
  });

  it('ignores hook event session IDs during resumed session send', async () => {
    // Regression: hook_started events carry an internal hook-runtime session ID
    // that differs from the resumed conversation session ID. The adapter must
    // NOT treat hook session IDs as authoritative for conversation identity.
    const sdk = createSdk([
      {
        type: 'system',
        subtype: 'hook_started',
        session_id: 'hook-runtime-9eda7308',
        hook_id: 'hook-1',
        hook_name: 'pre-tool',
        hook_event: 'before',
      },
      {
        type: 'system',
        subtype: 'init',
        session_id: 'sdk-persisted-session',
      },
      {
        type: 'assistant',
        session_id: 'sdk-persisted-session',
        message: {
          id: 'msg-1',
          content: [{ type: 'text', text: 'Resumed after hook' }],
        },
      },
    ]);
    sdk.getSessionInfo.mockResolvedValue({
      sessionId: 'sdk-persisted-session',
      summary: 'Persisted session',
      lastModified: 123,
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const chunks = await collectAsync(adapter.sendMessage({
      sessionId: 'sdk-persisted-session',
      content: 'resume me',
    }));

    // Should complete without a resume validation error
    const errorChunks = chunks.filter(c => c.type === 'error');
    expect(errorChunks).toEqual([]);

    // Should contain the actual assistant reply
    expect(chunks).toContainEqual({
      type: 'text',
      content: 'Resumed after hook',
    });

    expect(sdk.query).toHaveBeenCalledTimes(1);
    expect(sdk.query.mock.calls[0][0].options.resume).toBe('sdk-persisted-session');
  });

  it('still rejects a resumed session when a non-hook backend event carries a different session id', async () => {
    // Safety boundary: only hook events are excluded from session identity.
    // A subagent backend event with a mismatched session ID should still
    // trigger resume validation failure.
    const sdk = createSdk([
      {
        type: 'system',
        subtype: 'task_started',
        session_id: 'other-session-mismatch',
        task_id: 'task-1',
        subagent_type: 'codex',
      },
      {
        type: 'assistant',
        session_id: 'other-session-mismatch',
        message: {
          id: 'msg-1',
          content: [{ type: 'text', text: 'Should not appear' }],
        },
      },
    ]);
    sdk.getSessionInfo.mockResolvedValue({
      sessionId: 'sdk-persisted-session',
      summary: 'Persisted session',
      lastModified: 123,
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(collectAsync(adapter.sendMessage({
      sessionId: 'sdk-persisted-session',
      content: 'resume me',
    }))).resolves.toEqual([{
      type: 'error',
      content: expect.stringContaining('Claude Code resume validation failed'),
    }]);

    expect(sdk.query).toHaveBeenCalledTimes(1);
  });

  it('lazy-loads the official SDK facade on first send instead of plugin startup', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [{ type: 'text', text: 'Loaded lazily' }],
      },
    }]);
    const sdkLoader: jest.MockedFunction<ClaudeCodeSdkLoader> = jest.fn().mockResolvedValue(sdk);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdkLoader,
    });

    await adapter.start();
    const sessionId = await adapter.createSession();

    expect(sdkLoader).not.toHaveBeenCalled();

    await expect(collectAsync(adapter.sendMessage({
      sessionId,
      content: 'hello',
    }))).resolves.toEqual([{
      type: 'text',
      content: 'Loaded lazily',
    }]);

    expect(sdkLoader).toHaveBeenCalledTimes(1);
    await collectAsync(adapter.sendMessage({ sessionId, content: 'again' }));
    expect(sdkLoader).toHaveBeenCalledTimes(1);
  });

  it('injects permission bridge canUseTool into SDK options', async () => {
    const sdk = createSdk([]);
    const permissionBridge = createClaudeCodePermissionBridge();
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
      permissionBridge,
    });
    const sessionId = await adapter.createSession();

    await collectAsync(adapter.sendMessage({ sessionId, content: 'hello' }));

    const call = sdk.query.mock.calls[0][0];
    expect(typeof call.options.canUseTool).toBe('function');
  });

  it('injects permission, elicitation, and MCP seams into diagnostic SDK options', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-diagnostic-proof',
        content: [{ type: 'text', text: 'diagnostic ok' }],
      },
    }]);
    const permissionBridge = createClaudeCodePermissionBridge();
    const onElicitation = jest.fn();
    const mcpServers = {
      filesystem: { command: 'node', args: ['server.js'] },
    };
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
      permissionBridge,
      onElicitation,
      mcpServers,
    });

    await adapter.runDiagnosticPrompt({
      prompt: 'diagnose permission, question, and MCP seams',
      persistSession: false,
    });

    const call = sdk.query.mock.calls[0][0];
    expect(call.options.persistSession).toBe(false);
    expect(typeof call.options.canUseTool).toBe('function');
    expect(typeof call.options.onElicitation).toBe('function');
    expect(call.options.mcpServers).toEqual(mcpServers);
  });

  it('cancels active streams without yielding later chunks', async () => {
    async function* delayedMessages() {
      yield {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [{ type: 'text', text: 'first' }],
        },
      };
      yield {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [{ type: 'text', text: 'first second' }],
        },
      };
    }
    const sdk: ClaudeCodeSdkFacade & { query: jest.Mock } = {
      query: jest.fn(() => delayedMessages()),
    };
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();
    const stream = adapter.sendMessage({ sessionId, content: 'hello' });

    await expect(stream.next()).resolves.toEqual({
      value: { type: 'text', content: 'first' },
      done: false,
    });
    adapter.cancelStream(sessionId);
    await expect(stream.next()).resolves.toEqual({
      value: undefined,
      done: true,
    });
  });

  it('interrupts the persistent SDK query when cancelling a Claude Code stream', async () => {
    const sdkOutput = createAsyncQueue<unknown>();
    const query = sdkOutput as AsyncIterable<unknown> & {
      interrupt: jest.Mock<Promise<void>, []>;
      close: jest.Mock<void, []>;
    };
    query.interrupt = jest.fn().mockResolvedValue(undefined);
    query.close = jest.fn();
    const sdk: ClaudeCodeSdkFacade & { query: jest.Mock } = {
      query: jest.fn(() => query),
    };
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();
    const stream = adapter.sendMessage({ sessionId, content: 'hello' });

    const next = stream.next();
    await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(1));
    adapter.cancelStream(sessionId);
    await expect(next).resolves.toEqual({ value: undefined, done: true });

    expect(query.interrupt).toHaveBeenCalledTimes(1);
  });

  it('surfaces SDK query failures as backend-labelled error chunks without raw error logs', async () => {
    const shouldYield = (): boolean => false;
    const rawError = 'token=abc123 prompt=hello secret command=/bin/private';
    const sdk: ClaudeCodeSdkFacade & { query: jest.Mock } = {
      query: jest.fn(() => (async function* () {
        if (shouldYield()) {
          yield undefined;
        }
        throw new Error(rawError);
      })()),
    };
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();

    await expect(collectAsync(adapter.sendMessage({ sessionId, content: 'hello' })))
      .resolves.toEqual([{
        type: 'error',
        content: `Claude Code stream failed: ${rawError}`,
      }]);

    const entries = getRecentLogEntries().filter((entry) => entry.scope === 'ClaudeCodeAdapter');
    const logText = entries.map((entry) => entry.message).join('\n');

    expect(entries.some((entry) => entry.moduleKey === 'claudeCode')).toBe(true);
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: 'runtime' }),
      expect.objectContaining({ channel: 'sessions' }),
    ]));
    expect(logText).toContain('sendMessage start');
    expect(logText).toContain('runtime create');
    expect(logText).toContain('SDK query creation');
    expect(logText).toContain('sendMessage error');
    expect(logText).not.toContain('hello');
    expect(logText).not.toContain('abc123');
    expect(logText).not.toContain('/bin/private');
    expect(logText).toContain('messageLength');
  });

  it('dispose clears state and subscribers', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk: createSdk([]),
    });
    const handler = jest.fn();
    const sessionId = await adapter.createSession();
    adapter.onStatusChange(handler);

    adapter.dispose();
    await adapter.start();

    expect(handler).not.toHaveBeenCalled();
    expect(adapter.status).toBe('connected');
    await expect(collectAsync(adapter.sendMessage({
      sessionId,
      content: 'hello',
    }))).rejects.toThrow(`Claude Code session not found: ${sessionId}`);
  });

  function createSdkWithActiveRewindRuntime(
    rewindFilesMock: jest.Mock,
  ): ClaudeCodeSdkFacade & { query: jest.Mock } {
    const queue = createAsyncQueue<unknown>();
    const closeQueue = queue.close;
    const queryWithRewind = Object.assign(queue, {
      rewindFiles: rewindFilesMock,
      supportedModels: jest.fn().mockResolvedValue([]),
      close: jest.fn(() => closeQueue()),
    });
    return {
      query: jest.fn(() => queryWithRewind) as unknown as ClaudeCodeSdkFacade['query'] & jest.Mock,
      listSessions: jest.fn().mockResolvedValue([]),
      getSessionInfo: jest.fn().mockResolvedValue(undefined),
      getSessionMessages: jest.fn().mockResolvedValue([]),
      listSubagents: jest.fn().mockResolvedValue([]),
      getSubagentMessages: jest.fn().mockResolvedValue([]),
      importSessionToStore: jest.fn().mockResolvedValue(undefined),
      forkSession: jest.fn().mockResolvedValue({ sessionId: 'sdk-fork-session' }),
      renameSession: jest.fn().mockResolvedValue(undefined),
    };
  }

  describe('ClaudeCodeAdapter rewindFiles', () => {
    it('throws when no runtime is available', async () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk: createSdk([]),
      });

      await expect(adapter.rewindFiles('unknown-session', 'msg-1'))
        .rejects.toThrow('Claude Code rewindFiles is unavailable');
    });

    it('delegates to query.rewindFiles when runtime is active', async () => {
      const result = { rewound: true };
      const rewindFiles = jest.fn().mockResolvedValue(result);
      const sdk = createSdkWithActiveRewindRuntime(rewindFiles);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });
      const sessionId = await adapter.createSession();
      const stream = adapter.sendMessage({ sessionId, content: 'hello' });
      const firstChunk = nextFrom(stream);

      await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(1));
      const query = sdk.query.mock.results[0].value;

      try {
        query.push({ type: 'system', subtype: 'init', session_id: 'sdk-rewind-session' });
        await firstChunk;

        await expect(adapter.rewindFiles(sessionId, 'msg-1')).resolves.toBe(result);
        expect(rewindFiles).toHaveBeenCalledWith('msg-1', { dryRun: true });
      } finally {
        query.close();
        await collectAsync(stream);
      }
    });

    it('passes dryRun option to query.rewindFiles', async () => {
      const rewindFiles = jest.fn().mockResolvedValue({ dryRun: true });
      const sdk = createSdkWithActiveRewindRuntime(rewindFiles);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });
      const sessionId = await adapter.createSession();
      const stream = adapter.sendMessage({ sessionId, content: 'hello' });
      const firstChunk = nextFrom(stream);

      await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(1));
      const query = sdk.query.mock.results[0].value;

      try {
        query.push({ type: 'system', subtype: 'init', session_id: 'sdk-rewind-session' });
        await firstChunk;

        await adapter.rewindFiles(sessionId, 'msg-2', { dryRun: true });
        expect(rewindFiles).toHaveBeenCalledWith('msg-2', { dryRun: true });
      } finally {
        query.close();
        await collectAsync(stream);
      }
    });

    it('propagates errors from query.rewindFiles', async () => {
      const error = new Error('rewind failed');
      const rewindFiles = jest.fn().mockRejectedValue(error);
      const sdk = createSdkWithActiveRewindRuntime(rewindFiles);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });
      const sessionId = await adapter.createSession();
      const stream = adapter.sendMessage({ sessionId, content: 'hello' });
      const firstChunk = nextFrom(stream);

      await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(1));
      const query = sdk.query.mock.results[0].value;

      try {
        query.push({ type: 'system', subtype: 'init', session_id: 'sdk-rewind-session' });
        await firstChunk;

        await expect(adapter.rewindFiles(sessionId, 'msg-1')).rejects.toBe(error);
      } finally {
        query.close();
        await collectAsync(stream);
      }
    });

    it('throws for invalidated sessions', async () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk: createSdk([]),
      });
      const sessionId = await adapter.createSession();

      adapter.dispose();

      await expect(adapter.rewindFiles(sessionId, 'msg-1'))
        .rejects.toThrow(`Claude Code session not found: ${sessionId}`);
    });
  });

  describe('ClaudeCodeAdapter rewindFiles safety guards', () => {
    it('defaults to dryRun=true when no options are provided', async () => {
      const rewindFiles = jest.fn().mockResolvedValue({ dryRun: true });
      const sdk = createSdkWithActiveRewindRuntime(rewindFiles);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });
      const sessionId = await adapter.createSession();
      const stream = adapter.sendMessage({ sessionId, content: 'hello' });
      const firstChunk = nextFrom(stream);

      await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(1));
      const query = sdk.query.mock.results[0].value;

      try {
        query.push({ type: 'system', subtype: 'init', session_id: 'sdk-rewind-session' });
        await firstChunk;

        await adapter.rewindFiles(sessionId, 'msg-1');
        expect(rewindFiles).toHaveBeenCalledWith('msg-1', { dryRun: true });
      } finally {
        query.close();
        await collectAsync(stream);
      }
    });

    it('defaults to dryRun=true when options is an empty object', async () => {
      const rewindFiles = jest.fn().mockResolvedValue({ dryRun: true });
      const sdk = createSdkWithActiveRewindRuntime(rewindFiles);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });
      const sessionId = await adapter.createSession();
      const stream = adapter.sendMessage({ sessionId, content: 'hello' });
      const firstChunk = nextFrom(stream);

      await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(1));
      const query = sdk.query.mock.results[0].value;

      try {
        query.push({ type: 'system', subtype: 'init', session_id: 'sdk-rewind-session' });
        await firstChunk;

        await adapter.rewindFiles(sessionId, 'msg-2', {});
        expect(rewindFiles).toHaveBeenCalledWith('msg-2', { dryRun: true });
      } finally {
        query.close();
        await collectAsync(stream);
      }
    });

    it('logs a warning when dryRun is explicitly false', async () => {
      const rewindFiles = jest.fn().mockResolvedValue({ rewound: true });
      const sdk = createSdkWithActiveRewindRuntime(rewindFiles);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });
      const sessionId = await adapter.createSession();
      const stream = adapter.sendMessage({ sessionId, content: 'hello' });
      const firstChunk = nextFrom(stream);

      await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(1));
      const query = sdk.query.mock.results[0].value;

      try {
        query.push({ type: 'system', subtype: 'init', session_id: 'sdk-rewind-session' });
        await firstChunk;

        clearRecentLogs();
        await adapter.rewindFiles(sessionId, 'msg-3', { dryRun: false });
        expect(rewindFiles).toHaveBeenCalledWith('msg-3', { dryRun: false });

        const entries = getRecentLogEntries().filter((entry) => entry.scope === 'ClaudeCodeAdapter');
        const warnings = entries.filter((entry) => entry.level === 'warn');
        expect(warnings.some((entry) => entry.message.includes('dryRun=false'))).toBe(true);
      } finally {
        query.close();
        await collectAsync(stream);
      }
    });

    it('throws when userMessageId is empty', async () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk: createSdk([]),
      });

      await expect(adapter.rewindFiles('any-session', ''))
        .rejects.toThrow('requires a non-empty userMessageId');
    });

    it('throws when userMessageId is whitespace-only', async () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk: createSdk([]),
      });

      await expect(adapter.rewindFiles('any-session', '   '))
        .rejects.toThrow('requires a non-empty userMessageId');
    });
  });

  describe('runCheckpointRewindProbe applyFlagSettings seam', () => {
    /** Creates an SDK facade with a mockable query for runCheckpointRewindProbe testing */
    function createProbeSdk(opts: {
      /** Mock for query.applyFlagSettings — if omitted, method is not present on query */
      applyFlagSettings?: jest.Mock;
      /** Messages to yield from Phase 1 query */
      phase1Messages: unknown[];
      /** Messages to yield from Phase 2 query */
      phase2Messages: unknown[];
      /** Mock for query.rewindFiles */
      rewindFiles?: jest.Mock;
      /** If true, query does NOT have rewindFiles method */
      noRewindFiles?: boolean;
    }): ClaudeCodeSdkFacade & { query: jest.Mock } {
      let queryIndex = 0;
      const allMessages = [opts.phase1Messages, opts.phase2Messages];

      const mockQuery = jest.fn(() => {
        const messages = allMessages[queryIndex] ?? [];
        queryIndex += 1;
        const queue = createAsyncQueue<unknown>();
        const closeQueue = queue.close;
        const q: Record<string, unknown> = Object.assign(queue, {
          supportedModels: jest.fn().mockResolvedValue([]),
          close: jest.fn(() => closeQueue()),
        });
        if (!opts.noRewindFiles) {
          q.rewindFiles = opts.rewindFiles ?? jest.fn().mockResolvedValue({ canRewind: false, error: 'No file checkpoint found' });
        }
        if (opts.applyFlagSettings) {
          q.applyFlagSettings = opts.applyFlagSettings;
        }
        // Push messages after a tick so the async iterator is ready
        setTimeout(() => {
          for (const msg of messages) {
            (q as AsyncIterable<unknown> & { push: (v: unknown) => void }).push(msg);
          }
          (q as { close: () => void }).close();
        }, 0);
        return q;
      });

      return {
        query: mockQuery as unknown as ClaudeCodeSdkFacade['query'] & jest.Mock,
        listSessions: jest.fn().mockResolvedValue([]),
        getSessionInfo: jest.fn().mockResolvedValue(undefined),
        getSessionMessages: jest.fn().mockResolvedValue([]),
        listSubagents: jest.fn().mockResolvedValue([]),
        getSubagentMessages: jest.fn().mockResolvedValue([]),
        importSessionToStore: jest.fn().mockResolvedValue(undefined),
        forkSession: jest.fn().mockResolvedValue({ sessionId: 'sdk-fork-session' }),
        renameSession: jest.fn().mockResolvedValue(undefined),
      };
    }

    it('sets applyFlagSettingsAttempted=true and applyFlagSettingsError=undefined when call succeeds', async () => {
      const applyFlagSettings = jest.fn().mockResolvedValue(undefined);
      const sdk = createProbeSdk({
        applyFlagSettings,
        phase1Messages: [
          { type: 'user', uuid: 'user-msg-001', session_id: 'probe-session-1' },
          { type: 'assistant', session_id: 'probe-session-1', message: { role: 'assistant' } },
          { type: 'tool_use', name: 'Write', session_id: 'probe-session-1' },
          { type: 'user', uuid: 'tool-result-001', session_id: 'probe-session-1' },
          { type: 'result', subtype: 'success', session_id: 'probe-session-1' },
        ],
        phase2Messages: [
          { type: 'assistant', session_id: 'probe-session-1', message: { role: 'assistant' } },
          { type: 'result', subtype: 'success', session_id: 'probe-session-1' },
        ],
      });

      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/tmp/test-vault-probe',
        settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'bypassPermissions' },
        sdk,
      });

      const result = await adapter.runCheckpointRewindProbe();

      expect(result.applyFlagSettingsAttempted).toBe(true);
      expect(result.applyFlagSettingsError).toBeUndefined();
      expect(applyFlagSettings).toHaveBeenCalledWith({ fileCheckpointingEnabled: true });
    });

    it('sets applyFlagSettingsError when applyFlagSettings is not available on Query', async () => {
      // Don't provide applyFlagSettings mock — method won't exist on query
      const sdk = createProbeSdk({
        phase1Messages: [
          { type: 'user', uuid: 'user-msg-002', session_id: 'probe-session-2' },
          { type: 'assistant', session_id: 'probe-session-2', message: { role: 'assistant' } },
          { type: 'result', subtype: 'success', session_id: 'probe-session-2' },
        ],
        phase2Messages: [
          { type: 'assistant', session_id: 'probe-session-2', message: { role: 'assistant' } },
          { type: 'result', subtype: 'success', session_id: 'probe-session-2' },
        ],
      });

      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/tmp/test-vault-probe',
        settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'bypassPermissions' },
        sdk,
      });

      const result = await adapter.runCheckpointRewindProbe();

      expect(result.applyFlagSettingsAttempted).toBe(true);
      expect(result.applyFlagSettingsError).toBe('applyFlagSettings not available on Query');
    });

    it('sets applyFlagSettingsError when applyFlagSettings throws', async () => {
      const applyFlagSettings = jest.fn().mockRejectedValue(new Error('control request failed'));
      const sdk = createProbeSdk({
        applyFlagSettings,
        phase1Messages: [
          { type: 'user', uuid: 'user-msg-003', session_id: 'probe-session-3' },
          { type: 'assistant', session_id: 'probe-session-3', message: { role: 'assistant' } },
          { type: 'result', subtype: 'success', session_id: 'probe-session-3' },
        ],
        phase2Messages: [
          { type: 'assistant', session_id: 'probe-session-3', message: { role: 'assistant' } },
          { type: 'result', subtype: 'success', session_id: 'probe-session-3' },
        ],
      });

      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/tmp/test-vault-probe',
        settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'bypassPermissions' },
        sdk,
      });

      const result = await adapter.runCheckpointRewindProbe();

      expect(result.applyFlagSettingsAttempted).toBe(true);
      expect(result.applyFlagSettingsError).toBe('control request failed');
    });

    it('sets applyFlagSettingsAttempted=false when no assistant message is seen', async () => {
      const applyFlagSettings = jest.fn().mockResolvedValue(undefined);
      const sdk = createProbeSdk({
        applyFlagSettings,
        phase1Messages: [
          { type: 'user', uuid: 'user-msg-004', session_id: 'probe-session-4' },
          { type: 'result', subtype: 'success', session_id: 'probe-session-4' },
        ],
        phase2Messages: [
          { type: 'result', subtype: 'success', session_id: 'probe-session-4' },
        ],
      });

      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/tmp/test-vault-probe',
        settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'bypassPermissions' },
        sdk,
      });

      const result = await adapter.runCheckpointRewindProbe();

      expect(result.applyFlagSettingsAttempted).toBe(false);
      expect(applyFlagSettings).not.toHaveBeenCalled();
    });

    it('returns applyFlagSettings fields on early-return path (no initial user message)', async () => {
      const applyFlagSettings = jest.fn().mockResolvedValue(undefined);
      const sdk = createProbeSdk({
        applyFlagSettings,
        // No user message with uuid — probe should early-return
        phase1Messages: [
          { type: 'system', subtype: 'init', session_id: 'probe-session-5' },
          { type: 'result', subtype: 'success', session_id: 'probe-session-5' },
        ],
        phase2Messages: [],
      });

      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/tmp/test-vault-probe',
        settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'bypassPermissions' },
        sdk,
      });

      const result = await adapter.runCheckpointRewindProbe();

      // Early return path still includes applyFlagSettings fields
      expect(result).toHaveProperty('applyFlagSettingsAttempted');
      expect(result).toHaveProperty('applyFlagSettingsError');
    });
  });

  describe('runCheckpointRewindProbe probe file cleanup', () => {
    it('cleans up probe file when Phase 2 sdk.query throws', async () => {
      const vaultPath = `/tmp/opencodian-test-probe-cleanup-${Date.now()}`;
      mkdirSync(vaultPath, { recursive: true });
      const probeFilePath = `${vaultPath}/.opencodian-checkpoint-probe.txt`;

      try {
        let queryCallIndex = 0;
        const phase1Messages = [
          { type: 'user', uuid: 'user-msg-cleanup-test', session_id: 'probe-session-cleanup' },
          { type: 'assistant', session_id: 'probe-session-cleanup', message: { role: 'assistant' } },
          { type: 'result', subtype: 'success', session_id: 'probe-session-cleanup' },
        ];

        const mockQuery = jest.fn(() => {
          if (queryCallIndex === 0) {
            queryCallIndex++;
            const queue = createAsyncQueue<unknown>();
            const closeQueue = queue.close;
            const q: Record<string, unknown> = Object.assign(queue, {
              supportedModels: jest.fn().mockResolvedValue([]),
              close: jest.fn(() => closeQueue()),
              rewindFiles: jest.fn().mockResolvedValue({ canRewind: false, error: 'No checkpoint' }),
            });
            setTimeout(() => {
              writeFileSync(probeFilePath, 'checkpoint-test-content');
              for (const msg of phase1Messages) {
                (q as AsyncIterable<unknown> & { push: (v: unknown) => void }).push(msg);
              }
              closeQueue();
            }, 0);
            return q;
          }
          throw new Error('Phase 2 SDK query creation failed');
        });

        const sdk: ClaudeCodeSdkFacade = {
          query: mockQuery as unknown as ClaudeCodeSdkFacade['query'],
          listSessions: jest.fn().mockResolvedValue([]),
          getSessionInfo: jest.fn().mockResolvedValue(undefined),
          getSessionMessages: jest.fn().mockResolvedValue([]),
          listSubagents: jest.fn().mockResolvedValue([]),
          getSubagentMessages: jest.fn().mockResolvedValue([]),
          importSessionToStore: jest.fn().mockResolvedValue(undefined),
          forkSession: jest.fn().mockResolvedValue({ sessionId: 'fork-session' }),
          renameSession: jest.fn().mockResolvedValue(undefined),
        };

        const adapter = new ClaudeCodeAdapter({
          vaultPath,
          settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'bypassPermissions' },
          sdk,
        });

        await expect(adapter.runCheckpointRewindProbe())
          .rejects.toThrow('Phase 2 SDK query creation failed');

        expect(existsSync(probeFilePath)).toBe(false);
      } finally {
        rmSync(vaultPath, { recursive: true, force: true });
      }
    });
  });

  describe('ClaudeCodeAdapter runtime controls and diagnostic session lookup', () => {
    function createRuntimeControlQuery(overrides: {
      setModel?: jest.Mock;
      setPermissionMode?: jest.Mock;
      setMcpServers?: jest.Mock;
    } = {}) {
      const queue = createAsyncQueue<unknown>();
      const closeQueue = queue.close;
      return Object.assign(queue, {
        supportedModels: jest.fn().mockResolvedValue([]),
        close: jest.fn(() => closeQueue()),
        ...overrides,
      });
    }

    async function startRuntime(adapter: ClaudeCodeAdapter, sessionId: string) {
      const stream = adapter.sendMessage({ sessionId, content: 'hello' });
      const next = stream.next();
      await waitForExpect(() => expect(next).toBeDefined());
      return { stream, next };
    }

    it('applies setModel to active runtimes, skips closed runtimes, and no-ops without active sessions', async () => {
      const activeSetModel = jest.fn().mockResolvedValue(undefined);
      const closedSetModel = jest.fn().mockResolvedValue(undefined);
      const activeQuery = createRuntimeControlQuery({ setModel: activeSetModel });
      const closedQuery = createRuntimeControlQuery({ setModel: closedSetModel });
      const sdk = createSdk([]);
      sdk.query
        .mockReturnValueOnce(activeQuery)
        .mockReturnValueOnce(closedQuery);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });
      const activeSessionId = await adapter.createSession();
      const closedSessionId = await adapter.createSession();
      const activeRuntime = await startRuntime(adapter, activeSessionId);
      await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(1));
      const closedRuntime = await startRuntime(adapter, closedSessionId);
      await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(2));

      try {
        adapter.cancelStream(closedSessionId);
        await closedRuntime.next;

        await expect(adapter.setModel('claude-opus')).resolves.toBeUndefined();
        expect(activeSetModel).toHaveBeenCalledWith('claude-opus');
        expect(closedSetModel).not.toHaveBeenCalled();

        const idleAdapter = new ClaudeCodeAdapter({
          vaultPath: '/vault',
          settings: getDefaultClaudeCodeBackendSettings(),
          sdk: createSdk([]),
        });
        await expect(idleAdapter.setModel('claude-sonnet')).resolves.toBeUndefined();
      } finally {
        activeQuery.close();
        await activeRuntime.next;
      }
    });

    it('applies setPermissionMode to active runtimes, skips closed runtimes, and no-ops without active sessions', async () => {
      const activeSetPermissionMode = jest.fn().mockResolvedValue(undefined);
      const closedSetPermissionMode = jest.fn().mockResolvedValue(undefined);
      const activeQuery = createRuntimeControlQuery({ setPermissionMode: activeSetPermissionMode });
      const closedQuery = createRuntimeControlQuery({ setPermissionMode: closedSetPermissionMode });
      const sdk = createSdk([]);
      sdk.query
        .mockReturnValueOnce(activeQuery)
        .mockReturnValueOnce(closedQuery);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });
      const activeSessionId = await adapter.createSession();
      const closedSessionId = await adapter.createSession();
      const activeRuntime = await startRuntime(adapter, activeSessionId);
      await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(1));
      const closedRuntime = await startRuntime(adapter, closedSessionId);
      await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(2));

      try {
        adapter.cancelStream(closedSessionId);
        await closedRuntime.next;

        await expect(adapter.setPermissionMode('acceptEdits')).resolves.toBeUndefined();
        expect(activeSetPermissionMode).toHaveBeenCalledWith('acceptEdits');
        expect(closedSetPermissionMode).not.toHaveBeenCalled();

        const idleAdapter = new ClaudeCodeAdapter({
          vaultPath: '/vault',
          settings: getDefaultClaudeCodeBackendSettings(),
          sdk: createSdk([]),
        });
        await expect(idleAdapter.setPermissionMode('default')).resolves.toBeUndefined();
      } finally {
        activeQuery.close();
        await activeRuntime.next;
      }
    });

    it('reloads MCP config and pushes updated servers to active runtimes', async () => {
      const setMcpServers = jest.fn().mockResolvedValue(undefined);
      const query = createRuntimeControlQuery({ setMcpServers });
      const sdk = createSdk([]);
      sdk.query.mockReturnValue(query);
      const initialMcpServers = {
        oldServer: { type: 'stdio' as const, command: 'node', args: ['old.js'] },
      };
      const reloadedMcpServers = {
        newServer: { type: 'stdio' as const, command: 'node', args: ['new.js'] },
      };
      const mcpConfigLoader = jest.fn()
        .mockResolvedValueOnce(initialMcpServers)
        .mockResolvedValueOnce(reloadedMcpServers);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
        mcpConfigLoader,
      });
      const sessionId = await adapter.createSession();
      const runtime = await startRuntime(adapter, sessionId);
      await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(1));

      try {
        expect(sdk.query.mock.calls[0][0].options.mcpServers).toEqual(initialMcpServers);

        await expect(adapter.reloadMcpServers()).resolves.toBeUndefined();

        expect(mcpConfigLoader).toHaveBeenCalledTimes(2);
        expect(setMcpServers).toHaveBeenCalledWith(reloadedMcpServers);
      } finally {
        query.close();
        await runtime.next;
      }
    });

    it('restarts all active persistent runtimes for restart-sensitive settings changes', async () => {
      const firstQuery = createRuntimeControlQuery();
      const secondQuery = createRuntimeControlQuery();
      const sdk = createSdk([]);
      sdk.query
        .mockReturnValueOnce(firstQuery)
        .mockReturnValueOnce(secondQuery);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });
      const sessionId = await adapter.createSession();
      const firstRuntime = await startRuntime(adapter, sessionId);
      await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(1));
      firstQuery.push({
        type: 'system',
        subtype: 'init',
        session_id: 'sdk-restart-session',
      });
      await expect(firstRuntime.next).resolves.toEqual(expect.objectContaining({
        value: expect.objectContaining({ sessionId: 'sdk-restart-session' }),
      }));

      await expect(adapter.restartPersistentQueries('settings-change')).resolves.toBeUndefined();

      expect(firstQuery.close).toHaveBeenCalledTimes(1);
      await firstRuntime.next;

      const secondRuntime = await startRuntime(adapter, sessionId);
      await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(2));

      try {
        expect(sdk.query.mock.calls[1][0].options).toEqual(expect.objectContaining({
          resume: 'sdk-restart-session',
        }));
      } finally {
        secondQuery.close();
        await secondRuntime.next;
      }
    });
  });

  describe('ClaudeCodeAdapter introspection counts', () => {
    it('getMcpServerCount returns 0 when no MCP config is loaded', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
      });
      expect(adapter.getMcpServerCount()).toBe(0);
    });

    it('getMcpServerNames returns an empty list when no MCP config is loaded', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
      });
      expect(adapter.getMcpServerNames()).toEqual([]);
    });

    it('getMcpServerCount returns count from static mcpServers option', () => {
      const mcpServers = {
        server1: { type: 'stdio' as const, command: 'node', args: ['s1.js'] },
        server2: { type: 'stdio' as const, command: 'node', args: ['s2.js'] },
      };
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        mcpServers,
      });
      expect(adapter.getMcpServerCount()).toBe(2);
    });

    it('getMcpServerNames returns sorted names from static mcpServers option', () => {
      const mcpServers = {
        zetaServer: { type: 'stdio' as const, command: 'node', args: ['zeta.js'] },
        alphaServer: { type: 'stdio' as const, command: 'node', args: ['alpha.js'] },
        betaServer: { type: 'stdio' as const, command: 'node', args: ['beta.js'] },
      };
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        mcpServers,
      });
      expect(adapter.getMcpServerNames()).toEqual(['alphaServer', 'betaServer', 'zetaServer']);
    });

    it('getMcpServerCount returns count from dynamically loaded MCP config', async () => {
      const mcpServers = {
        dynamic1: { type: 'stdio' as const, command: 'node', args: ['d1.js'] },
        dynamic2: { type: 'stdio' as const, command: 'node', args: ['d2.js'] },
        dynamic3: { type: 'stdio' as const, command: 'node', args: ['d3.js'] },
      };
      const mcpConfigLoader = jest.fn().mockResolvedValue(mcpServers);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        mcpConfigLoader,
      });
      expect(adapter.getMcpServerCount()).toBe(0);
      await adapter.loadMcpConfig();
      expect(adapter.getMcpServerCount()).toBe(3);
    });

    it('getMcpServerNames returns sorted names after dynamically loading MCP config', async () => {
      const mcpServers = {
        zetaDynamic: { type: 'stdio' as const, command: 'node', args: ['zeta.js'] },
        alphaDynamic: { type: 'stdio' as const, command: 'node', args: ['alpha.js'] },
        betaDynamic: { type: 'stdio' as const, command: 'node', args: ['beta.js'] },
      };
      const mcpConfigLoader = jest.fn().mockResolvedValue(mcpServers);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        mcpConfigLoader,
      });

      expect(adapter.getMcpServerNames()).toEqual([]);
      await adapter.loadMcpConfig();

      expect(mcpConfigLoader).toHaveBeenCalledTimes(1);
      expect(adapter.getMcpServerNames()).toEqual(['alphaDynamic', 'betaDynamic', 'zetaDynamic']);
    });
  });

  describe('ClaudeCodeAdapter runtime ecosystem introspection', () => {
    it('getPluginCount returns 0 when no plugins configured', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
      });
      expect(adapter.getPluginCount()).toBe(0);
    });

    it('getPluginCount returns count from plugins option', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        plugins: ['plugin-a', 'plugin-b', 'plugin-c'],
      });
      expect(adapter.getPluginCount()).toBe(3);
    });

    it('getPluginCount returns 0 for empty plugins array', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        plugins: [],
      });
      expect(adapter.getPluginCount()).toBe(0);
    });

    it('getSkillCount returns 0 when no skills configured', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
      });
      expect(adapter.getSkillCount()).toBe(0);
    });

    it('getSkillCount returns count from skills array option', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        skills: ['skill-a', 'skill-b'],
      });
      expect(adapter.getSkillCount()).toBe(2);
    });

    it('getSkillCount returns 0 for empty skills array', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        skills: [],
      });
      expect(adapter.getSkillCount()).toBe(0);
    });

    it('getSkillCount returns -1 when skills is all', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        skills: 'all',
      });
      expect(adapter.getSkillCount()).toBe(-1);
    });

    it('getSkillsList returns empty array when no skills configured', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
      });
      const result = adapter.getSkillsList();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([]);
    });

    it('getSkillsList returns skill names from skills array option', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        skills: ['skill-a', 'skill-b', 'skill-c'],
      });
      expect(adapter.getSkillsList()).toEqual(['skill-a', 'skill-b', 'skill-c']);
    });

    it('getSkillsList returns all when skills is all', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        skills: 'all',
      });
      expect(adapter.getSkillsList()).toBe('all');
    });

    it('getSkillsList returns empty array for empty skills array', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        skills: [],
      });
      expect(adapter.getSkillsList()).toEqual([]);
    });

    it('getSkillsList returns a defensive copy of the skills array', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        skills: ['skill-x', 'skill-y'],
      });
      const list = adapter.getSkillsList();
      expect(list).toEqual(['skill-x', 'skill-y']);
      // Mutating the returned array must not affect the adapter
      (list as string[]).push('skill-z');
      expect(adapter.getSkillsList()).toEqual(['skill-x', 'skill-y']);
    });

    it('getPluginsList returns empty array when no plugins configured', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
      });
      expect(adapter.getPluginsList()).toEqual([]);
    });

    it('getPluginsList returns plugin names from plugins option', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        plugins: ['plugin-a', 'plugin-b'],
      });
      expect(adapter.getPluginsList()).toEqual(['plugin-a', 'plugin-b']);
    });

    it('getPluginsList returns empty array for empty plugins array', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        plugins: [],
      });
      expect(adapter.getPluginsList()).toEqual([]);
    });

    it('getPluginsList stringifies non-string plugin items', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        plugins: ['plugin-a', { name: 'plugin-b' } as unknown],
      });
      const list = adapter.getPluginsList();
      expect(list).toHaveLength(2);
      expect(list[0]).toBe('plugin-a');
      expect(list[1]).toBe('{"name":"plugin-b"}');
    });

    it('getPluginsList returns a defensive copy of the plugin array', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        plugins: ['plugin-a'],
      });
      const list = adapter.getPluginsList();
      list.push('plugin-b');
      expect(adapter.getPluginsList()).toEqual(['plugin-a']);
    });
  });

  describe('ClaudeCodeAdapter agent definition introspection', () => {
    it('getAgentDefinitionCount returns 0 when no agent or agents configured', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
      });
      expect(adapter.getAgentDefinitionCount()).toBe(0);
    });

    it('getAgentDefinitionCount returns 1 when only agent is configured', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        agent: 'my-agent',
      });
      expect(adapter.getAgentDefinitionCount()).toBe(1);
    });

    it('getAgentDefinitionCount returns count from agents map', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        agents: { 'agent-a': {}, 'agent-b': {} },
      });
      expect(adapter.getAgentDefinitionCount()).toBe(2);
    });

    it('getAgentDefinitionCount sums agent and agents when both configured', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        agent: 'main-agent',
        agents: { 'agent-a': {}, 'agent-b': {}, 'agent-c': {} },
      });
      expect(adapter.getAgentDefinitionCount()).toBe(4);
    });

    it('getAgentDefinitionCount ignores empty agent string', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        agent: '   ',
      });
      expect(adapter.getAgentDefinitionCount()).toBe(0);
    });

    it('getAgentDefinitionsList returns empty array when nothing configured', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
      });
      expect(adapter.getAgentDefinitionsList()).toEqual([]);
    });

    it('getAgentDefinitionsList returns agent name when only agent is configured', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        agent: 'my-agent',
      });
      expect(adapter.getAgentDefinitionsList()).toEqual(['my-agent']);
    });

    it('getAgentDefinitionsList returns agent keys from agents map', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        agents: { 'agent-a': {}, 'agent-b': {} },
      });
      expect(adapter.getAgentDefinitionsList()).toEqual(['agent-a', 'agent-b']);
    });

    it('getAgentDefinitionsList returns agent first then agents map keys when both configured', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        agent: 'main-agent',
        agents: { 'agent-a': {}, 'agent-b': {} },
      });
      expect(adapter.getAgentDefinitionsList()).toEqual(['main-agent', 'agent-a', 'agent-b']);
    });

    it('getAgentDefinitionsList returns a defensive copy', () => {
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        agent: 'main-agent',
        agents: { 'agent-a': {} },
      });
      const list = adapter.getAgentDefinitionsList();
      list.push('agent-b');
      expect(adapter.getAgentDefinitionsList()).toEqual(['main-agent', 'agent-a']);
    });
  });

  describe('ClaudeCodeAdapter diagnostic session lookup', () => {
    it('passes diagnostic sessionStore through getSession to the SDK', async () => {
      const sdk = createSdk([]);
      sdk.getSessionInfo.mockResolvedValue({
        sessionId: 'store-session',
        summary: 'Diagnostic store session',
        lastModified: 789,
      });
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });
      const sessionStore = { append: jest.fn(), load: jest.fn(), listSessions: jest.fn() };

      await expect(adapter.getSession('store-session', { sessionStore })).resolves.toEqual({
        sessionId: 'store-session',
        summary: 'Diagnostic store session',
        lastModified: 789,
      });

      expect(sdk.getSessionInfo).toHaveBeenCalledWith('store-session', {
        dir: '/vault',
        sessionStore,
      });
    });
  });

  it('importSessionToStore is unavailable when SDK method is missing', async () => {
    const sdk = createSdk([]);
    delete (sdk as Partial<typeof sdk>).importSessionToStore;
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.importSessionToStore('sdk-session', { append: jest.fn(), load: jest.fn() }))
      .rejects.toThrow('importSessionToStore is unavailable');
  });

  it('listSubagents and getSubagentMessages block for deleted local sessions', async () => {
    const sdk = createSdk([]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession('Claude chat');
    await adapter.deleteSession(sessionId);

    await expect(adapter.listSubagents(sessionId)).rejects.toThrow('session not found');
    await expect(adapter.getSubagentMessages(sessionId, 'agent-1')).rejects.toThrow('session not found');
    expect(sdk.listSubagents).not.toHaveBeenCalled();
    expect(sdk.getSubagentMessages).not.toHaveBeenCalled();
  });

  it('importSessionToStore propagates SDK errors', async () => {
    const sdk = createSdk([{
      type: 'system',
      subtype: 'init',
      session_id: 'sdk-session-import-error',
    }]);
    sdk.importSessionToStore.mockRejectedValue(new Error('SDK store import failed'));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const localSessionId = await adapter.createSession('Claude chat');
    await collectAsync(adapter.sendMessage({ sessionId: localSessionId, content: 'hello' }));

    await expect(adapter.importSessionToStore(localSessionId, { append: jest.fn(), load: jest.fn() }))
      .rejects.toThrow('SDK store import failed');
    expect(sdk.importSessionToStore).toHaveBeenCalledWith('sdk-session-import-error', expect.any(Object), {
      dir: '/vault',
    });
  });

  it('getSessionMessages propagates SDK errors', async () => {
    const sdk = createSdk([{
      type: 'system',
      subtype: 'init',
      session_id: 'sdk-session-message-error',
    }]);
    sdk.getSessionMessages.mockRejectedValue(new Error('SDK message read failed'));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const localSessionId = await adapter.createSession('Claude chat');
    await collectAsync(adapter.sendMessage({ sessionId: localSessionId, content: 'hello' }));

    await expect(adapter.getSessionMessages(localSessionId)).rejects.toThrow('SDK message read failed');
    expect(sdk.getSessionMessages).toHaveBeenCalledWith('sdk-session-message-error', {
      dir: '/vault',
    });
  });

  describe('ClaudeCodeAdapter resume identity separation', () => {
    it('diagnostic resume-at does not modify ordinary session sdkSessionId or state', async () => {
      const sdk = createSdk([{
        type: 'system',
        subtype: 'init',
        session_id: 'ordinary-sdk-session-1',
      }, {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [{ type: 'text', text: 'Ordinary response' }],
        },
      }]);
      sdk.getSessionInfo.mockImplementation(async (sessionId: string) => {
        if (sessionId === 'ordinary-sdk-session-1') {
          return {
            sessionId: 'ordinary-sdk-session-1',
            summary: 'Ordinary session',
            lastModified: 1700000000000,
          };
        }
        if (sessionId === 'diagnostic-sdk-session-2') {
          return {
            sessionId: 'diagnostic-sdk-session-2',
            summary: 'Diagnostic session',
            lastModified: 1700000000001,
          };
        }
        return undefined;
      });
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });
      const ordinarySessionId = await adapter.createSession('Ordinary chat');

      // First ordinary send captures sdkSessionId from stream
      await collectAsync(adapter.sendMessage({ sessionId: ordinarySessionId, content: 'hello' }));
      expect(sdk.query.mock.calls[0][0].options.resume).toBeUndefined();

      // Second ordinary send resumes with captured sdkSessionId
      await collectAsync(adapter.sendMessage({ sessionId: ordinarySessionId, content: 'again' }));
      expect(sdk.query.mock.calls[1][0].options.resume).toBe('ordinary-sdk-session-1');

      // Override the next query call for the diagnostic prompt to return the diagnostic session id
      sdk.query.mockReturnValueOnce(Object.assign((async function* () {
        yield { type: 'system', subtype: 'init', session_id: 'diagnostic-sdk-session-2' };
      })(), {
        supportedModels: jest.fn().mockResolvedValue([]),
        close: jest.fn(),
      }));

      // Diagnostic resume-at with a different session id
      await adapter.runDiagnosticPrompt({
        prompt: 'Diagnostic query',
        resumeSessionId: 'diagnostic-sdk-session-2',
        _diagnosticResumeAt: true,
      });
      expect(sdk.query.mock.calls[2][0].options.resume).toBe('diagnostic-sdk-session-2');

      // Third ordinary send still uses the original captured sdkSessionId,
      // proving diagnostic resume-at did not rebind or pollute ordinary session state
      await collectAsync(adapter.sendMessage({ sessionId: ordinarySessionId, content: 'third' }));
      expect(sdk.query.mock.calls[3][0].options.resume).toBe('ordinary-sdk-session-1');
    });

    it('ordinary sendMessage starts a fresh query without resume for new local sessions', async () => {
      const sdk = createSdk([{
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [{ type: 'text', text: 'Fresh response' }],
        },
      }]);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });
      const sessionId = await adapter.createSession('Fresh chat');

      await collectAsync(adapter.sendMessage({ sessionId, content: 'hello' }));

      // Fresh local session must not have resume option — there is no sdkSessionId to resume
      expect(sdk.query.mock.calls[0][0].options.resume).toBeUndefined();
    });

    it('ordinary sendMessage cannot resume-at an arbitrary session id', async () => {
      const sdk = createSdk([{
        type: 'system',
        subtype: 'init',
        session_id: 'captured-sdk-session',
      }, {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [{ type: 'text', text: 'Captured response' }],
        },
      }]);
      sdk.getSessionInfo.mockResolvedValue({
        sessionId: 'captured-sdk-session',
        summary: 'Captured session',
        lastModified: 1700000000000,
      });
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });
      const sessionId = await adapter.createSession('Captured chat');

      // First send captures sdkSessionId from stream
      await collectAsync(adapter.sendMessage({ sessionId, content: 'hello' }));
      expect(sdk.query.mock.calls[0][0].options.resume).toBeUndefined();

      // Subsequent sends only resume the session's own captured sdkSessionId.
      // There is no sendMessage option path that allows an arbitrary resume-at override.
      await collectAsync(adapter.sendMessage({ sessionId, content: 'again' }));
      const sendOptions = sdk.query.mock.calls[1][0].options;
      expect(sendOptions.resume).toBe('captured-sdk-session');
      // The sendMessage options contract does not expose resumeSessionId;
      // only the session's captured sdkSessionId drives resume.
      expect(sendOptions).not.toHaveProperty('resumeSessionId');
    });

    it('diagnostic resume-at remains behind the runDiagnosticPrompt interface only', async () => {
      const sdk = createSdk([{
        type: 'system',
        subtype: 'init',
        session_id: 'diag-resume-session',
      }]);
      sdk.getSessionInfo.mockResolvedValue({
        sessionId: 'diag-resume-session',
        summary: 'Diagnostic resume session',
        lastModified: 1700000000000,
      });
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });

      // runDiagnosticPrompt is the only interface that accepts an arbitrary resumeSessionId
      await adapter.runDiagnosticPrompt({
        prompt: 'Diagnostic with resume',
        resumeSessionId: 'diag-resume-session',
        _diagnosticResumeAt: true,
      });
      expect(sdk.query.mock.calls[0][0].options.resume).toBe('diag-resume-session');

      // sendMessage does not accept resumeSessionId; it only uses the session's captured sdkSessionId
      const sessionId = await adapter.createSession();
      await collectAsync(adapter.sendMessage({ sessionId, content: 'hello' }));
      const sendMessageOptions = sdk.query.mock.calls[1][0].options;
      expect(sendMessageOptions.resume).toBeUndefined();
      expect(sendMessageOptions).not.toHaveProperty('resumeSessionId');
    });

    it('rejects diagnostic resume-at when the _diagnosticResumeAt flag is not set', async () => {
      const sdk = createSdk([]);
      sdk.getSessionInfo.mockResolvedValue({
        sessionId: 'diag-session-no-flag',
        summary: 'Diagnostic session',
        lastModified: 1700000000000,
      });
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });

      await expect(adapter.runDiagnosticPrompt({
        prompt: 'Resume without flag',
        resumeSessionId: 'diag-session-no-flag',
        // _diagnosticResumeAt intentionally omitted
      })).rejects.toThrow('Claude Code diagnostic resume-at requires _diagnosticResumeAt flag');

      expect(sdk.query).not.toHaveBeenCalled();
    });

    it('accepts diagnostic resume-at when the _diagnosticResumeAt flag is explicitly true', async () => {
      const sdk = createSdk([{
        type: 'system',
        subtype: 'init',
        session_id: 'diag-session-with-flag',
      }]);
      sdk.getSessionInfo.mockResolvedValue({
        sessionId: 'diag-session-with-flag',
        summary: 'Diagnostic session',
        lastModified: 1700000000000,
      });
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });

      const result = await adapter.runDiagnosticPrompt({
        prompt: 'Resume with flag',
        resumeSessionId: 'diag-session-with-flag',
        _diagnosticResumeAt: true,
      });

      expect(sdk.query).toHaveBeenCalledTimes(1);
      expect(result.sessionId).toBe('diag-session-with-flag');
    });
  });

  describe('diagnostic subagent stream options', () => {
    it('passes forwardSubagentText and agentProgressSummaries through buildDiagnosticSdkOptions', async () => {
      const sdk = createSdk([]);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });

      await adapter.runDiagnosticPrompt({
        prompt: 'Subagent stream test',
        forwardSubagentText: true,
        agentProgressSummaries: true,
        persistSession: false,
      });

      expect(sdk.query).toHaveBeenCalledTimes(1);
      const passedOptions = sdk.query.mock.calls[0][0].options;
      expect(passedOptions.forwardSubagentText).toBe(true);
      expect(passedOptions.agentProgressSummaries).toBe(true);
    });

    it('does not set subagent options when not provided', async () => {
      const sdk = createSdk([]);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });

      await adapter.runDiagnosticPrompt({
        prompt: 'Plain diagnostic test',
        persistSession: false,
      });

      expect(sdk.query).toHaveBeenCalledTimes(1);
      const passedOptions = sdk.query.mock.calls[0][0].options;
      expect(passedOptions.forwardSubagentText).toBeUndefined();
      expect(passedOptions.agentProgressSummaries).toBeUndefined();
    });
  });

  describe('diagnostic agent definitions options', () => {
    it('passes agent and agents through buildDiagnosticSdkOptions when provided in request', async () => {
      const sdk = createSdk([]);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });

      await adapter.runDiagnosticPrompt({
        prompt: 'Agent definition test',
        agent: 'proof-agent',
        agents: {
          'proof-agent': {
            description: 'A proof agent',
            prompt: 'You are a proof agent.',
          },
        },
        persistSession: false,
      });

      expect(sdk.query).toHaveBeenCalledTimes(1);
      const passedOptions = sdk.query.mock.calls[0][0].options;
      expect(passedOptions.agent).toBe('proof-agent');
      expect(passedOptions.agents).toEqual({
        'proof-agent': {
          description: 'A proof agent',
          prompt: 'You are a proof agent.',
        },
      });
    });

    it('falls back to adapter options when request does not provide agent/agents', async () => {
      const sdk = createSdk([]);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
        agent: 'default-agent',
        agents: {
          'default-agent': {
            description: 'Default agent',
            prompt: 'You are the default agent.',
          },
        },
      });

      await adapter.runDiagnosticPrompt({
        prompt: 'Plain diagnostic test',
        persistSession: false,
      });

      expect(sdk.query).toHaveBeenCalledTimes(1);
      const passedOptions = sdk.query.mock.calls[0][0].options;
      expect(passedOptions.agent).toBe('default-agent');
      expect(passedOptions.agents).toEqual({
        'default-agent': {
          description: 'Default agent',
          prompt: 'You are the default agent.',
        },
      });
    });

    it('request agent/agents take precedence over adapter options', async () => {
      const sdk = createSdk([]);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
        agent: 'default-agent',
        agents: {
          'default-agent': {
            description: 'Default agent',
            prompt: 'You are the default agent.',
          },
        },
      });

      await adapter.runDiagnosticPrompt({
        prompt: 'Override agent test',
        agent: 'override-agent',
        agents: {
          'override-agent': {
            description: 'Override agent',
            prompt: 'You are the override agent.',
          },
        },
        persistSession: false,
      });

      expect(sdk.query).toHaveBeenCalledTimes(1);
      const passedOptions = sdk.query.mock.calls[0][0].options;
      expect(passedOptions.agent).toBe('override-agent');
      expect(passedOptions.agents).toEqual({
        'override-agent': {
          description: 'Override agent',
          prompt: 'You are the override agent.',
        },
      });
    });

    it('does not set agent or agents when neither request nor adapter provides them', async () => {
      const sdk = createSdk([]);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });

      await adapter.runDiagnosticPrompt({
        prompt: 'Plain diagnostic test',
        persistSession: false,
      });

      expect(sdk.query).toHaveBeenCalledTimes(1);
      const passedOptions = sdk.query.mock.calls[0][0].options;
      expect(passedOptions.agent).toBeUndefined();
      expect(passedOptions.agents).toBeUndefined();
    });
  });

  describe('diagnostic bypass permissions', () => {
    it('sets allowDangerouslySkipPermissions and skips canUseTool when _diagnosticBypassPermissions is true', async () => {
      const mockCanUseTool = jest.fn().mockResolvedValue({ behavior: 'allow' });
      const sdk = createSdk([]);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'default' },
        sdk,
        permissionBridge: { canUseTool: mockCanUseTool } as never,
      });

      await adapter.runDiagnosticPrompt({
        prompt: 'Bypass test',
        persistSession: false,
        _diagnosticBypassPermissions: true,
      });

      expect(sdk.query).toHaveBeenCalledTimes(1);
      const passedOptions = sdk.query.mock.calls[0][0].options;
      expect(passedOptions.allowDangerouslySkipPermissions).toBe(true);
      expect(passedOptions.canUseTool).toBeUndefined();
      expect(passedOptions.permissionMode).toBe('bypassPermissions');
    });

    it('keeps canUseTool wired when _diagnosticBypassPermissions is false', async () => {
      const mockCanUseTool = jest.fn().mockResolvedValue({ behavior: 'allow' });
      const sdk = createSdk([]);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'acceptEdits' },
        sdk,
        permissionBridge: { canUseTool: mockCanUseTool } as never,
      });

      await adapter.runDiagnosticPrompt({
        prompt: 'Normal diagnostic test',
        persistSession: false,
      });

      expect(sdk.query).toHaveBeenCalledTimes(1);
      const passedOptions = sdk.query.mock.calls[0][0].options;
      expect(passedOptions.allowDangerouslySkipPermissions).toBeUndefined();
      expect(passedOptions.canUseTool).toBeTruthy();
      expect(typeof passedOptions.canUseTool).toBe('function');
      expect(passedOptions.permissionMode).toBe('acceptEdits');
    });

    it('uses _diagnosticCanUseTool override instead of bridge when provided and non-bypass', async () => {
      const bridgeCanUseTool = jest.fn().mockResolvedValue({ behavior: 'allow' });
      const overrideCanUseTool = jest.fn().mockResolvedValue({ behavior: 'allow' });
      const sdk = createSdk([]);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'default' },
        sdk,
        permissionBridge: { canUseTool: bridgeCanUseTool } as never,
      });

      await adapter.runDiagnosticPrompt({
        prompt: 'Override canUseTool test',
        persistSession: false,
        _diagnosticCanUseTool: overrideCanUseTool,
      });

      expect(sdk.query).toHaveBeenCalledTimes(1);
      const passedOptions = sdk.query.mock.calls[0][0].options;
      // Override should be used instead of bridge
      expect(passedOptions.canUseTool).toBe(overrideCanUseTool);
      // Bridge should not have been called
      expect(bridgeCanUseTool).not.toHaveBeenCalled();
    });

    it('forces permissionMode via _diagnosticForcePermissionMode when non-bypass', async () => {
      const sdk = createSdk([]);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'bypassPermissions' },
        sdk,
      });

      await adapter.runDiagnosticPrompt({
        prompt: 'Force permissionMode test',
        persistSession: false,
        _diagnosticForcePermissionMode: 'default',
      });

      expect(sdk.query).toHaveBeenCalledTimes(1);
      const passedOptions = sdk.query.mock.calls[0][0].options;
      expect(passedOptions.permissionMode).toBe('default');
      // Should NOT have allowDangerouslySkipPermissions when forced to default
      expect(passedOptions.allowDangerouslySkipPermissions).toBeUndefined();
    });

    it('ignores _diagnosticCanUseTool and _diagnosticForcePermissionMode when bypass is true', async () => {
      const overrideCanUseTool = jest.fn().mockResolvedValue({ behavior: 'allow' });
      const sdk = createSdk([]);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'default' },
        sdk,
      });

      await adapter.runDiagnosticPrompt({
        prompt: 'Bypass ignores overrides',
        persistSession: false,
        _diagnosticBypassPermissions: true,
        _diagnosticCanUseTool: overrideCanUseTool,
        _diagnosticForcePermissionMode: 'plan',
      });

      expect(sdk.query).toHaveBeenCalledTimes(1);
      const passedOptions = sdk.query.mock.calls[0][0].options;
      // Bypass still takes precedence
      expect(passedOptions.permissionMode).toBe('bypassPermissions');
      expect(passedOptions.allowDangerouslySkipPermissions).toBe(true);
      expect(passedOptions.canUseTool).toBeUndefined();
    });
  });

  describe('diagnostic tool restriction defensive copy', () => {
    it('snapshot options.tools is not mutated when caller mutates the restriction array after runDiagnosticPrompt', async () => {
      const sdk = createSdk([]);
      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });

      const restriction = ['Read', 'Grep'];
      await adapter.runDiagnosticPrompt({
        prompt: 'Tool restriction snapshot test',
        persistSession: false,
        _diagnosticToolRestriction: restriction,
      });

      restriction.push('Edit', 'Write');

      const snapshot = adapter.inspectLastDiagnosticSdkOptions();
      expect(snapshot).not.toBeNull();
      expect(snapshot!.tools).toEqual(['Read', 'Grep']);
    });
  });

  // =======================================================================
  // runSetModelLiveProbe — diagnostic probe for setModel() live behavior
  // =======================================================================

  describe('runSetModelLiveProbe', () => {
    /**
     * Creates an SDK facade with a single persistent mock query that supports
     * the AsyncIterable input + background pump pattern.
     *
     * The mock query receives its prompt as an AsyncIterable (streaming input mode).
     * When items are pushed into the input, the query yields messages until a
     * turn boundary (type:'result'), then pauses for the next push.
     *
     * This mirrors the real SDK streaming-input behavior where `setModel()` is
     * only meaningful between turns on the same query handle.
     */
    function createSingleQueryProbeSdk(opts: {
      /** All messages the query will yield across both phases, in order */
      allMessages: unknown[];
      /** Mock for query.setModel — if omitted, method is not present */
      setModel?: jest.Mock;
    }): ClaudeCodeSdkFacade & { query: jest.Mock } {
      const messages = [...opts.allMessages];

      const mockQuery = jest.fn(() => {
        const queue = createAsyncQueue<unknown>();
        // Save original close before overriding — q and queue are the same object
        const realClose = queue.close.bind(queue);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q: any = queue;
        q.supportedModels = jest.fn().mockResolvedValue([]);
        q.close = jest.fn(() => realClose());
        if (opts.setModel) {
          q.setModel = opts.setModel;
        }
        // Push all messages after a tick so the async iterator is ready.
        // The input AsyncIterable is consumed by the SDK internally;
        // our mock just yields messages in sequence.
        setTimeout(() => {
          for (const msg of messages) {
            queue.push(msg);
          }
          realClose();
        }, 0);
        return q;
      });

      return {
        query: mockQuery as unknown as ClaudeCodeSdkFacade['query'] & jest.Mock,
        listSessions: jest.fn().mockResolvedValue([]),
        getSessionInfo: jest.fn().mockResolvedValue(undefined),
        getSessionMessages: jest.fn().mockResolvedValue([]),
        listSubagents: jest.fn().mockResolvedValue([]),
        getSubagentMessages: jest.fn().mockResolvedValue([]),
        importSessionToStore: jest.fn().mockResolvedValue(undefined),
        forkSession: jest.fn().mockResolvedValue({ sessionId: 'sdk-fork-session' }),
        renameSession: jest.fn().mockResolvedValue(undefined),
      };
    }

    it('uses a single SDK query for both phases (not two separate queries)', async () => {
      const setModelMock = jest.fn().mockResolvedValue(undefined);
      const sdk = createSingleQueryProbeSdk({
        setModel: setModelMock,
        allMessages: [
          // Phase 1 messages
          { type: 'user', uuid: 'user-001', session_id: 'setmodel-session-1' },
          { type: 'assistant', session_id: 'setmodel-session-1', message: { role: 'assistant' } },
          { type: 'result', subtype: 'success', session_id: 'setmodel-session-1', modelUsage: { 'claude-sonnet-4-5': { inputTokens: 50 } } },
          // Phase 2 messages (after setModel, same query handle)
          { type: 'assistant', session_id: 'setmodel-session-1', message: { role: 'assistant' } },
          { type: 'result', subtype: 'success', session_id: 'setmodel-session-1', modelUsage: { 'claude-opus-4-5': { inputTokens: 60 } } },
        ],
      });

      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/tmp/test-vault-setmodel',
        settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'bypassPermissions' },
        sdk,
      });

      const result = await adapter.runSetModelLiveProbe('claude-opus-4-5');

      // CRITICAL: sdk.query was called exactly ONCE — single persistent query
      expect(sdk.query).toHaveBeenCalledTimes(1);
      // The prompt was an AsyncIterable (streaming input mode), not a string
      const queryArg = sdk.query.mock.calls[0][0] as { prompt: unknown };
      expect(typeof queryArg.prompt).not.toBe('string');
      expect(queryArg.prompt).toBeTruthy();
      // setModel was called on the same query handle
      expect(setModelMock).toHaveBeenCalledWith('claude-opus-4-5');
      // Phase 1 and Phase 2 model evidence collected
      expect(result.setModelAttempted).toBe(true);
      expect(result.setModelError).toBeUndefined();
      expect(result.phase1ModelKeys).toEqual(['claude-sonnet-4-5']);
      expect(result.phase2ModelKeys).toEqual(['claude-opus-4-5']);
    });

    it('returns setModelError when setModel throws', async () => {
      const setModelMock = jest.fn().mockRejectedValue(new Error('model switch rejected'));
      const sdk = createSingleQueryProbeSdk({
        setModel: setModelMock,
        allMessages: [
          { type: 'user', uuid: 'user-002', session_id: 'setmodel-session-2' },
          { type: 'assistant', session_id: 'setmodel-session-2', message: { role: 'assistant' } },
          { type: 'result', subtype: 'success', session_id: 'setmodel-session-2', modelUsage: { 'claude-sonnet-4-5': { inputTokens: 50 } } },
          { type: 'assistant', session_id: 'setmodel-session-2', message: { role: 'assistant' } },
          { type: 'result', subtype: 'success', session_id: 'setmodel-session-2', modelUsage: { 'claude-sonnet-4-5': { inputTokens: 50 } } },
        ],
      });

      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/tmp/test-vault-setmodel',
        settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'bypassPermissions' },
        sdk,
      });

      const result = await adapter.runSetModelLiveProbe('claude-opus-4-5');

      // Still uses a single query
      expect(sdk.query).toHaveBeenCalledTimes(1);
      expect(result.setModelAttempted).toBe(true);
      expect(result.setModelError).toBe('model switch rejected');
    });

    it('returns setModelNotAvailable when query lacks setModel method', async () => {
      const sdk = createSingleQueryProbeSdk({
        // no setModel mock
        allMessages: [
          { type: 'user', uuid: 'user-003', session_id: 'setmodel-session-3' },
          { type: 'assistant', session_id: 'setmodel-session-3', message: { role: 'assistant' } },
          { type: 'result', subtype: 'success', session_id: 'setmodel-session-3' },
          { type: 'result', subtype: 'success', session_id: 'setmodel-session-3' },
        ],
      });

      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/tmp/test-vault-setmodel',
        settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'bypassPermissions' },
        sdk,
      });

      const result = await adapter.runSetModelLiveProbe('claude-opus-4-5');

      expect(sdk.query).toHaveBeenCalledTimes(1);
      expect(result.setModelAttempted).toBe(false);
      expect(result.setModelNotAvailable).toBe(true);
    });

    it('returns empty model keys when no modelUsage in result messages', async () => {
      const setModelMock = jest.fn().mockResolvedValue(undefined);
      const sdk = createSingleQueryProbeSdk({
        setModel: setModelMock,
        allMessages: [
          { type: 'user', uuid: 'user-004', session_id: 'setmodel-session-4' },
          { type: 'assistant', session_id: 'setmodel-session-4', message: { role: 'assistant' } },
          { type: 'result', subtype: 'success', session_id: 'setmodel-session-4' },
          { type: 'result', subtype: 'success', session_id: 'setmodel-session-4' },
        ],
      });

      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/tmp/test-vault-setmodel',
        settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'bypassPermissions' },
        sdk,
      });

      const result = await adapter.runSetModelLiveProbe('claude-opus-4-5');

      expect(sdk.query).toHaveBeenCalledTimes(1);
      expect(result.setModelAttempted).toBe(true);
      expect(result.phase1ModelKeys).toEqual([]);
      expect(result.phase2ModelKeys).toEqual([]);
    });
  });

  // =======================================================================
  // runWarmStartupProbe — diagnostic probe for startup() / WarmQuery seam
  // =======================================================================

  describe('runWarmStartupProbe', () => {
    function createSdkWithStartup(opts: {
      startupResult?: {
        query: jest.Mock;
        close: jest.Mock;
      };
      startupThrows?: Error;
    }): ClaudeCodeSdkFacade & { query: jest.Mock; startup?: jest.Mock } {
      const baseSdk = createSdk([]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = { ...baseSdk };

      if (opts.startupThrows) {
        result.startup = jest.fn().mockRejectedValue(opts.startupThrows);
      } else if (opts.startupResult) {
        result.startup = jest.fn().mockResolvedValue(opts.startupResult);
      }
      // When neither is provided, no startup property (SDK doesn't expose it)

      return result;
    }

    function createWarmQuery(messages: unknown[]): {
      query: jest.Mock;
      close: jest.Mock;
    } {
      const mockQuery = jest.fn(() => Object.assign((async function* () {
        for (const message of messages) {
          yield message;
        }
      })(), {
        supportedModels: jest.fn().mockResolvedValue([]),
        close: jest.fn(),
      }));
      return {
        query: mockQuery,
        close: jest.fn(),
      };
    }

    it('returns readback when startup resolves and warm query produces response', async () => {
      const warmQuery = createWarmQuery([
        { type: 'system', subtype: 'init' },
        { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Hello from warm query' }] } },
        { type: 'result', subtype: 'success', cost_usd: 0.001 },
      ]);
      const sdk = createSdkWithStartup({ startupResult: warmQuery });

      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });

      const result = await adapter.runWarmStartupProbe();

      expect(result.classification).toBe('readback');
      expect(result.startupResolved).toBe(true);
      expect(result.warmQueryAvailable).toBe(true);
      expect(result.warmQueryResponded).toBe(true);
      expect(result.rawMessageCount).toBeGreaterThan(0);
      expect(warmQuery.close).toHaveBeenCalled();
    });

    it('returns readback when startup resolves but warm query returns empty messages', async () => {
      const warmQuery = createWarmQuery([]);
      const sdk = createSdkWithStartup({ startupResult: warmQuery });

      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });

      const result = await adapter.runWarmStartupProbe();

      expect(result.classification).toBe('readback');
      expect(result.startupResolved).toBe(true);
      expect(result.warmQueryAvailable).toBe(true);
      expect(result.warmQueryResponded).toBe(false);
      expect(warmQuery.close).toHaveBeenCalled();
    });

    it('returns fail when startup throws', async () => {
      const sdk = createSdkWithStartup({
        startupThrows: new Error('startup failed: SDK initialization timeout'),
      });

      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });

      const result = await adapter.runWarmStartupProbe();

      expect(result.classification).toBe('fail');
      expect(result.startupResolved).toBe(false);
      expect(result.error).toContain('startup failed');
    });

    it('returns boundary when SDK does not expose startup method', async () => {
      const sdk = createSdkWithStartup({}); // No startup method

      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });

      const result = await adapter.runWarmStartupProbe();

      expect(result.classification).toBe('boundary');
      expect(result.startupResolved).toBe(false);
    });

    it('closes warm query when warm query iteration throws', async () => {
      const mockWarmQuery = {
        query: jest.fn(() => {
          const asyncIterable = {
            [Symbol.asyncIterator]() {
              return {
                next(): Promise<IteratorResult<unknown>> {
                  return Promise.reject(new Error('warm query iteration failed'));
                },
              };
            },
          };
          return Object.assign(asyncIterable, {
            supportedModels: jest.fn().mockResolvedValue([]),
            close: jest.fn(),
          });
        }),
        close: jest.fn(),
      };
      const sdk = createSdkWithStartup({ startupResult: mockWarmQuery });

      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault',
        settings: getDefaultClaudeCodeBackendSettings(),
        sdk,
      });

      const result = await adapter.runWarmStartupProbe();

      expect(result.classification).toBe('fail');
      expect(result.warmQueryAvailable).toBe(true);
      expect(mockWarmQuery.close).toHaveBeenCalled();
    });

    it('routes startup through adapter options pipeline (not bare startup)', async () => {
      const warmQuery = createWarmQuery([
        { type: 'result', subtype: 'success' },
      ]);
      const sdk = createSdkWithStartup({ startupResult: warmQuery });

      const adapter = new ClaudeCodeAdapter({
        vaultPath: '/vault/warm-startup-test',
        settings: { ...getDefaultClaudeCodeBackendSettings(), permissionMode: 'bypassPermissions' },
        sdk,
      });

      await adapter.runWarmStartupProbe();

      // sdk.startup must be called with an options object, not undefined
      expect(sdk.startup).toHaveBeenCalledTimes(1);
      const startupCall = (sdk.startup as jest.Mock).mock.calls[0];
      const startupArg = startupCall?.[0] as { options?: Record<string, unknown> } | undefined;

      // Must receive an options argument (not undefined)
      expect(startupArg).toBeDefined();
      expect(startupArg.options).toBeDefined();

      // Must include adapter-owned fields from our options pipeline
      expect(startupArg.options!.cwd).toBe('/vault/warm-startup-test');
      expect(startupArg.options!.allowDangerouslySkipPermissions).toBe(true);
      expect(startupArg.options!.permissionMode).toBe('bypassPermissions');
    });
  });
});

describe('ClaudeCodeAdapter – prompt suggestion post-result callback', () => {
  beforeEach(() => {
    clearRecentLogs();
    setDebugLoggingEnabled(true);
    setDebugModuleEnabled('claudeCode', true);
  });

  afterEach(() => {
    setDebugLoggingEnabled(false);
    setDebugModuleEnabled('claudeCode', false);
    clearRecentLogs();
  });

  it('fires onPostResultChunk callback for prompt_suggestion messages arriving after result boundary', async () => {
    const messages: unknown[] = [
      { type: 'assistant', message: { id: 'msg-1', content: [{ type: 'text', text: 'Hello' }] } },
      { type: 'result', total_usage: { input_tokens: 1, output_tokens: 2 } },
      { type: 'prompt_suggestion', suggestion: 'Write tests', uuid: 'ps-1', session_id: 'sdk-sess-1' },
    ];
    const sdk = createSdk(messages);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    await adapter.start();
    const sessionId = await adapter.createSession();

    const postResultChunks: import('../../../../../src/core/types/chat').StreamChunk[] = [];
    adapter.onPostResultChunk((chunk) => { postResultChunks.push(chunk); });

    await collectAsync(adapter.sendMessage({ sessionId, content: 'hello' }));

    // Wait a tick for pumpRuntimeOutput to process remaining messages
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(postResultChunks.length).toBeGreaterThanOrEqual(1);
    expect(postResultChunks.some((c) => c.type === 'prompt_suggestion')).toBe(true);
    const psChunk = postResultChunks.find((c) => c.type === 'prompt_suggestion');
    expect(psChunk).toMatchObject({
      type: 'prompt_suggestion',
      suggestion: 'Write tests',
      uuid: 'ps-1',
      sessionId: 'sdk-sess-1',
    });

    await adapter.stop();
  });

  it('does not fire onPostResultChunk for non-prompt-suggestion post-result messages', async () => {
    const messages: unknown[] = [
      { type: 'assistant', message: { id: 'msg-1', content: [{ type: 'text', text: 'Hello' }] } },
      { type: 'result', total_usage: { input_tokens: 1, output_tokens: 2 } },
      { type: 'system', subtype: 'task_notification', task_id: 'task-1', summary: 'Done' },
    ];
    const sdk = createSdk(messages);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    await adapter.start();
    const sessionId = await adapter.createSession();

    const postResultChunks: import('../../../../../src/core/types/chat').StreamChunk[] = [];
    adapter.onPostResultChunk((chunk) => { postResultChunks.push(chunk); });

    await collectAsync(adapter.sendMessage({ sessionId, content: 'hello' }));

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(postResultChunks.some((c) => c.type === 'prompt_suggestion')).toBe(false);

    await adapter.stop();
  });

  it('sendMessage result-boundary contract is unchanged (returns at result, not after prompt_suggestion)', async () => {
    const messages: unknown[] = [
      { type: 'assistant', message: { id: 'msg-1', content: [{ type: 'text', text: 'Hello' }] } },
      { type: 'result', total_usage: { input_tokens: 1, output_tokens: 2 } },
      { type: 'prompt_suggestion', suggestion: 'Write tests', uuid: 'ps-1', session_id: 'sdk-sess-1' },
    ];
    const sdk = createSdk(messages);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    await adapter.start();
    const sessionId = await adapter.createSession();

    const chunks = await collectAsync(adapter.sendMessage({ sessionId, content: 'hello' }));

    // sendMessage should return at the result boundary, so it should NOT yield prompt_suggestion
    expect(chunks.some((c) => c.type === 'prompt_suggestion')).toBe(false);
    // But it should have yielded the assistant text and usage
    expect(chunks.some((c) => c.type === 'text')).toBe(true);
    expect(chunks.some((c) => c.type === 'usage')).toBe(true);

    await adapter.stop();
  });
});

// ─── Sink registration without explicit start() ──────────────────
//
// ROOT CAUSE: registerPromptSuggestionSink(this) only lived in start(),
// but the real product path goes through ensureReadyForQuery() (called
// on every sendMessage/createSession). The sink was never registered,
// so the coordinator never attached to onPostResultChunk.
//
// FIX: ensureReadyForQuery() also registers the sink. The registration
// is idempotent — no callbacks re-fire if the same adapter is already
// registered.

describe('ClaudeCodeAdapter – sink registration on real product path', () => {
  beforeEach(() => {
    clearRecentLogs();
    setDebugLoggingEnabled(true);
    setDebugModuleEnabled('claudeCode', true);
  });

  afterEach(() => {
    setDebugLoggingEnabled(false);
    setDebugModuleEnabled('claudeCode', false);
    clearRecentLogs();
  });

  it('registers prompt-suggestion sink when sendMessage is called without explicit start()', async () => {
    const messages: unknown[] = [
      { type: 'assistant', message: { id: 'msg-1', content: [{ type: 'text', text: 'Hello' }] } },
      { type: 'result', total_usage: { input_tokens: 1, output_tokens: 2 } },
      { type: 'prompt_suggestion', suggestion: 'Write tests', uuid: 'ps-1', session_id: 'sdk-sess-1' },
    ];
    const sdk = createSdk(messages);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    // DO NOT call adapter.start() — this is the real product path
    const sessionId = await adapter.createSession();

    // Subscribe to sink changes BEFORE sendMessage
    const unsubSinkChange = onPromptSuggestionSinkChange(() => { /* observe registration */ });

    // sendMessage triggers ensureReadyForQuery → should register sink
    const postResultChunks: import('../../../../../src/core/types/chat').StreamChunk[] = [];
    adapter.onPostResultChunk((chunk) => { postResultChunks.push(chunk); });

    await collectAsync(adapter.sendMessage({ sessionId, content: 'hello' }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Sink should be registered now (via ensureReadyForQuery)
    expect(getPromptSuggestionSink()).toBe(adapter);

    // Post-result callback should have fired for the prompt_suggestion
    expect(postResultChunks.some((c) => c.type === 'prompt_suggestion')).toBe(true);

    unsubSinkChange();
    await adapter.dispose();
  });

  it('sink registration is idempotent — does not re-fire callbacks on second query', async () => {
    const messages: unknown[] = [
      { type: 'assistant', message: { id: 'msg-1', content: [{ type: 'text', text: 'Hello' }] } },
      { type: 'result', total_usage: { input_tokens: 1, output_tokens: 2 } },
    ];
    const sdk = createSdk(messages);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    clearPromptSuggestionSink();

    let sinkChangeCount = 0;
    const unsub = onPromptSuggestionSinkChange(() => { sinkChangeCount++; });

    const sessionId = await adapter.createSession();

    // First query — sink should be registered, callback fires once
    await collectAsync(adapter.sendMessage({ sessionId, content: 'hello' }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const firstCount = sinkChangeCount;
    expect(firstCount).toBeGreaterThanOrEqual(1);

    // Second query — same adapter, should NOT fire callback again (idempotent)
    const sessionId2 = await adapter.createSession();
    await collectAsync(adapter.sendMessage({ sessionId: sessionId2, content: 'world' }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(sinkChangeCount).toBe(firstCount); // no additional change callbacks

    unsub();
    clearPromptSuggestionSink();
    await adapter.dispose();
  });

  it('stop() clears the registered sink', async () => {
    const sdk = createSdk([]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    clearPromptSuggestionSink();

    await adapter.start();
    expect(getPromptSuggestionSink()).toBe(adapter);

    await adapter.stop();
    expect(getPromptSuggestionSink()).toBeNull();

    clearPromptSuggestionSink();
  });
});
