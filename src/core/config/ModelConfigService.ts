import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { createLogger } from '../../shared';
import type { OpenCodeService } from '../opencode';
import type { ModelSourceMode, OpencodeModelConfigSubset } from '../types';
import {
  compareModelCatalogs,
  type ModelCatalogComparison,
} from './modelCatalogComparison';
import {
  applyModelConfig,
  assembleModelCatalog,
  assembleServerModelCatalog,
  buildCatalogFromConfig,
  collectConfiguredProviderIds,
  extractModelConfig,
  getEnabledProviderIds,
  mergeModelConfigSubsets,
  type ModelCatalog,
  type ModelServerCatalogAssemblyResult,
  parseOpencodeConfigText,
  type ProviderAvailabilityConfig,
  type ProviderDirectoryRuntimeResult,
  type ProviderDirectorySnapshot,
  resolveProviderAvailabilityProbePlan,
} from './modelConfig';
import type { OpencodeConfigManager } from './OpencodeConfigManager';
import type {
  OpencodeConfigSourceCandidate,
  OpencodeConfigSourceMutationOutcome,
  OpencodeConfigSourceReadResult,
} from './OpencodeConfigSourceService';

const logger = createLogger('ModelConfigService');

export type { ProviderDirectorySnapshot };

/** A source-bound model configuration snapshot. The effective catalog is intentionally not editable. */
export interface ModelConfigSourceSnapshot {
  readonly source: OpencodeConfigSourceCandidate;
  readonly content: string;
  readonly subset: OpencodeModelConfigSubset;
}


export interface ModelCatalogBundle {
  local: ModelCatalog;
  server: ModelCatalog;
  baseEffective: ModelCatalog;
  effective: ModelCatalog;
  currentEnabledProviderIds: string[];
  serverConfig: OpencodeModelConfigSubset;
  effectiveProviderConfig: ProviderAvailabilityConfig;
  providerDirectory: ProviderDirectorySnapshot;
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

  /** P1 source inventory is the sole authority for selectable configuration files. */
  async inventoryConfigurationSources(): Promise<readonly OpencodeConfigSourceCandidate[]> {
    return this.configManager.inventoryConfigurationSources();
  }

  /** Reads exactly the selected source; it never resolves or edits merged effective config. */
  async readModelConfigurationSource(targetPath: string): Promise<ModelConfigSourceSnapshot | OpencodeConfigSourceReadResult> {
    const result = await this.configManager.readConfigurationSource(targetPath);
    if (result.status !== 'success') return result;
    let subset: OpencodeModelConfigSubset = {};
    if (result.content.trim()) {
      try {
        subset = extractModelConfig(parseOpencodeConfigText(result.content));
      } catch (error) {
        // P1 deliberately returns exact raw bytes for repairable malformed JSONC.
        // The visual model editor can safely show an empty owned subset while the
        // source metadata directs the user to the raw advanced editor.
        logger.warn('Selected OpenCode model source could not be parsed as JSONC; using an empty model subset', {
          targetPath,
          error,
        });
      }
    }
    return {
      source: result.source,
      content: result.content,
      subset,
    };
  }

  /**
   * Applies only the five model-owned top-level keys through the P1 JSONC/CAS writer.
   * Undefined values deliberately remove their key while preserving comments and unknown fields.
   */
  async applyModelConfigurationSource(
    targetPath: string,
    subset: OpencodeModelConfigSubset,
    expectedRevision: OpencodeConfigSourceCandidate['revision'],
  ): Promise<OpencodeConfigSourceMutationOutcome> {
    return this.configManager.applyConfigurationPathEdits({
      targetPath,
      expectedRevision,
      edits: [
        { path: ['model'], value: subset.model },
        { path: ['small_model'], value: subset.small_model },
        { path: ['provider'], value: subset.provider },
        { path: ['enabled_providers'], value: subset.enabled_providers },
        { path: ['disabled_providers'], value: subset.disabled_providers },
      ],
    });
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
    const assembledCatalog = assembleModelCatalog({
      local,
      server,
      mode,
      disabledModelRefs,
      configResolution: serverState.configResolution,
    });

    const bundle = {
      local,
      server,
      baseEffective: assembledCatalog.baseEffective,
      currentEnabledProviderIds: assembledCatalog.currentEnabledProviderIds,
      serverConfig: serverState.configResolution.inheritedConfig,
      effectiveProviderConfig: assembledCatalog.effectiveProviderConfig,
      providerDirectory: serverState.providerDirectory,
      effective: assembledCatalog.effective,
    };
    return bundle;
  }

