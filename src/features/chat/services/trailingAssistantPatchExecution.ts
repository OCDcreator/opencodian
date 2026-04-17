import type { TabId } from '../tabs';
import {
  buildTrailingAssistantPatchTailOutcomePlansFromExecutionTailPlanningContext,
} from './trailingAssistantPatchPlanning';
import type {
  TrailingAssistantPatchExecutionPlan,
  TrailingAssistantPatchExecutionPlanSource,
  TrailingAssistantPatchExecutionTailChildPlanSource,
  TrailingAssistantPatchExecutionTailExecutionPlanSource,
  TrailingAssistantPatchExecutionTailPlanningContext,
  TrailingAssistantPatchExecutionTailPlanningContextSource,
  TrailingAssistantPatchExecutionTailPlanParts,
  TrailingAssistantPatchFooterFinalizationDecisionSource,
  TrailingAssistantPatchFooterFinalizationDecisionSourceContractParts,
  TrailingAssistantPatchFooterFinalizationExecutionTailDecisionSource,
  TrailingAssistantPatchSuccessChildPlans,
  TrailingAssistantPatchSuccessPlan,
  TrailingAssistantPatchSuccessPlanChildPlanSource,
  TrailingAssistantPatchSuccessPlanningContextPlanSource,
  TrailingAssistantPatchSuccessPlanningContextPlanSourceContractParts,
  TrailingAssistantPatchTailStateApplier,
  TrailingAssistantPatchTailStatePlan,
  TrailingAssistantPatchTurnBodyScopePlan,
  TrailingAssistantPatchTurnBodyScopePlanInputs,
  TrailingAssistantPatchTurnBodyScopePlanSource,
} from './trailingAssistantPatchTypes';

export type {
  TrailingAssistantPatchExecutionPlan,
  TrailingAssistantPatchExecutionPlanSource,
  TrailingAssistantPatchExecutionTailChildPlanSource,
  TrailingAssistantPatchExecutionTailExecutionPlanSource,
  TrailingAssistantPatchExecutionTailPlanningContext,
  TrailingAssistantPatchExecutionTailPlanningContextSource,
  TrailingAssistantPatchExecutionTailPlanParts,
  TrailingAssistantPatchFooterFinalizationDecisionBodySignatureGetter,
  TrailingAssistantPatchFooterFinalizationDecisionSource,
  TrailingAssistantPatchFooterFinalizationDecisionSourceContractParts,
  TrailingAssistantPatchFooterFinalizationExecutionTailDecisionSource,
  TrailingAssistantPatchSuccessChildPlans,
  TrailingAssistantPatchSuccessPlan,
  TrailingAssistantPatchSuccessPlanChildPlanSource,
  TrailingAssistantPatchSuccessPlanningContextPlanBaseSource,
  TrailingAssistantPatchSuccessPlanningContextPlanBodySignaturePort,
  TrailingAssistantPatchSuccessPlanningContextPlanSource,
  TrailingAssistantPatchSuccessPlanningContextPlanSourceContractParts,
  TrailingAssistantPatchTailStateApplier,
  TrailingAssistantPatchTailStatePlan,
  TrailingAssistantPatchTurnBodyRuntimeState,
  TrailingAssistantPatchTurnBodyScopePlan,
  TrailingAssistantPatchTurnBodyScopePlanSource,
} from './trailingAssistantPatchTypes';

export function buildTrailingAssistantPatchExecutionPlan(
  source: TrailingAssistantPatchExecutionPlanSource,
): TrailingAssistantPatchExecutionPlan {
  if (source.shouldFinalizeFooterOnly) {
    return {
      kind: 'finalize-footer',
      messageEl: source.patchTarget.messageEl,
      nextTailMessage: source.nextTailMessage,
    };
  }

  return {
    kind: 'rerender-content',
    messageEl: source.patchTarget.messageEl,
    contentEl: source.patchTarget.contentEl,
    nextTailMessage: source.nextTailMessage,
  };
}

export function buildTrailingAssistantPatchExecutionTailPlanningContext(
  source: TrailingAssistantPatchExecutionTailPlanningContextSource,
): TrailingAssistantPatchExecutionTailPlanningContext {
  return buildTrailingAssistantPatchExecutionTailPlanningContextFromInputs(
    buildTrailingAssistantPatchExecutionTailInputs(source),
  );
}

