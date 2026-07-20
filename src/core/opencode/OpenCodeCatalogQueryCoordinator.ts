import { createLogger } from '../../shared';
import type { OpencodeModelConfigSubset } from '../types';
import type {
  OpenCodeCatalogStateStore,
  OpenCodeCatalogToolIdentityContext,
} from './OpenCodeCatalogStateStore';
import type { OpenCodeSdkFacade } from './OpenCodeSdkFacade';
import type {
  McpServerStatus,
  ServerStatus,
  ToolCatalogEntry,
  ToolCatalogSnapshot,
} from './types';

const logger = createLogger('OpenCodeCatalogQueryCoordinator');

type OpenCodeCatalogModelEntry = {
  id: string;
  name: string;
  contextWindow?: number;
  variants?: string[];
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

type OpenCodeCatalogResponseLogContext = {
  operation: string;
  source: 'sdk' | 'legacy';
  includeDirectory: boolean;
  debugReason: string | null;
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
  getSdkFacade(
    options?: { includeDirectory?: boolean },
  ): Pick<
    OpenCodeSdkFacade,
    'config'
    | 'file'
    | 'find'
    | 'formatter'
    | 'lsp'
    | 'mcp'
    | 'path'
    | 'project'
    | 'provider'
    | 'tool'
    | 'v2'
    | 'vcs'
  >;
  getLegacy<T>(path: string, options?: { includeDirectory?: boolean }): Promise<T>;
  logServiceWarning(key: string, message: string, error: unknown): void;
  logServiceError(key: string, message: string, error: unknown): void;
  getDebugMetadata(): OpenCodeCatalogQueryCoordinatorDebugMetadata;
  getToolCatalogScopeKey(): string;
}

export type OpenCodeV2CatalogSnapshot = {
  status: 'available';
  providerIds: string[];
  modelRefs: string[];
} | {
  status: 'unavailable';
  reason: string;
};

type OpenCodeSdkMcpConfig = NonNullable<Parameters<OpenCodeSdkFacade['mcp']['add']>[0]>['config'];
type OpenCodeSdkFileListInput = Parameters<OpenCodeSdkFacade['file']['list']>[0];
type OpenCodeSdkFileReadInput = Parameters<OpenCodeSdkFacade['file']['read']>[0];
type OpenCodeSdkFindTextInput = Parameters<OpenCodeSdkFacade['find']['text']>[0];
type OpenCodeSdkFindFilesInput = Parameters<OpenCodeSdkFacade['find']['files']>[0];
type OpenCodeSdkFindSymbolsInput = Parameters<OpenCodeSdkFacade['find']['symbols']>[0];
type OpenCodeSdkVcsDiffInput = Parameters<OpenCodeSdkFacade['vcs']['diff']>[0];

export class OpenCodeCatalogQueryCoordinator {
  constructor(
    private readonly catalogState: OpenCodeCatalogStateStore,
    private readonly host: OpenCodeCatalogQueryCoordinatorHost,
  ) {}

  async getV2CatalogSnapshot(
    options: { includeDirectory?: boolean } = {},
  ): Promise<OpenCodeV2CatalogSnapshot> {
    if (!this.host.shouldUseSdkCrud()) {
      return {
        status: 'unavailable',
        reason: 'OpenCode SDK catalog queries are disabled',
      };
    }

    try {
      const sdk = this.host.getSdkFacade({ includeDirectory: options.includeDirectory ?? true });
      const [providerResponse, modelResponse] = await Promise.all([
        sdk.v2.provider.list(),
        sdk.v2.model.list(),
      ]);
      const providerData = this.getV2LocationData(providerResponse);
      const modelData = this.getV2LocationData(modelResponse);
      if (!providerData || !modelData) {
        return {
          status: 'unavailable',
          reason: 'Invalid V2 catalog response',
        };
      }

      const providerIds = this.normalizeStringSet(providerData.map((entry) => (
        this.readRecordString(entry, 'id')
      )));
      const modelRefs = this.normalizeStringSet(modelData.map((entry) => {
        const providerId = this.readRecordString(entry, 'providerID');
        const modelId = this.readRecordString(entry, 'id');
        return providerId && modelId ? `${providerId}/${modelId}` : null;
      }));

      return {
        status: 'available',
        providerIds,
        modelRefs,
      };
    } catch (error) {
      return {
        status: 'unavailable',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

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
          this.logProviderCatalogResponse({
            operation: 'getAvailableModels',
            source: 'sdk',
            includeDirectory,
            debugReason,
          }, normalized);
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
        this.logProviderCatalogResponse({
          operation: 'getAvailableModels',
          source: 'legacy',
          includeDirectory,
          debugReason,
        }, normalized);
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
          this.logProviderCatalogResponse({
            operation: 'getProviderDirectory',
            source: 'sdk',
            includeDirectory,
            debugReason,
          }, normalized);
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
        this.logProviderCatalogResponse({
          operation: 'getProviderDirectory',
          source: 'legacy',
          includeDirectory,
          debugReason,
        }, normalized);
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
          this.logResolvedModelConfigResponse({
            operation: 'getResolvedModelConfig',
            source: 'sdk',
            includeDirectory,
            debugReason,
          }, resolved);
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
        this.logResolvedModelConfigResponse({
          operation: 'getResolvedModelConfig',
          source: 'legacy',
          includeDirectory,
          debugReason,
        }, resolved);
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

  async refreshMcpServerStatus(): Promise<Record<string, McpServerStatus>> {
    return this.storeMcpServerStatus(await this.host.getSdkFacade().mcp.status());
  }

  async addMcpServer(name: string, config: Record<string, unknown>): Promise<Record<string, McpServerStatus>> {
    return this.storeMcpServerStatus(await this.host.getSdkFacade().mcp.add({
      name,
      config: config as OpenCodeSdkMcpConfig,
    }));
  }

  async connectMcpServer(name: string): Promise<boolean> {
    const response = await this.host.getSdkFacade().mcp.connect({ name });
    await this.refreshMcpServerStatus();
    return response === true;
  }

  async disconnectMcpServer(name: string): Promise<boolean> {
    const response = await this.host.getSdkFacade().mcp.disconnect({ name });
    await this.refreshMcpServerStatus();
    return response === true;
  }

  async startMcpAuth(name: string): Promise<unknown> {
    return this.host.getSdkFacade().mcp.auth.start({ name });
  }

  async completeMcpAuth(name: string, code: string): Promise<McpServerStatus> {
    const response = await this.host.getSdkFacade().mcp.auth.callback({ name, code });
    await this.refreshMcpServerStatus();
    return this.normalizeSingleMcpServerStatus(name, response);
  }

  async authenticateMcp(name: string): Promise<McpServerStatus> {
    const response = await this.host.getSdkFacade().mcp.auth.authenticate({ name });
    await this.refreshMcpServerStatus();
    return this.normalizeSingleMcpServerStatus(name, response);
  }

  async removeMcpAuth(name: string): Promise<{ success: true }> {
    await this.host.getSdkFacade().mcp.auth.remove({ name });
    return { success: true };
  }

  async getProviderAuthMethods(): Promise<unknown> {
    return this.host.getSdkFacade().provider.auth();
  }

  async authorizeProviderOAuth(providerID: string): Promise<unknown> {
    return this.host.getSdkFacade().provider.oauth.authorize({ providerID });
  }

  async completeProviderOAuth(providerID: string, code: string, method?: number): Promise<unknown> {
    return this.host.getSdkFacade().provider.oauth.callback({ providerID, code, method });
  }

  async listProjects(): Promise<unknown> {
    return this.host.getSdkFacade().project.list();
  }

  async getCurrentProject(): Promise<unknown> {
    return this.host.getSdkFacade().project.current();
  }

  async initializeProjectGit(): Promise<unknown> {
    return this.host.getSdkFacade().project.initGit();
  }

  async updateProject(projectID: string, input: Record<string, unknown>): Promise<unknown> {
    return this.host.getSdkFacade().project.update({ projectID, ...input });
  }

  async listFiles(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.host.getSdkFacade().file.list(input as OpenCodeSdkFileListInput);
  }

  async readFile(input: Record<string, unknown>): Promise<unknown> {
    return this.host.getSdkFacade().file.read(input as OpenCodeSdkFileReadInput);
  }

  async getFileStatus(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.host.getSdkFacade().file.status(input);
  }

  async findText(input: Record<string, unknown>): Promise<unknown> {
    return this.host.getSdkFacade().find.text(input as OpenCodeSdkFindTextInput);
  }

  async findFiles(input: Record<string, unknown>): Promise<unknown> {
    return this.host.getSdkFacade().find.files(input as OpenCodeSdkFindFilesInput);
  }

  async findSymbols(input: Record<string, unknown>): Promise<unknown> {
    return this.host.getSdkFacade().find.symbols(input as OpenCodeSdkFindSymbolsInput);
  }

  async getPaths(): Promise<unknown> {
    return this.host.getSdkFacade().path.get();
  }

  async getVcsInfo(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.host.getSdkFacade().vcs.get(input);
  }

  async getVcsDiff(input: Record<string, unknown> = {}): Promise<unknown> {
    return this.host.getSdkFacade().vcs.diff(input as OpenCodeSdkVcsDiffInput);
  }

  async getFormatterStatus(): Promise<unknown> {
    return this.host.getSdkFacade().formatter.status();
  }

  async getLspStatus(): Promise<unknown> {
    return this.host.getSdkFacade().lsp.status();
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
    context: OpenCodeCatalogResponseLogContext,
    normalized: OpenCodeAvailableModelsResult | OpenCodeProviderDirectoryResult,
  ): void {
    const { operation, source, includeDirectory, debugReason } = context;
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
    context: OpenCodeCatalogResponseLogContext,
    resolved: OpencodeModelConfigSubset,
  ): void {
    const { operation, source, includeDirectory, debugReason } = context;
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
            provider.models as Record<string, {
              name?: string;
              limit?: { context?: number };
              variants?: Record<string, unknown>;
            }>,
          ).map(([id, info]) => ({
            id,
            name: info.name ?? id,
            contextWindow: typeof info.limit?.context === 'number' ? info.limit.context : undefined,
            variants: info.variants ? Object.keys(info.variants) : undefined,
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

  private getV2LocationData(response: unknown): unknown[] | null {
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      return null;
    }

    const location = (response as { location?: unknown }).location;
    if (!location || typeof location !== 'object' || Array.isArray(location)) {
      return null;
    }

    const data = (response as { data?: unknown }).data;
    return Array.isArray(data) ? data : null;
  }

  private readRecordString(value: unknown, key: string): string | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const field = (value as Record<string, unknown>)[key];
    return typeof field === 'string' && field.trim() ? field.trim() : null;
  }

  private normalizeStringSet(values: Array<string | null>): string[] {
    return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((left, right) => (
      left.localeCompare(right)
    ));
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

  private storeMcpServerStatus(input: unknown): Record<string, McpServerStatus> {
    return this.catalogState.updateMcpServerStatus(this.catalogState.normalizeMcpServerStatusMap(input));
  }

  private normalizeSingleMcpServerStatus(name: string, input: unknown): McpServerStatus {
    return this.catalogState.normalizeMcpServerStatusMap({ [name]: input })[name]
      ?? { status: 'failed', error: 'Unknown MCP auth result' };
  }

  private normalizeDebugReason(debugReason: string | null): string | null {
    if (typeof debugReason !== 'string') {
      return null;
    }

    const trimmed = debugReason.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
