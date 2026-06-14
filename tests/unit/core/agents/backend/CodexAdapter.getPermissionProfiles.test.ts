import type { execFile as ExecFileFn } from 'node:child_process';

const mockExecFile = jest.fn<void, Parameters<typeof ExecFileFn>>();

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  execFile: (...args: Parameters<typeof ExecFileFn>) => mockExecFile(...args),
}));

import { CodexAdapter } from '../../../../../src/core/agents/backend';

// Mock the CodexAppServerClient
const mockListPermissionProfiles = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => ({
  CodexAppServerClient: jest.fn().mockImplementation(() => ({
    start: mockAppServerClientStart,
    stop: mockAppServerClientStop,
    listThreads: jest.fn().mockResolvedValue([]),
    readThread: jest.fn().mockResolvedValue(null),
    listPermissionProfiles: mockListPermissionProfiles,
  })),
}));

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

describe('CodexAdapter.getPermissionProfiles', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    mockListPermissionProfiles.mockReset();
    mockAppServerClientStart.mockClear();
  });

  it('returns profiles from app-server client when available', async () => {
    const mockProfiles = [
      { id: 'default', description: 'Default profile' },
      { id: 'strict', description: 'Strict profile' },
    ];
    mockListPermissionProfiles.mockResolvedValue(mockProfiles);

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.getPermissionProfiles();

    expect(result).toEqual(mockProfiles);
    expect(mockListPermissionProfiles).toHaveBeenCalled();
  });

  it('returns null when app-server client is not initialized', async () => {
    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    // No codexPathOverride means no appServerClient
    const result = await adapter.getPermissionProfiles();

    expect(result).toBeNull();
  });

  it('returns null when app-server client fails', async () => {
    mockListPermissionProfiles.mockRejectedValue(new Error('App-server error'));

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.getPermissionProfiles();

    expect(result).toBeNull();
  });

  it('returns null when app-server returns empty array', async () => {
    mockListPermissionProfiles.mockResolvedValue([]);

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.getPermissionProfiles();

    expect(result).toBeNull();
  });

  it('passes optional cwd to app-server client', async () => {
    const mockProfiles = [{ id: 'default' }];
    mockListPermissionProfiles.mockResolvedValue(mockProfiles);

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      workingDirectory: '/some/workspace',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    await adapter.getPermissionProfiles();

    expect(mockListPermissionProfiles).toHaveBeenCalledWith({ cwd: '/some/workspace' });
  });
});
