import type { TabId } from '../tabs';
import type {
  BackgroundTabPostSyncOptions,
  BackgroundTaskPostSyncResult,
  SignalBackgroundTaskPostSyncOptions,
} from './BackgroundTaskPostSyncCoordinator';
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

export interface ConversationSyncBackgroundPostSyncCoordinator {
  handleSignalSyncComplete(options: SignalBackgroundTaskPostSyncOptions): Promise<void>;
  handleBackgroundTabSyncComplete(options: BackgroundTabPostSyncOptions): Promise<void>;
}

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
    private readonly postSyncCoordinator: ConversationSyncBackgroundPostSyncCoordinator,
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
