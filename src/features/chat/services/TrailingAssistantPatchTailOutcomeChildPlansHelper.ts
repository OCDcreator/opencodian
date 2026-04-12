import {
  buildTrailingAssistantPatchTailOutcomePlans,
  type TrailingAssistantPatchTailOutcomePlanParts,
  type TrailingAssistantPatchTailOutcomePlans,
} from './TrailingAssistantPatchTailOutcomePlanHelper';
import { buildTrailingAssistantPatchTailOutcomePlanParts } from './TrailingAssistantPatchTailOutcomePlanPartsHelper';

export type TrailingAssistantPatchTailOutcomeChildPlans =
  TrailingAssistantPatchTailOutcomePlanParts;

export function buildTrailingAssistantPatchTailOutcomePlansFromChildPlans(
  childPlans: TrailingAssistantPatchTailOutcomeChildPlans,
): TrailingAssistantPatchTailOutcomePlans {
  return buildTrailingAssistantPatchTailOutcomePlans(
    buildTrailingAssistantPatchTailOutcomePlanParts(childPlans),
  );
}
