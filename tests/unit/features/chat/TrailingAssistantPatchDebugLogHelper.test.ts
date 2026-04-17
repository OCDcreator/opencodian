import { buildTrailingAssistantPatchDebugFinalLogPlanFromTabId } from '../../../../src/features/chat/services/trailingAssistantPatchDebug';

describe('TrailingAssistantPatchDebugLogHelper', () => {
  it('builds completion debug final logs from tab id and payload plan', () => {
    expect(
      buildTrailingAssistantPatchDebugFinalLogPlanFromTabId(
        'patch-trailing-assistant-render-complete',
        'tab-1',
        {
          shouldStickToBottom: true,
          previousTail: { id: 'assistant-1' },
          nextTail: { id: 'assistant-2' },
        },
      ),
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

  it('builds skipped debug final logs without altering payload fields', () => {
    expect(
      buildTrailingAssistantPatchDebugFinalLogPlanFromTabId(
        'patch-trailing-assistant-render-skipped',
        null,
        {
          reason: 'rendered-message-count-mismatch',
          previousRenderedCount: 1,
          nextRenderedCount: 0,
        },
      ),
    ).toEqual({
      label: 'patch-trailing-assistant-render-skipped',
      payload: {
        tabId: null,
        reason: 'rendered-message-count-mismatch',
        previousRenderedCount: 1,
        nextRenderedCount: 0,
      },
    });
  });
});
