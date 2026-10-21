/* eslint-disable max-lines-per-function -- Session lifecycle tests keep transport fallback cases together to share the host fixture. */
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
import { BackendSessionCatalogReadError } from '../../../../src/shared/sessionCatalogReadback';

type MockHost = OpenCodeSessionLifecycleCoordinatorHost & {
  shouldUseSdkAbort: jest.Mock<boolean, []>;
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
  applyCanonicalSnapshot: jest.Mock<SessionMessage[], [string, SessionMessage[]]>;
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
    abort: jest.fn(),
    create: jest.fn(),
    get: jest.fn(),
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
    shouldUseSdkAbort: jest.fn(() => true),
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
    beginCanonicalSnapshot: jest.fn(() => ({ revision: 0, request: 1, owner: {} })),
    applyCanonicalSnapshot: jest.fn((_sessionId, messages) => messages),
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

describe('matrix006 OpenCode session catalog negative controls', () => {
  it('preserves first-admitted duplicate values and order across three cursor pages', async () => {
    const sdk = createSdk();
    const host = createHost(sdk);
    const first = [{ id: 'z', title: 'first-z' }, { id: 'a', title: 'first-a' }];
    const read = jest.fn().mockResolvedValueOnce({ data: first, nextCursor: 'page-2' })
      .mockResolvedValueOnce({ data: [{ id: 'a', title: 'late-a' }, { id: 'm', title: 'first-m' }], nextCursor: 'page-3' })
      .mockResolvedValueOnce({ data: [{ id: 'z', title: 'late-z' }, { id: 'b', title: 'first-b' }], nextCursor: null });
    Object.assign(host, { readSdkSessionCatalogPage: read });
    await expect(new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime()).listSessions())
      .resolves.toEqual([...first, { id: 'm', title: 'first-m' }, { id: 'b', title: 'first-b' }]);
    expect(read.mock.calls).toEqual([[{ limit: 100 }], [{ limit: 100, cursor: 'page-2' }], [{ limit: 100, cursor: 'page-3' }]]);
    expect(sdk.list).not.toHaveBeenCalled();
    expect(host.getLegacy).not.toHaveBeenCalled();
  });

  it.each(['denied', 'read-failed', 'method-absent', 'missing-cursor'])('retains page-2 data and failed cursor for %s without fallback', async (failure) => {
    const sdk = createSdk();
    const host = createHost(sdk);
    const admitted = [{ id: 'first', title: 'admitted' }];
    const extra = [{ id: 'second', title: 'admitted-before-cursor-check' }];
    const read = jest.fn().mockResolvedValueOnce({ data: admitted, nextCursor: 'failed-page-2' });
    if (failure === 'missing-cursor') read.mockResolvedValueOnce({ data: extra });
    else read.mockRejectedValueOnce(Object.assign(new Error('FAKE-MATRIX006-PRIVATE-ERROR'), {
      status: failure === 'denied' ? 403 : failure === 'method-absent' ? 404 : 500,
    }));
    const legacy = jest.fn();
    Object.assign(host, { readSdkSessionCatalogPage: read, readLegacySessionCatalogPage: legacy });
    const error = await new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime()).listSessions().catch(value => value);
    expect(error).toBeInstanceOf(BackendSessionCatalogReadError);
    expect(error.result).toEqual({ status: 'partial', data: failure === 'missing-cursor' ? [...admitted, ...extra] : admitted,
      nextCursor: 'failed-page-2', errorReason: failure === 'denied' ? 'Permission denied'
        : failure === 'method-absent' ? 'Session catalog is unavailable'
        : failure === 'missing-cursor' ? 'Invalid session catalog cursor' : 'Session catalog read failed' });
    expect(read.mock.calls).toEqual([[{ limit: 100 }], [{ limit: 100, cursor: 'failed-page-2' }]]);
    expect(legacy).not.toHaveBeenCalled();
    expect(sdk.list).not.toHaveBeenCalled();
    expect(host.getLegacy).not.toHaveBeenCalled();
    expect(error.message).not.toContain('FAKE-MATRIX006-PRIVATE-ERROR');
  });

  it.each(['empty', 'read-failed', 'denied', 'method-absent'])('distinguishes authoritative empty from %s on the first page', async (outcome) => {
    const failure = Object.assign(new Error('FAKE-MATRIX006-PRIVATE-ERROR'), {
      status: outcome === 'denied' ? 401 : outcome === 'method-absent' ? 404 : 500,
    });
    const sdk = createSdk({ list: jest.fn().mockRejectedValue(failure) });
    const host = createHost(sdk);
    const read = outcome === 'empty' ? jest.fn().mockResolvedValue({ data: [], nextCursor: null }) : jest.fn().mockRejectedValue(failure);
    const legacy = jest.fn().mockRejectedValue(failure);
    const fallback = jest.fn().mockRejectedValue(failure);
    Object.assign(host, { readSdkSessionCatalogPage: read, readLegacySessionCatalogPage: legacy, readLegacySessionCatalogFallback: fallback });
    const result = await new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime()).listSessions()
      .then(data => ({ data, error: null }), (error: BackendSessionCatalogReadError) => ({ data: null, error }));
    expect(result.data).toEqual(outcome === 'empty' ? [] : null);
    const catalogErrorMatcher = expect.any(BackendSessionCatalogReadError);
    expect(result.error).toEqual(outcome === 'empty' ? null : catalogErrorMatcher);
    expect(result.error?.result ?? null).toEqual(outcome === 'empty' ? null : {
      status: outcome === 'method-absent' ? 'unavailable' : 'failed', data: [], nextCursor: null,
      errorReason: outcome === 'denied' ? 'Permission denied' : outcome === 'method-absent' ? 'Session catalog is unavailable' : 'Session catalog read failed',
    });
    expect(result.error?.message ?? '').not.toContain('FAKE-MATRIX006-PRIVATE-ERROR');
    expect(legacy.mock.calls).toEqual(outcome === 'empty' ? [] : [[{ limit: 100 }]]);
    expect(read.mock.calls).toEqual([[{ limit: 100 }]]);
    expect(sdk.list.mock.calls).toEqual(outcome === 'method-absent' ? [[{ limit: 1000 }]] : []);
    expect(fallback).toHaveBeenCalledTimes(outcome === 'method-absent' ? 1 : 0);
    expect(host.getLegacy).not.toHaveBeenCalled();
  });
});

