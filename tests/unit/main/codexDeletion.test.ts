import { AgentCapability } from '../../../src/core/agents/AgentCapability';
import { AgentServiceRegistry } from '../../../src/core/agents/backend/AgentServiceRegistry';
import { CodexAdapter, type CodexFactory } from '../../../src/core/agents/backend/CodexAdapter';
import { CodexAppServerClient } from '../../../src/core/agents/backend/CodexAppServerClient';
import type { Conversation } from '../../../src/core/types';
import { ConversationTabLifecycleRecoveryCoordinator } from '../../../src/features/chat/services/ConversationTabLifecycleRecoveryCoordinator';
import { TabManager } from '../../../src/features/chat/tabs/TabManager';
import OpenCodianPlugin from '../../../src/main';

jest.mock('@opencode-ai/sdk/v2/client', () => ({
  createOpencodeClient: jest.fn(),
}), { virtual: true });
(globalThis as { BUILD_ID?: string }).BUILD_ID = 'test-build';

function conversation(id: string, sessionId?: string, backend: Conversation['backend'] = 'codex'): Conversation {
  return { id, title: id, backend, backendSessionId: sessionId, createdAt: 1, updatedAt: 1, messages: [] };
}

function pluginFixture(conversations: Conversation[], backend?: unknown) {
  const plugin = new OpenCodianPlugin();
  const state = plugin as unknown as {
    conversations: Conversation[];
    agentServiceRegistry: AgentServiceRegistry;
    storage: { deleteConversation: jest.Mock };
    conversationFullMessageCache: { forget: jest.Mock };
  };
  state.conversations = conversations;
  state.agentServiceRegistry = { get: () => backend } as unknown as AgentServiceRegistry;
  state.storage = { deleteConversation: jest.fn().mockResolvedValue(undefined) };
  state.conversationFullMessageCache = { forget: jest.fn() };
  return { plugin, state };
}

async function codexFixture(withServer = true) {
  const client = new CodexAppServerClient({ codexPathOverride: '/fixture/codex' });
  jest.spyOn(client, 'start').mockResolvedValue(undefined);
  jest.spyOn(client, 'stop').mockResolvedValue(undefined);
  const request = jest.spyOn(client as unknown as {
    request(method: string, params: Record<string, unknown>, timeout?: number): Promise<unknown>;
  }, 'request');
  request.mockImplementation(async (method) => {
    if (method === 'thread/read') throw new Error('thread not found: native-thread');
    return {};
  });
  const adapter = new CodexAdapter({
    createAppServerClient: () => withServer ? client : null,
    createCodex: async () => ({}) as Awaited<ReturnType<CodexFactory>>,
  });
  await adapter.start();
  const localId = await adapter.createSession();
  const adapterState = adapter as unknown as {
    sessions: Map<string, { threadId: string | null }>;
    threadAlias: Map<string, string>;
    sessionEffectiveSettings: Map<string, unknown>;
  };
  adapterState.sessions.get(localId)!.threadId = 'native-thread';
  adapterState.threadAlias.set('native-thread', localId);
  adapterState.sessionEffectiveSettings.set(localId, { model: 'fixture-model' });
  const fixture = pluginFixture([conversation('codex', localId)], adapter);
  return { ...fixture, adapter, adapterState, client, request, localId };
}

function expectRetained(fixture: Awaited<ReturnType<typeof codexFixture>>) {
  expect(fixture.state.conversations).toHaveLength(1);
  expect(fixture.state.storage.deleteConversation).not.toHaveBeenCalled();
  expect(fixture.state.conversationFullMessageCache.forget).not.toHaveBeenCalled();
  expect(fixture.adapterState.sessions.has(fixture.localId)).toBe(true);
  expect(fixture.adapterState.threadAlias.get('native-thread')).toBe(fixture.localId);
  expect(fixture.adapterState.sessionEffectiveSettings.has(fixture.localId)).toBe(true);
}

