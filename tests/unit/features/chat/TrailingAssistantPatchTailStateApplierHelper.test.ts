import {
  applyTrailingAssistantPatchTailState,
  type TrailingAssistantPatchTailStatePlan,
} from '../../../../src/features/chat/services/TrailingAssistantPatchTailStateApplierHelper';

function createTailStatePlan(
  overrides: Partial<TrailingAssistantPatchTailStatePlan> = {},
): TrailingAssistantPatchTailStatePlan {
  const messageEl = document.createElement('div');
  messageEl.dataset.messageId = 'assistant-1';
  messageEl.dataset.sourceMessageId = 'source-1';
  messageEl.style.animation = 'fade-in 1s';

  return {
    messageEl,
    messageId: 'assistant-2',
    sourceMessageId: null,
    shouldStickToBottom: true,
    ...overrides,
  };
}

describe('TrailingAssistantPatchTailStateApplierHelper', () => {
  it('applies the tail dataset and animation reset', () => {
    const scrollToBottom = jest.fn();
    const tailStatePlan = createTailStatePlan({
      sourceMessageId: 'source-2',
      shouldStickToBottom: false,
    });

    applyTrailingAssistantPatchTailState(tailStatePlan, 'tab-1', {
      scrollToBottom,
    });

    expect(tailStatePlan.messageEl.dataset.messageId).toBe('assistant-2');
    expect(tailStatePlan.messageEl.dataset.sourceMessageId).toBe('source-2');
    expect(tailStatePlan.messageEl.style.animation).toBe('none');
    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('clears the source dataset and scrolls when the plan sticks to bottom', () => {
    const scrollToBottom = jest.fn();
    const tailStatePlan = createTailStatePlan();

    applyTrailingAssistantPatchTailState(tailStatePlan, 'tab-2', {
      scrollToBottom,
    });

    expect(tailStatePlan.messageEl.dataset.messageId).toBe('assistant-2');
    expect(tailStatePlan.messageEl.dataset.sourceMessageId).toBeUndefined();
    expect(tailStatePlan.messageEl.style.animation).toBe('none');
    expect(scrollToBottom).toHaveBeenCalledWith({ tabId: 'tab-2' });
  });
});
