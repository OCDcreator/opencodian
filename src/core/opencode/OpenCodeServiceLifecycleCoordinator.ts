import { createLogger } from '../../shared';
import { isLocalServerMode, type OpenCodianSettings } from '../types/settings';
import type { ServerStatus } from './types';

const logger = createLogger('OpenCodeService');

type ModelSummary = {
  id: string;
  name: string;
  contextWindow?: number;
};

type ProviderSummary = {
  id: string;
  name: string;
  models: ModelSummary[];
};

type AvailableModelsResult = {
  providers: ProviderSummary[];
};

interface OpenCodeServiceLifecycleServerManagerPort {
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): void;
  checkHealth(timeout: number): Promise<boolean>;
  setWorkingDirectory(path: string): void;
}

interface OpenCodeServiceLifecycleSyncSubscriptionPort {
  ensureSubscription(): void;
  stopSubscription(keepWanted?: boolean): void;
  restartSubscription(): void;
}

interface OpenCodeServiceLifecycleEventSubscriptionPort {
  ensureSubscriptions(): void;
  stopSubscriptions(keepWanted?: boolean): void;
  restartSubscriptions(): void;
}

export interface OpenCodeServiceLifecycleCoordinatorHost {
  getSettings(): OpenCodianSettings;
  getBaseUrl(): string;
  getToolCatalogScopeKey(): string;
  shouldUseSdkCrud(): boolean;
  checkSdkHealth(): Promise<boolean>;
  logHealthProbeFallback(error: unknown): void;
  resetTransientConnectivityLogState(): void;
  notifyServerStatusChange(status: ServerStatus): void;
  setVaultPath(path: string): void;
  clearToolSchemaCacheIfScopeChanged(previousToolCatalogScope: string): void;
  fetchAvailableModels(): Promise<AvailableModelsResult>;
  refreshToolIds(): Promise<unknown>;
  refreshMcpServerStatus(): Promise<unknown>;
  notifyModelsLoaded(providers: ProviderSummary[]): void;
  serverManager: OpenCodeServiceLifecycleServerManagerPort;
  syncEvents: OpenCodeServiceLifecycleSyncSubscriptionPort;
  openCodeEvents: OpenCodeServiceLifecycleEventSubscriptionPort;
}

export class OpenCodeServiceLifecycleCoordinator {
  constructor(private readonly host: OpenCodeServiceLifecycleCoordinatorHost) {}

  async initialize(): Promise<void> {
    const settings = this.host.getSettings();
    if (isLocalServerMode(settings.server) && settings.server.local.autoStart) {
      await this.start();
    }
  }

  handleServerStatusChange(status: ServerStatus): void {
    this.host.notifyServerStatusChange(status);
    if (status !== 'running') {
      return;
    }

    this.host.resetTransientConnectivityLogState();
    void this.bootstrapAfterServerRunning();
  }

  async start(): Promise<void> {
    this.ensureBaseUrl();
    await this.host.serverManager.start();
    this.ensureEventSubscriptions();
  }

  async stop(): Promise<void> {
    this.stopEventSubscriptions();
    await this.host.serverManager.stop();
  }

  dispose(): void {
    this.stopEventSubscriptions();
    this.host.serverManager.dispose();
  }

  restartEventSubscriptions(): void {
    this.host.syncEvents.restartSubscription();
    this.host.openCodeEvents.restartSubscriptions();
  }

  setVaultPath(path: string): void {
    const previousToolCatalogScope = this.host.getToolCatalogScopeKey();
    this.host.setVaultPath(path);
    this.host.serverManager.setWorkingDirectory(path);
    this.host.clearToolSchemaCacheIfScopeChanged(previousToolCatalogScope);
    this.restartEventSubscriptions();
  }

  async checkHealth(): Promise<boolean> {
    if (!this.host.getBaseUrl()) {
      return false;
    }

    if (this.host.shouldUseSdkCrud()) {
      try {
        const healthy = await this.host.checkSdkHealth();
        if (healthy) {
          this.host.resetTransientConnectivityLogState();
        }
        return healthy;
      } catch (error) {
        this.host.logHealthProbeFallback(error);
      }
    }

    const healthy = await this.host.serverManager.checkHealth(3000);
    if (healthy) {
      this.host.resetTransientConnectivityLogState();
    }
    return healthy;
  }

  private ensureBaseUrl(): void {
    if (!this.host.getBaseUrl()) {
      throw new Error('OpenCode server URL is not configured');
    }
  }

  private ensureEventSubscriptions(): void {
    this.host.syncEvents.ensureSubscription();
    this.host.openCodeEvents.ensureSubscriptions();
  }

  private stopEventSubscriptions(): void {
    this.host.syncEvents.stopSubscription();
    this.host.openCodeEvents.stopSubscriptions();
  }

  private async bootstrapAfterServerRunning(): Promise<void> {
    try {
      const result = await this.host.fetchAvailableModels();
      await Promise.allSettled([
        this.host.refreshToolIds(),
        this.host.refreshMcpServerStatus(),
      ]);

      if (result.providers.length === 0) {
        logger.warn('No providers available from server');
      }

      this.host.notifyModelsLoaded(result.providers);
    } catch (error) {
      logger.error('Failed to auto-fetch models:', error);
    }
  }
}
