import * as fs from 'node:fs';
import * as path from 'node:path';

import { afterAll, afterEach, describe, expect, it, jest } from '@jest/globals';

import type { ZCodeAuxTransport } from '../../../../../src/core/agents/backend/zcode/ZCodeAuxQuerySession';
import { ZCodeAuxQuerySession } from '../../../../../src/core/agents/backend/zcode/ZCodeAuxQuerySession';
import type { ZCodeRuntimeLaunch } from '../../../../../src/core/agents/backend/zcode/ZCodeRuntimeResolver';

const launch: ZCodeRuntimeLaunch = {
  command: '/runtime/zcode-agent',
  args: ['app-server', '--stdio'],
  entryKind: 'native-binary',
  entryPath: '/runtime/zcode-agent',
  source: 'configured',
  extraEnv: {},
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

class FakeAuxTransport implements ZCodeAuxTransport {
  readonly requests: Array<{ method: string; params?: Record<string, unknown> }> = [];
  private readonly handlers = new Map<string, (params: Record<string, unknown>) => void>();
  private readonly onExit: (() => void) | undefined;
  private readonly mode: 'success' | 'tools' | 'events' | 'event-no-name' | 'count-missing' | 'stale-followup' | 'malformed-user-id' | 'hang';
  private messages: unknown[] = [];
  private sentTurns = 0;

  constructor(options: { onExit?: () => void }, mode: FakeAuxTransport['mode'] = 'success') {
    this.onExit = options.onExit;
    this.mode = mode;
  }

  async start(): Promise<void> { /* no child in the unit fake */ }

  async request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    this.requests.push({ method, ...(params ? { params } : {}) });
    if (method === 'session/create') return {
      session: { sessionId: 'aux-session' },
      settings: catalogSettings,
    } as T;
    if (method === 'session/read') return { settings: catalogSettings } as T;
    if (method === 'session/messages') return { messages: this.messages } as T;
    if (method === 'session/send') {
      this.sentTurns += 1;
      const tools = this.mode === 'tools' ? { Read: true } : {};
      if (!(this.mode === 'stale-followup' && this.sentTurns > 1)) {
        this.messages.push({ info: {
          role: 'user',
          ...(this.mode === 'malformed-user-id' ? {} : { messageId: `user-${this.sentTurns}` }),
          tools,
        }, parts: [] });
      }
      if (this.mode === 'success' || (this.mode === 'stale-followup' && this.sentTurns === 1)) {
        queueMicrotask(() => this.emit('session/event', {
          type: 'turn.completed', sessionId: 'aux-session', payload: { response: 'AUX_OK', toolCallCount: 0 },
        }));
      } else if (this.mode === 'events') {
        queueMicrotask(() => {
          this.emit('session/event', { type: 'tool.updated', sessionId: 'aux-session', payload: { toolName: 'Read' } });
          this.emit('session/event', {
            type: 'turn.completed', sessionId: 'aux-session', payload: { response: 'AUX_OK', toolCallCount: 1 },
          });
        });
      } else if (this.mode === 'event-no-name') {
        queueMicrotask(() => {
          this.emit('session/event', { type: 'tool.updated', sessionId: 'aux-session', payload: {} });
          this.emit('session/event', {
            type: 'turn.completed', sessionId: 'aux-session', payload: { response: 'AUX_OK', toolCallCount: 0 },
          });
        });
      } else if (this.mode === 'count-missing') {
        queueMicrotask(() => this.emit('session/event', {
          type: 'turn.completed', sessionId: 'aux-session', payload: { response: 'AUX_OK' },
        }));
      }
      return { accepted: true } as T;
    }
    if (method === 'session/stop') return { stopped: true } as T;
    return {} as T;
  }

  onNotification(method: string, handler: (params: Record<string, unknown>) => void): { dispose(): void } {
    this.handlers.set(method, handler);
    return { dispose: () => this.handlers.delete(method) };
  }

  dispose(): void { this.onExit?.(); }

  private emit(method: string, params: Record<string, unknown>): void { this.handlers.get(method)?.(params); }
}


