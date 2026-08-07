import type { ChatMessage } from '../../../../src/core/types';
import type {
  ConversationHydrationOutcomePort,
} from '../../../../src/features/chat/runtime/ConversationHydrationOutcomeBridge';
import {
  type ConversationLoadRuntimePort,
} from '../../../../src/features/chat/runtime/ConversationLoadRuntimeBridge';
import type {
  ConversationTransitionPort,
  LoadedConversationTransitionContext,
} from '../../../../src/features/chat/runtime/ConversationTransitionBridge';
import type { TabConversationActivationBridge } from '../../../../src/features/chat/runtime/TabConversationActivationBridge';
import {
  TabViewActivationBridge,
  type TabViewActivationBridgeHost,
} from '../../../../src/features/chat/runtime/TabViewActivationBridge';
import type { ActiveTabContextUsageCoordinator } from '../../../../src/features/chat/services/ActiveTabContextUsageCoordinator';
import { ConversationViewStateService } from '../../../../src/features/chat/services/ConversationViewStateService';
import type { QuestionTodoActivationRefreshCoordinator } from '../../../../src/features/chat/services/QuestionTodoActivationRefreshCoordinator';
import type { BackgroundTaskActivationIndicatorPort } from '../../../../src/features/chat/services/QuestionTodoBackgroundTaskActivationHostAdapter';
import { TabManager } from '../../../../src/features/chat/tabs/TabManager';

function createConversation(id: string) {
  return {
    id,
    title: `Chat ${id}`,
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: `${id}-session`,
    messages: [] as ChatMessage[],
  };
}

type ConversationShape = ReturnType<typeof createConversation>;

function createTransitionPort(tabManager: TabManager): jest.Mocked<ConversationTransitionPort> {
  return {
    prepareLoadedConversationTransition: jest.fn().mockResolvedValue(undefined),
    captureLoadedConversationTransition: jest.fn().mockImplementation(
      (): LoadedConversationTransitionContext => {
        const activeTabId = tabManager.getActiveTab()?.id ?? null;
        return {
          activeTabId,
          hydrationRenderContext: {
            activeTabId,
            messagesEl: document.createElement('div'),
            runtime: {
              autoScrollEnabled: false,
              programmaticScrollGuardUntil: 0,
            },
            preserveScrollPosition: true,
            previousScrollTop: 120,
            shouldStickToBottom: false,
          },
        };
      },
    ),
    beginLoadedConversationTransition: jest.fn(),
    restoreLoadedConversationTransition: jest.fn(),
    abortLoadedConversationTransition: jest.fn(),
    endLoadedConversationTransition: jest.fn(),
  };
}

function createActivationBridge() {
  const host: jest.Mocked<TabViewActivationBridgeHost> = {
    setActiveMessagesPane: jest.fn(),
    scheduleComposerLayoutSync: jest.fn(),
    updateModelSelectorDisplay: jest.fn(),
    updateSendButtonState: jest.fn(),
  };
  const refreshCoordinator: jest.Mocked<Pick<
    QuestionTodoActivationRefreshCoordinator,
    'applyActivationPreflight' | 'applyConversationActivation' | 'applyEmptyActivation'
  >> = {
    applyActivationPreflight: jest.fn(),
    applyConversationActivation: jest.fn(),
    applyEmptyActivation: jest.fn(),
  };
  const backgroundTaskCoordinator: jest.Mocked<Pick<
    BackgroundTaskActivationIndicatorPort,
    'renderLoadedConversationIndicator'
  >> = {
    renderLoadedConversationIndicator: jest.fn().mockResolvedValue(undefined),
  };
  const contextUsageCoordinator: jest.Mocked<Pick<
    ActiveTabContextUsageCoordinator,
    'syncIdentity' | 'refreshFromServer'
  >> = {
    syncIdentity: jest.fn(),
    refreshFromServer: jest.fn().mockResolvedValue(undefined),
  };

  return new TabViewActivationBridge({
    host,
    focusContextPreviewCoordinator: {
      refreshActiveFocusContextPreview: jest.fn(),
    },
    questionTodoActivationRefreshCoordinator: refreshCoordinator,
    backgroundTaskActivationIndicatorCoordinator: backgroundTaskCoordinator,
    activeTabContextUsageCoordinator: contextUsageCoordinator,
  });
}

