import {
  ClaudeCodeAdapter,
  type ClaudeCodeCanUseToolContext,
  type ClaudeCodePermissionResult,
  type ClaudeCodeSdkFacade,
  type ClaudeCodeSdkQueryInput,
  createClaudeCodePermissionBridge,
  IMPLEMENTED_AGENT_BACKENDS,
} from '../../../../../src/core/agents/backend';
import type { StreamChunk } from '../../../../../src/core/types';
import { getDefaultClaudeCodeBackendSettings } from '../../../../../src/core/types';

const vi = jest;

type MockSdk = ClaudeCodeSdkFacade & {
  query: jest.Mock;
  listSessions: jest.Mock;
  getSessionInfo: jest.Mock;
  forkSession: jest.Mock;
  renameSession: jest.Mock;
};

function systemInit(sessionId: string) {
  return { type: 'system', subtype: 'session_init', session_id: sessionId, model: 'claude-sonnet-4-20250514' };
}

function assistantTextMessage(text: string, messageId = 'msg-1') {
  return {
    type: 'assistant',
    message: {
      id: messageId,
      content: [{ type: 'text', text }],
      usage: { input_tokens: 10, output_tokens: 20 },
    },
  };
}

function assistantThinkingMessage(thinking: string, messageId = 'msg-2') {
  return {
    type: 'assistant',
    message: {
      id: messageId,
      content: [{ type: 'thinking', thinking }],
      usage: { input_tokens: 5, output_tokens: 15, reasoning_tokens: 10 },
    },
  };
}

function assistantToolUseMessage(toolName: string, toolId = 'tool-1', input = {}) {
  return {
    type: 'assistant',
    message: {
      id: 'msg-tool',
      content: [{ type: 'tool_use', id: toolId, name: toolName, input }],
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  };
}

function toolResultMessage(toolUseId: string, content: string, isError = false) {
  return {
    type: 'assistant',
    message: {
      id: 'msg-result',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError }],
    },
  };
}

function resultSuccess(sessionId: string) {
  return { type: 'result', subtype: 'success', session_id: sessionId, result: 'Done' };
}

function resultError(errors: string[]) {
  return { type: 'result', subtype: 'error', errors };
}

async function collectChunks(iterable: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks;
}

async function waitForExpect(assertion: () => void, attempts = 10): Promise<void> {
  let lastError: unknown;
  for (let index = 0; index < attempts; index += 1) {
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

function createMockSdk(messages: unknown[]): MockSdk {
  let queryCount = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      queryCount++;
      return (async function* () {
        for (const msg of messages) {
          yield msg;
        }
      })();
    }),
    listSessions: vi.fn().mockResolvedValue([]),
    getSessionInfo: vi.fn().mockResolvedValue(undefined),
    forkSession: vi.fn().mockResolvedValue({ sessionId: 'forked-1' }),
    renameSession: vi.fn().mockResolvedValue(undefined),
    get queryCount() {
      return queryCount;
    },
  } as MockSdk;
}

function readToolUse(message: unknown): { name: string; id: string; input: Record<string, unknown> } | null {
  const record = message as { message?: { content?: Array<Record<string, unknown>> } };
  const block = record.message?.content?.find((item) => item.type === 'tool_use');
  if (!block || typeof block.name !== 'string' || typeof block.id !== 'string') {
    return null;
  }
  return {
    name: block.name,
    id: block.id,
    input: typeof block.input === 'object' && block.input !== null && !Array.isArray(block.input)
      ? block.input as Record<string, unknown>
      : {},
  };
}

