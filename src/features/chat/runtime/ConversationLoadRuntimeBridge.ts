import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import type { TabId } from '../tabs';

export interface ConversationLoadRuntimeOptions {
  forceServerSync?: boolean;
}

export interface ResolveConversationOptions {
  reloadIfMissing?: boolean;
}

interface ConversationSyncResult {
  messages: ChatMessage[];
  revertState: { messageID: string; partID?: string } | null;
}

export interface ConversationLoadRuntimeBridgeHost {
  loadConversations(): Promise<void>;
  getConversationById(id: string): Promise<Conversation | null>;
  shouldSyncConversationFromServer(
    conversation: Conversation,
    options: ConversationLoadRuntimeOptions,
  ): boolean;
  syncConversationMessagesFromServer(
    conversation: Conversation,
    tabId: TabId | null,
    reason: string,
  ): Promise<ConversationSyncResult>;
  setCurrentConversationRevertState(revertState: { messageID: string; partID?: string } | null): void;
}

export interface ConversationLoadRuntimePort {
  resolveConversation(
    id: string,
    options?: ResolveConversationOptions,
  ): Promise<Conversation | null>;
  loadConversationMessages(
    conversation: Conversation,
    tabId: TabId | null,
    options?: ConversationLoadRuntimeOptions,
  ): Promise<ChatMessage[]>;
}

export class ConversationLoadRuntimeBridge implements ConversationLoadRuntimePort {
  constructor(private readonly host: ConversationLoadRuntimeBridgeHost) {}

  async resolveConversation(
    id: string,
    options: ResolveConversationOptions = {},
  ): Promise<Conversation | null> {
    let conversation = await this.host.getConversationById(id);
    if (conversation || !options.reloadIfMissing) {
      return conversation;
    }

    await this.host.loadConversations();
    conversation = await this.host.getConversationById(id);
    return conversation;
  }

  async loadConversationMessages(
    conversation: Conversation,
    tabId: TabId | null,
    options: ConversationLoadRuntimeOptions = {},
  ): Promise<ChatMessage[]> {
    if (!this.host.shouldSyncConversationFromServer(conversation, options)) {
      return conversation.messages;
    }

    const syncResult = await this.host.syncConversationMessagesFromServer(
      conversation,
      tabId,
      'load-conversation',
    );
    this.host.setCurrentConversationRevertState(syncResult.revertState);
    return syncResult.messages;
  }
}
