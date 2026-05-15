import type { TabContextState } from '../../../core/types';
import { Tab } from './Tab';
import type {
  CloseTabResult,
  CloseTabsResult,
  RestoredTabState,
  TabBarItem,
  TabConversationLike,
  TabCreateOptions,
  TabData,
  TabId,
  TabManagerOptions,
  TabModelOverride,
} from './types';

export class TabManager {
  private readonly tabs: Tab[] = [];
  private activeTabId: TabId | null = null;

  constructor(
    private readonly defaultTitle: string,
    private readonly options: TabManagerOptions,
  ) {}

  canCreateTab(): boolean {
    return this.tabs.length < this.options.getMaxTabs();
  }

  areTabsEnabled(): boolean {
    return this.options.areTabsEnabled?.() ?? true;
  }

  createTab(conversation?: TabConversationLike | null, options?: TabCreateOptions): TabData | null {
    if (!options?.ignoreMaxTabs && !this.canCreateTab()) {
      return null;
    }

    const tab = new Tab(this.defaultTitle, conversation, options);
    this.tabs.push(tab);
    this.switchToTab(tab.getId());
    this.notifyChanged();
    return tab.getData();
  }

  switchToTab(tabId: TabId): TabData | null {
    const target = this.tabs.find((tab) => tab.getId() === tabId);
    if (!target) {
      return null;
    }

    for (const tab of this.tabs) {
      tab.setActive(tab.getId() === tabId);
    }

    this.activeTabId = tabId;
    this.notifyChanged();
    return target.getData();
  }

  closeTab(tabId: TabId): CloseTabResult {
    const index = this.tabs.findIndex((tab) => tab.getId() === tabId);
    if (index === -1) {
      return { closed: false, nextActiveTabId: this.activeTabId };
    }

    this.tabs.splice(index, 1);

    if (this.activeTabId !== tabId) {
      this.notifyChanged();
      return { closed: true, nextActiveTabId: this.activeTabId };
    }

    if (this.tabs.length === 0) {
      this.activeTabId = null;
      this.notifyChanged();
      return { closed: true, nextActiveTabId: null };
    }

    const nextIndex = Math.max(0, index - 1);
    const nextTab = this.tabs[nextIndex];
    for (const tab of this.tabs) {
      tab.setActive(tab.getId() === nextTab.getId());
    }
    this.activeTabId = nextTab.getId();
    this.notifyChanged();
    return { closed: true, nextActiveTabId: this.activeTabId };
  }

  closeTabs(tabIds: readonly TabId[]): CloseTabsResult {
    const requestedIds = new Set(tabIds);
    const orderedTabIds = this.tabs
      .map((tab) => tab.getId())
      .filter((tabId) => requestedIds.has(tabId));

    const closedTabIds: TabId[] = [];
    let nextActiveTabId = this.activeTabId;

    for (const tabId of orderedTabIds) {
      const result = this.closeTab(tabId);
      if (!result.closed) {
        continue;
      }

      closedTabIds.push(tabId);
      nextActiveTabId = result.nextActiveTabId;
    }

    return {
      closedTabIds,
      nextActiveTabId,
    };
  }

  getActiveTab(): TabData | null {
    return this.tabs.find((tab) => tab.getId() === this.activeTabId)?.getData() ?? null;
  }

  getTab(tabId: TabId): TabData | null {
    return this.tabs.find((tab) => tab.getId() === tabId)?.getData() ?? null;
  }

  getTabCount(): number {
    return this.tabs.length;
  }

  getAllTabs(): TabData[] {
    return this.tabs.map((tab) => tab.getData());
  }

  restoreTabs(
    items: RestoredTabState[],
    activeTabIndex: number,
    conversations: ReadonlyMap<string, TabConversationLike>,
  ): TabData | null {
    this.tabs.length = 0;
    this.activeTabId = null;

    const maxTabs = this.areTabsEnabled() ? this.options.getMaxTabs() : items.length;
    const limitedItems = items.slice(0, Math.max(1, maxTabs));
    let restoredActiveIndex: number | null = null;
    const restoredIdMap = new Map<TabId, TabId>();
    const pendingParentLinks: Array<{ tab: Tab; parentTabId: TabId }> = [];

    for (const [index, item] of limitedItems.entries()) {
      if (item.conversationId && !conversations.has(item.conversationId)) {
        continue;
      }

      const conversation = item.conversationId
        ? (conversations.get(item.conversationId) ?? null)
        : null;
      const tab = new Tab(item.title || this.defaultTitle, conversation);

      tab.setTitle(conversation?.title || item.title || this.defaultTitle);
      tab.setModelOverride(item.modelOverride ?? null);
      this.tabs.push(tab);
      if (item.id) {
        restoredIdMap.set(item.id, tab.getId());
      }
      if (item.parentTabId) {
        pendingParentLinks.push({ tab, parentTabId: item.parentTabId });
      }

      if (index === activeTabIndex) {
        restoredActiveIndex = this.tabs.length - 1;
      }
    }

    for (const link of pendingParentLinks) {
      link.tab.setParentTabId(restoredIdMap.get(link.parentTabId) ?? null);
    }

    if (this.tabs.length === 0) {
      this.notifyChanged();
      return null;
    }

    const nextActiveIndex = restoredActiveIndex ?? Math.min(activeTabIndex, this.tabs.length - 1);
    const nextActiveTab = this.tabs[Math.max(0, nextActiveIndex)];
    for (const tab of this.tabs) {
      tab.setActive(tab.getId() === nextActiveTab.getId());
    }

    this.activeTabId = nextActiveTab.getId();
    this.notifyChanged();
    return nextActiveTab.getData();
  }