function createPermissionAwareMockSdk(messages: unknown[]): MockSdk & {
  permissionResults: ClaudeCodePermissionResult[];
} {
  const permissionResults: ClaudeCodePermissionResult[] = [];
  const sdk = createMockSdk(messages) as MockSdk & { permissionResults: ClaudeCodePermissionResult[] };
  sdk.permissionResults = permissionResults;
  sdk.query.mockImplementation((request: ClaudeCodeSdkQueryInput) => (async function* () {
    for (const msg of messages) {
      const toolUse = readToolUse(msg);
      if (toolUse && typeof request.options.canUseTool === 'function') {
        const result = await (request.options.canUseTool as (
          toolName: string,
          input: Record<string, unknown>,
          context: ClaudeCodeCanUseToolContext,
        ) => Promise<ClaudeCodePermissionResult>)(toolUse.name, toolUse.input, {
          signal: request.options.abortController?.signal,
          toolUseID: toolUse.id,
        });
        permissionResults.push(result);
      }
      yield msg;
    }
  })());
  return sdk;
}

async function createStartedAdapter(sdk: ClaudeCodeSdkFacade, extras: Partial<ConstructorParameters<typeof ClaudeCodeAdapter>[0]> = {}) {
  const adapter = new ClaudeCodeAdapter({
    vaultPath: '/vault',
    settings: getDefaultClaudeCodeBackendSettings(),
    sdk,
    ...extras,
  });
  await adapter.start();
  const sessionId = await adapter.createSession();
  return { adapter, sessionId };
}

