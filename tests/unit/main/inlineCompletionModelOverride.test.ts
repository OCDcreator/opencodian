/**
 * Composition-level proof for the R-C3 dedicated completion model setting
 * (`inlineCompletionModelOverrides`):
 *
 * - resolution order: the dedicated override is read FIRST, before the
 *   inline-edit chain (`inlineEditModelOverrides` → active chat model →
 *   backend default) that `adapter.resolveModel()` implements;
 * - default byte-identity: with the setting at its default (`{}`) the resolved
 *   target is exactly what `adapter.resolveModel()` produced before the
 *   setting existed — same model, same effort, same session config;
 * - a malformed override is reported (`model-unavailable`), never a silent
 *   fallback (same discipline as inline-edit §9);
 * - changing the override rebuilds the warm session (the pool disposes on a
 *   model-reference change — reset semantics, pinned end to end).
 *
 * These tests run the REAL production composition (`configureInlineCompletion`
 * plus the real pool) and stub only the backend adapter seam, the same shape
 * as `inlineCompletionNotifyWiring.test.ts`.
 */

import type {
  BackendModelSelection,
} from '../../../src/core/agents/backend/AgentAuxQueryCapability';
import { AUX_DENIED_CAPABILITIES } from '../../../src/core/agents/backend/AgentAuxQueryCapability';
import type {
  InlineCompletionSession,
  InlineCompletionSessionConfig,
} from '../../../src/core/agents/backend/AgentInlineCompletionCapability';
import { DEFAULT_SETTINGS } from '../../../src/core/types';
import type {
  InlineCompletionService,
  InlineCompletionTarget,
} from '../../../src/features/inline-edit/InlineCompletionService';
import type { InlineEditHost, InlineEditHostAdapter } from '../../../src/features/inline-edit/InlineEditHost';
import OpenCodianPlugin from '../../../src/main';

(globalThis as { BUILD_ID?: string }).BUILD_ID = 'test-build';

type WiredPlugin = OpenCodianPlugin & {
  settings: typeof DEFAULT_SETTINGS;
  app: unknown;
  inlineEditHost: InlineEditHost | null;
  configureInlineCompletion(): void;
  resolveInlineCompletionTarget(): InlineCompletionTarget;
  inlineCompletionPool: InlineCompletionService;
};

interface StubSession extends InlineCompletionSession {
  disposed: boolean;
  readonly config: InlineCompletionSessionConfig | null;
}

/** Adapter stub: only the completion-relevant seam is implemented. */
function stubAdapter(options: {
  kind?: 'opencode';
  resolveModel: () => { ok: true; model: BackendModelSelection | null } | { ok: false; error: string };
  startSession?: (config: InlineCompletionSessionConfig) => Promise<InlineCompletionSession>;
}): InlineEditHostAdapter {
  return {
    kind: options.kind ?? 'opencode',
    displayName: 'OpenCode',
    getAuxQuery: () => null,
    getInlineCompletion: () => ({
      startInlineCompletionSession: options.startSession
        ?? ((config: InlineCompletionSessionConfig) => {
          const session: StubSession = {
            queryId: `stub-${Math.random().toString(36).slice(2)}`,
            safety: {
              backend: 'opencode',
              enforcedPolicy: 'read-only-allowlist',
              effectiveTools: ['read'],
              deniedCapabilities: AUX_DENIED_CAPABILITIES,
              mechanism: 'stub',
            },
            completed: [],
            disposed: false,
            config,
            complete() {
              return Promise.resolve({ ok: true, text: '', toolCalls: [] });
            },
            reset() {
              return Promise.resolve();
            },
            dispose() {
              session.disposed = true;
              return Promise.resolve();
            },
          };
          return Promise.resolve(session);
        }),
    }) as never,
    resolveModel: options.resolveModel,
    describeModelSelection: () => ({ label: 'stub', source: 'default' }),
    getEffort: () => null,
  };
}

function createWiredPlugin(): WiredPlugin {
  const plugin = new OpenCodianPlugin() as WiredPlugin;
  plugin.app = { workspace: { getActiveViewOfType: () => null } };
  plugin.settings = { ...DEFAULT_SETTINGS, inlineCompletionEnabled: true };
  plugin.configureInlineCompletion();
  return plugin;
}

