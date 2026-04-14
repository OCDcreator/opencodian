import {
  OpenCodeSessionLifecycleCoordinator,
  type OpenCodeSessionLifecycleCoordinatorHost,
  type OpenCodeSessionLifecycleSdk,
  type OpenCodeSessionLifecycleSyncRuntime,
  type Session,
  type SessionMessage,
} from '../../../../src/core/opencode/OpenCodeSessionLifecycleCoordinator';
import type {
  SessionActivityStatus,
  SessionSyncEventUpdate,
} from '../../../../src/core/opencode/OpenCodeSyncEventRuntimeCoordinator';
import type { SessionTodo } from '../../../../src/core/types';

type MockHost = OpenCodeSessionLifecycleCoordinatorHost & {
  shouldUseSdkCrud: jest.Mock<boolean, []>;
  getSdkSession: jest.Mock<OpenCodeSessionLifecycleSdk, []>;
  postLegacy: jest.Mock<Promise<unknown>, [string, unknown]>;
  getLegacy: jest.Mock<Promise<unknown>, [string]>;
  patchLegacy: jest.Mock<Promise<unknown>, [string, unknown]>;
  deleteLegacy: jest.Mock<Promise<void>, [string]>;
  normalizeSessionId: jest.Mock<string, [unknown]>;
  normalizeSessionMessages: jest.Mock<SessionMessage[], [unknown]>;
  normalizeSessionTodos: jest.Mock<SessionTodo[], [unknown]>;
  normalizeSessionStatuses: jest.Mock<Record<string, SessionActivityStatus>, [unknown]>;
  applySessionRevertState: jest.Mock<Promise<SessionMessage[]>, [string, SessionMessage[]]>;
  observeToolNamesInMessages: jest.Mock<void, [SessionMessage[]]>;
  logServiceWarning: jest.Mock<void, [string, string, unknown]>;
  logServiceError: jest.Mock<void, [string, string, unknown]>;
};

type MockSyncRuntime = OpenCodeSessionLifecycleSyncRuntime & {
  subscribeToSessionTodoUpdates: jest.Mock<() => void, [(update: { sessionId: string; todos: SessionTodo[] }) => void]>;
  subscribeToSessionStatusUpdates: jest.Mock<() => void, [(update: { sessionId: string; status: SessionActivityStatus }) => void]>;
  subscribeToSessionSyncEvents: jest.Mock<() => void, [(update: SessionSyncEventUpdate) => void]>;
};

function createSdk(
  overrides: Partial<jest.Mocked<OpenCodeSessionLifecycleSdk>> = {},
): jest.Mocked<OpenCodeSessionLifecycleSdk> {
  return {
    create: jest.fn(),
    list: jest.fn(),
    messages: jest.fn(),
    todo: jest.fn(),
    status: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    ...overrides,
  };
}

function createHost(
  sdk: jest.Mocked<OpenCodeSessionLifecycleSdk>,
  overrides: Partial<MockHost> = {},
): MockHost {
  return {
    shouldUseSdkCrud: jest.fn(() => true),
    getSdkSession: jest.fn(() => sdk),
    postLegacy: jest.fn(),
    getLegacy: jest.fn(),
    patchLegacy: jest.fn(),
    deleteLegacy: jest.fn(),
    normalizeSessionId: jest.fn((response) => (response as { id: string }).id),
    normalizeSessionMessages: jest.fn((response) => response as SessionMessage[]),
    normalizeSessionTodos: jest.fn((response) => response as SessionTodo[]),
    normalizeSessionStatuses: jest.fn((response) => response as Record<string, SessionActivityStatus>),
    applySessionRevertState: jest.fn(async (_sessionId, messages) => messages),
    observeToolNamesInMessages: jest.fn(),
    logServiceWarning: jest.fn(),
    logServiceError: jest.fn(),
    ...overrides,
  } as MockHost;
}

function createSyncRuntime(overrides: Partial<MockSyncRuntime> = {}): MockSyncRuntime {
  return {
    subscribeToSessionTodoUpdates: jest.fn(() => jest.fn()),
    subscribeToSessionStatusUpdates: jest.fn(() => jest.fn()),
    subscribeToSessionSyncEvents: jest.fn(() => jest.fn()),
    ...overrides,
  } as MockSyncRuntime;
}