// eslint-disable-next-line max-lines-per-function -- End-to-end smoke cases intentionally live in one harness.
describe('ClaudeCode smoke harness', () => {
  it('streams text and captures SDK session metadata', async () => {
    const sdk = createMockSdk([
      systemInit('sdk-session-text'),
      assistantTextMessage('Hello world'),
      resultSuccess('sdk-session-text'),
    ]);
    const { adapter, sessionId } = await createStartedAdapter(sdk);

    const chunks = await collectChunks(adapter.sendMessage({ sessionId, content: 'hello' }));

    expect(chunks).toContainEqual({ type: 'text', content: 'Hello world' });
    expect(chunks).toContainEqual(expect.objectContaining({
      type: 'message_metadata',
      sessionId: 'sdk-session-text',
    }));
  });

  it('encodes an image-only turn as official Claude SDK base64 content blocks', async () => {
    const sdk = createMockSdk([
      systemInit('sdk-session-image'),
      resultSuccess('sdk-session-image'),
    ]);
    const { adapter, sessionId } = await createStartedAdapter(sdk);

    await collectChunks(adapter.sendMessage({
      sessionId,
      content: '',
      images: [{
        data: 'aW1hZ2UtYnl0ZXM=',
        mediaType: 'image/png',
        filename: 'diagram.png',
      }],
    }));

    const input = sdk.query.mock.calls[0]?.[0].prompt as AsyncIterable<unknown>;
    const queuedPrompt = await input[Symbol.asyncIterator]().next();
    expect(queuedPrompt.value).toEqual({
      type: 'user',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: [{
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'aW1hZ2UtYnl0ZXM=',
          },
        }],
      },
    });
  });

  it('streams thinking before final text', async () => {
    const sdk = createMockSdk([
      systemInit('sdk-session-thinking'),
      assistantThinkingMessage('Let me think...'),
      assistantTextMessage('Answer', 'msg-3'),
      resultSuccess('sdk-session-thinking'),
    ]);
    const { adapter, sessionId } = await createStartedAdapter(sdk);

    const chunks = await collectChunks(adapter.sendMessage({ sessionId, content: 'think' }));

    expect(chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'thinking', content: 'Let me think...' }),
      { type: 'text', content: 'Answer' },
    ]));
    expect(chunks.findIndex((chunk) => chunk.type === 'thinking')).toBeLessThan(
      chunks.findIndex((chunk) => chunk.type === 'text'),
    );
  });

  it('streams built-in tool use and matching tool result', async () => {
    const sdk = createMockSdk([
      systemInit('sdk-session-tool'),
      assistantToolUseMessage('Bash', 'tool-1', { command: 'echo hi' }),
      toolResultMessage('tool-1', 'hi\n'),
      resultSuccess('sdk-session-tool'),
    ]);
    const { adapter, sessionId } = await createStartedAdapter(sdk);

    const chunks = await collectChunks(adapter.sendMessage({ sessionId, content: 'run' }));

    expect(chunks).toContainEqual(expect.objectContaining({
      type: 'tool_use',
      id: 'tool-1',
      name: 'Bash',
      kind: 'builtin',
      input: { command: 'echo hi' },
    }));
    expect(chunks).toContainEqual({
      type: 'tool_result',
      toolUseId: 'tool-1',
      content: 'hi\n',
      isError: false,
    });
  });

  it('approves canUseTool requests and continues streaming tool chunks', async () => {
    const sdk = createPermissionAwareMockSdk([
      systemInit('sdk-session-allow'),
      assistantToolUseMessage('Read', 'tool-1', { file_path: '/test.txt' }),
      toolResultMessage('tool-1', 'contents'),
      resultSuccess('sdk-session-allow'),
    ]);
    const permissionBridge = createClaudeCodePermissionBridge();
    const canUseTool = vi.spyOn(permissionBridge, 'canUseTool').mockResolvedValue({ behavior: 'allow' });
    const { adapter, sessionId } = await createStartedAdapter(sdk, { permissionBridge });

    const chunks = await collectChunks(adapter.sendMessage({ sessionId, content: 'read' }));

    expect(canUseTool).toHaveBeenCalledWith('Read', { file_path: '/test.txt' }, expect.objectContaining({ toolUseID: 'tool-1' }));
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'tool_use', name: 'Read' }));
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'tool_result', content: 'contents' }));
  });

  it('returns canUseTool deny decisions to the SDK and leaves stream consumable', async () => {
    const sdk = createPermissionAwareMockSdk([
      systemInit('sdk-session-deny'),
      assistantToolUseMessage('Read', 'tool-1', { file_path: '/test.txt' }),
      resultSuccess('sdk-session-deny'),
    ]);
    const permissionBridge = createClaudeCodePermissionBridge();
    vi.spyOn(permissionBridge, 'canUseTool').mockResolvedValue({ behavior: 'deny', message: 'User denied' });
    const { adapter, sessionId } = await createStartedAdapter(sdk, { permissionBridge });

    const chunks = await collectChunks(adapter.sendMessage({ sessionId, content: 'read' }));

    expect(sdk.permissionResults).toEqual([{ behavior: 'deny', message: 'User denied' }]);
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'tool_use', name: 'Read' }));
  });

  it('processes AskUserQuestion through canUseTool updated input', async () => {
    const input = {
      questions: [{ question: 'Continue?', options: [{ label: 'Yes' }, { label: 'No' }] }],
    };
    const sdk = createPermissionAwareMockSdk([
      systemInit('sdk-session-question'),
      assistantToolUseMessage('AskUserQuestion', 'q-1', input),
      resultSuccess('sdk-session-question'),
    ]);
    const permissionBridge = createClaudeCodePermissionBridge();
    vi.spyOn(permissionBridge, 'canUseTool').mockImplementation(async (toolName, rawInput) => ({
      behavior: 'allow',
      updatedInput: { ...rawInput, answers: { 'Continue?': 'Yes' } },
    }));
    const { adapter, sessionId } = await createStartedAdapter(sdk, { permissionBridge });

    await collectChunks(adapter.sendMessage({ sessionId, content: 'ask' }));

    expect(permissionBridge.canUseTool).toHaveBeenCalledWith('AskUserQuestion', input, expect.objectContaining({ toolUseID: 'q-1' }));
    expect(sdk.permissionResults).toEqual([{
      behavior: 'allow',
      updatedInput: { ...input, answers: { 'Continue?': 'Yes' } },
    }]);
  });

  it('passes MCP server config into SDK query options', async () => {
    const sdk = createMockSdk([systemInit('sdk-session-mcp'), resultSuccess('sdk-session-mcp')]);
    const mcpServers = { 'test-server': { type: 'stdio' as const, command: 'node', args: ['server.js'] } };
    const { adapter, sessionId } = await createStartedAdapter(sdk, { mcpServers });

    await collectChunks(adapter.sendMessage({ sessionId, content: 'mcp' }));

    expect(sdk.query.mock.calls[0][0].options.mcpServers).toEqual(mcpServers);
  });

  it('applies live model, permission, and MCP changes to the running query handle', async () => {
    const sdkOutput = createAsyncQueue<unknown>();
    const query = sdkOutput as unknown as AsyncIterable<unknown> & {
      setModel: jest.Mock<Promise<void>, [string | undefined]>;
      setPermissionMode: jest.Mock<Promise<void>, [string]>;
      setMcpServers: jest.Mock<Promise<void>, [Record<string, unknown>]>;
      close: jest.Mock<void, []>;
    };
    query.setModel = vi.fn().mockResolvedValue(undefined);
    query.setPermissionMode = vi.fn().mockResolvedValue(undefined);
    query.setMcpServers = vi.fn().mockResolvedValue(undefined);
    query.close = vi.fn();
    const sdk = createMockSdk([]);
    sdk.query.mockImplementation(() => query);
    const mcpConfigLoader = vi.fn()
      .mockResolvedValueOnce({ fs: { type: 'stdio', command: 'node', args: ['before.js'] } })
      .mockResolvedValueOnce({ fs: { type: 'stdio', command: 'node', args: ['after.js'] } });
    const { adapter, sessionId } = await createStartedAdapter(sdk, { mcpConfigLoader });

    const stream = adapter.sendMessage({ sessionId, content: 'hello' });
    const next = stream.next();
    await waitForExpect(() => expect(sdk.query).toHaveBeenCalledTimes(1));
    await adapter.setModel('claude-opus-4-6');
    await adapter.setPermissionMode('plan');
    await adapter.reloadMcpServers();

    expect(query.setModel).toHaveBeenCalledWith('claude-opus-4-6');
    expect(query.setPermissionMode).toHaveBeenCalledWith('plan');
    expect(query.setMcpServers).toHaveBeenCalledWith({
      fs: { type: 'stdio', command: 'node', args: ['after.js'] },
    });
    expect(mcpConfigLoader).toHaveBeenCalledTimes(2);

    adapter.cancelStream(sessionId);
    await expect(next).resolves.toEqual({ value: undefined, done: true });
  });

  it('resumes a captured SDK session after adapter stop/start reload', async () => {
    const firstMessages = [
      systemInit('sdk-session-resume'),
      assistantTextMessage('First', 'msg-1'),
      resultSuccess('sdk-session-resume'),
    ];
    const secondMessages = [
      assistantTextMessage('Second', 'msg-2'),
      resultSuccess('sdk-session-resume'),
    ];
    const sdk = createMockSdk([]);
    sdk.query
      .mockImplementationOnce(() => (async function* () {
        for (const msg of firstMessages) {
          yield msg;
        }
      })())
      .mockImplementationOnce(() => (async function* () {
        for (const msg of secondMessages) {
          yield msg;
        }
      })());
    const { adapter, sessionId } = await createStartedAdapter(sdk);

    await collectChunks(adapter.sendMessage({ sessionId, content: 'first' }));
    await adapter.stop();
    await adapter.start();
    const chunks = await collectChunks(adapter.sendMessage({ sessionId, content: 'second' }));

    expect(sdk.query).toHaveBeenCalledTimes(2);
    expect(sdk.query.mock.calls[1][0].options.resume).toBe('sdk-session-resume');
    expect(chunks).toContainEqual({ type: 'text', content: 'Second' });
  });

  it('emits SDK result errors as error chunks', async () => {
    const sdk = createMockSdk([
      systemInit('sdk-session-error'),
      resultError(['authentication_failed']),
    ]);
    const { adapter, sessionId } = await createStartedAdapter(sdk);

    const chunks = await collectChunks(adapter.sendMessage({ sessionId, content: 'fail' }));

    expect(chunks).toContainEqual(expect.objectContaining({
      type: 'error',
      content: expect.stringContaining('authentication_failed'),
    }));
  });

  it('cancels a slow stream without hanging', async () => {
    async function* slowMessages() {
      yield systemInit('sdk-session-cancel');
      await new Promise((resolve) => setTimeout(resolve, 100));
      yield assistantTextMessage('too late');
      yield resultSuccess('sdk-session-cancel');
    }
    const sdk: ClaudeCodeSdkFacade & { query: jest.Mock } = {
      query: vi.fn(() => slowMessages()),
    };
    const { adapter, sessionId } = await createStartedAdapter(sdk);
    const stream = adapter.sendMessage({ sessionId, content: 'cancel' });

    await expect(stream.next()).resolves.toEqual(expect.objectContaining({ done: false }));
    adapter.cancelStream(sessionId);

    await expect(Promise.race([
      stream.next(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('cancel timed out')), 500)),
    ])).resolves.toEqual({ value: undefined, done: true });
  });

  it('streams thinking and text in interleaved order within a single session', async () => {
    const sdk = createMockSdk([
      systemInit('sdk-session-interleave'),
      assistantThinkingMessage('Step 1...', 'msg-1'),
      assistantTextMessage('Partial', 'msg-2'),
      assistantThinkingMessage('Step 2...', 'msg-3'),
      assistantTextMessage('Complete answer', 'msg-4'),
      resultSuccess('sdk-session-interleave'),
    ]);
    const { adapter, sessionId } = await createStartedAdapter(sdk);

    const chunks = await collectChunks(adapter.sendMessage({ sessionId, content: 'interleave' }));

    const thinkingChunks = chunks.filter((c) => c.type === 'thinking');
    const textChunks = chunks.filter((c) => c.type === 'text');
    expect(thinkingChunks.length).toBeGreaterThanOrEqual(2);
    expect(textChunks.length).toBeGreaterThanOrEqual(2);
    expect(textChunks).toContainEqual({ type: 'text', content: 'Complete answer' });
  });

  it('executes MCP stdio tool via tool use/result lifecycle', async () => {
    const mcpToolInput = { query: 'SELECT 1' };
    const sdk = createMockSdk([
      systemInit('sdk-session-mcp-tool'),
      assistantToolUseMessage('mcp__testdb__query', 'mcp-tool-1', mcpToolInput),
      toolResultMessage('mcp-tool-1', '{"result": 1}', false),
      assistantTextMessage('Query returned 1.'),
      resultSuccess('sdk-session-mcp-tool'),
    ]);
    const mcpServers = {
      testdb: { type: 'stdio' as const, command: 'node', args: ['db-server.js'] },
    };
    const { adapter, sessionId } = await createStartedAdapter(sdk, { mcpServers });

    const chunks = await collectChunks(adapter.sendMessage({ sessionId, content: 'query db' }));

    expect(sdk.query.mock.calls[0][0].options.mcpServers).toEqual(mcpServers);
    expect(chunks).toContainEqual(expect.objectContaining({
      type: 'tool_use',
      id: 'mcp-tool-1',
      name: 'mcp__testdb__query',
      input: mcpToolInput,
    }));
    expect(chunks).toContainEqual({
      type: 'tool_result',
      toolUseId: 'mcp-tool-1',
      content: '{"result": 1}',
      isError: false,
    });
    expect(chunks).toContainEqual({ type: 'text', content: 'Query returned 1.' });
  });

  it('OpenCode backend remains registered alongside Claude Code', async () => {
    expect(IMPLEMENTED_AGENT_BACKENDS).toContain('opencode');
    expect(IMPLEMENTED_AGENT_BACKENDS).toContain('claude-code');
    expect(IMPLEMENTED_AGENT_BACKENDS.length).toBe(3);
  });
});
