import { Tab } from './Tab';
import type {
  CloseTabResult,
  TabBarItem,
  TabConversationLike,
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

  createTab(conversation?: TabConversationLike | null): TabData | null {
    if (!this.canCreateTab()) {
      return null;
    }

    const tab = new Tab(this.defaultTitle, conversation);
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

  getTabBarItems(): TabBarItem[] {
    return this.tabs.map((tab, index) => {
      const data = tab.getData();
      return {
        id: data.id,
        index: index + 1,
        title: data.title,
        isActive: data.isActive,
        isStreaming: data.isStreaming,
        needsAttention: data.needsAttention,
        canClose: this.tabs.length > 1,
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

  setActiveTabStreaming(isStreaming: boolean): void {
    const activeTab = this.tabs.find((tab) => tab.getId() === this.activeTabId);
    if (!activeTab) {
      return;
    }

    activeTab.setStreaming(isStreaming);
    if (!isStreaming) {
      activeTab.setNeedsAttention(false);
    }
    this.notifyChanged();
  }

  setTabNeedsAttention(tabId: TabId, needsAttention: boolean): void {
    const tab = this.tabs.find((item) => item.getId() === tabId);
    if (!tab) {
      return;
    }

    tab.setNeedsAttention(needsAttention);
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

  private notifyChanged(): void {
    this.options.onChanged?.();
  }
}
