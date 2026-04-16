import type { TabId } from '../tabs';

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

export type TrailingAssistantPatchDebugLogPlan<Label extends string> = {
  label: Label;
  payload: Record<string, unknown>;
};

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
