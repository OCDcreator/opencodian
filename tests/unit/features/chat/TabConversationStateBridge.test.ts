import type { Conversation } from '../../../../src/core/types';
import {
  TabConversationStateBridge,
  type TabConversationStateBridgeHost,
} from '../../../../src/features/chat/runtime/TabConversationStateBridge';

function createConversation(id = 'conversation-1'): Conversation {
  return {
    id,
    title: `Chat ${id}`,
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: `${id}-session`,
    messages: [
      {
        id: `message-${id}`,
        role: 'assistant',
        content: 'Hello',
        timestamp: 1,
      },
    ],
  };
}

describe('TabConversationStateBridge', () => {
  function createBridge(options?: {
    sessionIdForTab?: string | null;
  }) {
    const tabManager = {
      setActiveTabConversation: jest.fn(),
    };
    const host: jest.Mocked<TabConversationStateBridgeHost> = {
      getTabManager: jest.fn().mockReturnValue(tabManager),
      getSessionIdForTab: jest.fn().mockReturnValue(options?.sessionIdForTab ?? 'previous-session'),
      setCurrentConversation: jest.fn(),
      setCurrentConversationRevertState: jest.fn(),
      setOpenCodeSessionId: jest.fn(),
      clearPendingQuestionsForTab: jest.fn(),
      setTabSessionTodos: jest.fn(),
      setTabSessionStatus: jest.fn(),
      resetBackgroundTaskSuppressedFingerprint: jest.fn(),
      getConversationSyncFingerprint: jest.fn().mockReturnValue('fingerprint'),
      setLastConversationSyncFingerprint: jest.fn(),
      startConversationSyncLoop: jest.fn(),
      stopConversationSyncLoop: jest.fn(),
    };

    return {
      bridge: new TabConversationStateBridge(host),
      host,
      tabManager,
    };
  }

  it('applies active conversation state and resets session-scoped runtime when requested', () => {
    const conversation = createConversation('active');
    const { bridge, host, tabManager } = createBridge();

    bridge.applyActiveConversation('tab-1', conversation, {
      clearRevertState: true,
      resetSessionState: true,
      resetBackgroundTaskSuppressedFingerprint: true,
    });

    expect(tabManager.setActiveTabConversation).toHaveBeenCalledWith(conversation);
    expect(host.setCurrentConversation).toHaveBeenCalledWith(conversation);
    expect(host.setCurrentConversationRevertState).toHaveBeenCalledWith(null);
    expect(host.setOpenCodeSessionId).toHaveBeenCalledWith(conversation.openCodeSessionId);
    expect(host.clearPendingQuestionsForTab).toHaveBeenCalledWith('tab-1');
    expect(host.setTabSessionTodos).toHaveBeenCalledWith('tab-1', [], conversation.openCodeSessionId);
    expect(host.setTabSessionStatus).toHaveBeenCalledWith('tab-1', null, conversation.openCodeSessionId);
    expect(host.resetBackgroundTaskSuppressedFingerprint).toHaveBeenCalledWith('tab-1');
  });

  it('skips pending-question clearing when the tab session already matches', () => {
    const conversation = createConversation('matched');
    const { bridge, host } = createBridge({
      sessionIdForTab: conversation.openCodeSessionId,
    });

    bridge.applyActiveConversation('tab-1', conversation, {
      resetSessionState: true,
    });

    expect(host.clearPendingQuestionsForTab).not.toHaveBeenCalled();
  });

  it('clears active conversation session state for empty tabs', () => {
    const { bridge, host } = createBridge();

    bridge.clearActiveConversation('tab-1');

    expect(host.setCurrentConversation).toHaveBeenCalledWith(null);
    expect(host.stopConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(host.setTabSessionTodos).toHaveBeenCalledWith('tab-1', [], null);
    expect(host.setTabSessionStatus).toHaveBeenCalledWith('tab-1', null, null);
    expect(host.clearPendingQuestionsForTab).toHaveBeenCalledWith('tab-1');
  });

  it('commits the active conversation sync baseline', () => {
    const conversation = createConversation('baseline');
    const { bridge, host } = createBridge();

    bridge.commitConversationSyncBaseline(conversation.messages);

    expect(host.getConversationSyncFingerprint).toHaveBeenCalledWith(conversation.messages);
    expect(host.setLastConversationSyncFingerprint).toHaveBeenCalledWith('fingerprint');
    expect(host.startConversationSyncLoop).toHaveBeenCalledTimes(1);
  });
});
