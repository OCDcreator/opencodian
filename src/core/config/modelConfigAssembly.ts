import type { ModelSourceMode, OpencodeModelConfigSubset } from '../types';
import {
  filterCatalog,
  type InheritedModelConfigResolution,
  isProviderEnabled,
  type ProviderAvailabilityConfig,
  resolveInheritedModelConfigResolution,
} from './modelConfigAvailability';
import {
  buildServerCatalog,
  catalogFromRuntimeResult,
  type ModelCatalog,
  type ModelCatalogProvider,
  type ModelCatalogRuntimeResult,
  resolveCatalogForMode,
} from './modelConfigCatalog';
import { parseModelReference } from './modelConfigShared';

export interface ModelCatalogAssemblyResult {
  baseEffective: ModelCatalog;
  effective: ModelCatalog;
  currentEnabledProviderIds: string[];
  effectiveProviderConfig: ProviderAvailabilityConfig;
}

export interface ModelServerCatalogAssemblyResult {
  runtime: ModelCatalog;
  configResolution: InheritedModelConfigResolution;
  server: ModelCatalog;
  providerDirectory: ProviderDirectorySnapshot;
}

export interface ProviderDirectorySnapshot {
  catalog: ModelCatalog;
  connectedProviderIds: string[];
  defaults: Record<string, string>;
}

export type ProviderDirectoryRuntimeResult = ModelCatalogRuntimeResult & {
  connected: string[];
};

export type ProviderAvailabilityProbePlanStatus =
  | 'available'
  | 'project_disabled'
  | 'server_disabled'
  | 'catalog_only'
  | 'missing';

export interface ProviderAvailabilityProbePlan {
  providerId: string;
  status: ProviderAvailabilityProbePlanStatus;
  effectiveEnabled: boolean;
  projectDisabled: boolean;
  serverDisabled: boolean;
  runtimeModelCount: number;
  catalogModelCount: number;
  testedModelId?: string;
  shouldSendProbe: boolean;
}

export function assembleServerModelCatalog(options: {
  runtimeResult: ModelCatalogRuntimeResult;
  providerDirectoryResult?: ProviderDirectoryRuntimeResult;
  localServerMode: boolean;
  localConfig: OpencodeModelConfigSubset;
  scopedConfig: OpencodeModelConfigSubset;
  defaultScopeConfig: OpencodeModelConfigSubset;
  diskInheritedConfig?: OpencodeModelConfigSubset | null;
}): ModelServerCatalogAssemblyResult {
  const configResolution = resolveInheritedModelConfigResolution({
    localServerMode: options.localServerMode,
    scopedConfig: options.scopedConfig,
    defaultScopeConfig: options.defaultScopeConfig,
    localConfig: options.localConfig,
    diskInheritedConfig: options.diskInheritedConfig,
  });
  const runtime = catalogFromRuntimeResult(options.runtimeResult);
  const providerDirectoryResult = options.providerDirectoryResult ?? {
    providers: [],
    defaults: {},
    connected: [],
  };
  const providerDirectoryCatalog = catalogFromRuntimeResult(providerDirectoryResult);

  return {
    runtime,
    configResolution,
    server: buildServerCatalog(
      runtime,
      configResolution.mergedScopedConfig,
    ),
    providerDirectory: {
      catalog: providerDirectoryCatalog,
      connectedProviderIds: [...providerDirectoryResult.connected],
      defaults: { ...providerDirectoryCatalog.defaults },
    },
  };
}

export function assembleModelCatalog(
  options: {
    local: ModelCatalog;
    server: ModelCatalog;
    mode: ModelSourceMode;
    disabledModelRefs?: string[];
    configResolution: Pick<InheritedModelConfigResolution, 'effectiveProviderConfig' | 'getCurrentEnabledProviderIds'>;
  },
): ModelCatalogAssemblyResult {
  const baseEffective = resolveCatalogForMode(options.local, options.server, options.mode);
  const effectiveProjection = projectEffectiveCatalog({
    baseEffective,
    disabledModelRefs: options.disabledModelRefs,
    getCurrentEnabledProviderIds: options.configResolution.getCurrentEnabledProviderIds,
  });

  return {
    baseEffective,
    effective: effectiveProjection.effective,
    currentEnabledProviderIds: effectiveProjection.currentEnabledProviderIds,
    effectiveProviderConfig: options.configResolution.effectiveProviderConfig,
  };
}

