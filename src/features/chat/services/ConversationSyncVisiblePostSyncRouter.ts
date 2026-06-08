import type { ChatMessage } from '../../../core/types';
import { getConversationBackendSessionId } from '../../../core/types';
import type { TabId } from '../tabs';
import type { VisibleConversationSyncContext } from './ConversationSyncRuntimeCoordinator';
import type {
  VisibleConversationPostSyncCoordinator,
  VisibleConversationPostSyncResult,
} from './VisibleConversationPostSyncCoordinator';

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
    const conversation = options.syncContext.conversation;

    // Backend gate: question/todo refresh is an OpenCode-only feature.
    // Non-OpenCode conversations skip the post-sync question/todo refresh and
    // apply the synced update directly.
    const backend = conversation.backend ?? 'opencode';
    if (backend !== 'opencode') {
      await this.host.applySyncedConversationUpdate(
        options.previousMessages,
        conversation.messages,
      );
      return;
    }

    const postSyncOutcome = await this.postSyncCoordinator.handleVisibleConversationSyncComplete({
      tabId: options.syncContext.tabId,
      expectedConversationId: conversation.id,
      questionSessionId: getConversationBackendSessionId(conversation),
      syncResult: options.syncResult,
    });

    if (postSyncOutcome.shouldApplySyncedConversationUpdate) {
      await this.host.applySyncedConversationUpdate(
        options.previousMessages,
        conversation.messages,
      );
      return;
    }

    if (postSyncOutcome.shouldRenderBackgroundTaskIndicator) {
      await this.host.renderBackgroundTaskIndicatorIfNeeded(options.syncContext.tabId);
    }
  }
}
