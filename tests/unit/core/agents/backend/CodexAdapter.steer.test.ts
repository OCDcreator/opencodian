/**
 * Real unit tests for CodexAdapter turn steering (AgentTurnSteeringCapability
 * over the app-server `turn/steer` route).
 *
 * Covers: dynamic `TurnSteering` capability declaration (app-server path
 * only, never the SDK fallback), active-turn tracking from `turn/started`,
 * session→thread aliasing, success/rejection/unavailable mapping, and the
 * -32601 dynamic capability drop.
 */

const mockRegisterServerRequestHandler = jest.fn();
const mockUnregisterServerRequestHandler = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();
const mockSteerTurn = jest.fn();
const mockStartThread = jest.fn();
const mockStartTurn = jest.fn();
const mockAddNotificationHandler = jest.fn();
const mockRemoveNotificationHandler = jest.fn();
const notificationListeners = new Map<string, ((params: unknown) => void)[]>();
let threadNotificationHandler: ((event: { method: string; params: unknown }) => void) | null = null;

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => {
  const actual = jest.requireActual('../../../../../src/core/agents/backend/CodexAppServerClient');
  return {
    ...actual,
    CodexAppServerClient: jest.fn().mockImplementation(() => ({
      start: mockAppServerClientStart,
      stop: mockAppServerClientStop,
      registerServerRequestHandler: mockRegisterServerRequestHandler,
      unregisterServerRequestHandler: mockUnregisterServerRequestHandler,
      addNotificationHandler: mockAddNotificationHandler,
      removeNotificationHandler: mockRemoveNotificationHandler,
      steerTurn: mockSteerTurn,
      startThread: mockStartThread,
      startTurn: mockStartTurn,
      subscribeToThreadNotifications: jest.fn((_threadId: string, handler: (event: { method: string; params: unknown }) => void) => {
        threadNotificationHandler = handler;
        return { dispose: jest.fn() };
      }),
      getThreadEffectiveSettings: jest.fn().mockReturnValue(null),
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue(null),
    })),
  };
});

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';

function createMockCodex(): unknown {
  return {
    startThread: jest.fn(),
    resumeThread: jest.fn(),
  };
}

function emitTurnStarted(threadId: string, turnId: string): void {
  for (const listener of notificationListeners.get('turn/started') ?? []) {
    listener({ threadId, turn: { id: turnId } });
  }
}

describe('CodexAdapter turn steering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationListeners.clear();
    threadNotificationHandler = null;
    mockAppServerClientStart.mockResolvedValue(undefined);
    mockStartThread.mockResolvedValue({ id: 'thread-new' });
    mockAddNotificationHandler.mockImplementation((method: string, listener: (params: unknown) => void) => {
      const list = notificationListeners.get(method) ?? [];
      list.push(listener);
      notificationListeners.set(method, list);
    });
  });

  function createStartedAdapter(): CodexAdapter {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    return adapter;
  }

  it('declares TurnSteering only when the app-server path is active', async () => {
    const adapter = createStartedAdapter();
    await adapter.start();
    expect(adapter.hasCapability(AgentCapability.TurnSteering)).toBe(true);
    expect(adapter.hasCapability(AgentCapability.Context)).toBe(true);
    await adapter.stop();

    const sdkOnly = new CodexAdapter({
      createAppServerClient: () => null,
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await sdkOnly.start();
    expect(sdkOnly.hasCapability(AgentCapability.TurnSteering)).toBe(false);
    await sdkOnly.stop();
  });

  it('tracks the active turn id from turn/started and steers with it', async () => {
    const adapter = createStartedAdapter();
    await adapter.start();
    mockSteerTurn.mockResolvedValue({ ok: true, turnId: 'turn-1' });

    // No active turn yet → false.
    await expect(adapter.steerTurn('thread-1', 'focus on the tests')).resolves.toBe(false);
    expect(mockSteerTurn).not.toHaveBeenCalled();

    emitTurnStarted('thread-1', 'turn-1');

    await expect(adapter.steerTurn('thread-1', 'focus on the tests')).resolves.toBe(true);
    expect(mockSteerTurn).toHaveBeenCalledWith('thread-1', 'turn-1', [{ type: 'text', text: 'focus on the tests' }]);
    await adapter.stop();
  });

  it('steers a provisional session through the thread alias established by a turn', async () => {
    const adapter = createStartedAdapter();
    await adapter.start();
    mockStartThread.mockResolvedValue({ id: 'thread-1' });
    mockStartTurn.mockImplementation(async () => {
      setTimeout(() => {
        threadNotificationHandler?.({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1' } } });
      }, 0);
      return { id: 'turn-1' };
    });
    mockSteerTurn.mockResolvedValue({ ok: true, turnId: 'turn-1' });

    const sessionId = await adapter.createSession();
    for await (const chunk of adapter.sendMessage({ sessionId, content: 'start' })) {
      if (chunk.type === 'error') {
        throw new Error(chunk.content);
      }
    }
    emitTurnStarted('thread-1', 'turn-1');

    await expect(adapter.steerTurn(sessionId, 'hello')).resolves.toBe(true);
    expect(mockSteerTurn).toHaveBeenCalledWith('thread-1', 'turn-1', [{ type: 'text', text: 'hello' }]);
    await adapter.stop();
  });

  it('returns false and keeps the capability on a server rejection', async () => {
    const adapter = createStartedAdapter();
    await adapter.start();
    emitTurnStarted('thread-1', 'turn-1');
    mockSteerTurn.mockResolvedValue({
      ok: false,
      reason: 'rejected',
      error: { code: 'active_turn_not_steerable', message: 'turn is not steerable' },
    });

    await expect(adapter.steerTurn('thread-1', 'inject')).resolves.toBe(false);
    expect(adapter.hasCapability(AgentCapability.TurnSteering)).toBe(true);
    await adapter.stop();
  });

  it('drops the TurnSteering capability and notifies on route unavailability', async () => {
    const adapter = createStartedAdapter();
    const capabilityChanges: Array<ReadonlySet<AgentCapability>> = [];
    adapter.onCapabilitiesChange((caps) => capabilityChanges.push(caps));
    await adapter.start();
    emitTurnStarted('thread-1', 'turn-1');
    mockSteerTurn.mockResolvedValue({ ok: false, reason: 'unavailable', errorReason: 'Method not found' });

    await expect(adapter.steerTurn('thread-1', 'inject')).resolves.toBe(false);
    expect(adapter.hasCapability(AgentCapability.TurnSteering)).toBe(false);
    expect(capabilityChanges.length).toBeGreaterThan(0);
    expect(capabilityChanges[capabilityChanges.length - 1].has(AgentCapability.TurnSteering)).toBe(false);
    await adapter.stop();
  });

  it('steerTurn returns false on the SDK fallback path even with a tracked turn', async () => {
    const adapter = new CodexAdapter({
      createAppServerClient: () => null,
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();
    await expect(adapter.steerTurn('thread-1', 'inject')).resolves.toBe(false);
    expect(mockSteerTurn).not.toHaveBeenCalled();
    await adapter.stop();
  });
});
