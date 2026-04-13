import type {
  SessionSyncEventUpdate,
} from '../../../core/opencode';
import type { TabId } from '../tabs';

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

export interface ConversationSyncBridgePortProviderHost {
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
  host: ConversationSyncBridgePortProviderHost,
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
