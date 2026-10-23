import { describe, expect, it } from '@jest/globals';

import type { DshAcpClientOptions, DshJsonObject } from '../../../../../src/core/agents/backend/dsh/DshAcpClient';
import { DshAdapter } from '../../../../../src/core/agents/backend/DshAdapter';
import type { StreamChunk } from '../../../../../src/core/types/chat';
import type { DshBackendSettings } from '../../../../../src/core/types/settings';

interface Deferred {
  promise: Promise<DshJsonObject>;
  resolve: (value: DshJsonObject) => void;
  reject: (error: Error) => void;
}

function deferred(): Deferred {
  let resolve!: Deferred['resolve'];
  let reject!: Deferred['reject'];
  const promise = new Promise<DshJsonObject>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

class FakeDshClient {
  isStarted = false;
  readonly calls: Array<{ method: string; params?: unknown }> = [];
  readonly prompts = new Map<string, Deferred[]>();
  autoSettleCancel = true;
  settlePromptsOnStop = true;
  resumeGate: Deferred | null = null;
  newSessionGate: Deferred | null = null;
  stopError: Error | null = null;
  list: (cursor?: string) => Promise<DshJsonObject> = async () => ({ sessions: [] });
  private nextSession = 1;

  constructor(readonly options: DshAcpClientOptions) {}

  async start(): Promise<void> { this.isStarted = true; this.calls.push({ method: 'start' }); }
  async stop(): Promise<void> {
    this.isStarted = false;
    this.calls.push({ method: 'stop' });
    if (this.settlePromptsOnStop) {
      for (const queue of this.prompts.values()) for (const prompt of queue) prompt.reject(new Error('stopped'));
    }
    if (this.stopError) throw this.stopError;
  }
  async newSession(cwd: string): Promise<DshJsonObject> {
    const sessionId = `created-${this.nextSession++}`;
    this.calls.push({ method: 'session/new', params: { cwd } });
    return this.newSessionGate?.promise ?? { sessionId };
  }
  async listSessions(cwd?: string, cursor?: string): Promise<DshJsonObject> {
    this.calls.push({ method: 'session/list', params: { cwd, cursor } });
    return this.list(cursor);
  }
  async resumeSession(sessionId: string, cwd: string): Promise<DshJsonObject> {
    this.calls.push({ method: 'session/resume', params: { sessionId, cwd } });
    return this.resumeGate?.promise ?? { configOptions: [] };
  }
  prompt(sessionId: string, text: string): Promise<DshJsonObject> {
    this.calls.push({ method: 'session/prompt', params: { sessionId, text } });
    const turn = deferred();
    const queue = this.prompts.get(sessionId) ?? [];
    queue.push(turn);
    this.prompts.set(sessionId, queue);
    return turn.promise;
  }
  cancel(sessionId: string): void {
    this.calls.push({ method: 'session/cancel', params: { sessionId } });
    if (this.autoSettleCancel) this.resolvePrompt(sessionId);
  }
  resolvePrompt(sessionId: string, result: DshJsonObject = { stopReason: 'end_turn' }): void {
    this.prompts.get(sessionId)?.shift()?.resolve(result);
  }
  rejectPrompt(sessionId: string, error: Error): void { this.prompts.get(sessionId)?.shift()?.reject(error); }
  emitUpdate(sessionId: string, update: DshJsonObject): void {
    this.options.onUpdate?.({ sessionId, update });
  }
  disconnect(): void {
    this.isStarted = false;
    this.options.onProtocolError?.(new Error('fixture disconnected'));
  }
}

function settings(): DshBackendSettings {
  return { executablePath: '/opt/dsh', workingDirectory: '/vault', args: [], env: {}, profile: 'acp' };
}

function adapterFixture(adapterOptions: { cancelTimeoutMs?: number } = {}) {
  const current = settings();
  const clients: FakeDshClient[] = [];
  const adapter = new DshAdapter({
    workingDirectory: '/vault',
    getSettings: () => current,
    createClient: (options) => {
      const client = new FakeDshClient(options);
      clients.push(client);
      return client;
    },
    ...adapterOptions,
  });
  return { adapter, clients, current };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function collect(stream: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

describe('DshAdapter', () => {
  it('resumes the known backend session on the first send after adapter restart', async () => {
    const { adapter, clients } = adapterFixture();
    const sessionId = await adapter.createSession();
    await adapter.stop();

    const result = collect(adapter.sendMessage({ sessionId, content: 'continue' }));
    await tick();
    const restarted = clients[1];
    expect(restarted.calls).toContainEqual({ method: 'session/resume', params: { sessionId, cwd: '/vault' } });
    expect(restarted.calls.some((call) => call.method === 'session/new')).toBe(false);
    restarted.resolvePrompt(sessionId);
    await expect(result).resolves.toEqual([{ type: 'message_start' }, { type: 'message_stop' }]);
    await adapter.stop();
  });

  it('keeps simultaneous turns isolated by session and rejects a second turn on one session', async () => {
    const { adapter, clients } = adapterFixture();
    const firstId = await adapter.createSession();
    const secondId = await adapter.createSession();
    const client = clients[0];
    const first = collect(adapter.sendMessage({ sessionId: firstId, content: 'one' }));
    const second = collect(adapter.sendMessage({ sessionId: secondId, content: 'two' }));
    await tick();
    client.emitUpdate(firstId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'A' } });
    client.emitUpdate(secondId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'B' } });
    await expect(collect(adapter.sendMessage({ sessionId: firstId, content: 'duplicate' })))
      .rejects.toThrow('one prompt per session');
    client.resolvePrompt(firstId);
    client.resolvePrompt(secondId);
    await expect(first).resolves.toContainEqual({ type: 'text', content: 'A' });
    await expect(second).resolves.toContainEqual({ type: 'text', content: 'B' });
    await adapter.stop();
  });

  it('waits for native prompt settlement before admitting the next send after cancellation', async () => {
    const { adapter, clients } = adapterFixture();
    const sessionId = await adapter.createSession();
    const client = clients[0];
    client.autoSettleCancel = false;
    const first = collect(adapter.sendMessage({ sessionId, content: 'first' }));
    await tick();

    let cancelled = false;
    const cancellation = adapter.cancelStream(sessionId).then(() => { cancelled = true; });
    const second = collect(adapter.sendMessage({ sessionId, content: 'second' }));
    await tick();
    expect(cancelled).toBe(false);
    expect(client.calls.filter((call) => call.method === 'session/prompt')).toHaveLength(1);

    client.resolvePrompt(sessionId);
    await cancellation;
    await tick();
    expect(client.calls.filter((call) => call.method === 'session/prompt')).toHaveLength(2);
    client.resolvePrompt(sessionId);
    await expect(first).resolves.toContainEqual({ type: 'message_stop' });
    await expect(second).resolves.toContainEqual({ type: 'message_stop' });
    await adapter.stop();
  });

  it('cancels native work when a stream consumer returns early before admitting the next send', async () => {
    const { adapter, clients } = adapterFixture();
    const sessionId = await adapter.createSession();
    const client = clients[0];
    const abandoned = adapter.sendMessage({ sessionId, content: 'abandon' });
    await expect(abandoned.next()).resolves.toEqual({ done: false, value: { type: 'message_start' } });
    const streamed = abandoned.next();
    await tick();
    client.emitUpdate(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'partial' } });
    await expect(streamed).resolves.toEqual({ done: false, value: { type: 'text', content: 'partial' } });
    await abandoned.return(undefined);
    expect(client.calls).toContainEqual({ method: 'session/cancel', params: { sessionId } });

    const next = collect(adapter.sendMessage({ sessionId, content: 'next' }));
    await tick();
    client.resolvePrompt(sessionId);
    await expect(next).resolves.toContainEqual({ type: 'message_stop' });
    await adapter.stop();
  });

  it('bounds a stuck cancellation by restarting the client before the next send', async () => {
    const { adapter, clients } = adapterFixture({ cancelTimeoutMs: 10 });
    const sessionId = await adapter.createSession();
    const firstClient = clients[0];
    firstClient.autoSettleCancel = false;
    firstClient.settlePromptsOnStop = false;
    const first = collect(adapter.sendMessage({ sessionId, content: 'stuck' }));
    await tick();
    await adapter.cancelStream(sessionId);

    const second = collect(adapter.sendMessage({ sessionId, content: 'after recovery' }));
    await tick();
    const recovered = clients[1];
    expect(firstClient.calls).toContainEqual({ method: 'stop' });
    expect(recovered.calls).toContainEqual({ method: 'session/resume', params: { sessionId, cwd: '/vault' } });
    recovered.resolvePrompt(sessionId);
    await expect(first).resolves.toContainEqual({ type: 'message_stop' });
    await expect(second).resolves.toContainEqual({ type: 'message_stop' });
    await adapter.stop();
  });

  it('taints and restarts the client after a prompt timeout before admitting later updates', async () => {
    const { adapter, clients } = adapterFixture();
    const sessionId = await adapter.createSession();
    const original = clients[0];
    const timedOut = collect(adapter.sendMessage({ sessionId, content: 'timeout' }));
    await tick();
    original.rejectPrompt(sessionId, new Error('DSH ACP session/prompt timed out'));
    await expect(timedOut).resolves.toContainEqual({ type: 'error', content: 'DSH ACP session/prompt timed out' });
    expect(original.calls).toContainEqual({ method: 'stop' });

    const next = collect(adapter.sendMessage({ sessionId, content: 'next' }));
    await tick();
    const recovered = clients[1];
    original.emitUpdate(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'late-old' } });
    recovered.emitUpdate(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'fresh' } });
    recovered.resolvePrompt(sessionId);
    const chunks = await next;
    expect(chunks).toContainEqual({ type: 'text', content: 'fresh' });
    expect(chunks).not.toContainEqual({ type: 'text', content: 'late-old' });
    await adapter.stop();
  });

  it('does not re-admit a late resume after teardown clears the originating client generation', async () => {
    const { adapter, clients } = adapterFixture({ cancelTimeoutMs: 50 });
    await adapter.start();
    const original = clients[0];
    const gate = deferred();
    original.resumeGate = gate;
    const delayed = collect(adapter.sendMessage({ sessionId: 'another-persisted', content: 'late resume' }));
    await tick();
    const stopping = adapter.stop();
    await tick();
    gate.resolve({ configOptions: [] });
    await stopping;
    await delayed;

    const recovered = collect(adapter.sendMessage({ sessionId: 'another-persisted', content: 'fresh resume' }));
    await tick();
    const nextClient = clients[1];
    expect(nextClient.calls).toContainEqual({
      method: 'session/resume', params: { sessionId: 'another-persisted', cwd: '/vault' },
    });
    nextClient.resolvePrompt('another-persisted');
    await recovered;
    await adapter.stop();
  });

});

