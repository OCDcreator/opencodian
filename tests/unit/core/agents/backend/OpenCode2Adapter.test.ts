import { describe, expect, it, jest } from '@jest/globals';

import { OpenCode2Adapter } from '../../../../../src/core/agents/backend/OpenCode2Adapter';

function adapterWithClient(client: object): OpenCode2Adapter {
  const adapter = new OpenCode2Adapter({
    workingDirectory: '/vault',
    getSettings: () => ({ mode: 'remote', executablePath: '', baseUrl: 'http://127.0.0.1:4096', password: '' }),
  });
  Object.assign(adapter, { client: { server: { info: async () => ({ version: '2.0.18' }) }, ...client }, connectionKey: JSON.stringify(['remote', '', 'http://127.0.0.1:4096', '', '']) });
  return adapter;
}

// eslint-disable-next-line max-lines-per-function -- protocol boundary scenarios share one adapter/client harness.
describe('OpenCode2Adapter protocol boundary', () => {
  it('requests a whole-session native diff range instead of the latest-turn default', async () => {
    const diff = jest.fn(async () => [{ file: 'first.md', additions: 2, deletions: 0 }]);
    const adapter = adapterWithClient({
      session: { get: async () => ({ id: 's1', location: { vcs: { type: 'git' } } }), diff },
      message: { list: async () => ({ cursor: {}, data: [
        { id: 'u1', type: 'user' }, { id: 'a1', type: 'assistant', snapshot: { start: 'tree-1' } },
        { id: 'u2', type: 'user' }, { id: 'a2', type: 'assistant' },
      ] }) },
    });
    expect(await adapter.getSessionDiff('s1')).toEqual([{ file: 'first.md', additions: 2, deletions: 0 }]);
    expect(diff).toHaveBeenCalledWith({ sessionID: 's1', from: 'u1', to: 'u2' });
  });

  it('excludes the rewound turn from a session sidebar range and preserves single-turn reads', async () => {
    const diff = jest.fn(async () => []);
    const adapter = adapterWithClient({
      session: { get: async () => ({ id: 's1', location: { vcs: { type: 'git' } }, revert: { messageID: 'u2' } }), diff },
      message: { list: async () => ({ cursor: {}, data: [
        { id: 'u1', type: 'user' }, { id: 'a1', type: 'assistant', snapshot: { start: 'tree-1' } },
        { id: 'u2', type: 'user' }, { id: 'a2', type: 'assistant' },
      ] }) },
    });
    await adapter.getSessionDiff('s1');
    expect(diff).toHaveBeenLastCalledWith({ sessionID: 's1', from: 'u1', to: 'u1' });
    await adapter.getSessionDiff('s1', 'u2');
    expect(diff).toHaveBeenLastCalledWith({ sessionID: 's1', from: 'u2' });
  });

  it('reports native sidebar diff unavailable in a non-Git vault', async () => {
    const diff = jest.fn(async () => []);
    const adapter = adapterWithClient({
      session: { get: async () => ({ id: 's1', location: { directory: '/vault' } }), diff },
      message: { list: async () => ({ cursor: {}, data: [{ id: 'u1', type: 'user' }] }) },
    });
    expect(await adapter.getSessionDiff('s1')).toBeNull();
    expect(diff).not.toHaveBeenCalled();
  });

  it('reads a background subagent from native parent tool metadata and child outcome', async () => {
    const adapter = adapterWithClient({
      session: { list: async () => ({ data: [{ id: 'ses_child', title: 'Review notes', outcome: 'succeeded' }] }) },
      message: { list: async () => ({ cursor: {}, data: [{ id: 'a1', type: 'assistant', content: [{
        type: 'tool', name: 'subagent', state: { status: 'completed',
          input: { description: 'Review notes', background: true },
          metadata: { sessionID: 'ses_child', status: 'running' }, content: [],
        },
      }] }] }) },
    });
    expect(await adapter.getBackgroundTasks('ses_parent')).toEqual([{
      taskId: 'ses_child', status: 'completed', description: 'Review notes', cancellable: false,
    }]);
  });

  it('interrupts only a running child linked to the requested parent', async () => {
    const interrupt = jest.fn(async () => ({}));
    const adapter = adapterWithClient({
      session: { list: async () => ({ data: [{ id: 'ses_child', outcome: 'running' }] }), interrupt },
      message: { list: async () => ({ cursor: {}, data: [{ id: 'a1', type: 'assistant', content: [{
        type: 'tool', name: 'subagent', state: { status: 'completed',
          input: { description: 'Review notes', background: true },
          metadata: { sessionID: 'ses_child', status: 'running' }, content: [],
        },
      }] }] }) },
    });
    expect(await adapter.cancelBackgroundTask('ses_parent', 'ses_other')).toBe(false);
    expect(interrupt).not.toHaveBeenCalled();
    expect(await adapter.cancelBackgroundTask('ses_parent', 'ses_child')).toBe(true);
    expect(interrupt).toHaveBeenCalledWith({ sessionID: 'ses_child' });
  });

  it('waits for the initial agent catalog instead of showing an empty management list', async () => {
    const list = jest.fn(async () => ({ data: list.mock.calls.length < 2
      ? [] : [{ id: 'build', name: 'Build', mode: 'primary' }] }));
    const adapter = adapterWithClient({ agent: { list } });
    expect((await adapter.listAgents()).map((agent) => agent.id)).toEqual(['build']);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('reconnects once when a listener disappears before the owned process exit event', async () => {
    const adapter = adapterWithClient({ server: { info: async () => { throw new Error('connection refused'); } } });
    const connect = jest.fn(async () => { Object.assign(adapter, { client: { server: { info: async () => ({ version: '2.0.18' }) } } }); });
    Object.assign(adapter, { connect });
    await Promise.all([adapter.start(), adapter.start()]);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(adapter.status).toBe('connected');
  });
  it('rejects a config overlay whose native readback changed a nested value and restores settings', async () => {
    const settings = { mode: 'local' as const, executablePath: 'opencode2', baseUrl: '', password: '', configContent: '{"compaction":{"auto":true}}' };
    const adapter = new OpenCode2Adapter({ workingDirectory: '/vault', getSettings: () => settings });
    Object.assign(adapter, { ready: async () => ({ config: { get: async () => [{ type: 'document', info: { compaction: { auto: true } } }] } }) });
    await expect(adapter.validateConfigContent('{"compaction":{"auto":false}}')).rejects.toThrow('readback did not match');
    expect(settings.configContent).toBe('{"compaction":{"auto":true}}');
  });

  it('accepts exact nested config values when the server adds defaults', async () => {
    const settings = { mode: 'local' as const, executablePath: 'opencode2', baseUrl: '', password: '', configContent: '' };
    const adapter = new OpenCode2Adapter({ workingDirectory: '/vault', getSettings: () => settings });
    Object.assign(adapter, { ready: async () => ({ config: { get: async () => [{ type: 'document', info: { compaction: { auto: false, prune: true } } }] } }) });
    await adapter.validateConfigContent('{"compaction":{"auto":false}}');
    expect(settings.configContent).toBe('{"compaction":{"auto":false}}');
  });

  it('accepts the native normalized agent and command model reference', async () => {
    const settings = { mode: 'local' as const, executablePath: 'opencode2', baseUrl: '', password: '', configContent: '' };
    const adapter = new OpenCode2Adapter({ workingDirectory: '/vault', getSettings: () => settings });
    Object.assign(adapter, { ready: async () => ({ config: { get: async () => [{ type: 'document', info: {
      agents: { reviewer: { model: { providerID: 'provider', model: 'model-a', variant: 'high' } } },
    } }] } }) });
    await adapter.validateConfigContent('{"agents":{"reviewer":{"model":"provider/model-a#high"}}}');
    expect(settings.configContent).toContain('provider/model-a#high');
  });

  it('rejects a normalized native model reference that names another provider', async () => {
    const settings = { mode: 'local' as const, executablePath: 'opencode2', baseUrl: '', password: '', configContent: '' };
    const adapter = new OpenCode2Adapter({ workingDirectory: '/vault', getSettings: () => settings });
    Object.assign(adapter, { ready: async () => ({ config: { get: async () => [{ type: 'document', info: {
      agents: { reviewer: { model: { providerID: 'other', model: 'model-a' } } },
    } }] } }) });
    await expect(adapter.validateConfigContent('{"agents":{"reviewer":{"model":"provider/model-a"}}}'))
      .rejects.toThrow('readback did not match');
    expect(settings.configContent).toBe('');
  });

  it('refuses an MCP connected claim when the native server reports failed', async () => {
    const connect = jest.fn(async () => {});
    const adapter = adapterWithClient({ mcp: { connect, list: async () => ({ data: [{ name: 'test', status: { status: 'failed' } }] }) } });
    await expect(adapter.setMcpConnection('test', true)).rejects.toThrow('readback failed');
    expect(connect).toHaveBeenCalledWith({ server: 'test', location: { directory: '/vault' } });
  });

  it('keeps concurrent session text isolated', async () => {
    async function* events() {
      yield { type: 'server.connected' };
      yield { type: 'session.text.delta', data: { sessionID: 's1', delta: 'ONE' } };
      yield { type: 'session.text.delta', data: { sessionID: 's2', delta: 'TWO' } };
      yield { type: 'session.execution.succeeded', data: { sessionID: 's1' } };
      yield { type: 'session.execution.succeeded', data: { sessionID: 's2' } };
    }
    const adapter = adapterWithClient({ event: { subscribe: () => events() }, session: { prompt: async () => ({}) } });
    const collect = async (sessionId: string) => {
      let text = '';
      for await (const chunk of adapter.sendMessage({ sessionId, content: 'test' })) if (chunk.type === 'text') text += chunk.content;
      return text;
    };
    expect(await Promise.all([collect('s1'), collect('s2')])).toEqual(['ONE', 'TWO']);
  });

  it('streams only the active session and stops at its execution success', async () => {
    async function* events() {
      yield { type: 'server.connected' };
      yield { type: 'session.text.delta', data: { sessionID: 'other', delta: 'wrong' } };
      yield { type: 'session.inbox.delivered', data: { sessionID: 's1', inboxID: 'inbox-1' } };
      yield { type: 'session.text.delta', data: { sessionID: 's1', delta: 'hello' } };
      yield { type: 'session.execution.succeeded', data: { sessionID: 's1' } };
    }
    const prompt = jest.fn(async () => ({ id: 'inbox-1' }));
    const adapter = adapterWithClient({
      event: { subscribe: () => events() },
      session: { prompt },
    });
    const chunks = [];
    for await (const chunk of adapter.sendMessage({ sessionId: 's1', content: 'test' })) chunks.push(chunk);
    expect(chunks).toEqual([
      { type: 'message_start' },
      { type: 'text', content: 'hello' },
      { type: 'message_stop' },
    ]);
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ sessionID: 's1', text: 'test' }));
  });

  it('routes a selected primary agent and mentioned subagent through native v2 fields', async () => {
    async function* events() {
      yield { type: 'server.connected' };
      yield { type: 'session.inbox.delivered', data: { sessionID: 's1', inboxID: 'current' } };
      yield { type: 'session.execution.succeeded', data: { sessionID: 's1' } };
    }
    const prompt = jest.fn(async () => ({ id: 'current' }));
    const switchAgent = jest.fn(async () => {});
    const adapter = adapterWithClient({
      event: { subscribe: () => events() },
      agent: { list: async () => ({ data: [{ id: 'build', name: 'Build', mode: 'primary' }, { id: 'explore', name: 'Explore', mode: 'subagent' }] }) },
      session: { prompt, switchAgent },
      message: { list: async () => ({ data: [] }) },
    });
    for await (const chunk of adapter.sendMessage({ sessionId: 's1', content: 'ask', options: {
      agent: 'build', requestParts: [{ type: 'agent', name: 'explore' }],
    } })) { expect(chunk.type).not.toBe('error'); }
    expect(switchAgent).toHaveBeenCalledWith({ sessionID: 's1', agent: 'build' });
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ agents: [{ name: 'explore' }] }));
  });

  it('executes a visible slash skill through the native v2 skill identity', async () => {
    async function* events() {
      yield { type: 'server.connected' };
      yield { type: 'session.inbox.delivered', data: { sessionID: 's1', inboxID: 'current' } };
      yield { type: 'session.text.delta', data: { sessionID: 's1', delta: 'SKILL_OK' } };
      yield { type: 'session.execution.succeeded', data: { sessionID: 's1' } };
    }
    const prompt = jest.fn(async () => ({ id: 'current' }));
    const adapter = adapterWithClient({
      event: { subscribe: () => events() }, session: { prompt },
      skill: { list: async () => ({ data: [{ id: 'skill-native-1', name: 'acceptance-skill' }] }) },
    });
    for await (const chunk of adapter.sendMessage({ sessionId: 's1', content: '/acceptance-skill test' })) {
      expect(chunk.type).not.toBe('error');
    }
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ skills: [{ id: 'skill-native-1', name: 'acceptance-skill' }] }));
  });

  it('ignores a previous completion until its own inbox item is delivered', async () => {
    async function* events() {
      yield { type: 'server.connected' };
      yield { type: 'session.execution.succeeded', data: { sessionID: 's1' } };
      yield { type: 'session.inbox.delivered', data: { sessionID: 's1', inboxID: 'current' } };
      yield { type: 'session.text.delta', data: { sessionID: 's1', delta: 'CURRENT' } };
      yield { type: 'session.execution.succeeded', data: { sessionID: 's1' } };
    }
    const adapter = adapterWithClient({ event: { subscribe: () => events() }, session: { prompt: async () => ({ id: 'current' }) } });
    const chunks = [];
    for await (const chunk of adapter.sendMessage({ sessionId: 's1', content: 'test' })) chunks.push(chunk);
    expect(chunks).toContainEqual({ type: 'text', content: 'CURRENT' });
  });

  it('restores text and completed tool calls from native message history', async () => {
    const adapter = adapterWithClient({
      message: { list: async () => ({ cursor: {}, data: [
        { id: 'u1', type: 'user', text: 'request', time: { created: 1 } },
        { id: 'a1', type: 'assistant', time: { created: 2 }, model: { id: 'model-a' }, content: [
          { type: 'text', text: 'done' },
          { type: 'tool', id: 'tool-1', name: 'read', state: {
            status: 'completed', input: { file: 'note.md' }, content: [{ type: 'text', text: 'contents' }],
          } },
        ] },
      ] }) },
    });
    expect(await adapter.getChatMessages('s1')).toEqual([
      { id: 'u1', role: 'user', content: 'request', timestamp: 1, sourceMessageId: 'u1' },
      { id: 'a1', role: 'assistant', content: 'done', timestamp: 2, sourceMessageId: 'a1',
        modelId: 'model-a', toolCalls: [{ id: 'tool-1', name: 'read', input: { file: 'note.md' },
          status: 'completed', result: 'contents' }] },
    ]);
  });

  it('reads every message page before restoring a long conversation', async () => {
    const list = jest.fn(async (input: { cursor?: string }) => input.cursor
      ? { data: [{ id: 'u2', type: 'user', text: 'second', time: { created: 2 } }], cursor: {} }
      : { data: Array.from({ length: 100 }, (_, index) => ({ id: `u${index}`, type: 'user', text: index === 0 ? 'first' : `message-${index}`, time: { created: index + 1 } })), cursor: { next: 'page-2' } });
    const adapter = adapterWithClient({ message: { list } });
    const messages = await adapter.getChatMessages('s1');
    expect(messages).toHaveLength(101);
    expect(messages[0].content).toBe('first');
    expect(messages.at(-1)?.content).toBe('second');
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ cursor: 'page-2' }));
  });

  it('stops at a short page even when the server supplies a next cursor', async () => {
    const list = jest.fn(async () => ({
      data: [{ id: 'u1', type: 'user', text: 'only', time: { created: 1 } }],
      cursor: { next: 'invalid-after-short-page' },
    }));
    const adapter = adapterWithClient({ message: { list } });
    expect(await adapter.getChatMessages('s1')).toHaveLength(1);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('releases a session when the initial SSE subscription fails, allowing retry', async () => {
    let attempts = 0;
    async function* events() {
      attempts += 1;
      if (attempts === 1) throw new Error('network down');
      yield { type: 'server.connected' };
      yield { type: 'session.text.delta', data: { sessionID: 's1', delta: 'retry' } };
      yield { type: 'session.execution.succeeded', data: { sessionID: 's1' } };
    }
    const adapter = adapterWithClient({ event: { subscribe: () => events() }, session: { prompt: async () => ({}) } });
    await expect(adapter.sendMessage({ sessionId: 's1', content: 'first' }).next()).rejects.toThrow('network down');
    const chunks = [];
    for await (const chunk of adapter.sendMessage({ sessionId: 's1', content: 'again' })) chunks.push(chunk);
    expect(chunks).toContainEqual({ type: 'text', content: 'retry' });
  });

});

