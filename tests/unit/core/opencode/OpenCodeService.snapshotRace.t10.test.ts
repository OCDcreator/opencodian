import { OpenCodeSessionStateStore } from '../../../../src/core/opencode/OpenCodeSessionStateStore';
import type { SessionSyncEventUpdate } from '../../../../src/core/opencode/OpenCodeSyncEventRuntimeCoordinator';
import { SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from '../../../../src/core/opencode/sdkFeatureFlags';
import type { OpenCodeSessionMessageWithParts } from '../../../../src/core/opencode/types';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  createOpenCodeServiceTestContext,
  mockRequestUrl,
  OpenCodeService,
} from './OpenCodeService.testSupport';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function message(id = 'answer', text = 'old'): OpenCodeSessionMessageWithParts {
  return {
    info: { id, sessionID: 's', role: 'assistant', time: { created: 1 } },
    parts: [{ id: id + '-text', sessionID: 's', messageID: id, type: 'text', text }],
  };
}

function sync(service: OpenCodeService, update: SessionSyncEventUpdate) {
  // Exercise the production canonical sync ingress; no native runtime is claimed.
  (service as unknown as { applyCanonicalSyncEvent(update: SessionSyncEventUpdate): void })
    .applyCanonicalSyncEvent(update);
}

function seed(service: OpenCodeService, value = message()) {
  sync(service, { type: 'message.updated', sessionId: 's', info: value.info });
  for (const part of value.parts) sync(service, { type: 'message.part.updated', sessionId: 's', part });
}

function streamDelta(service: OpenCodeService, messageID = 'answer') {
  (service as unknown as { sessionStateStore: OpenCodeSessionStateStore }).sessionStateStore
    .applyStreamMutations([{ type: 'part.delta', sessionID: 's', messageID,
      partID: messageID + '-text', field: 'text', delta: '+next' }]);
}

function pendingRead(transport: 'SDK' | 'HTTP' | 'SDK fallback') {
  const { mockSdkClient } = createOpenCodeServiceTestContext();
  const service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
    sdkFeatureFlags: { ...SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS, sdkCrud: transport !== 'HTTP' },
  });
  const started = deferred<void>();
  const response = deferred<OpenCodeSessionMessageWithParts[]>();
  const info = { id: 's', title: 'Existing', time: { created: 1, updated: 1 } };
  mockSdkClient.session.get.mockResolvedValue(info);
  mockSdkClient.session.messages.mockImplementation(() => {
    if (transport === 'SDK fallback') return Promise.reject(new Error('SDK read unavailable'));
    started.resolve();
    return response.promise;
  });
  mockRequestUrl.mockImplementation(({ url }: { url: string }) => {
    if (url.endsWith('/session/s/message')) {
      started.resolve();
      return response.promise.then((json) => ({ status: 200, json, text: JSON.stringify(json) }));
    }
    return Promise.resolve({ status: 200, json: info, text: JSON.stringify(info) });
  });
  return { service, mockSdkClient, started, response };
}

describe.each(['SDK', 'HTTP', 'SDK fallback'] as const)('T10 %s delayed snapshot', (transport) => {
  it('retains sync-created messages omitted by an older response and accepts the next stream delta', async () => {
    const { service, started, response } = pendingRead(transport);
    const read = service.getSessionMessages('s');
    await started.promise;
    seed(service, message('live', 'live text'));
    response.resolve([]);
    const loaded = await read;
    expect(loaded.map((entry) => entry.info.id)).toEqual(['live']);
    expect(loaded[0].parts[0].text).toBe('live text');
    streamDelta(service, 'live');
    expect(service.getCanonicalSessionMessages('s')?.[0].parts[0].text).toBe('live text+next');
  });

  it('retains updated info and appended text while applying omission of untouched parts', async () => {
    const { service, started, response } = pendingRead(transport);
    const old = message();
    old.parts.push({ id: 'untouched', sessionID: 's', messageID: 'answer', type: 'text', text: 'retracted' });
    seed(service, old);
    const read = service.getSessionMessages('s');
    await started.promise;
    sync(service, { type: 'message.updated', sessionId: 's', info: { ...old.info, cost: 42 } });
    sync(service, { type: 'message.part.delta', sessionId: 's', messageId: 'answer',
      partId: 'answer-text', field: 'text', delta: '+live' });
    response.resolve([{ ...message(), parts: [] }]);
    const loaded = await read;
    expect(loaded[0].info.cost).toBe(42);
    expect(loaded[0].parts.map((part) => part.id)).toEqual(['answer-text']);
    expect(loaded[0].parts[0].text).toBe('old+live');
    streamDelta(service);
    expect(service.getCanonicalSessionMessages('s')?.[0].parts[0].text).toBe('old+live+next');
  });

  it('keeps concurrent message and part removals authoritative over a stale restoring response', async () => {
    const { service, started, response } = pendingRead(transport);
    seed(service);
    seed(service, message('gone'));
    const read = service.getSessionMessages('s');
    await started.promise;
    sync(service, { type: 'message.part.removed', sessionId: 's', messageId: 'answer', partId: 'answer-text' });
    sync(service, { type: 'message.removed', sessionId: 's', messageId: 'gone' });
    response.resolve([message(), message('gone')]);
    const loaded = await read;
    expect(loaded.map((entry) => entry.info.id)).toEqual(['answer']);
    expect(loaded[0].parts).toEqual([]);
    streamDelta(service);
    streamDelta(service, 'gone');
    expect(service.getCanonicalSessionMessages('s')).toEqual(loaded);
  });
});

it('keeps the read token active across asynchronous revert filtering', async () => {
  const { service, mockSdkClient, response } = pendingRead('SDK');
  const filtering = deferred<void>();
  const info = deferred<unknown>();
  mockSdkClient.session.get.mockImplementation(() => { filtering.resolve(); return info.promise; });
  const read = service.getSessionMessages('s');
  // A nonempty payload reaches the production revert lookup; an empty one skips it.
  response.resolve([message()]);
  await filtering.promise;
  seed(service, message('live', 'during revert lookup'));
  info.resolve({ id: 's', title: 'Existing', time: { created: 1, updated: 1 } });
  expect((await read).map((entry) => entry.info.id)).toEqual(['answer', 'live']);
  streamDelta(service, 'live');
  const live = service.getCanonicalSessionMessages('s')?.find((entry) => entry.info.id === 'live');
  expect(live?.parts[0].text).toBe('during revert lookup+next');
});
