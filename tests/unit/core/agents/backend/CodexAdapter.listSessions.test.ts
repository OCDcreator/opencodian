import type { execFile as ExecFileFn } from 'node:child_process';

const mockExecFile = jest.fn<void, Parameters<typeof ExecFileFn>>();

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  execFile: (...args: Parameters<typeof ExecFileFn>) => mockExecFile(...args),
}));

import { CodexAdapter } from '../../../../../src/core/agents/backend';

const mockListThreads = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => {
  const MockClient = jest.fn().mockImplementation(() => ({
    start: mockAppServerClientStart,
    stop: mockAppServerClientStop,
    listThreads: mockListThreads,
  }));
  (MockClient as unknown as { normalizeThreadList: jest.Mock }).normalizeThreadList = jest.fn(
    (threads: Array<{ id: string; name?: string | null; preview?: string; updatedAt?: number; archived?: boolean }>) =>
      threads.map((t) => ({
        id: t.id,
        title: t.name ?? t.preview?.slice(0, 80) ?? '(untitled)',
        updatedAt: t.updatedAt ? t.updatedAt * 1000 : null,
        shareUrl: null,
        archived: t.archived ?? false,
      }))
  );
  return { CodexAppServerClient: MockClient };
});

/** Creates a mock Codex SDK instance for DI. */
function createMockCodex() {
  const mockThread = {
    id: 'mock-thread-1',
    runStreamed: jest.fn(),
    run: jest.fn(),
  };

  return {
    startThread: jest.fn().mockReturnValue(mockThread),
    resumeThread: jest.fn().mockReturnValue(mockThread),
    _mockThread: mockThread,
  };
}

describe('CodexAdapter.listSessions', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    mockListThreads.mockReset();
    mockAppServerClientStart.mockClear();
  });

  it('merges active and archived persisted threads from app-server', async () => {
    mockListThreads
      .mockResolvedValueOnce([
        { id: 'active-1', name: 'Active thread', updatedAt: 1_700_000_000 },
      ])
      .mockResolvedValueOnce([
        { id: 'archived-1', name: 'Archived thread', updatedAt: 1_600_000_000, archived: true },
      ]);

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();

    const sessions = await adapter.listSessions!();

    expect(mockListThreads).toHaveBeenCalledTimes(2);
    expect(mockListThreads).toHaveBeenNthCalledWith(1, { limit: 50, archived: false });
    expect(mockListThreads).toHaveBeenNthCalledWith(2, { limit: 50, archived: true });

    const records = sessions as Array<Record<string, unknown>>;
    expect(records).toHaveLength(2);
    const active = records.find((r) => r.id === 'active-1');
    const archived = records.find((r) => r.id === 'archived-1');
    expect(active).toMatchObject({ id: 'active-1', title: 'Active thread', archived: false });
    expect(archived).toMatchObject({ id: 'archived-1', title: 'Archived thread', archived: true });
  });

  it('stamps archived:true on threads from the archived query even when the app-server omits the field', async () => {
    // Regression: the codex-cli 0.139.0 app-server `thread/list` response does
    // NOT echo an `archived` field on each row, even when queried with
    // `archived: true`. The filter semantic is the only signal that the
    // returned set is archived. listSessions() must mark these rows so they
    // render as archived in BackendSessionBrowserModal.
    mockListThreads
      .mockResolvedValueOnce([
        { id: 'active-1', name: 'Active thread', updatedAt: 1_700_000_000 },
      ])
      .mockResolvedValueOnce([
        // NOTE: no `archived` field on the row — mirrors real app-server output
        { id: 'archived-no-flag', name: 'Archived without flag', updatedAt: 1_600_000_000 },
      ]);

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();

    const sessions = (await adapter.listSessions!()) as Array<Record<string, unknown>>;
    const archived = sessions.find((r) => r.id === 'archived-no-flag');
    const active = sessions.find((r) => r.id === 'active-1');
    expect(archived).toMatchObject({ id: 'archived-no-flag', archived: true });
    expect(active).toMatchObject({ id: 'active-1', archived: false });
  });

  it('returns only in-memory sessions when app-server client is unavailable', async () => {
    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();

    const id = await adapter.createSession();
    const sessions = await adapter.listSessions!();

    expect(mockListThreads).not.toHaveBeenCalled();
    expect(sessions).toHaveLength(1);
    expect((sessions[0] as Record<string, unknown>).provisionalId).toBe(id);
  });

  it('returns only in-memory sessions when app-server listThreads fails', async () => {
    mockListThreads.mockRejectedValue(new Error('app-server unavailable'));

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();

    const id = await adapter.createSession();
    const sessions = await adapter.listSessions!();

    expect(sessions).toHaveLength(1);
    expect((sessions[0] as Record<string, unknown>).provisionalId).toBe(id);
  });
});
