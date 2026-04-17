import type { TabId } from '../tabs';
import type {
  TrailingAssistantPatchCompletionDebugLoggingContext,
  TrailingAssistantPatchCompletionDebugLogPlan,
  TrailingAssistantPatchCompletionDebugPayloadInputs,
  TrailingAssistantPatchCompletionDebugPayloadPlan,
  TrailingAssistantPatchCompletionDebugPlanLike,
  TrailingAssistantPatchDebugLogEmitter,
  TrailingAssistantPatchDebugLogPlan,
  TrailingAssistantPatchSkippedDebugCountPlan,
  TrailingAssistantPatchSkippedDebugCountPlanInputs,
  TrailingAssistantPatchSkippedDebugLogEmitter,
  TrailingAssistantPatchSkippedDebugLoggingContext,
  TrailingAssistantPatchSkippedDebugLogPlan,
  TrailingAssistantPatchSkippedDebugMessagesForRender,
  TrailingAssistantPatchSkippedDebugPayloadInputs,
  TrailingAssistantPatchSkippedDebugPayloadInputSource,
  TrailingAssistantPatchSkippedDebugPayloadPlan,
  TrailingAssistantPatchSkippedDebugPlanningContext,
} from './trailingAssistantPatchTypes';

export type {
  TrailingAssistantPatchCompletionDebugLoggingContext,
  TrailingAssistantPatchCompletionDebugLogPlan,
  TrailingAssistantPatchCompletionDebugPayloadInputs,
  TrailingAssistantPatchCompletionDebugPayloadPlan,
  TrailingAssistantPatchCompletionDebugPlanLike,
  TrailingAssistantPatchDebugLogEmitter,
  TrailingAssistantPatchDebugLogPlan,
  TrailingAssistantPatchSkippedDebugCountPlan,
  TrailingAssistantPatchSkippedDebugCountPlanInputs,
  TrailingAssistantPatchSkippedDebugLogEmitter,
  TrailingAssistantPatchSkippedDebugLoggingContext,
  TrailingAssistantPatchSkippedDebugLogPlan,
  TrailingAssistantPatchSkippedDebugMessagesForRender,
  TrailingAssistantPatchSkippedDebugPayloadInputs,
  TrailingAssistantPatchSkippedDebugPayloadInputSource,
  TrailingAssistantPatchSkippedDebugPayloadPlan,
  TrailingAssistantPatchSkippedDebugPlanningContext,
} from './trailingAssistantPatchTypes';

type TrailingAssistantPatchDebugLogPlanningContextContract<PayloadInputs> = {
  payloadInputs: PayloadInputs;
  tabId: TabId | null;
};

type TrailingAssistantPatchDebugLogPlanningContext<PayloadInputs> = {
  payloadInputs: PayloadInputs;
  tabId: TabId | null;
};

type TrailingAssistantPatchDebugLogCoordinator<
  LoggingContext,
  PayloadInputs,
  PayloadPlan extends Record<string, unknown>,
  Label extends string,
> = {
  label: Label;
  loggingContext: LoggingContext;
  buildPayloadInputsFromLoggingContext(
    loggingContext: LoggingContext,
  ): PayloadInputs;
  buildPayloadPlan(payloadInputs: PayloadInputs): PayloadPlan;
  getTabId(loggingContext: LoggingContext): TabId | null;
};

type TrailingAssistantPatchDebugFinalLogInputs<PayloadPlan extends Record<string, unknown>> = {
  tabId: TabId | null;
  payloadPlan: PayloadPlan;
};

type TrailingAssistantPatchDebugFinalLogInputsContract<
  PayloadPlan extends Record<string, unknown>,
> = {
  tabId: TabId | null;
  payloadPlan: PayloadPlan;
};

type TrailingAssistantPatchDebugFinalLogPlanContract<
  PayloadPlan extends Record<string, unknown>,
> = {
  finalLogInputs: TrailingAssistantPatchDebugFinalLogInputs<PayloadPlan>;
};

type TrailingAssistantPatchDebugFinalLogPayloadContract<
  PayloadPlan extends Record<string, unknown>,
> = {
  tabId: TabId | null;
  payloadPlan: PayloadPlan;
};

export function buildTrailingAssistantPatchCompletionDebugLoggingContext(
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPlanLike,
  tabId: TabId | null,
): TrailingAssistantPatchCompletionDebugLoggingContext {
  return {
    completionDebugPlan,
    tabId,
  };
}

export function buildTrailingAssistantPatchSkippedDebugPlanningContext(
  previousMessages: TrailingAssistantPatchSkippedDebugPlanningContext['previousMessages'],
  nextMessages: TrailingAssistantPatchSkippedDebugPlanningContext['nextMessages'],
  tabId: TabId | null,
): TrailingAssistantPatchSkippedDebugPlanningContext {
  return {
    previousMessages,
    nextMessages,
    tabId,
  };
}

