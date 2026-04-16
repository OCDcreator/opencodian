import type {
  TrailingAssistantPatchTailOutcomePlanningContextInputsSource as TrailingAssistantPatchTailOutcomePlanningContextSource,
} from './TrailingAssistantPatchTailOutcomePlanningContextInputsHelper';
import {
  buildTrailingAssistantPatchTailOutcomePlanningContextInputs,
} from './TrailingAssistantPatchTailOutcomePlanningContextInputsHelper';
import {
  buildTrailingAssistantPatchTailOutcomePlanningContextShape,
  type TrailingAssistantPatchTailOutcomePlanningContext,
} from './TrailingAssistantPatchTailOutcomePlanningContextShapeHelper';

export type { TrailingAssistantPatchTailOutcomePlanningContextInputsSource as TrailingAssistantPatchTailOutcomePlanningContextSource } from './TrailingAssistantPatchTailOutcomePlanningContextInputsHelper';
export type { TrailingAssistantPatchTailOutcomePlanningContext } from './TrailingAssistantPatchTailOutcomePlanningContextShapeHelper';

export function buildTrailingAssistantPatchTailOutcomePlanningContext(
  source: TrailingAssistantPatchTailOutcomePlanningContextSource,
): TrailingAssistantPatchTailOutcomePlanningContext {
  return buildTrailingAssistantPatchTailOutcomePlanningContextShape(
    buildTrailingAssistantPatchTailOutcomePlanningContextInputs(source),
  );
}
