import { ClaudeCodeAdapter, type ClaudeCodeSdkFacade } from '../../../../../src/core/agents/backend/claude/ClaudeCodeAdapter';
import { CodexAdapter } from '../../../../../src/core/agents/backend/codex/CodexAdapter';
import { mapAppServerNotification } from '../../../../../src/core/agents/backend/codex/CodexAppServerStreamMapper';
import { DshAdapter } from '../../../../../src/core/agents/backend/dsh/DshAdapter';
import { OpenCode2Adapter } from '../../../../../src/core/agents/backend/opencode/OpenCode2Adapter';
import { PiAdapter } from '../../../../../src/core/agents/backend/pi/PiAdapter';
import { ZCodeAdapter } from '../../../../../src/core/agents/backend/zcode/ZCodeAdapter';
import { getDefaultClaudeCodeBackendSettings } from '../../../../../src/core/types';
import { FakeDshClient, settings } from './DshAdapter.fixture';

afterEach(() => jest.restoreAllMocks());

it('reads the OpenCode workspace catalog and exact-parent children without exposing MCP configuration', async () => {
  const list = jest.fn(async () => ({ data: [
    { id: 'child-good', title: 'Review', outcome: 'succeeded' }, { id: 'child-stopped', outcome: 'interrupted' }, { id: 'child-new' }, { id: 'ordinary-fork' },
  ] }));
  const mcpList = jest.fn(async () => ({ data: [{ name: 'notes', status: { status: 'connected' }, config: { headers: { Authorization: 'must-not-surface' } } }] }));
  const adapter = new OpenCode2Adapter({ workingDirectory: '/vault',
    getSettings: () => ({ mode: 'remote', executablePath: '', baseUrl: 'http://127.0.0.1:4096', password: '' }),
  });
  Object.assign(adapter, { client: { server: { info: async () => ({ version: '2.2.4' }) }, session: { list,
    get: async () => ({ tokens: { input: 300, output: 50, reasoning: 10, cache: { read: 640, write: 0 } }, cost: 0.01 }) }, mcp: { list: mcpList },
    message: { list: async () => ({ cursor: {}, data: [{ id: 'a', type: 'assistant', model: { providerID: 'p', id: 'm' },
      tokens: { input: 100, output: 20, reasoning: 0, cache: { read: 400, write: 0 } },
      content: ['child-good', 'child-stopped', 'child-new'].map((id) => ({ type: 'tool', name: 'subagent',
        state: { status: 'completed', input: { background: true }, metadata: { sessionID: id, status: 'running' } } })) }] }) },
    model: { list: async () => ({ data: [{ providerID: 'p', id: 'm', limit: { context: 8000 } }] }) },
  },
    connectionKey: JSON.stringify(['remote', '', 'http://127.0.0.1:4096', '', '']) });
  const data = await adapter.readSessionInformation('native-parent');
  expect(list).toHaveBeenCalledWith({ parentID: 'native-parent', directory: '/vault', limit: 100 });
  expect(mcpList).toHaveBeenCalledWith({ location: { directory: '/vault' } });
  expect(data.agents?.map((agent) => agent.status)).toEqual(['completed', 'failed', 'running']);
  expect(data.agents?.map((agent) => agent.id)).not.toContain('ordinary-fork');
  expect(data.context).toEqual({ tokens: 520, window: 8000 });
  expect(data.usage).toEqual({ inputTokens: 300, outputTokens: 50, totalTokens: 1000, cost: 0.01 });
  expect(data.mcp).toEqual({ scope: 'workspace', servers: [{ name: 'notes', status: 'connected' }] });
  expect(JSON.stringify(data)).not.toContain('must-not-surface');
  await expect(adapter.readChildSessionMessages('native-parent', 'unrelated')).rejects.toThrow('unavailable');
});

it('separates Codex plan windows from empty and unreported MCP catalogs', async () => {
  const adapter = new CodexAdapter({ createAppServerClient: () => null });
  jest.spyOn(adapter, 'getAccountRateLimits').mockResolvedValue({ rateLimits: { rateLimits: {
    planType: 'pro', primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1900000000 }, secondary: { usedPercent: NaN },
  } } });
  const catalog = jest.spyOn(adapter, 'getMcpServerStatusCatalog').mockResolvedValue({ status: 'complete', data: [], nextCursor: null });
  const data = await adapter.readSessionInformation('thread-exact');
  expect(data.quota).toEqual({ plan: 'pro', windows: [{ label: '300 min', usedPercent: 25, resetsAt: 1900000000000 }] });
  expect(data.mcp).toEqual({ scope: 'workspace', servers: [] });
  catalog.mockResolvedValue({ status: 'unavailable', data: [], nextCursor: null, errorReason: 'offline' });
  expect((await adapter.readSessionInformation('thread-exact')).mcp).toBeNull();
});

