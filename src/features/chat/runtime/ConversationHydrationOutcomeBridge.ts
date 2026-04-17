import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import type { TabId } from '../tabs';
import type { TabConversationStateBridge } from './TabConversationStateBridge';
import type { TabViewActivationBridge } from './TabViewActivationBridge';

type TabConversationStatePort = Pick<
  TabConversationStateBridge,
  'commitConversationSyncBaseline'
>;

type TabViewActivationPort = Pick<
  TabViewActivationBridge,
  'applyLoadedConversationPostRenderOutcome'
>;

export interface ConversationHydrationOutcomeBridgeHost {
  syncBackgroundTaskStateFromConversation(conversation: Conversation): void;
  reapplyConversationSessionVisualState(conversation: Conversation): void;
  renderMessages(messages: ChatMessage[]): Promise<void>;
}

export interface ConversationHydrationOutcomePort {
  applyLoadedConversationOutcome(
    tabId: TabId | null,
    conversation: Conversation,
    messages: ChatMessage[],
  ): Promise<void>;
}

export class ConversationHydrationOutcomeBridge implements ConversationHydrationOutcomePort {
  constructor(
    private readonly host: ConversationHydrationOutcomeBridgeHost,
    private readonly tabConversationStateBridge: TabConversationStatePort,
    private readonly tabViewActivationBridge: TabViewActivationPort,
  ) {}

  async applyLoadedConversationOutcome(
    tabId: TabId | null,
    conversation: Conversation,
    messages: ChatMessage[],
  ): Promise<void> {
    this.host.syncBackgroundTaskStateFromConversation(conversation);
    this.host.reapplyConversationSessionVisualState(conversation);
    await this.host.renderMessages(messages);
    await this.tabViewActivationBridge.applyLoadedConversationPostRenderOutcome(
      tabId,
      conversation.openCodeSessionId,
    );
    this.tabConversationStateBridge.commitConversationSyncBaseline(messages);
  }
}
