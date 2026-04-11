import type {
  OpencodeConfig,
  OpencodeModelConfigSubset,
  OpencodeProviderConfig,
  OpencodeProviderModelConfig,
} from '../types';

export const OPENCODE_SCHEMA_URL = 'https://opencode.ai/config.json';

export type ModelCatalogSource = 'local' | 'server' | 'merge';
export type ModelCatalogDisableScope = 'global' | 'project';

export interface ModelCatalogModel {
  id: string;
  name: string;
  contextWindow?: number;
  source: ModelCatalogSource;
  existsInLocal: boolean;
  existsInServer: boolean;
  disabledScopes?: ModelCatalogDisableScope[];
}

export interface ModelCatalogProvider {
  id: string;
  name: string;
  models: ModelCatalogModel[];
  source: ModelCatalogSource;
  existsInLocal: boolean;
  existsInServer: boolean;
  disabledScopes?: ModelCatalogDisableScope[];
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

export type ProviderAvailabilityConfig = Pick<OpencodeModelConfigSubset, 'enabled_providers' | 'disabled_providers'>;

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

export function mergeModelConfigSubsets(
  base: OpencodeModelConfigSubset | null | undefined,
  override: OpencodeModelConfigSubset | null | undefined,
): OpencodeModelConfigSubset {
  const next: OpencodeModelConfigSubset = {};

  if (typeof base?.model === 'string') {
    next.model = base.model;
  }
  if (typeof base?.small_model === 'string') {
    next.small_model = base.small_model;
  }
  if (isRecord(base?.provider)) {
    next.provider = cloneProviderRecord(base.provider);
  }
  if (Array.isArray(base?.enabled_providers)) {
    next.enabled_providers = uniqueStrings(base.enabled_providers);
  }
  if (Array.isArray(base?.disabled_providers)) {
    next.disabled_providers = uniqueStrings(base.disabled_providers);
  }

  if (typeof override?.model === 'string') {
    next.model = override.model;
  }
  if (typeof override?.small_model === 'string') {
    next.small_model = override.small_model;
  }
  if (isRecord(override?.provider)) {
    next.provider = mergeProviderRecords(next.provider, override.provider);
  }
  if (Array.isArray(override?.enabled_providers)) {
    next.enabled_providers = uniqueStrings(override.enabled_providers);
  }
  if (Array.isArray(override?.disabled_providers)) {
    next.disabled_providers = uniqueStrings(override.disabled_providers);
  }

  return cleanupModelConfig(next);
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
        disabledScopes: mergeCatalogDisableScopes(existingModel.disabledScopes, model.disabledScopes),
      });
    }

    providers.set(provider.id, {
      ...existing,
      ...provider,
      source: 'merge',
      existsInLocal: true,
      existsInServer: true,
      disabledScopes: mergeCatalogDisableScopes(existing.disabledScopes, provider.disabledScopes),
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

function mergeCatalogDisableScopes(
  left: ModelCatalogDisableScope[] | undefined,
  right: ModelCatalogDisableScope[] | undefined,
): ModelCatalogDisableScope[] | undefined {
  const merged = Array.from(new Set([...(left ?? []), ...(right ?? [])]));
  return merged.length > 0 ? merged : undefined;
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

export function mergeProviderAvailabilityConfig(
  inherited: ProviderAvailabilityConfig | null | undefined,
  local: ProviderAvailabilityConfig | null | undefined,
): ProviderAvailabilityConfig {
  return {
    enabled_providers: Array.isArray(local?.enabled_providers)
      ? uniqueStrings(local.enabled_providers)
      : Array.isArray(inherited?.enabled_providers)
        ? uniqueStrings(inherited.enabled_providers)
        : undefined,
    disabled_providers: Array.isArray(local?.disabled_providers)
      ? uniqueStrings(local.disabled_providers)
      : Array.isArray(inherited?.disabled_providers)
        ? uniqueStrings(inherited.disabled_providers)
        : undefined,
  };
}

export function setProviderEnabled(options: {
  subset: OpencodeModelConfigSubset;
  providerId: string;
  enabled: boolean;
  knownProviderIds: Iterable<string>;
  inherited?: ProviderAvailabilityConfig | null;
}): OpencodeModelConfigSubset {
  const trimmedProviderId = options.providerId.trim();
  if (!trimmedProviderId) {
    return cleanupModelConfig(options.subset);
  }

  const effective = mergeProviderAvailabilityConfig(options.inherited, options.subset);
  const next: OpencodeModelConfigSubset = {
    ...options.subset,
  };
  const nextDisabledProviders = new Set(uniqueStrings(effective.disabled_providers ?? []));
  const useWhitelistMode = Array.isArray(effective.enabled_providers);

  if (useWhitelistMode) {
    const orderedKnownProviders = uniqueStrings([
      ...Array.from(options.knownProviderIds),
      ...uniqueStrings(effective.enabled_providers ?? []),
      trimmedProviderId,
    ]);
    const nextEnabledProviders = new Set(uniqueStrings(effective.enabled_providers ?? []));

    if (options.enabled) {
      nextEnabledProviders.add(trimmedProviderId);
      nextDisabledProviders.delete(trimmedProviderId);
    } else {
      nextEnabledProviders.delete(trimmedProviderId);
    }

    setAvailabilityOverride(
      next,
      'enabled_providers',
      orderedKnownProviders.filter((knownProviderId) => nextEnabledProviders.has(knownProviderId)),
      options.inherited?.enabled_providers,
    );
    setAvailabilityOverride(
      next,
      'disabled_providers',
      Array.from(nextDisabledProviders),
      options.inherited?.disabled_providers,
    );
    return cleanupModelConfig(next);
  }

  if (options.enabled) {
    nextDisabledProviders.delete(trimmedProviderId);
  } else {
    nextDisabledProviders.add(trimmedProviderId);
  }

  setAvailabilityOverride(
    next,
    'disabled_providers',
    Array.from(nextDisabledProviders),
    options.inherited?.disabled_providers,
  );
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

export function resolvePreferredAvailableModel(
  effectiveCatalog: ModelCatalog | null | undefined,
  provider: string | null | undefined,
  model: string | null | undefined,
): ModelReference | null {
  const requestedRef = formatModelReference(provider, model);
  const parsedRequestedRef = parseModelReference(requestedRef);
  if (parsedRequestedRef && findCatalogModel(effectiveCatalog, parsedRequestedRef.provider, parsedRequestedRef.model)) {
    return {
      ...parsedRequestedRef,
      ref: requestedRef,
    };
  }

  const requestedProvider = provider?.trim()
    ? findCatalogProvider(effectiveCatalog, provider.trim())
    : null;
  return pickCatalogProviderDefaultModel(effectiveCatalog, requestedProvider)
    ?? pickCatalogProviderFirstModel(requestedProvider)
    ?? pickCatalogDefaultModel(effectiveCatalog)
    ?? pickFirstCatalogModel(effectiveCatalog);
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

function cloneUnknown<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneUnknown(item)) as T;
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneUnknown(item)]),
    ) as T;
  }

  return value;
}

