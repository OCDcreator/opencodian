import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import type { InlineCompletionSessionConfig } from '../../../../../src/core/agents/backend/AgentInlineCompletionCapability';
import { ZCodeAdapter } from '../../../../../src/core/agents/backend/zcode/ZCodeAdapter';
import type { ZCodeAppServerTransport } from '../../../../../src/core/agents/backend/zcode/ZCodeAppServerTransport';
import type { ZCodeProviderConfigSnapshot } from '../../../../../src/core/agents/backend/zcode/ZCodeProviderConfigDiscovery';
import type { ZCodeRuntimeResolution } from '../../../../../src/core/agents/backend/zcode/ZCodeRuntimeResolver';

const providerConfig: ZCodeProviderConfigSnapshot = {
  dataRoot: '/home/tester/.zcode',
  configPath: '/home/tester/.zcode/v2/provider_config.json',
  builtinConfigPath: '/builtin/zcode-builtin.json',
  state: 'validated',
  providerCount: 1,
  detail: null,
  env: { ZCODE_STORAGE_DIR: '/home/tester/.zcode' },
};

const readyResolution: ZCodeRuntimeResolution = {
  mode: 'ready',
  launch: {
    command: '/runtime/zcode-agent', args: ['app-server', '--stdio'], entryKind: 'native-binary',
    entryPath: '/runtime/zcode-agent', source: 'app-bundled', extraEnv: {},
  },
};

const settings = {
  model: {
    available: [{
      ref: { providerId: 'krill', modelId: 'gpt-6-sol' }, label: 'GPT-6 Sol', providerLabel: 'Krill',
      contextWindow: 200_000,
      reasoning: { levels: [{ value: 'none', label: 'None' }], defaultLevel: 'none' },
    }],
    current: { providerId: 'krill', modelId: 'gpt-6-sol', options: { reasoningLevel: 'none' } },
  },
  thoughtLevel: { available: [], enabled: false }, mode: { current: 'build' },
};

const config: InlineCompletionSessionConfig = {
  systemPrompt: 'Complete text only.', workingDirectory: '/vault',
  model: { kind: 'zcode', provider: 'krill', model: 'gpt-6-sol' },
};

describe('ZCodeAdapter inline completion', () => {
  let adapter: ZCodeAdapter;
  let calls: Array<{ method: string; params?: Record<string, unknown> }>;

  beforeEach(async () => {
    calls = [];
    const transport = {
      start: jest.fn(async () => {}),
      request: jest.fn(async (method: string, params?: Record<string, unknown>) => {
        calls.push({ method, ...(params ? { params } : {}) });
        if (method === 'runtime/capabilities') return { independentPlanState: true };
        if (method === 'session/create') return { session: { sessionId: 'sess-chat' }, settings };
        if (method === 'workspace/generateText') return { text: 'suggestion', toolCalls: [] };
        return {};
      }),
      dispose: jest.fn(),
      onNotification: jest.fn(() => ({ dispose: jest.fn() })),
      onServerRequest: jest.fn(() => ({ dispose: jest.fn() })),
    };
    adapter = new ZCodeAdapter({
      workingDirectory: '/vault', resolveRuntime: () => readyResolution,
      discoverProviderConfig: () => providerConfig,
      createTransport: () => transport as unknown as ZCodeAppServerTransport,
    });
    await adapter.start();
  });

  afterEach(() => { adapter.dispose(); jest.restoreAllMocks(); });

  it('keeps text completion unadvertised when native direct generation misses the shared latency budget', () => {
    expect(adapter.hasCapability(AgentCapability.InlineCompletion)).toBe(true);
    expect(adapter.hasCapability(AgentCapability.AuxQuery)).toBe(true);
  });

  it('requires a catalog before opening a direct completion path', async () => {
    await expect(adapter.startInlineCompletionSession(config)).rejects.toThrow('observed native model catalog');
    expect(calls.map((call) => call.method)).toEqual(['runtime/capabilities']);
  });

  it('uses the current native reasoning readback and never creates a completion session', async () => {
    await adapter.createSession();
    const session = await adapter.startInlineCompletionSession(config);

    await expect(session.complete({ prefix: 'A', suffix: 'B', maxChars: 20 })).resolves.toEqual({
      ok: true, text: 'suggestion', toolCalls: [],
    });
    expect(calls.filter((call) => call.method === 'session/create')).toHaveLength(1);
    expect(calls).toContainEqual(expect.objectContaining({
      method: 'workspace/generateText',
      params: expect.objectContaining({
        selection: { providerId: 'krill', modelId: 'gpt-6-sol', options: { reasoningLevel: 'none' } },
        tools: [],
      }),
    }));
  });

  it('rejects a non-ZCode completion model before the direct request', async () => {
    await adapter.createSession();
    await expect(adapter.startInlineCompletionSession({
      ...config,
      model: { kind: 'opencode', provider: 'other', model: 'model' },
    })).rejects.toThrow('requires a ZCode model selection');
    expect(calls.map((call) => call.method)).not.toContain('workspace/generateText');
  });
});
