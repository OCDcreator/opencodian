import { apply } from '../../../../../assets/dsh/service.mjs';

// Owned fixture surface: ids, generic model routes and replay markers only.
// No user message content, credentials or profile data are involved.
const surface = {
  session: { id: 'owned-surface', cwd: '/owned', createdAt: 1_000 },
  capturedThroughSeq: 4,
  events: [
    { seq: 0, type: 'user/message', time: 100,
      data: { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Question' }] } },
    { seq: 1, type: 'assistant/message', time: 200,
      data: { message: { id: 'a1', role: 'assistant',
        source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-chat', replayState: { marker: 'REPLAY_MARKER' } },
        content: [{ type: 'text', text: 'First answer' }] } } },
    { seq: 2, type: 'assistant/message', time: 300,
      data: { message: { id: 'a2', role: 'assistant',
        source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-reasoner', replayState: { marker: 'REPLAY_MARKER' } },
        content: [{ type: 'text', text: 'Second answer' }] } } },
    { seq: 3, type: 'assistant/message', time: 400,
      data: { message: { id: 'a3', role: 'assistant', content: [{ type: 'text', text: 'Answer without source' }] } } },
    { seq: 4, type: 'tool/result', time: 500,
      data: { message: { id: 't1', role: 'tool', toolCallId: 'c1', isError: false, source: { kind: 'tool', callId: 'c1' },
        content: [{ type: 'text', text: 'Tool result' }] } } },
  ],
};

const callbacks = new Map();
let dispose;
const model = { id: 'test-model', name: 'Test model', inputModalities: ['text'] };
const llm = { listProviders: () => [{ id: 'test-provider', name: 'Test provider' }],
  listModels: async () => [model], resolveCallConfig: async (route) => route, resolveModelInfo: async () => model };
const services = { llm, loader: { await: async () => {} },
  settings: { writable: false, documentPath: '', describe(options) {
    if (options.redactSecrets !== true) throw new Error('redaction must be requested');
    return [{ ns: 'sample', value: { thresholdRatio: 0.8 }, base: {}, user: {}, schema: {}, applies: 'live', revision: 1 }];
  } },
  credentials: { async describe() { return { configured: false, writable: false }; } },
};
const ctx = { llm, sessionQuery: { async readSurface(id) { return id === surface.session.id ? surface : null; } },
  get: (name) => services[name],
  on(name, callback) { if (!callbacks.has(name)) callbacks.set(name, new Set()); callbacks.get(name).add(callback); return () => callbacks.get(name).delete(callback); },
  effect(effect) { dispose = effect(); },
};
await apply(ctx, { nativeAnchor: process.argv[2], nativeConfigRevision: 'fixture-applied' });
process.stdin.once('end', async () => { await dispose?.(); });