it('reconstructs Codex agents from native history and authorizes the exact parent-child relationship', async () => {
  const adapter = new CodexAdapter({ createAppServerClient: () => null });
  const readThread = jest.fn(async (id: string) => ({ id, turns: [{ id: 'turn', items: id === 'parent' ? [
    { id: 'first', type: 'subAgentActivity', agentThreadId: 'child', agentPath: 'reviewer', kind: 'started' },
    { id: 'last', type: 'subAgentActivity', agentThreadId: 'child', agentPath: 'reviewer', kind: 'completed' },
    { id: 'activity-without-native-thread', type: 'subAgentActivity', kind: 'started' },
  ] : [{ id: 'reply', type: 'agentMessage', text: 'Actual child transcript' }] }] }));
  const mapping = mapAppServerNotification({ event: { method: 'thread/tokenUsage/updated', params: { tokenUsage: {
    total: { totalTokens: 90000, inputTokens: 80000, outputTokens: 10000 }, last: { totalTokens: 12000 }, modelContextWindow: 200000,
  } } }, threadId: 'parent', sessionId: 'parent', modelId: 'm',
    streamState: { streamedAgentMessageItemIds: new Set(), streamedReasoningItemIds: new Set(), startedTodoItemIds: new Set(), outputSchema: undefined },
  });
  Object.assign(adapter, { appServerClient: { readThread }, appServerContextSnapshots: new Map([['parent', mapping.contextUsageSnapshot]]) });
  jest.spyOn(adapter, 'getAccountRateLimits').mockResolvedValue({ rateLimits: null });
  jest.spyOn(adapter, 'getMcpServerStatusCatalog').mockResolvedValue({ status: 'complete', data: [], nextCursor: null });
  const data = await adapter.readSessionInformation('parent');
  expect(data.agents).toEqual([{ id: 'child', title: 'reviewer', status: 'completed', readable: true }]);
  expect(data.context).toEqual({ tokens: 12000, window: 200000 });
  expect(data.usage?.totalTokens).toBe(90000);
  expect((await adapter.readChildSessionMessages('parent', 'child'))[0].content).toBe('Actual child transcript');
  await expect(adapter.readChildSessionMessages('parent', 'unrelated')).rejects.toThrow('unavailable');
  expect(readThread).not.toHaveBeenCalledWith('unrelated', true);
});

it('uses only the matching Claude query, keeps session usage independent and reads native subagents', async () => {
  const sdkQuery = jest.fn();
  const listSubagents = jest.fn(async () => ['agent-actual']);
  const getSubagentMessages = jest.fn(async () => [{ type: 'assistant', uuid: 'actual-msg', message: { role: 'assistant', content: [{ type: 'text', text: 'Actual child work' }] } }]);
  const sdk: ClaudeCodeSdkFacade = { query: sdkQuery, listSubagents, getSubagentMessages };
  const adapter = new ClaudeCodeAdapter({ vaultPath: '/vault', settings: getDefaultClaudeCodeBackendSettings(), sdk });
  const usage = jest.fn(async () => ({ subscription_type: 'max', rate_limits_available: true,
    rate_limits: { five_hour: { utilization: 45, resets_at: '2030-01-01T00:00:00Z' }, extra_usage: { utilization: 12, is_enabled: true } },
    session: { total_cost_usd: 1.25, model_usage: { m: { inputTokens: 100, outputTokens: 20, cacheReadInputTokens: 30, cacheCreationInputTokens: 10 } } },
  }));
  const otherUsage = jest.fn();
  const contextUsage = jest.fn(async () => ({ totalTokens: 2000, maxTokens: 10000, memoryFiles: [{ path: '/vault/CLAUDE.md', type: 'project' }] }));
  const sessions = new Map([
    ['local-a', { id: 'local-a', sdkSessionId: 'native-a', runtime: { query: { usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: usage,
      mcpServerStatus: async () => [{ name: 'native-mcp', status: 'connected' }], getContextUsage: contextUsage } } }],
    ['local-b', { id: 'local-b', sdkSessionId: 'native-b', runtime: { query: { usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: otherUsage } } }],
  ]);
  Object.assign(adapter, { sessions });
  const data = await adapter.readSessionInformation('native-a');
  expect(usage).toHaveBeenCalledWith({ skipBehaviors: true }); expect(otherUsage).not.toHaveBeenCalled(); expect(sdkQuery).not.toHaveBeenCalled();
  expect(data.quota?.windows).toEqual([{ label: 'five_hour', usedPercent: 45, resetsAt: Date.parse('2030-01-01T00:00:00Z') }]);
  expect(data.usage).toEqual({ inputTokens: 140, outputTokens: 20, cost: 1.25 });
  expect(data.context).toEqual({ tokens: 2000, window: 10000 });
  expect(contextUsage).toHaveBeenCalledWith({ detail: 'summary' });
  expect(data.sources).toEqual([{ label: '/vault/CLAUDE.md', path: '/vault/CLAUDE.md', detail: 'project' }]);
  expect(data.agents?.map((agent) => agent.id)).toEqual(['agent-actual']);
  expect((await adapter.readChildSessionMessages('native-a', 'agent-actual'))[0].content).toBe('Actual child work');
  expect(getSubagentMessages).toHaveBeenCalledWith('native-a', 'agent-actual', expect.objectContaining({ dir: '/vault' }));
});

