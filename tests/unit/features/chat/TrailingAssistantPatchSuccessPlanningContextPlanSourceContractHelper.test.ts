import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchSuccessPlanningContextPlanSourceContract } from '../../../../src/features/chat/services/TrailingAssistantPatchSuccessPlanningContextPlanSourceContractHelper';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchSuccessPlanningContextPlanSourceContractHelper', () => {
  it('preserves planning context and adapts host callback ports', () => {
    const previousTailMessage = createMessage({ id: 'assistant-1', content: 'Before' });
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const messageEl = document.createElement('article');
    const contentEl = document.createElement('div');
    const parentEl = document.createElement('section');
    const restoreTurnBodyEl = document.createElement('article');
    const runtime = {
      currentTurnBodyEl: restoreTurnBodyEl,
    };
    const getBodySignature = jest
      .fn<string, [ChatMessage]>()
      .mockImplementation((message) => `${message.id}:${message.content}`);
    const summarizeChatMessageForDebug = jest.fn(
      (message: ChatMessage | null | undefined) =>
        message
          ? {
            id: message.id,
          }
          : null,
    );

    const sourceContract =
      buildTrailingAssistantPatchSuccessPlanningContextPlanSourceContract({
        planningContext: {
          previousTailMessage,
          nextTailMessage,
          patchTarget: {
            messageEl,
            contentEl,
          },
          parentEl,
          runtime,
          shouldStickToBottom: true,
        },
        assistantTailRender: {
          getBodySignature,
        },
        summarizeChatMessageForDebug,
      });

    expect(sourceContract.previousTailMessage).toBe(previousTailMessage);
    expect(sourceContract.nextTailMessage).toBe(nextTailMessage);
    expect(sourceContract.patchTarget).toEqual({
      messageEl,
      contentEl,
    });
    expect(sourceContract.parentEl).toBe(parentEl);
    expect(sourceContract.runtime).toBe(runtime);
    expect(sourceContract.shouldStickToBottom).toBe(true);
    expect(sourceContract.summarizeChatMessageForDebug).toBe(summarizeChatMessageForDebug);
    expect(sourceContract.getBodySignature(previousTailMessage)).toBe('assistant-1:Before');
    expect(sourceContract.getBodySignature(nextTailMessage)).toBe('assistant-2:After');
    expect(getBodySignature).toHaveBeenNthCalledWith(1, previousTailMessage);
    expect(getBodySignature).toHaveBeenNthCalledWith(2, nextTailMessage);
  });
});
