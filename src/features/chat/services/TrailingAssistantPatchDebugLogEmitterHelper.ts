import type { ChatMessage } from '../../../core/types';
import type {
  TrailingAssistantPatchCompletionDebugLoggingContext,
  TrailingAssistantPatchSkippedDebugLoggingContext,
} from './TrailingAssistantPatchDebugLoggingContextHelper';
import type { TrailingAssistantPatchDebugLogPlan } from './TrailingAssistantPatchDebugLogHelper';
import {
  buildTrailingAssistantPatchCompletionDebugLogPlan,
  buildTrailingAssistantPatchSkippedDebugLogPlan,
} from './TrailingAssistantPatchDebugLogPlanHelper';

type TrailingAssistantPatchDebugLogEmitter = {
  logAssistantFinalizationDebug(label: string, payload: unknown): void;
};

type TrailingAssistantPatchSkippedDebugLogEmitter =
  TrailingAssistantPatchDebugLogEmitter & {
    getMessagesForRender(messages: ChatMessage[]): ChatMessage[];
  };

export function emitTrailingAssistantPatchCompletionDebugLog(
  loggingContext: TrailingAssistantPatchCompletionDebugLoggingContext,
  emitter: TrailingAssistantPatchDebugLogEmitter,
): void {
  emitTrailingAssistantPatchDebugLogPlan(
    buildTrailingAssistantPatchCompletionDebugLogPlan(loggingContext),
    emitter,
  );
}

export function emitTrailingAssistantPatchSkippedDebugLog(
  loggingContext: TrailingAssistantPatchSkippedDebugLoggingContext,
  emitter: TrailingAssistantPatchSkippedDebugLogEmitter,
): void {
  emitTrailingAssistantPatchDebugLogPlan(
    buildTrailingAssistantPatchSkippedDebugLogPlan(
      loggingContext,
      (messages) => emitter.getMessagesForRender(messages),
    ),
    emitter,
  );
}

function emitTrailingAssistantPatchDebugLogPlan(
  logPlan: TrailingAssistantPatchDebugLogPlan<string>,
  emitter: TrailingAssistantPatchDebugLogEmitter,
): void {
  emitter.logAssistantFinalizationDebug(logPlan.label, logPlan.payload);
}
