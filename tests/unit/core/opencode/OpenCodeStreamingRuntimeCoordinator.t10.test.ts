import { TextDecoder } from 'util';

import { OpenCodeStreamEventTransformer } from '../../../../src/core/opencode/OpenCodeStreamEventTransformer';
import { OpenCodeStreamingRuntimeCoordinator, type OpenCodeStreamingRuntimeCoordinatorHost } from '../../../../src/core/opencode/OpenCodeStreamingRuntimeCoordinator';
import type { StreamChunk } from '../../../../src/core/types';

const originalFetch = global.fetch;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;

function runtime() {
  const host: OpenCodeStreamingRuntimeCoordinatorHost = {
    applyStreamMutations: jest.fn(), abortSessionOnServer: jest.fn(), delay: jest.fn().mockResolvedValue(undefined),
    getLegacyEventStreamRequest: () => ({ url: 'http://fixture/event', headers: {} }),
    getSessionMessages: jest.fn().mockResolvedValue([
      { info: { id: 'old-answer', parentID: 'old-prompt', sessionID: 's', role: 'assistant', time: { created: 1 } },
        parts: [{ id: 'old-text', sessionID: 's', messageID: 'old-answer', type: 'text', text: 'RETRACTED OLD ANSWER' }] },
      { info: { id: 'current-prompt', sessionID: 's', role: 'user', time: { created: 2 } }, parts: [] },
    ]),
    logServiceWarning: jest.fn(),
    streamEventTransformer: new OpenCodeStreamEventTransformer({
      observeRuntimeToolNames: () => false, getOpenCodeToolKind: () => 'custom',
      normalizeQuestionRequest: () => null, logStreamingDebug: () => undefined,
    }),
  };
  return new OpenCodeStreamingRuntimeCoordinator(host);
}

function legacyStream() {
  const bytes = Uint8Array.from(Buffer.from('data: {"type":"session.idle","properties":{"sessionID":"s"}}\n\n'));
  const read = jest.fn().mockResolvedValueOnce({ done: false, value: bytes }).mockResolvedValue({ done: true });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, body: { getReader: () => ({ read, cancel: jest.fn(), releaseLock: jest.fn() }) } });
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

