import type { TabId } from '../tabs';
import { syncUserMessageStreamingActionState } from '../userMessageActions';

interface TabRuntimeStateBridgeRuntime {
  isStreaming: boolean;
}

interface TabRuntimeStateBridgeTabManager {
  setTabStreaming(tabId: TabId | null, isStreaming: boolean): void;
  setTabBackgroundTaskRunning(tabId: TabId | null, hasBackgroundTask: boolean): void;
  setTabNeedsAttention(tabId: TabId, needsAttention: boolean): void;
}

export interface TabRuntimeStateBridgeHost {
  getTabManager(): TabRuntimeStateBridgeTabManager | null;
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): TabRuntimeStateBridgeRuntime | null;
  getTabMessagesContainer(tabId: TabId | null): ParentNode | null;
  hasBackgroundTaskIndicator(tabId: TabId | null): boolean;
  updateSendButtonState(): void;
}

export class TabRuntimeStateBridge {
  constructor(private readonly host: TabRuntimeStateBridgeHost) {}

  syncStreamLikeState(tabId: TabId | null): void {
    if (!tabId) {
      this.host.updateSendButtonState();
      return;
    }

    const runtime = this.host.getTabRuntimeState(tabId);
    const tabManager = this.host.getTabManager();

    tabManager?.setTabStreaming(tabId, runtime?.isStreaming ?? false);
    tabManager?.setTabBackgroundTaskRunning(
      tabId,
      Boolean(runtime && this.host.hasBackgroundTaskIndicator(tabId)),
    );

    const messagesContainer = this.host.getTabMessagesContainer(tabId);
    if (messagesContainer) {
      syncUserMessageStreamingActionState(messagesContainer, Boolean(runtime?.isStreaming));
    }

    if (tabId === this.host.getActiveTabId()) {
      this.host.updateSendButtonState();
    }
  }

  syncActiveStreamLikeState(): void {
    this.syncStreamLikeState(this.host.getActiveTabId());
  }

  setNeedsAttention(tabId: TabId | null, needsAttention: boolean): void {
    if (!tabId) {
      return;
    }

    this.host.getTabManager()?.setTabNeedsAttention(tabId, needsAttention);
  }
}