describe('OpenCodeSessionLifecycleCoordinator', () => {
  it('creates sessions across transports and tracks the current session id', async () => {
    const sdk = createSdk({
      create: jest.fn().mockResolvedValue({ id: 'sdk-session' }),
    });
    const host = createHost(sdk);
    const coordinator = new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime());

    await expect(coordinator.createSession('Test')).resolves.toBe('sdk-session');
    expect(sdk.create).toHaveBeenCalledWith({ title: 'Test' });
    expect(coordinator.getSessionId()).toBe('sdk-session');

    coordinator.setSessionId('manual-session');
    host.shouldUseSdkCrud.mockReturnValue(false);
    host.postLegacy.mockResolvedValue({ id: 'legacy-session' });

    await expect(coordinator.createSession(undefined, { setCurrent: false })).resolves.toBe('legacy-session');
    expect(host.postLegacy).toHaveBeenCalledWith('/session', { title: 'New Conversation' });
    expect(coordinator.getSessionId()).toBe('manual-session');
  });

  it('falls back to legacy listing when SDK reads fail', async () => {
    const sdk = createSdk({
      list: jest.fn().mockRejectedValue(new Error('sdk read failed')),
    });
    const legacySessions: Session[] = [
      {
        id: 'legacy-session',
        title: 'Legacy',
        time: { created: 1, updated: 2 },
      },
    ];
    const host = createHost(sdk, {
      getLegacy: jest.fn().mockResolvedValue(legacySessions),
    });
    const coordinator = new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime());

    await expect(coordinator.listSessions()).resolves.toEqual(legacySessions);
    expect(host.logServiceWarning).toHaveBeenCalledWith(
      'session.list',
      'SDK session.list failed, falling back to legacy HTTP',
      expect.any(Error),
    );
    expect(host.getLegacy).toHaveBeenCalledWith('/session');
  });

  it('loads SDK session messages through revert filtering and tool observation', async () => {
    const rawMessages: SessionMessage[] = [
      {
        info: {
          id: 'msg-1',
          sessionID: 'session-1',
          role: 'assistant',
          time: { created: 1 },
        },
        parts: [],
      },
    ];
    const filteredMessages: SessionMessage[] = [
      {
        info: {
          id: 'msg-0',
          sessionID: 'session-1',
          role: 'user',
          time: { created: 0 },
        },
        parts: [],
      },
    ];
    const sdk = createSdk({
      messages: jest.fn().mockResolvedValue(rawMessages),
    });
    const host = createHost(sdk, {
      normalizeSessionMessages: jest.fn(() => rawMessages),
      applySessionRevertState: jest.fn().mockResolvedValue(filteredMessages),
    });
    const coordinator = new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime());

    await expect(coordinator.getSessionMessages('session-1')).resolves.toEqual(filteredMessages);
    expect(sdk.messages).toHaveBeenCalledWith({ sessionID: 'session-1' });
    expect(host.applySessionRevertState).toHaveBeenCalledWith('session-1', rawMessages);
    expect(host.observeToolNamesInMessages).toHaveBeenCalledWith(filteredMessages);
  });

  it('falls back to legacy todo and status reads when SDK reads fail', async () => {
    const normalizedTodos: SessionTodo[] = [
      { content: 'Inspect lifecycle', status: 'in_progress', priority: 'high' },
    ];
    const normalizedStatuses: Record<string, SessionActivityStatus> = {
      'session-1': { type: 'busy' },
    };
    const sdk = createSdk({
      todo: jest.fn().mockRejectedValue(new Error('todo read failed')),
      status: jest.fn().mockRejectedValue(new Error('status read failed')),
    });
    const host = createHost(sdk, {
      getLegacy: jest.fn()
        .mockResolvedValueOnce([{ content: 'Inspect lifecycle', status: 'in_progress', priority: 'high' }])
        .mockResolvedValueOnce({ 'session-1': { type: 'busy' } }),
      normalizeSessionTodos: jest.fn(() => normalizedTodos),
      normalizeSessionStatuses: jest.fn(() => normalizedStatuses),
    });
    const coordinator = new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime());

    await expect(coordinator.getSessionTodos('session-1')).resolves.toEqual(normalizedTodos);
    await expect(coordinator.getSessionStatuses()).resolves.toEqual(normalizedStatuses);
    expect(host.getLegacy).toHaveBeenNthCalledWith(1, '/session/session-1/todo');
    expect(host.getLegacy).toHaveBeenNthCalledWith(2, '/session/status');
    expect(host.logServiceWarning).toHaveBeenCalledTimes(2);
  });

  it('uses legacy mutation transport for delete and update when SDK CRUD is disabled', async () => {
    const sdk = createSdk();
    const host = createHost(sdk, {
      shouldUseSdkCrud: jest.fn(() => false),
      deleteLegacy: jest.fn().mockResolvedValue(undefined),
      patchLegacy: jest.fn().mockResolvedValue(undefined),
    });
    const coordinator = new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime());
    coordinator.setSessionId('session-1');

    await expect(coordinator.deleteSession('session-1')).resolves.toBeUndefined();
    await expect(coordinator.updateSessionTitle('session-2', 'Renamed')).resolves.toBeUndefined();

    expect(host.deleteLegacy).toHaveBeenCalledWith('/session/session-1');
    expect(host.patchLegacy).toHaveBeenCalledWith('/session/session-2', { title: 'Renamed' });
    expect(coordinator.getSessionId()).toBeNull();
  });

  it('forwards session subscriptions through the shared sync runtime', () => {
    const sdk = createSdk();
    const disposeTodo = jest.fn();
    const disposeStatus = jest.fn();
    const disposeSync = jest.fn();
    const syncRuntime = createSyncRuntime({
      subscribeToSessionTodoUpdates: jest.fn(() => disposeTodo),
      subscribeToSessionStatusUpdates: jest.fn(() => disposeStatus),
      subscribeToSessionSyncEvents: jest.fn(() => disposeSync),
    });
    const coordinator = new OpenCodeSessionLifecycleCoordinator(createHost(sdk), syncRuntime);

    expect(coordinator.subscribeToSessionTodoUpdates(jest.fn())).toBe(disposeTodo);
    expect(coordinator.subscribeToSessionStatusUpdates(jest.fn())).toBe(disposeStatus);
    expect(coordinator.subscribeToSessionSyncEvents(jest.fn())).toBe(disposeSync);
    expect(syncRuntime.subscribeToSessionTodoUpdates).toHaveBeenCalledTimes(1);
    expect(syncRuntime.subscribeToSessionStatusUpdates).toHaveBeenCalledTimes(1);
    expect(syncRuntime.subscribeToSessionSyncEvents).toHaveBeenCalledTimes(1);
  });
});
