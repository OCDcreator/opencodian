import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import { getConversationBackendSessionId } from '../../../core/types';
import type { TabId } from '../tabs';

type ConversationRevertState = { messageID: string; partID?: string } | null;

interface TabConversationStateBridgeTabManager {
  setActiveTabConversation(conversation: Pick<Conversation, 'id' | 'title'> | null): void;
}

export interface ActivateTabConversationOptions {
  clearRevertState?: boolean;
  resetSessionState?: boolean;
  resetBackgroundTaskSuppressedFingerprint?: boolean;
}

export interface TabConversationStateBridgeHost {
  getTabManager(): TabConversationStateBridgeTabManager | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  setCurrentConversation(conversation: Conversation | null): void;
  setCurrentConversationRevertState(revertState: ConversationRevertState): void;
  setOpenCodeSessionId(sessionId: string): void;
  applyConversationSessionSettings(conversation: Conversation | null): void;
  clearPendingQuestionsForTab(tabId: TabId | null): void;
  resetTabSessionState(tabId: TabId | null, sessionId: string | null): void;
  clearTabSessionState(tabId: TabId | null): void;
  resetBackgroundTaskSuppressedFingerprint(tabId: TabId | null): void;
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  setLastConversationSyncFingerprint(fingerprint: string): void;
  startConversationSyncLoop(): void;
  stopConversationSyncLoop(): void;
}

export class TabConversationStateBridge {
  constructor(private readonly host: TabConversationStateBridgeHost) {}

  syncActiveTabConversation(conversation: Pick<Conversation, 'id' | 'title'> | null): void {
    this.host.getTabManager()?.setActiveTabConversation(conversation);
  }

  applyActiveConversation(
    tabId: TabId | null,
    conversation: Conversation,
    options: ActivateTabConversationOptions = {},
  ): void {
    const previousSessionId = this.host.getSessionIdForTab(tabId);
    const backendSessionId = getConversationBackendSessionId(conversation);

    this.syncActiveTabConversation(conversation);
    this.host.setCurrentConversation(conversation);

    if (options.clearRevertState) {
      this.host.setCurrentConversationRevertState(null);
    }

    if (conversation.openCodeSessionId) {
      this.host.setOpenCodeSessionId(conversation.openCodeSessionId);
    }
    this.host.applyConversationSessionSettings(conversation);

    if (previousSessionId !== backendSessionId) {
      this.host.clearPendingQuestionsForTab(tabId);
    }

    if (options.resetSessionState) {
      this.host.resetTabSessionState(tabId, backendSessionId ?? null);
    }

    if (options.resetBackgroundTaskSuppressedFingerprint) {
      this.host.resetBackgroundTaskSuppressedFingerprint(tabId);
    }
  }

  clearActiveConversation(tabId: TabId | null): void {
    this.host.setCurrentConversation(null);
    this.host.applyConversationSessionSettings(null);
    this.host.stopConversationSyncLoop();
    this.host.clearTabSessionState(tabId);
    this.host.clearPendingQuestionsForTab(tabId);
  }

  commitConversationSyncBaseline(messages: ChatMessage[]): void {
    this.host.setLastConversationSyncFingerprint(
      this.host.getConversationSyncFingerprint(messages),
    );
    this.host.startConversationSyncLoop();
  }
}