function mergeUnknown(base: unknown, override: unknown): unknown {
  if (Array.isArray(override)) {
    return cloneUnknown(override);
  }

  if (isRecord(base) && isRecord(override)) {
    const next: Record<string, unknown> = Object.fromEntries(
      Object.entries(base).map(([key, value]) => [key, cloneUnknown(value)]),
    );

    for (const [key, value] of Object.entries(override)) {
      next[key] = key in next ? mergeUnknown(next[key], value) : cloneUnknown(value);
    }

    return next;
  }

  return cloneUnknown(override);
}

function cloneProviderRecord(
  provider: Record<string, OpencodeProviderConfig>,
): Record<string, OpencodeProviderConfig> {
  return cloneUnknown(provider);
}

function mergeProviderRecords(
  base: Record<string, OpencodeProviderConfig> | undefined,
  override: Record<string, OpencodeProviderConfig>,
): Record<string, OpencodeProviderConfig> {
  const next = base ? cloneProviderRecord(base) : {};

  for (const [providerId, providerConfig] of Object.entries(override)) {
    const existing = next[providerId];
    next[providerId] = (
      existing
        ? mergeUnknown(existing, providerConfig)
        : cloneUnknown(providerConfig)
    ) as OpencodeProviderConfig;
  }

  return next;
}

function setAvailabilityOverride(
  subset: OpencodeModelConfigSubset,
  key: 'enabled_providers' | 'disabled_providers',
  nextValues: string[] | undefined,
  inheritedValues: string[] | undefined,
): void {
  const normalizedNext = Array.isArray(nextValues) ? uniqueStrings(nextValues) : undefined;
  const normalizedInherited = Array.isArray(inheritedValues) ? uniqueStrings(inheritedValues) : undefined;

  if (
    sameStringArrays(normalizedNext, normalizedInherited)
    || (!normalizedInherited && (!normalizedNext || normalizedNext.length === 0))
  ) {
    delete subset[key];
    return;
  }

  subset[key] = normalizedNext ?? [];
}

function sameStringArrays(left: string[] | undefined, right: string[] | undefined): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return !left && !right;
  }

  if (left.length !== right.length) {
    return false;
  }

  const rightValues = new Set(right);
  return left.every((value) => rightValues.has(value));
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

function pickCatalogProviderDefaultModel(
  catalog: ModelCatalog | null | undefined,
  provider: ModelCatalogProvider | null | undefined,
): ModelReference | null {
  if (!provider) {
    return null;
  }

  const defaultModelId = catalog?.defaults[provider.id]?.trim();
  if (!defaultModelId) {
    return null;
  }

  const defaultModel = provider.models.find((model) => model.id === defaultModelId);
  if (!defaultModel) {
    return null;
  }

  return {
    provider: provider.id,
    model: defaultModel.id,
    ref: formatModelReference(provider.id, defaultModel.id),
  };
}

function pickCatalogProviderFirstModel(
  provider: ModelCatalogProvider | null | undefined,
): ModelReference | null {
  const firstModel = provider?.models.find((model) => model.id.trim());
  if (!provider || !firstModel) {
    return null;
  }

  return {
    provider: provider.id,
    model: firstModel.id,
    ref: formatModelReference(provider.id, firstModel.id),
  };
}

function pickCatalogDefaultModel(
  catalog: ModelCatalog | null | undefined,
): ModelReference | null {
  if (!catalog) {
    return null;
  }

  for (const provider of catalog.providers) {
    const providerDefault = pickCatalogProviderDefaultModel(catalog, provider);
    if (providerDefault) {
      return providerDefault;
    }
  }

  return null;
}

function pickFirstCatalogModel(
  catalog: ModelCatalog | null | undefined,
): ModelReference | null {
  if (!catalog) {
    return null;
  }

  for (const provider of catalog.providers) {
    const firstModel = pickCatalogProviderFirstModel(provider);
    if (firstModel) {
      return firstModel;
    }
  }

  return null;
}
