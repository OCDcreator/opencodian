import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';
import type { StreamChunk } from '../../../../../src/core/types/chat';

const mockAppServerStart = jest.fn<Promise<void>, []>();
const mockAppServerStop = jest.fn();
const mockStartThread = jest.fn();
const mockResumeThread = jest.fn();
const mockStartTurn = jest.fn();
const mockInterruptTurn = jest.fn();
let notificationHandler: ((event: { method: string; params: unknown }) => void) | null = null;

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => {
  const actual = jest.requireActual('../../../../../src/core/agents/backend/CodexAppServerClient');
  return {
    ...actual,
    CodexAppServerClient: jest.fn().mockImplementation(() => ({
      start: mockAppServerStart,
      stop: mockAppServerStop,
      startThread: mockStartThread,
      resumeThread: mockResumeThread,
      startTurn: mockStartTurn,
      interruptTurn: mockInterruptTurn,
      subscribeToThreadNotifications: jest.fn((_threadId, handler) => {
        notificationHandler = handler;
        return { dispose: jest.fn() };
      }),
      getThreadEffectiveSettings: jest.fn().mockReturnValue(null),
    })),
  };
});

function createMockCodex() {
  const thread = {
    runStreamed: jest.fn(),
  };
  return {
    startThread: jest.fn().mockReturnValue(thread),
    resumeThread: jest.fn().mockReturnValue(thread),
    thread,
  };
}

function emitNotification(method: string, params: Record<string, unknown>): void {
  notificationHandler?.({ method, params });
}

async function collectStream(adapter: CodexAdapter, sessionId: string, options?: Record<string, unknown>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of adapter.sendMessage({
    sessionId,
    content: 'Inspect this',
    ...(options ? { options } : {}),
  })) {
    chunks.push(chunk);
  }
  return chunks;
}

function resetAppServerMocks(): void {
  jest.clearAllMocks();
  notificationHandler = null;
  mockAppServerStart.mockResolvedValue(undefined);
  mockStartThread.mockResolvedValue({ id: 'thread-new' });
  mockResumeThread.mockResolvedValue({ id: 'thread-new' });
  mockInterruptTurn.mockResolvedValue(true);
}

describe('CodexAdapter app-server chat transport', () => {
  beforeEach(() => {
    resetAppServerMocks();
  });

  it('uses thread/start then turn/start, maps exact context usage, and avoids duplicated deltas', async () => {
    mockStartTurn.mockImplementation(async () => {
      setTimeout(() => {
        emitNotification('thread/tokenUsage/updated', {
          threadId: 'thread-new',
          turnId: 'turn-1',
          tokenUsage: {
            total: {
              totalTokens: 900,
              inputTokens: 500,
              cachedInputTokens: 200,
              outputTokens: 120,
              reasoningOutputTokens: 80,
            },
            last: {
              totalTokens: 400,
              inputTokens: 200,
              cachedInputTokens: 100,
              outputTokens: 60,
              reasoningOutputTokens: 40,
            },
            modelContextWindow: 128000,
          },
        });
        emitNotification('item/agentMessage/delta', {
          threadId: 'thread-new',
          itemId: 'message-1',
          delta: '{"ok":true}',
        });
        emitNotification('item/completed', {
          threadId: 'thread-new',
          item: { id: 'message-1', type: 'agentMessage', text: '{"ok":true}' },
        });
        emitNotification('item/started', {
          threadId: 'thread-new',
          item: { id: 'todos-1', type: 'todoList', items: [{ text: 'Inspect', completed: false }] },
        });
        emitNotification('item/completed', {
          threadId: 'thread-new',
          item: { id: 'todos-1', type: 'todoList', items: [{ text: 'Inspect', completed: true }] },
        });
        emitNotification('item/completed', {
          threadId: 'thread-new',
          item: { id: 'files-1', type: 'fileChange', changes: [{ path: '/vault/a.ts' }] },
        });
        emitNotification('turn/completed', {
          threadId: 'thread-new',
          turn: { id: 'turn-1', error: null },
        });
      }, 0);
      return { id: 'turn-1' };
    });
    const sdk = createMockCodex();
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(sdk),
      model: 'gpt-5',
      workingDirectory: '/vault',
      sandboxMode: 'workspace-write',
      modelReasoningEffort: 'high',
      additionalDirectories: ['/extra'],
      networkAccessEnabled: true,
      webSearchMode: 'live',
    });
    await adapter.start();

    const chunks = await collectStream(adapter, 'codex-local-1', {
      outputFormat: { schema: { type: 'object' } },
    });

    expect(mockStartThread).toHaveBeenCalledWith({
      model: 'gpt-5',
      cwd: '/vault',
      sandbox: 'workspace-write',
      config: { web_search: 'live' },
    });
    expect(mockStartTurn).toHaveBeenCalledWith(expect.objectContaining({
      threadId: 'thread-new',
      model: 'gpt-5',
      effort: 'high',
      outputSchema: { type: 'object' },
      sandboxPolicy: {
        type: 'workspaceWrite',
        writableRoots: ['/vault', '/extra'],
        networkAccess: true,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
    }));
    expect(chunks).toContainEqual(expect.objectContaining({
      type: 'context_usage',
      snapshot: expect.objectContaining({
        sessionId: 'thread-new',
        providerId: null,
        providerName: null,
        totalTokens: 900,
        contextWindow: 128000,
        inputTokens: 500,
        cacheReadTokens: 200,
        outputTokens: 120,
        reasoningTokens: 80,
        cacheWriteTokens: null,
        totalCost: null,
      }),
    }));
    expect(chunks.filter((chunk) => chunk.type === 'text')).toEqual([
      { type: 'text', content: '{"ok":true}' },
    ]);
    expect(chunks).toContainEqual(expect.objectContaining({
      type: 'backend_event',
      event: 'structured_output',
      metadata: { structuredOutput: { ok: true } },
    }));
    expect(chunks).toContainEqual(expect.objectContaining({
      type: 'tool_result',
      toolUseId: 'todos-1',
      content: 'Todo list: 1 items (1 completed)',
    }));
    expect(chunks).toContainEqual({ type: 'file_edited', file: '/vault/a.ts' });
    expect(chunks).toContainEqual(expect.objectContaining({
      type: 'message_metadata',
      sessionId: 'thread-new',
    }));
    expect(chunks.at(-1)).toEqual({ type: 'message_stop' });
    expect(sdk.startThread).not.toHaveBeenCalled();
  });

});