describe('ConversationViewStateService load generation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createFixture() {
    const tabManager = new TabManager('New chat', { getMaxTabs: () => 4 });
    const conversationA = createConversation('conv-a');
    const conversationB = createConversation('conv-b');
    const tabA = tabManager.createTab(conversationA)!;
    const tabB = tabManager.createTab(conversationB)!;

    const tabConversationActivationBridge: jest.Mocked<Pick<
      TabConversationActivationBridge,
      'applyEmptyTabActivation' | 'applyLoadedConversationActivation' | 'applyStreamingConversationActivation'
    >> = {
      applyEmptyTabActivation: jest.fn(),
      applyLoadedConversationActivation: jest.fn(),
      applyStreamingConversationActivation: jest.fn(),
    };
    const tabViewActivationBridge = createActivationBridge();
    const conversationHydrationOutcomeBridge: jest.Mocked<ConversationHydrationOutcomePort> = {
      applyLoadedConversationOutcome: jest.fn().mockResolvedValue(undefined),
    };
    const conversationTransitionBridge = createTransitionPort(tabManager);
    const conversationLoadRuntimeBridge = {
      resolveConversation: jest.fn().mockImplementation((id: string) =>
        Promise.resolve(id === 'conv-a' ? conversationA : conversationB)),
      loadConversationMessages: jest.fn().mockImplementation(
        (conversation: ConversationShape) => Promise.resolve(conversation.messages),
      ),
    } as unknown as jest.Mocked<ConversationLoadRuntimePort>;

    const service = new ConversationViewStateService({
      host: { getTabManager: jest.fn().mockReturnValue(tabManager) },
      tabConversationActivationBridge,
      tabViewActivationBridge,
      conversationHydrationOutcomeBridge,
      conversationTransitionBridge,
      conversationLoadRuntimeBridge,
    });

    return {
      service,
      tabManager,
      tabA,
      tabB,
      conversationA,
      conversationB,
      tabConversationActivationBridge,
      tabViewActivationBridge,
      conversationHydrationOutcomeBridge,
      conversationTransitionBridge,
      conversationLoadRuntimeBridge,
    };
  }

  async function waitForMockCall(mock: jest.Mock): Promise<void> {
    for (let attempt = 0; attempt < 50 && mock.mock.calls.length === 0; attempt += 1) {
      await Promise.resolve();
    }
    if (mock.mock.calls.length === 0) {
      throw new Error('Timed out waiting for mock call');
    }
  }

  it('abandons a stale load when the active tab switches mid-load (A→B)', async () => {
    const fixture = createFixture();
    const {
      service,
      tabManager,
      tabA,
      tabB,
      conversationA,
      conversationB,
      conversationHydrationOutcomeBridge,
      conversationTransitionBridge,
      conversationLoadRuntimeBridge,
      tabViewActivationBridge,
    } = fixture;
    const hydrationTailSpy = jest.spyOn(tabViewActivationBridge, 'applyLoadedConversationHydrationTail');

    let resolveMessagesA: (messages: ChatMessage[]) => void = () => undefined;
    const messagesAGate = new Promise<ChatMessage[]>((resolve) => {
      resolveMessagesA = resolve;
    });
    conversationLoadRuntimeBridge.loadConversationMessages.mockImplementation(
      (conversation: ConversationShape) => (
        conversation.id === 'conv-a' ? messagesAGate : Promise.resolve(conversation.messages)
      ) as Promise<ChatMessage[]>,
    );

    tabManager.switchToTab(tabA.id);
    const loadA = service.loadConversation('conv-a');
    await waitForMockCall(conversationLoadRuntimeBridge.loadConversationMessages as jest.Mock);

    tabManager.switchToTab(tabB.id);
    await service.loadConversation('conv-b');

    resolveMessagesA(conversationA.messages);
    await loadA;

    expect(conversationHydrationOutcomeBridge.applyLoadedConversationOutcome).toHaveBeenCalledTimes(1);
    expect(conversationHydrationOutcomeBridge.applyLoadedConversationOutcome).toHaveBeenCalledWith(
      tabB.id,
      conversationB,
      conversationB.messages,
      expect.objectContaining({ shouldContinueRender: expect.any(Function) }),
    );
    expect(conversationTransitionBridge.restoreLoadedConversationTransition).toHaveBeenCalledTimes(1);
    expect(hydrationTailSpy).toHaveBeenCalledTimes(1);
    expect(conversationTransitionBridge.abortLoadedConversationTransition).toHaveBeenCalledTimes(1);
    expect(conversationTransitionBridge.beginLoadedConversationTransition).toHaveBeenCalledTimes(2);
    expect(conversationTransitionBridge.endLoadedConversationTransition).toHaveBeenCalledTimes(2);
  });

  it('supersedes an earlier load for the same tab after A→B→A', async () => {
    const fixture = createFixture();
    const {
      service,
      tabManager,
      tabA,
      tabB,
      conversationA,
      conversationHydrationOutcomeBridge,
      conversationTransitionBridge,
      conversationLoadRuntimeBridge,
    } = fixture;

    let resolveMessagesA1: (messages: ChatMessage[]) => void = () => undefined;
    const messagesA1Gate = new Promise<ChatMessage[]>((resolve) => {
      resolveMessagesA1 = resolve;
    });
    let firstALoadMessagesPending = true;
    conversationLoadRuntimeBridge.loadConversationMessages.mockImplementation(
      (conversation: ConversationShape) => {
        if (conversation.id === 'conv-a' && firstALoadMessagesPending) {
          return messagesA1Gate as Promise<ChatMessage[]>;
        }
        return Promise.resolve(conversation.messages);
      },
    );

    tabManager.switchToTab(tabA.id);
    const loadA1 = service.loadConversation('conv-a');
    await waitForMockCall(conversationLoadRuntimeBridge.loadConversationMessages as jest.Mock);

    firstALoadMessagesPending = false;
    tabManager.switchToTab(tabB.id);
    await service.loadConversation('conv-b');

    tabManager.switchToTab(tabA.id);
    await service.loadConversation('conv-a');

    resolveMessagesA1(conversationA.messages);
    await loadA1;

    const outcomeCalls = conversationHydrationOutcomeBridge.applyLoadedConversationOutcome.mock.calls;
    const outcomeForA = outcomeCalls.filter((call) => call[1].id === 'conv-a');
    const outcomeForB = outcomeCalls.filter((call) => call[1].id === 'conv-b');
    expect(outcomeForA).toHaveLength(1);
    expect(outcomeForB).toHaveLength(1);
    expect(conversationTransitionBridge.abortLoadedConversationTransition).toHaveBeenCalledTimes(1);
    expect(conversationTransitionBridge.endLoadedConversationTransition).toHaveBeenCalledTimes(3);
  });
});
