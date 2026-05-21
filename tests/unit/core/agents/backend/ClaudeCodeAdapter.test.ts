/* eslint-disable max-lines -- Adapter coverage keeps session, resume, model catalog, permission, and streaming fixtures together for one backend contract. */
import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import {
  ClaudeCodeAdapter,
  type ClaudeCodeSdkFacade,
  type ClaudeCodeSdkLoader,
  createClaudeCodePermissionBridge,
} from '../../../../../src/core/agents/backend';
import { getDefaultClaudeCodeBackendSettings } from '../../../../../src/core/types';

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

function createSdk(messages: unknown[]): ClaudeCodeSdkFacade & {
  query: jest.Mock;
  listSessions: jest.Mock;
  getSessionInfo: jest.Mock;
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
    forkSession: jest.fn().mockResolvedValue({ sessionId: 'sdk-fork-session' }),
    renameSession: jest.fn().mockResolvedValue(undefined),
  };
}

// eslint-disable-next-line max-lines-per-function -- Adapter behavior cases share small SDK/session fixtures.
describe('ClaudeCodeAdapter', () => {
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
    expect(adapter.hasCapability(AgentCapability.Tools)).toBe(false);
    expect(adapter.hasCapability(AgentCapability.Mcp)).toBe(false);
    expect(adapter.hasCapability(AgentCapability.Permissions)).toBe(false);
    expect(adapter.hasCapability(AgentCapability.Models)).toBe(true);
    expect(adapter.hasCapability(AgentCapability.Questions)).toBe(false);
    expect(adapter.hasCapability(AgentCapability.Hooks)).toBe(false);
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
  });

  it('returns an empty supported model list when the SDK throws', async () => {
    const sdk = createSdk([]);
    sdk.query.mockReturnValue(Object.assign((async function* () {})(), {
      supportedModels: jest.fn().mockRejectedValue(new Error('model catalog unavailable')),
      close: jest.fn(),
    }));
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await expect(adapter.supportedModels()).resolves.toEqual([]);
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

  it('keeps one streaming SDK query alive for sequential sends on the same session', async () => {
    const sdkOutput = createAsyncQueue<unknown>();
    const prompts: AsyncIterable<unknown>[] = [];
    const sdk: ClaudeCodeSdkFacade & { query: jest.Mock } = {
      query: jest.fn((input) => {
        prompts.push(input.prompt as AsyncIterable<unknown>);
        return sdkOutput;
      }),
    };
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });
    const sessionId = await adapter.createSession();

    const first = collectAsync(adapter.sendMessage({ sessionId, content: 'first' }));
    await Promise.resolve();
    await expect(nextFrom(prompts[0])).resolves.toEqual({
      value: {
        type: 'user',
        message: { role: 'user', content: 'first' },
      },
      done: false,
    });
    sdkOutput.push({
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [{ type: 'text', text: 'First response' }],
      },
    });
    sdkOutput.push({ type: 'result', subtype: 'success' });

    await expect(first).resolves.toEqual([{ type: 'text', content: 'First response' }]);

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
  });

  it('resumes a persisted Claude SDK session id after adapter restart', async () => {
    const sdk = createSdk([{
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [{ type: 'text', text: 'Resumed session' }],
      },
    }]);
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
    expect(sdk.query.mock.calls[0][0].options.resume).toBe('sdk-persisted-session');
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
    await Promise.resolve();
    expect(sdk.query).toHaveBeenCalledTimes(1);
    adapter.cancelStream(sessionId);
    await expect(next).resolves.toEqual({ value: undefined, done: true });

    expect(query.interrupt).toHaveBeenCalledTimes(1);
  });

  it('surfaces SDK query failures as backend-labelled error chunks', async () => {
    const shouldYield = (): boolean => false;
    const sdk: ClaudeCodeSdkFacade & { query: jest.Mock } = {
      query: jest.fn(() => (async function* () {
        if (shouldYield()) {
          yield undefined;
        }
        throw new Error('boom');
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
        content: 'Claude Code stream failed: boom',
      }]);
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
});
