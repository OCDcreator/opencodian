import type { TabId } from '../tabs';
import {
  buildTrailingAssistantPatchDebugFinalLogPlanFromTabId,
  type TrailingAssistantPatchDebugLogPlan,
} from './TrailingAssistantPatchDebugLogHelper';

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
