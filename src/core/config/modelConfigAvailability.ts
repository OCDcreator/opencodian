import type { OpencodeModelConfigSubset } from '../types';
import type { ModelCatalog } from './modelConfigCatalog';
import {
  cleanupModelConfig,
  formatModelReference,
  mergeModelConfigSubsets,
  parseModelReference,
  setAvailabilityOverride,
  uniqueStrings,
} from './modelConfigShared';

export type ProviderAvailabilityConfig = Pick<OpencodeModelConfigSubset, 'enabled_providers' | 'disabled_providers'>;
export type InheritedModelConfigSource = 'local_disk' | 'server_default_scope';

export interface InheritedModelConfigResolution {
  scopedConfig: OpencodeModelConfigSubset;
  defaultScopeConfig: OpencodeModelConfigSubset;
  inheritedConfig: OpencodeModelConfigSubset;
  inheritedConfigSource: InheritedModelConfigSource;
  mergedScopedConfig: OpencodeModelConfigSubset;
  effectiveProviderConfig: ProviderAvailabilityConfig;
  isProviderEnabledInServerScope(providerId: string): boolean;
  isProviderEnabledInCurrentScope(providerId: string): boolean;
  isProviderEffectivelyEnabled(providerId: string): boolean;
  getCurrentEnabledProviderIds(providerIds: Iterable<string>): string[];
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

export function resolveInheritedModelConfigResolution(options: {
  localServerMode: boolean;
  localConfig: OpencodeModelConfigSubset;
  scopedConfig: OpencodeModelConfigSubset;
  defaultScopeConfig: OpencodeModelConfigSubset;
  diskInheritedConfig?: OpencodeModelConfigSubset | null;
}): InheritedModelConfigResolution {
  const inheritedResolution = resolveInheritedConfig(options);
  const providerResolution = resolveProviderAvailabilityLayer({
    inheritedConfig: inheritedResolution.inheritedConfig,
    localConfig: options.localConfig,
    scopedConfig: options.scopedConfig,
  });

  return {
    scopedConfig: options.scopedConfig,
    defaultScopeConfig: options.defaultScopeConfig,
    inheritedConfig: inheritedResolution.inheritedConfig,
    inheritedConfigSource: inheritedResolution.inheritedConfigSource,
    mergedScopedConfig: mergeModelConfigSubsets(inheritedResolution.inheritedConfig, options.scopedConfig),
    ...providerResolution,
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

function resolveInheritedConfig(options: {
  localServerMode: boolean;
  localConfig: OpencodeModelConfigSubset;
  scopedConfig: OpencodeModelConfigSubset;
  defaultScopeConfig: OpencodeModelConfigSubset;
  diskInheritedConfig?: OpencodeModelConfigSubset | null;
}): Pick<InheritedModelConfigResolution, 'inheritedConfig' | 'inheritedConfigSource'> {
  if (!options.localServerMode) {
    return {
      inheritedConfig: mergeModelConfigSubsets({}, options.defaultScopeConfig),
      inheritedConfigSource: 'server_default_scope',
    };
  }

  return {
    inheritedConfig: supplementInheritedConfigFromScopedConfig(
      options.diskInheritedConfig ?? {},
      options.scopedConfig,
      options.localConfig,
    ),
    inheritedConfigSource: 'local_disk',
  };
}

function resolveProviderAvailabilityLayer(options: {
  inheritedConfig: OpencodeModelConfigSubset;
  localConfig: OpencodeModelConfigSubset;
  scopedConfig: OpencodeModelConfigSubset;
}): Pick<
  InheritedModelConfigResolution,
  | 'effectiveProviderConfig'
  | 'isProviderEnabledInServerScope'
  | 'isProviderEnabledInCurrentScope'
  | 'isProviderEffectivelyEnabled'
  | 'getCurrentEnabledProviderIds'
> {
  const effectiveProviderConfig = mergeProviderAvailabilityConfig(
    options.inheritedConfig,
    options.localConfig,
  );
  const isProviderEnabledInServerScope = (providerId: string) => isProviderEnabled(
    options.scopedConfig,
    providerId,
  );
  const isProviderEnabledInCurrentScope = (providerId: string) => (
    isProviderEnabledInServerScope(providerId)
    && isProviderEnabled(options.localConfig, providerId)
  );

  return {
    effectiveProviderConfig,
    isProviderEnabledInServerScope,
    isProviderEnabledInCurrentScope,
    isProviderEffectivelyEnabled: (providerId: string) => (
      isProviderEnabledInCurrentScope(providerId)
      && isProviderEnabled(effectiveProviderConfig, providerId)
    ),
    getCurrentEnabledProviderIds: (providerIds: Iterable<string>) => collectCurrentEnabledProviderIds(
      providerIds,
      isProviderEnabledInCurrentScope,
    ),
  };
}

function supplementInheritedConfigFromScopedConfig(
  inheritedConfig: OpencodeModelConfigSubset,
  scopedConfig: OpencodeModelConfigSubset,
  localConfig: OpencodeModelConfigSubset,
): OpencodeModelConfigSubset {
  let next = mergeModelConfigSubsets({}, inheritedConfig);

  if (
    !Array.isArray(localConfig.enabled_providers)
    && !Array.isArray(next.enabled_providers)
    && Array.isArray(scopedConfig.enabled_providers)
  ) {
    next = mergeModelConfigSubsets(next, {
      enabled_providers: scopedConfig.enabled_providers,
    });
  }

  if (!Array.isArray(localConfig.disabled_providers) && Array.isArray(scopedConfig.disabled_providers)) {
    next = mergeModelConfigSubsets(next, {
      disabled_providers: [
        ...(next.disabled_providers ?? []),
        ...scopedConfig.disabled_providers,
      ],
    });
  }

  return next;
}

function collectCurrentEnabledProviderIds(
  providerIds: Iterable<string>,
  isProviderEnabledInCurrentScope: (providerId: string) => boolean,
): string[] {
  const seenProviderIds = new Set<string>();
  const enabledProviderIds: string[] = [];

  for (const candidate of providerIds) {
    const providerId = candidate.trim();
    if (!providerId || seenProviderIds.has(providerId) || !isProviderEnabledInCurrentScope(providerId)) {
      continue;
    }

    seenProviderIds.add(providerId);
    enabledProviderIds.push(providerId);
  }

  return enabledProviderIds;
}
