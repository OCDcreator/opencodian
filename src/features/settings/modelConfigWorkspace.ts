import { requestUrl } from 'obsidian';

import type {
  OpencodeModelConfigSubset,
  OpencodeProviderConfig,
  OpencodeProviderModelConfig,
} from '../../core/types';

export type ProviderInterfaceFormatId =
  | 'openai-responses'
  | 'openai-compatible'
  | 'anthropic'
  | 'amazon-bedrock'
  | 'google-gemini'
  | 'custom';

export interface ProviderInterfaceFormatOption {
  id: ProviderInterfaceFormatId;
  npm: string | null;
  labelKey: string;
  descriptionKey: string;
  defaultBaseUrl: string;
  apiKeyPlaceholder: string;
  baseUrlPlaceholder: string;
  canFetchModels: boolean;
}

export interface KeyValueFieldState {
  uid: string;
  key: string;
  value: string;
}

export interface ModelFormState {
  uid: string;
  id: string;
  name: string;
  context: string;
  output: string;
  enabled: boolean;
  options: KeyValueFieldState[];
  extraFields: KeyValueFieldState[];
  raw: OpencodeProviderModelConfig;
}

export interface ProviderFormState {
  uid: string;
  id: string;
  name: string;
  interfaceFormat: ProviderInterfaceFormatId;
  customNpm: string;
  baseURL: string;
  apiKey: string;
  enabled: boolean;
  extraOptions: KeyValueFieldState[];
  models: ModelFormState[];
  raw: OpencodeProviderConfig;
}

export interface HydratedWorkspaceState {
  modelValue: string;
  smallModelValue: string;
  providers: ProviderFormState[];
}

export interface FetchedProviderModelCandidate {
  id: string;
  name: string;
  context?: number;
  output?: number;
}

export const DEFAULT_PROVIDER_INTERFACE_FORMAT: ProviderInterfaceFormatId = 'openai-compatible';
export const PROVIDER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PROVIDER_INTERFACE_FORMAT_OPTIONS: ProviderInterfaceFormatOption[] = [
  {
    id: 'openai-responses',
    npm: '@ai-sdk/openai',
    labelKey: 'settings.model.visualEditor.interfaceFormat.openaiResponses',
    descriptionKey: 'settings.model.visualEditor.interfaceFormat.openaiResponsesDesc',
    defaultBaseUrl: 'https://api.openai.com/v1',
    apiKeyPlaceholder: 'sk-...',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    canFetchModels: true,
  },
  {
    id: 'openai-compatible',
    npm: '@ai-sdk/openai-compatible',
    labelKey: 'settings.model.visualEditor.interfaceFormat.openaiCompatible',
    descriptionKey: 'settings.model.visualEditor.interfaceFormat.openaiCompatibleDesc',
    defaultBaseUrl: 'https://api.example.com/v1',
    apiKeyPlaceholder: 'sk-...',
    baseUrlPlaceholder: 'https://api.example.com/v1',
    canFetchModels: true,
  },
  {
    id: 'anthropic',
    npm: '@ai-sdk/anthropic',
    labelKey: 'settings.model.visualEditor.interfaceFormat.anthropic',
    descriptionKey: 'settings.model.visualEditor.interfaceFormat.anthropicDesc',
    defaultBaseUrl: 'https://api.anthropic.com',
    apiKeyPlaceholder: 'sk-ant-...',
    baseUrlPlaceholder: 'https://api.anthropic.com',
    canFetchModels: true,
  },
  {
    id: 'amazon-bedrock',
    npm: '@ai-sdk/amazon-bedrock',
    labelKey: 'settings.model.visualEditor.interfaceFormat.amazonBedrock',
    descriptionKey: 'settings.model.visualEditor.interfaceFormat.amazonBedrockDesc',
    defaultBaseUrl: '',
    apiKeyPlaceholder: '',
    baseUrlPlaceholder: 'AWS region / runtime endpoint',
    canFetchModels: false,
  },
  {
    id: 'google-gemini',
    npm: '@ai-sdk/google',
    labelKey: 'settings.model.visualEditor.interfaceFormat.googleGemini',
    descriptionKey: 'settings.model.visualEditor.interfaceFormat.googleGeminiDesc',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    apiKeyPlaceholder: 'AIza...',
    baseUrlPlaceholder: 'https://generativelanguage.googleapis.com',
    canFetchModels: true,
  },
  {
    id: 'custom',
    npm: null,
    labelKey: 'settings.model.visualEditor.interfaceFormat.custom',
    descriptionKey: 'settings.model.visualEditor.interfaceFormat.customDesc',
    defaultBaseUrl: '',
    apiKeyPlaceholder: '',
    baseUrlPlaceholder: 'https://api.example.com/v1',
    canFetchModels: true,
  },
];

