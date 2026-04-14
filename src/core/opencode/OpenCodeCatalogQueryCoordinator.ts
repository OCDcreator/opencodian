import { createLogger } from '../../shared';
import type { OpencodeModelConfigSubset } from '../types';
import type {
  OpenCodeCatalogStateStore,
  OpenCodeCatalogToolIdentityContext,
} from './OpenCodeCatalogStateStore';
import type { OpenCodeSdkFacade } from './OpenCodeSdkFacade';
import type {
  ServerStatus,
  ToolCatalogEntry,
  ToolCatalogSnapshot,
} from './types';

const logger = createLogger('OpenCodeCatalogQueryCoordinator');

type OpenCodeCatalogModelEntry = {
  id: string;
  name: string;
  contextWindow?: number;
};

type OpenCodeCatalogProviderEntry = {
  id: string;
  name: string;
  models: OpenCodeCatalogModelEntry[];
};

type OpenCodeAvailableModelsResult = {
  providers: OpenCodeCatalogProviderEntry[];
  defaults: Record<string, string>;
};

type OpenCodeProviderDirectoryResult = OpenCodeAvailableModelsResult & {
  connected: string[];
};

export interface OpenCodeCatalogQueryCoordinatorDebugMetadata {
  baseUrl: string;
  vaultPath: string | null;
  serverStatus: ServerStatus;
  isManagedServerRunning: boolean;
  managedServerState: unknown;
}

export interface OpenCodeCatalogQueryCoordinatorHost {
  shouldUseSdkCrud(): boolean;
  getSdkFacade(options?: { includeDirectory?: boolean }): Pick<OpenCodeSdkFacade, 'config' | 'provider' | 'tool'>;
  getLegacy<T>(path: string, options?: { includeDirectory?: boolean }): Promise<T>;
  logServiceWarning(key: string, message: string, error: unknown): void;
  logServiceError(key: string, message: string, error: unknown): void;
  getDebugMetadata(): OpenCodeCatalogQueryCoordinatorDebugMetadata;
  getToolCatalogScopeKey(): string;
}

export class OpenCodeCatalogQueryCoordinator {
  constructor(
    private readonly catalogState: OpenCodeCatalogStateStore,
    private readonly host: OpenCodeCatalogQueryCoordinatorHost,
  ) {}

  async getAvailableModels(
    options: { includeDirectory?: boolean; debugReason?: string | null } = {},
  ): Promise<OpenCodeAvailableModelsResult> {
    const { includeDirectory = true, debugReason = null } = options;
    const shouldLogDebug = this.logCatalogRequest('getAvailableModels', includeDirectory, debugReason);

    if (this.host.shouldUseSdkCrud()) {
      try {
        const data = await this.host.getSdkFacade({ includeDirectory }).config.providers();
        const normalized = this.normalizeAvailableModels(data);
        if (shouldLogDebug) {
          this.logProviderCatalogResponse('getAvailableModels', 'sdk', includeDirectory, debugReason, normalized);
        }
        return normalized;
      } catch (error) {
        this.host.logServiceWarning(
          'config.providers',
          'SDK config.providers failed, falling back to legacy HTTP',
          error,
        );
      }
    }

    try {
      const data = await this.host.getLegacy<{
        providers: Array<{ id: string; name: string; models: unknown }>;
        default: { provider?: string; model?: string };
      }>('/config/providers', { includeDirectory });
      const normalized = this.normalizeAvailableModels({
        providers: data.providers,
        default: data.default?.provider && data.default?.model
          ? { [data.default.provider]: data.default.model }
          : {},
      });
      if (shouldLogDebug) {
        this.logProviderCatalogResponse('getAvailableModels', 'legacy', includeDirectory, debugReason, normalized);
      }
      return normalized;
    } catch (error) {
      this.host.logServiceError('config.providers', 'Failed to get models:', error);
      return { providers: [], defaults: {} };
    }
  }

  async getProviderDirectory(
    options: { includeDirectory?: boolean; debugReason?: string | null } = {},
  ): Promise<OpenCodeProviderDirectoryResult> {
    const { includeDirectory = true, debugReason = null } = options;
    const shouldLogDebug = this.logCatalogRequest('getProviderDirectory', includeDirectory, debugReason);

    if (this.host.shouldUseSdkCrud()) {
      try {
        const data = await this.host.getSdkFacade({ includeDirectory }).provider.list();
        const normalized = this.normalizeProviderDirectory(data);
        if (shouldLogDebug) {
          this.logProviderCatalogResponse('getProviderDirectory', 'sdk', includeDirectory, debugReason, normalized);
        }
        return normalized;
      } catch (error) {
        this.host.logServiceWarning(
          'provider.list',
          'SDK provider.list failed, falling back to legacy HTTP',
          error,
        );
      }
    }

    try {
      const data = await this.host.getLegacy<{
        all: Array<{ id: string; name: string; models: unknown }>;
        default: Record<string, string>;
        connected?: string[];
      }>('/provider', { includeDirectory });
      const normalized = this.normalizeProviderDirectory(data);
      if (shouldLogDebug) {
        this.logProviderCatalogResponse('getProviderDirectory', 'legacy', includeDirectory, debugReason, normalized);
      }
      return normalized;
    } catch (error) {
      this.host.logServiceError('provider.list', 'Failed to get provider directory:', error);
      return { providers: [], defaults: {}, connected: [] };
    }
  }

