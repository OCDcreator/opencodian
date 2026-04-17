import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchSuccessPlanFromPlanningContext } from '../../../../src/features/chat/services/trailingAssistantPatchExecution';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Stable answer',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchSuccessPlanningContextPlanHelper', () => {
  it('builds a success plan from the full planning context and host ports', () => {
    const previousTailMessage = createMessage({ id: 'assistant-1' });
    const nextTailMessage = createMessage({
      id: 'assistant-2',
      sourceMessageId: 'source-2',
      timestamp: 2,
    });
    const messageEl = document.createElement('article');
    const contentEl = document.createElement('div');
    const parentEl = document.createElement('section');
    const restoreTurnBodyEl = document.createElement('article');
    const runtime = {
      currentTurnBodyEl: restoreTurnBodyEl,
    };
    const getBodySignature = jest.fn((message: ChatMessage) => message.content);
    const summarizeChatMessageForDebug = jest.fn(
      (message: ChatMessage | null | undefined) =>
        message
          ? {
            id: message.id,
          }
          : null,
    );

    expect(
      buildTrailingAssistantPatchSuccessPlanFromPlanningContext({
        previousTailMessage,
        nextTailMessage,
        patchTarget: {
          messageEl,
          contentEl,
        },
        parentEl,
        runtime,
        shouldStickToBottom: true,
        getBodySignature,
        summarizeChatMessageForDebug,
      }),
    ).toEqual({
      executionPlan: {
        kind: 'finalize-footer',
        messageEl,
        nextTailMessage,
      },
      tailStatePlan: {
        messageEl,
        messageId: 'assistant-2',
        sourceMessageId: 'source-2',
        shouldStickToBottom: true,
      },
      completionDebugPlan: {
        shouldStickToBottom: true,
        previousTail: {
          id: 'assistant-1',
        },
        nextTail: {
          id: 'assistant-2',
        },
      },
      turnBodyScopePlan: {
        runtime,
        scopedTurnBodyEl: parentEl,
        restoreTurnBodyEl,
      },
    });

    expect(getBodySignature).toHaveBeenNthCalledWith(1, previousTailMessage);
    expect(getBodySignature).toHaveBeenNthCalledWith(2, nextTailMessage);
    expect(summarizeChatMessageForDebug).toHaveBeenNthCalledWith(1, previousTailMessage);
    expect(summarizeChatMessageForDebug).toHaveBeenNthCalledWith(2, nextTailMessage);
  });
});