export function resolveProviderAvailabilityProbePlan(
  options: {
    providerId: string;
    localConfig: OpencodeModelConfigSubset;
    runtimeCatalog: ModelCatalog;
    serverCatalog: ModelCatalog;
    configResolution: Pick<InheritedModelConfigResolution, 'isProviderEnabledInServerScope' | 'isProviderEffectivelyEnabled'>;
  },
): ProviderAvailabilityProbePlan {
  const providerId = options.providerId.trim();
  if (!providerId) {
    return {
      providerId: '',
      status: 'missing',
      effectiveEnabled: false,
      projectDisabled: false,
      serverDisabled: false,
      runtimeModelCount: 0,
      catalogModelCount: 0,
      shouldSendProbe: false,
    };
  }

  const runtimeProvider = options.runtimeCatalog.providers.find((provider) => provider.id === providerId);
  const serverProvider = options.serverCatalog.providers.find((provider) => provider.id === providerId);
  const projectDisabled = !isProviderEnabled(options.localConfig, providerId);
  const serverDisabled = !projectDisabled
    && !options.configResolution.isProviderEnabledInServerScope(providerId);
  const effectiveEnabled = options.configResolution.isProviderEffectivelyEnabled(providerId);
  const runtimeModelCount = runtimeProvider?.models.length ?? 0;
  const catalogModelCount = serverProvider?.models.length ?? 0;
  const testedModelId = selectProviderProbeModelId({
    providerId,
    localConfig: options.localConfig,
    runtimeProvider,
    serverProvider,
    serverCatalog: options.serverCatalog,
  });

  let status: ProviderAvailabilityProbePlanStatus = 'missing';
  let shouldSendProbe = false;

  if (!effectiveEnabled && projectDisabled) {
    status = 'project_disabled';
  } else if (!effectiveEnabled && serverDisabled) {
    status = 'server_disabled';
  } else if (!testedModelId && serverProvider) {
    status = 'catalog_only';
  } else if (testedModelId) {
    status = 'available';
    shouldSendProbe = true;
  } else if (runtimeModelCount > 0) {
    status = 'available';
  } else if (serverProvider) {
    status = 'catalog_only';
  }

  return {
    providerId,
    status,
    effectiveEnabled,
    projectDisabled,
    serverDisabled,
    runtimeModelCount,
    catalogModelCount,
    testedModelId,
    shouldSendProbe,
  };
}

function projectEffectiveCatalog(options: {
  baseEffective: ModelCatalog;
  disabledModelRefs?: string[];
  getCurrentEnabledProviderIds(providerIds: Iterable<string>): string[];
}): Pick<ModelCatalogAssemblyResult, 'effective' | 'currentEnabledProviderIds'> {
  const currentEnabledProviderIds = options.getCurrentEnabledProviderIds(
    options.baseEffective.providers.map((provider) => provider.id),
  );
  const modelFilteredCatalog = filterCatalog(options.baseEffective, {
    disabledModelRefs: options.disabledModelRefs,
  });

  return {
    currentEnabledProviderIds,
    effective: filterCatalogToProviderIds(
      modelFilteredCatalog,
      new Set(currentEnabledProviderIds),
    ),
  };
}

function filterCatalogToProviderIds(
  catalog: ModelCatalog,
  enabledProviderIds: Set<string>,
): ModelCatalog {
  const providers = catalog.providers
    .filter((provider) => enabledProviderIds.has(provider.id))
    .map((provider) => ({
      ...provider,
      models: provider.models.map((model) => ({ ...model })),
    }));

  return {
    providers,
    defaults: Object.fromEntries(
      Object.entries(catalog.defaults).filter(([providerId]) => enabledProviderIds.has(providerId)),
    ),
  };
}

function selectProviderProbeModelId(options: {
  providerId: string;
  localConfig: OpencodeModelConfigSubset;
  runtimeProvider: ModelCatalogProvider | undefined;
  serverProvider: ModelCatalogProvider | undefined;
  serverCatalog: ModelCatalog;
}): string | undefined {
  const configuredDefault = parseModelReference(options.localConfig.model);
  if (configuredDefault?.provider === options.providerId && configuredDefault.model) {
    return configuredDefault.model;
  }

  const serverDefault = options.serverCatalog.defaults[options.providerId];
  if (typeof serverDefault === 'string' && serverDefault.trim()) {
    return serverDefault.trim();
  }

  for (const provider of [options.runtimeProvider, options.serverProvider]) {
    const modelId = provider?.models.find((model) => model.id.trim())?.id;
    if (modelId) {
      return modelId;
    }
  }

  return undefined;
}
