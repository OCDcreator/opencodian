export interface ModelSelectorSelection {
  provider: string;
  model: string;
}

export type ModelSelectorModelAvailability = 'runtime' | 'configured-only';

export interface ModelSelectorModel {
  id: string;
  name: string;
  contextWindow?: number;
  variants?: string[];
  availability?: ModelSelectorModelAvailability;
  availabilityLabel?: string;
}

export interface ModelSelectorProvider {
  id: string;
  name: string;
  models: ModelSelectorModel[];
}

export interface ModelSelectorKnownModelInfo {
  providerName?: string;
  modelName?: string;
  contextWindow?: number;
  variants?: string[];
}

export interface ModelSelectorAvailableModelInfo extends ModelSelectorSelection, ModelSelectorKnownModelInfo {
  label: string;
  providerName: string;
  modelName: string;
}

export type ModelSelectorOptionValue = `${string}::${string}`;

export interface ModelSelectorDisplayResolution {
  status: 'available' | 'unconfigured' | 'unavailable';
  providerName?: string;
  modelName?: string;
}

export interface ModelSelectorDisplayState {
  text: string;
  title: string;
  iconLabel: string;
  isUnavailable: boolean;
  isUnconfigured: boolean;
}

export interface ModelSelectorRenderTexts {
  loading: string;
  noModels: string;
  noModelsFound: string;
  noModelsAvailable: string;
  configuredOnlyBadge: string;
  configuredOnlyTitle: string;
}
