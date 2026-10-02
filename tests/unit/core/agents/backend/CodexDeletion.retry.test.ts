import { CodexAdapter, type CodexFactory } from '../../../../../src/core/agents/backend/CodexAdapter';
import { CodexAppServerClient } from '../../../../../src/core/agents/backend/CodexAppServerClient';
import type { StreamChunk } from '../../../../../src/core/types/chat';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function clientFixture() {
  const client = new CodexAppServerClient({ codexPathOverride: '/fixture/codex' });
  jest.spyOn(client, 'start').mockResolvedValue(undefined);
  jest.spyOn(client, 'stop').mockResolvedValue(undefined);
  const request = jest.spyOn(client as unknown as {
    request(method: string, params: Record<string, unknown>, timeout?: number): Promise<unknown>;
  }, 'request').mockResolvedValue({});
  const cache = client as unknown as { threadEffectiveSettings: Map<string, unknown> };
  cache.threadEffectiveSettings.set('native-thread', { model: 'cached' });
  return { client, request };
}

async function adapterFixture() {
  const fixture = clientFixture();
  const adapter = new CodexAdapter({
    createAppServerClient: () => fixture.client,
    createCodex: async () => ({}) as Awaited<ReturnType<CodexFactory>>,
  });
  await adapter.start();
  const localId = await adapter.createSession();
  const state = adapter as unknown as {
    sessions: Map<string, { threadId: string | null }>;
    threadAlias: Map<string, string>;
    sessionEffectiveSettings: Map<string, unknown>;
    sessionEffectiveEvidence: Map<string, unknown>;
    sessionAttemptOptions: Map<string, unknown>;
    appServerContextSnapshots: Map<string, unknown>;
    loadedThreadIds: Set<string>;
    activeTurnIdByThread: Map<string, string>;
    threadGoalByThread: Map<string, unknown>;
    handleThreadBackendEvent(chunk: Extract<StreamChunk, { type: 'backend_event' }>, threadId: string, sessionId: string, complete: () => void): void;
    invalidateLocalSessionForDeletedThread(threadId: string): string | null;
  };
  state.sessions.get(localId)!.threadId = 'native-thread';
  state.threadAlias.set('native-thread', localId);
  state.sessionEffectiveSettings.set(localId, { model: 'cached' });
  state.sessionEffectiveEvidence.set(localId, { runtime: 'verified' });
  state.sessionAttemptOptions.set(localId, { model: 'cached' });
  state.appServerContextSnapshots.set('native-thread', { totalTokens: 10 });
  state.loadedThreadIds.add('native-thread');
  state.activeTurnIdByThread.set('native-thread', 'turn-1');
  state.threadGoalByThread.set('native-thread', { objective: 'keep until verified' });
  return { ...fixture, adapter, state, localId };
}

function expectIdentityRetained(fixture: Awaited<ReturnType<typeof adapterFixture>>) {
  const { state, localId, client } = fixture;
  expect(state.sessions.get(localId)?.threadId).toBe('native-thread');
  expect(state.threadAlias.get('native-thread')).toBe(localId);
  expect(state.sessionEffectiveSettings.get(localId)).toEqual({ model: 'cached' });
  expect(state.sessionEffectiveEvidence.get(localId)).toEqual({ runtime: 'verified' });
  expect(state.sessionAttemptOptions.has(localId)).toBe(true);
  expect(state.appServerContextSnapshots.has('native-thread')).toBe(true);
  expect(state.loadedThreadIds.has('native-thread')).toBe(true);
  expect(state.activeTurnIdByThread.get('native-thread')).toBe('turn-1');
  expect(state.threadGoalByThread.has('native-thread')).toBe(true);
  expect(client.getThreadEffectiveSettings('native-thread')).toEqual({ model: 'cached' });
}

