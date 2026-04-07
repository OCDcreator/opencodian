import type { ModelCatalog, ModelCatalogProvider } from '../../core/config/modelConfig';

export interface ModelPickerOption {
  ref: string;
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  contextWindow?: number;
  source: ModelCatalogProvider['source'];
  searchText: string;
}

export interface ModelPickerGroup {
  providerId: string;
  providerName: string;
  source: ModelCatalogProvider['source'];
  searchText: string;
  options: ModelPickerOption[];
}

export function buildModelPickerGroups(catalog: ModelCatalog | null | undefined): ModelPickerGroup[] {
  if (!catalog) {
    return [];
  }

  return catalog.providers.map((provider) => ({
    providerId: provider.id,
    providerName: provider.name || provider.id,
    source: provider.source,
    searchText: `${provider.name || provider.id} ${provider.id}`.toLowerCase(),
    options: provider.models.map((model) => ({
      ref: `${provider.id}/${model.id}`,
      providerId: provider.id,
      providerName: provider.name || provider.id,
      modelId: model.id,
      modelName: model.name || model.id,
      contextWindow: model.contextWindow,
      source: model.source,
      searchText: `${provider.name || provider.id} ${provider.id} ${model.name || model.id} ${model.id}`.toLowerCase(),
    })),
  }));
}

export function filterModelPickerGroups(
  groups: ModelPickerGroup[],
  query: string,
  providerId?: string,
): ModelPickerGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedProviderId = typeof providerId === 'string' ? providerId.trim().toLowerCase() : '';

  const scopedGroups = normalizedProviderId
    ? groups.filter((group) => group.providerId.toLowerCase() === normalizedProviderId)
    : groups;

  if (!normalizedQuery) {
    return scopedGroups;
  }

  return scopedGroups.flatMap((group) => {
    if (group.searchText.includes(normalizedQuery)) {
      return [group];
    }

    const options = group.options.filter((option) => option.searchText.includes(normalizedQuery));
    if (options.length === 0) {
      return [];
    }

    return [{
      ...group,
      options,
    }];
  });
}

export function findModelPickerOptionByRef(
  groups: ModelPickerGroup[],
  ref: string | null | undefined,
): ModelPickerOption | null {
  const normalizedRef = typeof ref === 'string' ? ref.trim() : '';
  if (!normalizedRef) {
    return null;
  }

  for (const group of groups) {
    const match = group.options.find((option) => option.ref === normalizedRef);
    if (match) {
      return match;
    }
  }

  return null;
}

export function findModelPickerOption(
  groups: ModelPickerGroup[],
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): ModelPickerOption | null {
  const normalizedProviderId = typeof providerId === 'string' ? providerId.trim() : '';
  const normalizedModelId = typeof modelId === 'string' ? modelId.trim() : '';
  if (!normalizedProviderId || !normalizedModelId) {
    return null;
  }

  return findModelPickerOptionByRef(groups, `${normalizedProviderId}/${normalizedModelId}`);
}
