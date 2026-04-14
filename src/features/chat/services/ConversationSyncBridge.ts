import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import type { TabId } from '../tabs';
import type { ConversationSyncBackgroundPostSyncRouter } from './ConversationSyncBackgroundPostSyncRouter';
import type {
  SignalConversationSyncContext,
} from './ConversationSyncOrchestrationService';
import type {
  TabConversationSyncContext,
  VisibleConversationSyncContext,
} from './ConversationSyncRuntimeCoordinator';
import type {
  ConversationSyncVisiblePostSyncResult,
  ConversationSyncVisiblePostSyncRouter,
} from './ConversationSyncVisiblePostSyncRouter';

export interface ConversationSyncBridgeRuntime {
  lastConversationSyncFingerprint: string | null;
}

export interface ConversationSyncBridgeSyncResult extends ConversationSyncVisiblePostSyncResult {}

export interface ConversationSyncBridgeHost {
  getCurrentConversation(): Conversation | null;
  getTabRuntimeState(tabId: TabId | null): ConversationSyncBridgeRuntime | null;
  syncConversationMessagesFromServer(
    conversation: Conversation,
    tabId: TabId | null,
    reason: string,
    options?: { suppressVerboseLogs?: boolean },
  ): Promise<ConversationSyncBridgeSyncResult>;
  applySyncedConversationUpdate(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): Promise<void>;
  renderBackgroundTaskIndicatorIfNeeded(tabId?: TabId | null): Promise<void>;
}

export interface ConversationSyncBridgeRuntimeCoordinator {
  runVisibleConversationSync(
    conversation: Conversation | null,
    callback: (context: VisibleConversationSyncContext) => Promise<void>,
  ): Promise<boolean>;
}

export interface ConversationSyncBridgeOrchestration {
  startConversationSyncLoop(callbacks: {
    syncVisibleConversation: () => Promise<void>;
    syncBackgroundTaskTabs: () => Promise<void>;
  }): void;
  stopConversationSyncLoop(): void;
  clearScheduledSignalConversationSync(tabId: TabId | null): void;
  scheduleConversationSyncFromSignal(
    tabId: TabId | null,
    reason: string,
    callbacks: {
      syncVisibleConversation: () => Promise<void>;
      syncTabConversation: (context: SignalConversationSyncContext) => Promise<void>;
    },
  ): void;
  syncBackgroundTaskTabs(
    callback: (context: TabConversationSyncContext) => Promise<void>,
  ): Promise<void>;
}

export class ConversationSyncBridge {
  constructor(
    private readonly host: ConversationSyncBridgeHost,
    private readonly runtimeCoordinator: ConversationSyncBridgeRuntimeCoordinator,
    private readonly orchestrationService: ConversationSyncBridgeOrchestration,
    private readonly visiblePostSyncRouter: Pick<
      ConversationSyncVisiblePostSyncRouter,
      'routeVisibleSyncComplete'
    >,
    private readonly backgroundPostSyncRouter: Pick<
      ConversationSyncBackgroundPostSyncRouter,
      'routeBackgroundTabSyncComplete' | 'routeSignalSyncComplete'
    >,
  ) {}

  startConversationSyncLoop(): void {
    this.orchestrationService.startConversationSyncLoop({
      syncVisibleConversation: () => this.syncVisibleConversationInBackground(),
      syncBackgroundTaskTabs: () => this.syncBackgroundTaskTabsInBackground(),
    });
  }

  stopConversationSyncLoop(): void {
    this.orchestrationService.stopConversationSyncLoop();
  }

  clearScheduledSignalConversationSync(tabId: TabId | null): void {
    this.orchestrationService.clearScheduledSignalConversationSync(tabId);
  }

  scheduleConversationSyncFromSignal(tabId: TabId | null, reason: string): void {
    this.orchestrationService.scheduleConversationSyncFromSignal(
      tabId,
      reason,
      {
        syncVisibleConversation: () => this.syncVisibleConversationInBackground(),
        syncTabConversation: (context) => this.syncSignalTabConversation(context),
      },
    );
  }

  async syncVisibleConversationInBackground(): Promise<void> {
    await this.runtimeCoordinator.runVisibleConversationSync(
      this.host.getCurrentConversation(),
      async (syncContext) => {
        const { conversation } = syncContext;
        const previousMessages = [...conversation.messages];
        const syncResult = await this.host.syncConversationMessagesFromServer(
          conversation,
          syncContext.tabId,
          'visible-background-sync',
          { suppressVerboseLogs: true },
        );

        await this.visiblePostSyncRouter.routeVisibleSyncComplete({
          syncContext,
          previousMessages,
          syncResult,
        });
      },
    );
  }

  async syncBackgroundTaskTabsInBackground(): Promise<void> {
    await this.orchestrationService.syncBackgroundTaskTabs(
      async (syncContext: TabConversationSyncContext) => {
        const syncResult = await this.host.syncConversationMessagesFromServer(
          syncContext.conversation,
          syncContext.tabId,
          'background-tab-sync',
        );
        await this.backgroundPostSyncRouter.routeBackgroundTabSyncComplete({
          syncContext,
          syncResult,
        });
      },
    );
  }

  private async syncSignalTabConversation(
    syncContext: SignalConversationSyncContext,
  ): Promise<void> {
    const syncResult = await this.host.syncConversationMessagesFromServer(
      syncContext.conversation,
      syncContext.tabId,
      `sync-event:${syncContext.reason}`,
      { suppressVerboseLogs: true },
    );

    await this.backgroundPostSyncRouter.routeSignalSyncComplete({
      syncContext,
      syncResult,
    });
  }
}
