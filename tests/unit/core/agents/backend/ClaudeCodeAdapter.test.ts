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

function createSdk(messages: unknown[]): ClaudeCodeSdkFacade & { query: jest.Mock } {
  return {
    query: jest.fn(() => (async function* () {
      for (const message of messages) {
        yield message;
      }
    })()),
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
    expect(adapter.hasCapability(AgentCapability.Permissions)).toBe(true);
    expect(adapter.hasCapability(AgentCapability.Models)).toBe(false);
    expect(adapter.hasCapability(AgentCapability.Questions)).toBe(false);
    expect(adapter.hasCapability(AgentCapability.Hooks)).toBe(false);
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
      type: 'assistant',
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
      type: 'text',
      content: 'Hello from Claude',
    }, {
      type: 'usage',
      inputTokens: 4,
      outputTokens: 3,
      sessionId,
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
