/**
 * CodexAdapter tests — focused on app-server session discovery and
 * transcript readback (Checkpoint 14H seam).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { CodexAdapter } from '../../src/core/agents/backend/CodexAdapter';
import { CodexAppServerClient } from '../../src/core/agents/backend/CodexAppServerClient';

jest.mock('../../src/core/agents/backend/CodexAppServerClient', () => {
  const mockConstructor = jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(),
    listThreads: jest.fn().mockResolvedValue([]),
    readThread: jest.fn().mockResolvedValue(null),
  }));
  // Attach static methods to the mocked constructor so CodexAppServerClient.normalizeThreadList works
  (mockConstructor as any).normalizeThreadList = jest.fn((threads: any[]) =>
    threads.map((t: any) => ({
      id: t.id,
      title: t.name ?? t.preview?.slice(0, 80) ?? '(untitled)',
      updatedAt: t.updatedAt ? t.updatedAt * 1000 : null,
      shareUrl: null,
    }))
  );
  (mockConstructor as any).normalizeTurnsToPreviewMessages = jest.fn((turns: any[]) => {
    const messages: Array<{ role: string; parts: Array<{ type: string; text: string }> }> = [];
    for (const turn of turns) {
      for (const item of turn.items) {
        if (item.type === 'userMessage' && Array.isArray(item.content)) {
          const textParts = item.content
            .filter((c: any) => c.type === 'text' && typeof c.text === 'string' && c.text.length > 0)
            .map((c: any) => c.text);
          if (textParts.length > 0) {
            messages.push({
              role: 'user',
              parts: textParts.map((text: string) => ({ type: 'text', text })),
            });
          }
        } else if (item.type === 'agentMessage' && typeof item.text === 'string' && item.text.length > 0) {
          messages.push({
            role: 'assistant',
            parts: [{ type: 'text', text: item.text }],
          });
        }
      }
    }
    return messages;
  });
  return { CodexAppServerClient: mockConstructor };
});

const MockedCodexAppServerClient = CodexAppServerClient as jest.MockedClass<typeof CodexAppServerClient>;

describe('CodexAdapter — app-server start/stop lifecycle', () => {
  let adapter: CodexAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue(null),
    } as unknown as CodexAppServerClient));
  });

  it('initializes app-server client when codexPathOverride is provided', async () => {
    adapter = new CodexAdapter({
      codexPathOverride: '/mock/codex',
      createCodex: async () => ({}) as any,
    });
    await adapter.start();
    expect(MockedCodexAppServerClient).toHaveBeenCalledWith({ codexPathOverride: '/mock/codex' });
  });

  it('does not initialize app-server client when codexPathOverride is missing', async () => {
    adapter = new CodexAdapter({
      createCodex: async () => ({}) as any,
    });
    await adapter.start();
    expect(MockedCodexAppServerClient).not.toHaveBeenCalled();
  });

  it('continues even if app-server client fails to start', async () => {
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockRejectedValue(new Error('spawn failed')),
      stop: jest.fn(),
      listThreads: jest.fn(),
      readThread: jest.fn(),
    } as unknown as CodexAppServerClient));

    adapter = new CodexAdapter({
      codexPathOverride: '/mock/codex',
      createCodex: async () => ({}) as any,
    });
    await expect(adapter.start()).resolves.not.toThrow();
  });

  it('stops app-server client when stopping adapter', async () => {
    const mockStop = jest.fn();
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: mockStop,
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue(null),
    } as unknown as CodexAppServerClient));

    adapter = new CodexAdapter({
      codexPathOverride: '/mock/codex',
      createCodex: async () => ({}) as any,
    });
    await adapter.start();
    await adapter.stop();
    expect(mockStop).toHaveBeenCalled();
  });
});

describe('CodexAdapter — listSessions()', () => {
  let adapter: CodexAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue(null),
    } as unknown as CodexAppServerClient));
  });

  it('returns in-memory sessions when app-server is not available', async () => {
    adapter = new CodexAdapter({
      createCodex: async () => ({}) as any,
    });
    await adapter.start();

    const sessionId = await adapter.createSession();
    const sessions = await adapter.listSessions();
    expect(sessions).toHaveLength(1);
    expect((sessions[0] as any).id).toBe(sessionId);
  });

  it('merges app-server threads with in-memory sessions', async () => {
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      listThreads: jest.fn().mockResolvedValue([
        {
          id: 'thread-1',
          preview: 'Test thread',
          createdAt: 1700000000,
          updatedAt: 1700000100,
          name: 'Persisted Thread',
        },
      ]),
      readThread: jest.fn().mockResolvedValue(null),
    } as unknown as CodexAppServerClient));

    adapter = new CodexAdapter({
      codexPathOverride: '/mock/codex',
      createCodex: async () => ({}) as any,
    });
    await adapter.start();

    const inMemoryId = await adapter.createSession();
    const sessions = await adapter.listSessions();

    expect(sessions).toHaveLength(2);
    const ids = sessions.map((s: any) => s.id);
    expect(ids).toContain(inMemoryId);
    expect(ids).toContain('thread-1');

    const persistedSession = sessions.find((s: any) => s.id === 'thread-1');
    expect(persistedSession).toMatchObject({
      id: 'thread-1',
      title: 'Persisted Thread',
      updatedAt: 1700000100000,
    });
  });

  it('does not duplicate sessions that exist in both in-memory and app-server', async () => {
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      listThreads: jest.fn().mockResolvedValue([
        {
          id: 'thread-1',
          preview: 'Test thread',
          createdAt: 1700000000,
          updatedAt: 1700000100,
          name: 'Persisted Thread',
        },
      ]),
      readThread: jest.fn().mockResolvedValue(null),
    } as unknown as CodexAppServerClient));

    adapter = new CodexAdapter({
      codexPathOverride: '/mock/codex',
      createCodex: async () => ({}) as any,
    });
    await adapter.start();

    // Create an in-memory session and manually set its threadId to match app-server
    const sessionId = await adapter.createSession();
    // Manually set threadId to simulate a persisted session that was resumed
    (adapter as any).sessions.get(sessionId).threadId = 'thread-1';

    const sessions = await adapter.listSessions();

    // Should only have 1 session (the duplicated one is not added again)
    const thread1Sessions = sessions.filter((s: any) => s.id === 'thread-1');
    expect(thread1Sessions).toHaveLength(1);
  });

  it('falls back to in-memory sessions when app-server list fails', async () => {
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      listThreads: jest.fn().mockRejectedValue(new Error('connection failed')),
      readThread: jest.fn().mockResolvedValue(null),
    } as unknown as CodexAppServerClient));

    adapter = new CodexAdapter({
      codexPathOverride: '/mock/codex',
      createCodex: async () => ({}) as any,
    });
    await adapter.start();

    const sessionId = await adapter.createSession();
    const sessions = await adapter.listSessions();

    expect(sessions).toHaveLength(1);
    expect((sessions[0] as any).id).toBe(sessionId);
  });
});

describe('CodexAdapter — getSessionMessages()', () => {
  let adapter: CodexAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue(null),
    } as unknown as CodexAppServerClient));
  });

  it('returns normalized messages from app-server thread', async () => {
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue({
        id: 'thread-1',
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                type: 'userMessage',
                id: 'item-1',
                content: [{ type: 'text', text: 'Hello' }],
              },
            ],
          },
          {
            id: 'turn-2',
            items: [
              {
                type: 'agentMessage',
                id: 'item-2',
                text: 'Hi there!',
                phase: 'commentary',
              },
            ],
          },
        ],
      }),
    } as unknown as CodexAppServerClient));

    adapter = new CodexAdapter({
      codexPathOverride: '/mock/codex',
      createCodex: async () => ({}) as any,
    });
    await adapter.start();

    const messages = await adapter.getSessionMessages('thread-1');

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
  });

  it('returns empty array when app-server is not available', async () => {
    adapter = new CodexAdapter({
      createCodex: async () => ({}) as any,
    });
    await adapter.start();

    const messages = await adapter.getSessionMessages('thread-1');
    expect(messages).toEqual([]);
  });

  it('returns empty array when thread has no turns', async () => {
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue({
        id: 'thread-1',
        turns: [],
      }),
    } as unknown as CodexAppServerClient));

    adapter = new CodexAdapter({
      codexPathOverride: '/mock/codex',
      createCodex: async () => ({}) as any,
    });
    await adapter.start();

    const messages = await adapter.getSessionMessages('thread-1');
    expect(messages).toEqual([]);
  });

  it('returns empty array when app-server read fails', async () => {
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockRejectedValue(new Error('read failed')),
    } as unknown as CodexAppServerClient));

    adapter = new CodexAdapter({
      codexPathOverride: '/mock/codex',
      createCodex: async () => ({}) as any,
    });
    await adapter.start();

    const messages = await adapter.getSessionMessages('thread-1');
    expect(messages).toEqual([]);
  });
});

describe('CodexAdapter — getSession()', () => {
  let adapter: CodexAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue(null),
    } as unknown as CodexAppServerClient));
  });

  it('returns in-memory session when found', async () => {
    adapter = new CodexAdapter({
      createCodex: async () => ({}) as any,
    });
    await adapter.start();

    const sessionId = await adapter.createSession();
    const session = await adapter.getSession(sessionId);

    expect(session).not.toBeNull();
    expect((session as any).id).toBe(sessionId);
  });

  it('falls back to app-server when in-memory session not found', async () => {
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue({
        id: 'thread-1',
        preview: 'Test preview',
        name: 'Test Thread',
        updatedAt: 1700000100,
      }),
    } as unknown as CodexAppServerClient));

    adapter = new CodexAdapter({
      codexPathOverride: '/mock/codex',
      createCodex: async () => ({}) as any,
    });
    await adapter.start();

    const session = await adapter.getSession('thread-1');

    expect(session).not.toBeNull();
    expect(session).toMatchObject({
      id: 'thread-1',
      title: 'Test Thread',
      updatedAt: 1700000100000,
    });
  });

  it('returns null when session not found anywhere', async () => {
    adapter = new CodexAdapter({
      createCodex: async () => ({}) as any,
    });
    await adapter.start();

    const session = await adapter.getSession('non-existent');
    expect(session).toBeNull();
  });
});

describe('CodexAppServerClient.normalizeTurnsToPreviewMessages()', () => {
  it('extracts text from userMessage and agentMessage items', () => {
    const turns = [
      {
        id: 'turn-1',
        items: [
          { type: 'userMessage', id: 'item-1', content: [{ type: 'text', text: 'Hello' }] },
          { type: 'agentMessage', id: 'item-2', text: 'Hi there!', phase: 'commentary' },
        ],
      },
    ];

    const result = CodexAppServerClient.normalizeTurnsToPreviewMessages(turns as any);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: 'user', parts: [{ type: 'text', text: 'Hello' }] });
    expect(result[1]).toEqual({ role: 'assistant', parts: [{ type: 'text', text: 'Hi there!' }] });
  });

  it('skips non-text items (reasoning, mcpToolCall, webSearch, fileChange, contextCompaction)', () => {
    const turns = [
      {
        id: 'turn-1',
        items: [
          { type: 'userMessage', id: 'item-1', content: [{ type: 'text', text: 'User prompt' }] },
          { type: 'reasoning', id: 'item-2', summary: ['Thinking...'] },
          { type: 'mcpToolCall', id: 'item-3', server: 'opencode', tool: 'opencode_setup', arguments: {} },
          { type: 'webSearch', id: 'item-4', query: 'test' },
          { type: 'fileChange', id: 'item-5', changes: [] },
          { type: 'contextCompaction', id: 'item-6' },
          { type: 'agentMessage', id: 'item-7', text: 'Agent reply', phase: 'commentary' },
        ],
      },
    ];

    const result = CodexAppServerClient.normalizeTurnsToPreviewMessages(turns as any);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: 'user', parts: [{ type: 'text', text: 'User prompt' }] });
    expect(result[1]).toEqual({ role: 'assistant', parts: [{ type: 'text', text: 'Agent reply' }] });
  });

  it('handles multiple text parts in userMessage content', () => {
    const turns = [
      {
        id: 'turn-1',
        items: [
          {
            type: 'userMessage',
            id: 'item-1',
            content: [
              { type: 'text', text: 'First paragraph' },
              { type: 'text', text: 'Second paragraph' },
            ],
          },
        ],
      },
    ];

    const result = CodexAppServerClient.normalizeTurnsToPreviewMessages(turns as any);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    expect(result[0].parts).toHaveLength(2);
    expect(result[0].parts[0]).toEqual({ type: 'text', text: 'First paragraph' });
    expect(result[0].parts[1]).toEqual({ type: 'text', text: 'Second paragraph' });
  });

  it('ignores userMessage items with no text content', () => {
    const turns = [
      {
        id: 'turn-1',
        items: [
          { type: 'userMessage', id: 'item-1', content: [{ type: 'image', url: 'http://example.com/img.png' }] },
          { type: 'agentMessage', id: 'item-2', text: 'I cannot see images.' },
        ],
      },
    ];

    const result = CodexAppServerClient.normalizeTurnsToPreviewMessages(turns as any);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'assistant', parts: [{ type: 'text', text: 'I cannot see images.' }] });
  });

  it('returns empty array for empty turns', () => {
    const result = CodexAppServerClient.normalizeTurnsToPreviewMessages([]);
    expect(result).toEqual([]);
  });
});