export function buildTrailingAssistantPatchSkippedDebugLoggingContext(
  planningContext: TrailingAssistantPatchSkippedDebugPlanningContext,
  reason: string,
  payload: Record<string, unknown>,
): TrailingAssistantPatchSkippedDebugLoggingContext {
  return {
    planningContext,
    reason,
    payload,
  };
}

export function buildTrailingAssistantPatchCompletionDebugPayloadInputs(
  completionDebugPlan: TrailingAssistantPatchCompletionDebugPayloadInputs,
): TrailingAssistantPatchCompletionDebugPayloadInputs {
  return {
    shouldStickToBottom: completionDebugPlan.shouldStickToBottom,
    previousTail: completionDebugPlan.previousTail,
    nextTail: completionDebugPlan.nextTail,
  };
}

export function buildTrailingAssistantPatchCompletionDebugPayloadPlan(
  payloadInputs: TrailingAssistantPatchCompletionDebugPayloadInputs,
): TrailingAssistantPatchCompletionDebugPayloadPlan {
  return {
    shouldStickToBottom: payloadInputs.shouldStickToBottom,
    previousTail: payloadInputs.previousTail,
    nextTail: payloadInputs.nextTail,
  };
}

export function buildTrailingAssistantPatchSkippedDebugPayloadInputs(
  payloadInputSource: TrailingAssistantPatchSkippedDebugPayloadInputSource,
): TrailingAssistantPatchSkippedDebugPayloadInputs {
  return {
    reason: payloadInputSource.reason,
    payload: payloadInputSource.payload,
    countPlan: buildTrailingAssistantPatchSkippedDebugCountPlan({
      previousMessages: payloadInputSource.previousMessages,
      nextMessages: payloadInputSource.nextMessages,
      getMessagesForRender: payloadInputSource.getMessagesForRender,
    }),
  };
}

export function buildTrailingAssistantPatchSkippedDebugPayloadPlan(
  payloadInputs: TrailingAssistantPatchSkippedDebugPayloadInputs,
): TrailingAssistantPatchSkippedDebugPayloadPlan {
  return {
    reason: payloadInputs.reason,
    previousRenderedCount: payloadInputs.countPlan.previousRenderedCount,
    nextRenderedCount: payloadInputs.countPlan.nextRenderedCount,
    ...payloadInputs.payload,
  };
}

function buildTrailingAssistantPatchSkippedDebugCountPlan(
  inputs: TrailingAssistantPatchSkippedDebugCountPlanInputs,
): TrailingAssistantPatchSkippedDebugCountPlan {
  return {
    previousRenderedCount:
      inputs.getMessagesForRender(inputs.previousMessages).length,
    nextRenderedCount:
      inputs.getMessagesForRender(inputs.nextMessages).length,
  };
}

export function buildTrailingAssistantPatchDebugLogPlanFromLoggingContext<
  LoggingContext,
  PayloadInputs,
  PayloadPlan extends Record<string, unknown>,
  Label extends string,
>(
  coordinator: TrailingAssistantPatchDebugLogCoordinator<
    LoggingContext,
    PayloadInputs,
    PayloadPlan,
    Label
  >,
): TrailingAssistantPatchDebugLogPlan<Label> {
  const planningContext =
    buildTrailingAssistantPatchDebugLogPlanningContextFromLoggingContext(
      coordinator,
    );
  return buildTrailingAssistantPatchDebugFinalLogPlanFromPlanningContext(
    coordinator.label,
    planningContext,
    coordinator.buildPayloadPlan,
  );
}

function buildTrailingAssistantPatchDebugLogPlanningContextFromLoggingContext<
  LoggingContext,
  PayloadInputs,
  PayloadPlan extends Record<string, unknown>,
  Label extends string,
>(
  coordinator: TrailingAssistantPatchDebugLogCoordinator<
    LoggingContext,
    PayloadInputs,
    PayloadPlan,
    Label
  >,
): TrailingAssistantPatchDebugLogPlanningContext<PayloadInputs> {
  return buildTrailingAssistantPatchDebugLogPlanningContext(
    buildTrailingAssistantPatchDebugLogPlanningContextContract(
      coordinator.buildPayloadInputsFromLoggingContext(coordinator.loggingContext),
      coordinator.getTabId(coordinator.loggingContext),
    ),
  );
}

function buildTrailingAssistantPatchDebugLogPlanningContextContract<
  PayloadInputs,
>(
  payloadInputs: PayloadInputs,
  tabId: TabId | null,
): TrailingAssistantPatchDebugLogPlanningContextContract<PayloadInputs> {
  return {
    payloadInputs,
    tabId,
  };
}

function buildTrailingAssistantPatchDebugLogPlanningContext<PayloadInputs>(
  planningContextContract: TrailingAssistantPatchDebugLogPlanningContextContract<PayloadInputs>,
): TrailingAssistantPatchDebugLogPlanningContext<PayloadInputs> {
  return {
    payloadInputs: planningContextContract.payloadInputs,
    tabId: planningContextContract.tabId,
  };
}