describe('OpenCode2Adapter settings readiness', () => {
  it('applies Plan with a native agent and verifies effective session rules', async () => {
    const update = jest.fn(async () => {});
    const switchAgent = jest.fn(async () => {});
    const adapter = adapterWithClient({
      agent: { list: async () => ({ data: [{ id: 'plan', name: 'Plan' }] }) },
      session: { update, switchAgent, get: async () => ({ agent: 'plan', permissions: [] }) },
    });
    await adapter.applyPermissionMode('s1', 'plan');
    expect(update).toHaveBeenCalledWith({ sessionID: 's1', permissions: [] });
    expect(switchAgent).toHaveBeenCalledWith({ sessionID: 's1', agent: 'plan' });
  });

  it('waits for Build before applying a permission mode immediately after startup', async () => {
    const list = jest.fn(async () => ({ data: list.mock.calls.length < 2
      ? [] : [{ id: 'build', name: 'Build', mode: 'primary' }] }));
    const update = jest.fn(async () => {});
    const switchAgent = jest.fn(async () => {});
    const adapter = adapterWithClient({ agent: { list }, session: { update, switchAgent,
      get: async () => ({ agent: 'build', permissions: [{ action: '*', resource: '*', effect: 'allow' }] }) } });
    await adapter.applyPermissionMode('s1', 'yolo');
    expect(list).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith({ sessionID: 's1',
      permissions: [{ action: '*', resource: '*', effect: 'allow' }] });
    expect(switchAgent).toHaveBeenCalledWith({ sessionID: 's1', agent: 'build' });
  });

  it('translates form option labels to values and preserves boolean and numeric types', async () => {
    const fields = [
      { key: 'choice', type: 'string', options: [{ label: 'Displayed', value: 'native-value' }] },
      { key: 'enabled', type: 'boolean' },
      { key: 'count', type: 'number' },
    ];
    const reply = jest.fn(async () => {});
    const adapter = adapterWithClient({
      form: { list: async () => ({ data: [{ id: 'f1', sessionID: 's1', title: 'Question', fields }] }) },
      session: { form: { get: async () => ({ fields }), reply } },
    });
    await adapter.getPendingQuestions();
    await adapter.replyToQuestion('f1', [['Displayed'], ['false'], ['12']]);
    expect(reply).toHaveBeenCalledWith({ sessionID: 's1', formID: 'f1', answer: { choice: 'native-value', enabled: false, count: 12 } });
  });
});