describe('DshAdapter prompt and boundary behavior', () => {
  it('assembles structured text, file, memory, tooling, and vault context into the ACP prompt', async () => {
    const { adapter, clients } = adapterFixture();
    const sessionId = await adapter.createSession();
    const client = clients[0];
    const stream = collect(adapter.sendMessage({
      sessionId,
      content: 'fallback text',
      options: {
        memoryInjection: { text: '[MEMORY]' },
        obsidianToolingInjection: { text: '[TOOLS]' },
        contextItems: [{ kind: 'selection', path: 'note.md', textSnapshot: 'vault excerpt' }],
        requestParts: [
          { type: 'text', text: 'user text' },
          { type: 'text', text: 'synthetic expansion', synthetic: true },
          { type: 'file', filename: 'attached.txt', url: 'data:text/plain;base64,YXR0YWNoZWQgYm9keQ==' },
        ],
      },
    }));
    await tick();
    const prompt = client.calls.find((call) => call.method === 'session/prompt')?.params as { text?: string };
    expect(prompt.text).toContain('[TOOLS]\n\n[MEMORY]\n\nuser text\nsynthetic expansion');
    expect(prompt.text).toContain('[Attached file: attached.txt]\nattached body');
    expect(prompt.text).toContain('<obsidian_context kind="selection" path="note.md"');
    expect(prompt.text).toContain('vault excerpt');
    client.resolvePrompt(sessionId);
    await stream;
    await adapter.stop();
  });

  it('ignores non-terminal tool updates and emits only completed or failed results', async () => {
    const { adapter, clients } = adapterFixture();
    const sessionId = await adapter.createSession();
    const client = clients[0];
    const stream = collect(adapter.sendMessage({ sessionId, content: 'tools' }));
    await tick();
    client.emitUpdate(sessionId, { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'opaque', rawInput: 'raw command' });
    client.emitUpdate(sessionId, { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'in_progress', content: [] });
    client.emitUpdate(sessionId, {
      sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed', content: [{ type: 'image', data: 'opaque' }],
    });
    client.emitUpdate(sessionId, {
      sessionUpdate: 'agent_message_chunk', content: { type: 'image', data: 'opaque' },
    });
    client.resolvePrompt(sessionId);
    const chunks = await stream;
    expect(chunks).toContainEqual({ type: 'tool_use', id: 't1', name: 'opaque', input: { rawInput: 'raw command' } });
    expect(chunks.filter((chunk) => chunk.type === 'tool_result')).toEqual([{
      type: 'tool_result', toolUseId: 't1',
      content: '[DeepSeek Harness tool returned image content that this adapter cannot render]', isError: false,
    }]);
    expect(chunks).toContainEqual({
      type: 'text', content: '[DeepSeek Harness returned image content that this adapter cannot render]',
    });
    await adapter.stop();
  });

  it('clears active-handle bookkeeping after disconnect and resumes the exact session', async () => {
    const { adapter, clients } = adapterFixture();
    const sessionId = await adapter.createSession();
    clients[0].disconnect();
    const stream = collect(adapter.sendMessage({ sessionId, content: 'recover' }));
    await tick();
    const recovered = clients[1];
    expect(recovered.calls).toContainEqual({ method: 'session/resume', params: { sessionId, cwd: '/vault' } });
    expect(recovered.calls.some((call) => call.method === 'session/new')).toBe(false);
    recovered.resolvePrompt(sessionId);
    await stream;
    await adapter.stop();
  });

  it('fails closed for rejection, invalid replies, and permissions without an active turn', async () => {
    const { adapter, clients } = adapterFixture();
    const sessionId = await adapter.createSession();
    const client = clients[0];
    const inactive = await client.options.onPermissionRequest?.({
      sessionId, toolCall: { name: 'shell' }, options: [{ optionId: 'allow', kind: 'allow_once' }],
    });
    expect(inactive).toEqual({ outcome: { outcome: 'cancelled' } });

    const stream = collect(adapter.sendMessage({ sessionId, content: 'run' }));
    await tick();
    const permission = client.options.onPermissionRequest?.({
      sessionId,
      toolCall: { name: 'shell' },
      options: [{ optionId: 'allow', kind: 'allow_once' }],
    });
    await tick();
    const [pending] = await adapter.getPendingPermissions() as Array<{ id: string }>;
    await expect(adapter.respondToPermission(pending.id, 'invalid')).rejects.toThrow('Invalid DSH permission reply');
    await adapter.respondToPermission(pending.id, 'reject');
    await expect(permission).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
    client.resolvePrompt(sessionId);
    await stream;
    await adapter.stop();
  });

  it('paginates the catalog, maps sessionId to id, and preserves admitted rows on failure', async () => {
    const { adapter, clients } = adapterFixture();
    await adapter.start();
    const client = clients[0];
    client.list = async (cursor) => {
      if (!cursor) return { sessions: [{ sessionId: 's1', cwd: '/vault' }], nextCursor: 'page-2' };
      throw Object.assign(new Error('boom'), { code: 'EIO' });
    };
    await expect(adapter.listSessions()).rejects.toMatchObject({
      result: {
        status: 'partial',
        data: [{ id: 's1', sessionId: 's1', cwd: '/vault' }],
        nextCursor: 'page-2',
        errorReason: 'Session catalog read failed',
      },
    });
    await adapter.stop();
  });

  it('reports delete, image input, and per-turn model overrides as unsupported', async () => {
    const { adapter } = adapterFixture();
    await expect(adapter.deleteSession('persisted')).rejects.toThrow('does not support deleting');
    await expect(collect(adapter.sendMessage({
      sessionId: 's1', content: 'image', images: [{ mediaType: 'image/png', data: 'AA==' }],
    }))).rejects.toThrow('image prompts are not supported');
    await expect(collect(adapter.sendMessage({
      sessionId: 's1', content: 'model', options: { model: 'deepseek-v4' },
    }))).rejects.toThrow('model overrides are not supported');
    await adapter.stop();
  });

  it('refuses to apply changed launcher settings while native handles are active', async () => {
    const { adapter, current } = adapterFixture();
    await adapter.createSession();
    current.executablePath = '/opt/other-dsh';
    await expect(adapter.start()).rejects.toThrow('settings changed');
    await adapter.stop();
  });

  it('cancels all pending permissions and stops owned clients during teardown', async () => {
    const { adapter, clients } = adapterFixture();
    const sessionId = await adapter.createSession();
    const client = clients[0];
    const stream = collect(adapter.sendMessage({ sessionId, content: 'run' }));
    await tick();
    const permission = client.options.onPermissionRequest?.({
      sessionId, toolCall: { name: 'write' }, options: [{ optionId: 'reject', kind: 'reject_once' }],
    });
    await adapter.stop();
    await expect(permission).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
    await stream;
    expect(client.calls).toContainEqual({ method: 'stop' });
  });

  it('cancels pending permissions when the transport fails', async () => {
    const { adapter, clients } = adapterFixture();
    const sessionId = await adapter.createSession();
    const client = clients[0];
    const stream = collect(adapter.sendMessage({ sessionId, content: 'run' }));
    await tick();
    const permission = client.options.onPermissionRequest?.({
      sessionId, toolCall: { name: 'write' }, options: [{ optionId: 'reject', kind: 'reject_once' }],
    });
    client.disconnect();
    await expect(permission).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
    client.resolvePrompt(sessionId);
    await stream;
    expect(await adapter.getPendingPermissions()).toEqual([]);
    await adapter.stop();
  });

  it('fences a session/new result that arrives after stop and restart', async () => {
    const { adapter, clients } = adapterFixture();
    await adapter.start();
    const client = clients[0];
    const gate = deferred();
    client.newSessionGate = gate;
    const creation = adapter.createSession();
    await tick();
    await adapter.stop();
    gate.resolve({ sessionId: 'stale-created' });
    await expect(creation).rejects.toThrow('activation was superseded');
  });

  it('propagates owned process teardown failure and keeps error status', async () => {
    const { adapter, clients } = adapterFixture();
    await adapter.start();
    clients[0].stopError = new Error('owned process survived');
    await expect(adapter.stop()).rejects.toThrow('owned process survived');
    expect(adapter.status).toBe('error');
  });
});
