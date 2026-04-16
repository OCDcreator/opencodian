import type {
  ModelCatalog,
  ModelCatalogModel,
  ModelCatalogProvider,
} from './modelConfigCatalog';
import {
  formatModelReference,
  parseModelReference,
} from './modelConfigShared';

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
