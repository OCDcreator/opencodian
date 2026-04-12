import type { Conversation } from '../../../core/types';
import type { TabData, TabId } from '../tabs';
import type { ConversationSyncRuntime, TabConversationSyncContext } from './ConversationSyncRuntimeCoordinator';

export interface ConversationSyncOrchestrationHost {
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  getAllTabs(): readonly TabData[];
  getTab(tabId: TabId): TabData | null;
  getTabRuntimeState(tabId: TabId | null): ConversationSyncRuntime | null;
  getConversationById(id: string): Promise<Conversation | null>;
}

export interface ConversationSyncOrchestrationRuntime {
  runTabConversationSync(
    options: {
      tabId: TabId | null;
      conversation: Conversation | null;
    },
    callback: (context: TabConversationSyncContext) => Promise<void>,
  ): Promise<boolean>;
}

export interface SignalConversationSyncContext extends TabConversationSyncContext {
  reason: string;
  activeTabId: TabId | null;
  tabHasBackgroundTask: boolean;
}

export class ConversationSyncOrchestrationService {
  constructor(
    private readonly host: ConversationSyncOrchestrationHost,
    private readonly runtime: ConversationSyncOrchestrationRuntime,
  ) {}

  async syncConversationFromSignal(
    tabId: TabId | null,
    reason: string,
    callbacks: {
      syncVisibleConversation: () => Promise<void>;
      syncTabConversation: (context: SignalConversationSyncContext) => Promise<void>;
    },
  ): Promise<void> {
    if (!tabId) {
      return;
    }

    const activeTabId = this.host.getActiveTabId();
    const currentConversation = this.host.getCurrentConversation();
    if (tabId === activeTabId && currentConversation?.openCodeSessionId) {
      await callbacks.syncVisibleConversation();
      return;
    }

    const tab = this.host.getTab(tabId);
    if (!tab?.conversationId) {
      return;
    }

    const conversation = await this.host.getConversationById(tab.conversationId);
    await this.runtime.runTabConversationSync(
      {
        tabId,
        conversation,
      },
      async ({ tabId: syncedTabId, conversation: syncedConversation, previousFingerprint }) => {
        await callbacks.syncTabConversation({
          tabId: syncedTabId,
          conversation: syncedConversation,
          previousFingerprint,
          reason,
          activeTabId,
          tabHasBackgroundTask: tab.hasBackgroundTask,
        });
      },
    );
  }

  async syncBackgroundTaskTabs(
    callback: (context: TabConversationSyncContext) => Promise<void>,
  ): Promise<void> {
    const activeConversationId = this.host.getCurrentConversation()?.id ?? null;
    for (const tab of this.host.getAllTabs()) {
      const conversationId = this.getBackgroundTaskConversationId(tab, activeConversationId);
      if (!conversationId) {
        continue;
      }

      const conversation = await this.host.getConversationById(conversationId);
      await this.runtime.runTabConversationSync(
        {
          tabId: tab.id,
          conversation,
        },
        callback,
      );
    }
  }

  private shouldSkipBackgroundTaskTab(
    tab: TabData,
    activeConversationId: string | null,
  ): boolean {
    if (!tab.conversationId || tab.conversationId === activeConversationId || !tab.hasBackgroundTask) {
      return true;
    }

    const runtime = this.host.getTabRuntimeState(tab.id);
    return !runtime || runtime.isStreaming || runtime.isConversationSyncInFlight;
  }

  private getBackgroundTaskConversationId(
    tab: TabData,
    activeConversationId: string | null,
  ): string | null {
    return this.shouldSkipBackgroundTaskTab(tab, activeConversationId)
      ? null
      : tab.conversationId;
  }
}