/** Independent startup fake; the existing turn fake remains unchanged. */
class HookFreeAuxTransport extends FakeAuxTransport {
  async request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (method === 'plugins/list') {
      this.requests.push({ method, ...(params ? { params } : {}) });
      return { plugins: [] } as T;
    }
    return super.request<T>(method, params);
  }
}

describe('ZCodeAuxQuerySession', () => {
  const tempBase = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(tempBase, { recursive: true });
  const tempParent = fs.mkdtempSync(path.join(tempBase, 'zcode-aux-unit-'));
  const createdRoots = new Set<string>();
  let lastTransport: FakeAuxTransport | null = null;

  function auxRoots(): string[] {
    return fs.readdirSync(tempParent).filter((name) => name.startsWith('opencodian-zcode-aux-'));
  }

  afterEach(() => {
    jest.restoreAllMocks();
    for (const root of createdRoots) {
      if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
    }
    createdRoots.clear();
  });

  afterAll(() => {
    // The suite owns this empty parent; keep the ignored product-evidence tree out of unit tests.
    fs.rmdirSync(tempParent);
  });

  function create(mode: FakeAuxTransport['mode'] = 'success', turnTimeoutMs?: number): Promise<ZCodeAuxQuerySession> {
    return ZCodeAuxQuerySession.create({
      launch,
      providerConfigEnv: {
        ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: '/readonly/builtin.json',
        ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: '/readonly/personal.json',
      },
      workingDirectory: '/vault',
      systemPrompt: 'Read only.',
      model: { kind: 'zcode', provider: 'krill', model: 'gpt-6-sol', reasoningLevel: 'none' },
      ...(turnTimeoutMs !== undefined ? { turnTimeoutMs } : {}),
      tempParent,
      createTransport: (options) => {
        const fake = new HookFreeAuxTransport(options, mode);
        lastTransport = fake;
        return fake;
      },
    });
  }

  it('uses the native empty tool readback and transports the official image shape', async () => {
    const before = auxRoots();
    const session = await create();
    const result = await session.query({
      prompt: 'Inspect the image.',
      images: [{ mediaType: 'image/png', data: 'iVBORw0KGgo=' }],
    });
    expect(result).toEqual({ success: true, text: 'AUX_OK', toolCalls: [] });
    expect(session.safety.effectiveTools).toEqual([]);
    expect(lastTransport?.requests.find((request) => request.method === 'session/send')?.params?.['attachments']).toEqual([{
      kind: 'image', filename: 'attachment-1', mimeType: 'image/png', sizeBytes: 8, dataBase64: 'iVBORw0KGgo=',
    }]);
    await session.dispose();
    expect(auxRoots()).toEqual(before);
  });

  it('overrides both inherited database aliases with this auxiliary scope', async () => {
    let env: Record<string, string> | undefined;
    const session = await ZCodeAuxQuerySession.create({
      launch,
      providerConfigEnv: {
        ZCODE_SESSION_DB_PATH: '/outside/main.sqlite',
        ZCODE_SESSION_DB: '/outside/legacy.sqlite',
      },
      workingDirectory: '/vault', systemPrompt: 'Read only.', tempParent,
      createTransport: (options) => {
        env = options.extraEnv;
        return new HookFreeAuxTransport(options);
      },
    });
    try {
      const expected = path.join(env?.['ZCODE_STORAGE_DIR'] ?? '', 'session.sqlite');
      expect(expected).toContain('opencodian-zcode-aux-');
      expect(env?.['ZCODE_SESSION_DB_PATH']).toBe(expected);
      expect(env?.['ZCODE_SESSION_DB']).toBe(expected);
      await expect(session.query({ prompt: 'Read-only first turn.' })).resolves.toEqual({
        success: true, text: 'AUX_OK', toolCalls: [],
      });
    } finally {
      await session.dispose();
    }
  });

  it.each(['reasoning_delta', 'thinking_delta'])('accepts %s without mixing reasoning into replacement text', async (kind) => {
    const session = await create();
    const fake = lastTransport as FakeAuxTransport;
    const nativeRequest = fake.request.bind(fake);
    fake.request = async (method, params) => {
      if (method === 'session/send') {
        (fake as unknown as { emit(method: string, params: Record<string, unknown>): void }).emit('session/event', {
          type: 'model.streaming', sessionId: 'aux-session',
          payload: { kind, delta: kind === 'reasoning_delta' ? 'reasoning test fixture' : { text: 'reasoning test fixture' } },
        });
      }
      return nativeRequest(method, params);
    };
    const onTextChunk = jest.fn();
    try {
      await expect(session.query({ prompt: 'Return only replacement text.', onTextChunk })).resolves.toEqual({
        success: true, text: 'AUX_OK', toolCalls: [],
      });
      expect(onTextChunk).not.toHaveBeenCalled();
    } finally {
      await session.dispose();
    }
  });

  it.each(['tool_input_delta', 'tool_call', 'unknown_delta'])('rejects %s while the native tool table is empty', async (kind) => {
    const session = await create();
    const fake = lastTransport as FakeAuxTransport;
    const nativeRequest = fake.request.bind(fake);
    fake.request = async (method, params) => {
      if (method === 'session/send') {
        (fake as unknown as { emit(method: string, params: Record<string, unknown>): void }).emit('session/event', {
          type: 'model.streaming', sessionId: 'aux-session', payload: { kind, delta: 'fixture' },
        });
      }
      return nativeRequest(method, params);
    };
    await expect(session.query({ prompt: 'Return only replacement text.' })).resolves.toEqual({
      success: false,
      error: 'ZCode auxiliary turn emitted an unverified streaming event; the read-only contract was not met.',
    });
    await session.dispose();
  });

  it('rejects a widened native message tool readback and cleans up', async () => {
    const before = auxRoots();
    const session = await create('tools');
    await expect(session.query({ prompt: 'read' })).resolves.toEqual({
      success: false,
      error: 'ZCode auxiliary session could not prove an empty native tool set.',
    });
    await session.dispose();
    expect(session.safety.effectiveTools).toEqual([]);
    expect(auxRoots()).toEqual(before);
  });

  it('rejects observed tool events even if the turn claims success', async () => {
    const before = auxRoots();
    const session = await create('events');
    await expect(session.query({ prompt: 'read' })).resolves.toEqual({
      success: false,
      error: 'ZCode auxiliary turn observed a native tool call; the read-only contract was not met.',
    });
    expect(auxRoots()).toEqual(before);
  });

  it('rejects an unnamed native tool event and a completion without tool-count evidence', async () => {
    const unnamed = await create('event-no-name');
    await expect(unnamed.query({ prompt: 'read' })).resolves.toEqual({
      success: false,
      error: 'ZCode auxiliary turn observed a native tool call; the read-only contract was not met.',
    });
    const missingCount = await create('count-missing');
    await expect(missingCount.query({ prompt: 'read' })).resolves.toEqual({
      success: false,
      error: 'ZCode auxiliary turn observed a native tool call; the read-only contract was not met.',
    });
  });

  it('does not reuse the prior turn native tool readback for a follow-up', async () => {
    const session = await create('stale-followup');
    await expect(session.query({ prompt: 'first' })).resolves.toMatchObject({ success: true });
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 1);
    await expect(session.followUp('second', { signal: abort.signal })).resolves.toEqual({
      success: false,
      error: 'ZCode auxiliary turn was cancelled.',
      cancelled: true,
    });
  });

  it('rejects a current-turn tool readback with no stable native user identity', async () => {
    const session = await create('malformed-user-id');
    await expect(session.query({ prompt: 'read' })).resolves.toEqual({
      success: false,
      error: 'ZCode auxiliary session could not prove an empty native tool set.',
    });
  });

  it('cancels and stops a hanging native turn at the caller boundary', async () => {
    const before = auxRoots();
    const session = await create('hang');
    const running = session.query({ prompt: 'wait' });
    await Promise.resolve();
    session.cancel();
    await expect(running).resolves.toEqual({
      success: false,
      error: 'ZCode auxiliary turn was cancelled.',
      cancelled: true,
    });
    await session.dispose();
    expect(auxRoots()).toEqual(before);
  });

  it('enforces the turn timeout and leaves no owned scope after dispose', async () => {
    const before = auxRoots();
    const session = await create('hang', 5);
    await expect(session.query({ prompt: 'wait' })).resolves.toEqual({
      success: false,
      error: 'ZCode auxiliary turn was cancelled.',
      cancelled: true,
    });
    await session.dispose();
    expect(auxRoots()).toEqual(before);
  });

});


