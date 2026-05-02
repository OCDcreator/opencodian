import type { ChatMessage } from '../../../../src/core/types';
import {
  emitTrailingAssistantPatchCompletionDebugLog,
  emitTrailingAssistantPatchSkippedDebugLog,
  logAssistantFinalizationDebug,
  shouldLogAssistantFinalizationDebug,
} from '../../../../src/features/chat/services/trailingAssistantPatchDebug';
import {
  buildTrailingAssistantPatchCompletionDebugLoggingContext,
  buildTrailingAssistantPatchSkippedDebugLoggingContext,
  buildTrailingAssistantPatchSkippedDebugPlanningContext,
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

describe('TrailingAssistantPatchDebugLogEmitterHelper', () => {
  it('emits completion debug log plans through the finalization logger', () => {
    const logAssistantFinalizationDebug = jest.fn();

    emitTrailingAssistantPatchCompletionDebugLog(
      buildTrailingAssistantPatchCompletionDebugLoggingContext(
        {
          shouldStickToBottom: true,
          previousTail: { id: 'assistant-1' },
          nextTail: { id: 'assistant-2' },
        },
        'tab-1',
      ),
      {
        logAssistantFinalizationDebug,
      },
    );

    expect(logAssistantFinalizationDebug).toHaveBeenCalledTimes(1);
    expect(logAssistantFinalizationDebug).toHaveBeenCalledWith(
      'patch-trailing-assistant-render-complete',
      {
        tabId: 'tab-1',
        shouldStickToBottom: true,
        previousTail: { id: 'assistant-1' },
        nextTail: { id: 'assistant-2' },
      },
    );
  });

  it('emits skipped debug log plans through the finalization logger', () => {
    const previousMessages = [
      createMessage({ id: 'assistant-1', content: 'Prev answer', timestamp: 1 }),
      createMessage({ id: 'filtered-assistant-1', content: 'Filtered prev', timestamp: 2 }),
    ];
    const nextMessages = [
      createMessage({ id: 'assistant-2', content: 'Next answer', timestamp: 3 }),
      createMessage({ id: 'filtered-assistant-2', content: 'Filtered next', timestamp: 4 }),
    ];
    const getMessagesForRender = jest
      .fn()
      .mockImplementation((messages: ChatMessage[]) =>
        messages.filter((message) => !message.id.startsWith('filtered-')),
      );
    const logAssistantFinalizationDebug = jest.fn();

    emitTrailingAssistantPatchSkippedDebugLog(
      buildTrailingAssistantPatchSkippedDebugLoggingContext(
        buildTrailingAssistantPatchSkippedDebugPlanningContext(
          previousMessages,
          nextMessages,
          'tab-2',
        ),
        'rendered-message-count-mismatch',
        { mismatchIndex: 0 },
      ),
      {
        getMessagesForRender,
        logAssistantFinalizationDebug,
      },
    );

    expect(getMessagesForRender).toHaveBeenNthCalledWith(1, previousMessages);
    expect(getMessagesForRender).toHaveBeenNthCalledWith(2, nextMessages);
    expect(logAssistantFinalizationDebug).toHaveBeenCalledTimes(1);
    expect(logAssistantFinalizationDebug).toHaveBeenCalledWith(
      'patch-trailing-assistant-render-skipped',
      {
        tabId: 'tab-2',
        reason: 'rendered-message-count-mismatch',
        previousRenderedCount: 1,
        nextRenderedCount: 1,
        mismatchIndex: 0,
      },
    );
  });
});

describe('shouldLogAssistantFinalizationDebug', () => {
  it('returns true for allowlisted labels', () => {
    expect(shouldLogAssistantFinalizationDebug('stream-visibility-changed')).toBe(true);
    expect(shouldLogAssistantFinalizationDebug('rerender-conversation-messages-start')).toBe(true);
    expect(shouldLogAssistantFinalizationDebug('server-sync-complete')).toBe(true);
    expect(shouldLogAssistantFinalizationDebug('patch-trailing-assistant-render-complete')).toBe(true);
  });

  it('returns false for non-allowlisted labels', () => {
    expect(shouldLogAssistantFinalizationDebug('unknown-label')).toBe(false);
    expect(shouldLogAssistantFinalizationDebug('')).toBe(false);
    expect(shouldLogAssistantFinalizationDebug('STREAM-VISIBILITY-CHANGED')).toBe(false);
  });
});

describe('logAssistantFinalizationDebug', () => {
  it('does not throw for allowlisted labels', () => {
    expect(() => {
      logAssistantFinalizationDebug('stream-visibility-changed', { visible: true });
    }).not.toThrow();
  });

  it('does not throw for non-allowlisted labels', () => {
    expect(() => {
      logAssistantFinalizationDebug('unknown-label', { data: 42 });
    }).not.toThrow();
  });

  it('handles unserializable payloads gracefully', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => {
      logAssistantFinalizationDebug('stream-visibility-changed', circular);
    }).not.toThrow();
  });
});
