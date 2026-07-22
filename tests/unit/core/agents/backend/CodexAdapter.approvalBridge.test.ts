/**
 * Real unit tests for CodexAdapter server-request approval bridge wiring.
 *
 * The app-server delivers approvals as server-initiated JSON-RPC requests
 * (method + id) via the `ServerRequest` union. CodexAppServerClient already
 * three-way dispatches those to registered handlers (see
 * CodexAppServerClient.serverRequests.test.ts). These tests prove the
 * adapter-layer wiring slice: how an `execCommandApproval` /
 * `applyPatchApproval` request reaches a UI-facing host callback and how the
 * decision is translated back into the `{ decision: ReviewDecision }` reply
 * payload the bridge sends.
 *
 * The Codex approval model is async server-push (distinct from Claude Code's
 * synchronous inline canUseTool bridge), so the wiring uses a host-callback
 * seam set via `setApprovalHost`.
 */

const mockRegisterServerRequestHandler = jest.fn();
const mockUnregisterServerRequestHandler = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => ({
  CodexAppServerClient: jest.fn().mockImplementation(() => ({
    start: mockAppServerClientStart,
    stop: mockAppServerClientStop,
    registerServerRequestHandler: mockRegisterServerRequestHandler,
    unregisterServerRequestHandler: mockUnregisterServerRequestHandler,
    listThreads: jest.fn().mockResolvedValue([]),
    readThread: jest.fn().mockResolvedValue(null),
  })),
}));

import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';

function createMockCodex(): unknown {
  const mockThread = {
    id: 'mock-thread-1',
    runStreamed: jest.fn(),
    run: jest.fn(),
  };
  return {
    startThread: jest.fn().mockReturnValue(mockThread),
    resumeThread: jest.fn().mockReturnValue(mockThread),
  };
}

/** Extract the handler registered for a given method, if any. */
function registeredHandler(method: string): ((params: unknown) => unknown) | undefined {
  for (const call of mockRegisterServerRequestHandler.mock.calls) {
    if (call[0] === method) {
      return call[1] as (params: unknown) => unknown;
    }
  }
  return undefined;
}

describe('CodexAdapter approval bridge wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppServerClientStart.mockResolvedValue(undefined);
    mockAppServerClientStop.mockClear();
    mockRegisterServerRequestHandler.mockClear();
    mockUnregisterServerRequestHandler.mockClear();
  });

  it('registers execCommandApproval and applyPatchApproval handlers after start when an approval host is set first', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    adapter.setApprovalHost({ collectApproval: jest.fn().mockResolvedValue(null) });
    await adapter.start();

    const methods = mockRegisterServerRequestHandler.mock.calls.map((c) => c[0]);
    expect(methods).toContain('execCommandApproval');
    expect(methods).toContain('applyPatchApproval');
  });

  it('registers handlers immediately when the host is set after start', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();
    expect(mockRegisterServerRequestHandler).not.toHaveBeenCalled();

    adapter.setApprovalHost({ collectApproval: jest.fn().mockResolvedValue(null) });

    expect(mockRegisterServerRequestHandler).toHaveBeenCalledWith('execCommandApproval', expect.any(Function));
    expect(mockRegisterServerRequestHandler).toHaveBeenCalledWith('applyPatchApproval', expect.any(Function));
  });

  it('does not register handlers when no approval host is set', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();

    expect(mockRegisterServerRequestHandler).not.toHaveBeenCalled();
  });

  it('does not register handlers when there is no app-server client', async () => {
    const adapter = new CodexAdapter({
      createAppServerClient: () => null,
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    adapter.setApprovalHost({ collectApproval: jest.fn().mockResolvedValue(null) });
    await adapter.start();

    expect(mockRegisterServerRequestHandler).not.toHaveBeenCalled();
  });

  it('normalizes execCommandApproval params into a UI request with command and cwd', async () => {
    const collectApproval = jest.fn().mockResolvedValue({ decision: 'approved' });
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    adapter.setApprovalHost({ collectApproval });
    await adapter.start();

    const handler = registeredHandler('execCommandApproval');
    expect(handler).toBeDefined();

    await handler!({ command: ['ls', '-la'], cwd: '/tmp' });

    expect(collectApproval).toHaveBeenCalledTimes(1);
    const request = collectApproval.mock.calls[0][0] as Record<string, unknown>;
    expect(request.kind).toBe('execCommand');
    expect(request.command).toBe('ls -la');
    expect(request.cwd).toBe('/tmp');
  });

  it('normalizes applyPatchApproval params into a UI request with change count', async () => {
    const collectApproval = jest.fn().mockResolvedValue({ decision: 'denied' });
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    adapter.setApprovalHost({ collectApproval });
    await adapter.start();

    const handler = registeredHandler('applyPatchApproval');
    expect(handler).toBeDefined();

    await handler!({ changes: [{ path: '/a.ts' }, { path: '/b.ts' }] });

    expect(collectApproval).toHaveBeenCalledTimes(1);
    const request = collectApproval.mock.calls[0][0] as Record<string, unknown>;
    expect(request.kind).toBe('applyPatch');
    expect(request.changeCount).toBe(2);
  });

  it('translates an approved host decision into { decision: "approved" }', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    adapter.setApprovalHost({ collectApproval: jest.fn().mockResolvedValue({ decision: 'approved' }) });
    await adapter.start();

    const result = await registeredHandler('execCommandApproval')!({ command: ['ls'], cwd: '/tmp' });

    expect(result).toEqual({ decision: 'approved' });
  });

  it('translates an approved_for_session host decision', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    adapter.setApprovalHost({
      collectApproval: jest.fn().mockResolvedValue({ decision: 'approved_for_session' }),
    });
    await adapter.start();

    const result = await registeredHandler('applyPatchApproval')!({ changes: [] });

    expect(result).toEqual({ decision: 'approved_for_session' });
  });

  it('translates a denied host decision', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    adapter.setApprovalHost({ collectApproval: jest.fn().mockResolvedValue({ decision: 'denied' }) });
    await adapter.start();

    const result = await registeredHandler('execCommandApproval')!({ command: ['rm'], cwd: '/' });

    expect(result).toEqual({ decision: 'denied' });
  });

  it('defaults to denied when the host returns null (cancelled)', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    adapter.setApprovalHost({ collectApproval: jest.fn().mockResolvedValue(null) });
    await adapter.start();

    const result = await registeredHandler('execCommandApproval')!({ command: ['ls'], cwd: '/tmp' });

    expect(result).toEqual({ decision: 'denied' });
  });

  it('defaults to denied when no host callback is available', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    adapter.setApprovalHost({ collectApproval: jest.fn().mockResolvedValue(null) });
    await adapter.start();

    // Simulate host losing its callback after wiring (e.g. view disposed).
    adapter.setApprovalHost({});

    const result = await registeredHandler('execCommandApproval')!({ command: ['ls'], cwd: '/tmp' });

    expect(result).toEqual({ decision: 'denied' });
  });

  it('unregisters approval handlers on stop', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    adapter.setApprovalHost({ collectApproval: jest.fn().mockResolvedValue(null) });
    await adapter.start();

    await adapter.stop();

    expect(mockUnregisterServerRequestHandler).toHaveBeenCalledWith('execCommandApproval');
    expect(mockUnregisterServerRequestHandler).toHaveBeenCalledWith('applyPatchApproval');
  });
});