  async getV2CatalogComparison(serverCatalog: ModelCatalog): Promise<ModelCatalogComparison> {
    const snapshot = await this.openCodeService.getV2CatalogSnapshot({ includeDirectory: true });
    return compareModelCatalogs(serverCatalog, snapshot);
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
    const localConfig = await this.readLocalModelConfig();
    const serverState = await this.loadServerState(localConfig);
    const probePlan = resolveProviderAvailabilityProbePlan({
      providerId,
      localConfig,
      runtimeCatalog: serverState.runtime,
      serverCatalog: serverState.server,
      configResolution: serverState.configResolution,
    });

    let sendTestAttempted = false;
    let sendTestSucceeded = false;
    let sendTestError: string | undefined;
    let sendTestResponsePreview: string | undefined;
    let status: ProviderAvailabilityProbeStatus = probePlan.status;

    if (probePlan.shouldSendProbe && probePlan.testedModelId) {
      const sendProbe = await this.openCodeService.probeProviderResponse(
        probePlan.providerId,
        probePlan.testedModelId,
      );
      sendTestAttempted = true;
      sendTestSucceeded = sendProbe.success;
      sendTestError = sendProbe.error;
      sendTestResponsePreview = sendProbe.responsePreview;
      status = sendProbe.success ? 'available' : 'send_failed';
    }

    return {
      providerId: probePlan.providerId,
      status,
      effectiveEnabled: probePlan.effectiveEnabled,
      projectDisabled: probePlan.projectDisabled,
      serverDisabled: probePlan.serverDisabled,
      overridesServerDisabled: probePlan.serverDisabled && probePlan.effectiveEnabled,
      runtimeModelCount: probePlan.runtimeModelCount,
      catalogModelCount: probePlan.catalogModelCount,
      testedModelId: probePlan.testedModelId,
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

  private async loadServerState(
    localConfig: OpencodeModelConfigSubset | null = null,
  ): Promise<ModelServerCatalogAssemblyResult> {
    const resolvedLocalConfig = localConfig ?? await this.readLocalModelConfig();
    const localServerMode = this.isLocalServerMode();
    const [runtimeResult, providerDirectoryResult, scopedConfig, defaultScopeConfig, diskInheritedConfig] = await Promise.all([
      this.openCodeService.getAvailableModels({ includeDirectory: true }),
      this.loadProviderDirectory(),
      this.openCodeService.getResolvedModelConfig({ includeDirectory: true }),
      this.openCodeService.getResolvedModelConfig({ includeDirectory: false }),
      localServerMode ? this.readLocalInheritedModelConfig() : Promise.resolve(undefined),
    ]);

    return assembleServerModelCatalog({
      runtimeResult,
      providerDirectoryResult,
      localServerMode,
      localConfig: resolvedLocalConfig,
      scopedConfig,
      defaultScopeConfig,
      diskInheritedConfig,
    });
  }

  private async loadProviderDirectory(): Promise<ProviderDirectoryRuntimeResult | undefined> {
    try {
      return await this.openCodeService.getProviderDirectory({ includeDirectory: true });
    } catch (error) {
      logger.warn('Failed to load OpenCode provider directory; continuing with empty providerDirectory snapshot', {
        error,
      });
      return undefined;
    }
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
}