describe('ZCodeAuxQuerySession private hook startup', () => {
  const tempParent = fs.mkdtempSync(path.join(process.cwd(), '.tmp', 'zcode-aux-hook-unit-'));
  function auxRoots(): string[] {
    return fs.readdirSync(tempParent).filter((name) => name.startsWith('opencodian-zcode-aux-'));
  }
  afterAll(() => { fs.rmdirSync(tempParent); });
  it('isolates HOME and workspace, and disables all plugins before session creation', async () => {
    let transport: HookFreeAuxTransport | undefined;
    let env: Record<string, string> | undefined;
    let cwd = '';
    let reads = 0;
    let config: Record<string, unknown> | undefined;
    const session = await ZCodeAuxQuerySession.create({
      launch, workingDirectory: '/vault', systemPrompt: 'Read only.', tempParent,
      providerConfigEnv: { HOME: '/real-user', USERPROFILE: '/real-user', ZCODE_DATA_BASE_DIR: '/real-data' },
      createTransport: (options) => {
        env = options.extraEnv;
        cwd = options.workingDirectory ?? '';
        transport = new HookFreeAuxTransport(options);
        const original = transport.request.bind(transport);
        transport.request = async <T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> => {
          if (method === 'plugins/list') {
            reads += 1;
            config = JSON.parse(fs.readFileSync(path.join(cwd, '.zcode/config.json'), 'utf8')) as Record<string, unknown>;
            return { plugins: [{ id: 'owned@inline', enabled: reads === 1 }] } as T;
          }
          return original<T>(method, params);
        };
        return transport;
      },
    });
    try {
      expect(env?.['HOME']).toBe(cwd);
      expect(env?.['USERPROFILE']).toBe(cwd);
      expect(env?.['ZCODE_DATA_BASE_DIR']).toBe(path.join(cwd, 'data-base'));
      expect(cwd).not.toBe('/vault');
      expect(fs.existsSync(path.join(cwd, '.git'))).toBe(true);
      expect(config).toEqual({ hooks: { enabled: false, events: {} }, plugins: { dirs: [], enabledPlugins: { 'owned@inline': false } } });
      expect(reads).toBe(2);
      expect(transport?.requests.find((r) => r.method === 'session/create')?.params?.['workspace']).toEqual({ workspaceKey: cwd, workspacePath: cwd });
    } finally { await session.dispose(); }
  });

  it.each(['missing', 'enabled', 'changed', 'duplicate'])('rejects %s plugin isolation before session creation', async (mode) => {
    const before = auxRoots();
    let transport: HookFreeAuxTransport | undefined;
    let reads = 0;
    await expect(ZCodeAuxQuerySession.create({
      launch, workingDirectory: '/vault', systemPrompt: 'Read only.', tempParent,
      createTransport: (options) => {
        transport = new HookFreeAuxTransport(options);
        const original = transport.request.bind(transport);
        transport.request = async <T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> => {
          if (method === 'plugins/list') {
            reads += 1;
            if (mode === 'missing') return {} as T;
            return { plugins: reads === 1 ? [{ id: 'owned@inline', enabled: true }] : mode === 'changed'
              ? [{ id: 'unexpected@inline', enabled: false }]
              : mode === 'duplicate' ? [{ id: 'owned@inline', enabled: false }, { id: 'owned@inline', enabled: false }]
                : [{ id: 'owned@inline', enabled: true }] } as T;
          }
          return original<T>(method, params);
        };
        return transport;
      },
    })).rejects.toThrow('plugin isolation');
    expect(transport?.requests.some((r) => r.method === 'session/create')).toBe(false);
    expect(auxRoots()).toEqual(before);
  });

});
