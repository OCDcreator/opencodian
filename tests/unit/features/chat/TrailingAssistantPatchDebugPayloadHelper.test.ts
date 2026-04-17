import type { ChatMessage } from '../../../../src/core/types';
import {
  buildTrailingAssistantPatchCompletionDebugPayloadInputs,
  buildTrailingAssistantPatchCompletionDebugPayloadPlan,
  buildTrailingAssistantPatchSkippedDebugPayloadInputs,
  buildTrailingAssistantPatchSkippedDebugPayloadPlan,
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

describe('TrailingAssistantPatchDebugPayloadHelper', () => {
  it('builds completion debug payload plans from completion summaries', () => {
    const payloadInputs = buildTrailingAssistantPatchCompletionDebugPayloadInputs({
      shouldStickToBottom: true,
      previousTail: { id: 'assistant-1' },
      nextTail: { id: 'assistant-2' },
    });

    expect(
      buildTrailingAssistantPatchCompletionDebugPayloadPlan(payloadInputs),
    ).toEqual({
      shouldStickToBottom: true,
      previousTail: { id: 'assistant-1' },
      nextTail: { id: 'assistant-2' },
    });
  });

  it('builds skipped debug payload plans with rendered counts before payload fields', () => {
    const payloadInputs = buildTrailingAssistantPatchSkippedDebugPayloadInputs({
      reason: 'tail-message-not-mergeable-assistant',
      payload: {
        previousTail: { id: 'assistant-1' },
        nextTail: { id: 'user-2' },
      },
      previousMessages: [
        createMessage({ id: 'assistant-1', content: 'Stable answer', timestamp: 1 }),
        createMessage({ id: 'filtered-1', content: 'Filtered previous', timestamp: 2 }),
      ],
      nextMessages: [
        createMessage({ id: 'user-2', role: 'user', content: 'Follow-up', timestamp: 3 }),
        createMessage({ id: 'filtered-2', content: 'Filtered next', timestamp: 4 }),
      ],
      getMessagesForRender: (messages) =>
        messages.filter((message) => !message.id.startsWith('filtered-')),
    });

    expect(
      buildTrailingAssistantPatchSkippedDebugPayloadPlan(payloadInputs),
    ).toEqual({
      reason: 'tail-message-not-mergeable-assistant',
      previousRenderedCount: 1,
      nextRenderedCount: 1,
      previousTail: { id: 'assistant-1' },
      nextTail: { id: 'user-2' },
    });
  });
});