it('keeps Claude shell tasks out of agent rows and rejects stale run notifications', async () => {
  const adapter = new ClaudeCodeAdapter({ vaultPath: '/vault', settings: getDefaultClaudeCodeBackendSettings(), sdk: { query: jest.fn() } });
  const state: { nativeAgentTasks?: Map<string, { status: string; runId?: string }> } = {};
  const observe = (adapter as unknown as { observeSessionAgentMessage(session: object, message: object): void }).observeSessionAgentMessage.bind(adapter);
  observe(state, { type: 'system', subtype: 'task_started', task_type: 'local_bash', task_id: 'shell' });
  expect(state.nativeAgentTasks).toBeUndefined();
  observe(state, { type: 'system', subtype: 'task_started', task_type: 'local_agent', task_id: 'actual', run_id: 'run-2' });
  observe(state, { type: 'system', subtype: 'task_notification', task_id: 'actual', run_id: 'run-1', status: 'completed' });
  expect(state.nativeAgentTasks?.get('actual')?.status).toBe('running');
  observe(state, { type: 'system', subtype: 'task_notification', task_id: 'actual', run_id: 'run-2', status: 'completed' });
  expect(state.nativeAgentTasks?.get('actual')?.status).toBe('completed');
});

it('reports only loaded Pi agent files and keeps extension-dependent capabilities unreported', async () => {
  const adapter = new PiAdapter({ workingDirectory: '/vault' });
  const command = jest.spyOn(adapter, 'command').mockResolvedValue({ context: { agentsFiles: [{ path: '/vault/AGENTS.md', content: 'private prompt body' }] },
    skills: { skills: [{ name: 'available-but-not-injected' }] }, tokens: { input: 100, output: 20, total: 700 }, cost: 0.01,
    contextUsage: { tokens: 400, contextWindow: 8000 } });
  const data = await adapter.readSessionInformation('pi-exact');
  expect(command).toHaveBeenCalledWith('pi-exact', 'get_resources');
  expect(data.sources).toEqual([{ label: 'AGENTS.md', path: '/vault/AGENTS.md', detail: 'Pi context' }]);
  expect(data.quota).toBeNull(); expect(data.mcp).toBeNull(); expect(data.agents).toBeNull();
  expect(data.usage).toEqual({ inputTokens: 100, outputTokens: 20, totalTokens: 700, cost: 0.01 });
  expect(data.context).toEqual({ tokens: 400, window: 8000 });
  expect(JSON.stringify(data)).not.toContain('private prompt body'); expect(JSON.stringify(data)).not.toContain('available-but-not-injected');
});

it('reads ZCode durable child linkage without activating or resuming the parent', async () => {
  const adapter = new ZCodeAdapter({ workingDirectory: '/vault' });
  const request = jest.fn(async () => ({ childSessionIds: ['running-child', 'ended-child', 'unknown-child'],
    running: [{ sessionId: 'running-child', description: 'Check notes' }], ended: { items: [{ sessionId: 'ended-child', status: 'completed' }] },
  }));
  Object.assign(adapter, { transport: { request } });
  jest.spyOn(adapter, 'getManagementCatalog').mockResolvedValue(null);
  const data = await adapter.readSessionInformation('native-parent');
  expect(request.mock.calls).toEqual([['session/subagents', { sessionId: 'native-parent' }]]);
  expect(data.agents).toEqual([
    { id: 'running-child', title: 'Check notes', status: 'running', readable: true },
    { id: 'ended-child', title: 'ended-child', status: 'completed', readable: true },
    { id: 'unknown-child', title: 'unknown-child', status: 'unknown', readable: true },
  ]);
});

it('reads Harness mounted MCP and durable children and authorizes child history through its parent', async () => {
  const nativeRequest = jest.fn(async (method: string) => method === 'session/information'
    ? { servers: [{ name: 'actual-mounted' }], agents: [{ id: 'native-child', title: 'Review', status: 'completed', readable: true }] }
    : { messages: [{ id: 'a', role: 'assistant', content: [{ type: 'text', text: 'Native child report' }] }] });
  const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: settings,
    createClient: (options) => Object.assign(new FakeDshClient(options), { nativeRequest }),
  });
  try {
    const data = await adapter.readSessionInformation('native-parent');
    expect(data.mcp).toEqual({ scope: 'session', servers: [{ name: 'actual-mounted', status: 'connected' }] });
    expect(data.agents?.[0]).toEqual({ id: 'native-child', title: 'Review', status: 'completed', readable: true });
    const messages = await adapter.readChildSessionMessages('native-parent', 'native-child');
    expect(nativeRequest.mock.calls).toEqual([
      ['session/information', { sessionId: 'native-parent' }], ['session/child-history', { sessionId: 'native-parent', childId: 'native-child' }],
    ]);
    expect(messages[0].content).toBe('Native child report');
  } finally { await adapter.stop(); }
});
