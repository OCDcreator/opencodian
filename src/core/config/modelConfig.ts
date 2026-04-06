import type {
  OpencodeConfig,
  OpencodeModelConfigSubset,
  OpencodeProviderConfig,
  OpencodeProviderModelConfig,
} from '../types';

export const OPENCODE_SCHEMA_URL = 'https://opencode.ai/config.json';

export type ModelCatalogSource = 'local' | 'server' | 'merge';

export interface ModelCatalogModel {
  id: string;
  name: string;
  contextWindow?: number;
  source: ModelCatalogSource;
  existsInLocal: boolean;
  existsInServer: boolean;
}

export interface ModelCatalogProvider {
  id: string;
  name: string;
  models: ModelCatalogModel[];
  source: ModelCatalogSource;
  existsInLocal: boolean;
  existsInServer: boolean;
}

export interface ModelCatalog {
  providers: ModelCatalogProvider[];
  defaults: Record<string, string>;
}

export interface ModelReference {
  provider: string;
  model: string;
  ref: string;
}

export type ResolvedModelSelectionStatus = 'available' | 'unconfigured' | 'unavailable';

export interface ResolvedModelSelection {
  status: ResolvedModelSelectionStatus;
  provider: string;
  model: string;
  ref: string;
  providerName?: string;
  modelName?: string;
  contextWindow?: number;
}

