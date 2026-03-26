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
  source: ModelCatalogSource;
  existsInLocal: boolean;
  existsInServer: boolean;
  enabled: boolean;
}

export interface ModelCatalogProvider {
  id: string;
  name: string;
  models: ModelCatalogModel[];
  source: ModelCatalogSource;
  existsInLocal: boolean;
  existsInServer: boolean;
  enabled: boolean;
  whitelist: string[];
  blacklist: string[];
}

export interface ModelCatalog {
  providers: ModelCatalogProvider[];
  defaults: Record<string, string>;
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
    if (values.length > 0) {
      next.enabled_providers = values;
    }
  }

  if (Array.isArray(subset.disabled_providers)) {
    const values = uniqueStrings(subset.disabled_providers);
    if (values.length > 0) {
      next.disabled_providers = values;
    }
  }

  return next;
}

export function buildCatalogFromConfig(
  subset: OpencodeModelConfigSubset,
  source: 'local' | 'server',
): ModelCatalog {
  const enabledProviders = uniqueStrings(subset.enabled_providers ?? []);
  const disabledProviders = new Set(uniqueStrings(subset.disabled_providers ?? []));
  const providers = isRecord(subset.provider)
    ? Object.entries(subset.provider)
      .filter((entry): entry is [string, OpencodeProviderConfig] => isRecord(entry[1]))
      .map(([providerId, providerConfig]) => {
        const whitelist = uniqueStrings(providerConfig.whitelist ?? []);
        const blacklist = uniqueStrings(providerConfig.blacklist ?? []);
        const providerEnabled = isProviderEnabled(providerId, enabledProviders, disabledProviders);
        const models = isRecord(providerConfig.models)
          ? Object.entries(providerConfig.models)
            .filter((entry): entry is [string, OpencodeProviderModelConfig] => isRecord(entry[1]))
            .map(([modelId, modelConfig]) => ({
              id: modelId,
              name: typeof modelConfig.name === 'string' && modelConfig.name.trim()
                ? modelConfig.name.trim()
                : modelId,
              source,
              existsInLocal: source === 'local',
              existsInServer: source === 'server',
              enabled: providerEnabled && isModelEnabled(modelId, whitelist, blacklist),
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
          enabled: providerEnabled,
          whitelist,
          blacklist,
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
      whitelist: [...provider.whitelist],
      blacklist: [...provider.blacklist],
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
        whitelist: [...provider.whitelist],
        blacklist: [...provider.blacklist],
        models: provider.models.map((model) => ({ ...model })),
      });
      continue;
    }

    const models = new Map<string, ModelCatalogModel>();
    for (const model of existing.models) {
      models.set(model.id, {
        ...model,
        enabled: provider.enabled && isModelEnabled(model.id, provider.whitelist, provider.blacklist),
      });
    }
    for (const model of provider.models) {
      const existingModel = models.get(model.id);
      if (!existingModel) {
        models.set(model.id, {
          ...model,
          source: 'local',
          existsInLocal: true,
          existsInServer: false,
          enabled: provider.enabled && isModelEnabled(model.id, provider.whitelist, provider.blacklist),
        });
        continue;
      }

      models.set(model.id, {
        ...existingModel,
        ...model,
        source: 'merge',
        existsInLocal: true,
        existsInServer: true,
        enabled: provider.enabled && isModelEnabled(model.id, provider.whitelist, provider.blacklist),
      });
    }

    providers.set(provider.id, {
      ...existing,
      ...provider,
      source: 'merge',
      existsInLocal: true,
      existsInServer: true,
      enabled: provider.enabled,
      whitelist: [...provider.whitelist],
      blacklist: [...provider.blacklist],
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

  return {
    provider: value.slice(0, slash).trim(),
    model: value.slice(slash + 1).trim(),
  };
}

export function isProviderEnabledByConfig(
  subset: OpencodeModelConfigSubset,
  providerId: string,
): boolean {
  return isProviderEnabled(
    providerId,
    uniqueStrings(subset.enabled_providers ?? []),
    new Set(uniqueStrings(subset.disabled_providers ?? [])),
  );
}

export function isModelEnabledByConfig(
  subset: OpencodeModelConfigSubset,
  providerId: string,
  modelId: string,
): boolean {
  if (!isProviderEnabledByConfig(subset, providerId)) {
    return false;
  }

  const provider = subset.provider?.[providerId];
  return isModelEnabled(
    modelId,
    uniqueStrings(provider?.whitelist ?? []),
    uniqueStrings(provider?.blacklist ?? []),
  );
}

export function setProviderEnabled(
  subset: OpencodeModelConfigSubset,
  providerId: string,
  enabled: boolean,
): OpencodeModelConfigSubset {
  const next = cloneModelConfig(subset);
  const enabledProviders = uniqueStrings(next.enabled_providers ?? []);
  const disabledProviders = uniqueStrings(next.disabled_providers ?? []);

  if (enabled) {
    next.disabled_providers = disabledProviders.filter((item) => item !== providerId);
    if (enabledProviders.length > 0 && !enabledProviders.includes(providerId)) {
      next.enabled_providers = [...enabledProviders, providerId];
    }
  } else {
    if (!disabledProviders.includes(providerId)) {
      next.disabled_providers = [...disabledProviders, providerId];
    }
    if (enabledProviders.length > 0) {
      next.enabled_providers = enabledProviders.filter((item) => item !== providerId);
    }
  }

  if (next.enabled_providers?.length === 0) {
    delete next.enabled_providers;
  }
  if (next.disabled_providers?.length === 0) {
    delete next.disabled_providers;
  }

  return cleanupModelConfig(next);
}

export function setModelEnabled(
  subset: OpencodeModelConfigSubset,
  providerId: string,
  modelId: string,
  enabled: boolean,
): OpencodeModelConfigSubset {
  const next = cloneModelConfig(subset);
  if (!next.provider) {
    next.provider = {};
  }

  const provider = next.provider[providerId] ?? {};
  const whitelist = uniqueStrings(provider.whitelist ?? []);
  const blacklist = uniqueStrings(provider.blacklist ?? []);

  if (enabled) {
    provider.blacklist = blacklist.filter((item) => item !== modelId);
    if (whitelist.length > 0 && !whitelist.includes(modelId)) {
      provider.whitelist = [...whitelist, modelId];
    } else if (whitelist.length === 0) {
      delete provider.whitelist;
    }
  } else if (whitelist.length > 0) {
    provider.whitelist = whitelist.filter((item) => item !== modelId);
  } else if (!blacklist.includes(modelId)) {
    provider.blacklist = [...blacklist, modelId];
  }

  if (provider.whitelist?.length === 0) {
    delete provider.whitelist;
  }
  if (provider.blacklist?.length === 0) {
    delete provider.blacklist;
  }

  next.provider[providerId] = provider;
  return cleanupModelConfig(next);
}

function cloneModelConfig(subset: OpencodeModelConfigSubset): OpencodeModelConfigSubset {
  return JSON.parse(JSON.stringify(subset)) as OpencodeModelConfigSubset;
}

function isProviderEnabled(
  providerId: string,
  enabledProviders: string[],
  disabledProviders: Set<string>,
): boolean {
  if (enabledProviders.length > 0) {
    return enabledProviders.includes(providerId);
  }

  return !disabledProviders.has(providerId);
}

function isModelEnabled(modelId: string, whitelist: string[], blacklist: string[]): boolean {
  if (whitelist.length > 0) {
    return whitelist.includes(modelId) && !blacklist.includes(modelId);
  }

  return !blacklist.includes(modelId);
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
