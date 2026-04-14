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
  type ModelCatalog,
  type ModelCatalogProvider,
  type InheritedModelConfigResolution,
  parseModelReference,
  parseOpencodeConfigText,
  type ProviderAvailabilityConfig,
  resolveInheritedModelConfigResolution,
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
      scopedDisabledProviders: [...(serverState.configResolution.scopedConfig.disabled_providers ?? [])],
      inheritedConfigSource: serverState.configResolution.inheritedConfigSource,
      inheritedServerProviderIds: Object.keys(serverState.configResolution.inheritedConfig.provider ?? {}),
      inheritedServerDisabledProviders: [...(serverState.configResolution.inheritedConfig.disabled_providers ?? [])],
      defaultScopeProviderIds: Object.keys(serverState.configResolution.defaultScopeConfig.provider ?? {}),
      defaultScopeDisabledProviders: [...(serverState.configResolution.defaultScopeConfig.disabled_providers ?? [])],
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
    const effectiveProviderConfig = serverState.configResolution.effectiveProviderConfig;
    const currentEnabledProviderIds = serverState.configResolution.getCurrentEnabledProviderIds(
      baseEffective.providers.map((provider) => provider.id),
    );
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
      serverConfig: serverState.configResolution.inheritedConfig,
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
    const runtimeProvider = serverState.runtime.providers.find((provider) => provider.id === normalizedProviderId);
    const serverProvider = serverState.server.providers.find((provider) => provider.id === normalizedProviderId);
    const projectDisabled = !isProviderEnabled(localConfig, normalizedProviderId);
    const serverDisabled = !projectDisabled
      && !serverState.configResolution.isProviderEnabledInServerScope(normalizedProviderId);
    const effectiveEnabled = serverState.configResolution.isProviderEffectivelyEnabled(normalizedProviderId);
    const runtimeModelCount = runtimeProvider?.models.length ?? 0;
    const catalogModelCount = serverProvider?.models.length ?? 0;
    const testedModelId = this.selectProviderProbeModelId({
      providerId: normalizedProviderId,
      localConfig,
      runtimeProvider,
      serverProvider,
      serverCatalog: serverState.server,
    });

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

  private async loadServerState(localConfig: OpencodeModelConfigSubset | null = null): Promise<{
    runtime: ModelCatalog;
    configResolution: InheritedModelConfigResolution;
    server: ModelCatalog;
  }> {
    const resolvedLocalConfig = localConfig ?? await this.readLocalModelConfig();
    const localServerMode = this.isLocalServerMode();
    const [runtimeResult, scopedConfig, defaultScopeConfig, diskInheritedConfig] = await Promise.all([
      this.openCodeService.getAvailableModels({ includeDirectory: true }),
      this.openCodeService.getResolvedModelConfig({ includeDirectory: true }),
      this.openCodeService.getResolvedModelConfig({ includeDirectory: false }),
      localServerMode ? this.readLocalInheritedModelConfig() : Promise.resolve(undefined),
    ]);
    const configResolution = resolveInheritedModelConfigResolution({
      localServerMode,
      scopedConfig,
      defaultScopeConfig,
      localConfig: resolvedLocalConfig,
      diskInheritedConfig,
    });
    const runtime = this.catalogFromResult(runtimeResult);
    return {
      runtime,
      configResolution,
      server: this.buildServerCatalog(
        runtime,
        configResolution.mergedScopedConfig,
      ),
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

  private selectProviderProbeModelId(options: {
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
