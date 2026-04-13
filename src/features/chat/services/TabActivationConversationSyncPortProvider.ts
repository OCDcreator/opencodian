import type { ChatMessage } from '../../../core/types';

export interface TabActivationConversationSyncRuntimePort {
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  setLastConversationSyncFingerprint(fingerprint: string): void;
  startConversationSyncLoop(): void;
  stopConversationSyncLoop(): void;
}

export interface TabActivationConversationSyncPortProviderHost {
  getConversationSyncFingerprint:
    TabActivationConversationSyncRuntimePort['getConversationSyncFingerprint'];
  setLastConversationSyncFingerprint:
    TabActivationConversationSyncRuntimePort['setLastConversationSyncFingerprint'];
  startConversationSyncLoop:
    TabActivationConversationSyncRuntimePort['startConversationSyncLoop'];
  stopConversationSyncLoop:
    TabActivationConversationSyncRuntimePort['stopConversationSyncLoop'];
}

export function createTabActivationConversationSyncRuntimePort(
  host: TabActivationConversationSyncPortProviderHost,
): TabActivationConversationSyncRuntimePort {
  return {
    getConversationSyncFingerprint: (messages) =>
      host.getConversationSyncFingerprint(messages),
    setLastConversationSyncFingerprint: (fingerprint) => {
      host.setLastConversationSyncFingerprint(fingerprint);
    },
    startConversationSyncLoop: () => {
      host.startConversationSyncLoop();
    },
    stopConversationSyncLoop: () => {
      host.stopConversationSyncLoop();
    },
  };
}
