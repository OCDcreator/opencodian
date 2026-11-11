import { apply } from '../../../../../assets/dsh/service.mjs';

// Owned fixture surface: synthetic ids and stub services only. No user message
// content, credentials, profiles or provider requests are involved. The real
// bridge `apply` serves `session/information` from this stub so the jest chain
// test can drive the REAL adapter against REAL bridge output.
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
  subagents: { async listChildren() {
    return [
      { id: 'child-continuable', mode: 'continuable', label: 'Review child' },
      { id: 'child-once', mode: 'one-shot' },
      { id: 'child-unknown', mode: 'mystery' },
    ];
  } },
};
const ctx = { llm, sessionQuery: { async observeSession(_id) {
  return { projections: { values: { subagentTiming: {} } }, [Symbol.dispose]() {} };
} },
  get: (name) => services[name],
  on(_name, callback) { if (!callbacks.has(_name)) callbacks.set(_name, new Set()); callbacks.get(_name).add(callback); return () => callbacks.get(_name).delete(callback); },
  effect(effect) { dispose = effect(); },
};
await apply(ctx, { nativeAnchor: process.argv[2], nativeConfigRevision: 'fixture-applied' });
process.stdin.once('end', async () => { await dispose?.(); });