const PROVIDER_INTERFACE_FORMAT_BY_NPM = new Map<string, ProviderInterfaceFormatId>(
  PROVIDER_INTERFACE_FORMAT_OPTIONS
    .filter((option): option is ProviderInterfaceFormatOption & { npm: string } => typeof option.npm === 'string')
    .map((option) => [option.npm, option.id]),
);

const KNOWN_PROVIDER_OPTION_KEYS = new Set(['baseURL', 'apiKey']);
const KNOWN_MODEL_EXTRA_KEYS = new Set(['name', 'limit', 'options']);

let uidCounter = 0;

function nextUid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${uidCounter}`;
}

export function resolveInterfaceFormatState(npm: unknown): Pick<ProviderFormState, 'interfaceFormat' | 'customNpm'> {
  if (typeof npm !== 'string') {
    return {
      interfaceFormat: DEFAULT_PROVIDER_INTERFACE_FORMAT,
      customNpm: '',
    };
  }

  const normalized = npm.trim();
  const knownFormat = PROVIDER_INTERFACE_FORMAT_BY_NPM.get(normalized);
  if (knownFormat) {
    return {
      interfaceFormat: knownFormat,
      customNpm: '',
    };
  }

  return {
    interfaceFormat: 'custom',
    customNpm: normalized,
  };
}

export function resolveNpmForInterfaceFormat(provider: Pick<ProviderFormState, 'interfaceFormat' | 'customNpm'>): string {
  const option = PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === provider.interfaceFormat)
    ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1];
  if (option.npm) {
    return option.npm;
  }
  return provider.customNpm.trim() || '@ai-sdk/openai-compatible';
}

export function extractProviderExtraOptions(options: unknown): KeyValueFieldState[] {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    return [];
  }

  return Object.entries(options)
    .filter(([key]) => !KNOWN_PROVIDER_OPTION_KEYS.has(key))
    .map(([key, value]) => ({
      uid: nextUid('provider-option'),
      key,
      value: serializeUnknownValue(value),
    }));
}

export function extractModelOptions(model: OpencodeProviderModelConfig): KeyValueFieldState[] {
  if (typeof model.options !== 'object' || model.options === null || Array.isArray(model.options)) {
    return [];
  }

  return Object.entries(model.options).map(([key, value]) => ({
    uid: nextUid('model-option'),
    key,
    value: serializeUnknownValue(value),
  }));
}

export function extractModelExtraFields(model: OpencodeProviderModelConfig): KeyValueFieldState[] {
  return Object.entries(model)
    .filter(([key]) => !KNOWN_MODEL_EXTRA_KEYS.has(key))
    .map(([key, value]) => ({
      uid: nextUid('model-extra'),
      key,
      value: serializeUnknownValue(value),
    }));
}

export function hydrateWorkspaceState(
  config: OpencodeModelConfigSubset,
  disabledModelRefs: Iterable<string>,
): HydratedWorkspaceState {
  const disabledModelRefSet = new Set(Array.from(disabledModelRefs));
  const providers = Object.entries(config.provider ?? {}).map(([providerId, provider]) => ({
    uid: nextUid('provider'),
    ...resolveInterfaceFormatState(provider.npm),
    id: providerId,
    name: typeof provider.name === 'string' ? provider.name : '',
    baseURL: readString(provider.options, 'baseURL'),
    apiKey: readString(provider.options, 'apiKey'),
    enabled: isProviderEnabledInSubset(config, providerId),
    extraOptions: extractProviderExtraOptions(provider.options),
    models: Object.entries(provider.models ?? {}).map(([modelId, model]) => ({
      uid: nextUid('model'),
      id: modelId,
      name: typeof model.name === 'string' ? model.name : '',
      context: readNumber(model.limit, 'context'),
      output: readNumber(model.limit, 'output'),
      enabled: !disabledModelRefSet.has(`${providerId}/${modelId}`),
      options: extractModelOptions(model),
      extraFields: extractModelExtraFields(model),
      raw: model,
    })),
    raw: provider,
  }));

  return {
    modelValue: config.model ?? '',
    smallModelValue: config.small_model ?? '',
    providers,
  };
}

export function createEmptyProvider(defaultFormat: ProviderInterfaceFormatId = DEFAULT_PROVIDER_INTERFACE_FORMAT): ProviderFormState {
  const preset = PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === defaultFormat)
    ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1];
  return {
    uid: nextUid('provider'),
    id: '',
    name: '',
    interfaceFormat: preset.id,
    customNpm: '',
    baseURL: '',
    apiKey: '',
    enabled: true,
    extraOptions: [],
    models: [],
    raw: {},
  };
}

export function createEmptyModel(): ModelFormState {
  return {
    uid: nextUid('model'),
    id: '',
    name: '',
    context: '',
    output: '',
    enabled: true,
    options: [],
    extraFields: [],
    raw: {},
  };
}

export function serializeUnknownValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value ?? null, null, 2);
}

export function parseLooseValue(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.length) {
    return '';
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export function buildConfigPreview(
  modelValue: string,
  smallModelValue: string,
  providers: ProviderFormState[],
  availabilityConfig: Pick<OpencodeModelConfigSubset, 'enabled_providers' | 'disabled_providers'>,
): string {
  const providerEntries = providers.reduce<Record<string, Record<string, unknown>>>((result, provider) => {
    const providerId = provider.id.trim();
    if (!providerId) {
      return result;
    }

    const providerEntry: Record<string, unknown> = {};
    const providerName = provider.name.trim();
    if (providerName) {
      providerEntry.name = providerName;
    }
    providerEntry.npm = resolveNpmForInterfaceFormat(provider);

    const options: Record<string, unknown> = {};
    if (provider.baseURL.trim()) {
      options.baseURL = provider.baseURL.trim();
    }
    if (provider.apiKey.trim()) {
      options.apiKey = provider.apiKey.trim();
    }
    for (const entry of provider.extraOptions) {
      const key = entry.key.trim();
      if (!key) {
        continue;
      }
      options[key] = parseLooseValue(entry.value);
    }
    if (Object.keys(options).length > 0) {
      providerEntry.options = options;
    }

    const models = provider.models.reduce<Record<string, Record<string, unknown>>>((modelResult, model) => {
      const modelId = model.id.trim();
      if (!modelId) {
        return modelResult;
      }

      const modelEntry: Record<string, unknown> = {};
      if (model.name.trim()) {
        modelEntry.name = model.name.trim();
      }

      const limit: Record<string, number> = {};
      if (model.context.trim()) {
        const parsed = Number(model.context.trim());
        if (Number.isFinite(parsed) && parsed > 0) {
          limit.context = parsed;
        }
      }
      if (model.output.trim()) {
        const parsed = Number(model.output.trim());
        if (Number.isFinite(parsed) && parsed > 0) {
          limit.output = parsed;
        }
      }
      if (Object.keys(limit).length > 0) {
        modelEntry.limit = limit;
      }

      if (model.options.length > 0) {
        const modelOptions: Record<string, unknown> = {};
        for (const entry of model.options) {
          const key = entry.key.trim();
          if (!key) {
            continue;
          }
          modelOptions[key] = parseLooseValue(entry.value);
        }
        if (Object.keys(modelOptions).length > 0) {
          modelEntry.options = modelOptions;
        }
      }

      for (const entry of model.extraFields) {
        const key = entry.key.trim();
        if (!key) {
          continue;
        }
        modelEntry[key] = parseLooseValue(entry.value);
      }

      modelResult[modelId] = modelEntry;
      return modelResult;
    }, {});

    providerEntry.models = models;
    result[providerId] = providerEntry;
    return result;
  }, {});

  const preview: OpencodeModelConfigSubset = {
    model: modelValue.trim() || undefined,
    small_model: smallModelValue.trim() || undefined,
    provider: providerEntries,
    enabled_providers: availabilityConfig.enabled_providers,
    disabled_providers: availabilityConfig.disabled_providers,
  };
  return JSON.stringify(preview, null, 2);
}

export async function fetchProviderModels(
  interfaceFormat: ProviderInterfaceFormatId,
  baseURL: string,
  apiKey: string,
): Promise<FetchedProviderModelCandidate[]> {
  const normalizedBaseURL = baseURL.trim().replace(/\/+$/, '');
  const trimmedApiKey = apiKey.trim();
  if (!normalizedBaseURL) {
    throw new Error('missing-base-url');
  }
  if (!trimmedApiKey) {
    throw new Error('missing-api-key');
  }

  switch (interfaceFormat) {
    case 'amazon-bedrock':
      throw new Error('unsupported-bedrock-fetch');
    case 'google-gemini': {
      const url = `${normalizedBaseURL}/v1beta/models?key=${encodeURIComponent(trimmedApiKey)}`;
      const response = await requestUrl({
        url,
        method: 'GET',
        throw: false,
      });
      if (response.status >= 400) {
        throw new Error(response.text || `HTTP ${response.status}`);
      }
      return normalizeFetchedModelsFromResponse(interfaceFormat, response.json);
    }
    case 'anthropic': {
      const base = normalizedBaseURL.endsWith('/v1')
        ? normalizedBaseURL.slice(0, -3)
        : normalizedBaseURL;
      const response = await requestUrl({
        url: `${base}/v1/models`,
        method: 'GET',
        headers: {
          'x-api-key': trimmedApiKey,
          'anthropic-version': '2023-06-01',
        },
        throw: false,
      });
      if (response.status >= 400) {
        throw new Error(response.text || `HTTP ${response.status}`);
      }
      return normalizeFetchedModelsFromResponse(interfaceFormat, response.json);
    }
    case 'openai-responses':
    case 'openai-compatible':
    case 'custom':
    default: {
      const response = await requestUrl({
        url: `${normalizedBaseURL}/models`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmedApiKey}`,
        },
        throw: false,
      });
      if (response.status >= 400) {
        throw new Error(response.text || `HTTP ${response.status}`);
      }
      return normalizeFetchedModelsFromResponse(interfaceFormat, response.json);
    }
  }
}

