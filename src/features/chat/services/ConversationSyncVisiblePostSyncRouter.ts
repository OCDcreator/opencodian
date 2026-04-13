import type { ChatMessage } from '../../../core/types';
import type { TabId } from '../tabs';
import type {
  VisibleConversationPostSyncCoordinator,
  VisibleConversationPostSyncResult,
} from './VisibleConversationPostSyncCoordinator';
import type { VisibleConversationSyncContext } from './ConversationSyncRuntimeCoordinator';

export interface ConversationSyncVisiblePostSyncResult
  extends VisibleConversationPostSyncResult {
  messages: ChatMessage[];
}

export interface ConversationSyncVisiblePostSyncRouterHost {
  applySyncedConversationUpdate(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
}

type VisibleConversationPostSyncPort = Pick<
  VisibleConversationPostSyncCoordinator,
  'handleVisibleConversationSyncComplete'
>;

export interface VisibleConversationPostSyncRouteOptions {
  syncContext: VisibleConversationSyncContext;
  previousMessages: ChatMessage[];
  syncResult: ConversationSyncVisiblePostSyncResult;
}

export class ConversationSyncVisiblePostSyncRouter {
  constructor(
    private readonly host: ConversationSyncVisiblePostSyncRouterHost,
    private readonly postSyncCoordinator: VisibleConversationPostSyncPort,
  ) {}

  async routeVisibleSyncComplete(
    options: VisibleConversationPostSyncRouteOptions,
  ): Promise<void> {
    const postSyncOutcome = await this.postSyncCoordinator.handleVisibleConversationSyncComplete({
      tabId: options.syncContext.tabId,
      expectedConversationId: options.syncContext.conversation.id,
      questionSessionId: options.syncContext.conversation.openCodeSessionId,
      syncResult: options.syncResult,
    });

    if (postSyncOutcome.shouldApplySyncedConversationUpdate) {
      await this.host.applySyncedConversationUpdate(
        options.previousMessages,
        options.syncContext.conversation.messages,
      );
      return;
    }

    if (postSyncOutcome.shouldRenderBackgroundTaskIndicator) {
      await this.host.renderBackgroundTaskIndicatorIfNeeded(options.syncContext.tabId);
    }
  }
}
