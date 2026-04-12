import type { Conversation } from '../../../core/types';
import type { TabData, TabId } from '../tabs';
import type { ConversationSyncRuntime, TabConversationSyncContext } from './ConversationSyncRuntimeCoordinator';

const CONVERSATION_SYNC_LOOP_INTERVAL_MS = 2000;
const SIGNAL_CONVERSATION_SYNC_DEBOUNCE_MS = 120;

export interface ConversationSyncSignalRuntime extends ConversationSyncRuntime {
  pendingSignalConversationSyncReasons: Set<string>;
  signalConversationSyncTimerId: number | null;
}

export interface ConversationSyncScheduler {
  setInterval(callback: () => void, delayMs: number): number;
  clearInterval(timerId: number): void;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timerId: number): void;
}

const DEFAULT_SCHEDULER: ConversationSyncScheduler = {
  setInterval: (callback, delayMs) => window.setInterval(callback, delayMs),
  clearInterval: (timerId) => window.clearInterval(timerId),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (timerId) => window.clearTimeout(timerId),
};

export interface ConversationSyncOrchestrationHost {
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
  getAllTabs(): readonly TabData[];
  getTab(tabId: TabId): TabData | null;
  getTabRuntimeState(tabId: TabId | null): ConversationSyncSignalRuntime | null;
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
  private conversationSyncIntervalId: number | null = null;

  constructor(
    private readonly host: ConversationSyncOrchestrationHost,
    private readonly runtime: ConversationSyncOrchestrationRuntime,
    private readonly scheduler: ConversationSyncScheduler = DEFAULT_SCHEDULER,
  ) {}

  startConversationSyncLoop(callbacks: {
    syncVisibleConversation: () => Promise<void>;
    syncBackgroundTaskTabs: () => Promise<void>;
  }): void {
    this.stopConversationSyncLoop();
    if (!this.shouldStartConversationSyncLoop()) {
      return;
    }

    this.conversationSyncIntervalId = this.scheduler.setInterval(() => {
      void callbacks.syncVisibleConversation();
      void callbacks.syncBackgroundTaskTabs();
    }, CONVERSATION_SYNC_LOOP_INTERVAL_MS);
  }

  stopConversationSyncLoop(): void {
    if (this.conversationSyncIntervalId === null) {
      return;
    }

    this.scheduler.clearInterval(this.conversationSyncIntervalId);
    this.conversationSyncIntervalId = null;
  }

  clearScheduledSignalConversationSync(tabId: TabId | null): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || runtime.signalConversationSyncTimerId === null) {
      return;
    }

    this.scheduler.clearTimeout(runtime.signalConversationSyncTimerId);
    runtime.signalConversationSyncTimerId = null;
    runtime.pendingSignalConversationSyncReasons.clear();
  }

  scheduleConversationSyncFromSignal(
    tabId: TabId | null,
    reason: string,
    callbacks: {
      syncVisibleConversation: () => Promise<void>;
      syncTabConversation: (context: SignalConversationSyncContext) => Promise<void>;
    },
  ): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.pendingSignalConversationSyncReasons.add(reason);
    if (runtime.signalConversationSyncTimerId !== null) {
      return;
    }

    runtime.signalConversationSyncTimerId = this.scheduler.setTimeout(() => {
      runtime.signalConversationSyncTimerId = null;
      const mergedReason = [...runtime.pendingSignalConversationSyncReasons].sort().join('+') || reason;
      runtime.pendingSignalConversationSyncReasons.clear();
      void this.syncConversationFromSignal(tabId, mergedReason, callbacks);
    }, SIGNAL_CONVERSATION_SYNC_DEBOUNCE_MS);
  }

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

  private shouldStartConversationSyncLoop(): boolean {
    const currentConversation = this.host.getCurrentConversation();
    const shouldSyncVisibleConversation = Boolean(
      currentConversation?.openCodeSessionId
      && currentConversation.messages.length > 0,
    );
    const shouldSyncBackgroundTabs = this.host.getAllTabs().some((tab) =>
      Boolean(tab.conversationId) && tab.hasBackgroundTask,
    );

    return shouldSyncVisibleConversation || shouldSyncBackgroundTabs;
  }
}
