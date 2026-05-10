import type {
  ModelSourceMode,
  OpencodeModelConfigSubset,
  OpencodeProviderConfig,
  OpencodeProviderModelConfig,
} from '../types';
import { isRecord, parseModelReference } from './modelConfigShared';

export type ModelCatalogSource = 'local' | 'server' | 'merge';
export type ModelCatalogDisableScope = 'global' | 'project';

export interface ModelCatalogModel {
  id: string;
  name: string;
  contextWindow?: number;
  variants?: string[];
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

export interface ModelCatalogRuntimeResult {
  providers: Array<{
    id: string;
    name: string;
    models: Array<{
      id: string;
      name: string;
      contextWindow?: number;
      variants?: string[];
    }>;
  }>;
  defaults: Record<string, string>;
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

export function catalogFromRuntimeResult(result: ModelCatalogRuntimeResult): ModelCatalog {
  return {
    providers: result.providers.map((provider) => ({
      id: provider.id,
      name: provider.name || provider.id,
      source: 'server',
      existsInLocal: false,
      existsInServer: true,
      models: provider.models.map((model) => ({
        id: model.id,
        name: model.name || model.id,
        contextWindow: model.contextWindow,
        variants: model.variants,
        source: 'server',
        existsInLocal: false,
        existsInServer: true,
      })),
    })),
    defaults: result.defaults,
  };
}

export function buildServerCatalog(
  runtimeCatalog: ModelCatalog,
  metadataConfig: OpencodeModelConfigSubset,
): ModelCatalog {
  const resolvedCatalog = buildCatalogFromConfig(metadataConfig, 'server');
  const providers = new Map<string, ModelCatalogProvider>();
  const resolvedProviders = new Map(
    resolvedCatalog.providers.map((provider) => [provider.id, provider] as const),
  );

  for (const provider of runtimeCatalog.providers) {
    mergeServerCatalogProvider(providers, provider);
  }

  for (const [providerId, provider] of resolvedProviders) {
    if (!providers.has(providerId)) {
      continue;
    }

    mergeServerCatalogProvider(providers, provider);
  }

  return {
    providers: [...providers.values()]
      .filter((provider) => provider.models.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name)),
    defaults: {
      ...resolvedCatalog.defaults,
      ...runtimeCatalog.defaults,
    },
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

export function resolveCatalogForMode(
  local: ModelCatalog,
  server: ModelCatalog,
  mode: ModelSourceMode,
): ModelCatalog {
  if (mode === 'local') {
    return local;
  }

  if (mode === 'server') {
    return server;
  }

  return mergeCatalogs(server, local);
}

function mergeCatalogDisableScopes(
  left: ModelCatalogDisableScope[] | undefined,
  right: ModelCatalogDisableScope[] | undefined,
): ModelCatalogDisableScope[] | undefined {
  const merged = Array.from(new Set([...(left ?? []), ...(right ?? [])]));
  return merged.length > 0 ? merged : undefined;
}

function mergeServerCatalogProvider(
  providers: Map<string, ModelCatalogProvider>,
  provider: ModelCatalogProvider,
): void {
  const existing = providers.get(provider.id);
  if (!existing) {
    providers.set(provider.id, {
      ...provider,
      source: 'server',
      existsInLocal: false,
      existsInServer: true,
      models: provider.models.map((model) => ({
        ...model,
        source: 'server',
        existsInLocal: false,
        existsInServer: true,
      })),
    });
    return;
  }

  const models = new Map(existing.models.map((model) => [model.id, { ...model }]));
  for (const model of provider.models) {
    const existingModel = models.get(model.id);
    if (!existingModel) {
      models.set(model.id, {
        ...model,
        source: 'server',
        existsInLocal: false,
        existsInServer: true,
      });
      continue;
    }

    models.set(model.id, {
      ...existingModel,
      ...model,
      name: model.name || existingModel.name,
      contextWindow: model.contextWindow ?? existingModel.contextWindow,
      source: 'server',
      existsInLocal: false,
      existsInServer: true,
      disabledScopes: mergeCatalogDisableScopes(existingModel.disabledScopes, model.disabledScopes),
    });
  }

  providers.set(provider.id, {
    ...existing,
    ...provider,
    name: provider.name || existing.name,
    source: 'server',
    existsInLocal: false,
    existsInServer: true,
    disabledScopes: mergeCatalogDisableScopes(existing.disabledScopes, provider.disabledScopes),
    models: [...models.values()].sort((left, right) => left.name.localeCompare(right.name)),
  });
}