  getTabBarItems(): TabBarItem[] {
    return this.tabs.map((tab, index) => {
      const data = tab.getData();
      const hasParentLink = Boolean(data.parentTabId);
      return {
        id: data.id,
        parentTabId: data.parentTabId,
        index: index + 1,
        title: data.title,
        isActive: data.isActive,
        isStreaming: data.isStreaming,
        hasBackgroundTask: data.hasBackgroundTask,
        needsAttention: data.needsAttention,
        canClose: this.tabs.length > 1 || hasParentLink,
      };
    });
  }

  setActiveTabConversation(conversation: TabConversationLike | null): void {
    const activeTab = this.tabs.find((tab) => tab.getId() === this.activeTabId);
    if (!activeTab) {
      return;
    }

    activeTab.setConversation(conversation, this.defaultTitle);
    this.notifyChanged();
  }

  setActiveTabTitle(title: string): void {
    const activeTab = this.tabs.find((tab) => tab.getId() === this.activeTabId);
    if (!activeTab) {
      return;
    }

    activeTab.setTitle(title || this.defaultTitle);
    this.notifyChanged();
  }

  syncConversationTitle(conversationId: string, title: string): void {
    let changed = false;

    for (const tab of this.tabs) {
      if (tab.getData().conversationId !== conversationId) {
        continue;
      }

      tab.setTitle(title || this.defaultTitle);
      changed = true;
    }

    if (changed) {
      this.notifyChanged();
    }
  }

  setActiveTabStreaming(isStreaming: boolean): void {
    this.setTabStreaming(this.activeTabId, isStreaming);
  }

  setActiveTabBackgroundTaskRunning(hasBackgroundTask: boolean): void {
    this.setTabBackgroundTaskRunning(this.activeTabId, hasBackgroundTask);
  }

  setTabNeedsAttention(tabId: TabId, needsAttention: boolean): void {
    const tab = this.tabs.find((item) => item.getId() === tabId);
    if (!tab) {
      return;
    }

    tab.setNeedsAttention(needsAttention);
    this.notifyChanged();
  }

  setTabStreaming(tabId: TabId | null, isStreaming: boolean): void {
    if (!tabId) {
      return;
    }

    const tab = this.tabs.find((item) => item.getId() === tabId);
    if (!tab) {
      return;
    }

    tab.setStreaming(isStreaming);
    if (!isStreaming) {
      tab.setNeedsAttention(false);
    }
    this.notifyChanged();
  }

  setTabBackgroundTaskRunning(tabId: TabId | null, hasBackgroundTask: boolean): void {
    if (!tabId) {
      return;
    }

    const tab = this.tabs.find((item) => item.getId() === tabId);
    if (!tab) {
      return;
    }

    tab.setBackgroundTaskRunning(hasBackgroundTask);
    if (hasBackgroundTask) {
      tab.setNeedsAttention(false);
    }
    this.notifyChanged();
  }

  getActiveTabModelOverride(): TabModelOverride | null {
    return this.tabs.find((tab) => tab.getId() === this.activeTabId)?.getData().modelOverride ?? null;
  }

  setActiveTabModelOverride(modelOverride: TabModelOverride | null): void {
    const activeTab = this.tabs.find((tab) => tab.getId() === this.activeTabId);
    if (!activeTab) {
      return;
    }

    activeTab.setModelOverride(modelOverride);
    this.notifyChanged();
  }

  getActiveTabContextUsage(): TabContextState | null {
    return this.tabs.find((tab) => tab.getId() === this.activeTabId)?.getData().contextUsage ?? null;
  }

  getTabContextUsage(tabId: TabId | null): TabContextState | null {
    if (!tabId) {
      return null;
    }

    return this.tabs.find((tab) => tab.getId() === tabId)?.getData().contextUsage ?? null;
  }

  setActiveTabContextUsage(contextUsage: TabContextState): void {
    this.setTabContextUsage(this.activeTabId, contextUsage);
  }

  setTabContextUsage(tabId: TabId | null, contextUsage: TabContextState): void {
    if (!tabId) {
      return;
    }

    const tab = this.tabs.find((item) => item.getId() === tabId);
    if (!tab) {
      return;
    }

    tab.setContextUsage(contextUsage);
  }

  private notifyChanged(): void {
    this.options.onChanged?.();
  }
}