function buildTrailingAssistantPatchExecutionTailInputs(
  source: TrailingAssistantPatchExecutionTailPlanningContextSource,
): TrailingAssistantPatchExecutionTailPlanningContext {
  return {
    previousTailMessage: source.previousTailMessage,
    nextTailMessage: source.nextTailMessage,
    patchTarget: source.patchTarget,
    shouldStickToBottom: source.shouldStickToBottom,
  };
}

function buildTrailingAssistantPatchExecutionTailPlanningContextFromInputs(
  inputs: TrailingAssistantPatchExecutionTailPlanningContext,
): TrailingAssistantPatchExecutionTailPlanningContext {
  return {
    previousTailMessage: inputs.previousTailMessage,
    nextTailMessage: inputs.nextTailMessage,
    patchTarget: inputs.patchTarget,
    shouldStickToBottom: inputs.shouldStickToBottom,
  };
}

export function shouldFinalizeTrailingAssistantFooterOnly(
  source: TrailingAssistantPatchFooterFinalizationDecisionSource,
): boolean {
  return source.previousBodySignature === source.nextBodySignature;
}

export function buildTrailingAssistantPatchFooterFinalizationDecisionSourceContract(
  parts: TrailingAssistantPatchFooterFinalizationDecisionSourceContractParts,
): TrailingAssistantPatchFooterFinalizationDecisionSource {
  return {
    previousBodySignature: parts.getBodySignature(parts.planningContext.previousTailMessage),
    nextBodySignature: parts.getBodySignature(parts.planningContext.nextTailMessage),
  };
}

export function shouldFinalizeTrailingAssistantFooterOnlyFromExecutionTailPlanningContext(
  source: TrailingAssistantPatchFooterFinalizationExecutionTailDecisionSource,
): boolean {
  return shouldFinalizeTrailingAssistantFooterOnly(
    buildTrailingAssistantPatchFooterFinalizationDecisionSourceContract(source),
  );
}

export function buildTrailingAssistantPatchExecutionPlanFromExecutionTailPlanningContext(
  source: TrailingAssistantPatchExecutionTailExecutionPlanSource,
): TrailingAssistantPatchExecutionPlan {
  return buildTrailingAssistantPatchExecutionPlan({
    nextTailMessage: source.planningContext.nextTailMessage,
    patchTarget: source.planningContext.patchTarget,
    shouldFinalizeFooterOnly: source.shouldFinalizeFooterOnly,
  });
}

export function buildTrailingAssistantPatchExecutionTailPlanParts(
  planParts: TrailingAssistantPatchExecutionTailPlanParts,
): TrailingAssistantPatchExecutionTailPlanParts {
  return {
    executionPlan: planParts.executionPlan,
    tailOutcomePlans: planParts.tailOutcomePlans,
  };
}

export function buildTrailingAssistantPatchExecutionTailPlanPartsFromExecutionTailPlanningContext(
  source: TrailingAssistantPatchExecutionTailChildPlanSource,
): TrailingAssistantPatchExecutionTailPlanParts {
  const shouldFinalizeFooterOnly =
    shouldFinalizeTrailingAssistantFooterOnlyFromExecutionTailPlanningContext(source);

  return buildTrailingAssistantPatchExecutionTailPlanParts({
    executionPlan: buildTrailingAssistantPatchExecutionPlanFromExecutionTailPlanningContext({
      planningContext: source.planningContext,
      shouldFinalizeFooterOnly,
    }),
    tailOutcomePlans: buildTrailingAssistantPatchTailOutcomePlansFromExecutionTailPlanningContext(
      source,
    ),
  });
}

export function buildTrailingAssistantPatchTurnBodyScopePlan(
  source: TrailingAssistantPatchTurnBodyScopePlanSource,
): TrailingAssistantPatchTurnBodyScopePlan {
  return buildTrailingAssistantPatchTurnBodyScopePlanFromInputs(
    buildTrailingAssistantPatchTurnBodyScopePlanInputs(source),
  );
}

function buildTrailingAssistantPatchTurnBodyScopePlanInputs(
  source: TrailingAssistantPatchTurnBodyScopePlanSource,
): TrailingAssistantPatchTurnBodyScopePlanInputs {
  if (!source.runtime) {
    return { runtime: null };
  }

  return {
    runtime: source.runtime,
    scopedTurnBodyEl: source.parentEl,
    restoreTurnBodyEl: source.runtime.currentTurnBodyEl ?? source.parentEl,
  };
}

