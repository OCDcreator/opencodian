import type { ChatMessage } from '../../../../src/core/types';
import { buildTrailingAssistantPatchFooterFinalizationDecisionSourceContract } from '../../../../src/features/chat/services/TrailingAssistantPatchFooterFinalizationDecisionSourceContractHelper';

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 1,
    ...overrides,
  };
}

describe('TrailingAssistantPatchFooterFinalizationDecisionSourceContractHelper', () => {
  it('reads previous and next tail body signatures from execution-tail context', () => {
    const previousTailMessage = createMessage({ id: 'assistant-1', content: 'Before' });
    const nextTailMessage = createMessage({ id: 'assistant-2', content: 'After' });
    const getBodySignature = jest
      .fn<string, [ChatMessage]>()
      .mockImplementation((message) => `${message.id}:${message.content}`);

    expect(
      buildTrailingAssistantPatchFooterFinalizationDecisionSourceContract({
        planningContext: {
          previousTailMessage,
          nextTailMessage,
          patchTarget: {
            messageEl: document.createElement('article'),
            contentEl: document.createElement('div'),
          },
          shouldStickToBottom: true,
        },
        getBodySignature,
      }),
    ).toEqual({
      previousBodySignature: 'assistant-1:Before',
      nextBodySignature: 'assistant-2:After',
    });

    expect(getBodySignature).toHaveBeenNthCalledWith(1, previousTailMessage);
    expect(getBodySignature).toHaveBeenNthCalledWith(2, nextTailMessage);
  });
});
