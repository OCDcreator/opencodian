import type { ChatMessage } from '../../../core/types';
import type { TabId } from '../tabs';

export interface TabConversationSyncFingerprintRuntimePort {
  getConversationSyncFingerprint(messages: ChatMessage[]): string;
  setTabConversationSyncFingerprint(tabId: TabId | null, fingerprint: string): void;
}

export interface TabConversationSyncFingerprintPortProviderHost {
  getConversationSyncFingerprint:
    TabConversationSyncFingerprintRuntimePort['getConversationSyncFingerprint'];
  setTabConversationSyncFingerprint:
    TabConversationSyncFingerprintRuntimePort['setTabConversationSyncFingerprint'];
}

export function createTabConversationSyncFingerprintRuntimePort(
  host: TabConversationSyncFingerprintPortProviderHost,
): TabConversationSyncFingerprintRuntimePort {
  return {
    getConversationSyncFingerprint: (messages) =>
      host.getConversationSyncFingerprint(messages),
    setTabConversationSyncFingerprint: (tabId, fingerprint) => {
      host.setTabConversationSyncFingerprint(tabId, fingerprint);
    },
  };
}
