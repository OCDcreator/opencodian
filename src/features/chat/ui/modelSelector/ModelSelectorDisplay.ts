import { formatModelReference } from '../../../../core/config/modelConfig';
import type {
  ModelSelectorDisplayResolution,
  ModelSelectorDisplayState,
  ModelSelectorKnownModelInfo,
  ModelSelectorSelection,
} from './types';

export interface BuildModelSelectorDisplayStateOptions {
  currentSelection: ModelSelectorSelection | null;
  resolution: ModelSelectorDisplayResolution;
  knownModelInfo: ModelSelectorKnownModelInfo | null;
  hasLoadedModelCatalog: boolean;
  availableProviderCount: number;
  unavailableTitle: string;
  unconfiguredLabel: string;
}

export function buildModelSelectorDisplayState({
  currentSelection,
  resolution,
  knownModelInfo,
  hasLoadedModelCatalog,
  availableProviderCount,
  unavailableTitle,
  unconfiguredLabel,
}: BuildModelSelectorDisplayStateOptions): ModelSelectorDisplayState {
  const text = currentSelection
    ? (knownModelInfo?.modelName || resolution.modelName || currentSelection.model)
    : unconfiguredLabel;

  const emptyStateTitle = hasLoadedModelCatalog && availableProviderCount === 0
    ? unavailableTitle
    : unconfiguredLabel;

  const title = currentSelection
    ? formatModelReference(
        knownModelInfo?.providerName || resolution.providerName || currentSelection.provider,
        knownModelInfo?.modelName || resolution.modelName || currentSelection.model,
      ) || emptyStateTitle
    : emptyStateTitle;

  return {
    text,
    title,
    iconLabel: currentSelection
      ? (knownModelInfo?.providerName || resolution.providerName || currentSelection.provider)
      : unconfiguredLabel,
    isUnavailable: resolution.status === 'unavailable',
    isUnconfigured: !currentSelection,
  };
}
