import type { SessionActivityStatus } from '../../../core/opencode';
import type {
  ChatMessage,
  Conversation,
  SessionTodo,
} from '../../../core/types';
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
  clearPendingQuestionsForTab(tabId: TabId | null): void;
  setTabSessionTodos(tabId: TabId | null, todos: SessionTodo[], sessionId: string | null): void;
  setTabSessionStatus(
    tabId: TabId | null,
    status: SessionActivityStatus | null,
    sessionId: string | null,
  ): void;
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

    this.syncActiveTabConversation(conversation);
    this.host.setCurrentConversation(conversation);

    if (options.clearRevertState) {
      this.host.setCurrentConversationRevertState(null);
    }

    this.host.setOpenCodeSessionId(conversation.openCodeSessionId);

    if (previousSessionId !== conversation.openCodeSessionId) {
      this.host.clearPendingQuestionsForTab(tabId);
    }

    if (options.resetSessionState) {
      this.host.setTabSessionTodos(tabId, [], conversation.openCodeSessionId);
      this.host.setTabSessionStatus(tabId, null, conversation.openCodeSessionId);
    }

    if (options.resetBackgroundTaskSuppressedFingerprint) {
      this.host.resetBackgroundTaskSuppressedFingerprint(tabId);
    }
  }

  clearActiveConversation(tabId: TabId | null): void {
    this.host.setCurrentConversation(null);
    this.host.stopConversationSyncLoop();
    this.host.setTabSessionTodos(tabId, [], null);
    this.host.setTabSessionStatus(tabId, null, null);
    this.host.clearPendingQuestionsForTab(tabId);
  }

  commitConversationSyncBaseline(messages: ChatMessage[]): void {
    this.host.setLastConversationSyncFingerprint(
      this.host.getConversationSyncFingerprint(messages),
    );
    this.host.startConversationSyncLoop();
  }
}
