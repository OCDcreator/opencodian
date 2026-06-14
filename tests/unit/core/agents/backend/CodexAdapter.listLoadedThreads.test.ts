import type { execFile as ExecFileFn } from 'node:child_process';

const mockExecFile = jest.fn<void, Parameters<typeof ExecFileFn>>();

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  execFile: (...args: Parameters<typeof ExecFileFn>) => mockExecFile(...args),
}));

import { CodexAdapter } from '../../../../../src/core/agents/backend';

const mockListLoadedThreads = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => ({
  CodexAppServerClient: jest.fn().mockImplementation(() => ({
    start: mockAppServerClientStart,
    stop: mockAppServerClientStop,
    listThreads: jest.fn().mockResolvedValue([]),
    readThread: jest.fn().mockResolvedValue(null),
    listPermissionProfiles: jest.fn().mockResolvedValue([]),
    listLoadedThreads: mockListLoadedThreads,
  })),
}));

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

describe('CodexAdapter.listLoadedThreads', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    mockListLoadedThreads.mockReset();
    mockAppServerClientStart.mockClear();
  });

  it('returns loaded threads from app-server client when available', async () => {
    mockListLoadedThreads.mockResolvedValue([
      { id: 'thread-1' },
      { id: 'thread-2' },
    ]);

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.listLoadedThreads();

    expect(result).toEqual([
      { id: 'thread-1' },
      { id: 'thread-2' },
    ]);
    expect(mockListLoadedThreads).toHaveBeenCalled();
  });

  it('returns empty array when app-server client is not initialized', async () => {
    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.listLoadedThreads();

    expect(result).toEqual([]);
  });

  it('returns empty array when app-server client fails', async () => {
    mockListLoadedThreads.mockRejectedValue(new Error('App-server error'));

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.listLoadedThreads();

    expect(result).toEqual([]);
  });

  it('returns empty array when app-server returns empty', async () => {
    mockListLoadedThreads.mockResolvedValue([]);

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.listLoadedThreads();

    expect(result).toEqual([]);
  });
});
