import type { ChatMessage, Conversation } from '../../../core/types';
import { getConversationBackendSessionId } from '../../../core/types';
import type { ConversationRenderMessagesOptions } from '../services/ConversationRenderRuntime';
import type { TabId } from '../tabs';
import type { ConversationHydrationRenderPort } from './ConversationHydrationRenderBridge';
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

function getOpenCodeActivationSessionId(conversation: Conversation): string | null {
  if ((conversation.backend ?? 'opencode') !== 'opencode') {
    return null;
  }

  return getConversationBackendSessionId(conversation) ?? null;
}

export interface ConversationHydrationOutcomeBridgeHost {
  syncBackgroundTaskStateFromConversation(conversation: Conversation): void;
  reapplyConversationSessionVisualState(conversation: Conversation): void;
  renderMessages(messages: ChatMessage[], options?: ConversationRenderMessagesOptions): Promise<void>;
}

export interface ConversationHydrationOutcomePort {
  applyLoadedConversationOutcome(
    tabId: TabId | null,
    conversation: Conversation,
    messages: ChatMessage[],
    options?: ConversationRenderMessagesOptions,
  ): Promise<void>;
}

export class ConversationHydrationOutcomeBridge implements ConversationHydrationOutcomePort {
  constructor(
    private readonly host: ConversationHydrationOutcomeBridgeHost,
    private readonly tabConversationStateBridge: TabConversationStatePort,
    private readonly tabViewActivationBridge: TabViewActivationPort,
    private readonly hydrationRenderPort?: ConversationHydrationRenderPort,
  ) {}

  async applyLoadedConversationOutcome(
    tabId: TabId | null,
    conversation: Conversation,
    messages: ChatMessage[],
    options: ConversationRenderMessagesOptions = {},
  ): Promise<void> {
    this.host.syncBackgroundTaskStateFromConversation(conversation);
    this.host.reapplyConversationSessionVisualState(conversation);
    const context = this.hydrationRenderPort?.getCurrentContext() ?? null;
    const renderOptions = context && this.hydrationRenderPort
      ? {
        ...options,
        stagingContainer: this.hydrationRenderPort.getStagingContainer(context),
      }
      : options;
    await this.host.renderMessages(messages, renderOptions);
    // A load can be superseded while an individual message renderer awaits
    // markdown/image work.  The renderer stops at its next checkpoint, and
    // the hydration tail must not commit activation/baseline for that stale
    // generation.
    if (options.shouldContinueRender && !options.shouldContinueRender()) {
      return;
    }
    if (context && this.hydrationRenderPort) this.hydrationRenderPort.commitStaging(context);
    const activationSessionId = getOpenCodeActivationSessionId(conversation);
    if (options.shouldContinueRender) {
      await this.tabViewActivationBridge.applyLoadedConversationPostRenderOutcome(
        tabId,
        activationSessionId,
        { isCurrent: options.shouldContinueRender },
      );
    } else {
      await this.tabViewActivationBridge.applyLoadedConversationPostRenderOutcome(
        tabId,
        activationSessionId,
      );
    }
    // Activation itself may await asynchronous session/UI work. Re-check once
    // more before committing the sync baseline so a generation superseded
    // during that await cannot anchor stale messages as current.
    if (options.shouldContinueRender && !options.shouldContinueRender()) {
      return;
    }
    this.tabConversationStateBridge.commitConversationSyncBaseline(messages);
  }
}
