import { createLogger } from '../../shared';
import { isBuiltinToolName } from '../../shared/toolIdentity';
import type {
  McpServerSnapshot,
  McpServerStatus,
  OpenCodeCapabilitySnapshot,
  ToolCatalogEntry,
  ToolCatalogSnapshot,
} from './types';

const logger = createLogger('OpenCodeCatalogStateStore');

export type CatalogUpdateListener = (snapshot: OpenCodeCapabilitySnapshot) => void;

export interface OpenCodeCatalogToolIdentityContext {
  knownMcpTools?: Iterable<string>;
  registryTools?: Iterable<string>;
  observedExternalTools?: Iterable<string>;
}

export interface OpenCodeCatalogStateStoreHost {
  syncOpenCodeEventSubscriptions(): void;
}

export class OpenCodeCatalogStateStore {
  private readonly catalogUpdateListeners = new Set<CatalogUpdateListener>();
  private registryToolIds = new Set<string>();
  private toolSchemasByModel = new Map<string, ToolCatalogEntry[]>();
  private observedExternalToolNames = new Set<string>();
  private mcpServerStatus = new Map<string, McpServerStatus>();
  private toolCatalogUpdatedAt: number | null = null;
  private mcpCatalogUpdatedAt: number | null = null;

  constructor(private readonly host: OpenCodeCatalogStateStoreHost) {}

  subscribeToCatalogUpdates(listener: CatalogUpdateListener): () => void {
    this.catalogUpdateListeners.add(listener);
    this.host.syncOpenCodeEventSubscriptions();
    listener(this.getCapabilitySnapshot());

    return () => {
      this.catalogUpdateListeners.delete(listener);
      this.host.syncOpenCodeEventSubscriptions();
    };
  }

  hasCatalogUpdateListeners(): boolean {
    return this.catalogUpdateListeners.size > 0;
  }

  classifyToolIds(toolIds: string[]): { builtin: string[]; custom: string[] } {
    const builtin: string[] = [];
    const custom: string[] = [];
    for (const id of toolIds) {
      if (isBuiltinToolName(id)) {
        builtin.push(id);
      } else {
        custom.push(id);
      }
    }
    return { builtin, custom };
  }

  observeRuntimeToolNames(toolNames: Iterable<string>): boolean {
    let changed = false;

    for (const toolName of toolNames) {
      const normalizedName = typeof toolName === 'string' ? toolName.trim() : '';
      if (!normalizedName || isBuiltinToolName(normalizedName)) {
        continue;
      }

      if (!this.observedExternalToolNames.has(normalizedName)) {
        this.observedExternalToolNames.add(normalizedName);
        changed = true;
      }
    }

    return changed;
  }

  buildToolIdentityContext(): OpenCodeCatalogToolIdentityContext {
    return {
      knownMcpTools: this.registryToolIds.size > 0 ? this.observedExternalToolNames : undefined,
      registryTools: this.registryToolIds,
      observedExternalTools: this.observedExternalToolNames,
    };
  }

  updateRegistryToolIds(toolIds: string[]): string[] {
    this.registryToolIds = new Set(
      toolIds
        .filter((toolId) => typeof toolId === 'string')
        .map((toolId) => toolId.trim())
        .filter((toolId) => toolId.length > 0),
    );
    this.toolCatalogUpdatedAt = Date.now();
    this.emitCatalogUpdate();
    return [...this.registryToolIds];
  }

  hasToolSchemaCache(modelKey: string): boolean {
    return this.toolSchemasByModel.has(modelKey);
  }

  getToolSchemaCache(modelKey: string): ToolCatalogEntry[] {
    return (this.toolSchemasByModel.get(modelKey) ?? []).map((entry) => ({ ...entry }));
  }

  updateToolSchemaCache(modelKey: string, tools: ToolCatalogEntry[]): ToolCatalogEntry[] {
    this.toolSchemasByModel.set(
      modelKey,
      tools.map((entry) => ({ ...entry })),
    );
    this.toolCatalogUpdatedAt = Date.now();
    this.emitCatalogUpdate();
    return this.getToolSchemaCache(modelKey);
  }

  clearToolSchemaCache(): void {
    this.toolSchemasByModel.clear();
  }

  normalizeMcpServerStatusMap(input: unknown): Record<string, McpServerStatus> {
    if (!input || typeof input !== 'object') {
      return {};
    }

    const result: Record<string, McpServerStatus> = {};
    for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') {
        continue;
      }

      const status = typeof (value as { status?: unknown }).status === 'string'
        ? (value as { status: string }).status
        : '';
      if (status === 'connected' || status === 'disabled' || status === 'needs_auth') {
        result[name] = { status };
      } else if ((status === 'failed' || status === 'needs_client_registration')
        && typeof (value as { error?: unknown }).error === 'string') {
        result[name] = {
          status,
          error: (value as { error: string }).error,
        };
      }
    }

    return result;
  }

  updateMcpServerStatus(statusMap: Record<string, McpServerStatus>): Record<string, McpServerStatus> {
    this.mcpServerStatus = new Map(
      Object.entries(statusMap).map(([name, status]) => [name, { ...status }]),
    );
    this.mcpCatalogUpdatedAt = Date.now();
    this.emitCatalogUpdate();
    return this.getMcpServersRecord();
  }

  getToolCatalogSnapshot(): ToolCatalogSnapshot {
    return {
      registryToolIds: [...this.registryToolIds].sort(),
      toolSchemasByModel: Object.fromEntries(
        [...this.toolSchemasByModel.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, value]) => [key, value.map((entry) => ({ ...entry }))]),
      ),
      observedExternalTools: [...this.observedExternalToolNames].sort(),
      updatedAt: this.toolCatalogUpdatedAt,
    };
  }

  getMcpServerSnapshot(): McpServerSnapshot {
    return {
      servers: this.getMcpServersRecord(true),
      updatedAt: this.mcpCatalogUpdatedAt,
    };
  }

  getCapabilitySnapshot(): OpenCodeCapabilitySnapshot {
    return {
      toolCatalog: this.getToolCatalogSnapshot(),
      mcp: this.getMcpServerSnapshot(),
    };
  }

  emitCatalogUpdate(): void {
    if (this.catalogUpdateListeners.size === 0) {
      return;
    }

    const snapshot = this.getCapabilitySnapshot();
    for (const listener of [...this.catalogUpdateListeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        logger.error('OpenCode catalog listener failed', error);
      }
    }
  }

  private getMcpServersRecord(sorted = false): Record<string, McpServerStatus> {
    const entries = [...this.mcpServerStatus.entries()];
    if (sorted) {
      entries.sort(([left], [right]) => left.localeCompare(right));
    }

    return Object.fromEntries(entries.map(([name, status]) => [name, { ...status }]));
  }
}
