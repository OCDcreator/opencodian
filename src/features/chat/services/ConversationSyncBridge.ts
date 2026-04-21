import type { SessionSyncEventUpdate } from '../../../core/opencode';
import type { Conversation } from '../../../core/types';
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

export type ConversationSyncBridgeSyncResult = ConversationSyncVisiblePostSyncResult;


export interface ConversationSyncLoopControlPort {
  startConversationSyncLoop(): void;
  stopConversationSyncLoop(): void;
}

export interface ConversationSyncSignalSchedulerPort {
  clearScheduledSignalConversationSync(tabId: TabId | null): void;
  scheduleConversationSyncFromSignal(
    tabId: TabId | null,
    reason: SessionSyncEventUpdate['type'],
  ): void;
}

export interface ConversationSyncVisibleFollowUpPort {
  startConversationSyncLoop(): void;
  syncVisibleConversationInBackground(): Promise<void>;
}

export interface ConversationSyncBridgePortBuilderHost {
  startConversationSyncLoop: ConversationSyncLoopControlPort['startConversationSyncLoop'];
  stopConversationSyncLoop: ConversationSyncLoopControlPort['stopConversationSyncLoop'];
  clearScheduledSignalConversationSync:
    ConversationSyncSignalSchedulerPort['clearScheduledSignalConversationSync'];
  scheduleConversationSyncFromSignal:
    ConversationSyncSignalSchedulerPort['scheduleConversationSyncFromSignal'];
  syncVisibleConversationInBackground:
    ConversationSyncVisibleFollowUpPort['syncVisibleConversationInBackground'];
}

export interface ConversationSyncBridgePorts {
  getLoopControl(): ConversationSyncLoopControlPort;
  getSignalScheduler(): ConversationSyncSignalSchedulerPort;
  getVisibleSyncFollowUp(): ConversationSyncVisibleFollowUpPort;
}

export function createConversationSyncBridgePorts(
  host: ConversationSyncBridgePortBuilderHost,
): ConversationSyncBridgePorts {
  return {
    getLoopControl: () => ({
      startConversationSyncLoop: () => {
        host.startConversationSyncLoop();
      },
      stopConversationSyncLoop: () => {
        host.stopConversationSyncLoop();
      },
    }),
    getSignalScheduler: () => ({
      clearScheduledSignalConversationSync: (tabId) => {
        host.clearScheduledSignalConversationSync(tabId);
      },
      scheduleConversationSyncFromSignal: (tabId, reason) => {
        host.scheduleConversationSyncFromSignal(tabId, reason);
      },
    }),
    getVisibleSyncFollowUp: () => ({
      startConversationSyncLoop: () => {
        host.startConversationSyncLoop();
      },
      syncVisibleConversationInBackground: () =>
        host.syncVisibleConversationInBackground(),
    }),
  };
}

export interface ConversationSyncBridgeHost {
  getCurrentConversation(): Conversation | null;
  syncConversationMessagesFromServer(
    conversation: Conversation,
    tabId: TabId | null,
    reason: string,
    options?: { suppressVerboseLogs?: boolean },
  ): Promise<ConversationSyncBridgeSyncResult>;
  syncConversationMessagesFromCanonicalState(
    conversation: Conversation,
    tabId: TabId | null,
    reason: string,
    options?: { suppressVerboseLogs?: boolean },
  ): Promise<ConversationSyncBridgeSyncResult | null>;
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
  syncConversationFromSignal(
    tabId: TabId | null,
    reason: string,
    callbacks: {
      syncVisibleConversation: () => Promise<void>;
      syncTabConversation: (context: SignalConversationSyncContext) => Promise<void>;
    },
  ): Promise<void>;
  syncBackgroundTaskTabs(
    callback: (context: TabConversationSyncContext) => Promise<void>,
  ): Promise<void>;
}

interface ConversationSyncBridgeDependencies {
  host: ConversationSyncBridgeHost;
  runtimeCoordinator: ConversationSyncBridgeRuntimeCoordinator;
  orchestrationService: ConversationSyncBridgeOrchestration;
  visiblePostSyncRouter: Pick<
    ConversationSyncVisiblePostSyncRouter,
    'routeVisibleSyncComplete'
  >;
  backgroundPostSyncRouter: Pick<
    ConversationSyncBackgroundPostSyncRouter,
    'routeBackgroundTabSyncComplete' | 'routeSignalSyncComplete'
  >;
}

export class ConversationSyncBridge {
  private readonly host: ConversationSyncBridgeHost;
  private readonly runtimeCoordinator: ConversationSyncBridgeRuntimeCoordinator;
  private readonly orchestrationService: ConversationSyncBridgeOrchestration;
  private readonly visiblePostSyncRouter: Pick<
    ConversationSyncVisiblePostSyncRouter,
    'routeVisibleSyncComplete'
  >;
  private readonly backgroundPostSyncRouter: Pick<
    ConversationSyncBackgroundPostSyncRouter,
    'routeBackgroundTabSyncComplete' | 'routeSignalSyncComplete'
  >;

  constructor({
    host,
    runtimeCoordinator,
    orchestrationService,
    visiblePostSyncRouter,
    backgroundPostSyncRouter,
  }: ConversationSyncBridgeDependencies) {
    this.host = host;
    this.runtimeCoordinator = runtimeCoordinator;
    this.orchestrationService = orchestrationService;
    this.visiblePostSyncRouter = visiblePostSyncRouter;
    this.backgroundPostSyncRouter = backgroundPostSyncRouter;
  }

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

  applySessionSyncEvent(tabId: TabId | null, update: SessionSyncEventUpdate): void {
    if (update.type === 'session.diff') {
      return;
    }

    void this.orchestrationService.syncConversationFromSignal(
      tabId,
      update.type,
      {
        syncVisibleConversation: () => this.syncVisibleConversationFromCanonicalState(update),
        syncTabConversation: (context) =>
          this.syncSignalTabConversationFromCanonicalState(context, update),
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

  private async syncVisibleConversationFromCanonicalState(
    update: Exclude<SessionSyncEventUpdate, { type: 'session.diff' }>,
  ): Promise<void> {
    await this.runtimeCoordinator.runVisibleConversationSync(
      this.host.getCurrentConversation(),
      async (syncContext) => {
        const { conversation } = syncContext;
        if (conversation.openCodeSessionId !== update.sessionId) {
          return;
        }

        const previousMessages = [...conversation.messages];
        const reason = `sync-event:${update.type}`;
        const syncResult =
          await this.host.syncConversationMessagesFromCanonicalState(
            conversation,
            syncContext.tabId,
            reason,
            { suppressVerboseLogs: true },
          )
          ?? await this.host.syncConversationMessagesFromServer(
            conversation,
            syncContext.tabId,
            reason,
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

  private async syncSignalTabConversationFromCanonicalState(
    syncContext: SignalConversationSyncContext,
    update: Exclude<SessionSyncEventUpdate, { type: 'session.diff' }>,
  ): Promise<void> {
    if (syncContext.conversation.openCodeSessionId !== update.sessionId) {
      return;
    }

    const reason = `sync-event:${syncContext.reason}`;
    const syncResult =
      await this.host.syncConversationMessagesFromCanonicalState(
        syncContext.conversation,
        syncContext.tabId,
        reason,
        { suppressVerboseLogs: true },
      );

    if (!syncResult) {
      await this.syncSignalTabConversation(syncContext);
      return;
    }

    await this.backgroundPostSyncRouter.routeSignalSyncComplete({
      syncContext,
      syncResult,
    });
  }
}
