import type {
  TrailingAssistantPatchCompletionDebugPlan,
  TrailingAssistantPatchCompletionDebugPlanningContext,
  TrailingAssistantPatchCompletionDebugPlanningContextInputsParts,
  TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs,
  TrailingAssistantPatchCompletionDebugPlanningContextSource,
  TrailingAssistantPatchCompletionDebugPlanningContextSourceContractParts,
  TrailingAssistantPatchCompletionDebugSummaryPlan,
  TrailingAssistantPatchCompletionDebugSummaryPlanSource,
  TrailingAssistantPatchCompletionDebugTailOutcomePlanParts,
  TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractParts,
  TrailingAssistantPatchTailOutcomeChildPlans,
  TrailingAssistantPatchTailOutcomeExecutionTailPlanSource,
  TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract,
  TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractParts,
  TrailingAssistantPatchTailOutcomePlanningContext,
  TrailingAssistantPatchTailOutcomePlanningContextInputs,
  TrailingAssistantPatchTailOutcomePlanningContextInputsSource,
  TrailingAssistantPatchTailOutcomePlanningContextShapeInputs,
  TrailingAssistantPatchTailOutcomePlanParts,
  TrailingAssistantPatchTailOutcomePlans,
  TrailingAssistantPatchTailStatePlan,
  TrailingAssistantPatchTailStatePlanningContext,
  TrailingAssistantPatchTailStatePlanningContextInputs,
  TrailingAssistantPatchTailStatePlanningContextInputsSource,
  TrailingAssistantPatchTailStatePlanningContextShapeInputs,
  TrailingAssistantPatchTailStateTailOutcomePlanSource,
} from './trailingAssistantPatchTypes';

export type {
  TrailingAssistantPatchCompletionDebugMessageSummarizer,
  TrailingAssistantPatchCompletionDebugPlan,
  TrailingAssistantPatchCompletionDebugPlanningContext,
  TrailingAssistantPatchCompletionDebugPlanningContextInputsParts,
  TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs,
  TrailingAssistantPatchCompletionDebugPlanningContextSource,
  TrailingAssistantPatchCompletionDebugPlanningContextSourceContractParts,
  TrailingAssistantPatchCompletionDebugSummaryPlan,
  TrailingAssistantPatchCompletionDebugSummaryPlanSource,
  TrailingAssistantPatchCompletionDebugTailOutcomePlanParts,
  TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractParts,
  TrailingAssistantPatchCompletionDebugTailStatePlan,
  TrailingAssistantPatchTailOutcomeChildPlans,
  TrailingAssistantPatchTailOutcomeExecutionTailPlanSource,
  TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract,
  TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractParts,
  TrailingAssistantPatchTailOutcomePlanningContext,
  TrailingAssistantPatchTailOutcomePlanningContextInputs,
  TrailingAssistantPatchTailOutcomePlanningContextInputsSource,
  TrailingAssistantPatchTailOutcomePlanningContextShapeInputs,
  TrailingAssistantPatchTailOutcomePlanParts,
  TrailingAssistantPatchTailOutcomePlans,
  TrailingAssistantPatchTailStatePlan,
  TrailingAssistantPatchTailStatePlanningContext,
  TrailingAssistantPatchTailStatePlanningContextInputs,
  TrailingAssistantPatchTailStatePlanningContextInputsSource,
  TrailingAssistantPatchTailStatePlanningContextShapeInputs,
  TrailingAssistantPatchTailStateTailOutcomePlanSource,
} from './trailingAssistantPatchTypes';

export function buildTrailingAssistantPatchCompletionDebugSummaryPlan(
  source: TrailingAssistantPatchCompletionDebugSummaryPlanSource,
): TrailingAssistantPatchCompletionDebugSummaryPlan {
  return {
    previousTail: source.summarizeChatMessageForDebug(source.previousTailMessage),
    nextTail: source.summarizeChatMessageForDebug(source.nextTailMessage),
  };
}

