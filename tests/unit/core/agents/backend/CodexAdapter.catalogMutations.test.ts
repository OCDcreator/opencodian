import { CodexAdapter, type CodexFactory } from '../../../../../src/core/agents/backend/CodexAdapter';
import {
  AppServerThreadMutationError,
  CodexAppServerClient,
} from '../../../../../src/core/agents/backend/CodexAppServerClient';

function createFixture(withServer = true) {
  const client = new CodexAppServerClient({ codexPathOverride: '/fixture/codex' });
  jest.spyOn(client, 'start').mockResolvedValue(undefined);
  jest.spyOn(client, 'stop').mockResolvedValue(undefined);
  const request = jest.spyOn(client as unknown as {
    request(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
  }, 'request').mockResolvedValue({});
  const adapter = new CodexAdapter({
    createAppServerClient: () => withServer ? client : null,
    createCodex: async () => ({}) as Awaited<ReturnType<CodexFactory>>,
  });
  return { adapter, client, request };
}

async function ownThread(adapter: CodexAdapter) {
  const localId = await adapter.createSession();
  const state = adapter as unknown as {
    sessions: Map<string, { provisionalId: string; threadId: string | null }>;
    threadAlias: Map<string, string>;
    sessionEffectiveSettings: Map<string, { model: string }>;
    appServerContextSnapshots: Map<string, unknown>;
    loadedThreadIds: Set<string>;
    activeControllers: Map<string, AbortController>;
  };
  state.sessions.get(localId)!.threadId = 'native-thread';
  state.threadAlias.set('native-thread', localId);
  state.sessionEffectiveSettings.set(localId, { model: 'fixture-model' });
  state.appServerContextSnapshots.set('native-thread', { totalTokens: 10 });
  state.loadedThreadIds.add('native-thread');
  const controller = new AbortController();
  state.activeControllers.set(localId, controller);
  return { localId, state, controller };
}

const mutations = [
  {
    operation: 'rename', route: 'thread/name/set',
    result: (client: CodexAppServerClient) => client.setThreadNameResult('native-thread', 'new title', { readback: false }),
    legacy: (client: CodexAppServerClient) => client.setThreadName('native-thread', 'new title'),
  },
  {
    operation: 'archive', route: 'thread/archive',
    result: (client: CodexAppServerClient) => client.archiveThreadResult('native-thread', { readback: false }),
    legacy: (client: CodexAppServerClient) => client.archiveThread('native-thread'),
  },
  {
    operation: 'delete', route: 'thread/delete',
    result: (client: CodexAppServerClient) => client.deleteThreadResult('native-thread', { readback: false }),
    legacy: (client: CodexAppServerClient) => client.deleteThread('native-thread'),
  },
];

describe.each(mutations)('$operation native mutation results', (mutation) => {
  it('treats the native empty ACK as admission and retains the boolean API', async () => {
    const { client, request } = createFixture();
    await expect(mutation.result(client)).resolves.toEqual({ operation: mutation.operation, threadId: 'native-thread', status: 'admitted' });
    await expect(mutation.legacy(client)).resolves.toBe(true);
    expect(request.mock.calls.every(([method]) => method === mutation.route)).toBe(true);
  });

  it.each([false, null, undefined, { ok: false }])('rejects a false/missing/malformed ACK %p', async (ack) => {
    const { client, request } = createFixture();
    request.mockResolvedValue(ack);
    await expect(mutation.result(client)).resolves.toMatchObject({ operation: mutation.operation, threadId: 'native-thread', status: 'failed' });
    await expect(mutation.legacy(client)).resolves.toBe(false);
  });

  it('distinguishes unsupported from a native error', async () => {
    const { client, request } = createFixture();
    request.mockRejectedValue(Object.assign(new Error('Method not found'), { code: -32601 }));
    await expect(mutation.result(client)).resolves.toMatchObject({ status: 'unavailable', errorReason: 'Method not found' });
    await expect(mutation.legacy(client)).resolves.toBe(false);
    request.mockRejectedValue(new Error('native refused'));
    await expect(mutation.result(client)).resolves.toMatchObject({ status: 'failed', errorReason: 'native refused' });
  });
});

describe('native mutation runtime readback', () => {
  it('marks rename verified only after the same thread returns the requested name', async () => {
    const { client, request } = createFixture();
    request.mockResolvedValueOnce({});
    request.mockResolvedValueOnce({ thread: { id: 'native-thread', name: 'new title' } });
    await expect(client.setThreadNameResult('native-thread', 'new title')).resolves.toMatchObject({
      status: 'verified', readback: { status: 'verified' },
    });
    expect(request.mock.calls.map(([method]) => method)).toEqual(['thread/name/set', 'thread/read']);
  });

  it.each([
    { thread: { id: 'native-thread', name: 'old title' } },
    { thread: { id: 'another-thread', name: 'new title' } },
    {},
    null,
  ])('does not verify rename from mismatched or unreadable data %p', async (response) => {
    const { client, request } = createFixture();
    request.mockResolvedValueOnce({});
    request.mockResolvedValueOnce(response);
    const result = await client.setThreadNameResult('native-thread', 'new title');
    expect(result.status).toBe('admitted');
    expect(result.readback?.status).not.toBe('verified');
  });

  it('keeps rename admission separate from an unsupported read route', async () => {
    const { client, request } = createFixture();
    request.mockResolvedValueOnce({});
    request.mockRejectedValueOnce(Object.assign(new Error('Method not found'), { code: -32601 }));
    await expect(client.setThreadNameResult('native-thread', 'new title')).resolves.toMatchObject({
      status: 'admitted', readback: { status: 'unavailable' },
    });
  });

  it('verifies deletion only from an explicit not-found readback of the same native ID', async () => {
    const { client, request } = createFixture();
    request.mockResolvedValueOnce({});
    request.mockRejectedValueOnce(new Error('no rollout found for thread id native-thread'));
    await expect(client.deleteThreadResult('native-thread')).resolves.toMatchObject({ status: 'verified', readback: { status: 'verified' } });
  });

  it.each(['offline', 'unauthorized', 'no rollout found for thread id another-thread', 'no rollout found for thread id native-thread-2'])('does not verify delete from %s', async (reason) => {
    const { client, request } = createFixture();
    request.mockResolvedValueOnce({});
    request.mockRejectedValueOnce(new Error(reason));
    await expect(client.deleteThreadResult('native-thread')).resolves.toMatchObject({ status: 'admitted', readback: { status: 'unavailable' } });
  });

  it.each([{ thread: { id: 'native-thread' } }, {}, null])('does not verify deletion merely from a nullable/unexpected read %p', async (response) => {
    const { client, request } = createFixture();
    request.mockResolvedValueOnce({});
    request.mockResolvedValueOnce(response);
    const result = await client.deleteThreadResult('native-thread');
    expect(result.status).toBe('admitted');
    expect(result.readback?.status).not.toBe('verified');
  });

  it('verifies archive by native ID on a later archived page', async () => {
    const { client, request } = createFixture();
    request.mockResolvedValueOnce({});
    request.mockResolvedValueOnce({ data: [{ id: 'another-thread' }], nextCursor: 'page-2' });
    request.mockResolvedValueOnce({ data: [{ id: 'native-thread' }], nextCursor: null });
    await expect(client.archiveThreadResult('native-thread')).resolves.toMatchObject({ status: 'verified', readback: { status: 'verified' } });
    expect(request.mock.calls[2][1]).toEqual({ archived: true, limit: 50, cursor: 'page-2' });
  });

  it('does not verify archive from incomplete readback even if the ID appeared earlier', async () => {
    const { client, request } = createFixture();
    request.mockResolvedValueOnce({});
    request.mockResolvedValueOnce({ data: [{ id: 'native-thread' }], nextCursor: 'page-2' });
    request.mockRejectedValueOnce(new Error('page two unreadable'));
    await expect(client.archiveThreadResult('native-thread')).resolves.toMatchObject({ status: 'admitted', readback: { status: 'unavailable' } });
  });

  it('does not verify archive when the same ID is absent from the complete archived directory', async () => {
    const { client, request } = createFixture();
    request.mockResolvedValueOnce({});
    request.mockResolvedValueOnce({ data: [{ id: 'another-thread' }], nextCursor: null });
    await expect(client.archiveThreadResult('native-thread')).resolves.toMatchObject({ status: 'admitted', readback: { status: 'failed' } });
  });
});

describe('Codex adapter complete catalog and mutation propagation', () => {
  it('lists 121 active plus 121 archived threads with repeated boundaries and preserves native partition flags', async () => {
    const { adapter, request } = createFixture();
    await adapter.start();
    request.mockImplementation(async (_method, params) => {
      const prefix = params.archived ? 'archived' : 'active';
      const ids = Array.from({ length: 121 }, (_, index) => `${prefix}-${index}`);
      const start = params.cursor === 'page-2' ? 49 : params.cursor === 'page-3' ? 98 : 0;
      const end = start === 98 ? 121 : start + 50;
      return {
        data: ids.slice(start, end).map((id) => ({ id, name: id, preview: id })),
        nextCursor: start === 0 ? 'page-2' : start === 49 ? 'page-3' : null,
      };
    });
    const sessions = await adapter.listSessions() as Array<{ id: string; archived: boolean }>;
    expect(sessions).toHaveLength(242);
    expect(new Set(sessions.map((row) => row.id)).size).toBe(242);
    expect(sessions.filter((row) => row.archived)).toHaveLength(121);
    expect(request).toHaveBeenCalledTimes(6);
    await adapter.stop();
  });

  it('propagates second-page failure instead of silently returning only local sessions', async () => {
    const { adapter, request } = createFixture();
    await adapter.start();
    await ownThread(adapter);
    request.mockImplementation(async (_method, params) => {
      if (params.cursor) throw new Error('second page failed');
      return { data: [{ id: 'one', preview: 'one' }], nextCursor: 'page-2' };
    });
    await expect(adapter.listSessions()).rejects.toMatchObject({ result: { status: 'partial', nextCursor: 'page-2' } });
    await adapter.stop();
  });

  it.each(['false', 'error', 'unsupported'])('keeps deletion recovery state for native %s', async (failure) => {
    const { adapter, client, request } = createFixture();
    await adapter.start();
    const { localId, state, controller } = await ownThread(adapter);
    const cache = client as unknown as { threadEffectiveSettings: Map<string, { model: string }> };
    cache.threadEffectiveSettings.set('native-thread', { model: 'fixture-model' });
    if (failure === 'false') request.mockResolvedValue(false);
    else request.mockRejectedValue(Object.assign(new Error(failure), { code: failure === 'unsupported' ? -32601 : -32600 }));

    await expect(adapter.deleteSession('native-thread')).rejects.toBeInstanceOf(AppServerThreadMutationError);

    expect(state.sessions.has(localId)).toBe(true);
    expect(state.threadAlias.get('native-thread')).toBe(localId);
    expect(state.sessionEffectiveSettings.has(localId)).toBe(true);
    expect(state.appServerContextSnapshots.has('native-thread')).toBe(true);
    expect(state.loadedThreadIds.has('native-thread')).toBe(true);
    expect(controller.signal.aborted).toBe(false);
    expect(client.getThreadEffectiveSettings('native-thread')).toEqual({ model: 'fixture-model' });
    await adapter.stop();
  });

  it.each(['false', 'error', 'unsupported'])('propagates rename %s and resolves the alias', async (failure) => {
    const { adapter, request } = createFixture();
    await adapter.start();
    const { localId } = await ownThread(adapter);
    if (failure === 'false') request.mockResolvedValue(false);
    else request.mockRejectedValue(Object.assign(new Error(failure), { code: failure === 'unsupported' ? -32601 : -32600 }));
    await expect(adapter.updateSessionTitle(localId, 'new')).rejects.toMatchObject({
      result: { operation: 'rename', threadId: 'native-thread', status: failure === 'unsupported' ? 'unavailable' : 'failed' },
    });
    expect(request).toHaveBeenCalledWith('thread/name/set', { threadId: 'native-thread', name: 'new' }, 30000);
    await adapter.stop();
  });

  it('removes local state only after a successful native delete', async () => {
    const { adapter, request } = createFixture();
    await adapter.start();
    const { localId, state, controller } = await ownThread(adapter);
    let acknowledge: (value: unknown) => void = () => undefined;
    request.mockImplementation((method) => method === 'thread/delete'
      ? new Promise((resolve) => { acknowledge = resolve; })
      : Promise.reject(new Error('no rollout found for thread id native-thread')));
    const deletion = adapter.deleteSession(localId);
    await Promise.resolve();
    await Promise.resolve();
    expect(state.sessions.has(localId)).toBe(true);
    acknowledge({});
    await deletion;
    expect(state.sessions.has(localId)).toBe(false);
    expect(state.threadAlias.has('native-thread')).toBe(false);
    expect(state.appServerContextSnapshots.has('native-thread')).toBe(false);
    expect(controller.signal.aborted).toBe(true);
    await adapter.stop();
  });

  it('rejects unsupported SDK native mutations and offers explicit local forgetting', async () => {
    const { adapter, request } = createFixture(false);
    await adapter.start();
    const { localId, state } = await ownThread(adapter);
    await expect(adapter.deleteSession(localId)).rejects.toMatchObject({ result: { status: 'unavailable', operation: 'delete' } });
    await expect(adapter.updateSessionTitle(localId, 'new')).rejects.toMatchObject({ result: { status: 'unavailable', operation: 'rename' } });
    expect(state.sessions.has(localId)).toBe(true);
    await adapter.forgetSession(localId);
    expect(state.sessions.has(localId)).toBe(false);
    expect(request).not.toHaveBeenCalled();
    await adapter.stop();
  });

  it('keeps native archive separate from local forgetting and native deletion', async () => {
    const { adapter, request } = createFixture();
    await adapter.start();
    const { localId, state } = await ownThread(adapter);
    await expect(adapter.archiveSession('native-thread')).resolves.toBe(true);
    expect(state.sessions.has(localId)).toBe(true);
    await adapter.forgetSession(localId);
    expect(state.sessions.has(localId)).toBe(false);
    expect(request.mock.calls.map(([method]) => method)).toEqual(['thread/archive']);
    await adapter.stop();
  });
});
