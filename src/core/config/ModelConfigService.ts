import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { createLogger } from '../../shared';
import type { OpenCodeService } from '../opencode';
import type { ModelSourceMode, OpencodeModelConfigSubset } from '../types';
import {
  applyModelConfig,
  buildCatalogFromConfig,
  collectConfiguredProviderIds,
  extractModelConfig,
  filterCatalog,
  getEnabledProviderIds,
  isProviderEnabled,
  mergeCatalogs,
  mergeModelConfigSubsets,
  mergeProviderAvailabilityConfig,
  type ModelCatalog,
  type ModelCatalogProvider,
  parseModelReference,
  parseOpencodeConfigText,
  type ProviderAvailabilityConfig,
} from './modelConfig';
import type { OpencodeConfigManager } from './OpencodeConfigManager';

const logger = createLogger('ModelConfigService');

export interface ModelCatalogBundle {
  local: ModelCatalog;
  server: ModelCatalog;
  baseEffective: ModelCatalog;
  effective: ModelCatalog;
  currentEnabledProviderIds: string[];
  serverConfig: OpencodeModelConfigSubset;
  effectiveProviderConfig: ProviderAvailabilityConfig;
}

export type ProviderAvailabilityProbeStatus =
  | 'available'
  | 'send_failed'
  | 'project_disabled'
  | 'server_disabled'
  | 'catalog_only'
  | 'missing';

export interface ProviderAvailabilityProbe {
  providerId: string;
  status: ProviderAvailabilityProbeStatus;
  effectiveEnabled: boolean;
  projectDisabled: boolean;
  serverDisabled: boolean;
  overridesServerDisabled: boolean;
  runtimeModelCount: number;
  catalogModelCount: number;
  testedModelId?: string;
  sendTestAttempted: boolean;
  sendTestSucceeded: boolean;
  sendTestError?: string;
  sendTestResponsePreview?: string;
}

interface ModelConfigServiceOptions {
  xdgConfigHome?: string;
  homeDir?: string;
  managedConfigDir?: string;
}

export class ModelConfigService {
  constructor(
    private readonly configManager: OpencodeConfigManager,
    private readonly openCodeService: OpenCodeService,
    private readonly options: ModelConfigServiceOptions = {},
  ) {}

  getConfigPath(): string {
    return this.configManager.getConfigPath();
  }

  async readLocalModelConfig(): Promise<OpencodeModelConfigSubset> {
    const config = await this.configManager.read();
    return {
      model: typeof config.model === 'string' ? config.model : undefined,
      small_model: typeof config.small_model === 'string' ? config.small_model : undefined,
      provider: config.provider,
      enabled_providers: config.enabled_providers,
      disabled_providers: config.disabled_providers,
    };
  }

  async writeLocalModelConfig(subset: OpencodeModelConfigSubset): Promise<void> {
    const current = await this.configManager.read();
    const next = applyModelConfig(current, subset);
    await this.configManager.write(next);
  }

  async getLocalCatalog(): Promise<ModelCatalog> {
    return buildCatalogFromConfig(await this.readLocalModelConfig(), 'local');
  }

  async getServerCatalog(): Promise<ModelCatalog> {
    const localConfig = await this.readLocalModelConfig();
    const serverState = await this.loadServerState(localConfig);
    logger.debug('getServerCatalog raw result', {
      runtimeProviderIds: serverState.runtime.providers.map((provider) => provider.id),
      runtimeProviderModelCounts: serverState.runtime.providers.map((provider) => ({
        id: provider.id,
        modelCount: provider.models.length,
      })),
      defaults: serverState.server.defaults,
      scopedDisabledProviders: [...(serverState.scopedConfig.disabled_providers ?? [])],
      inheritedConfigSource: serverState.inheritedConfigSource,
      inheritedServerProviderIds: Object.keys(serverState.inheritedConfig.provider ?? {}),
      inheritedServerDisabledProviders: [...(serverState.inheritedConfig.disabled_providers ?? [])],
      defaultScopeProviderIds: Object.keys(serverState.defaultScopeConfig.provider ?? {}),
      defaultScopeDisabledProviders: [...(serverState.defaultScopeConfig.disabled_providers ?? [])],
      mergedProviderIds: serverState.server.providers.map((provider) => provider.id),
    });
    return serverState.server;
  }

