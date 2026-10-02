import { AgentCapability } from '../../../../src/core/agents/AgentCapability';
import { CodexAdapter } from '../../../../src/core/agents/backend/CodexAdapter';
import { CodexAppServerClient } from '../../../../src/core/agents/backend/CodexAppServerClient';
import { StorageService } from '../../../../src/core/storage/StorageService';
import type { Conversation } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { ConversationHistoryActionsCoordinator, type ConversationHistoryActionsHost } from '../../../../src/features/chat/services/ConversationHistoryActionsCoordinator';
import { ConversationHistoryDialogService } from '../../../../src/features/chat/services/ConversationHistoryDialogService';
import { ConversationLoadRecoveryCoordinator } from '../../../../src/features/chat/services/ConversationLoadRecoveryCoordinator';
import { ConversationTabLifecycleRecoveryCoordinator } from '../../../../src/features/chat/services/ConversationTabLifecycleRecoveryCoordinator';
import { TabManager } from '../../../../src/features/chat/tabs/TabManager';
import { setLocale, t } from '../../../../src/i18n';
import OpenCodianPlugin from '../../../../src/main';

jest.mock('@opencode-ai/sdk/v2/client', () => ({ createOpencodeClient: jest.fn() }), { virtual: true });
(globalThis as { BUILD_ID?: string }).BUILD_ID = 'test-build';

async function flushUI(): Promise<void> { await new Promise((resolve) => setTimeout(resolve, 0)); }
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((release) => { resolve = release; });
  return { promise, resolve };
}

function fixture() {
  const conversations: Conversation[] = ['A', 'B', 'C'].map((id) => ({ id, title: id, backend: 'codex', backendSessionId: `native-${id}`, messages: [], createdAt: 1, updatedAt: 1 }));
  const client = new CodexAppServerClient({ codexPathOverride: '/fixture/codex' });
  jest.spyOn(client, 'start').mockResolvedValue(undefined);
  const request = jest.spyOn(client as unknown as { request(method: string, params: Record<string, unknown>): Promise<unknown> }, 'request');
  const adapter = new CodexAdapter();
  const adapterState = adapter as unknown as {
    appServerClient: CodexAppServerClient;
    sessions: Map<string, { provisionalId: string; threadId: string }>;
    threadAlias: Map<string, string>;
    sessionEffectiveSettings: Map<string, unknown>;
  };
  adapterState.appServerClient = client;
  for (const id of ['A', 'B', 'C']) {
    adapterState.sessions.set(`local-${id}`, { provisionalId: `local-${id}`, threadId: `native-${id}` });
    adapterState.threadAlias.set(`native-${id}`, `local-${id}`);
    adapterState.sessionEffectiveSettings.set(`local-${id}`, { model: 'model' });
  }
  const plugin = new OpenCodianPlugin();
  const state = plugin as unknown as {
    conversations: Conversation[];
    agentServiceRegistry: unknown;
    storage: { deleteConversation: jest.Mock };
    conversationFullMessageCache: { forget: jest.Mock };
  };
  state.conversations = conversations;
  state.agentServiceRegistry = { get: () => adapter };
  state.storage = { deleteConversation: jest.fn().mockResolvedValue(undefined) };
  state.conversationFullMessageCache = { forget: jest.fn() };
  const tabManager = new TabManager('New chat', { getMaxTabs: () => 8 });
  const tabs = conversations.map((conversation) => tabManager.createTab(conversation)!);
  tabManager.switchToTab(tabs[0].id);
  const lifecycleHost = {
    getTabManager: () => tabManager, isTabForegroundBusy: jest.fn(() => false),
    getCurrentConversationId: () => 'A', createConversation: jest.fn(),
    deleteConversation: (id: string) => plugin.deleteConversation(id),
    forgetConversation: jest.fn((id: string) => plugin.forgetConversation(id)),
    clearTabMessagesPanes: jest.fn(), resetTabManager: jest.fn(), removeTabMessagesPane: jest.fn(), showNotice: jest.fn(),
  };
  const port = { activateTab: jest.fn(), createConversationInNewTab: jest.fn() };
  const lifecycle = new ConversationTabLifecycleRecoveryCoordinator(lifecycleHost, port);
  const host: ConversationHistoryActionsHost = {
    getConversations: () => conversations, getCurrentConversation: () => conversations.find((item) => item.id === 'A') ?? null,
    isActiveTabStreaming: () => false, loadConversation: jest.fn(), getConversationById: async (id) => conversations.find((item) => item.id === id) ?? null,
    cancelConversationTitleGeneration: jest.fn(), updateConversationTitle: jest.fn(),
    deleteConversationsAndCleanupTabs: (ids) => lifecycle.deleteConversationsAndRecover(ids),
    deleteAllConversationsAndReset: (ids) => lifecycle.deleteAllConversationsAndReset(ids),
    forgetConversationsAndCleanupTabs: (ids) => lifecycle.forgetConversationsAndRecover(ids), showNotice: jest.fn(),
  };
  const history = new ConversationHistoryActionsCoordinator(host);
  const anchor = document.createElement('button'); document.body.appendChild(anchor);
  const show = () => history.show({ currentTarget: anchor, target: anchor } as unknown as MouseEvent);
  const forget = () => (document.body.querySelector('[data-codex-forget-local]') as HTMLButtonElement).click();
  return { plugin, state, client, request, adapterState, conversations, tabManager, tabs, lifecycle, lifecycleHost, port, host, history, show, forget };
}

