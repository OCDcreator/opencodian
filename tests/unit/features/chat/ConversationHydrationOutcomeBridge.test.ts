import type {
  ChatMessage,
  Conversation,
} from '../../../../src/core/types';
import {
  ConversationHydrationOutcomeBridge,
  type ConversationHydrationOutcomeBridgeHost,
} from '../../../../src/features/chat/runtime/ConversationHydrationOutcomeBridge';
import type { TabConversationStateBridge } from '../../../../src/features/chat/runtime/TabConversationStateBridge';
import type { TabViewActivationBridge } from '../../../../src/features/chat/runtime/TabViewActivationBridge';

type TabConversationStatePort = Pick<
  TabConversationStateBridge,
  'commitConversationSyncBaseline'
>;

type TabViewActivationPort = Pick<
  TabViewActivationBridge,
  'applyLoadedConversationPostRenderOutcome'
>;

function createConversation(id: string): Conversation {
  return {
    id,
    title: `Chat ${id}`,
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: `${id}-session`,
    messages: [],
  };
}

function createClaudeConversation(id: string): Conversation {
  return {
    id,
    title: `Claude ${id}`,
    createdAt: 1,
    updatedAt: 1,
    backend: 'claude-code',
    backendSessionId: `${id}-claude-session`,
    messages: [],
  };
}

function createMessages(): ChatMessage[] {
  return [
    {
      id: 'message-1',
      role: 'assistant',
      content: 'loaded message',
      createdAt: 1,
    } as ChatMessage,
  ];
}

function createHost(
  callOrder: string[],
): jest.Mocked<ConversationHydrationOutcomeBridgeHost> {
  return {
    syncBackgroundTaskStateFromConversation: jest.fn(() => {
      callOrder.push('syncBackgroundTaskStateFromConversation');
    }),
    reapplyConversationSessionVisualState: jest.fn(() => {
      callOrder.push('reapplyConversationSessionVisualState');
    }),
    renderMessages: jest.fn(async () => {
      callOrder.push('renderMessages');
    }),
  };
}

function createTabConversationStateBridge(
  callOrder: string[],
): jest.Mocked<TabConversationStatePort> {
  return {
    commitConversationSyncBaseline: jest.fn(() => {
      callOrder.push('commitConversationSyncBaseline');
    }),
  };
}

function createTabViewActivationBridge(
  callOrder: string[],
): jest.Mocked<TabViewActivationPort> {
  return {
    applyLoadedConversationPostRenderOutcome: jest.fn(async () => {
      callOrder.push('applyLoadedConversationPostRenderOutcome');
    }),
  };
}

describe('ConversationHydrationOutcomeBridge', () => {
  it('applies loaded-conversation hydration outcome in bridge order', async () => {
    const callOrder: string[] = [];
    const conversation = createConversation('loaded-conversation');
    const messages = createMessages();
    const host = createHost(callOrder);
    const tabConversationStateBridge = createTabConversationStateBridge(callOrder);
    const tabViewActivationBridge = createTabViewActivationBridge(callOrder);
    const bridge = new ConversationHydrationOutcomeBridge(
      host,
      tabConversationStateBridge,
      tabViewActivationBridge,
    );

    await bridge.applyLoadedConversationOutcome('tab-1', conversation, messages);

    expect(host.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(conversation);
    expect(host.reapplyConversationSessionVisualState).toHaveBeenCalledWith(conversation);
    expect(host.renderMessages).toHaveBeenCalledWith(messages);
    expect(tabViewActivationBridge.applyLoadedConversationPostRenderOutcome).toHaveBeenCalledWith(
      'tab-1',
      conversation.openCodeSessionId,
    );
    expect(tabConversationStateBridge.commitConversationSyncBaseline).toHaveBeenCalledWith(messages);
    expect(callOrder).toEqual([
      'syncBackgroundTaskStateFromConversation',
      'reapplyConversationSessionVisualState',
      'renderMessages',
      'applyLoadedConversationPostRenderOutcome',
      'commitConversationSyncBaseline',
    ]);
  });

  it('skips OpenCode activation refresh when hydrating a Claude Code conversation', async () => {
    const callOrder: string[] = [];
    const conversation = createClaudeConversation('loaded-claude-conversation');
    const messages = createMessages();
    const host = createHost(callOrder);
    const tabConversationStateBridge = createTabConversationStateBridge(callOrder);
    const tabViewActivationBridge = createTabViewActivationBridge(callOrder);
    const bridge = new ConversationHydrationOutcomeBridge(
      host,
      tabConversationStateBridge,
      tabViewActivationBridge,
    );

    await bridge.applyLoadedConversationOutcome('tab-1', conversation, messages);

    expect(tabViewActivationBridge.applyLoadedConversationPostRenderOutcome).toHaveBeenCalledWith(
      'tab-1',
      null,
    );
    expect(tabConversationStateBridge.commitConversationSyncBaseline).toHaveBeenCalledWith(messages);
  });
});
