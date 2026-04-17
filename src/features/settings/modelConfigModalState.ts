import type { OpencodeProviderConfig } from '../../core/types';
import { t } from '../../i18n';
import {
  extractModelExtraFields,
  extractModelOptions,
  extractModelVariants,
  extractProviderExtraOptions,
  type KeyValueFieldState,
  type ProviderFormState,
  resolveInterfaceFormatState,
} from './modelConfigWorkspace';

export type ModelConfigModalFlow = 'workspace' | 'add-provider';

export interface ModelConfigModalSnapshotInput {
  flow: ModelConfigModalFlow;
  modelValue: string;
  smallModelValue: string;
  jsonDraftValue: string;
  providers: ProviderFormState[];
}

export function createModelConfigModalSnapshot(input: ModelConfigModalSnapshotInput): string {
  return JSON.stringify({
    modelValue: input.modelValue,
    smallModelValue: input.smallModelValue,
    jsonDraftValue: input.flow === 'add-provider' ? input.jsonDraftValue : undefined,
    providers: input.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      interfaceFormat: provider.interfaceFormat,
      customNpm: provider.customNpm,
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
      enabled: provider.enabled,
      extraOptions: provider.extraOptions.map((entry) => ({ key: entry.key, value: entry.value })),
      models: provider.models.map((model) => ({
        id: model.id,
        name: model.name,
        context: model.context,
        output: model.output,
        enabled: model.enabled,
        options: model.options.map((entry) => ({ key: entry.key, value: entry.value })),
        variants: model.variants.map((entry) => ({ key: entry.key, value: entry.value })),
        extraFields: model.extraFields.map((entry) => ({ key: entry.key, value: entry.value })),
      })),
    })),
  });
}

export function createModelConfigKeyValueState(key = '', value = ''): KeyValueFieldState {
  return {
    uid: `field-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    key,
    value,
  };
}

export function isBlankProviderState(provider: ProviderFormState): boolean {
  return !provider.id.trim()
    && !provider.name.trim()
    && !provider.baseURL.trim()
    && !provider.apiKey.trim()
    && provider.extraOptions.every((entry) => !entry.key.trim() && !entry.value.trim())
    && provider.models.length === 0;
}

export function resolveModelConfigJsonDraftValue(
  previewValue: string | null | undefined,
  jsonDraftValue: string,
): string {
  return previewValue ?? jsonDraftValue;
}

export function parseAddProviderJsonDraft(rawValue: string): OpencodeProviderConfig {
  const parsed = tryParseAddProviderJsonDraft(rawValue.trim());
  if (!rawValue.trim() || !parsed) {
    throw new Error(t('settings.model.jsonEditor.invalidJson'));
  }
  return parsed;
}

export function tryParseAddProviderJsonDraft(rawValue: string): OpencodeProviderConfig | null {
  if (!rawValue.trim()) {
    return null;
  }

  const parsed = JSON.parse(rawValue) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(t('settings.model.jsonEditor.providerObject'));
  }
  return parsed as OpencodeProviderConfig;
}

export function syncProviderFormFromJsonDraft(provider: ProviderFormState, draft: OpencodeProviderConfig): void {
  const interfaceState = resolveInterfaceFormatState(draft.npm);
  const existingModelEnabledMap = new Map(provider.models.map((model) => [model.id, model.enabled]));

  provider.interfaceFormat = interfaceState.interfaceFormat;
  provider.customNpm = interfaceState.customNpm;
  provider.baseURL = readProviderOptionString(draft.options, 'baseURL');
  provider.apiKey = readProviderOptionString(draft.options, 'apiKey');
  provider.extraOptions = extractProviderExtraOptions(draft.options);
  provider.models = Object.entries(draft.models ?? {}).map(([modelId, model]) => ({
    uid: `model-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    id: modelId,
    name: typeof model.name === 'string' ? model.name : '',
    context: readModelLimitNumber(model.limit, 'context'),
    output: readModelLimitNumber(model.limit, 'output'),
    enabled: existingModelEnabledMap.get(modelId) ?? true,
    options: extractModelOptions(model),
    variants: extractModelVariants(model),
    extraFields: extractModelExtraFields(model),
    raw: model,
  }));
  provider.raw = draft;
}

export function readProviderOptionString(options: unknown, key: string): string {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    return '';
  }
  const value = (options as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

export function readModelLimitNumber(limit: unknown, key: 'context' | 'output'): string {
  if (typeof limit !== 'object' || limit === null || Array.isArray(limit)) {
    return '';
  }
  const value = (limit as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}
