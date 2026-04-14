import type { ModelSourceMode, OpencodeModelConfigSubset } from '../types';
import {
  collectConfiguredProviderIds,
  formatModelReference,
  isProviderEnabled,
  mergeCatalogs,
  type ModelCatalog,
  type ModelCatalogDisableScope,
  type ModelCatalogProvider,
  parseModelReference,
  setProviderEnabled,
} from './modelConfig';
import type {
  ModelCatalogBundle,
  ModelConfigService,
  ProviderAvailabilityProbe,
} from './ModelConfigService';

export type ModelCatalogStateMode = 'local' | 'server' | 'effective' | 'disabled';

export interface ModelCatalogState {
  localModelConfig: OpencodeModelConfigSubset;
  disabledModelRefs: string[];
  catalogs: ModelCatalogBundle;
  displayCatalogs: Record<ModelCatalogStateMode, ModelCatalog>;
  providerStatusCatalogs: Record<ModelCatalogStateMode, ModelCatalog>;
}

export class ModelCatalogStateService {
  constructor(private readonly modelConfigService: ModelConfigService) {}

  async getCatalogState(mode: ModelSourceMode, disabledModelRefs: string[] = []): Promise<ModelCatalogState> {
    const normalizedDisabledModelRefs = this.normalizeModelRefs(disabledModelRefs);
    const localModelConfig = await this.modelConfigService.readLocalModelConfig();
    const catalogs = await this.modelConfigService.getCatalogs(mode, normalizedDisabledModelRefs);
    const statusCatalogs = this.buildProviderStatusCatalogs(catalogs, localModelConfig);

    return {
      localModelConfig,
      disabledModelRefs: normalizedDisabledModelRefs,
      catalogs,
      displayCatalogs: {
        local: catalogs.local,
        server: this.buildServerDisplayCatalog(catalogs.server),
        effective: catalogs.effective,
        disabled: this.buildDisabledCatalog(catalogs, localModelConfig, normalizedDisabledModelRefs),
      },
      providerStatusCatalogs: statusCatalogs,
    };
  }

  async applyProviderAvailabilityChange(options: {
    state: ModelCatalogState;
    providerIds: Iterable<string>;
    enabled: boolean;
  }): Promise<boolean> {
    const normalizedProviderIds = this.normalizeProviderIds(options.providerIds);
    if (normalizedProviderIds.length === 0) {
      return false;
    }

    const currentConfig = await this.modelConfigService.readLocalModelConfig();
    const knownProviderIds = Array.from(new Set([
      ...options.state.catalogs.server.providers.map((provider) => provider.id),
      ...options.state.catalogs.local.providers.map((provider) => provider.id),
      ...collectConfiguredProviderIds(options.state.catalogs.serverConfig),
      ...collectConfiguredProviderIds(currentConfig),
      ...normalizedProviderIds,
    ]));
    let nextConfig = currentConfig;
    for (const providerId of normalizedProviderIds) {
      nextConfig = setProviderEnabled({
        subset: nextConfig,
        providerId,
        enabled: options.enabled,
        knownProviderIds,
        inherited: options.state.catalogs.serverConfig,
      });
    }

    await this.modelConfigService.writeLocalModelConfig(nextConfig);
    return true;
  }

  applyModelAvailabilityChange(options: {
    disabledModelRefs: Iterable<string>;
    modelRefs: Iterable<string>;
    enabled: boolean;
  }): string[] {
    const normalizedModelRefs = this.normalizeModelRefs(options.modelRefs);
    if (normalizedModelRefs.length === 0) {
      return Array.from(options.disabledModelRefs);
    }

    const nextDisabledModelRefs = new Set(Array.from(options.disabledModelRefs));
    for (const modelRef of normalizedModelRefs) {
      if (options.enabled) {
        nextDisabledModelRefs.delete(modelRef);
      } else {
        nextDisabledModelRefs.add(modelRef);
      }
    }

    return [...nextDisabledModelRefs].sort((left, right) => left.localeCompare(right));
  }

  probeProvider(providerId: string): Promise<ProviderAvailabilityProbe> {
    return this.modelConfigService.testProviderAvailability(providerId);
  }

  private buildProviderStatusCatalogs(
    catalogs: ModelCatalogBundle,
    localModelConfig: OpencodeModelConfigSubset,
  ): Record<ModelCatalogStateMode, ModelCatalog> {
    return {
      local: this.decorateCatalogWithCurrentDisabledScopes(catalogs.local, catalogs, localModelConfig),
      server: this.decorateCatalogWithCurrentDisabledScopes(catalogs.server, catalogs, localModelConfig),
      effective: this.decorateCatalogWithCurrentDisabledScopes(catalogs.baseEffective, catalogs, localModelConfig),
      disabled: this.withConfiguredDisabledProviderPlaceholders(
        this.decorateCatalogWithCurrentDisabledScopes(
          mergeCatalogs(catalogs.server, catalogs.local),
          catalogs,
          localModelConfig,
        ),
        catalogs,
        localModelConfig,
        'merge',
      ),
    };
  }

