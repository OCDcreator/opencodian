import type { Conversation } from '../../../../src/core/types';
import {
  BackgroundTaskActivationIndicatorCoordinator,
  type BackgroundTaskActivationIndicatorCoordinatorHost,
} from '../../../../src/features/chat/services/BackgroundTaskActivationIndicatorCoordinator';

function createConversation(id = 'conversation-1'): Conversation {
  return {
    id,
    title: `Chat ${id}`,
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: `${id}-session`,
    messages: [],
  };
}

function createHost(
  callOrder: string[],
  currentConversationId: string | null = 'previous-conversation',
): jest.Mocked<BackgroundTaskActivationIndicatorCoordinatorHost> {
  return {
    getCurrentConversationId: jest.fn().mockReturnValue(currentConversationId),
    resetBackgroundTaskIndicator: jest.fn(() => {
      callOrder.push('reset');
    }),
    syncBackgroundTaskStateFromConversation: jest.fn(() => {
      callOrder.push('sync');
    }),
    renderBackgroundTaskIndicatorIfNeeded: jest.fn(() => {
      callOrder.push('render');
      return Promise.resolve(undefined);
    }),
  };
}

describe('BackgroundTaskActivationIndicatorCoordinator', () => {
  it('resets the indicator before opening a different conversation', () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder, 'previous-conversation');
    const coordinator = new BackgroundTaskActivationIndicatorCoordinator(host);
    const conversation = createConversation('next-conversation');

    coordinator.prepareOpenConversation(conversation);

    expect(host.getCurrentConversationId).toHaveBeenCalledTimes(1);
    expect(host.resetBackgroundTaskIndicator).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['reset']);
  });

  it('keeps the indicator when opening the current conversation again', () => {
    const callOrder: string[] = [];
    const conversation = createConversation('same-conversation');
    const host = createHost(callOrder, conversation.id);
    const coordinator = new BackgroundTaskActivationIndicatorCoordinator(host);

    coordinator.prepareOpenConversation(conversation);

    expect(host.resetBackgroundTaskIndicator).not.toHaveBeenCalled();
    expect(callOrder).toEqual([]);
  });

  it('syncs open-conversation background-task runtime state', () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const coordinator = new BackgroundTaskActivationIndicatorCoordinator(host);
    const conversation = createConversation('next-conversation');

    coordinator.syncOpenConversationState(conversation, 'tab-1');

    expect(host.syncBackgroundTaskStateFromConversation).toHaveBeenCalledWith(
      conversation,
      'tab-1',
    );
    expect(callOrder).toEqual(['sync']);
  });

  it('renders open-conversation indicators without awaiting callers', () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const coordinator = new BackgroundTaskActivationIndicatorCoordinator(host);

    coordinator.renderOpenConversationIndicator('tab-1');

    expect(host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-1');
    expect(callOrder).toEqual(['render']);
  });

  it('awaits loaded-conversation indicator rendering', async () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const coordinator = new BackgroundTaskActivationIndicatorCoordinator(host);

    await coordinator.renderLoadedConversationIndicator('tab-1');

    expect(host.renderBackgroundTaskIndicatorIfNeeded).toHaveBeenCalledWith('tab-1');
    expect(callOrder).toEqual(['render']);
  });
});