  async getCatalogs(mode: ModelSourceMode, disabledModelRefs: string[] = []): Promise<ModelCatalogBundle> {
    const localConfig = await this.readLocalModelConfig();
    const serverState = await this.loadServerState(localConfig);
    const local = buildCatalogFromConfig(localConfig, 'local');
    const server = serverState.server;
    const baseEffective = this.resolveCatalog(local, server, mode);
    const effectiveProviderConfig = this.buildEffectiveProviderConfig(
      serverState.inheritedConfig,
      localConfig,
      serverState.hardServerDisabledProviderIds,
    );
    const hardServerDisabledProviderIds = new Set(serverState.hardServerDisabledProviderIds);
    const currentEnabledProviderIds = baseEffective.providers
      .map((provider) => provider.id)
      .filter((providerId, index, providerIds) => (
        providerIds.indexOf(providerId) === index
        && !hardServerDisabledProviderIds.has(providerId)
        && this.isProviderEnabledInCurrentScope(providerId, serverState.scopedConfig, localConfig)
      ));
    const effective = this.filterCatalogToProviderIds(
      filterCatalog(baseEffective, {
        disabledModelRefs,
      }),
      new Set(currentEnabledProviderIds),
    );

    const bundle = {
      local,
      server,
      baseEffective,
      currentEnabledProviderIds,
      serverConfig: serverState.inheritedConfig,
      effectiveProviderConfig,
      effective,
    };
    return bundle;
  }

  async isModelAvailableOnServer(provider: string, model: string): Promise<boolean> {
    const server = await this.getServerCatalog();
    const providerEntry = server.providers.find((item) => item.id === provider);
    if (!providerEntry) {
      return false;
    }

    return providerEntry.models.some((item) => item.id === model);
  }

  async testProviderAvailability(providerId: string): Promise<ProviderAvailabilityProbe> {
    const normalizedProviderId = providerId.trim();
    if (!normalizedProviderId) {
      return {
        providerId: '',
        status: 'missing',
        effectiveEnabled: false,
        projectDisabled: false,
        serverDisabled: false,
        overridesServerDisabled: false,
        runtimeModelCount: 0,
        catalogModelCount: 0,
        sendTestAttempted: false,
        sendTestSucceeded: false,
      };
    }

    const localConfig = await this.readLocalModelConfig();
    const serverState = await this.loadServerState(localConfig);
    const effectiveProviderConfig = this.buildEffectiveProviderConfig(
      serverState.inheritedConfig,
      localConfig,
      serverState.hardServerDisabledProviderIds,
    );
    const runtimeProvider = serverState.runtime.providers.find((provider) => provider.id === normalizedProviderId);
    const serverProvider = serverState.server.providers.find((provider) => provider.id === normalizedProviderId);
    const projectDisabled = !isProviderEnabled(localConfig, normalizedProviderId);
    const serverDisabled = (
      serverState.hardServerDisabledProviderIds.includes(normalizedProviderId)
      || !isProviderEnabled(serverState.scopedConfig, normalizedProviderId)
    );
    const effectiveEnabled = (
      !serverState.hardServerDisabledProviderIds.includes(normalizedProviderId)
      && this.isProviderEnabledInCurrentScope(normalizedProviderId, serverState.scopedConfig, localConfig)
      && isProviderEnabled(effectiveProviderConfig, normalizedProviderId)
    );
    const runtimeModelCount = runtimeProvider?.models.length ?? 0;
    const catalogModelCount = serverProvider?.models.length ?? 0;
    const testedModelId = this.selectProviderProbeModelId(
      normalizedProviderId,
      localConfig,
      runtimeProvider,
      serverProvider,
      serverState.server,
    );

    let status: ProviderAvailabilityProbeStatus = 'missing';
    let sendTestAttempted = false;
    let sendTestSucceeded = false;
    let sendTestError: string | undefined;
    let sendTestResponsePreview: string | undefined;

    if (!effectiveEnabled && projectDisabled) {
      status = 'project_disabled';
    } else if (!effectiveEnabled && serverDisabled) {
      status = 'server_disabled';
    } else if (!testedModelId && serverProvider) {
      status = 'catalog_only';
    } else if (testedModelId) {
      const sendProbe = await this.openCodeService.probeProviderResponse(normalizedProviderId, testedModelId);
      sendTestAttempted = true;
      sendTestSucceeded = sendProbe.success;
      sendTestError = sendProbe.error;
      sendTestResponsePreview = sendProbe.responsePreview;
      status = sendProbe.success ? 'available' : 'send_failed';
    } else if (runtimeModelCount > 0) {
      status = 'available';
    } else if (serverProvider) {
      status = 'catalog_only';
    }

    return {
      providerId: normalizedProviderId,
      status,
      effectiveEnabled,
      projectDisabled,
      serverDisabled,
      overridesServerDisabled: serverDisabled && effectiveEnabled,
      runtimeModelCount,
      catalogModelCount,
      testedModelId,
      sendTestAttempted,
      sendTestSucceeded,
      sendTestError,
      sendTestResponsePreview,
    };
  }

