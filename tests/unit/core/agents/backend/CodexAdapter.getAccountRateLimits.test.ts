import type { execFile as ExecFileFn } from 'node:child_process';

const mockExecFile = jest.fn<void, Parameters<typeof ExecFileFn>>();

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  execFile: (...args: Parameters<typeof ExecFileFn>) => mockExecFile(...args),
}));

import { CodexAdapter } from '../../../../../src/core/agents/backend';

// Mock the CodexAppServerClient
const mockGetAccountRateLimits = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => ({
  CodexAppServerClient: jest.fn().mockImplementation(() => ({
    start: mockAppServerClientStart,
    stop: mockAppServerClientStop,
    listThreads: jest.fn().mockResolvedValue([]),
    readThread: jest.fn().mockResolvedValue(null),
    listPermissionProfiles: jest.fn().mockResolvedValue([]),
    getAccountRateLimits: mockGetAccountRateLimits,
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

describe('CodexAdapter.getAccountRateLimits', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    mockGetAccountRateLimits.mockReset();
    mockAppServerClientStart.mockClear();
  });

  it('returns rate limits from app-server client when available', async () => {
    const mockRateLimits = {
      rateLimits: {
        requests_per_minute: 60,
        tokens_per_minute: 100000,
      },
      rateLimitsByLimitId: {
        default: {
          requests_per_minute: 60,
          tokens_per_minute: 100000,
        },
      },
    };
    mockGetAccountRateLimits.mockResolvedValue(mockRateLimits);

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.getAccountRateLimits();

    expect(result).toEqual(mockRateLimits);
    expect(mockGetAccountRateLimits).toHaveBeenCalled();
  });

  it('returns null when app-server client is not initialized', async () => {
    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    // No codexPathOverride means no appServerClient
    const result = await adapter.getAccountRateLimits();

    expect(result).toBeNull();
  });

  it('returns null when app-server client fails', async () => {
    mockGetAccountRateLimits.mockRejectedValue(new Error('App-server error'));

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.getAccountRateLimits();

    expect(result).toBeNull();
  });

  it('returns null when app-server returns null', async () => {
    mockGetAccountRateLimits.mockResolvedValue(null);

    const mockCodex = createMockCodex();
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(mockCodex),
    });
    await adapter.start();
    const result = await adapter.getAccountRateLimits();

    expect(result).toBeNull();
  });
});
