import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import { backendSessionMessagesToChat } from '../../../../../src/core/agents/backend/BackendSessionMessages';
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
    expect(chunks).toContainEqual({ type: 'tool_result', toolUseId: 't1', content: `data:image/png;base64,${data}`, isError: false });
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

describe('DshAdapter recorded per-message model history', () => {
  it('carries each recorded model through adapter encoding and shared projection', async () => {
    const messages = [
      { id: 'a1', role: 'assistant', sourceKind: 'model', sourceProvider: 'deepseek-official', sourceModel: 'deepseek-chat',
        content: [{ type: 'text', text: 'Blue' }], timestamp: 1 },
      { id: 'a2', role: 'assistant', sourceKind: 'model', sourceProvider: 'deepseek-official', sourceModel: 'deepseek-reasoner',
        content: [{ type: 'text', text: 'Marker' }], timestamp: 2 },
      { id: 'a3', role: 'assistant', sourceKind: 'user', sourceProvider: 'deepseek-official', sourceModel: 'deepseek-chat',
        content: [{ type: 'text', text: 'Not model-generated' }], timestamp: 3 },
      { id: 'a4', role: 'assistant', sourceKind: 'model', sourceProvider: '  ', sourceModel: 'deepseek-chat',
        content: [{ type: 'text', text: 'Blank provider' }], timestamp: 4 },
      { id: 'u1', role: 'user', sourceKind: 'user', sourceProvider: 'deepseek-official', sourceModel: 'deepseek-chat',
        content: [{ type: 'text', text: 'Question' }], timestamp: 5 },
    ];
    const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: settings,
      createClient: options => Object.assign(new FakeDshClient(options), {
        nativeRequest: async () => ({ messages }),
      }) });
    try {
      const history = await adapter.getSessionMessages('native-session');
      // Exact live-turn tuple contract: formatModelId records
      // `${provider}/${opaqueSelection}` where the opaque selection is
      // `JSON.stringify([provider, model])` from the session catalog.
      expect(history.map((message) => (message as { recordedModelId?: string }).recordedModelId)).toEqual([
        'deepseek-official/["deepseek-official","deepseek-chat"]',
        'deepseek-official/["deepseek-official","deepseek-reasoner"]',
        undefined, undefined, undefined,
      ]);
      expect('recordedModelId' in history[2]).toBe(false);
      expect('recordedModelId' in history[4]).toBe(false);
      const projected = backendSessionMessagesToChat('dsh', history);
      expect(projected.map((message) => message.modelId)).toEqual([
        'deepseek-official/["deepseek-official","deepseek-chat"]',
        'deepseek-official/["deepseek-official","deepseek-reasoner"]',
        undefined, undefined, undefined,
      ]);
      expect('modelId' in projected[2]).toBe(false);
      expect('modelId' in projected[3]).toBe(false);
      expect('modelId' in projected[4]).toBe(false);
    } finally { await adapter.stop(); }
  });
});