  async getLocalProviderIds(): Promise<string[]> {
    const config = await this.readLocalModelConfig();
    return getEnabledProviderIds(config, collectConfiguredProviderIds(config));
  }

  private resolveCatalog(local: ModelCatalog, server: ModelCatalog, mode: ModelSourceMode): ModelCatalog {
    if (mode === 'local') {
      return local;
    }

    if (mode === 'server') {
      return server;
    }

    return mergeCatalogs(server, local);
  }

  private buildServerCatalog(
    runtimeCatalog: ModelCatalog,
    metadataConfig: OpencodeModelConfigSubset,
    hardServerDisabledProviderIds: Iterable<string>,
  ): ModelCatalog {
    const resolvedCatalog = buildCatalogFromConfig(metadataConfig, 'server');
    const providers = new Map<string, ModelCatalogProvider>();
    const resolvedProviders = new Map(
      resolvedCatalog.providers.map((provider) => [provider.id, provider] as const),
    );

    for (const provider of runtimeCatalog.providers) {
      this.mergeServerProvider(providers, provider);
    }

    for (const [providerId, provider] of resolvedProviders) {
      if (!providers.has(providerId)) {
        continue;
      }

      this.mergeServerProvider(providers, provider);
    }

    for (const providerId of hardServerDisabledProviderIds) {
      const existing = providers.get(providerId);
      const resolvedProvider = resolvedProviders.get(providerId);

      if (existing) {
        providers.set(providerId, {
          ...existing,
          disabledScopes: this.mergeDisabledScopes(existing.disabledScopes, ['global']),
          models: existing.models.map((model) => ({
            ...model,
            disabledScopes: this.mergeDisabledScopes(model.disabledScopes, ['global']),
          })),
        });
        continue;
      }

      providers.set(providerId, {
        id: providerId,
        name: resolvedProvider?.name ?? providerId,
        source: 'server',
        existsInLocal: false,
        existsInServer: true,
        disabledScopes: ['global'],
        models: (resolvedProvider?.models ?? []).map((model) => ({
          ...model,
          source: 'server',
          existsInLocal: false,
          existsInServer: true,
        })),
      });
    }

    return {
      providers: [...providers.values()]
        .filter((provider) => provider.models.length > 0 || provider.disabledScopes?.length)
        .sort((left, right) => left.name.localeCompare(right.name)),
      defaults: {
        ...resolvedCatalog.defaults,
        ...runtimeCatalog.defaults,
      },
    };
  }

  private async loadServerState(localConfig: OpencodeModelConfigSubset | null = null): Promise<{
    runtime: ModelCatalog;
    scopedConfig: OpencodeModelConfigSubset;
    inheritedConfig: OpencodeModelConfigSubset;
    hardServerDisabledProviderIds: string[];
    inheritedConfigSource: 'local_disk' | 'server_default_scope';
    defaultScopeConfig: OpencodeModelConfigSubset;
    server: ModelCatalog;
  }> {
    const resolvedLocalConfig = localConfig ?? await this.readLocalModelConfig();
    const [runtimeResult, scopedConfig, defaultScopeConfig] = await Promise.all([
      this.openCodeService.getAvailableModels({ includeDirectory: true }),
      this.openCodeService.getResolvedModelConfig({ includeDirectory: true }),
      this.openCodeService.getResolvedModelConfig({ includeDirectory: false }),
    ]);
    const inherited = await this.resolveInheritedServerConfig(
      resolvedLocalConfig,
      scopedConfig,
      defaultScopeConfig,
    );
    const hardServerDisabledProviderIds = this.isLocalServerMode()
      ? this.collectHardServerDisabledProviderIds(
          inherited.config,
          scopedConfig,
        )
      : this.collectHardServerDisabledProviderIds(scopedConfig);
    const runtime = this.catalogFromResult(runtimeResult);
    return {
      runtime,
      scopedConfig,
      inheritedConfig: inherited.config,
      hardServerDisabledProviderIds,
      inheritedConfigSource: inherited.source,
      defaultScopeConfig,
      server: this.buildServerCatalog(
        runtime,
        mergeModelConfigSubsets(inherited.config, scopedConfig),
        hardServerDisabledProviderIds,
      ),
    };
  }