describe('Codex deletion notification race (P1)', () => {
  it.each([
    ['delete', 'admitted', 'local'], ['delete', 'admitted', 'native'],
    ['delete', 'unavailable', 'local'], ['delete', 'unavailable', 'native'],
    ['readback', 'admitted', 'local'], ['readback', 'admitted', 'native'],
  ])('retains identity when a notification arrives during %s -> %s, then retries by %s ID', async (stage, status, retryKey) => {
    const fixture = await adapterFixture();
    const gate = deferred<unknown>();
    const entered = deferred<void>();
    fixture.request.mockImplementation(async (method) => {
      if (method === (stage === 'delete' ? 'thread/delete' : 'thread/read')) {
        entered.resolve();
        return gate.promise;
      }
      if (method === 'thread/read') throw new Error('readback disconnected');
      return {};
    });
    const deletion = fixture.adapter.deleteSession(fixture.localId);
    const rejection = deletion.catch((error: unknown) => error);
    await entered.promise;
    fixture.state.handleThreadBackendEvent({ type: 'backend_event', source: 'codex', event: 'thread_deleted' }, 'native-thread', fixture.localId, jest.fn());
    // Also exercise the local invalidation seam; neither path may lose identity.
    fixture.state.invalidateLocalSessionForDeletedThread('native-thread');
    const retainedDuringFlight = fixture.state.sessions.get(fixture.localId)?.threadId;
    if (status === 'unavailable') gate.reject(Object.assign(new Error('Method not found'), { code: -32601 }));
    else if (stage === 'readback') gate.reject(new Error('readback disconnected'));
    else gate.resolve({});
    await expect(rejection).resolves.toMatchObject({ result: { status, threadId: 'native-thread' } });
    expect(retainedDuringFlight).toBe('native-thread');
    // Late notifications after admission/failure must not erase retry aliases.
    fixture.state.handleThreadBackendEvent({ type: 'backend_event', source: 'codex', event: 'thread_deleted' }, 'native-thread', fixture.localId, jest.fn());
    expectIdentityRetained(fixture);
    fixture.request.mockImplementation(async (method) => {
      if (method === 'thread/delete' || method === 'thread/read') throw new Error('thread not found: native-thread');
      return {};
    });
    await fixture.adapter.deleteSession(retryKey === 'local' ? fixture.localId : 'native-thread');
    expect(fixture.request.mock.calls.filter(([method]) => method === 'thread/delete').every(([, params]) => params.threadId === 'native-thread')).toBe(true);
    expect(fixture.state.sessions.has(fixture.localId)).toBe(false);
    expect(fixture.state.threadAlias.has('native-thread')).toBe(false);
    expect(fixture.client.getThreadEffectiveSettings('native-thread')).toBeNull();
    await fixture.adapter.stop();
  });
});

describe('Codex delete absence readback on retry (P2)', () => {
  it('converges after delete ACK + offline readback when retry delete reports exact same-ID absence', async () => {
    const { client, request } = clientFixture();
    request.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('readback disconnected'));
    await expect(client.deleteThreadResult('native-thread')).resolves.toMatchObject({ status: 'admitted', readback: { status: 'unavailable' } });
    expect(client.getThreadEffectiveSettings('native-thread')).toEqual({ model: 'cached' });
    request.mockRejectedValueOnce(new Error('thread not found: native-thread'));
    request.mockRejectedValueOnce(new Error('no rollout found for thread id native-thread'));
    await expect(client.deleteThreadResult('native-thread')).resolves.toMatchObject({ status: 'verified', readback: { status: 'verified' } });
    expect(request.mock.calls.map(([method]) => method)).toEqual(['thread/delete', 'thread/read', 'thread/delete', 'thread/read']);
    expect(client.getThreadEffectiveSettings('native-thread')).toBeNull();
  });

  it.each([
    new Error('offline'),
    new Error('thread not found: another-thread'),
    Object.assign(new Error('Method not found'), { code: -32601 }),
  ])('keeps failed retry and cache when the absence readback is not authoritative: %p', async (error) => {
    const { client, request } = clientFixture();
    request.mockRejectedValueOnce(new Error('thread not found: native-thread')).mockRejectedValueOnce(error);
    const result = await client.deleteThreadResult('native-thread');
    expect(result.status).toBe('failed');
    expect(result.readback?.status).toBe('unavailable');
    expect(client.getThreadEffectiveSettings('native-thread')).toEqual({ model: 'cached' });
  });

  it.each([
    { thread: { id: 'another-thread' } }, { thread: { id: 'native-thread' } }, null,
  ])('does not verify retry absence from a readable/mismatched/null response %p', async (response) => {
    const { client, request } = clientFixture();
    request.mockRejectedValueOnce(new Error('thread not found: native-thread')).mockResolvedValueOnce(response);
    const result = await client.deleteThreadResult('native-thread');
    expect(result.status).toBe('failed');
    expect(result.readback?.status).not.toBe('verified');
    expect(client.getThreadEffectiveSettings('native-thread')).toEqual({ model: 'cached' });
  });

  it.each([
    new Error('native refused'), new Error('thread not found: another-thread'),
    Object.assign(new Error('thread not found: native-thread'), { code: -32601 }),
  ])('does not reinterpret arbitrary mutation failures as absence: %p', async (error) => {
    const { client, request } = clientFixture();
    request.mockRejectedValueOnce(error).mockRejectedValueOnce(new Error('thread not found: native-thread'));
    const result = await client.deleteThreadResult('native-thread');
    expect(result.status).not.toBe('verified');
    expect(request).toHaveBeenCalledTimes(1);
    expect(client.getThreadEffectiveSettings('native-thread')).toEqual({ model: 'cached' });
  });

  it('retains legacy boolean ACK admission without verifying or clearing readback cache', async () => {
    const { client, request } = clientFixture();
    await expect(client.deleteThread('native-thread')).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(client.getThreadEffectiveSettings('native-thread')).toEqual({ model: 'cached' });
  });
});