  async getResolvedModelConfig(
    options: { includeDirectory?: boolean; debugReason?: string | null } = {},
  ): Promise<OpencodeModelConfigSubset> {
    const { includeDirectory = true, debugReason = null } = options;
    const shouldLogDebug = this.logCatalogRequest('getResolvedModelConfig', includeDirectory, debugReason);

    if (this.host.shouldUseSdkCrud()) {
      try {
        const resolved = this.normalizeResolvedModelConfigData(
          await this.host.getSdkFacade({ includeDirectory }).config.get(),
        );
        if (shouldLogDebug) {
          this.logResolvedModelConfigResponse('getResolvedModelConfig', 'sdk', includeDirectory, debugReason, resolved);
        }
        return resolved;
      } catch (error) {
        this.host.logServiceWarning(
          'config.get',
          'SDK config.get failed, falling back to legacy HTTP',
          error,
        );
      }
    }

    try {
      const resolved = this.normalizeResolvedModelConfigData(
        await this.host.getLegacy<Record<string, unknown>>('/config', { includeDirectory }),
      );
      if (shouldLogDebug) {
        this.logResolvedModelConfigResponse('getResolvedModelConfig', 'legacy', includeDirectory, debugReason, resolved);
      }
      return resolved;
    } catch (error) {
      this.host.logServiceError('config.get', 'Failed to get resolved model config:', error);
      return {};
    }
  }

  observeRuntimeToolNames(toolNames: Iterable<string>): boolean {
    return this.catalogState.observeRuntimeToolNames(toolNames);
  }

  buildOpenCodeToolIdentityContext(): OpenCodeCatalogToolIdentityContext {
    return this.catalogState.buildToolIdentityContext();
  }

  async refreshToolIds(): Promise<string[]> {
    const toolIds = await this.host.getSdkFacade().tool.ids();
    return this.catalogState.updateRegistryToolIds(Array.isArray(toolIds) ? toolIds : []);
  }

  async listTools(
    providerID: string,
    modelID: string,
    options: { refresh?: boolean } = {},
  ): Promise<ToolCatalogEntry[]> {
    const normalizedProviderID = providerID.trim();
    const normalizedModelID = modelID.trim();
    const modelKey = this.getToolSchemaCacheKey(normalizedProviderID, normalizedModelID);

    if (!options.refresh && this.catalogState.hasToolSchemaCache(modelKey)) {
      return this.catalogState.getToolSchemaCache(modelKey);
    }

    const tools = this.normalizeToolCatalogEntries(
      await this.host.getSdkFacade().tool.list({
        provider: normalizedProviderID,
        model: normalizedModelID,
      }),
    );
    return this.catalogState.updateToolSchemaCache(modelKey, tools);
  }

  getToolCatalogSnapshot(): ToolCatalogSnapshot {
    return this.catalogState.getToolCatalogSnapshot();
  }

  getToolCatalogScopeKey(): string {
    return this.host.getToolCatalogScopeKey();
  }

  clearToolSchemaCacheIfScopeChanged(previousToolCatalogScope: string): void {
    if (previousToolCatalogScope !== this.getToolCatalogScopeKey()) {
      this.catalogState.clearToolSchemaCache();
    }
  }

  private logCatalogRequest(
    operation: string,
    includeDirectory: boolean,
    debugReason: string | null,
  ): boolean {
    const normalizedDebugReason = this.normalizeDebugReason(debugReason);
    if (!normalizedDebugReason) {
      return false;
    }

    logger.debug(`${operation} request`, {
      debugReason: normalizedDebugReason,
      includeDirectory,
      ...this.host.getDebugMetadata(),
      sdkCrudEnabled: this.host.shouldUseSdkCrud(),
    });
    return true;
  }

  private logProviderCatalogResponse(
    operation: string,
    source: 'sdk' | 'legacy',
    includeDirectory: boolean,
    debugReason: string | null,
    normalized: OpenCodeAvailableModelsResult | OpenCodeProviderDirectoryResult,
  ): void {
    const normalizedDebugReason = this.normalizeDebugReason(debugReason);
    if (!normalizedDebugReason) {
      return;
    }

    logger.debug(`${operation} ${source} response`, {
      debugReason: normalizedDebugReason,
      includeDirectory,
      providerIds: normalized.providers.map((provider) => provider.id),
      providerModelCounts: normalized.providers.map((provider) => ({
        id: provider.id,
        modelCount: provider.models.length,
      })),
      connected: 'connected' in normalized ? normalized.connected : undefined,
      defaults: normalized.defaults,
    });
  }