  private async resolveInheritedServerConfig(
    localConfig: OpencodeModelConfigSubset,
    scopedConfig: OpencodeModelConfigSubset,
    defaultScopeConfig: OpencodeModelConfigSubset,
  ): Promise<{
    config: OpencodeModelConfigSubset;
    source: 'local_disk' | 'server_default_scope';
  }> {
    if (!this.isLocalServerMode()) {
      return {
        config: defaultScopeConfig,
        source: 'server_default_scope',
      };
    }

    const diskInheritedConfig = await this.readLocalInheritedModelConfig();
    return {
      config: this.supplementInheritedConfigFromScopedConfig(
        diskInheritedConfig,
        scopedConfig,
        localConfig,
      ),
      source: 'local_disk',
    };
  }

  private isLocalServerMode(): boolean {
    return this.openCodeService.getSettingsSnapshot().server.mode === 'local';
  }

  private async readLocalInheritedModelConfig(): Promise<OpencodeModelConfigSubset> {
    let inherited = await this.readFirstAvailableModelConfig(
      this.getGlobalConfigCandidates(),
    );
    inherited = mergeModelConfigSubsets(
      inherited,
      await this.readFirstAvailableModelConfig(this.getHomeDirectoryConfigCandidates()),
    );
    inherited = mergeModelConfigSubsets(
      inherited,
      await this.readFirstAvailableModelConfig(this.getManagedConfigCandidates()),
    );
    return inherited;
  }

  private supplementInheritedConfigFromScopedConfig(
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

  private async readFirstAvailableModelConfig(candidates: string[]): Promise<OpencodeModelConfigSubset> {
    for (const candidate of candidates) {
      try {
        const content = await fs.promises.readFile(candidate, 'utf-8');
        return extractModelConfig(parseOpencodeConfigText(content));
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          continue;
        }

        logger.warn('Failed to read inherited OpenCode config candidate', {
          path: candidate,
          error,
        });
      }
    }

    return {};
  }

  private getGlobalConfigCandidates(): string[] {
    const homeDir = this.options.homeDir ?? os.homedir();
    const configDir = path.join(
      this.options.xdgConfigHome ?? process.env.XDG_CONFIG_HOME ?? path.join(homeDir, '.config'),
      'opencode',
    );
    return [
      path.join(configDir, 'opencode.jsonc'),
      path.join(configDir, 'opencode.json'),
      path.join(configDir, 'config.json'),
    ];
  }

  private getHomeDirectoryConfigCandidates(): string[] {
    const homeDir = this.options.homeDir ?? os.homedir();
    return [
      path.join(homeDir, '.opencode', 'opencode.json'),
      path.join(homeDir, '.opencode', 'opencode.jsonc'),
    ];
  }

  private getManagedConfigCandidates(): string[] {
    const managedDir = this.options.managedConfigDir ?? this.getManagedConfigDir();
    return [
      path.join(managedDir, 'opencode.json'),
      path.join(managedDir, 'opencode.jsonc'),
    ];
  }

  private getManagedConfigDir(): string {
    switch (process.platform) {
      case 'darwin':
        return '/Library/Application Support/opencode';
      case 'win32':
        return path.join(process.env.ProgramData || 'C:\\ProgramData', 'opencode');
      default:
        return '/etc/opencode';
    }
  }