function commitGate() {
  let resolve!: () => void;
  const promise = new Promise<void>((release) => { resolve = release; });
  return { promise, resolve };
}

describe('Codex product deletion local commit concurrency (RC-CX-03)', () => {
  it.each(['A', 'B'])('removes each ID exactly when its deferred native/storage commit completes (%s first)', async (firstId) => {
    const nativeGates = { A: commitGate(), B: commitGate() };
    const storageGates = { A: commitGate(), B: commitGate() };
    const deleteSession = jest.fn((sessionId: string) => nativeGates[sessionId as 'A' | 'B'].promise);
    const fixture = pluginFixture(['A', 'B', 'C'].map((id) => conversation(id, id)), {
      hasCapability: (cap: AgentCapability) => cap === AgentCapability.Sessions, deleteSession,
    });
    fixture.state.storage.deleteConversation.mockImplementation((id: 'A' | 'B') => storageGates[id].promise);
    const deletingA = fixture.plugin.deleteConversation('A');
    const deletingB = fixture.plugin.deleteConversation('B');
    expect(fixture.state.storage.deleteConversation).not.toHaveBeenCalled();
    nativeGates[firstId as 'A' | 'B'].resolve();
    const secondId = firstId === 'A' ? 'B' : 'A';
    nativeGates[secondId].resolve();
    await Promise.resolve();
    expect(fixture.state.storage.deleteConversation).toHaveBeenCalledTimes(2);
    expect(fixture.state.conversations.map((item) => item.id)).toEqual(['A', 'B', 'C']);
    storageGates[firstId as 'A' | 'B'].resolve();
    await (firstId === 'A' ? deletingA : deletingB);
    expect(fixture.state.conversations.map((item) => item.id)).toEqual(firstId === 'A' ? ['B', 'C'] : ['A', 'C']);
    storageGates[secondId].resolve();
    await (secondId === 'A' ? deletingA : deletingB);
    expect(fixture.state.conversations.map((item) => item.id)).toEqual(['C']);
    expect(fixture.state.conversationFullMessageCache.forget.mock.calls.map(([id]) => id)).toEqual([firstId, secondId]);
  });

  it('does not splice a neighboring conversation after duplicate same-ID deferred commits', async () => {
    const nativeFirst = commitGate();
    const nativeSecond = commitGate();
    const storageFirst = commitGate();
    const storageSecond = commitGate();
    const deleteSession = jest.fn().mockReturnValueOnce(nativeFirst.promise).mockReturnValueOnce(nativeSecond.promise);
    const fixture = pluginFixture(['A', 'B', 'C'].map((id) => conversation(id, id)), {
      hasCapability: (cap: AgentCapability) => cap === AgentCapability.Sessions, deleteSession,
    });
    fixture.state.storage.deleteConversation.mockReturnValueOnce(storageFirst.promise).mockReturnValueOnce(storageSecond.promise);
    const first = fixture.plugin.deleteConversation('A');
    const second = fixture.plugin.deleteConversation('A');
    nativeFirst.resolve();
    nativeSecond.resolve();
    await Promise.resolve();
    expect(fixture.state.storage.deleteConversation).toHaveBeenCalledTimes(2);
    storageFirst.resolve();
    await first;
    expect(fixture.state.conversations.map((item) => item.id)).toEqual(['B', 'C']);
    storageSecond.resolve();
    await second;
    expect(fixture.state.conversations.map((item) => item.id)).toEqual(['B', 'C']);
    expect(fixture.state.conversationFullMessageCache.forget.mock.calls).toEqual([['A'], ['A']]);
  });
});

