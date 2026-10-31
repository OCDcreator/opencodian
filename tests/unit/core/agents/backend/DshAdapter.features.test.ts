import { describe, expect, it } from '@jest/globals';

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import type { DshJsonObject } from '../../../../../src/core/agents/backend/dsh/DshAcpClient';
import { DshAdapter } from '../../../../../src/core/agents/backend/dsh/DshAdapter';
import { adapterFixture, collect, FakeDshClient, MODEL_OPTIONS, settings, tick } from './DshAdapter.fixture';

const HISTORY_MESSAGES = [
  { id: 'u', role: 'user', sourceKind: 'user', content: [{ type: 'text', text: 'Look at this image' }] },
  { id: 'internal', role: 'user', sourceKind: 'agent-instructions', content: [{ type: 'text', text: 'PRIVATE_NATIVE_INSTRUCTIONS' }] },
  { id: 'runtime', role: 'user', sourceKind: 'runtime-context', content: [{ type: 'text', text: 'PRIVATE_RUNTIME_CONTEXT' }] },
  { id: 'a', role: 'assistant', content: [{ type: 'text', text: 'Red' }] },
  { id: 'tool', role: 'tool', toolCallId: 'c', content: [{ type: 'text', text: 'Actual tool result' }] },
];

describe('DshAdapter native configuration and media', () => {
  it('projects native chat history without presenting internal prompt injections as assistant replies', async () => {
    const messages = HISTORY_MESSAGES;
    const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: settings,
      createClient: options => Object.assign(new FakeDshClient(options), {
        nativeRequest: async () => ({ messages }),
      }) });
    try {
      const history = await adapter.getSessionMessages('native-session');
      expect(history).toEqual([
        messages[0], messages[3], expect.objectContaining({ id: 'tool', role:'tool',
          content: [{ type:'tool_result',toolCallId:'c',isError:undefined,content:'Actual tool result' }] }),
      ]);
      expect(JSON.stringify(history)).not.toContain('PRIVATE_');
    } finally { await adapter.stop(); }
  });
  it('keeps another session running after a known RPC failure that mentions a provider transport', async () => {
    const { adapter, clients } = adapterFixture();
    const firstId = await adapter.createSession();
    const secondId = await adapter.createSession();
    const first = collect(adapter.sendMessage({ sessionId: firstId, content: 'one' }));
    const second = collect(adapter.sendMessage({ sessionId: secondId, content: 'two' }));
    await tick();
    clients[0].rejectPrompt(firstId, new Error('DSH ACP request failed (-32602): unsupported provider protocol transport'));
    await first;
    expect(clients[0].calls.some((call) => call.method === 'stop')).toBe(false);
    clients[0].emitUpdate(secondId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'still running' } });
    clients[0].resolvePrompt(secondId);
    await expect(second).resolves.toContainEqual({ type: 'text', content: 'still running' });
    await adapter.stop();
  });
  it('does not restart a disposed backend from a delayed caller', async () => {
    const { adapter, clients } = adapterFixture();
    await adapter.start();
    adapter.dispose();
    try { await expect(adapter.start()).rejects.toThrow('disposed'); }
    finally { await adapter.stop(); }
    expect(clients).toHaveLength(1);
  });
  it('does not let an old generator teardown stop a replacement connection and turn', async () => {
    const { adapter, clients } = adapterFixture();
    const sessionId = await adapter.createSession();
    clients[0].setConfigOption = async () => { throw new Error('DSH ACP session/set_config_option timed out'); };
    const old = adapter.sendMessage({ sessionId, content: 'old', options: { model: 'opaque/model-b' } });
    await expect(old.next()).resolves.toMatchObject({ value: { type: 'error' } });
    await adapter.stop();
    const fresh = collect(adapter.sendMessage({ sessionId, content: 'fresh' }));
    await tick();
    const replacement = clients[1];
    await old.return(undefined);
    expect(replacement.calls.some((call) => call.method === 'stop' || call.method === 'session/cancel')).toBe(false);
    replacement.resolvePrompt(sessionId);
    await fresh;
    await adapter.stop();
  });

  it('reuses the catalog draft for the next chat and retains opaque model identities', async () => {
    const { adapter, clients } = adapterFixture();
    const providers = await adapter.getModelSelectorProviders();
    expect(providers).toEqual([{ id: 'provider-a', name: 'Provider A', models: [
      { id: 'opaque/model-a', name: 'Alpha', variants: ['low', 'medium', 'high'] },
      { id: 'opaque/model-b', name: 'Beta', variants: [] },
    ] }]);
    expect(adapter.getDefaultModelSelection()).toEqual({ provider: 'provider-a', model: 'opaque/model-a' });
    const draft = await adapter.readSessionConfiguration();
    await expect(adapter.createSession()).resolves.toBe(draft.sessionId);
    expect(clients[0].calls.filter((call) => call.method === 'session/new')).toHaveLength(1);
    expect(adapter.getDefaultModelSelection()).toBeNull();
    await adapter.stop();
  });

  it('applies model and effort before prompting, and restores the native default on inheritance', async () => {
    const { adapter, clients } = adapterFixture();
    const sessionId = await adapter.createSession();
    const client = clients[0];
    const first = collect(adapter.sendMessage({ sessionId, content: 'one', options: {
      provider: 'provider-a', model: 'opaque/model-b', variant: 'high',
    } }));
    await tick();
    expect(client.calls.filter((call) => call.method === 'session/set_config_option')).toEqual([
      { method: 'session/set_config_option', params: { sessionId, configId: 'model', value: 'opaque/model-b' } },
      { method: 'session/set_config_option', params: { sessionId, configId: 'reasoning_effort', value: 'high' } },
    ]);
    client.resolvePrompt(sessionId);
    await first;
    const next = collect(adapter.sendMessage({ sessionId, content: 'inherit' }));
    await tick();
    expect(client.calls.filter((call) => call.method === 'session/set_config_option').at(-1)).toEqual({
      method: 'session/set_config_option', params: { sessionId, configId: 'reasoning_effort', value: 'medium' },
    });
    client.resolvePrompt(sessionId);
    await next;
    await adapter.stop();
  });

  it('requires native confirmation and never sends a prompt after an unconfirmed configuration', async () => {
    const { adapter, clients } = adapterFixture();
    const sessionId = await adapter.createSession();
    clients[0].confirmConfig = false;
    await expect(collect(adapter.sendMessage({ sessionId, content: 'must not run', options: {
      provider: 'provider-a', model: 'opaque/model-b',
    } }))).resolves.toContainEqual({ type: 'error', content: 'DSH did not confirm the requested session configuration' });
    expect(clients[0].calls.some((call) => call.method === 'session/prompt')).toBe(false);
    expect(adapter.getDefaultModelSelection(sessionId)?.model).toBe('opaque/model-a');
    await adapter.stop();
  });

  it('recovers from an uncertain model mutation before another prompt can use the connection', async () => {
    const { adapter, clients } = adapterFixture();
    const sessionId = await adapter.createSession();
    const client = clients[0];
    client.setConfigOption = async () => { throw new Error('DSH ACP session/set_config_option timed out'); };
    const chunks = await collect(adapter.sendMessage({ sessionId, content: 'must not run', options: {
      provider: 'provider-a', model: 'opaque/model-b',
    } }));
    expect(chunks).toContainEqual({ type: 'error', content: 'DSH ACP session/set_config_option timed out' });
    expect(client.calls.some((call) => call.method === 'session/prompt')).toBe(false);
    expect(client.calls).toContainEqual({ method: 'stop' });
    await adapter.stop();
  });

  it('keeps native configuration updates scoped to their own session, including idle sessions', async () => {
    const { adapter, clients } = adapterFixture();
    const first = await adapter.createSession();
    const second = await adapter.createSession();
    const options = JSON.parse(JSON.stringify(MODEL_OPTIONS)) as DshJsonObject[];
    options[0].currentValue = 'opaque/model-b';
    clients[0].emitUpdate(second, { sessionUpdate: 'config_option_update', configOptions: options });
    expect(adapter.getDefaultModelSelection(first)?.model).toBe('opaque/model-a');
    expect(adapter.getDefaultModelSelection(second)?.model).toBe('opaque/model-b');
    await adapter.stop();
    clients[0].emitUpdate(first, { sessionUpdate: 'config_option_update', configOptions: options });
    expect(adapter.getDefaultModelSelection(first)).toBeNull();
  });

  it('transports advertised images and resource links and renders native assistant/tool images', async () => {
    let client!: FakeDshClient;
    const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: settings, createClient: (options) => {
      client = new FakeDshClient(options);
      client.handshake = { agentCapabilities: { promptCapabilities: { image: true } } };
      return client;
    } });
    expect(adapter.hasCapability(AgentCapability.Images)).toBe(false);
    const sessionId = await adapter.createSession();
    expect(adapter.hasCapability(AgentCapability.Images)).toBe(true);
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHCkAAAAASUVORK5CYII=';
    const stream = collect(adapter.sendMessage({ sessionId, content: 'look', images: [{ mediaType: 'image/png', data }],
      options: { requestParts: [
        { type: 'file', mime: 'image/png', url: `data:image/png;base64,${data}` },
        { type: 'file', filename: 'note.md', mime: 'text/markdown', url: 'file:///vault/note.md' },
      ] },
    }));
    await tick();
    const prompt = client.calls.find((call) => call.method === 'session/prompt')?.params as { prompt: DshJsonObject[] };
    expect(prompt.prompt.filter((block) => block.type === 'image')).toEqual([{ type: 'image', mimeType: 'image/png', data }]);
    expect(prompt.prompt).toContainEqual({ type: 'resource_link', name: 'note.md', mimeType: 'text/markdown', uri: 'file:///vault/note.md' });
    client.emitUpdate(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'image', mimeType: 'image/png', data } });
    client.emitUpdate(sessionId, { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed',
      content: [{ type: 'content', content: { type: 'image', mimeType: 'image/png', data } }] });
    client.resolvePrompt(sessionId);
    const chunks = await stream;
    expect(chunks).toContainEqual({ type: 'text', content: `\n![DeepSeek Harness image](data:image/png;base64,${data})\n` });
    expect(chunks).toContainEqual({ type: 'tool_result', toolUseId: 't1', content: `\n![DeepSeek Harness image](data:image/png;base64,${data})\n`, isError: false });
    await adapter.stop();
    expect(adapter.hasCapability(AgentCapability.Images)).toBe(false);
    for (const unsupported of [AgentCapability.AuxQuery, AgentCapability.InlineCompletion, AgentCapability.Mcp, AgentCapability.Fork])
      expect(adapter.hasCapability(unsupported)).toBe(false);
  });

  it('reports aggregate native context occupancy without inventing token categories or costs', async () => {
    const { adapter, clients } = adapterFixture();
    const sessionId = await adapter.createSession();
    const stream = collect(adapter.sendMessage({ sessionId, content: 'usage' }));
    await tick();
    clients[0].emitUpdate(sessionId, { sessionUpdate: 'usage_update', used: 240, size: 1000 });
    clients[0].emitUpdate(sessionId, { sessionUpdate: 'usage_update', used: -5, size: 0 });
    clients[0].resolvePrompt(sessionId);
    const chunks = await stream;
    expect(chunks.filter((chunk) => chunk.type === 'context_usage')).toHaveLength(1);
    await expect(adapter.getSessionContextUsageSnapshot(sessionId)).resolves.toMatchObject({
      sessionId, totalTokens: 240, contextWindow: 1000, totalCost: null, tokenBreakdownAvailable: false,
    });
    await expect(adapter.getSessionContextUsageSnapshot('unknown')).resolves.toBeNull();
    await adapter.stop();
  });

  it('passes MCP declarations on new/resume and does not remount an already active session', async () => {
    const { adapter, clients, current } = adapterFixture();
    current.mcpServers = [{ name: 'local', command: '/opt/mcp', args: ['--stdio'], env: [{ name: 'EXACT', value: ' bytes ' }] }];
    const sessionId = await adapter.createSession();
    expect(clients[0].calls).toContainEqual({ method: 'session/new', params: { cwd: '/vault', mcpServers: current.mcpServers } });
    await adapter.stop();
    const stream = collect(adapter.sendMessage({ sessionId, content: 'resume' }));
    await tick();
    expect(clients[1].calls).toContainEqual({ method: 'session/resume', params: { sessionId, cwd: '/vault', mcpServers: current.mcpServers } });
    current.mcpServers = [];
    clients[1].resolvePrompt(sessionId);
    await stream;
    const second = collect(adapter.sendMessage({ sessionId, content: 'same mounted session' }));
    await tick();
    expect(clients[1].calls.filter((call) => call.method === 'session/resume')).toHaveLength(1);
    clients[1].resolvePrompt(sessionId);
    await second;
    await adapter.stop();
  });
});
