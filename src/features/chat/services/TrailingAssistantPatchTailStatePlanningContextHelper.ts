import {
  buildTrailingAssistantPatchTailStatePlanningContextShape,
  type TrailingAssistantPatchTailStatePlanningContext,
} from './TrailingAssistantPatchTailStatePlanningContextShapeHelper';
import {
  buildTrailingAssistantPatchTailStatePlanningContextInputs,
} from './TrailingAssistantPatchTailStatePlanningContextInputsHelper';
import type {
  TrailingAssistantPatchTailStatePlanningContextInputsSource as TrailingAssistantPatchTailStatePlanningContextSource,
} from './TrailingAssistantPatchTailStatePlanningContextInputsHelper';

export type { TrailingAssistantPatchTailStatePlanningContext } from './TrailingAssistantPatchTailStatePlanningContextShapeHelper';
export type { TrailingAssistantPatchTailStatePlanningContextInputsSource as TrailingAssistantPatchTailStatePlanningContextSource } from './TrailingAssistantPatchTailStatePlanningContextInputsHelper';

export function buildTrailingAssistantPatchTailStatePlanningContext(
  source: TrailingAssistantPatchTailStatePlanningContextSource,
): TrailingAssistantPatchTailStatePlanningContext {
  return buildTrailingAssistantPatchTailStatePlanningContextShape(
    buildTrailingAssistantPatchTailStatePlanningContextInputs(source),
  );
}
