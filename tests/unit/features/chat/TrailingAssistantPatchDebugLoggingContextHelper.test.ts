import type { ChatMessage } from '../../../../src/core/types';
import {
  buildTrailingAssistantPatchCompletionDebugLoggingContext,
  buildTrailingAssistantPatchSkippedDebugLoggingContext,
  buildTrailingAssistantPatchSkippedDebugPlanningContext,
} from '../../../../src/features/chat/services/TrailingAssistantPatchDebugLoggingContextHelper';

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

describe('TrailingAssistantPatchDebugLoggingContextHelper', () => {
  it('builds completion debug logging contexts from summarized tail plans', () => {
    expect(
      buildTrailingAssistantPatchCompletionDebugLoggingContext(
        {
          shouldStickToBottom: true,
          previousTail: { id: 'assistant-1' },
          nextTail: { id: 'assistant-2' },
        },
        'tab-1',
      ),
    ).toEqual({
      completionDebugPlan: {
        shouldStickToBottom: true,
        previousTail: { id: 'assistant-1' },
        nextTail: { id: 'assistant-2' },
      },
      tabId: 'tab-1',
    });
  });

  it('builds skipped debug logging contexts from reusable planning context', () => {
    const planningContext = buildTrailingAssistantPatchSkippedDebugPlanningContext(
      [createMessage({ id: 'assistant-1', content: 'Prev answer', timestamp: 1 })],
      [createMessage({ id: 'assistant-2', content: 'Next answer', timestamp: 2 })],
      'tab-2',
    );

    expect(
      buildTrailingAssistantPatchSkippedDebugLoggingContext(
        planningContext,
        'missing-container-or-inactive-tab',
        { activeTabId: 'tab-3' },
      ),
    ).toEqual({
      planningContext,
      reason: 'missing-container-or-inactive-tab',
      payload: { activeTabId: 'tab-3' },
    });
  });
});