function persistedFixture() {
  const f = fixture();
  const disk = new Map<string, string>();
  for (const conversation of f.conversations) {
    disk.set(`.opencodian/sessions/${conversation.id}.json`, JSON.stringify(conversation));
    disk.set(`.opencodian/session-metas/${conversation.id}.json`, JSON.stringify({ data: conversation }));
  }
  const storageAdapter = {
    basePath: 'C:/fixture/vault',
    exists: jest.fn(async (path: string) => disk.has(path)),
    read: jest.fn(async (path: string) => {
      if (!disk.has(path)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      return disk.get(path)!;
    }),
    remove: jest.fn(async (path: string) => {
      if (!disk.delete(path)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
    }),
  };
  const storage = new StorageService({ app: { vault: { adapter: storageAdapter } } } as never);
  (f.plugin as unknown as { storage: StorageService }).storage = storage;
  return { ...f, disk, storage, storageAdapter };
}

beforeEach(() => {
  setLocale('en');
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1; });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); document.body.innerHTML = ''; setLocale('en'); });

describe.each(['en', 'zh'] as const)('Codex local forget through history/dialog/lifecycle/plugin (%s)', (locale) => {
  beforeEach(() => { setLocale(locale); });
  it('requires explicit local confirmation and removes only the current local conversation', async () => {
    jest.useFakeTimers();
    const f = fixture(); f.show();
    const action = document.body.querySelector('[data-codex-forget-local]') as HTMLButtonElement;
    expect(action.textContent).toBe(t('chat.history.forgetLocal'));
    expect(action.title).toBe(t('chat.forgetLocalConfirm.emphasis'));
    f.forget();
    expect(document.body.querySelector('.opencodian-delete-confirm-title')?.textContent).toBe(t('chat.forgetLocalConfirm.title'));
    expect(document.body.querySelector('.opencodian-delete-confirm-warning')?.textContent).toBe(t('chat.forgetLocalConfirm.warning'));
    expect(document.body.querySelector('.opencodian-delete-confirm-desc')?.textContent).toBe(t('chat.forgetLocalConfirm.description', { count: 1 }));
    expect(document.body.querySelector('.opencodian-delete-confirm-emphasis')?.textContent).toBe(t('chat.forgetLocalConfirm.emphasis'));
    const confirm = document.body.querySelector('.opencodian-delete-confirm-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent).toBe(t('chat.forgetLocalConfirm.confirm', { seconds: 3 }));
    expect(f.state.storage.deleteConversation).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1100);
    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent).toBe(t('chat.forgetLocalConfirm.confirm', { seconds: 2 }));
    jest.advanceTimersByTime(2000);
    expect(confirm.textContent).toBe(t('chat.forgetLocalConfirm.confirmText'));
    confirm.click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    jest.useRealTimers(); await flushUI();
    expect(f.conversations.map((item) => item.id)).toEqual(['B', 'C']);
    expect(f.state.storage.deleteConversation.mock.calls).toEqual([['A', { verifyAbsent: true }]]);
    expect(f.state.conversationFullMessageCache.forget.mock.calls).toEqual([['A']]);
    expect(f.adapterState.threadAlias.has('native-A')).toBe(false);
    expect(f.tabManager.getAllTabs().map((tab) => tab.id)).toEqual([f.tabs[1].id, f.tabs[2].id]);
    expect(f.lifecycleHost.removeTabMessagesPane.mock.calls).toEqual([[f.tabs[0].id]]);
    expect(f.host.showNotice).toHaveBeenCalledWith(t('chat.forgetLocalConfirm.success'));
    expect(f.request).not.toHaveBeenCalled();
    f.history.destroy();
  });

  it('cancels explicit forgetting without touching native or local history', async () => {
    const f = fixture(); f.show(); f.forget();
    (document.body.querySelector('.opencodian-delete-confirm-cancel') as HTMLButtonElement).click();
    await flushUI();
    expect(f.conversations).toHaveLength(3);
    expect(f.lifecycleHost.forgetConversation).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled(); f.history.destroy();
  });

  it('batch UI retains failed items/tabs/cache, cleans successes, and retries only the retained selection', async () => {
    jest.spyOn(ConversationHistoryDialogService.prototype, 'showForgetLocalConfirmDialog').mockResolvedValue(true);
    const f = fixture();
    f.state.storage.deleteConversation.mockImplementation(async (id) => { if (id === 'B') throw new Error('local storage failure'); });
    f.show();
    document.body.querySelectorAll<HTMLInputElement>('.opencodian-history-item-checkbox input').forEach((checkbox, index) => {
      if (index < 2) { checkbox.checked = true; checkbox.dispatchEvent(new Event('change')); }
    });
    f.forget(); await flushUI();
    expect(f.conversations.map((item) => item.id)).toEqual(['B', 'C']);
    expect(f.state.conversationFullMessageCache.forget.mock.calls).toEqual([['A']]);
    expect(f.tabManager.getAllTabs().map((tab) => tab.id)).toEqual([f.tabs[1].id, f.tabs[2].id]);
    expect(f.host.showNotice).toHaveBeenCalledWith('local storage failure');
    expect(f.adapterState.threadAlias.get('native-B')).toBe('local-B');
    expect(f.adapterState.sessionEffectiveSettings.has('local-B')).toBe(true);
    f.state.storage.deleteConversation.mockResolvedValue(undefined);
    f.show();
    const checkbox = document.body.querySelector<HTMLInputElement>('.opencodian-history-item-checkbox input')!;
    checkbox.checked = true; checkbox.dispatchEvent(new Event('change'));
    f.forget(); await flushUI();
    expect(f.conversations.map((item) => item.id)).toEqual(['C']);
    expect(f.state.storage.deleteConversation.mock.calls).toEqual([
      ['A', { verifyAbsent: true }], ['B', { verifyAbsent: true }], ['B', { verifyAbsent: true }],
    ]);
    expect(f.request).not.toHaveBeenCalled(); f.history.destroy();
  });

  it('pending UI disables repeat clicks and preserves local tabs/cache until commit', async () => {
    jest.spyOn(ConversationHistoryDialogService.prototype, 'showForgetLocalConfirmDialog').mockResolvedValue(true);
    const f = fixture(), pending = gate();
    f.state.storage.deleteConversation.mockReturnValue(pending.promise);
    f.show(); f.forget(); await flushUI(); f.show();
    const button = document.body.querySelector('[data-codex-forget-local]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe(t('chat.history.forgetLocalPending'));
    expect(button.getAttribute('aria-busy')).toBe('true'); button.click();
    expect(f.state.storage.deleteConversation).toHaveBeenCalledTimes(1);
    expect(f.conversations).toHaveLength(3);
    expect(f.tabManager.getTabCount()).toBe(3);
    expect(f.adapterState.threadAlias.get('native-A')).toBe('local-A');
    expect(f.adapterState.sessionEffectiveSettings.has('local-A')).toBe(true);
    expect(f.state.conversationFullMessageCache.forget).not.toHaveBeenCalled();
    pending.resolve(); await flushUI();
    expect(f.conversations).toHaveLength(2);
    expect(f.request).not.toHaveBeenCalled(); f.history.destroy();
  });

  it('localizes the non-Error failure fallback and leaves retained history available for retry', async () => {
    jest.spyOn(ConversationHistoryDialogService.prototype, 'showForgetLocalConfirmDialog').mockResolvedValue(true);
    const f = fixture();
    f.host.forgetConversationsAndCleanupTabs = jest.fn().mockRejectedValue('local storage failure');
    f.show(); f.forget(); await flushUI();
    expect(f.host.showNotice).toHaveBeenCalledWith(t('chat.forgetLocalConfirm.failed'));
    expect(f.conversations).toHaveLength(3);
    expect(f.tabManager.getTabCount()).toBe(3);
    expect(f.state.conversationFullMessageCache.forget).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
    f.show();
    const button = document.body.querySelector('[data-codex-forget-local]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe(t('chat.history.forgetLocal'));
    f.history.destroy();
  });

  it('deduplicates simultaneous batch requests and performs fallback recovery once', async () => {
    const f = fixture(), pending = gate();
    f.state.storage.deleteConversation.mockReturnValue(pending.promise);
    const first = f.lifecycle.forgetConversationsAndRecover(['A', 'A', 'B', 'C']);
    const second = f.lifecycle.forgetConversationsAndRecover(['A']);
    expect(f.lifecycleHost.forgetConversation).toHaveBeenCalledTimes(1);
    pending.resolve(); await Promise.all([first, second]);
    expect(f.lifecycleHost.forgetConversation.mock.calls).toEqual([['A'], ['B'], ['C']]);
    expect(f.lifecycleHost.removeTabMessagesPane).toHaveBeenCalledTimes(3);
    expect(f.port.createConversationInNewTab).toHaveBeenCalledTimes(1);
    expect(f.request).not.toHaveBeenCalled();
  });

  it('blocks a background busy tab while other batch items can complete', async () => {
    const f = fixture(); f.lifecycleHost.isTabForegroundBusy.mockImplementation((id) => id === f.tabs[1].id);
    await expect(f.lifecycle.forgetConversationsAndRecover(['B', 'A'])).rejects.toThrow();
    expect(f.conversations.map((item) => item.id)).toEqual(['B', 'C']);
    expect(f.lifecycleHost.forgetConversation.mock.calls).toEqual([['A']]);
    expect(f.request).not.toHaveBeenCalled();
  });

  it('default native delete retains admitted/failed state for retry and never invokes forget', async () => {
    const f = fixture();
    jest.spyOn(ConversationHistoryDialogService.prototype, 'showDeleteCurrentConfirmDialog').mockResolvedValue(true);
    f.request.mockImplementation(async (method) => { if (method === 'thread/read') throw new Error('readback offline'); return {}; });
    f.show();
    const deletion = Array.from(document.body.querySelectorAll<HTMLElement>('.opencodian-history-action'))
      .find((el) => el.textContent === t('chat.history.deleteCurrent'));
    expect(deletion).toBeDefined(); deletion!.click(); await flushUI();
    expect(f.conversations).toHaveLength(3);
    expect(f.lifecycleHost.forgetConversation).not.toHaveBeenCalled();
    expect(f.state.storage.deleteConversation).not.toHaveBeenCalled();
    expect(f.state.conversationFullMessageCache.forget).not.toHaveBeenCalled();
    expect(f.adapterState.threadAlias.get('native-A')).toBe('local-A');
    expect(f.tabManager.getTabCount()).toBe(3);
    expect(f.host.showNotice).toHaveBeenCalledWith(expect.stringContaining('pending'));
    f.request.mockImplementation(async () => { throw new Error('thread not found: native-A'); });
    f.show();
    Array.from(document.body.querySelectorAll<HTMLElement>('.opencodian-history-action'))
      .find((el) => el.textContent === t('chat.history.deleteCurrent'))!.click(); await flushUI();
    expect(f.conversations.map((item) => item.id)).toEqual(['B', 'C']);
    expect(f.lifecycleHost.forgetConversation).not.toHaveBeenCalled(); f.history.destroy();
  });

  it('non-Codex history has no forget action and the plugin rejects a foreign backend', async () => {
    const f = fixture(); f.conversations.forEach((item) => { item.backend = 'claude-code'; });
    f.show(); expect(document.body.querySelector('[data-codex-forget-local]')).toBeNull();
    await expect(f.plugin.forgetConversation('A')).rejects.toThrow('only for Codex');
    expect(f.state.storage.deleteConversation).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled(); f.history.destroy();
  });

});

describe.each(['en', 'zh'] as const)('Codex reviewed local forget storage/target integration (%s)', (locale) => {
  beforeEach(() => { setLocale(locale); });

  it('real StorageService preserves EACCES conversation/cache/tab/identity and commits only after retry confirms absence', async () => {
    jest.spyOn(ConversationHistoryDialogService.prototype, 'showForgetLocalConfirmDialog').mockResolvedValue(true);
    const f = persistedFixture();
    const path = '.opencodian/sessions/A.json';
    const metaPath = '.opencodian/session-metas/A.json';
    const denied = Object.assign(new Error('EACCES: local conversation retained'), { code: 'EACCES' });
    f.storageAdapter.remove.mockRejectedValueOnce(denied);
    f.show(); f.forget(); await flushUI();
    expect(f.host.showNotice).toHaveBeenCalledWith(denied.message);
    expect(f.host.showNotice).not.toHaveBeenCalledWith(t('chat.forgetLocalConfirm.success'));
    expect(f.conversations.map((item) => item.id)).toEqual(['A', 'B', 'C']);
    expect(f.disk.has(path)).toBe(true);
    expect(f.disk.has(metaPath)).toBe(true);
    expect(await f.storage.loadFullConversation('A')).toMatchObject({ id: 'A', backendSessionId: 'native-A' });
    expect(f.state.conversationFullMessageCache.forget).not.toHaveBeenCalled();
    expect(f.tabManager.getTabCount()).toBe(3);
    expect(f.lifecycleHost.removeTabMessagesPane).not.toHaveBeenCalled();
    expect(f.adapterState.threadAlias.get('native-A')).toBe('local-A');
    expect(f.adapterState.sessionEffectiveSettings.has('local-A')).toBe(true);
    expect(f.storageAdapter.remove.mock.calls).toEqual([[path]]);
    expect(f.storageAdapter.exists).toHaveBeenCalledWith(path);
    f.show(); f.forget(); await flushUI();
    expect(f.disk.has(path)).toBe(false);
    expect(f.disk.has(metaPath)).toBe(false);
    expect(f.conversations.map((item) => item.id)).toEqual(['B', 'C']);
    expect(f.state.conversationFullMessageCache.forget.mock.calls).toEqual([['A']]);
    expect(f.tabManager.getTabCount()).toBe(2);
    expect(f.adapterState.threadAlias.has('native-A')).toBe(false);
    expect(f.host.showNotice).toHaveBeenCalledWith(t('chat.forgetLocalConfirm.success'));
    expect(f.request).not.toHaveBeenCalled(); f.history.destroy();
  });

  it('real StorageService accepts ENOENT only after readback confirms the session is absent', async () => {
    const f = persistedFixture();
    const path = '.opencodian/sessions/A.json';
    f.disk.delete(path);
    await f.lifecycle.forgetConversationsAndRecover(['A']);
    expect(f.storageAdapter.exists).toHaveBeenCalledWith(path);
    expect(f.conversations.map((item) => item.id)).toEqual(['B', 'C']);
    expect(f.state.conversationFullMessageCache.forget.mock.calls).toEqual([['A']]);
    expect(f.tabManager.getTabCount()).toBe(2);
    expect(f.adapterState.threadAlias.has('native-A')).toBe(false);
    expect(f.request).not.toHaveBeenCalled();
  });

  it.each(['still-present', 'readback-denied'])('real StorageService retains local state when resolved removal is %s', async (failure) => {
    const f = persistedFixture();
    const path = '.opencodian/sessions/A.json';
    f.storageAdapter.remove.mockResolvedValueOnce(undefined);
    if (failure === 'readback-denied') f.storageAdapter.exists.mockRejectedValueOnce(new Error('EACCES: absence readback denied'));
    await expect(f.lifecycle.forgetConversationsAndRecover(['A'])).rejects.toThrow();
    expect(f.disk.has(path)).toBe(true);
    expect(f.disk.has('.opencodian/session-metas/A.json')).toBe(true);
    expect(f.conversations).toHaveLength(3);
    expect(f.state.conversationFullMessageCache.forget).not.toHaveBeenCalled();
    expect(f.tabManager.getTabCount()).toBe(3);
    expect(f.adapterState.threadAlias.get('native-A')).toBe('local-A');
    expect(f.storageAdapter.remove.mock.calls).toEqual([[path]]);
    expect(f.request).not.toHaveBeenCalled();
  });

  it('legacy StorageService consumers retain default best-effort deletion compatibility', async () => {
    const f = persistedFixture();
    f.storageAdapter.remove.mockRejectedValue(new Error('EACCES'));
    await expect(f.storage.deleteConversation('A')).resolves.toBeUndefined();
    expect(f.storageAdapter.exists).not.toHaveBeenCalled();
    expect(f.disk.has('.opencodian/sessions/A.json')).toBe(true);
    expect(f.disk.has('.opencodian/session-metas/A.json')).toBe(true);
  });

  it('mixed history disables foreign/mixed targets and enables only a Codex selection', () => {
    const confirm = jest.spyOn(ConversationHistoryDialogService.prototype, 'showForgetLocalConfirmDialog').mockResolvedValue(false);
    const f = fixture();
    f.conversations[0].backend = 'claude-code';
    f.show();
    const button = document.body.querySelector('[data-codex-forget-local]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click(); expect(confirm).not.toHaveBeenCalled();
    const checkboxes = document.body.querySelectorAll<HTMLInputElement>('.opencodian-history-item-checkbox input');
    const select = (index: number, checked: boolean) => {
      checkboxes[index].checked = checked; checkboxes[index].dispatchEvent(new Event('change'));
    };
    select(1, true);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('false');
    select(0, true);
    expect(button.disabled).toBe(true);
    button.click(); expect(confirm).not.toHaveBeenCalled();
    select(1, false);
    expect(button.disabled).toBe(true);
    select(0, false);
    expect(button.disabled).toBe(true);
    select(2, true);
    expect(button.disabled).toBe(false);
    button.click(); expect(confirm).toHaveBeenCalledWith(1);
    expect(f.lifecycleHost.forgetConversation).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled(); f.history.destroy();
  });

  it('missing current target is disabled until a Codex checkbox supplies a target', () => {
    const f = fixture();
    f.host.getCurrentConversation = () => null;
    f.show();
    const button = document.body.querySelector('[data-codex-forget-local]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const checkbox = document.body.querySelector<HTMLInputElement>('.opencodian-history-item-checkbox input')!;
    checkbox.checked = true; checkbox.dispatchEvent(new Event('change'));
    expect(button.disabled).toBe(false);
    checkbox.checked = false; checkbox.dispatchEvent(new Event('change'));
    expect(button.disabled).toBe(true);
    f.history.destroy();
  });

  it('View forwarding routes local forget through the existing recovery owner and refreshes the rail', async () => {
    const f = fixture();
    const loadRecovery = new ConversationLoadRecoveryCoordinator({} as never, {
      forgetConversationsAndRecover: (ids) => f.lifecycle.forgetConversationsAndRecover(ids),
    } as never);
    const view = Object.create(OpenCodianView.prototype) as unknown as {
      plugin: OpenCodianPlugin;
      conversationLoadRecoveryCoordinator: ConversationLoadRecoveryCoordinator;
      conversationSessionRailCoordinator: { refresh: jest.Mock };
      createConversationHistoryActionsHost(service: unknown): ConversationHistoryActionsHost;
      createConversationTabLifecycleRecoveryHost(): { forgetConversation(id: string): Promise<void> };
    };
    view.plugin = f.plugin; view.conversationLoadRecoveryCoordinator = loadRecovery;
    view.conversationSessionRailCoordinator = { refresh: jest.fn() };
    await view.createConversationHistoryActionsHost({}).forgetConversationsAndCleanupTabs!(['A']);
    expect(view.conversationSessionRailCoordinator.refresh).toHaveBeenCalledTimes(1);
    await view.createConversationTabLifecycleRecoveryHost().forgetConversation('B');
    expect(f.conversations.map((item) => item.id)).toEqual(['C']);
    expect(f.request).not.toHaveBeenCalled();
    expect(f.adapterState.threadAlias.has('native-C')).toBe(true);
    expect(f.adapterState.sessionEffectiveSettings.has('local-C')).toBe(true);
    expect(f.plugin.agentServiceRegistry?.get('codex')?.hasCapability(AgentCapability.Sessions)).toBe(true);
  });
});