export function buildTrailingAssistantPatchCompletionDebugPlanningContextInputs(
  parts: TrailingAssistantPatchCompletionDebugPlanningContextInputsParts,
): TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs {
  return {
    shouldStickToBottom: parts.tailStatePlan.shouldStickToBottom,
    summaryPlan: parts.summaryPlan,
  };
}

export function buildTrailingAssistantPatchCompletionDebugPlanningContextShape(
  inputs: TrailingAssistantPatchCompletionDebugPlanningContextShapeInputs,
): TrailingAssistantPatchCompletionDebugPlanningContext {
  return {
    shouldStickToBottom: inputs.shouldStickToBottom,
    summaryPlan: inputs.summaryPlan,
  };
}

export function buildTrailingAssistantPatchCompletionDebugPlanningContextSourceContract(
  parts: TrailingAssistantPatchCompletionDebugPlanningContextSourceContractParts,
): TrailingAssistantPatchCompletionDebugPlanningContextSource {
  return {
    ...parts.planningContext,
    tailStatePlan: parts.tailStatePlan,
    summarizeChatMessageForDebug: parts.summarizeChatMessageForDebug,
  };
}

export function buildTrailingAssistantPatchCompletionDebugPlanningContext(
  source: TrailingAssistantPatchCompletionDebugPlanningContextSource,
): TrailingAssistantPatchCompletionDebugPlanningContext {
  const summaryPlan = buildTrailingAssistantPatchCompletionDebugSummaryPlan(source);

  return buildTrailingAssistantPatchCompletionDebugPlanningContextShape(
    buildTrailingAssistantPatchCompletionDebugPlanningContextInputs({
      tailStatePlan: source.tailStatePlan,
      summaryPlan,
    }),
  );
}

export function buildTrailingAssistantPatchCompletionDebugPlan(
  planningContext: TrailingAssistantPatchCompletionDebugPlanningContext,
): TrailingAssistantPatchCompletionDebugPlan {
  return {
    shouldStickToBottom: planningContext.shouldStickToBottom,
    previousTail: planningContext.summaryPlan.previousTail,
    nextTail: planningContext.summaryPlan.nextTail,
  };
}

export function buildTrailingAssistantPatchCompletionDebugSourceContractFromTailOutcomePlanningContext(
  parts: TrailingAssistantPatchCompletionDebugTailOutcomeSourceContractParts,
): TrailingAssistantPatchCompletionDebugPlanningContextSource {
  return buildTrailingAssistantPatchCompletionDebugPlanningContextSourceContract(parts);
}

export function buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext(
  parts: TrailingAssistantPatchCompletionDebugTailOutcomePlanParts,
): TrailingAssistantPatchCompletionDebugPlan {
  return buildTrailingAssistantPatchCompletionDebugPlan(
    buildTrailingAssistantPatchCompletionDebugPlanningContext(
      buildTrailingAssistantPatchCompletionDebugSourceContractFromTailOutcomePlanningContext(parts),
    ),
  );
}

export function buildTrailingAssistantPatchTailStatePlanningContextInputs(
  source: TrailingAssistantPatchTailStatePlanningContextInputsSource,
): TrailingAssistantPatchTailStatePlanningContextInputs {
  return {
    nextTailMessage: source.nextTailMessage,
    messageEl: source.messageEl,
    shouldStickToBottom: source.shouldStickToBottom,
  };
}

export function buildTrailingAssistantPatchTailStatePlanningContextShape(
  inputs: TrailingAssistantPatchTailStatePlanningContextShapeInputs,
): TrailingAssistantPatchTailStatePlanningContext {
  return {
    nextTailMessage: inputs.nextTailMessage,
    messageEl: inputs.messageEl,
    shouldStickToBottom: inputs.shouldStickToBottom,
  };
}

export function buildTrailingAssistantPatchTailStatePlanningContext(
  source: TrailingAssistantPatchTailStatePlanningContextInputsSource,
): TrailingAssistantPatchTailStatePlanningContext {
  return buildTrailingAssistantPatchTailStatePlanningContextShape(
    buildTrailingAssistantPatchTailStatePlanningContextInputs(source),
  );
}