describe('DshAdapter native history image projection', () => {
  const imageData = readFileSync(path.resolve(__dirname, '../../../../../tests/fixtures/dsh-history-image.png')).toString('base64');

  function historyAdapter(messages: DshJsonObject[]): DshAdapter {
    return new DshAdapter({ workingDirectory: '/vault', getSettings: settings,
      createClient: options => Object.assign(new FakeDshClient(options), {
        nativeRequest: async () => ({ messages }),
      }) });
  }

  it('passes store-backed user images through so ChatMessage.images renders them', async () => {
    const messages: DshJsonObject[] = [
      { id: 'u1', role: 'user', sourceKind: 'user', timestamp: 10,
        content: [{ type: 'text', text: 'See attachment' }, { type: 'image', mimeType: 'image/png', data: imageData, name: 'chart.png' }] },
    ];
    const adapter = historyAdapter(messages);
    try {
      const history = await adapter.getSessionMessages('native-session');
      expect(history[0]).toMatchObject({ id: 'u1', content: [
        { type: 'text', text: 'See attachment' },
        { type: 'image', mimeType: 'image/png', data: imageData, name: 'chart.png' },
      ] });
      const [projected] = backendSessionMessagesToChat('dsh', history);
      expect(projected.images).toEqual([{ data: imageData, mediaType: 'image/png', filename: 'chart.png' }]);
      expect(projected.content).toBe('See attachment');
    } finally { await adapter.stop(); }
  });

  it('keeps assistant images as streamed markdown text and preserves recorded model provenance', async () => {
    const messages: DshJsonObject[] = [
      { id: 'a1', role: 'assistant', sourceKind: 'model', sourceProvider: 'deepseek-official', sourceModel: 'deepseek-chat',
        timestamp: 11, content: [{ type: 'image', mimeType: 'image/png', data: imageData }] },
    ];
    const adapter = historyAdapter(messages);
    try {
      const history = await adapter.getSessionMessages('native-session');
      expect(history[0]).toMatchObject({ recordedModelId: 'deepseek-official/["deepseek-official","deepseek-chat"]',
        content: [{ type: 'text', text: `\n![DeepSeek Harness image](data:image/png;base64,${imageData})\n` }] });
      const [projected] = backendSessionMessagesToChat('dsh', history);
      expect(projected.modelId).toBe('deepseek-official/["deepseek-official","deepseek-chat"]');
      expect(projected.images).toBeUndefined();
      expect(projected.content).toContain(`![DeepSeek Harness image](data:image/png;base64,${imageData})`);
    } finally { await adapter.stop(); }
  });

  it('degrades unavailable references to honest placeholders without fabricating image data', async () => {
    const messages: DshJsonObject[] = [
      { id: 'um', role: 'user', sourceKind: 'user', timestamp: 12,
        content: [{ type: 'image', unavailable: true, reason: 'ATTACHMENT_NOT_FOUND' }] },
      { id: 'am', role: 'assistant', sourceKind: 'model', sourceProvider: 'deepseek-official', sourceModel: 'deepseek-chat',
        timestamp: 13, content: [{ type: 'image', unavailable: true, reason: 'ATTACHMENT_CORRUPT' }] },
      { id: 'ac', role: 'assistant', timestamp: 14, content: [{ type: 'tool-call', id: 'c1', name: 'read', arguments: '{}' }] },
      { id: 'tm', role: 'tool', toolCallId: 'c1', isError: false, timestamp: 15,
        content: [{ type: 'image', unavailable: true, reason: 'ATTACHMENT_READ_FAILED' }] },
    ];
    const adapter = historyAdapter(messages);
    try {
      const history = await adapter.getSessionMessages('native-session');
      const flattened = JSON.stringify(history);
      expect(flattened).not.toContain('data:image');
      expect(flattened).not.toContain('base64');
      expect(history[0]).toMatchObject({ content: [{ type: 'text', text: '[DeepSeek Harness image is no longer available (ATTACHMENT_NOT_FOUND)]' }] });
      expect(history[1]).toMatchObject({ recordedModelId: 'deepseek-official/["deepseek-official","deepseek-chat"]',
        content: [{ type: 'text', text: '[DeepSeek Harness image is no longer available (ATTACHMENT_CORRUPT)]' }] });
      const projected = backendSessionMessagesToChat('dsh', history);
      // Image-only messages survive as readable placeholders instead of vanishing.
      expect(projected.map((message) => message.content)).toEqual([
        '[DeepSeek Harness image is no longer available (ATTACHMENT_NOT_FOUND)]',
        '[DeepSeek Harness image is no longer available (ATTACHMENT_CORRUPT)]',
        '',
      ]);
      expect(projected.every((message) => !message.images)).toBe(true);
      // The tool result attaches to its owning assistant call with the honest placeholder.
      expect(projected[2].toolCalls?.[0]).toMatchObject({ id: 'c1',
        result: '[DeepSeek Harness image is no longer available (ATTACHMENT_READ_FAILED)]' });
    } finally { await adapter.stop(); }
  });

  it('keeps single store-backed tool images in the renderer-visible bare data URI form', async () => {
    const messages: DshJsonObject[] = [
      { id: 'ac2', role: 'assistant', timestamp: 16, content: [{ type: 'tool-call', id: 'c2', name: 'screenshot', arguments: '{}' }] },
      { id: 'ti', role: 'tool', toolCallId: 'c2', isError: false, timestamp: 17,
        content: [{ type: 'image', mimeType: 'image/png', data: imageData }] },
    ];
    const adapter = historyAdapter(messages);
    try {
      const history = await adapter.getSessionMessages('native-session');
      expect(history[1]).toMatchObject({ content: [{ type: 'tool_result', toolCallId: 'c2', isError: false,
        content: `data:image/png;base64,${imageData}` }] });
      const projected = backendSessionMessagesToChat('dsh', history);
      // The tool message merges into its owning assistant call; the shared tool
      // renderer renders a result starting with `data:image/` as a real image.
      expect(projected).toHaveLength(1);
      expect(projected[0].toolCalls?.[0]).toMatchObject({ id: 'c2', result: `data:image/png;base64,${imageData}` });
    } finally { await adapter.stop(); }
  });
});

