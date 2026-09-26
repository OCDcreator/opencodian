import * as fs from 'node:fs';
import * as path from 'node:path';

import { afterEach, describe, expect, it, jest } from '@jest/globals';

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

describe('ZCodeAuxQuerySession', () => {
  const tempParent = path.join(process.cwd(), '.visual-evidence');
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
        const fake = new FakeAuxTransport(options, mode);
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