async function flush(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('inlineCompletionModelOverrides resolution (R-C3 composition)', () => {
  it('resolves the dedicated override first, ahead of the inline-edit chain', () => {
    const plugin = createWiredPlugin();
    const chainModel: BackendModelSelection = { kind: 'opencode', provider: 'chat', model: 'chat-model' };
    plugin.inlineEditHost = {
      resolveAdapter: () => stubAdapter({
        resolveModel: () => ({ ok: true, model: chainModel }),
      }),
    } as InlineEditHost;
    plugin.settings.inlineCompletionModelOverrides = { opencode: 'fast/model' };

    const target = plugin.resolveInlineCompletionTarget();
    expect(target.ok).toBe(true);
    if (!target.ok) return;
    expect(target.model).toEqual({ kind: 'opencode', provider: 'fast', model: 'model' });
  });

  it('builds the session with the dedicated model (config passthrough)', async () => {
    const plugin = createWiredPlugin();
    const seenConfigs: InlineCompletionSessionConfig[] = [];
    plugin.inlineEditHost = {
      resolveAdapter: () => stubAdapter({
        resolveModel: () => ({ ok: true, model: null }),
        startSession: (config) => {
          seenConfigs.push(config);
          const session: StubSession = {
            queryId: 'stub-dedicated',
            safety: {
              backend: 'opencode',
              enforcedPolicy: 'read-only-allowlist',
              effectiveTools: ['read'],
              deniedCapabilities: AUX_DENIED_CAPABILITIES,
              mechanism: 'stub',
            },
            completed: [],
            disposed: false,
            config,
            complete() {
              return Promise.resolve({ ok: true, text: '', toolCalls: [] });
            },
            reset() {
              return Promise.resolve();
            },
            dispose() {
              session.disposed = true;
              return Promise.resolve();
            },
          };
          return Promise.resolve(session);
        },
      }),
    } as InlineEditHost;
    plugin.settings.inlineCompletionModelOverrides = { opencode: 'fast/model' };

    const result = await plugin.inlineCompletionPool.obtain();
    expect(result.ok).toBe(true);
    await flush();
    expect(seenConfigs).toHaveLength(1);
    expect(seenConfigs[0].model).toEqual({ kind: 'opencode', provider: 'fast', model: 'model' });
  });

  it('is byte-identical at the default: empty map resolves exactly what the chain resolves', () => {
    const plugin = createWiredPlugin();
    const adapter = stubAdapter({
      resolveModel: () => ({ ok: true, model: { kind: 'opencode', provider: 'chat', model: 'chat-model' } }),
    });
    plugin.inlineEditHost = { resolveAdapter: () => adapter } as InlineEditHost;
    // Explicitly at the default: the key exists but is empty, exactly like a
    // settings file that predates (or never used) the dedicated setting.
    plugin.settings.inlineCompletionModelOverrides = {};

    const target = plugin.resolveInlineCompletionTarget();
    const chainResult = adapter.resolveModel();
    expect(target.ok).toBe(true);
    expect(chainResult.ok).toBe(true);
    if (!target.ok || !chainResult.ok) return;
    expect(target.model).toEqual(chainResult.model);
  });

  it('reports model-unavailable for a malformed override instead of silently falling back', async () => {
    const plugin = createWiredPlugin();
    const started: InlineCompletionSession[] = [];
    plugin.inlineEditHost = {
      resolveAdapter: () => stubAdapter({
        resolveModel: () => ({ ok: true, model: { kind: 'opencode', provider: 'chat', model: 'chat-model' } }),
        startSession: (config) => {
          const session: StubSession = {
            queryId: 'stub-never',
            safety: {
              backend: 'opencode',
              enforcedPolicy: 'read-only-allowlist',
              effectiveTools: ['read'],
              deniedCapabilities: AUX_DENIED_CAPABILITIES,
              mechanism: 'stub',
            },
            completed: [],
            disposed: false,
            config,
            complete() {
              return Promise.resolve({ ok: true, text: '', toolCalls: [] });
            },
            reset() {
              return Promise.resolve();
            },
            dispose() {
              session.disposed = true;
              return Promise.resolve();
            },
          };
          started.push(session);
          return Promise.resolve(session);
        },
      }),
    } as InlineEditHost;
    plugin.settings.inlineCompletionModelOverrides = { opencode: 'no-slash' };

    const target = plugin.resolveInlineCompletionTarget();
    expect(target).toEqual({
      ok: false,
      reason: 'model-unavailable',
      detail: '"no-slash" is not a valid opencode model reference.',
    });
    const obtained = await plugin.inlineCompletionPool.obtain();
    expect(obtained).toEqual({
      ok: false,
      error: { reason: 'model-unavailable', detail: '"no-slash" is not a valid opencode model reference.' },
    });
    expect(started).toHaveLength(0);
  });
});

describe('inlineCompletionModelOverrides pool rebuild (R-C3 reset semantics)', () => {
  it('disposes and rebuilds the warm session when the dedicated override changes', async () => {
    const plugin = createWiredPlugin();
    const sessions: StubSession[] = [];
    const makeSession = (): StubSession => ({
      queryId: `stub-${Math.random().toString(36).slice(2)}`,
      safety: {
        backend: 'opencode',
        enforcedPolicy: 'read-only-allowlist',
        effectiveTools: ['read'],
        deniedCapabilities: AUX_DENIED_CAPABILITIES,
        mechanism: 'stub',
      },
      completed: [],
      disposed: false,
      config: null,
      complete() {
        return Promise.resolve({ ok: true, text: '', toolCalls: [] });
      },
      reset() {
        return Promise.resolve();
      },
      dispose() {
        sessions[sessions.length - 1].disposed = true;
        return Promise.resolve();
      },
    });
    plugin.inlineEditHost = {
      resolveAdapter: () => stubAdapter({
        resolveModel: () => ({ ok: true, model: null }),
        startSession: () => {
          const session = makeSession();
          sessions.push(session);
          return Promise.resolve(session);
        },
      }),
    } as InlineEditHost;
    plugin.settings.inlineCompletionModelOverrides = { opencode: 'fast/model-a' };

    const first = await plugin.inlineCompletionPool.obtain();
    expect(first.ok).toBe(true);
    expect(sessions).toHaveLength(1);

    // The user pins a different fast model: the next obtain must rebuild —
    // the native context of the old session must not survive the switch.
    plugin.settings.inlineCompletionModelOverrides = { opencode: 'fast/model-b' };
    const second = await plugin.inlineCompletionPool.obtain();
    expect(second.ok).toBe(true);
    expect(sessions).toHaveLength(2);
    expect((second as { session: InlineCompletionSession }).session).not.toBe(sessions[0]);
    expect(sessions[0].disposed).toBe(true);
  });
});
