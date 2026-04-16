import type {
  TrailingAssistantPatchTailStatePlanningContextInputsSource as TrailingAssistantPatchTailStatePlanningContextSource,
} from './TrailingAssistantPatchTailStatePlanningContextInputsHelper';
import {
  buildTrailingAssistantPatchTailStatePlanningContextInputs,
} from './TrailingAssistantPatchTailStatePlanningContextInputsHelper';
import {
  buildTrailingAssistantPatchTailStatePlanningContextShape,
  type TrailingAssistantPatchTailStatePlanningContext,
} from './TrailingAssistantPatchTailStatePlanningContextShapeHelper';

export type { TrailingAssistantPatchTailStatePlanningContextInputsSource as TrailingAssistantPatchTailStatePlanningContextSource } from './TrailingAssistantPatchTailStatePlanningContextInputsHelper';
export type { TrailingAssistantPatchTailStatePlanningContext } from './TrailingAssistantPatchTailStatePlanningContextShapeHelper';

export function buildTrailingAssistantPatchTailStatePlanningContext(
  source: TrailingAssistantPatchTailStatePlanningContextSource,
): TrailingAssistantPatchTailStatePlanningContext {
  return buildTrailingAssistantPatchTailStatePlanningContextShape(
    buildTrailingAssistantPatchTailStatePlanningContextInputs(source),
  );
}
