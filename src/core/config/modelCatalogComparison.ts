import type { OpenCodeV2CatalogSnapshot } from '../opencode/OpenCodeCatalogQueryCoordinator';
import type { ModelCatalog } from './modelConfigCatalog';

export type ModelCatalogComparison = {
  status: 'match' | 'drift';
  legacyProviderCount: number;
  legacyModelCount: number;
  v2ProviderCount: number;
  v2ModelCount: number;
  legacyOnlyProviderIds: string[];
  v2OnlyProviderIds: string[];
  legacyOnlyModelRefs: string[];
  v2OnlyModelRefs: string[];
} | {
  status: 'unavailable';
  reason: string;
};

export function createUnavailableModelCatalogComparison(reason: string): ModelCatalogComparison {
  return {
    status: 'unavailable',
    reason,
  };
}

export function compareModelCatalogs(
  legacyCatalog: ModelCatalog,
  v2Snapshot: OpenCodeV2CatalogSnapshot,
): ModelCatalogComparison {
  if (v2Snapshot.status === 'unavailable') {
    return createUnavailableModelCatalogComparison(v2Snapshot.reason);
  }

  const legacyProviderIds = sortedSet(legacyCatalog.providers.map((provider) => provider.id));
  const legacyModelRefs = sortedSet(legacyCatalog.providers.flatMap((provider) => (
    provider.models.map((model) => `${provider.id}/${model.id}`)
  )));
  const v2ProviderIds = sortedSet(v2Snapshot.providerIds);
  const v2ModelRefs = sortedSet(v2Snapshot.modelRefs);
  const legacyOnlyProviderIds = difference(legacyProviderIds, v2ProviderIds);
  const v2OnlyProviderIds = difference(v2ProviderIds, legacyProviderIds);
  const legacyOnlyModelRefs = difference(legacyModelRefs, v2ModelRefs);
  const v2OnlyModelRefs = difference(v2ModelRefs, legacyModelRefs);
  const status = legacyOnlyProviderIds.length === 0
    && v2OnlyProviderIds.length === 0
    && legacyOnlyModelRefs.length === 0
    && v2OnlyModelRefs.length === 0
    ? 'match'
    : 'drift';

  return {
    status,
    legacyProviderCount: legacyProviderIds.length,
    legacyModelCount: legacyModelRefs.length,
    v2ProviderCount: v2ProviderIds.length,
    v2ModelCount: v2ModelRefs.length,
    legacyOnlyProviderIds,
    v2OnlyProviderIds,
    legacyOnlyModelRefs,
    v2OnlyModelRefs,
  };
}

function sortedSet(values: Iterable<string>): string[] {
  return [...new Set(Array.from(values).map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}
