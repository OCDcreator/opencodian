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
  (mockConstructor as any).normalizeTurnsToPreviewMessages = jest.fn(() => []);
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