  private logResolvedModelConfigResponse(
    operation: string,
    source: 'sdk' | 'legacy',
    includeDirectory: boolean,
    debugReason: string | null,
    resolved: OpencodeModelConfigSubset,
  ): void {
    const normalizedDebugReason = this.normalizeDebugReason(debugReason);
    if (!normalizedDebugReason) {
      return;
    }

    logger.debug(`${operation} ${source} response`, {
      debugReason: normalizedDebugReason,
      includeDirectory,
      providerIds: Object.keys(resolved.provider ?? {}),
      enabledProviders: [...(resolved.enabled_providers ?? [])],
      disabledProviders: [...(resolved.disabled_providers ?? [])],
    });
  }

  private normalizeAvailableModels(data: unknown): OpenCodeAvailableModelsResult {
    const source = data as {
      providers?: Array<{ id: string; name?: string; models: unknown }>;
      all?: Array<{ id: string; name?: string; models: unknown }>;
      default?: Record<string, string>;
    } | undefined;
    const providers = Array.isArray(source?.providers)
      ? source.providers
      : Array.isArray(source?.all)
        ? source.all
        : [];

    return {
      providers: providers.map((provider) => {
        let models: OpenCodeCatalogModelEntry[] = [];

        if (Array.isArray(provider.models)) {
          models = provider.models.map((modelId) => ({
            id: String(modelId),
            name: String(modelId),
          }));
        } else if (provider.models && typeof provider.models === 'object') {
          models = Object.entries(
            provider.models as Record<string, { name?: string; limit?: { context?: number } }>,
          ).map(([id, info]) => ({
            id,
            name: info.name ?? id,
            contextWindow: typeof info.limit?.context === 'number' ? info.limit.context : undefined,
          }));
        }

        return {
          id: provider.id,
          name: provider.name ?? provider.id,
          models,
        };
      }),
      defaults: this.normalizeProviderDefaults(source?.default),
    };
  }

  private normalizeProviderDefaults(source: unknown): Record<string, string> {
    if (!source || typeof source !== 'object') {
      return {};
    }

    const defaultRecord = source as Record<string, unknown>;
    if (typeof defaultRecord.provider === 'string' && typeof defaultRecord.model === 'string') {
      const providerId = defaultRecord.provider.trim();
      const modelId = defaultRecord.model.trim();
      return providerId && modelId
        ? { [providerId]: modelId }
        : {};
    }

    return Object.fromEntries(
      Object.entries(defaultRecord)
        .map(([providerId, modelId]) => [providerId.trim(), typeof modelId === 'string' ? modelId.trim() : ''] as const)
        .filter(([providerId, modelId]) => providerId.length > 0 && modelId.length > 0),
    );
  }

  private normalizeProviderDirectory(data: unknown): OpenCodeProviderDirectoryResult {
    const source = data as {
      connected?: unknown;
    } | undefined;

    return {
      ...this.normalizeAvailableModels(data),
      connected: Array.isArray(source?.connected)
        ? source.connected.filter((item): item is string => typeof item === 'string')
        : [],
    };
  }

  private normalizeResolvedModelConfigData(data: unknown): OpencodeModelConfigSubset {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {};
    }

    const record = data as Record<string, unknown>;
    return {
      model: typeof record.model === 'string' ? record.model : undefined,
      small_model: typeof record.small_model === 'string' ? record.small_model : undefined,
      provider: typeof record.provider === 'object' && record.provider !== null
        ? record.provider as OpencodeModelConfigSubset['provider']
        : undefined,
      enabled_providers: Array.isArray(record.enabled_providers)
        ? record.enabled_providers.filter((item): item is string => typeof item === 'string')
        : undefined,
      disabled_providers: Array.isArray(record.disabled_providers)
        ? record.disabled_providers.filter((item): item is string => typeof item === 'string')
        : undefined,
    };
  }

  private normalizeToolCatalogEntries(response: unknown): ToolCatalogEntry[] {
    if (!Array.isArray(response)) {
      return [];
    }

    return response.reduce<ToolCatalogEntry[]>((items, item) => {
      if (!item || typeof item !== 'object') {
        return items;
      }

      const candidate = item as { id?: unknown; description?: unknown; parameters?: unknown };
      if (typeof candidate.id !== 'string' || typeof candidate.description !== 'string') {
        return items;
      }

      items.push({
        id: candidate.id,
        description: candidate.description,
        parameters: candidate.parameters,
      });
      return items;
    }, []);
  }

  private getToolSchemaCacheKey(providerID: string, modelID: string): string {
    return `${this.getToolCatalogScopeKey()}::${providerID}::${modelID}`;
  }

  private normalizeDebugReason(debugReason: string | null): string | null {
    if (typeof debugReason !== 'string') {
      return null;
    }

    const trimmed = debugReason.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
