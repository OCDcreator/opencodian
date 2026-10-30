import { type Conversation, getConversationBackendSessionId } from '../../../../src/core/types';
import type { AgentBackendKind } from '../../../../src/core/types/chat';
import { TabConversationStateBridge } from '../../../../src/features/chat/runtime/activation/TabConversationStateBridge';
import { TabRuntimeStateBridge } from '../../../../src/features/chat/runtime/activation/TabRuntimeStateBridge';
import { ConversationLoadRecoveryCoordinator } from '../../../../src/features/chat/services/conversation/ConversationLoadRecoveryCoordinator';
import { ConversationTabLifecycleRecoveryCoordinator } from '../../../../src/features/chat/services/conversation/ConversationTabLifecycleRecoveryCoordinator';
import { ConversationTabOpenCoordinator } from '../../../../src/features/chat/services/conversation/ConversationTabOpenCoordinator';
import { TabBar, TabManager } from '../../../../src/features/chat/tabs';
import { TooltipLayerController } from '../../../../src/shared/TooltipLayerController';

const BACKENDS: AgentBackendKind[] = ['opencode2', 'claude-code', 'codex', 'pi', 'zcode', 'dsh'];

function createFixture(backend: AgentBackendKind) {
  const manager = new TabManager('New chat', { getMaxTabs: () => 12 });
  const conversations: Conversation[] = [];
  const runtime = new Map<string, { isStreaming: boolean }>();
  const sessions = new Map<string, string | null>();
  let current: Conversation | null = null;
  const createConversation = jest.fn(async () => {
    const id = `${backend}-${conversations.length + 1}`;
    const conversation: Conversation = {
      id, backend, title: `会话 ${id} · long title with emoji 🗂`, messages: [], createdAt: 1, updatedAt: 1,
      backendSessionId: `native-${id}`,
      ...(backend === 'opencode2' ? { openCodeSessionId: `native-${id}` } : {}),
    };
    conversations.push(conversation);
    return conversation;
  });
  const state = new TabConversationStateBridge({
    getTabManager: () => manager,
    getSessionIdForTab: (id) => sessions.get(id ?? '') ?? null,
    setCurrentConversation: (conversation) => { current = conversation; },
    resetTabSessionState: (id, session) => { sessions.set(id!, session); },
    setCurrentConversationRevertState: jest.fn(), setOpenCodeSessionId: jest.fn(),
    applyConversationSessionSettings: jest.fn(), clearPendingQuestionsForTab: jest.fn(),
    clearTabSessionState: jest.fn(), resetBackgroundTaskSuppressedFingerprint: jest.fn(),
    getConversationSyncFingerprint: () => 'fixture', setLastConversationSyncFingerprint: jest.fn(),
    startConversationSyncLoop: jest.fn(), stopConversationSyncLoop: jest.fn(),
  });
  const activateTab = jest.fn(async (id: string) => {
    manager.switchToTab(id);
    const conversation = conversations.find(c => c.id === manager.getTab(id)?.conversationId)!;
    state.applyActiveConversation(id, conversation, { resetSessionState: true });
  });
  const opener = new ConversationTabOpenCoordinator({
    getTabManager: () => manager, getMaxTabs: () => 12, isActiveTabStreaming: () => false,
    createConversation, createConversationFromSession: jest.fn(), deleteConversation: jest.fn(), showNotice: jest.fn(),
  }, { activateTab, openConversationInCurrentTab: jest.fn(), syncActiveTabConversation: jest.fn(), loadConversation: jest.fn() });
  const stream = new TabRuntimeStateBridge({
    getTabManager: () => manager, getActiveTabId: () => manager.getActiveTab()?.id ?? null,
    getTabRuntimeState: id => runtime.get(id ?? '') ?? null,
    getTabMessagesContainer: () => null, hasBackgroundTaskIndicator: () => false, updateSendButtonState: jest.fn(),
  });
  return { manager, conversations, runtime, sessions, opener, activateTab, stream, getCurrent: () => current };
}