describe('Codex product deletion', () => {
  it.each(['false', 'error', 'unsupported'])('retains storage/cache/identity after native %s and permits retry', async (failure) => {
    const fixture = await codexFixture();
    fixture.request.mockImplementation(async (method) => {
      if (method === 'thread/delete') {
        if (failure === 'false') return false;
        throw Object.assign(new Error(failure), { code: failure === 'unsupported' ? -32601 : -32600 });
      }
      return {};
    });
    await expect(fixture.plugin.deleteConversation('codex')).rejects.toMatchObject({
      result: { status: failure === 'unsupported' ? 'unavailable' : 'failed' },
    });
    expectRetained(fixture);
    fixture.request.mockImplementation(async (method) => {
      if (method === 'thread/read') throw new Error('thread not found: native-thread');
      return {};
    });
    await fixture.plugin.deleteConversation('codex');
    expect(fixture.state.storage.deleteConversation).toHaveBeenCalledWith('codex');
    expect(fixture.state.conversationFullMessageCache.forget).toHaveBeenCalledWith('codex');
    expect(fixture.adapterState.threadAlias.has('native-thread')).toBe(false);
    await fixture.adapter.stop();
  });

  it('rejects ACK-only completion as admitted/pending, retains local state, then verifies on retry', async () => {
    const fixture = await codexFixture();
    fixture.request.mockImplementation(async (method) => method === 'thread/read'
      ? { thread: { id: 'native-thread', preview: 'still readable' } } : {});
    await expect(fixture.plugin.deleteConversation('codex')).rejects.toMatchObject({
      message: expect.stringContaining('pending (admitted)'),
      result: { status: 'admitted', threadId: 'native-thread', readback: { status: 'failed' } },
    });
    expectRetained(fixture);
    fixture.request.mockImplementation(async (method) => {
      if (method === 'thread/read') throw new Error('thread native-thread does not exist');
      return {};
    });
    await fixture.plugin.deleteConversation('codex');
    expect(fixture.state.conversations).toEqual([]);
    await fixture.adapter.stop();
  });

  it.each(['selected', 'all'])('preserves the native conversation/cache/tab in a partial %s product deletion and retries the same ID', async (mode) => {
    const fixture = await codexFixture();
    fixture.state.conversations.push(conversation('draft'));
    fixture.request.mockImplementation(async (method) => {
      if (method === 'thread/read') throw new Error('readback disconnected');
      return {};
    });
    const tabManager = new TabManager('New chat', { getMaxTabs: () => 4 });
    const nativeTab = tabManager.createTab(fixture.state.conversations[0])!;
    const draftTab = tabManager.createTab(fixture.state.conversations[1])!;
    const host = {
      getTabManager: () => tabManager,
      isTabForegroundBusy: () => false,
      getCurrentConversationId: () => 'codex',
      createConversation: jest.fn(),
      deleteConversation: (id: string) => fixture.plugin.deleteConversation(id),
      clearTabMessagesPanes: jest.fn(), resetTabManager: jest.fn(),
      removeTabMessagesPane: jest.fn(), showNotice: jest.fn(),
    };
    const port = { activateTab: jest.fn(), createConversationInNewTab: jest.fn() };
    const coordinator = new ConversationTabLifecycleRecoveryCoordinator(host, port);
    const deletion = mode === 'all' ? coordinator.deleteAllConversationsAndReset(['codex', 'draft'])
      : coordinator.deleteConversationsAndRecover(['codex', 'draft']);
    await expect(deletion).rejects.toMatchObject({ result: { status: 'admitted', threadId: 'native-thread' } });
    expect(fixture.state.conversations.map((item) => item.id)).toEqual(['codex']);
    expect(fixture.state.storage.deleteConversation.mock.calls).toEqual([['draft']]);
    expect(fixture.state.conversationFullMessageCache.forget.mock.calls).toEqual([['draft']]);
    expect(tabManager.getAllTabs().map((tab) => tab.id)).toEqual([nativeTab.id]);
    expect(host.removeTabMessagesPane.mock.calls).toEqual([[draftTab.id]]);
    expect(host.resetTabManager).not.toHaveBeenCalled();
    expect(fixture.adapterState.threadAlias.get('native-thread')).toBe(fixture.localId);
    fixture.request.mockImplementation(async () => { throw new Error('thread not found: native-thread'); });
    await coordinator.deleteConversationsAndRecover(['codex']);
    expect(fixture.state.conversations).toEqual([]);
    expect(fixture.state.storage.deleteConversation.mock.calls).toEqual([['draft'], ['codex']]);
    expect(fixture.adapterState.threadAlias.has('native-thread')).toBe(false);
    expect(tabManager.getTabCount()).toBe(0);
    expect(port.createConversationInNewTab).toHaveBeenCalledTimes(1);
    await fixture.adapter.stop();
  });

  it('fails closed for SDK native deletion but allows explicit local forgetting without native requests', async () => {
    const fixture = await codexFixture(false);
    await expect(fixture.plugin.deleteConversation('codex')).rejects.toMatchObject({ result: { status: 'unavailable' } });
    expectRetained(fixture);
    await fixture.plugin.deleteConversation('codex', { mode: 'forget-local' });
    expect(fixture.state.conversations).toEqual([]);
    expect(fixture.adapterState.sessions.has(fixture.localId)).toBe(false);
    expect(fixture.request).not.toHaveBeenCalled();
    await fixture.adapter.stop();
  });

  it('allows native-less drafts, with or without a provisional SDK session', async () => {
    const fixture = await codexFixture(false);
    fixture.adapterState.sessions.get(fixture.localId)!.threadId = null;
    fixture.adapterState.threadAlias.clear();
    fixture.state.conversations.push(conversation('draft'));
    await fixture.plugin.deleteConversation('codex');
    await fixture.plugin.deleteConversation('draft');
    expect(fixture.state.conversations).toEqual([]);
    expect(fixture.request).not.toHaveBeenCalled();
    await fixture.adapter.stop();
  });

  it('retains native Codex conversations when the owning service is absent', async () => {
    const { plugin, state } = pluginFixture([conversation('codex', 'native-thread')]);
    await expect(plugin.deleteConversation('codex')).rejects.toThrow('owning backend');
    expect(state.storage.deleteConversation).not.toHaveBeenCalled();
    expect(state.conversationFullMessageCache.forget).not.toHaveBeenCalled();
  });

  it('does not fall back to native deletion if explicit forgetting is unavailable', async () => {
    const deleteSession = jest.fn();
    const { plugin, state } = pluginFixture([conversation('codex', 'native-thread')], {
      hasCapability: (cap: AgentCapability) => cap === AgentCapability.Sessions, deleteSession,
    });
    await expect(plugin.deleteConversation('codex', { mode: 'forget-local' })).rejects.toThrow('forgetting is unavailable');
    expect(deleteSession).not.toHaveBeenCalled();
    expect(state.storage.deleteConversation).not.toHaveBeenCalled();
  });

  it('preserves ZCode failure propagation and prevents the Codex forget mode bypassing it', async () => {
    const deleteSession = jest.fn().mockRejectedValue(new Error('ZCode tombstone unverified'));
    const { plugin, state } = pluginFixture([conversation('zcode', 'native-zcode', 'zcode')], {
      hasCapability: (cap: AgentCapability) => cap === AgentCapability.Sessions, deleteSession,
    });
    await expect(plugin.deleteConversation('zcode')).rejects.toThrow('ZCode tombstone unverified');
    await expect(plugin.deleteConversation('zcode', { mode: 'forget-local' })).rejects.toThrow('only for Codex');
    expect(state.storage.deleteConversation).not.toHaveBeenCalled();
    deleteSession.mockResolvedValue(undefined);
    await plugin.deleteConversation('zcode');
    expect(state.storage.deleteConversation).toHaveBeenCalledWith('zcode');
  });

  it('keeps the legacy cleanup behavior of other backends', async () => {
    const { plugin, state } = pluginFixture([conversation('claude', 'native-claude', 'claude-code')], {
      hasCapability: (cap: AgentCapability) => cap === AgentCapability.Sessions,
      deleteSession: jest.fn().mockRejectedValue(new Error('legacy cleanup failure')),
    });
    await plugin.deleteConversation('claude');
    expect(state.storage.deleteConversation).toHaveBeenCalledWith('claude');
  });
});