const MODEL_KEYS: Array<keyof OpencodeModelConfigSubset> = [
  'model',
  'small_model',
  'provider',
  'enabled_providers',
  'disabled_providers',
];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stripJsonComments(text: string): string {
  let result = '';
  let inString = false;
  let escape = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];

    if (inLineComment) {
      if (current === '\n') {
        inLineComment = false;
        result += current;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      result += current;
      if (escape) {
        escape = false;
        continue;
      }
      if (current === '\\') {
        escape = true;
        continue;
      }
      if (current === '"') {
        inString = false;
      }
      continue;
    }

    if (current === '"') {
      inString = true;
      result += current;
      continue;
    }

    if (current === '/' && next === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (current === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    result += current;
  }

  return result;
}

export function parseOpencodeConfigText(text: string): OpencodeConfig {
  return JSON.parse(stripJsonComments(text)) as OpencodeConfig;
}

export function extractModelConfig(config: OpencodeConfig): OpencodeModelConfigSubset {
  const next: OpencodeModelConfigSubset = {};

  for (const key of MODEL_KEYS) {
    const value = config[key];
    if (value === undefined) {
      continue;
    }

    if (key === 'provider' && isRecord(value)) {
      next.provider = JSON.parse(JSON.stringify(value)) as Record<string, OpencodeProviderConfig>;
      continue;
    }

    if ((key === 'enabled_providers' || key === 'disabled_providers') && Array.isArray(value)) {
      next[key] = [...value].filter((item): item is string => typeof item === 'string');
      continue;
    }

    if ((key === 'model' || key === 'small_model') && typeof value === 'string') {
      next[key] = value;
    }
  }

  return next;
}

export function applyModelConfig(
  config: OpencodeConfig,
  subset: OpencodeModelConfigSubset,
): OpencodeConfig {
  const next: OpencodeConfig = { ...config };

  for (const key of MODEL_KEYS) {
    delete next[key];
  }

  const cleaned = cleanupModelConfig(subset);
  return {
    ...next,
    ...cleaned,
  };
}

export function cleanupModelConfig(subset: OpencodeModelConfigSubset): OpencodeModelConfigSubset {
  const next: OpencodeModelConfigSubset = {};

  if (typeof subset.model === 'string' && subset.model.trim()) {
    next.model = subset.model.trim();
  }

  if (typeof subset.small_model === 'string' && subset.small_model.trim()) {
    next.small_model = subset.small_model.trim();
  }

  if (isRecord(subset.provider) && Object.keys(subset.provider).length > 0) {
    next.provider = JSON.parse(JSON.stringify(subset.provider)) as Record<string, OpencodeProviderConfig>;
  }

  if (Array.isArray(subset.enabled_providers)) {
    const values = uniqueStrings(subset.enabled_providers);
    next.enabled_providers = values;
  }

  if (Array.isArray(subset.disabled_providers)) {
    const values = uniqueStrings(subset.disabled_providers);
    next.disabled_providers = values;
  }

  return next;
}

export function buildCatalogFromConfig(
  subset: OpencodeModelConfigSubset,
  source: 'local' | 'server',
): ModelCatalog {
  const providers = isRecord(subset.provider)
    ? Object.entries(subset.provider)
      .filter((entry): entry is [string, OpencodeProviderConfig] => isRecord(entry[1]))
      .map(([providerId, providerConfig]) => {
        const models = isRecord(providerConfig.models)
          ? Object.entries(providerConfig.models)
            .filter((entry): entry is [string, OpencodeProviderModelConfig] => isRecord(entry[1]))
            .map(([modelId, modelConfig]) => ({
              id: modelId,
              name: typeof modelConfig.name === 'string' && modelConfig.name.trim()
                ? modelConfig.name.trim()
                : modelId,
              contextWindow: typeof modelConfig.limit?.context === 'number'
                ? modelConfig.limit.context
                : undefined,
              source,
              existsInLocal: source === 'local',
              existsInServer: source === 'server',
            }))
          : [];

        return {
          id: providerId,
          name: typeof providerConfig.name === 'string' && providerConfig.name.trim()
            ? providerConfig.name.trim()
            : providerId,
          models,
          source,
          existsInLocal: source === 'local',
          existsInServer: source === 'server',
        };
      })
    : [];

  const defaults: Record<string, string> = {};
  const modelRef = parseModelReference(subset.model);
  if (modelRef) {
    defaults[modelRef.provider] = modelRef.model;
  }

  return {
    providers,
    defaults,
  };
}

export function mergeCatalogs(server: ModelCatalog, local: ModelCatalog): ModelCatalog {
  const providers = new Map<string, ModelCatalogProvider>();

  for (const provider of server.providers) {
    providers.set(provider.id, {
      ...provider,
      models: provider.models.map((model) => ({ ...model })),
    });
  }

  for (const provider of local.providers) {
    const existing = providers.get(provider.id);
    if (!existing) {
      providers.set(provider.id, {
        ...provider,
        source: 'local',
        existsInLocal: true,
        existsInServer: false,
        models: provider.models.map((model) => ({ ...model })),
      });
      continue;
    }

    const models = new Map<string, ModelCatalogModel>();
    for (const model of existing.models) {
      models.set(model.id, { ...model });
    }
    for (const model of provider.models) {
      const existingModel = models.get(model.id);
      if (!existingModel) {
        models.set(model.id, {
          ...model,
          source: 'local',
          existsInLocal: true,
          existsInServer: false,
        });
        continue;
      }

      models.set(model.id, {
        ...existingModel,
        ...model,
        source: 'merge',
        existsInLocal: true,
        existsInServer: true,
      });
    }

    providers.set(provider.id, {
      ...existing,
      ...provider,
      source: 'merge',
      existsInLocal: true,
      existsInServer: true,
      models: [...models.values()].sort((left, right) => left.name.localeCompare(right.name)),
    });
  }

  return {
    providers: [...providers.values()].sort((left, right) => left.name.localeCompare(right.name)),
    defaults: {
      ...server.defaults,
      ...local.defaults,
    },
  };
}

export function parseModelReference(value: string | undefined): { provider: string; model: string } | null {
  if (typeof value !== 'string') {
    return null;
  }

  const slash = value.indexOf('/');
  if (slash <= 0 || slash >= value.length - 1) {
    return null;
  }

  const provider = value.slice(0, slash).trim();
  const model = value.slice(slash + 1).trim();
  if (!provider || !model) {
    return null;
  }

  return { provider, model };
}

export function formatModelReference(
  provider: string | null | undefined,
  model: string | null | undefined,
): string {
  const trimmedProvider = provider?.trim() ?? '';
  const trimmedModel = model?.trim() ?? '';
  return trimmedProvider && trimmedModel ? `${trimmedProvider}/${trimmedModel}` : '';
}

export function collectConfiguredProviderIds(
  subset: Pick<OpencodeModelConfigSubset, 'model' | 'small_model' | 'provider' | 'enabled_providers' | 'disabled_providers'>,
): string[] {
  const providerIds = new Set<string>();

  if (isRecord(subset.provider)) {
    for (const providerId of Object.keys(subset.provider)) {
      const trimmed = providerId.trim();
      if (trimmed) {
        providerIds.add(trimmed);
      }
    }
  }

  for (const modelRef of [parseModelReference(subset.model), parseModelReference(subset.small_model)]) {
    if (modelRef) {
      providerIds.add(modelRef.provider);
    }
  }

  for (const providerId of uniqueStrings(subset.enabled_providers ?? [])) {
    providerIds.add(providerId);
  }

  for (const providerId of uniqueStrings(subset.disabled_providers ?? [])) {
    providerIds.add(providerId);
  }

  return [...providerIds];
}

export function isProviderEnabled(
  subset: Pick<OpencodeModelConfigSubset, 'enabled_providers' | 'disabled_providers'>,
  providerId: string,
): boolean {
  const trimmedProviderId = providerId.trim();
  if (!trimmedProviderId) {
    return false;
  }

  const enabledProviders = Array.isArray(subset.enabled_providers)
    ? new Set(uniqueStrings(subset.enabled_providers))
    : null;
  const disabledProviders = new Set(uniqueStrings(subset.disabled_providers ?? []));

  if (enabledProviders && !enabledProviders.has(trimmedProviderId)) {
    return false;
  }

  return !disabledProviders.has(trimmedProviderId);
}

export function getEnabledProviderIds(
  subset: Pick<OpencodeModelConfigSubset, 'enabled_providers' | 'disabled_providers'>,
  providerIds: Iterable<string>,
): string[] {
  return Array.from(providerIds)
    .map((providerId) => providerId.trim())
    .filter((providerId) => providerId.length > 0)
    .filter((providerId) => isProviderEnabled(subset, providerId));
}

export function setProviderEnabled(
  subset: OpencodeModelConfigSubset,
  providerId: string,
  enabled: boolean,
  knownProviderIds: Iterable<string>,
): OpencodeModelConfigSubset {
  const trimmedProviderId = providerId.trim();
  if (!trimmedProviderId) {
    return cleanupModelConfig(subset);
  }

  const next: OpencodeModelConfigSubset = {
    ...subset,
  };
  const nextDisabledProviders = new Set(uniqueStrings(subset.disabled_providers ?? []));
  const useWhitelistMode = Array.isArray(subset.enabled_providers);

  if (useWhitelistMode) {
    const orderedKnownProviders = uniqueStrings([
      ...Array.from(knownProviderIds),
      ...uniqueStrings(subset.enabled_providers ?? []),
      trimmedProviderId,
    ]);
    const nextEnabledProviders = new Set(uniqueStrings(subset.enabled_providers ?? []));

    if (enabled) {
      nextEnabledProviders.add(trimmedProviderId);
      nextDisabledProviders.delete(trimmedProviderId);
    } else {
      nextEnabledProviders.delete(trimmedProviderId);
    }

    next.enabled_providers = orderedKnownProviders.filter((knownProviderId) => nextEnabledProviders.has(knownProviderId));
    next.disabled_providers = Array.from(nextDisabledProviders);
    return cleanupModelConfig(next);
  }

  if (enabled) {
    nextDisabledProviders.delete(trimmedProviderId);
  } else {
    nextDisabledProviders.add(trimmedProviderId);
  }

  next.disabled_providers = Array.from(nextDisabledProviders);
  return cleanupModelConfig(next);
}

export function filterCatalog(
  catalog: ModelCatalog,
  options: {
    providerConfig?: Pick<OpencodeModelConfigSubset, 'enabled_providers' | 'disabled_providers'>;
    disabledModelRefs?: string[];
  } = {},
): ModelCatalog {
  const disabledModelRefs = new Set(
    (options.disabledModelRefs ?? [])
      .map((ref) => {
        const parsed = parseModelReference(ref);
        return parsed ? formatModelReference(parsed.provider, parsed.model) : '';
      })
      .filter((ref) => ref.length > 0),
  );
  const filteredProviders = catalog.providers.flatMap((provider) => {
    if (options.providerConfig && !isProviderEnabled(options.providerConfig, provider.id)) {
      return [];
    }

    const filteredModels = provider.models
      .filter((model) => !disabledModelRefs.has(formatModelReference(provider.id, model.id)))
      .map((model) => ({ ...model }));
    if (filteredModels.length === 0) {
      return [];
    }

    return [{
      ...provider,
      models: filteredModels,
    }];
  });

  const filteredDefaults = Object.fromEntries(
    Object.entries(catalog.defaults).filter(([providerId, modelId]) => (
      filteredProviders.some((provider) => provider.id === providerId && provider.models.some((model) => model.id === modelId))
    )),
  );

  return {
    providers: filteredProviders,
    defaults: filteredDefaults,
  };
}

export function resolveModelSelection(
  baseCatalog: ModelCatalog | null | undefined,
  effectiveCatalog: ModelCatalog | null | undefined,
  provider: string | null | undefined,
  model: string | null | undefined,
): ResolvedModelSelection {
  const ref = formatModelReference(provider, model);
  if (!ref) {
    return {
      status: 'unconfigured',
      provider: '',
      model: '',
      ref: '',
    };
  }

  const parsedRef = parseModelReference(ref);
  if (!parsedRef) {
    return {
      status: 'unconfigured',
      provider: '',
      model: '',
      ref: '',
    };
  }

  const effectiveEntry = findCatalogModel(effectiveCatalog, parsedRef.provider, parsedRef.model);
  if (effectiveEntry) {
    return {
      status: 'available',
      provider: parsedRef.provider,
      model: parsedRef.model,
      ref,
      providerName: effectiveEntry.provider.name,
      modelName: effectiveEntry.model.name,
      contextWindow: effectiveEntry.model.contextWindow,
    };
  }

  const baseEntry = findCatalogModel(baseCatalog, parsedRef.provider, parsedRef.model);
  if (baseEntry) {
    return {
      status: 'unavailable',
      provider: parsedRef.provider,
      model: parsedRef.model,
      ref,
      providerName: baseEntry.provider.name,
      modelName: baseEntry.model.name,
      contextWindow: baseEntry.model.contextWindow,
    };
  }

  const baseProvider = findCatalogProvider(baseCatalog, parsedRef.provider);
  return {
    status: 'unavailable',
    provider: parsedRef.provider,
    model: parsedRef.model,
    ref,
    providerName: baseProvider?.name ?? parsedRef.provider,
    modelName: parsedRef.model,
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
      .filter((value) => value.length > 0),
    ),
  );
}

function findCatalogProvider(
  catalog: ModelCatalog | null | undefined,
  providerId: string,
): ModelCatalogProvider | null {
  return catalog?.providers.find((provider) => provider.id === providerId) ?? null;
}

function findCatalogModel(
  catalog: ModelCatalog | null | undefined,
  providerId: string,
  modelId: string,
): { provider: ModelCatalogProvider; model: ModelCatalogModel } | null {
  const provider = findCatalogProvider(catalog, providerId);
  if (!provider) {
    return null;
  }

  const model = provider.models.find((entry) => entry.id === modelId);
  if (!model) {
    return null;
  }

  return { provider, model };
}
