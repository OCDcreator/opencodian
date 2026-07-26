/** G10b adapter readback: unavailable/failed/empty must remain distinguishable. */

const mockListHooks = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => ({
  CodexAppServerClient: jest.fn().mockImplementation(() => ({
    start: mockAppServerClientStart,
    stop: mockAppServerClientStop,
    listHooks: mockListHooks,
  })),
}));

import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';

function createMockCodex() {
  const thread = { id: 'thread-1', runStreamed: jest.fn(), run: jest.fn() };
  return {
    startThread: jest.fn().mockReturnValue(thread),
    resumeThread: jest.fn().mockReturnValue(thread),
  };
}

describe('CodexAdapter.getHooksReadback', () => {
  beforeEach(() => {
    mockListHooks.mockReset();
    mockAppServerClientStart.mockClear();
    mockAppServerClientStop.mockClear();
  });

  it('passes the working directory as a single cwd and preserves an available result', async () => {
    const outcome = { status: 'available', groups: [{ cwd: '/vault', hooks: [], warnings: ['warning'], errors: [] }] } as const;
    mockListHooks.mockResolvedValue(outcome);
    const adapter = new CodexAdapter({
      workingDirectory: '/vault',
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });

    await adapter.start();
    await expect(adapter.getHooksReadback()).resolves.toBe(outcome);
    expect(mockListHooks).toHaveBeenCalledWith({ cwds: ['/vault'] });
  });

  it.each([
    { status: 'empty', groups: [] },
    { status: 'unavailable', groups: [], errorReason: 'route unavailable' },
    { status: 'failed', groups: [], errorReason: 'request timeout' },
    { status: 'malformed', groups: [], errorReason: 'invalid response' },
  ] as const)('does not collapse $status into an empty array', async (outcome) => {
    mockListHooks.mockResolvedValue(outcome);
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });

    await adapter.start();
    await expect(adapter.getHooksReadback()).resolves.toEqual(outcome);
  });

  it('returns unavailable when no app-server client was negotiated', async () => {
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
      createAppServerClient: () => null,
    });

    await adapter.start();
    await expect(adapter.getHooksReadback()).resolves.toEqual({ status: 'unavailable', groups: [] });
    expect(mockListHooks).not.toHaveBeenCalled();
  });

  it('converts an unexpected client rejection to failed without exposing raw JSON', async () => {
    mockListHooks.mockRejectedValue(new Error('JSON-RPC error -32600: malformed request'));
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });

    await adapter.start();
    await expect(adapter.getHooksReadback()).resolves.toEqual({
      status: 'failed',
      groups: [],
      errorReason: 'JSON-RPC error -32600: malformed request',
    });
  });
});
