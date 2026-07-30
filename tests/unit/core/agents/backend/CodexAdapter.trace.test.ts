import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';
import type { CodexTraceContext,CodexTracePort } from '../../../../../src/core/agents/backend/diagnostics/types';

let notificationHandler: ((event: { method: string; params: unknown }) => void) | null = null;
const mockClient = {
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn(),
  startThread: jest.fn().mockResolvedValue({ id: 'thread-1', turns: [] }),
  resumeThread: jest.fn().mockResolvedValue({ id: 'thread-1', turns: [] }),
  startTurn: jest.fn().mockResolvedValue({ id: 'turn-1', items: [] }),
  interruptTurn: jest.fn().mockResolvedValue(true),
  subscribeToThreadNotifications: jest.fn((_id: string, handler: typeof notificationHandler) => {
    notificationHandler = handler;
    return { dispose: jest.fn() };
  }),
  getThreadEffectiveSettings: jest.fn().mockReturnValue(null),
  registerServerRequestHandler: jest.fn(),
};

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => {
  const actual = jest.requireActual('../../../../../src/core/agents/backend/CodexAppServerClient');
  return { ...actual, CodexAppServerClient: jest.fn(() => mockClient) };
});

function createFakeTracePort(): jest.Mocked<CodexTracePort> {
  const context: CodexTraceContext = { traceId: 'trace-x', runtimeSegmentId: 'seg-x', threadId: 'thread-1' };
  return {
    bindThread: jest.fn(() => context),
    beginTurn: jest.fn(() => context),
    recordTurnNotification: jest.fn(),
    recordStreamSync: jest.fn(),
    recordToolInteraction: jest.fn(),
    recordLifecycle: jest.fn(),
    recordWireEvent: jest.fn(),
    recordServiceOutput: jest.fn(),
    finishTurn: jest.fn(),
    markAnomaly: jest.fn(),
    armDeepCapture: jest.fn(),
    cancelDeepCapture: jest.fn(),
    claimDeepCapture: jest.fn(),
    getCaptureState: jest.fn(() => 'off'),
  } as unknown as jest.Mocked<CodexTracePort>;
}

describe('CodexAdapter trace instrumentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationHandler = null;
  });

  it('binds the thread and records turn lifecycle over an app-server send', async () => {
    const tracePort = createFakeTracePort();
    const adapter = new CodexAdapter({ tracePort, approvalPolicy: 'never', createCodex: jest.fn().mockResolvedValue({}) });
    await adapter.start();
    const sessionId = await adapter.createSession();
    const chunks: unknown[] = [];
    const consume = (async () => { for await (const chunk of adapter.sendMessage({ sessionId, content: 'hi' })) chunks.push(chunk); })();
    await new Promise((resolve) => setTimeout(resolve, 0));
    notificationHandler?.({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', items: [] } } });
    await consume;
    expect(tracePort.bindThread).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread-1', via: 'app-server' }));
    expect(tracePort.beginTurn).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread-1', turnId: 'turn-1' }));
    expect(tracePort.recordTurnNotification).toHaveBeenCalledWith(expect.anything(), 'turn/completed', expect.anything());
    expect(tracePort.finishTurn).toHaveBeenCalledWith(expect.anything(), 'completed', undefined);
  });

  it('finishes the turn as error when turn/completed carries an error', async () => {
    const tracePort = createFakeTracePort();
    const adapter = new CodexAdapter({ tracePort, approvalPolicy: 'never', createCodex: jest.fn().mockResolvedValue({}) });
    await adapter.start();
    const sessionId = await adapter.createSession();
    const consume = (async () => { for await (const chunk of adapter.sendMessage({ sessionId, content: 'hi' })) { void chunk; } })();
    await new Promise((resolve) => setTimeout(resolve, 0));
    notificationHandler?.({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', items: [], error: { message: 'boom' } } } });
    await consume;
    expect(tracePort.finishTurn).toHaveBeenCalledWith(expect.anything(), 'error', expect.objectContaining({ error: 'boom' }));
  });

  it('works without a tracePort (no-op path unchanged)', async () => {
    const adapter = new CodexAdapter({ approvalPolicy: 'never', createCodex: jest.fn().mockResolvedValue({}) });
    await adapter.start();
    const sessionId = await adapter.createSession();
    const consume = (async () => { for await (const chunk of adapter.sendMessage({ sessionId, content: 'hi' })) { void chunk; } })();
    await new Promise((resolve) => setTimeout(resolve, 0));
    notificationHandler?.({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', items: [] } } });
    await expect(consume).resolves.toBeUndefined();
  });
});
