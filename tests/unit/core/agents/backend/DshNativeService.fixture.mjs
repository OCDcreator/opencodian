import { apply } from '../../../../../assets/dsh/service.mjs';

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
const ctx = { llm, get: (name) => services[name],
  on(name, callback) { if (!callbacks.has(name)) callbacks.set(name, new Set()); callbacks.get(name).add(callback); return () => callbacks.get(name).delete(callback); },
  effect(effect) { dispose = effect(); },
};
await apply(ctx, { nativeAnchor: process.argv[2], nativeConfigRevision: 'fixture-applied' });
console.log('fixture-native-console-noise');
process.stdin.once('end', async () => { await dispose?.(); });
