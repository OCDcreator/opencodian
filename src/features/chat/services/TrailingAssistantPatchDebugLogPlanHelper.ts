import type { ChatMessage } from '../../../core/types';
import { buildTrailingAssistantPatchDebugLogPlanFromLoggingContext } from './TrailingAssistantPatchDebugLogCoordinator';
import {
  type TrailingAssistantPatchCompletionDebugLoggingContext,
  type TrailingAssistantPatchSkippedDebugLoggingContext,
} from './TrailingAssistantPatchDebugLoggingContextHelper';
import {
  type TrailingAssistantPatchDebugLogPlan,
} from './TrailingAssistantPatchDebugLogHelper';
import {
  buildTrailingAssistantPatchCompletionDebugPayloadInputs,
  buildTrailingAssistantPatchCompletionDebugPayloadPlan,
  buildTrailingAssistantPatchSkippedDebugPayloadInputs,
  buildTrailingAssistantPatchSkippedDebugPayloadPlan,
} from './TrailingAssistantPatchDebugPayloadHelper';

export type TrailingAssistantPatchCompletionDebugLogPlan =
  TrailingAssistantPatchDebugLogPlan<'patch-trailing-assistant-render-complete'>;

export type TrailingAssistantPatchSkippedDebugLogPlan =
  TrailingAssistantPatchDebugLogPlan<'patch-trailing-assistant-render-skipped'>;

type TrailingAssistantPatchSkippedDebugMessagesForRender = (
  messages: ChatMessage[],
) => ChatMessage[];

export function buildTrailingAssistantPatchCompletionDebugLogPlan(
  loggingContext: TrailingAssistantPatchCompletionDebugLoggingContext,
): TrailingAssistantPatchCompletionDebugLogPlan {
  return buildTrailingAssistantPatchDebugLogPlanFromLoggingContext({
    label: 'patch-trailing-assistant-render-complete',
    loggingContext,
    buildPayloadInputsFromLoggingContext: (context) =>
      buildTrailingAssistantPatchCompletionDebugPayloadInputs(
        context.completionDebugPlan,
      ),
    buildPayloadPlan: buildTrailingAssistantPatchCompletionDebugPayloadPlan,
    getTabId: (context) => context.tabId,
  });
}

export function buildTrailingAssistantPatchSkippedDebugLogPlan(
  loggingContext: TrailingAssistantPatchSkippedDebugLoggingContext,
  getMessagesForRender: TrailingAssistantPatchSkippedDebugMessagesForRender,
): TrailingAssistantPatchSkippedDebugLogPlan {
  return buildTrailingAssistantPatchDebugLogPlanFromLoggingContext({
    label: 'patch-trailing-assistant-render-skipped',
    loggingContext,
    buildPayloadInputsFromLoggingContext: (context) =>
      buildTrailingAssistantPatchSkippedDebugPayloadInputs({
        reason: context.reason,
        payload: context.payload,
        previousMessages: context.planningContext.previousMessages,
        nextMessages: context.planningContext.nextMessages,
        getMessagesForRender,
      }),
    buildPayloadPlan: buildTrailingAssistantPatchSkippedDebugPayloadPlan,
    getTabId: (context) => context.planningContext.tabId,
  });
}