export function buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext(
  source: TrailingAssistantPatchTailStateTailOutcomePlanSource,
): TrailingAssistantPatchTailStatePlan {
  const planningContext = buildTrailingAssistantPatchTailStatePlanningContext(source);

  return {
    messageEl: planningContext.messageEl,
    messageId: planningContext.nextTailMessage.id,
    sourceMessageId: planningContext.nextTailMessage.sourceMessageId ?? null,
    shouldStickToBottom: planningContext.shouldStickToBottom,
  };
}

export function buildTrailingAssistantPatchTailOutcomePlanningContextInputs(
  source: TrailingAssistantPatchTailOutcomePlanningContextInputsSource,
): TrailingAssistantPatchTailOutcomePlanningContextInputs {
  return {
    previousTailMessage: source.previousTailMessage,
    nextTailMessage: source.nextTailMessage,
    messageEl: source.patchTarget.messageEl,
    shouldStickToBottom: source.shouldStickToBottom,
  };
}

export function buildTrailingAssistantPatchTailOutcomePlanningContextShape(
  inputs: TrailingAssistantPatchTailOutcomePlanningContextShapeInputs,
): TrailingAssistantPatchTailOutcomePlanningContext {
  return {
    previousTailMessage: inputs.previousTailMessage,
    nextTailMessage: inputs.nextTailMessage,
    messageEl: inputs.messageEl,
    shouldStickToBottom: inputs.shouldStickToBottom,
  };
}

export function buildTrailingAssistantPatchTailOutcomePlanningContext(
  source: TrailingAssistantPatchTailOutcomePlanningContextInputsSource,
): TrailingAssistantPatchTailOutcomePlanningContext {
  return buildTrailingAssistantPatchTailOutcomePlanningContextShape(
    buildTrailingAssistantPatchTailOutcomePlanningContextInputs(source),
  );
}

export function buildTrailingAssistantPatchTailOutcomePlanParts(
  planParts: TrailingAssistantPatchTailOutcomePlanParts,
): TrailingAssistantPatchTailOutcomePlanParts {
  return {
    tailStatePlan: planParts.tailStatePlan,
    completionDebugPlan: planParts.completionDebugPlan,
  };
}

export function buildTrailingAssistantPatchTailOutcomePlans(
  planParts: TrailingAssistantPatchTailOutcomePlanParts,
): TrailingAssistantPatchTailOutcomePlans {
  return {
    tailStatePlan: planParts.tailStatePlan,
    completionDebugPlan: planParts.completionDebugPlan,
  };
}

export function buildTrailingAssistantPatchTailOutcomePlansFromChildPlans(
  childPlans: TrailingAssistantPatchTailOutcomeChildPlans,
): TrailingAssistantPatchTailOutcomePlans {
  return buildTrailingAssistantPatchTailOutcomePlans(
    buildTrailingAssistantPatchTailOutcomePlanParts(childPlans),
  );
}

export function buildTrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract(
  parts: TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContractParts,
): TrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract {
  return {
    planningContext: buildTrailingAssistantPatchTailOutcomePlanningContext(parts.planningContext),
    summarizeChatMessageForDebug: parts.summarizeChatMessageForDebug,
  };
}

export function buildTrailingAssistantPatchTailOutcomePlansFromExecutionTailPlanningContext(
  source: TrailingAssistantPatchTailOutcomeExecutionTailPlanSource,
): TrailingAssistantPatchTailOutcomePlans {
  const sourceContract =
    buildTrailingAssistantPatchTailOutcomeExecutionTailPlanSourceContract(
      source,
    );
  const tailStatePlan =
    buildTrailingAssistantPatchTailStatePlanFromTailOutcomePlanningContext(
      sourceContract.planningContext,
    );
  const completionDebugPlan =
    buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext({
      planningContext: sourceContract.planningContext,
      tailStatePlan,
      summarizeChatMessageForDebug: sourceContract.summarizeChatMessageForDebug,
    });

  return buildTrailingAssistantPatchTailOutcomePlansFromChildPlans({
    tailStatePlan,
    completionDebugPlan,
  });
}