describe('CodexAdapter app-server chat lifecycle', () => {
  beforeEach(resetAppServerMocks);

  it('ignores an older turn completion that arrives before the new turn is registered', async () => {
    mockStartTurn.mockImplementation(async () => {
      // The subscription is already live, but startTurn has not returned the
      // current turn ID yet. This completion belongs to the previous turn on
      // the same resumed thread and must not finish or fail the new stream.
      emitNotification('turn/completed', {
        threadId: 'thread-new',
        turn: { id: 'turn-previous', error: { message: 'stale turn failed' } },
      });
      setTimeout(() => {
        emitNotification('thread/tokenUsage/updated', {
          threadId: 'thread-new',
          turnId: 'turn-current',
          tokenUsage: {
            total: { totalTokens: 321, inputTokens: 200, outputTokens: 121 },
            modelContextWindow: 1000,
          },
        });
        emitNotification('item/agentMessage/delta', {
          threadId: 'thread-new',
          turnId: 'turn-current',
          itemId: 'message-current',
          delta: 'current reply',
        });
        emitNotification('turn/completed', {
          threadId: 'thread-new',
          turn: { id: 'turn-current', error: null },
        });
      }, 0);
      return { id: 'turn-current' };
    });
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
      model: 'gpt-5',
    });
    await adapter.start();

    const stream = adapter.sendMessage({ sessionId: 'codex-local-turn-race', content: 'Inspect this' });
    const first = await stream.next();
    expect(first).toEqual({ done: false, value: { type: 'message_start' } });
    // The stale completion has already been delivered, but the current turn's
    // timer has not fired. It must not poison evidence or install context.
    expect(adapter.getThreadEffectiveEvidence('codex-local-turn-race').model.application).toBe('verified');
    await expect(adapter.getContextUsageSnapshot('codex-local-turn-race')).resolves.toBeNull();

    const chunks: StreamChunk[] = [first.value];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks).not.toContainEqual({ type: 'error', content: 'stale turn failed' });
    expect(chunks).toContainEqual({ type: 'text', content: 'current reply' });
    expect(chunks).toContainEqual(expect.objectContaining({
      type: 'context_usage',
      snapshot: expect.objectContaining({ totalTokens: 321, contextWindow: 1000 }),
    }));
    expect(chunks.at(-1)).toEqual({ type: 'message_stop' });
    await expect(adapter.getContextUsageSnapshot('codex-local-turn-race')).resolves.toEqual(expect.objectContaining({
      totalTokens: 321,
      contextWindow: 1000,
    }));
    expect(adapter.getThreadEffectiveEvidence('codex-local-turn-race').model.application).toBe('verified');
  });

  it('keeps current-turn notifications delivered before turn/start resolves', async () => {
    mockStartTurn.mockImplementation(async () => {
      emitNotification('thread/tokenUsage/updated', {
        threadId: 'thread-new',
        turnId: 'turn-early',
        tokenUsage: {
          total: { totalTokens: 144, inputTokens: 100, outputTokens: 44 },
          modelContextWindow: 2048,
        },
      });
      emitNotification('item/agentMessage/delta', {
        threadId: 'thread-new',
        turnId: 'turn-early',
        itemId: 'message-early',
        delta: 'early current reply',
      });
      emitNotification('turn/completed', {
        threadId: 'thread-new',
        turn: { id: 'turn-early', error: null },
      });
      return { id: 'turn-early' };
    });
    const adapter = new CodexAdapter({ createCodex: jest.fn().mockResolvedValue(createMockCodex()) });
    await adapter.start();

    const chunks = await collectStream(adapter, 'codex-local-early-current');

    expect(chunks).toContainEqual({ type: 'text', content: 'early current reply' });
    expect(chunks).toContainEqual(expect.objectContaining({
      type: 'context_usage',
      snapshot: expect.objectContaining({ totalTokens: 144, contextWindow: 2048 }),
    }));
    expect(chunks.at(-1)).toEqual({ type: 'message_stop' });
  });

  it('resumes an existing Codex thread through app-server instead of starting a new one', async () => {
    mockStartTurn.mockImplementation(async () => {
      setTimeout(() => {
        emitNotification('turn/completed', {
          threadId: 'thread-existing',
          turn: { id: 'turn-2', error: null },
        });
      }, 0);
      return { id: 'turn-2' };
    });
    mockResumeThread.mockResolvedValue({ id: 'thread-existing' });
    const adapter = new CodexAdapter({ createCodex: jest.fn().mockResolvedValue(createMockCodex()) });
    await adapter.start();

    await collectStream(adapter, 'thread-existing');

    // 'inherit' (default) omits approvalPolicy from app-server overrides.
    expect(mockResumeThread).toHaveBeenCalledWith(
      'thread-existing',
      expect.not.objectContaining({ approvalPolicy: expect.anything() }),
    );
    expect(mockStartThread).not.toHaveBeenCalled();
  });

  it('interrupts the active app-server turn when the user cancels', async () => {
    mockStartTurn.mockResolvedValue({ id: 'turn-cancel' });
    const adapter = new CodexAdapter({ createCodex: jest.fn().mockResolvedValue(createMockCodex()) });
    await adapter.start();

    const iterator = adapter.sendMessage({ sessionId: 'codex-local-cancel', content: 'Cancel me' });
    expect((await iterator.next()).value).toEqual({ type: 'message_start' });
    adapter.cancelStream('codex-local-cancel');
    await iterator.next();
    await iterator.next();

    expect(mockInterruptTurn).toHaveBeenCalledWith('thread-new', 'turn-cancel');
  });

  it('uses the SDK only when app-server protocol negotiation fails', async () => {
    mockAppServerStart.mockRejectedValueOnce(new Error('unsupported app-server'));
    const sdk = createMockCodex();
    sdk.thread.runStreamed.mockResolvedValue({
      events: (async function* () {
        yield { type: 'thread.started', thread_id: 'sdk-thread' };
        yield { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } };
      })(),
    });
    const adapter = new CodexAdapter({ createCodex: jest.fn().mockResolvedValue(sdk) });
    await adapter.start();

    const chunks = await collectStream(adapter, 'codex-local-sdk');

    expect(adapter.hasCapability(AgentCapability.Context)).toBe(false);
    expect(sdk.startThread).toHaveBeenCalledTimes(1);
    expect(chunks).toContainEqual({ type: 'message_stop' });
  });

  it('notifies observers when the Context capability becomes available or is removed', async () => {
    const adapter = new CodexAdapter({ createCodex: jest.fn().mockResolvedValue(createMockCodex()) });
    const handler = jest.fn();
    adapter.onCapabilitiesChange(handler);

    await adapter.start();
    await adapter.stop();

    expect(handler).toHaveBeenNthCalledWith(1, expect.any(Set));
    expect(handler.mock.calls[0][0].has(AgentCapability.Context)).toBe(true);
    expect(handler).toHaveBeenNthCalledWith(2, expect.any(Set));
    expect(handler.mock.calls[1][0].has(AgentCapability.Context)).toBe(false);
  });
});