describe('OpenCodeSessionLifecycleCoordinator', () => {
  it('retains valid rows from a malformed page without requesting later pages', async () => {
    const host = createHost(createSdk());
    const read = jest.fn().mockResolvedValue({ data: [{ id: 'valid' }, { id: '' }, null], nextCursor: 'later' });
    Object.assign(host, { readSdkSessionCatalogPage: read });
    await expect(new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime()).listSessions())
      .rejects.toMatchObject({ result: { status: 'partial', data: [{ id: 'valid' }], errorReason: 'Invalid session catalog response' } });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('uses cursor pagination when the SDK rollout is disabled', async () => {
    const host = createHost(createSdk(), { shouldUseSdkCrud: jest.fn(() => false) });
    const sdkRead = jest.fn();
    const legacyRead = jest.fn().mockResolvedValueOnce({ data: [{ id: 'one' }], nextCursor: 'next' })
      .mockResolvedValueOnce({ data: [{ id: 'two' }], nextCursor: null });
    Object.assign(host, { readSdkSessionCatalogPage: sdkRead, readLegacySessionCatalogPage: legacyRead });
    await expect(new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime()).listSessions())
      .resolves.toEqual([{ id: 'one' }, { id: 'two' }]);
    expect(sdkRead).not.toHaveBeenCalled();
  });

  it('bounds an endless stream of new cursors and retains the next cursor', async () => {
    const host = createHost(createSdk());
    let index = 0;
    const read = jest.fn().mockImplementation(async () => ({ data: [{ id: 's-' + index }], nextCursor: 'c-' + ++index }));
    Object.assign(host, { readSdkSessionCatalogPage: read });
    await expect(new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime()).listSessions())
      .rejects.toMatchObject({ result: { status: 'partial', nextCursor: 'c-100', errorReason: 'Session catalog page limit exceeded' } });
    expect(read).toHaveBeenCalledTimes(100);
  });

  it('reads every cursor page and deduplicates native ids', async () => {
    const host = createHost(createSdk());
    const rows = Array.from({ length: 205 }, (_, i) => ({ id: 's-' + i, title: 'Session', time: { created: i, updated: i } }));
    const read = jest.fn().mockResolvedValueOnce({ data: rows.slice(0, 100), nextCursor: 'c1' })
      .mockResolvedValueOnce({ data: rows.slice(99, 199), nextCursor: 'c2' })
      .mockResolvedValueOnce({ data: rows.slice(199), nextCursor: null });
    Object.assign(host, { readSdkSessionCatalogPage: read });
    const coordinator = new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime());
    await expect(coordinator.listSessions()).resolves.toEqual(rows);
    expect(read.mock.calls).toEqual([[{ limit: 100 }], [{ limit: 100, cursor: 'c1' }], [{ limit: 100, cursor: 'c2' }]]);
  });

  it('retains admitted rows and the failed cursor after a permission failure', async () => {
    const host = createHost(createSdk());
    const rows = [{ id: 's-1', title: 'Session', time: { created: 1, updated: 1 } }];
    const read = jest.fn().mockResolvedValueOnce({ data: rows, nextCursor: 'next' })
      .mockRejectedValueOnce(Object.assign(new Error('private endpoint'), { status: 403 }));
    Object.assign(host, { readSdkSessionCatalogPage: read });
    const coordinator = new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime());
    await expect(coordinator.listSessions()).rejects.toMatchObject({ result: {
      status: 'partial', data: rows, nextCursor: 'next', errorReason: 'Permission denied',
    } });
    expect(host.getLegacy).not.toHaveBeenCalled();
  });

  it('rejects cursor cycles while retaining unique admitted rows', async () => {
    const host = createHost(createSdk());
    const rows = [{ id: 's-1', title: 'Session', time: { created: 1, updated: 1 } }];
    Object.assign(host, { readSdkSessionCatalogPage: jest.fn().mockResolvedValue({ data: rows, nextCursor: 'repeat' }) });
    await expect(new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime()).listSessions())
      .rejects.toMatchObject({ result: { status: 'partial', data: rows, nextCursor: 'repeat' } });
  });

  it('uses legacy cursor reads when SDK paging is absent', async () => {
    const host = createHost(createSdk());
    const rows = [{ id: 'legacy', title: 'Session', time: { created: 1, updated: 1 } }];
    const legacy = jest.fn().mockResolvedValue({ data: rows, nextCursor: null });
    Object.assign(host, { readSdkSessionCatalogPage: jest.fn().mockRejectedValue(new Error('SDK path unavailable')),
      readLegacySessionCatalogPage: legacy });
    await expect(new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime()).listSessions()).resolves.toEqual(rows);
    expect(legacy).toHaveBeenCalledWith({ limit: 100 });
  });

  it('does not claim completeness when the server has no cursor route', async () => {
    const sdk = createSdk({ list: jest.fn().mockResolvedValue([{ id: 'fallback' }]) });
    const host = createHost(sdk);
    const missing = Object.assign(new Error('missing route'), { status: 404 });
    Object.assign(host, { readSdkSessionCatalogPage: jest.fn().mockRejectedValue(missing),
      readLegacySessionCatalogPage: jest.fn().mockRejectedValue(missing) });
    await expect(new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime()).listSessions())
      .rejects.toMatchObject({ result: { status: 'partial', data: [{ id: 'fallback' }], nextCursor: null,
        errorReason: 'Session catalog pagination is unavailable' } });
    expect(sdk.list).toHaveBeenCalledWith({ limit: 1000 });
  });

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
    expect(host.postLegacy).toHaveBeenCalledWith('/session', {});
    expect(coordinator.getSessionId()).toBe('manual-session');
  });

  it('omits the title when creating a default session so OpenCode can generate its own default title', async () => {
    const sdk = createSdk({
      create: jest.fn().mockResolvedValue({ id: 'sdk-session' }),
    });
    const host = createHost(sdk);
    const coordinator = new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime());

    await expect(coordinator.createSession()).resolves.toBe('sdk-session');

    expect(sdk.create).toHaveBeenCalledWith({});
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

  it('preserves denied directory failures after both transports fail', async () => {
    const sdk = createSdk({ list: jest.fn().mockRejectedValue(new Error('SDK unavailable')) });
    const denied = Object.assign(new Error('Unauthorized'), { status: 401 });
    const host = createHost(sdk, { getLegacy: jest.fn().mockRejectedValue(denied) });
    const coordinator = new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime());
    await expect(coordinator.listSessions()).rejects.toBe(denied);
  });

  it('refuses malformed directory responses instead of returning an empty catalog', async () => {
    const sdk = createSdk({ list: jest.fn().mockResolvedValue({ data: 'invalid' }) });
    const host = createHost(sdk, { getLegacy: jest.fn().mockResolvedValue({ invalid: true }) });
    const coordinator = new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime());
    await expect(coordinator.listSessions()).rejects.toThrow('Invalid session catalog response');
    expect(host.getLegacy).toHaveBeenCalledWith('/session');
  });

  it('falls back after a malformed SDK directory response', async () => {
    const sdk = createSdk({ list: jest.fn().mockResolvedValue(null) });
    const sessions = [{ id: 'legacy-valid', title: 'Valid', time: { created: 1, updated: 2 } }];
    const host = createHost(sdk, { getLegacy: jest.fn().mockResolvedValue(sessions) });
    const coordinator = new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime());
    await expect(coordinator.listSessions()).resolves.toEqual(sessions);
    expect(host.getLegacy).toHaveBeenCalledTimes(1);
  });

  it('keeps session get fallback in the lifecycle owner', async () => {
    const legacySession: Session = {
      id: 'legacy-session',
      title: 'Legacy',
      time: { created: 1, updated: 2 },
    };
    const sdk = createSdk({
      get: jest.fn().mockRejectedValue(new Error('sdk get failed')),
    });
    const host = createHost(sdk, {
      getLegacy: jest.fn().mockResolvedValue(legacySession),
    });
    const coordinator = new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime());

    await expect(coordinator.getSessionInfo('session-1')).resolves.toEqual(legacySession);
    expect(sdk.get).toHaveBeenCalledWith({ sessionID: 'session-1' });
    expect(host.getLegacy).toHaveBeenCalledWith('/session/session-1');
    expect(host.logServiceWarning).toHaveBeenCalledWith(
      'session.get',
      'SDK session.get failed for session-1, falling back to legacy HTTP',
      expect.any(Error),
    );
  });

  it('keeps session abort scoped and falls back through the lifecycle owner', async () => {
    const sdk = createSdk({
      abort: jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('sdk abort failed')),
    });
    const host = createHost(sdk, {
      shouldUseSdkCrud: jest.fn(() => false),
      postLegacy: jest.fn().mockResolvedValue(undefined),
    });
    const coordinator = new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime());

    await expect(coordinator.abortSession('sdk-session')).resolves.toBeUndefined();
    expect(sdk.abort).toHaveBeenCalledWith({ sessionID: 'sdk-session' });
    expect(host.postLegacy).not.toHaveBeenCalled();

    await expect(coordinator.abortSession('fallback-session')).resolves.toBeUndefined();
    await expect(coordinator.abortSession('')).resolves.toBeUndefined();

    expect(sdk.abort).toHaveBeenCalledWith({ sessionID: 'fallback-session' });
    expect(host.postLegacy).toHaveBeenCalledWith('/session/fallback-session/abort', {});
    expect(host.logServiceWarning).toHaveBeenCalledWith(
      'session.abort',
      'SDK session.abort failed for fallback-session, falling back to legacy HTTP',
      expect.any(Error),
    );
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
    expect(host.applyCanonicalSnapshot).toHaveBeenCalledWith('session-1', filteredMessages,
      expect.objectContaining({ revision: 0, request: 1 }));
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

  it('suppresses only the first provisional title update when the server still has an official default title', async () => {
    const sdk = createSdk({
      get: jest.fn().mockResolvedValue({
        id: 'session-1',
        title: 'New session - 2026-05-14T10:00:00.000Z',
        time: { created: 1, updated: 2 },
      }),
      update: jest.fn().mockResolvedValue(undefined),
    });
    const host = createHost(sdk);
    const coordinator = new OpenCodeSessionLifecycleCoordinator(host, createSyncRuntime());

    await expect(coordinator.updateSessionTitle('session-1', 'Local provisional')).resolves.toBeUndefined();
    await expect(coordinator.updateSessionTitle('session-1', 'Local fallback')).resolves.toBeUndefined();

    expect(sdk.update).toHaveBeenCalledTimes(1);
    expect(sdk.update).toHaveBeenCalledWith({
      sessionID: 'session-1',
      title: 'Local fallback',
    });
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
