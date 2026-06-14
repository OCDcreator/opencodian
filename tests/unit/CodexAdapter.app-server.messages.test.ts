/**
 * CodexAdapter tests — focused on app-server session message / detail readback.
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
    listModels: jest.fn().mockResolvedValue([]),
  }));
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
    expect(messages[0]).toEqual({ role: 'user', content: [{ type: 'text', text: 'Hello' }] });
    expect(messages[1]).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] });
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