describe('DshAdapter adapter-surfaced image admission', () => {
  const imageData = readFileSync(path.resolve(__dirname, '../../../../../tests/fixtures/dsh-history-image.png')).toString('base64');

  function historyAdapter(messages: DshJsonObject[]): DshAdapter {
    return new DshAdapter({ workingDirectory: '/vault', getSettings: settings,
      createClient: options => Object.assign(new FakeDshClient(options), {
        nativeRequest: async () => ({ messages }),
      }) });
  }

  it('degrades broken, fake and oversized payloads instead of emitting data URIs', async () => {
    const messages: DshJsonObject[] = [
      { id: 'ub', role: 'user', sourceKind: 'user', timestamp: 20,
        content: [{ type: 'text', text: 'broken' }, { type: 'image', mimeType: 'image/png', data: 'not-base64!' }] },
      { id: 'uo', role: 'user', sourceKind: 'user', timestamp: 21,
        content: [{ type: 'image', mimeType: 'image/png', data: `A${'A'.repeat(28 * 1024 * 1024)}` }] },
    ];
    const adapter = historyAdapter(messages);
    try {
      const history = await adapter.getSessionMessages('native-session');
      const flattened = JSON.stringify(history);
      expect(flattened).not.toContain('data:image');
      expect(flattened).not.toContain('not-base64!');
      expect(history[0]).toMatchObject({ content: [
        { type: 'text', text: 'broken' },
        { type: 'text', text: '[DeepSeek Harness returned an invalid or unsupported image]' },
      ] });
      expect(history[1]).toMatchObject({ content: [{ type: 'text', text: '[DeepSeek Harness returned an invalid or unsupported image]' }] });
      const projected = backendSessionMessagesToChat('dsh', history);
      expect(projected.every((message) => !message.images)).toBe(true);
    } finally { await adapter.stop(); }
  });

  it('keeps canonical-but-fake and mime-mismatched payloads as invalid placeholders, valid siblings intact', async () => {
    const messages: DshJsonObject[] = [
      { id: 'uf', role: 'user', sourceKind: 'user', timestamp: 22,
        content: [{ type: 'text', text: 'see chart' }, { type: 'image', mimeType: 'image/png', data: 'AAAA' }] },
      { id: 'acm', role: 'assistant', timestamp: 23, content: [{ type: 'tool-call', id: 'cm', name: 'shot', arguments: '{}' }] },
      { id: 'tm', role: 'tool', toolCallId: 'cm', isError: false, timestamp: 24,
        content: [
          { type: 'image', mimeType: 'image/png', data: imageData },
          { type: 'image', mimeType: 'image/jpeg', data: imageData },
        ] },
    ];
    const adapter = historyAdapter(messages);
    try {
      const history = await adapter.getSessionMessages('native-session');
      const flattened = JSON.stringify(history);
      // No data URI from any failed admission, in any role.
      expect(flattened).not.toContain('data:image/png;base64,AAAA');
      expect(flattened).not.toContain('data:image/jpeg');
      // Fake canonical payload degrades to the invalid placeholder; the real text sibling survives.
      expect(history[0]).toMatchObject({ content: [
        { type: 'text', text: 'see chart' },
        { type: 'text', text: '[DeepSeek Harness returned an invalid or unsupported image]' },
      ] });
      // Mixed tool content: the verified sibling keeps the markdown form, the mismatched one degrades.
      expect(history[2]).toMatchObject({ content: [{ type: 'tool_result', toolCallId: 'cm',
        content: `\n![DeepSeek Harness image](data:image/png;base64,${imageData})\n\n[DeepSeek Harness returned an invalid or unsupported image]` }] });
      const projected = backendSessionMessagesToChat('dsh', history);
      expect(projected.every((message) => !message.images)).toBe(true);
      expect(projected[0].content).toBe('see chart\n[DeepSeek Harness returned an invalid or unsupported image]');
      expect(projected[1].toolCalls?.[0].result)
        .toBe(`\n![DeepSeek Harness image](data:image/png;base64,${imageData})\n\n[DeepSeek Harness returned an invalid or unsupported image]`);
    } finally { await adapter.stop(); }
  });

  it('gates live assistant and tool image chunks through the same admission', async () => {
    let client!: FakeDshClient;
    const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: settings, createClient: (options) => {
      client = new FakeDshClient(options);
      client.handshake = { agentCapabilities: { promptCapabilities: { image: true } } };
      return client;
    } });
    const sessionId = await adapter.createSession();
    const stream = collect(adapter.sendMessage({ sessionId, content: 'look' }));
    await tick();
    // Verified live payloads keep their forms; fake/mismatched ones degrade to placeholders.
    client.emitUpdate(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'image', mimeType: 'image/png', data: 'AAAA' } });
    client.emitUpdate(sessionId, { sessionUpdate: 'tool_call_update', toolCallId: 'tf', status: 'completed',
      content: [{ type: 'content', content: { type: 'image', mimeType: 'image/jpeg', data: imageData } }] });
    client.emitUpdate(sessionId, { sessionUpdate: 'tool_call_update', toolCallId: 'tv', status: 'completed',
      content: [{ type: 'content', content: { type: 'image', mimeType: 'image/png', data: imageData } }] });
    client.resolvePrompt(sessionId);
    const chunks = await stream;
    expect(chunks).toContainEqual({ type: 'text', content: '[DeepSeek Harness returned an invalid or unsupported image]' });
    expect(chunks).toContainEqual({ type: 'tool_result', toolUseId: 'tf',
      content: '[DeepSeek Harness returned an invalid or unsupported image]', isError: false });
    expect(chunks).toContainEqual({ type: 'tool_result', toolUseId: 'tv', content: `data:image/png;base64,${imageData}`, isError: false });
    expect(JSON.stringify(chunks)).not.toContain('base64,AAAA');
    expect(JSON.stringify(chunks)).not.toContain(`data:image/jpeg;base64,${imageData.slice(0, 48)}`);
    await adapter.stop();
  });
});