function buildTrailingAssistantPatchTurnBodyScopePlanFromInputs(
  inputs: TrailingAssistantPatchTurnBodyScopePlanInputs,
): TrailingAssistantPatchTurnBodyScopePlan {
  if (!inputs.runtime) {
    return { runtime: null };
  }

  return {
    runtime: inputs.runtime,
    scopedTurnBodyEl: inputs.scopedTurnBodyEl,
    restoreTurnBodyEl: inputs.restoreTurnBodyEl,
  };
}

export function buildTrailingAssistantPatchSuccessPlanFromParts(
  planParts: TrailingAssistantPatchSuccessChildPlans,
): TrailingAssistantPatchSuccessPlan {
  return {
    executionPlan: planParts.executionPlan,
    tailStatePlan: planParts.tailOutcomePlans.tailStatePlan,
    completionDebugPlan: planParts.tailOutcomePlans.completionDebugPlan,
    turnBodyScopePlan: planParts.turnBodyScopePlan,
  };
}

export function buildTrailingAssistantPatchSuccessPlanFromChildPlans(
  childPlans: TrailingAssistantPatchSuccessChildPlans,
): TrailingAssistantPatchSuccessPlan {
  return buildTrailingAssistantPatchSuccessPlanFromParts({
    ...buildTrailingAssistantPatchExecutionTailPlanParts({
      executionPlan: childPlans.executionPlan,
      tailOutcomePlans: childPlans.tailOutcomePlans,
    }),
    turnBodyScopePlan: childPlans.turnBodyScopePlan,
  });
}

export function buildTrailingAssistantPatchSuccessPlanFromChildPlanSource(
  source: TrailingAssistantPatchSuccessPlanChildPlanSource,
): TrailingAssistantPatchSuccessPlan {
  return buildTrailingAssistantPatchSuccessPlanFromChildPlans({
    executionPlan: source.executionPlan,
    tailOutcomePlans: source.tailOutcomePlans,
    turnBodyScopePlan: buildTrailingAssistantPatchTurnBodyScopePlan(
      source.turnBodyScopePlanSource,
    ),
  });
}

export function buildTrailingAssistantPatchSuccessPlanningContextPlanSourceContract(
  parts: TrailingAssistantPatchSuccessPlanningContextPlanSourceContractParts,
): TrailingAssistantPatchSuccessPlanningContextPlanSource {
  return {
    ...parts.planningContext,
    getBodySignature: (message) => parts.assistantTailRender.getBodySignature(message),
    summarizeChatMessageForDebug: parts.summarizeChatMessageForDebug,
  };
}

export function buildTrailingAssistantPatchSuccessPlanFromPlanningContext(
  source: TrailingAssistantPatchSuccessPlanningContextPlanSource,
): TrailingAssistantPatchSuccessPlan {
  const executionTailPlanningContext =
    buildTrailingAssistantPatchExecutionTailPlanningContext(source);

  return buildTrailingAssistantPatchSuccessPlanFromChildPlanSource({
    ...buildTrailingAssistantPatchExecutionTailPlanPartsFromExecutionTailPlanningContext({
      planningContext: executionTailPlanningContext,
      getBodySignature: source.getBodySignature,
      summarizeChatMessageForDebug: source.summarizeChatMessageForDebug,
    }),
    turnBodyScopePlanSource: source,
  });
}

export function applyTrailingAssistantPatchTailState(
  tailStatePlan: TrailingAssistantPatchTailStatePlan,
  tabId: TabId | null,
  applier: TrailingAssistantPatchTailStateApplier,
): void {
  const { messageEl, messageId, sourceMessageId, shouldStickToBottom } = tailStatePlan;
  messageEl.dataset.messageId = messageId;
  if (sourceMessageId) {
    messageEl.dataset.sourceMessageId = sourceMessageId;
  } else {
    delete messageEl.dataset.sourceMessageId;
  }
  messageEl.style.animation = 'none';
  if (shouldStickToBottom) {
    applier.scrollToBottom({ tabId });
  }
}

export async function withTrailingAssistantTurnBodyScope<T>(
  turnBodyScopePlan: TrailingAssistantPatchTurnBodyScopePlan,
  run: () => Promise<T>,
): Promise<T> {
  if (!turnBodyScopePlan.runtime) {
    return run();
  }

  const {
    runtime,
    scopedTurnBodyEl,
    restoreTurnBodyEl,
  } = turnBodyScopePlan;
  runtime.currentTurnBodyEl = scopedTurnBodyEl;

  try {
    return await run();
  } finally {
    runtime.currentTurnBodyEl = restoreTurnBodyEl;
  }
}
