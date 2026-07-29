import type {
  ChatMessage,
  Conversation,
} from '../../../../src/core/types';
import {
  type MessageFinalizationHost,
  type MessageFinalizationSyncResult,
} from '../../../../src/features/chat/services/MessageFinalizationService';
import { OpenCodeService } from '../../core/opencode/OpenCodeService.testSupport';

export function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

export function createConversation(messages: ChatMessage[]): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages,
  };
}

export type MockedMessageFinalizationHost = {
  [Key in keyof MessageFinalizationHost]:
    MessageFinalizationHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : MessageFinalizationHost[Key];
};

export type CanonicalAwareMessageFinalizationHost = MockedMessageFinalizationHost & {
  syncConversationMessagesFromCanonicalState: jest.Mock<
    Promise<MessageFinalizationSyncResult | null>,
    [Conversation, string | null, string]
  >;
};

export function createHost(
  conversation: Conversation,
  overrides: Partial<MockedMessageFinalizationHost> = {},
): MockedMessageFinalizationHost {
  const host: MockedMessageFinalizationHost = {
    getCurrentConversation: jest.fn().mockReturnValue(conversation),
    getActiveTabId: jest.fn().mockReturnValue('tab-1'),
    syncConversationMessagesFromCanonicalState: jest.fn().mockResolvedValue(null),
    syncConversationMessagesFromServer: jest.fn().mockResolvedValue({
      messages: conversation.messages,
      changed: false,
      fingerprint: OpenCodeService.getCanonicalConversationFingerprint(conversation.messages),
    }),
    getConversationSyncFingerprint: jest.fn().mockImplementation(
      (messages: ChatMessage[]) => OpenCodeService.getCanonicalConversationFingerprint(messages),
    ),
    applySyncedConversationUpdate: jest.fn().mockResolvedValue(undefined),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn().mockResolvedValue(undefined),
    appendTurnDiffNoticeIfNeeded: jest.fn().mockResolvedValue(undefined),
    refreshTabSessionTodos: jest.fn().mockResolvedValue([]),
    refreshTabSessionStatus: jest.fn().mockResolvedValue({ type: 'idle' }),
    saveConversation: jest.fn().mockResolvedValue(undefined),
    createConversationWriteTicket: jest.fn().mockImplementation((conversationId: string) => ({
      conversationId,
      version: 0,
    })),
    commitConversationWrite: jest.fn().mockImplementation(async (
      targetConversation: Conversation,
      _ticket,
      _reason,
      write,
    ) => {
      await write();
      await host.saveConversation(targetConversation);
      return true;
    }),
    setConversationSyncInFlight: jest.fn(),
    setLastConversationSyncFingerprint: jest.fn(),
    clearPendingEditedFiles: jest.fn(),
    setTabNeedsAttention: jest.fn(),
    setActiveTabConversation: jest.fn(),
    syncActiveTabContextUsageIdentity: jest.fn(),
    refreshActiveTabContextUsageFromServer: jest.fn().mockResolvedValue(undefined),
    summarizeChatMessageForDebug: jest.fn().mockImplementation((message: ChatMessage | null | undefined) => (
      message
        ? {
          id: message.id,
          role: message.role,
        }
        : null
    )),
    renderStreamError: jest.fn(),
    formatCurrentSessionModelId: jest.fn().mockReturnValue('test-model'),
    updateConversationSyncRuntime: jest.fn(),
    transitionTabSessionLifecycle: jest.fn().mockReturnValue(true),
    scrollToBottom: jest.fn(),
    ...overrides,
  };
  return host;
}