  private catalogFromResult(result: {
    providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string; contextWindow?: number }> }>;
    defaults: Record<string, string>;
  }): ModelCatalog {
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
          source: 'server',
          existsInLocal: false,
          existsInServer: true,
        })),
      })),
      defaults: result.defaults,
    };
  }

  private mergeServerProvider(
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
        disabledScopes: this.mergeDisabledScopes(existingModel.disabledScopes, model.disabledScopes),
      });
    }

    providers.set(provider.id, {
      ...existing,
      ...provider,
      name: provider.name || existing.name,
      source: 'server',
      existsInLocal: false,
      existsInServer: true,
      disabledScopes: this.mergeDisabledScopes(existing.disabledScopes, provider.disabledScopes),
      models: [...models.values()].sort((left, right) => left.name.localeCompare(right.name)),
    });
  }

  private collectHardServerDisabledProviderIds(
    ...configs: Array<Pick<OpencodeModelConfigSubset, 'disabled_providers'>>
  ): string[] {
    const providerIds = new Set<string>();

    for (const config of configs) {
      for (const providerId of config.disabled_providers ?? []) {
        const trimmed = providerId.trim();
        if (trimmed) {
          providerIds.add(trimmed);
        }
      }
    }

    return [...providerIds];
  }

  private buildEffectiveProviderConfig(
    inheritedConfig: ProviderAvailabilityConfig | null | undefined,
    localConfig: ProviderAvailabilityConfig | null | undefined,
    hardServerDisabledProviderIds: Iterable<string>,
  ): ProviderAvailabilityConfig {
    const effectiveConfig = mergeProviderAvailabilityConfig(inheritedConfig, localConfig);
    const disabledProviders = this.collectHardServerDisabledProviderIds(
      { disabled_providers: effectiveConfig.disabled_providers },
      { disabled_providers: Array.from(hardServerDisabledProviderIds) },
    );

    return {
      ...effectiveConfig,
      disabled_providers: disabledProviders.length > 0 ? disabledProviders : undefined,
    };
  }

  private mergeDisabledScopes(
    left: ModelCatalogProvider['disabledScopes'] | ModelCatalogProvider['models'][number]['disabledScopes'],
    right: ModelCatalogProvider['disabledScopes'] | ModelCatalogProvider['models'][number]['disabledScopes'],
  ): Array<'global' | 'project'> | undefined {
    const merged = Array.from(new Set([...(left ?? []), ...(right ?? [])]));
    return merged.length > 0 ? merged : undefined;
  }

  private collectKnownProviderIds(config: OpencodeModelConfigSubset): string[] {
    const providerIds = new Set<string>();

    if (config.provider) {
      for (const providerId of Object.keys(config.provider)) {
        const trimmed = providerId.trim();
        if (trimmed) {
          providerIds.add(trimmed);
        }
      }
    }

    for (const parsed of [parseModelReference(config.model), parseModelReference(config.small_model)]) {
      if (parsed?.provider) {
        providerIds.add(parsed.provider);
      }
    }

    for (const providerId of config.disabled_providers ?? []) {
      const trimmed = providerId.trim();
      if (trimmed) {
        providerIds.add(trimmed);
      }
    }

    return [...providerIds];
  }

  private selectProviderProbeModelId(
    providerId: string,
    localConfig: OpencodeModelConfigSubset,
    runtimeProvider: ModelCatalogProvider | undefined,
    serverProvider: ModelCatalogProvider | undefined,
    serverCatalog: ModelCatalog,
  ): string | undefined {
    const configuredDefault = parseModelReference(localConfig.model);
    if (configuredDefault?.provider === providerId && configuredDefault.model) {
      return configuredDefault.model;
    }

    const serverDefault = serverCatalog.defaults[providerId];
    if (typeof serverDefault === 'string' && serverDefault.trim()) {
      return serverDefault.trim();
    }

    for (const provider of [runtimeProvider, serverProvider]) {
      const modelId = provider?.models.find((model) => model.id.trim())?.id;
      if (modelId) {
        return modelId;
      }
    }

    return undefined;
  }

  private isProviderEnabledInCurrentScope(
    providerId: string,
    scopedConfig: Pick<OpencodeModelConfigSubset, 'enabled_providers' | 'disabled_providers'>,
    localConfig: Pick<OpencodeModelConfigSubset, 'enabled_providers' | 'disabled_providers'>,
  ): boolean {
    return isProviderEnabled(scopedConfig, providerId) && isProviderEnabled(localConfig, providerId);
  }

  private filterCatalogToProviderIds(
    catalog: ModelCatalog,
    allowedProviderIds: ReadonlySet<string>,
  ): ModelCatalog {
    const providers = catalog.providers
      .filter((provider) => allowedProviderIds.has(provider.id))
      .map((provider) => ({
        ...provider,
        models: provider.models.map((model) => ({ ...model })),
      }));

    return {
      providers,
      defaults: Object.fromEntries(
        Object.entries(catalog.defaults).filter(([providerId]) => allowedProviderIds.has(providerId)),
      ),
    };
  }
}
