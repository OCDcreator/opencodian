import type { OpenCodeService } from '../opencode';
import type { ModelSourceMode, OpencodeModelConfigSubset } from '../types';
import {
  applyModelConfig,
  buildCatalogFromConfig,
  mergeCatalogs,
  type ModelCatalog,
  parseModelReference,
} from './modelConfig';
import type { OpencodeConfigManager } from './OpencodeConfigManager';

export interface ModelCatalogBundle {
  local: ModelCatalog;
  server: ModelCatalog;
  effective: ModelCatalog;
}

export class ModelConfigService {
  constructor(
    private readonly configManager: OpencodeConfigManager,
    private readonly openCodeService: OpenCodeService,
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
    const result = await this.openCodeService.getAvailableModels();
    return {
      providers: result.providers.map((provider) => ({
        id: provider.id,
        name: provider.name || provider.id,
        source: 'server' as const,
        existsInLocal: false,
        existsInServer: true,
        enabled: true,
        whitelist: [],
        blacklist: [],
        models: provider.models.map((model) => ({
          id: model.id,
          name: model.name || model.id,
          source: 'server' as const,
          existsInLocal: false,
          existsInServer: true,
          enabled: true,
        })),
      })),
      defaults: result.defaults,
    };
  }

  async getCatalogs(mode: ModelSourceMode): Promise<ModelCatalogBundle> {
    const [local, server] = await Promise.all([
      this.getLocalCatalog(),
      this.getServerCatalog(),
    ]);

    return {
      local,
      server,
      effective: this.resolveCatalog(local, server, mode),
    };
  }

  async isModelAvailableOnServer(provider: string, model: string): Promise<boolean> {
    const server = await this.getServerCatalog();
    const providerEntry = server.providers.find((item) => item.id === provider);
    if (!providerEntry) {
      return false;
    }

    return providerEntry.models.some((item) => item.id === model);
  }

  async getLocalProviderIds(): Promise<string[]> {
    const config = await this.readLocalModelConfig();
    if (!config.provider) {
      const modelRef = parseModelReference(config.model);
      return modelRef ? [modelRef.provider] : [];
    }

    return Object.keys(config.provider);
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
}
