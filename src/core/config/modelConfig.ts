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

  return {
    provider: value.slice(0, slash).trim(),
    model: value.slice(slash + 1).trim(),
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