  private buildDisabledCatalog(
    catalogs: ModelCatalogBundle,
    localModelConfig: OpencodeModelConfigSubset,
    disabledModelRefs: string[],
  ): ModelCatalog {
    const baseCatalog = this.withConfiguredDisabledProviderPlaceholders(
      this.decorateCatalogWithCurrentDisabledScopes(
        mergeCatalogs(catalogs.server, catalogs.local),
        catalogs,
        localModelConfig,
      ),
      catalogs,
      localModelConfig,
      'merge',
    );
    const disabledModelRefSet = new Set(disabledModelRefs);
    const providers: ModelCatalogProvider[] = [];

    for (const provider of baseCatalog.providers) {
      const providerProjectDisabled = this.isProviderProjectDisabled(localModelConfig, provider.id);
      const providerEnabled = this.isProviderCurrentlyEnabled(provider.id, catalogs);
      if (!providerEnabled) {
        providers.push({
          ...provider,
          disabledScopes: this.mergeDisabledScopes(
            provider.disabledScopes,
            providerProjectDisabled ? ['project'] : undefined,
          ),
          models: provider.models.map((model) => ({ ...model })),
        });
        continue;
      }

      const disabledModels = provider.models
        .filter((model) => disabledModelRefSet.has(formatModelReference(provider.id, model.id)))
        .map((model) => ({ ...model }));
      if (disabledModels.length === 0) {
        continue;
      }

      providers.push({
        ...provider,
        models: disabledModels,
      });
    }

    return {
      providers: providers.sort((left, right) => left.name.localeCompare(right.name)),
      defaults: {},
    };
  }

  private buildServerDisplayCatalog(catalog: ModelCatalog): ModelCatalog {
    const providers = catalog.providers.map((provider) => ({
      ...provider,
      models: provider.models.map((model) => ({ ...model })),
    }));

    return {
      providers,
      defaults: Object.fromEntries(
        Object.entries(catalog.defaults).filter(([providerId]) => providers.some((provider) => provider.id === providerId)),
      ),
    };
  }

  private decorateCatalogWithCurrentDisabledScopes(
    catalog: ModelCatalog,
    catalogs: ModelCatalogBundle,
    localModelConfig: OpencodeModelConfigSubset,
  ): ModelCatalog {
    const providers = catalog.providers.map((provider) => {
      const providerEnabled = this.isProviderCurrentlyEnabled(provider.id, catalogs);
      const projectDisabled = this.isProviderProjectDisabled(localModelConfig, provider.id);
      const disabledScopes = this.mergeDisabledScopes(
        provider.disabledScopes,
        !providerEnabled
          ? [
            ...(projectDisabled ? ['project' as const] : []),
            ...(!projectDisabled ? ['global' as const] : []),
          ]
          : undefined,
      );

      return {
        ...provider,
        disabledScopes,
        models: provider.models.map((model) => ({
          ...model,
          disabledScopes,
        })),
      };
    });

    return {
      ...catalog,
      providers,
    };
  }

  private withConfiguredDisabledProviderPlaceholders(
    catalog: ModelCatalog,
    catalogs: ModelCatalogBundle,
    localModelConfig: OpencodeModelConfigSubset,
    source: 'server' | 'merge',
  ): ModelCatalog {
    const existingProviderIds = new Set(catalog.providers.map((provider) => provider.id));
    const configuredProviderIds = new Set<string>([
      ...collectConfiguredProviderIds(catalogs.serverConfig),
      ...collectConfiguredProviderIds(localModelConfig),
      ...(catalogs.effectiveProviderConfig.enabled_providers ?? []),
      ...(catalogs.effectiveProviderConfig.disabled_providers ?? []),
    ]);
    const placeholderProviders = [...configuredProviderIds]
      .filter((providerId) => !this.isProviderEnabledInEffectiveAvailability(providerId, catalogs))
      .filter((providerId) => !existingProviderIds.has(providerId))
      .map<ModelCatalogProvider>((providerId) => ({
        id: providerId,
        name: providerId,
        models: [],
        source,
        existsInLocal: false,
        existsInServer: false,
        disabledScopes: this.isProviderProjectDisabled(localModelConfig, providerId)
          ? ['project']
          : ['global'],
      }));

    if (placeholderProviders.length === 0) {
      return catalog;
    }

    return {
      ...catalog,
      providers: [...catalog.providers, ...placeholderProviders]
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
  }

  private isProviderEnabledInEffectiveAvailability(providerId: string, catalogs: ModelCatalogBundle): boolean {
    return isProviderEnabled(catalogs.effectiveProviderConfig, providerId);
  }

  private isProviderProjectDisabled(
    localModelConfig: OpencodeModelConfigSubset,
    providerId: string,
  ): boolean {
    if (!this.hasProviderAvailabilityConfig(localModelConfig)) {
      return false;
    }

    return !isProviderEnabled(localModelConfig, providerId);
  }

  private isProviderCurrentlyEnabled(providerId: string, catalogs: ModelCatalogBundle): boolean {
    return catalogs.currentEnabledProviderIds.includes(providerId);
  }

  private hasProviderAvailabilityConfig(
    config: Pick<OpencodeModelConfigSubset, 'enabled_providers' | 'disabled_providers'> | null | undefined,
  ): boolean {
    return Array.isArray(config?.enabled_providers) || Array.isArray(config?.disabled_providers);
  }

  private normalizeProviderIds(providerIds: Iterable<string>): string[] {
    return Array.from(new Set(
      Array.from(providerIds)
        .map((providerId) => providerId.trim())
        .filter((providerId) => providerId.length > 0),
    ));
  }

  private normalizeModelRefs(modelRefs: Iterable<string>): string[] {
    return Array.from(new Set(
      Array.from(modelRefs)
        .map((modelRef) => {
          const parsedRef = parseModelReference(modelRef);
          return parsedRef
            ? formatModelReference(parsedRef.provider, parsedRef.model)
            : '';
        })
        .filter((modelRef) => modelRef.length > 0),
    )).sort((left, right) => left.localeCompare(right));
  }

  private mergeDisabledScopes(
    left: ModelCatalogDisableScope[] | undefined,
    right: ModelCatalogDisableScope[] | undefined,
  ): ModelCatalogDisableScope[] | undefined {
    const merged = Array.from(new Set([...(left ?? []), ...(right ?? [])]));
    return merged.length > 0 ? merged : undefined;
  }
}
