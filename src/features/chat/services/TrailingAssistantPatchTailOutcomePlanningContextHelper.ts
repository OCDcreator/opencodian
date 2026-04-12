import {
  buildTrailingAssistantPatchTailOutcomePlanningContextShape,
  type TrailingAssistantPatchTailOutcomePlanningContext,
} from './TrailingAssistantPatchTailOutcomePlanningContextShapeHelper';
import {
  buildTrailingAssistantPatchTailOutcomePlanningContextInputs,
} from './TrailingAssistantPatchTailOutcomePlanningContextInputsHelper';
import type {
  TrailingAssistantPatchTailOutcomePlanningContextInputsSource as TrailingAssistantPatchTailOutcomePlanningContextSource,
} from './TrailingAssistantPatchTailOutcomePlanningContextInputsHelper';

export type { TrailingAssistantPatchTailOutcomePlanningContext } from './TrailingAssistantPatchTailOutcomePlanningContextShapeHelper';
export type { TrailingAssistantPatchTailOutcomePlanningContextInputsSource as TrailingAssistantPatchTailOutcomePlanningContextSource } from './TrailingAssistantPatchTailOutcomePlanningContextInputsHelper';

export function buildTrailingAssistantPatchTailOutcomePlanningContext(
  source: TrailingAssistantPatchTailOutcomePlanningContextSource,
): TrailingAssistantPatchTailOutcomePlanningContext {
  return buildTrailingAssistantPatchTailOutcomePlanningContextShape(
    buildTrailingAssistantPatchTailOutcomePlanningContextInputs(source),
  );
}
