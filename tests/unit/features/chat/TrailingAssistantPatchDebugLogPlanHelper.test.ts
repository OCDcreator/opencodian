import type { ChatMessage } from '../../../../src/core/types';
import {
  buildTrailingAssistantPatchCompletionDebugLoggingContext,
  buildTrailingAssistantPatchSkippedDebugLoggingContext,
  buildTrailingAssistantPatchSkippedDebugPlanningContext,
} from '../../../../src/features/chat/services/trailingAssistantPatchDebug';
import {
  buildTrailingAssistantPatchCompletionDebugLogPlan,
  buildTrailingAssistantPatchSkippedDebugLogPlan,
} from '../../../../src/features/chat/services/trailingAssistantPatchDebug';

function createMessage(
  overrides: Partial<ChatMessage> & Pick<ChatMessage, 'id'>,
): ChatMessage {
  return {
    id: overrides.id,
    role: overrides.role ?? 'assistant',
    content: overrides.content ?? '',
    timestamp: overrides.timestamp ?? 0,
    ...overrides,
  };
}

describe('TrailingAssistantPatchDebugLogPlanHelper', () => {
  it('builds completion debug log plans from logging contexts', () => {
    const loggingContext = buildTrailingAssistantPatchCompletionDebugLoggingContext(
      {
        shouldStickToBottom: true,
        previousTail: { id: 'assistant-1' },
        nextTail: { id: 'assistant-2' },
      },
      'tab-1',
    );

    expect(
      buildTrailingAssistantPatchCompletionDebugLogPlan(loggingContext),
    ).toEqual({
      label: 'patch-trailing-assistant-render-complete',
      payload: {
        tabId: 'tab-1',
        shouldStickToBottom: true,
        previousTail: { id: 'assistant-1' },
        nextTail: { id: 'assistant-2' },
      },
    });
  });

  it('builds skipped debug log plans from logging contexts and render filters', () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Prev answer', timestamp: 1 }),
      createMessage({ id: 'filtered-assistant-1', content: 'Filtered prev', timestamp: 2 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'Next answer', timestamp: 3 }),
      createMessage({ id: 'filtered-assistant-2', content: 'Filtered next', timestamp: 4 }),
    ];
    const loggingContext = buildTrailingAssistantPatchSkippedDebugLoggingContext(
      buildTrailingAssistantPatchSkippedDebugPlanningContext(
        previousMessages,
        nextMessages,
        'tab-2',
      ),
      'rendered-message-count-mismatch',
      { mismatchIndex: 0 },
    );
    const getMessagesForRender = jest
      .fn()
      .mockImplementation((messages: ChatMessage[]) =>
        messages.filter((message) => !message.id.startsWith('filtered-')),
      );

    expect(
      buildTrailingAssistantPatchSkippedDebugLogPlan(
        loggingContext,
        getMessagesForRender,
      ),
    ).toEqual({
      label: 'patch-trailing-assistant-render-skipped',
      payload: {
        reason: 'rendered-message-count-mismatch',
        tabId: 'tab-2',
        previousRenderedCount: 1,
        nextRenderedCount: 1,
        mismatchIndex: 0,
      },
    });
    expect(getMessagesForRender).toHaveBeenNthCalledWith(1, previousMessages);
    expect(getMessagesForRender).toHaveBeenNthCalledWith(2, nextMessages);
  });
});
