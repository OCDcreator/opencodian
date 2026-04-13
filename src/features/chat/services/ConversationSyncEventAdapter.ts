import type { SessionSyncEventUpdate } from '../../../core/opencode';
import type { TabId } from '../tabs';
import {
  ConversationSessionTabResolver,
  type ConversationSessionTabResolutionPort,
  type ConversationSessionTabResolverHost,
} from './ConversationSessionTabResolver';

export interface ConversationSyncEventAdapterHost extends ConversationSessionTabResolverHost {
  subscribeToSessionSyncEvents(listener: (update: SessionSyncEventUpdate) => void): () => void;
  scheduleConversationSyncFromSignal(tabId: TabId | null, reason: SessionSyncEventUpdate['type']): void;
}

export class ConversationSyncEventAdapter {
  private disposeSubscription: (() => void) | null = null;
  private readonly sessionTabResolver: ConversationSessionTabResolutionPort;

  constructor(
    private readonly host: ConversationSyncEventAdapterHost,
    sessionTabResolver: ConversationSessionTabResolutionPort = new ConversationSessionTabResolver(host),
  ) {
    this.sessionTabResolver = sessionTabResolver;
  }

  start(): void {
    this.stop();
    this.disposeSubscription = this.host.subscribeToSessionSyncEvents((update) => {
      this.handleSessionSyncEvent(update);
    });
  }

  stop(): void {
    this.disposeSubscription?.();
    this.disposeSubscription = null;
  }

  private handleSessionSyncEvent(update: SessionSyncEventUpdate): void {
    for (const tabId of this.sessionTabResolver.resolveMatchedTabIds(update.sessionId)) {
      this.host.scheduleConversationSyncFromSignal(tabId, update.type);
    }
  }
}