// eslint-disable-next-line max-lines-per-function -- Failure boundaries share one transport fixture.
describe('T10 single submission and event fallback boundaries', () => {
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  it('keeps the current prompt identity when the first SDK read fails after admission', async () => {
    legacyStream();
    const startPrompt = jest.fn().mockResolvedValue(undefined);
    const chunks = await collect(runtime().streamSdkResponse({ sessionId: 's', promptMessageId: 'current-prompt', startPrompt,
      subscribe: async () => (async function* () { throw new Error('socket closed'); yield {} as never; })(),
    }));
    expect(startPrompt).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual([{ type: 'message_start' }, { type: 'message_stop' }]);
  });

  it('uses legacy events when SDK subscription is absent, with one prompt and one final', async () => {
    legacyStream();
    const startPrompt = jest.fn().mockResolvedValue(undefined);
    const chunks = await collect(runtime().streamSdkResponse({ sessionId: 's', promptMessageId: 'current-prompt', startPrompt,
      subscribe: async () => { throw Object.assign(new Error('missing event route'), { cause: { status: 404 } }); },
    }));
    expect(startPrompt).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual([{ type: 'message_start' }, { type: 'message_stop' }]);
  });

  it.each([400, 401, 403, 429])('does not downgrade an SDK subscription rejection HTTP %i', async (status) => {
    legacyStream();
    const startPrompt = jest.fn().mockResolvedValue(undefined);
    const chunks = await collect(runtime().streamSdkResponse({ sessionId: 's', startPrompt,
      subscribe: async () => { throw Object.assign(new Error('rejected subscription'), { cause: { status } }); },
    }));
    expect(startPrompt).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(chunks).toEqual([expect.objectContaining({ type: 'error', content: 'rejected subscription' })]);
  });

  it('does not submit or reconnect when cancelled during subscription setup', async () => {
    legacyStream();
    const coordinator = runtime();
    let rejectSubscription!: (error: Error) => void;
    const subscription = new Promise<never>((_resolve, reject) => { rejectSubscription = reject; });
    const startPrompt = jest.fn().mockResolvedValue(undefined);
    const generator = coordinator.streamSdkResponse({ sessionId: 's', startPrompt, subscribe: () => subscription });
    const pending = generator.next();
    coordinator.cancelStream('s');
    rejectSubscription(new Error('aborted subscribe'));
    const first = await pending;
    await generator.return(undefined);
    expect(first.done).toBe(true);
    expect(startPrompt).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not replay generation after prompt rejection', async () => {
    legacyStream();
    const startPrompt = jest.fn().mockRejectedValue(new Error('generation rejected'));
    const chunks = await collect(runtime().streamSdkResponse({ sessionId: 's', startPrompt,
      subscribe: async () => (async function* () { yield {} as never; })(),
    }));
    expect(startPrompt).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(chunks).toEqual([expect.objectContaining({ type: 'error', content: 'generation rejected' })]);
  });

  it('surfaces a disconnect after ingress without starting fallback or a second generation', async () => {
    legacyStream();
    const startPrompt = jest.fn().mockResolvedValue(undefined);
    const chunks = await collect(runtime().streamSdkResponse({ sessionId: 's', startPrompt,
      subscribe: async () => (async function* () { yield { type: 'server.connected' } as never; throw new Error('later disconnect'); })(),
    }));
    expect(startPrompt).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(chunks.filter((chunk) => chunk.type === 'message_stop')).toHaveLength(0);
    expect(chunks.at(-1)).toEqual(expect.objectContaining({ type: 'error', content: 'later disconnect' }));
  });
  it('does not submit after cancellation at the fallback message-start boundary', async () => {
    legacyStream();
    const coordinator = runtime();
    const startPrompt = jest.fn().mockResolvedValue(undefined);
    const stream = coordinator.streamSdkResponse({ sessionId: 's', startPrompt,
      subscribe: async () => { throw new Error('socket closed'); },
    });
    expect((await stream.next()).value).toEqual({ type: 'message_start' });
    coordinator.cancelStream('s');
    await collect(stream);
    expect(startPrompt).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('drops an in-flight SDK read completed after cancellation', async () => {
    legacyStream();
    const coordinator = runtime();
    let deliver!: (event: IteratorResult<never>) => void;
    let reading!: () => void;
    const readStarted = new Promise<void>((resolve) => { reading = resolve; });
    const next = () => { reading(); return new Promise<IteratorResult<never>>((resolve) => { deliver = resolve; }); };
    const stream = coordinator.streamSdkResponse({ sessionId: 's', startPrompt: async () => undefined,
      subscribe: async () => ({ [Symbol.asyncIterator]: () => ({ next }) }),
    });
    const pending = stream.next();
    await readStarted;
    coordinator.cancelStream('s');
    deliver({ done: false, value: { type: 'session.idle', properties: { sessionID: 's' } } as never });
    const first = await pending;
    await stream.return(undefined);
    expect(first.done).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('emits one usage update and one terminal after fallback without replaying admission', async () => {
    const payloads = [
      { type: 'session.next.step.ended', properties: { sessionID: 's', tokens: { input: 12, output: 4, reasoning: 2 } } },
      { type: 'session.idle', properties: { sessionID: 's' } },
    ];
    const reads = payloads.map((payload) => ({ done: false, value: Uint8Array.from(Buffer.from('data: ' + JSON.stringify(payload) + '\n\n')) }));
    const read = jest.fn().mockImplementation(async () => reads.shift() ?? { done: true });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, body: { getReader: () => ({ read, cancel: jest.fn(), releaseLock: jest.fn() }) } });
    const startPrompt = jest.fn().mockResolvedValue(undefined);
    const chunks = await collect(runtime().streamSdkResponse({ sessionId: 's', promptMessageId: 'current-prompt', startPrompt,
      subscribe: async () => (async function* () { throw new Error('lost first read'); yield {} as never; })(),
    }));
    expect(startPrompt).toHaveBeenCalledTimes(1);
    expect(chunks.filter((chunk) => chunk.type === 'usage')).toEqual([{ type: 'usage', inputTokens: 12, outputTokens: 6, sessionId: 's' }]);
    expect(chunks.filter((chunk) => chunk.type === 'message_start')).toHaveLength(1);
    expect(chunks.filter((chunk) => chunk.type === 'message_stop')).toHaveLength(1);
  });

});
