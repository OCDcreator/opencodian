/**
 * ZCodeAdapter.models.test.ts — live catalog wiring, pre-send validation,
 * session-override-vs-defaults boundaries (ticket 06).
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { ZCodeAdapter } from '../../../../../src/core/agents/backend/zcode/ZCodeAdapter';
import type { ZCodeAppServerTransport } from '../../../../../src/core/agents/backend/zcode/ZCodeAppServerTransport';
import type { ZCodeProviderConfigSnapshot } from '../../../../../src/core/agents/backend/zcode/ZCodeProviderConfigDiscovery';
import type { ZCodeRuntimeResolution } from '../../../../../src/core/agents/backend/zcode/ZCodeRuntimeResolver';

const providerConfig: ZCodeProviderConfigSnapshot = {
  dataRoot: '/home/tester/.zcode',
  configPath: '/home/tester/.zcode/v2/provider_config.json',
  builtinConfigPath: '/builtin/zcode-builtin.json',
  state: 'validated',
  providerCount: 7,
  detail: null,
  env: { ZCODE_STORAGE_DIR: '/home/tester/.zcode' },
};

const readyResolution: ZCodeRuntimeResolution = {
  mode: 'ready',
  launch: {
    command: '/runtime/zcode-agent',
    args: ['app-server', '--stdio'],
    entryKind: 'native-binary',
    entryPath: '/runtime/zcode-agent',
    source: 'app-bundled',
    extraEnv: {},
  },
};

const snapshotSettings = {
  model: {
    available: [
      {
        ref: { providerId: 'opencode-go', modelId: 'grok-4.5' },
        label: 'grok-4.5',
        providerLabel: 'opencode-go',
        contextWindow: 200000,
        reasoning: { levels: [{ value: 'low' }, { value: 'high' }], defaultLevel: 'low' },
      },
      {
        ref: { providerId: 'opencode-go', modelId: 'mimo-v2.6-pro' },
        label: 'mimo-v2.6-pro',
        providerLabel: 'opencode-go',
        contextWindow: 1048576,
        reasoning: { levels: [{ value: 'disabled' }, { value: 'enabled' }], defaultLevel: 'enabled' },
      },
    ],
    current: { providerId: 'opencode-go', modelId: 'grok-4.5' },
  },
  thoughtLevel: { available: [{ value: 'disabled' }, { value: 'enabled' }], current: 'enabled', enabled: true },
  mode: { current: 'build' },
  slashCommands: [{ name: 'goal', description: 'Set the goal', inputHint: '/goal', source: 'builtin' }],
};

interface Call {
  method: string;
  params?: Record<string, unknown>;
}

let calls: Call[];
let notificationHandler: ((params: Record<string, unknown>) => void) | null;
let adapter: ZCodeAdapter;

async function startAdapter(settings: Record<string, unknown> = {}, ignoreThoughtLevelWrites = false): Promise<void> {
  calls = [];
  notificationHandler = null;
  let effectiveMode = 'build';
  let planEnabled = false;
  const modeEvents: Array<Record<string, unknown>> = [];
  let effectiveModel: Record<string, unknown> = { providerId: 'opencode-go', modelId: 'grok-4.5' };
  let effectiveThoughtLevel = 'enabled';
  const effectiveSettings = () => ({
    ...snapshotSettings, mode: { current: effectiveMode },
    model: { ...snapshotSettings.model, current: effectiveModel },
    thoughtLevel: { ...snapshotSettings.thoughtLevel, current: effectiveThoughtLevel },
  });
  const fake = {
    start: jest.fn(async () => {}),
    request: jest.fn(async (method: string, params?: Record<string, unknown>) => {
      calls.push({ method, ...(params ? { params } : {}) });
      if (method === 'runtime/capabilities') return { independentPlanState: true };
      if (method === 'session/create') return { session: { sessionId: 'sess_a' }, settings: snapshotSettings };
      if (method === 'session/read') return {
        session: { sessionId: 'sess_a' }, settings: {
          ...effectiveSettings(),
          // Native session/read is a narrow projection: only the current
          // model is returned here.  The selector must retain the wider
          // catalog learned from create/resume.
          model: { ...effectiveSettings().model, available: [snapshotSettings.model.available[0]] },
        }, messages: [],
        projection: { contextWindow: 200000 },
      };
      if (method === 'session/usage') return {
        totalTokens: 120, inputTokens: 100, outputTokens: 20,
        reasoningTokens: 7, cacheReadTokens: 9, cacheCreationTokens: 2,
      };
      if (method === 'session/setModel') {
        effectiveModel = params?.['model'] as Record<string, unknown>;
        return { settings: effectiveSettings() };
      }
      if (method === 'session/setThoughtLevel') {
        if (!ignoreThoughtLevelWrites) effectiveThoughtLevel = String(params?.['thoughtLevel']);
        return { settings: effectiveSettings() };
      }
      if (method === 'session/setMode') {
        const previousMode = effectiveMode;
        const previousPlanEnabled = planEnabled;
        planEnabled = params?.['mode'] === 'plan';
        if (!planEnabled) effectiveMode = String(params?.['mode']);
        modeEvents.push({
          type: 'session.updated', sessionId: 'sess_a', seq: modeEvents.length + 1,
          payload: { mode: effectiveMode, planEnabled, previousMode, previousPlanEnabled },
        });
        return { settings: effectiveSettings() };
      }
      if (method === 'session/events') return { events: [
        { type: 'session.updated', sessionId: 'sess_a', seq: 0,
          payload: { mode: effectiveMode, planEnabled: true } },
        ...modeEvents,
      ] };
      if (method === 'session/resume') return { settings: snapshotSettings };
      return {};
    }),
    dispose: jest.fn(),
    onNotification: jest.fn((method: string, handler: (params: Record<string, unknown>) => void) => {
      if (method === 'state.updated') notificationHandler = handler;
      return { dispose: jest.fn() };
    }),
    onServerRequest: jest.fn(() => ({ dispose: jest.fn() })),
  };
  adapter = new ZCodeAdapter({
    workingDirectory: '/vault',
    resolveRuntime: () => readyResolution,
    discoverProviderConfig: () => providerConfig,
    createTransport: () => fake as unknown as ZCodeAppServerTransport,
    getSettings: () => settings,
  });
  await adapter.start();
}

afterEach(() => {
  adapter.dispose();
  jest.restoreAllMocks();
});

describe('ZCodeAdapter — live model catalog and boundaries', () => {
  it('reports the catalog honestly unavailable until a snapshot is observed', async () => {
    await startAdapter();
    await expect(adapter.getAvailableModels()).rejects.toThrow('catalog unavailable');
    expect(adapter.getSlashCommands()).toEqual([]);
  });

  it('captures the live catalog from a session snapshot and exposes models and slash commands', async () => {
    await startAdapter();
    await adapter.createSession();
    const models = await adapter.getAvailableModels();
    expect(models.map((model) => model.modelId)).toEqual(['grok-4.5', 'mimo-v2.6-pro']);
    expect(models[1].reasoningLevels.map((level) => level.value)).toEqual(['disabled', 'enabled']);
    expect(adapter.getSlashCommands().map((command) => command.name)).toEqual(['goal']);
  });

  it('keeps the full catalog when restored session/read projects only the current model', async () => {
    await startAdapter();
    await adapter.createSession();
    // The fake native read path below intentionally returns the normal
    // current-model projection; resume is the full catalog boundary.
    await adapter.getSession('sess_a');
    expect((await adapter.getAvailableModels()).map((model) => model.modelId)).toEqual([
      'grok-4.5',
      'mimo-v2.6-pro',
    ]);
  });

  it('reads context usage for the requested native session without inventing cost', async () => {
    await startAdapter();
    await adapter.createSession();
    const snapshot = await adapter.getSessionContextUsageSnapshot('sess_a');
    expect(snapshot).toMatchObject({
      sessionId: 'sess_a', contextWindow: 200000, totalTokens: 120,
      inputTokens: 100, outputTokens: 20, totalCost: null,
    });
    expect(calls.at(-1)).toEqual({ method: 'session/usage', params: { sessionId: 'sess_a' } });
  });

  it('applies persisted defaults at session materialization (never mid-turn)', async () => {
    await startAdapter({ model: 'opencode-go/mimo-v2.6-pro', thinkingLevel: 'enabled', mode: 'edit' });
    await adapter.createSession();
    const setModel = calls.find((call) => call.method === 'session/setModel');
    expect(setModel?.params).toEqual({
      sessionId: 'sess_a',
      model: { providerId: 'opencode-go', modelId: 'mimo-v2.6-pro', options: { reasoningLevel: 'enabled' } },
    });
    expect(calls.some((call) => call.method === 'session/setThoughtLevel' && call.params?.['thoughtLevel'] === 'enabled')).toBe(true);
    expect(calls.some((call) => call.method === 'session/setMode' && call.params?.['mode'] === 'edit')).toBe(true);
  });

  it('rejects unsupported models and reasoning levels before any native request', async () => {
    await startAdapter();
    await adapter.createSession();
    calls = [];
    await expect(adapter.setSessionModel('sess_a', { providerId: 'opencode-go', modelId: 'unknown-1' }))
      .rejects.toThrow('not in the live ZCode catalog');
    await expect(adapter.setSessionModel('sess_a', { providerId: 'opencode-go', modelId: 'grok-4.5', reasoningLevel: 'ultra' }))
      .rejects.toThrow('not supported');
    await expect(adapter.setSessionThoughtLevel('sess_a', 'superthink')).rejects.toThrow();
    await expect(adapter.setSessionMode('sess_a', 'turbo')).rejects.toThrow('not supported');
    expect(calls).toEqual([]);
  });

  it('sends a validated model with the resolved reasoning level to session/setModel', async () => {
    await startAdapter();
    await adapter.createSession();
    calls = [];
    await adapter.setSessionModel('sess_a', { providerId: 'opencode-go', modelId: 'grok-4.5' });
    const setModel = calls.find((call) => call.method === 'session/setModel');
    expect(setModel?.params?.['model']).toEqual({
      providerId: 'opencode-go',
      modelId: 'grok-4.5',
      options: { reasoningLevel: 'low' },
    });
  });

});

describe('ZCodeAdapter — native readback and turn boundaries', () => {
  it('confirms independent thoughtLevel through the same native session readback', async () => {
    await startAdapter();
    await adapter.createSession();
    calls = [];
    await adapter.setSessionThoughtLevel('sess_a', 'disabled');
    expect(calls).toEqual([
      { method: 'session/resume', params: { sessionId: 'sess_a' } },
      { method: 'session/setThoughtLevel', params: { sessionId: 'sess_a', thoughtLevel: 'disabled' } },
      { method: 'session/read', params: { sessionId: 'sess_a' } },
    ]);
  });

  it('rejects an unconfirmed thoughtLevel instead of treating request acceptance as success', async () => {
    await startAdapter({}, true);
    await adapter.createSession();
    calls = [];
    await expect(adapter.setSessionThoughtLevel('sess_a', 'disabled')).rejects.toThrow('readback did not confirm');
    expect(calls.at(-1)).toEqual({ method: 'session/read', params: { sessionId: 'sess_a' } });
  });

  it('accepts a plan request when native readback projects its base build mode', async () => {
    await startAdapter();
    await adapter.createSession();
    await expect(adapter.setSessionMode('sess_a', 'plan')).resolves.toBeUndefined();
    expect(calls.some((call) => call.method === 'session/setMode' && call.params?.['mode'] === 'plan')).toBe(true);
    expect(calls.at(-1)?.method).toBe('session/read');
  });

  it('confirms independent plan state only from the native session event readback', async () => {
    await startAdapter();
    await adapter.createSession();
    expect(await adapter.readSessionMode('sess_a')).toBe('build');
    await adapter.setSessionMode('sess_a', 'plan');
    expect(await adapter.readSessionMode('sess_a')).toBe('plan');
    expect(calls.at(-1)).toEqual({ method: 'session/events', params: { sessionId: 'sess_a' } });
    await adapter.setSessionMode('sess_a', 'build');
    expect(await adapter.readSessionMode('sess_a')).toBe('build');
  });

  it('keeps the catalog warm from state.updated patches', async () => {
    await startAdapter();
    await adapter.createSession();
    notificationHandler?.({ patch: { mode: { current: 'edit' } } });
    const models = await adapter.getAvailableModels();
    expect(models).toHaveLength(2);
  });

  it('applies the conversation override at the turn boundary via request options', async () => {
    await startAdapter();
    await adapter.createSession();
    calls = [];
    const done = (async () => {
      for await (const _chunk of adapter.sendMessage({
        sessionId: 'sess_a',
        content: 'hi',
        options: { provider: 'opencode-go', model: 'mimo-v2.6-pro', variant: 'enabled' },
      })) { void _chunk; }
    })();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    const setModel = calls.find((call) => call.method === 'session/setModel');
    expect(setModel?.params?.['model']).toMatchObject({
      providerId: 'opencode-go', modelId: 'mimo-v2.6-pro', options: { reasoningLevel: 'enabled' },
    });
    expect(calls.some((call) => call.method === 'session/setThoughtLevel')).toBe(false);
    await adapter.cancelStream('sess_a');
    await done;
  });

  it('parses the persisted default model into provider and model parts', async () => {
    await startAdapter({ model: 'opencode-go/mimo-v2.6-pro' });
    expect(adapter.getDefaultModel()).toEqual({ provider: 'opencode-go', model: 'mimo-v2.6-pro' });
  });
});
