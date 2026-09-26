/**
 * ZCodeAdapter auxiliary-query wiring.
 *
 * Generic ZCode aux remains unadvertised until the real Test Vault audit is
 * attached, but this seam must already create a second isolated app-server and
 * never reuse the user's chat transport or storage root.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
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
  env: {
    ZCODE_STORAGE_DIR: '/home/tester/.zcode',
    ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: '/builtin/zcode-builtin.json',
    ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: '/home/tester/.zcode/v2/provider_config.json',
  },
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

const catalogSettings = {
  model: {
    available: [{
      ref: { providerId: 'krill', modelId: 'gpt-6-sol' },
      label: 'GPT-6 Sol', providerLabel: 'Krill',
      reasoning: { levels: [{ value: 'none', label: 'None' }], defaultLevel: 'none' },
      properties: { inputFormat: { supportsImage: true } },
    }],
    current: { providerId: 'krill', modelId: 'gpt-6-sol', options: { reasoningLevel: 'none' } },
  },
};

interface TransportConstruction {
  readonly options: ConstructorParameters<typeof ZCodeAppServerTransport>[0];
  readonly transport: FakeTransport;
}

class FakeTransport {
  readonly calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  private readonly notifications = new Map<string, (params: Record<string, unknown>) => void>();
  private messages: unknown[] = [];

  constructor(private readonly options: ConstructorParameters<typeof ZCodeAppServerTransport>[0], private readonly role: 'chat' | 'aux') {}

  async start(): Promise<void> { /* no process in the unit fake */ }

  async request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    this.calls.push({ method, ...(params ? { params } : {}) });
    if (method === 'runtime/capabilities') return { independentPlanState: true } as T;
    if (method === 'session/create') return {
      session: { sessionId: this.role === 'chat' ? 'chat-session' : 'aux-session' }, settings: catalogSettings,
    } as T;
    if (method === 'session/read') return { settings: catalogSettings } as T;
    if (method === 'session/messages') return { messages: this.messages } as T;
    if (method === 'session/send') {
      this.messages.push({ info: { role: 'user', messageId: 'aux-user', tools: {} }, parts: [] });
      queueMicrotask(() => this.emit('session/event', {
        type: 'turn.completed', sessionId: 'aux-session', payload: { response: 'AUX_IMAGE_OK', toolCallCount: 0 },
      }));
      return { accepted: true } as T;
    }
    if (method === 'session/stop') return { stopped: true } as T;
    return {} as T;
  }

  onNotification(method: string, handler: (params: Record<string, unknown>) => void): { dispose(): void } {
    this.notifications.set(method, handler);
    return { dispose: () => this.notifications.delete(method) };
  }

  onServerRequest(): { dispose(): void } { return { dispose: jest.fn() }; }

  dispose(): void { this.options.onExit?.({ exitCode: 0, signal: null }); }

  private emit(method: string, params: Record<string, unknown>): void { this.notifications.get(method)?.(params); }
}

describe('ZCodeAdapter auxiliary-query wiring', () => {
  let adapter: ZCodeAdapter;
  let constructions: TransportConstruction[];

  beforeEach(async () => {
    constructions = [];
    adapter = new ZCodeAdapter({
      workingDirectory: '/vault',
      resolveRuntime: () => readyResolution,
      discoverProviderConfig: () => providerConfig,
      createTransport: (options) => {
        const transport = new FakeTransport(options, constructions.length === 0 ? 'chat' : 'aux');
        constructions.push({ options, transport });
        return transport as unknown as ZCodeAppServerTransport;
      },
    });
    await adapter.start();
  });

  afterEach(() => { adapter.dispose(); jest.restoreAllMocks(); });

  it('advertises audited AuxQuery while direct construction owns a second private transport', async () => {
    expect(adapter.hasCapability(AgentCapability.AuxQuery)).toBe(true);
    const session = await adapter.startAuxQuerySession({
      systemPrompt: 'Read only.',
      workingDirectory: '/vault',
      model: { kind: 'zcode', provider: 'krill', model: 'gpt-6-sol', reasoningLevel: 'none' },
    });
    expect(constructions).toHaveLength(2);
    const aux = constructions[1];
    expect(aux.options.extraEnv).toEqual(expect.objectContaining({
      ZCODE_STORAGE_DIR: expect.stringMatching(/opencodian-zcode-aux-/),
      ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: '/builtin/zcode-builtin.json',
      ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: '/home/tester/.zcode/v2/provider_config.json',
    }));
    expect(aux.options.extraEnv?.['ZCODE_STORAGE_DIR']).not.toBe(providerConfig.dataRoot);
    expect(aux.transport.calls).toContainEqual(expect.objectContaining({
      method: 'session/create',
      params: expect.objectContaining({
        persistence: 'deferred', mcpServers: [], toolAllowlist: [], dynamicWorkflowEnabled: false,
      }),
    }));
    expect(constructions[0].transport.calls.map((call) => call.method)).toEqual(['runtime/capabilities']);
    await session.dispose();
  });

  it('sends an image only through the private transport after native empty-tool readback', async () => {
    const session = await adapter.startAuxQuerySession({
      systemPrompt: 'Read only.', workingDirectory: '/vault',
      model: { kind: 'zcode', provider: 'krill', model: 'gpt-6-sol', reasoningLevel: 'none' },
    });
    await expect(session.query({
      prompt: 'Inspect this image.',
      images: [{ mediaType: 'image/png', data: 'iVBORw0KGgo=' }],
    })).resolves.toEqual({ success: true, text: 'AUX_IMAGE_OK', toolCalls: [] });
    const aux = constructions[1].transport;
    expect(aux.calls.find((call) => call.method === 'session/send')?.params).toEqual(expect.objectContaining({
      attachments: [{ kind: 'image', filename: 'attachment-1', mimeType: 'image/png', sizeBytes: 8, dataBase64: 'iVBORw0KGgo=' }],
    }));
    expect(constructions[0].transport.calls.map((call) => call.method)).toEqual(['runtime/capabilities']);
    await session.dispose();
  });

  it('rejects missing required session configuration before creating an auxiliary process', async () => {
    await expect(adapter.startAuxQuerySession({ systemPrompt: 'x' } as never)).rejects.toThrow('requires a workspace path');
    expect(constructions).toHaveLength(1);
  });
});
