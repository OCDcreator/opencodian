import { buildTrailingAssistantPatchDebugLogPlanFromLoggingContext } from '../../../../src/features/chat/services/trailingAssistantPatchDebug';

describe('TrailingAssistantPatchDebugLogCoordinator', () => {
  it('coordinates completion debug logging contexts into final log plans', () => {
    expect(
      buildTrailingAssistantPatchDebugLogPlanFromLoggingContext({
        label: 'patch-trailing-assistant-render-complete',
        loggingContext: {
          tabId: 'tab-1',
          completionDebugPlan: {
            shouldStickToBottom: true,
            previousTail: { id: 'assistant-1' },
            nextTail: { id: 'assistant-2' },
          },
        },
        buildPayloadInputsFromLoggingContext: (loggingContext) =>
          loggingContext.completionDebugPlan,
        buildPayloadPlan: (payloadInputs) => ({
          shouldStickToBottom: payloadInputs.shouldStickToBottom,
          previousTail: payloadInputs.previousTail,
          nextTail: payloadInputs.nextTail,
        }),
        getTabId: (loggingContext) => loggingContext.tabId,
      }),
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

  it('coordinates skipped debug logging contexts without altering payload order', () => {
    expect(
      buildTrailingAssistantPatchDebugLogPlanFromLoggingContext({
        label: 'patch-trailing-assistant-render-skipped',
        loggingContext: {
          planningContext: {
            tabId: null,
          },
          reason: 'rendered-message-count-mismatch',
          payload: {
            mismatchIndex: 0,
          },
          countPlan: {
            previousRenderedCount: 1,
            nextRenderedCount: 0,
          },
        },
        buildPayloadInputsFromLoggingContext: (loggingContext) => ({
          reason: loggingContext.reason,
          payload: loggingContext.payload,
          countPlan: loggingContext.countPlan,
        }),
        buildPayloadPlan: (payloadInputs) => ({
          reason: payloadInputs.reason,
          previousRenderedCount: payloadInputs.countPlan.previousRenderedCount,
          nextRenderedCount: payloadInputs.countPlan.nextRenderedCount,
          ...payloadInputs.payload,
        }),
        getTabId: (loggingContext) => loggingContext.planningContext.tabId,
      }),
    ).toEqual({
      label: 'patch-trailing-assistant-render-skipped',
      payload: {
        tabId: null,
        reason: 'rendered-message-count-mismatch',
        previousRenderedCount: 1,
        nextRenderedCount: 0,
        mismatchIndex: 0,
      },
    });
  });
});
