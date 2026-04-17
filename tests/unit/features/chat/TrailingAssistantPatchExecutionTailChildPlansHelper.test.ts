import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchExecutionTailPlanPartsFromExecutionTailPlanningContext } from '../../../../src/features/chat/services/trailingAssistantPatchExecution';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchExecutionTailChildPlansHelper', () => {
  it('builds finalize-footer execution/tail child plans when body signatures match', () => {
    const previousTailMessage = createMessage({ id: 'assistant-1', content: 'Stable answer' });
    const nextTailMessage = createMessage({
      id: 'assistant-2',
      content: 'Stable answer',
      sourceMessageId: 'source-2',
    });
    const messageEl = document.createElement('article');
    const contentEl = document.createElement('div');
    const summarizedMessages: Array<string | null | undefined> = [];

    expect(
      buildTrailingAssistantPatchExecutionTailPlanPartsFromExecutionTailPlanningContext({
        planningContext: {
          previousTailMessage,
          nextTailMessage,
          patchTarget: {
            messageEl,
            contentEl,
          },
          shouldStickToBottom: true,
        },
        getBodySignature: (message) => `${message.role}:${message.content}`,
        summarizeChatMessageForDebug: (message) => {
          summarizedMessages.push(message?.id);
          return message
            ? {
              id: message.id,
              content: message.content,
            }
            : null;
        },
      }),
    ).toEqual({
      executionPlan: {
        kind: 'finalize-footer',
        messageEl,
        nextTailMessage,
      },
      tailOutcomePlans: {
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
            content: 'Stable answer',
          },
          nextTail: {
            id: 'assistant-2',
            content: 'Stable answer',
          },
        },
      },
    });

    expect(summarizedMessages).toEqual(['assistant-1', 'assistant-2']);
  });

  it('builds a rerender execution plan when the body signature changes', () => {
    const nextTailMessage = createMessage({
      id: 'assistant-2',
      content: 'After',
      sourceMessageId: 'source-2',
    });
    const messageEl = document.createElement('article');
    const contentEl = document.createElement('div');

    expect(
      buildTrailingAssistantPatchExecutionTailPlanPartsFromExecutionTailPlanningContext({
        planningContext: {
          previousTailMessage: createMessage({ id: 'assistant-1', content: 'Before' }),
          nextTailMessage,
          patchTarget: {
            messageEl,
            contentEl,
          },
          shouldStickToBottom: false,
        },
        getBodySignature: (message) => `${message.role}:${message.content}`,
        summarizeChatMessageForDebug: (message) =>
          message
            ? {
              id: message.id,
            }
            : null,
      }),
    ).toEqual({
      executionPlan: {
        kind: 'rerender-content',
        messageEl,
        contentEl,
        nextTailMessage,
      },
      tailOutcomePlans: {
        tailStatePlan: {
          messageEl,
          messageId: 'assistant-2',
          sourceMessageId: 'source-2',
          shouldStickToBottom: false,
        },
        completionDebugPlan: {
          shouldStickToBottom: false,
          previousTail: {
            id: 'assistant-1',
          },
          nextTail: {
            id: 'assistant-2',
          },
        },
      },
    });
  });
});