function buildTrailingAssistantPatchDebugFinalLogPlanFromPlanningContext<
  PayloadInputs,
  PayloadPlan extends Record<string, unknown>,
  Label extends string,
>(
  label: Label,
  planningContext: TrailingAssistantPatchDebugLogPlanningContext<PayloadInputs>,
  buildPayloadPlan: (payloadInputs: PayloadInputs) => PayloadPlan,
): TrailingAssistantPatchDebugLogPlan<Label> {
  const payloadPlan =
    buildTrailingAssistantPatchDebugPayloadPlanFromPlanningContext(
      planningContext,
      buildPayloadPlan,
    );
  return buildTrailingAssistantPatchDebugFinalLogPlanFromTabId(
    label,
    planningContext.tabId,
    payloadPlan,
  );
}

function buildTrailingAssistantPatchDebugPayloadPlanFromPlanningContext<
  PayloadInputs,
  PayloadPlan extends Record<string, unknown>,
>(
  planningContext: TrailingAssistantPatchDebugLogPlanningContext<PayloadInputs>,
  buildPayloadPlan: (payloadInputs: PayloadInputs) => PayloadPlan,
): PayloadPlan {
  return buildPayloadPlan(planningContext.payloadInputs);
}

export function buildTrailingAssistantPatchDebugFinalLogPlanFromTabId<
  Label extends string,
  PayloadPlan extends Record<string, unknown>,
>(
  label: Label,
  tabId: TabId | null,
  payloadPlan: PayloadPlan,
): TrailingAssistantPatchDebugLogPlan<Label> {
  const finalLogPlanContract = buildTrailingAssistantPatchDebugFinalLogPlanContract(
    buildTrailingAssistantPatchDebugFinalLogInputs(
      buildTrailingAssistantPatchDebugFinalLogInputsContract(tabId, payloadPlan),
    ),
  );
  return buildTrailingAssistantPatchDebugFinalLogPlanFromInputs(
    label,
    finalLogPlanContract.finalLogInputs,
  );
}

function buildTrailingAssistantPatchDebugFinalLogInputsContract<
  PayloadPlan extends Record<string, unknown>,
>(
  tabId: TabId | null,
  payloadPlan: PayloadPlan,
): TrailingAssistantPatchDebugFinalLogInputsContract<PayloadPlan> {
  return {
    tabId,
    payloadPlan,
  };
}

function buildTrailingAssistantPatchDebugFinalLogInputs<
  PayloadPlan extends Record<string, unknown>,
>(
  inputsContract: TrailingAssistantPatchDebugFinalLogInputsContract<PayloadPlan>,
): TrailingAssistantPatchDebugFinalLogInputs<PayloadPlan> {
  return {
    tabId: inputsContract.tabId,
    payloadPlan: inputsContract.payloadPlan,
  };
}

function buildTrailingAssistantPatchDebugFinalLogPlanContract<
  PayloadPlan extends Record<string, unknown>,
>(
  finalLogInputs: TrailingAssistantPatchDebugFinalLogInputs<PayloadPlan>,
): TrailingAssistantPatchDebugFinalLogPlanContract<PayloadPlan> {
  return {
    finalLogInputs,
  };
}

function buildTrailingAssistantPatchDebugFinalLogPlanFromInputs<
  Label extends string,
  PayloadPlan extends Record<string, unknown>,
>(
  label: Label,
  inputs: TrailingAssistantPatchDebugFinalLogInputs<PayloadPlan>,
): TrailingAssistantPatchDebugLogPlan<Label> {
  const payloadContract =
    buildTrailingAssistantPatchDebugFinalLogPayloadContractFromInputs(inputs);
  return buildTrailingAssistantPatchDebugFinalLogPlan(
    label,
    buildTrailingAssistantPatchDebugFinalLogPayload(payloadContract),
  );
}

function buildTrailingAssistantPatchDebugFinalLogPlan<Label extends string>(
  label: Label,
  payload: Record<string, unknown>,
): TrailingAssistantPatchDebugLogPlan<Label> {
  return {
    label,
    payload,
  };
}

function buildTrailingAssistantPatchDebugFinalLogPayloadContractFromInputs<
  PayloadPlan extends Record<string, unknown>,
>(
  inputs: TrailingAssistantPatchDebugFinalLogInputs<PayloadPlan>,
): TrailingAssistantPatchDebugFinalLogPayloadContract<PayloadPlan> {
  return {
    tabId: inputs.tabId,
    payloadPlan: inputs.payloadPlan,
  };
}

function buildTrailingAssistantPatchDebugFinalLogPayload<
  PayloadPlan extends Record<string, unknown>,
>(
  payloadContract: TrailingAssistantPatchDebugFinalLogPayloadContract<PayloadPlan>,
): Record<string, unknown> {
  return {
    tabId: payloadContract.tabId,
    ...payloadContract.payloadPlan,
  };
}

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
