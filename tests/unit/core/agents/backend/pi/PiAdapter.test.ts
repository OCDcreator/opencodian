import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { PiAdapter } from '../../../../../../src/core/agents/backend/pi/PiAdapter';
import { PI_CONFIG_COMMANDS, PI_RPC_COMMANDS, PI_SDK_COMMANDS } from '../../../../../../src/core/agents/backend/pi/PiProtocol';
import type { PiLaunchOptions, PiRecord, PiRpcPort } from '../../../../../../src/core/agents/backend/pi/PiRpcClient';
import { buildPiPrompt, buildPiUsageSnapshot, PiStreamMapper, toPiChatMessages } from '../../../../../../src/core/agents/backend/pi/PiStreamMapper';
import type { StreamChunk } from '../../../../../../src/core/types/chat';

class FakeClient implements PiRpcPort {
  commands: PiRecord[] = [];
  listeners = new Set<(event: PiRecord) => void>();
  closed = false;
  pending?: () => void;
  model = { provider: 'test', id: 'one', name: 'One', contextWindow: 200000 };
  name = 'Chat';
  onPrompt: (client: FakeClient) => Promise<void> = async (client) => {
    client.emit({ type: 'agent_start' });
    client.emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Answer' } });
    client.emit({ type: 'agent_end' });
  };
  constructor(readonly options: PiLaunchOptions) {}
  subscribe(listener: (event: PiRecord) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(event: PiRecord): void { for (const listener of this.listeners) listener(event); }
  close(): void { this.closed = true; this.pending?.(); this.emit({ type: 'transport_error', error: 'closed' }); }
  async request(c: PiRecord): Promise<PiRecord> {
    this.commands.push(c);
    switch (c.type) {
      case 'get_state': return { serviceProtocol: 1, commands: [...PI_RPC_COMMANDS, ...PI_SDK_COMMANDS, ...PI_CONFIG_COMMANDS], isStreaming: false, model: this.model, sessionFile: this.options.sessionPath, sessionName: this.name };
      case 'set_session_name': this.name = String(c.name); return {};
      case 'get_available_models': return { models: [this.model] };
      case 'set_model': if (c.modelId === 'missing') throw new Error('No fallback'); return {};
      case 'prompt': await this.onPrompt(this); return {};
      case 'abort': this.pending?.(); return {};
      case 'get_last_assistant_text': return { text: 'Answer' };
      case 'get_messages': return { messages: [{ role: 'assistant', content: 'Answer', stopReason: 'stop' }], entries: [{ id: 'u1', role: 'user', content: 'Question' }, { id: 'a1', role: 'assistant', content: 'Answer' }] };
      case 'get_session_stats': return { cost: 0.123, tokens: { input: 100, output: 20 }, contextUsage: { tokens: 500, contextWindow: 200000 } };
      default: return {};
    }
  }
}
async function collect(stream: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
  const result: StreamChunk[] = []; for await (const chunk of stream) result.push(chunk); return result;
}
describe('Pi SDK service lifecycle', () => {
  let directory: string;
  let clients: FakeClient[];
  let adapter: PiAdapter;
  let prompt: ((client: FakeClient) => Promise<void>) | undefined;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(tmpdir(), 'pi-unit-')); clients = []; prompt = undefined;
    adapter = new PiAdapter({ workingDirectory: directory, sessionDirectory: directory, createClient: (options) => {
      const client = new FakeClient(options); if (prompt) client.onPrompt = prompt; clients.push(client); return client;
    } });
  });
  afterEach(async () => { adapter.dispose(); await fs.rm(directory, { recursive: true, force: true }); });
  it('registers lazily and validates the service capability handshake', async () => {
    expect(clients).toHaveLength(0); await adapter.start(); expect(adapter.status).toBe('connected'); expect(adapter.getDefaultModel()).toEqual({ provider: 'test', model: 'one' });
  });
  it('retains the service between turns and emits native IDs plus actual cost/context', async () => {
    const id = await adapter.createSession('Chat');
    const chunks = await collect(adapter.sendMessage({ sessionId: id, content: 'Hello' }));
    expect(chunks).toContainEqual({ type: 'user_message_identity', uuid: 'u1', sessionId: id });
    expect(chunks).toContainEqual({ type: 'context_usage', snapshot: expect.objectContaining({ totalCost: 0.123, totalTokens: 500, contextWindow: 200000 }) });
    expect(clients).toHaveLength(1); expect(clients[0].closed).toBe(false);
    await collect(adapter.sendMessage({ sessionId: id, content: 'Continue' })); expect(clients).toHaveLength(1);
  });
  it('does not end on agent_end before retry and compaction complete', async () => {
    const sequence: string[] = [];
    prompt = async (client) => {
      client.emit({ type: 'agent_end' }); client.emit({ type: 'auto_retry_start', attempt: 1 });
      await new Promise((r) => setTimeout(r, 5)); sequence.push('retry');
      client.emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Recovered' } });
      client.emit({ type: 'agent_end' }); client.emit({ type: 'compaction_start' });
      await new Promise((r) => setTimeout(r, 5)); sequence.push('compaction'); client.emit({ type: 'compaction_end' });
    };
    const id = await adapter.createSession(); const chunks = await collect(adapter.sendMessage({ sessionId: id, content: 'test' }));
    expect(sequence).toEqual(['retry', 'compaction']); expect(chunks).toContainEqual({ type: 'text', content: 'Recovered' }); expect(clients[0].closed).toBe(false);
  });
  it('isolates concurrent cancellation and prevents duplicate sends', async () => {
    const started: FakeClient[] = []; let ready!: () => void;
    const both = new Promise<void>((resolve) => { ready = resolve; });
    prompt = (client) => new Promise<void>((resolve) => { client.pending = resolve; started.push(client); if (started.length === 2) ready(); });
    const a = await adapter.createSession('A'), b = await adapter.createSession('B');
    const runA = collect(adapter.sendMessage({ sessionId: a, content: 'A' })), runB = collect(adapter.sendMessage({ sessionId: b, content: 'B' }));
    await both; await expect(collect(adapter.sendMessage({ sessionId: a, content: 'duplicate' }))).rejects.toThrow('busy');
    await adapter.cancelStream(a); await runA;
    const clientB = started.find((c) => c.options.sessionPath?.endsWith(`${b}.jsonl`)); expect(clientB?.closed).toBe(false); clientB?.pending?.(); await runB;
  });
  it('preserves unavailable model and refuses send instead of falling back', async () => {
    const id = await adapter.createSession();
    await expect(collect(adapter.sendMessage({ sessionId: id, content: 'Hello', options: { provider: 'test', model: 'missing' } }))).rejects.toThrow('No fallback');
    expect(clients[0].commands.some((c) => c.type === 'prompt')).toBe(false);
  });
  it('does not start a prompt after cancellation while preparing the model', async () => {
    const id = await adapter.createSession();
    const client = clients[0];
    const original = client.request.bind(client);
    let modelTimeout: number | undefined;
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    client.request = async (command, timeout?: number) => {
      if (command.type === 'set_model') { modelTimeout = timeout; entered(); await new Promise<void>((resolve) => { release = resolve; }); }
      return original(command);
    };
    const pending = collect(adapter.sendMessage({ sessionId: id, content: 'Cancelled', options: { provider: 'test', model: 'one' } }));
    await ready; await adapter.cancelStream(id); release(); await pending;
    expect(client.commands.some(command => command.type === 'prompt')).toBe(false);
    expect(modelTimeout).toBe(0);
  });
  it('reads native history and persists title independently of other sessions', async () => {
    const a = await adapter.createSession('A'), b = await adapter.createSession('B');
    await adapter.updateSessionTitle(a, 'Renamed'); expect(await adapter.getSession(a)).toMatchObject({ title: 'Renamed' });
    expect(await adapter.getSessionMessages(a)).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'u1' })]));
    await adapter.deleteSession(a); expect(await adapter.getSession(a)).toBeNull(); expect(await adapter.getSession(b)).not.toBeNull();
  });
  it('rejects traversal and unknown handles before launching a process', async () => {
    await expect(adapter.getSession('../../secret')).rejects.toThrow('Invalid Pi session id');
    await expect(adapter.command('pi-00000000-0000-0000-0000-000000000000', 'get_messages')).rejects.toThrow('not found'); expect(clients).toHaveLength(0);
  });
});
describe('Pi stream semantics', () => {
  it('restores native history with reasoning, tool details, images and visible extension messages', () => {
    const messages = toPiChatMessages([
      { id: 'u', role: 'user', content: [{ type: 'text', text: 'Q' }, { type: 'image', mimeType: 'image/png', data: 'YWJj' }] },
      { id: 'a', role: 'assistant', content: [{ type: 'thinking', thinking: 'Plan' }, { type: 'toolCall', id: 't', name: 'read', arguments: { path: 'image.png' } }] },
      { id: 'r', role: 'toolResult', toolCallId: 't', content: [{ type: 'image', mimeType: 'image/png', data: 'YWJj' }], details: { width: 1 } },
      { id: 'hidden', role: 'custom', display: false, content: 'Hidden' },
      { id: 'visible', role: 'custom', display: true, content: 'Visible' },
    ]);
    expect(messages.map(m => m.sourceMessageId)).toEqual(['u', 'a', 'visible']);
    expect(messages[0].images).toEqual([{ mediaType: 'image/png', data: 'YWJj' }]);
    expect(messages[1].contentBlocks).toContainEqual({ type: 'thinking', thinking: 'Plan' });
    expect(messages[1].toolCalls?.[0]).toMatchObject({ id: 't', toolMetadata: { width: 1 }, status: 'completed' });
    expect(messages[1].content).toContain('data:image/png;base64,YWJj');
    expect(messages[2]).toMatchObject({ displayStyle: 'notice', content: 'Visible' });
  });
  it('emits successful file modifications and preserves structured tool result details', () => {
    const mapper = new PiStreamMapper('id'); mapper.map({ type: 'tool_execution_start', toolCallId: 't1', toolName: 'write', args: { path: 'note.md' } });
    const chunks = mapper.map({ type: 'tool_execution_end', toolCallId: 't1', result: { content: [{ type: 'text', text: 'saved' }], details: { diff: '+abc' } } });
    expect(chunks).toContainEqual({ type: 'file_edited', file: 'note.md' });
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'backend_event', metadata: expect.objectContaining({ details: { diff: '+abc' } }) }));
  });
  it('does not turn a retryable attempt into a terminal UI error', () => {
    expect(new PiStreamMapper('id').map({ type: 'message_end', message: { role: 'assistant', stopReason: 'error', errorMessage: '429' } })).toEqual([]);
  });
  it('keeps billing separate from current context occupancy', () => {
    const snapshot = buildPiUsageSnapshot('id', { cost: 3.4, contextUsage: { tokens: 90, contextWindow: 1000 }, tokens: { input: 10000, output: 200 } }, { model: { id: 'm', provider: 'p' } });
    expect(snapshot.totalCost).toBe(3.4); expect(snapshot.totalTokens).toBe(90); expect(snapshot.billingUsage?.inputTokens).toBe(10000);
  });
  it('preserves text context and images in prompts', () => {
    const prompt = buildPiPrompt({ sessionId: 'id', content: 'Q', images: [{ data: 'abc', mediaType: 'image/png' }], options: { requestParts: [{ type: 'text', text: 'Q' }, { type: 'file', filename: 'note', url: 'data:text/plain;base64,5Lit5paH' }] } });
    expect(prompt.message).toContain('中文'); expect(prompt.images).toEqual([{ type: 'image', data: 'abc', mimeType: 'image/png' }]);
  });
});
