import type {
  ChatMessage,
  Conversation,
} from '../../../core/types';
import type { TabId } from '../tabs';
import type {
  BackgroundTabPostSyncOptions,
  SignalBackgroundTaskPostSyncOptions,
  VisibleConversationPostSyncOptions,
  VisibleConversationPostSyncOutcome,
  VisibleConversationPostSyncResult,
} from './BackgroundTaskPostSyncCoordinator';
import type {
  SignalConversationSyncContext,
} from './ConversationSyncOrchestrationService';
import type {
  TabConversationSyncContext,
  VisibleConversationSyncContext,
} from './ConversationSyncRuntimeCoordinator';

export interface ConversationSyncBridgeRuntime {
  lastConversationSyncFingerprint: string | null;
}

export interface ConversationSyncBridgeSyncResult extends VisibleConversationPostSyncResult {
  messages: ChatMessage[];
}

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

export interface ConversationSyncBridgePostSyncCoordinator {
  handleVisibleConversationSyncComplete(
    options: VisibleConversationPostSyncOptions,
  ): Promise<VisibleConversationPostSyncOutcome>;
  handleSignalSyncComplete(options: SignalBackgroundTaskPostSyncOptions): Promise<void>;
  handleBackgroundTabSyncComplete(options: BackgroundTabPostSyncOptions): Promise<void>;
}

export class ConversationSyncBridge {
  constructor(
    private readonly host: ConversationSyncBridgeHost,
    private readonly runtimeCoordinator: ConversationSyncBridgeRuntimeCoordinator,
    private readonly orchestrationService: ConversationSyncBridgeOrchestration,
    private readonly postSyncCoordinator: ConversationSyncBridgePostSyncCoordinator,
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
      async ({ tabId, conversation }) => {
        const expectedConversationId = conversation.id;
        const expectedSessionId = conversation.openCodeSessionId;
        const previousMessages = [...conversation.messages];
        const syncResult = await this.host.syncConversationMessagesFromServer(
          conversation,
          tabId,
          'visible-background-sync',
          { suppressVerboseLogs: true },
        );
        const postSyncOutcome = await this.postSyncCoordinator.handleVisibleConversationSyncComplete({
          tabId,
          expectedConversationId,
          questionSessionId: expectedSessionId,
          syncResult,
        });
        if (postSyncOutcome.shouldApplySyncedConversationUpdate) {
          await this.host.applySyncedConversationUpdate(previousMessages, conversation.messages);
          return;
        }

        if (postSyncOutcome.shouldRenderBackgroundTaskIndicator) {
          await this.host.renderBackgroundTaskIndicatorIfNeeded(tabId);
        }
      },
    );
  }

  async syncBackgroundTaskTabsInBackground(): Promise<void> {
    await this.orchestrationService.syncBackgroundTaskTabs(
      async ({ tabId, conversation, previousFingerprint }) => {
        const syncResult = await this.host.syncConversationMessagesFromServer(
          conversation,
          tabId,
          'background-tab-sync',
        );
        await this.postSyncCoordinator.handleBackgroundTabSyncComplete({
          tabId,
          conversation,
          previousFingerprint,
          syncResult,
        });
      },
    );
  }

  private async syncSignalTabConversation({
    tabId,
    conversation,
    reason,
    previousFingerprint,
    activeTabId,
    tabHasBackgroundTask,
  }: SignalConversationSyncContext): Promise<void> {
    const syncResult = await this.host.syncConversationMessagesFromServer(
      conversation,
      tabId,
      `sync-event:${reason}`,
      { suppressVerboseLogs: true },
    );
    const runtime = this.host.getTabRuntimeState(tabId);
    if (runtime) {
      runtime.lastConversationSyncFingerprint = syncResult.fingerprint;
    }
    await this.postSyncCoordinator.handleSignalSyncComplete({
      tabId,
      conversation,
      reason,
      activeTabId,
      tabHasBackgroundTask,
      previousFingerprint,
      syncResult,
    });
  }
}