describe.each(BACKENDS)('%s shared session tab integration', (backend) => {
  afterEach(() => { TooltipLayerController.ensureForDocument(document).destroy(); document.body.empty(); });

  it('creates and switches native session identities without leaking model or stream state', async () => {
    const f = createFixture(backend);
    await f.opener.createConversationInNewTab();
    const first = f.manager.getActiveTab()!;
    f.manager.setActiveTabModelOverride({ provider: 'first', model: 'model-a' });
    f.runtime.set(first.id, { isStreaming: true });
    f.stream.syncStreamLikeState(first.id);
    await f.opener.createConversationInNewTab();
    const second = f.manager.getActiveTab()!;
    expect(f.getCurrent()?.backend).toBe(backend);
    expect(f.sessions.get(second.id)).toBe(getConversationBackendSessionId(f.conversations[1]));
    expect(f.manager.getActiveTabModelOverride()).toBeNull();
    expect(f.manager.getTab(first.id)?.isStreaming).toBe(true);
    expect(second.isStreaming).toBe(false);
    await f.activateTab(first.id);
    expect(f.sessions.get(first.id)).toBe(getConversationBackendSessionId(f.conversations[0]));
    expect(f.manager.getActiveTabModelOverride()).toEqual({ provider: 'first', model: 'model-a' });
  });

  it('restores the original active conversation after filtering and retains tabs above a reduced limit', async () => {
    const f = createFixture(backend);
    for (let i = 0; i < 3; i++) await f.opener.createConversationInNewTab();
    const saved = [
      { conversationId: 'missing', title: 'Removed', modelOverride: null },
      ...f.manager.getAllTabs(),
      { conversationId: 'foreign', title: 'Other backend', modelOverride: null },
    ];
    const restored = new TabManager('New chat', { getMaxTabs: () => 1 });
    const recovery = new ConversationLoadRecoveryCoordinator({
      getTabManager: () => restored, getActiveBackend: () => backend,
      getPersistedTabState: () => ({ tabs: saved, activeTabIndex: 2 }),
      getConversations: () => [...f.conversations, { ...f.conversations[0], id: 'foreign', backend: backend === 'codex' ? 'pi' : 'codex' }],
    } as never, {} as never);
    recovery.restorePersistedTabs();
    expect(restored.getAllTabs().map(tab => tab.conversationId)).toEqual(f.conversations.map(c => c.id));
    expect(restored.getActiveTab()?.conversationId).toBe(f.conversations[1].id);
    expect(restored.canCreateTab()).toBe(false);
  });

  it.each(['header', 'input', 'below-header-grid', 'below-header-vertical'] as const)(
    'keeps switching and closing overflow tabs connected in %s', async (layout) => {
      const f = createFixture(backend);
      for (let i = 0; i < 9; i++) await f.opener.createConversationInNewTab();
      const first = f.manager.getAllTabs()[0];
      const lifecycle = new ConversationTabLifecycleRecoveryCoordinator({
        getTabManager: () => f.manager, isTabForegroundBusy: () => false,
        removeTabMessagesPane: jest.fn(), showNotice: jest.fn(),
      } as never, { activateTab: f.activateTab, createConversationInNewTab: () => f.opener.createConversationInNewTab() });
      const mount = document.body.createDiv();
      const bar = new TabBar(mount, {
        onTabClick: id => { void f.activateTab(id); },
        onTabClose: id => { void lifecycle.closeTabAndRecover(id); },
        onNewTab: () => f.opener.createConversationInNewTab(),
      });
      try {
        bar.render(f.manager.getTabBarItems(), layout);
        expect(mount.querySelector('.is-active')?.getAttribute('data-tab-id')).toBe(f.manager.getActiveTab()?.id);
        mount.querySelector<HTMLButtonElement>('.opencodian-tab-bar-item')!.click();
        expect(f.manager.getActiveTab()?.id).toBe(first.id);
        bar.render(f.manager.getTabBarItems(), layout);
        mount.querySelector<HTMLButtonElement>('.opencodian-tab-bar-overflow')!.click();
        const menuItems = document.querySelectorAll<HTMLButtonElement>('.opencodian-tab-overflow-menu-item');
        const target = menuItems[menuItems.length - 1].dataset.tabId!;
        menuItems[menuItems.length - 1].click();
        expect(f.manager.getActiveTab()?.id).toBe(target);
        await lifecycle.closeTabAndRecover(target);
        bar.render(f.manager.getTabBarItems(), layout);
        expect(f.manager.getTabCount()).toBe(8);
        expect(f.manager.getTab(target)).toBeNull();
        expect(mount.querySelector('.is-active')).not.toBeNull();
        expect(mount.querySelector('.opencodian-tab-bar-new')).not.toBeNull();
      } finally { bar.destroy(); }
    },
  );
});