export function normalizeFetchedModelsFromResponse(
  interfaceFormat: ProviderInterfaceFormatId,
  payload: unknown,
): FetchedProviderModelCandidate[] {
  if (interfaceFormat === 'google-gemini') {
    const models = Array.isArray((payload as { models?: unknown[] })?.models)
      ? ((payload as { models: unknown[] }).models)
      : [];
    return models
      .map((entry) => {
        if (typeof entry !== 'object' || entry === null) {
          return null;
        }
        const candidate = entry as Record<string, unknown>;
        const rawName = typeof candidate.name === 'string' ? candidate.name : '';
        const id = rawName.replace(/^models\//, '').trim();
        if (!id) {
          return null;
        }
        return {
          id,
          name: typeof candidate.displayName === 'string' ? candidate.displayName : id,
          context: typeof candidate.inputTokenLimit === 'number' ? candidate.inputTokenLimit : undefined,
          output: typeof candidate.outputTokenLimit === 'number' ? candidate.outputTokenLimit : undefined,
        };
      })
      .filter((entry): entry is FetchedProviderModelCandidate => entry !== null);
  }

  if (!Array.isArray((payload as { data?: unknown[] })?.data)) {
    return [];
  }

  return ((payload as { data: unknown[] }).data)
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return null;
      }
      const candidate = entry as Record<string, unknown>;
      const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
      if (!id) {
        return null;
      }

      const context = typeof candidate.context_window === 'number'
        ? candidate.context_window
        : typeof candidate.contextWindow === 'number'
          ? candidate.contextWindow
          : undefined;
      const output = typeof candidate.max_output_tokens === 'number'
        ? candidate.max_output_tokens
        : typeof candidate.outputTokenLimit === 'number'
          ? candidate.outputTokenLimit
          : undefined;

      return {
        id,
        name: typeof candidate.name === 'string' ? candidate.name : id,
        context,
        output,
      };
    })
    .filter((entry): entry is FetchedProviderModelCandidate => entry !== null);
}

function readString(record: unknown, key: string): string {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return '';
  }
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function readNumber(record: unknown, key: string): string {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return '';
  }
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'number' ? String(value) : '';
}

function isProviderEnabledInSubset(
  subset: Pick<OpencodeModelConfigSubset, 'enabled_providers' | 'disabled_providers'>,
  providerId: string,
): boolean {
  const enabledProviders = Array.isArray(subset.enabled_providers)
    ? new Set(subset.enabled_providers.map((entry) => entry.trim()).filter(Boolean))
    : null;
  const disabledProviders = new Set((subset.disabled_providers ?? []).map((entry) => entry.trim()).filter(Boolean));

  if (enabledProviders && !enabledProviders.has(providerId)) {
    return false;
  }
  return !disabledProviders.has(providerId);
}
