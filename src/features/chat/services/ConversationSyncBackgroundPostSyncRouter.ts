import type { TabId } from '../tabs';
import type {
  BackgroundConversationPostSyncHandoffCoordinator,
  BackgroundTaskPostSyncResult,
} from './BackgroundConversationPostSyncHandoffCoordinator';
import type { SignalConversationSyncContext } from './ConversationSyncOrchestrationService';
import type { TabConversationSyncContext } from './ConversationSyncRuntimeCoordinator';

export interface ConversationSyncBackgroundPostSyncRouterRuntime {
  lastConversationSyncFingerprint: string | null;
}

export interface ConversationSyncBackgroundPostSyncRouterHost {
  getTabRuntimeState(
    tabId: TabId | null,
  ): ConversationSyncBackgroundPostSyncRouterRuntime | null;
}

export type ConversationSyncBackgroundPostSyncHandoffPort = Pick<
  BackgroundConversationPostSyncHandoffCoordinator,
  'handleSignalSyncComplete' | 'handleBackgroundTabSyncComplete'
>;

export interface SignalConversationPostSyncRouteOptions {
  syncContext: SignalConversationSyncContext;
  syncResult: BackgroundTaskPostSyncResult;
}

export interface BackgroundTabConversationPostSyncRouteOptions {
  syncContext: TabConversationSyncContext;
  syncResult: BackgroundTaskPostSyncResult;
}

export class ConversationSyncBackgroundPostSyncRouter {
  constructor(
    private readonly host: ConversationSyncBackgroundPostSyncRouterHost,
    private readonly postSyncCoordinator: ConversationSyncBackgroundPostSyncHandoffPort,
  ) {}

  async routeSignalSyncComplete(
    options: SignalConversationPostSyncRouteOptions,
  ): Promise<void> {
    const runtime = this.host.getTabRuntimeState(options.syncContext.tabId);
    if (runtime) {
      runtime.lastConversationSyncFingerprint = options.syncResult.fingerprint;
    }

    await this.postSyncCoordinator.handleSignalSyncComplete({
      ...options.syncContext,
      syncResult: options.syncResult,
    });
  }

  async routeBackgroundTabSyncComplete(
    options: BackgroundTabConversationPostSyncRouteOptions,
  ): Promise<void> {
    await this.postSyncCoordinator.handleBackgroundTabSyncComplete({
      ...options.syncContext,
      syncResult: options.syncResult,
    });
  }
}
