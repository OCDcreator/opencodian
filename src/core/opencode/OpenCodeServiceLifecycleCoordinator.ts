import { createLogger } from '../../shared';
import {
  getServerBaseUrl,
  isLocalServerMode,
  type OpenCodianSettings,
} from '../types/settings';
import { ServerManager } from './ServerManager';
import type {
  ManagedServerState,
  OpenCodeServerConfig,
  ServerDiagnostics,
  ServerStatus,
} from './types';

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
  isRunning(): boolean;
  updateConfig(config: OpenCodeServerConfig): void;
  canBindLocalEndpoint(host: string, port: number): Promise<boolean>;
  restart(): Promise<void>;
  getStatus(): ServerStatus;
  getServerDiagnosticsSnapshot(): ServerDiagnostics;
  getManagedServerStateSnapshot(): ManagedServerState | null;
}

interface OpenCodeServiceLifecycleSyncSubscriptionPort {
  hasListeners(): boolean;
  ensureSubscription(): void;
  stopSubscription(keepWanted?: boolean): void;
  restartSubscription(): void;
}

interface OpenCodeServiceLifecycleEventSubscriptionPort {
  hasListeners(): boolean;
  ensureSubscriptions(): void;
  stopSubscriptions(keepWanted?: boolean): void;
  restartSubscriptions(): void;
}

export interface OpenCodeServiceLifecycleAssemblyHost {
  getSettings(): OpenCodianSettings;
  setSettings(settings: OpenCodianSettings): void;
  getBaseUrl(): string;
  setBaseUrl(baseUrl: string): void;
  getToolCatalogScopeKey(): string;
  shouldUseSdkCrud(): boolean;
  checkSdkHealth(): Promise<unknown>;
  logHealthProbeFallback(error: unknown): void;
  resetTransientConnectivityLogState(): void;
  onServerStatusChange?(status: ServerStatus): void;
  onError?(error: Error): void;
  setVaultPath(path: string): void;
  clearToolSchemaCacheIfScopeChanged(previousToolCatalogScope: string): void;
  fetchAvailableModels(): Promise<AvailableModelsResult>;
  refreshToolIds(): Promise<unknown>;
  refreshMcpServerStatus(): Promise<unknown>;
  onModelsLoaded?(providers: ProviderSummary[]): void;
  syncEvents: OpenCodeServiceLifecycleSyncSubscriptionPort;
  openCodeEvents: OpenCodeServiceLifecycleEventSubscriptionPort;
  initialManagedServerState?: ManagedServerState | null;
  onManagedServerStateChange?: (state: ManagedServerState | null) => void;
}

export interface OpenCodeServiceLifecycleCoordinatorHost {
  getSettings(): OpenCodianSettings;
  setSettings(settings: OpenCodianSettings): void;
  getBaseUrl(): string;
  setBaseUrl(baseUrl: string): void;
  getToolCatalogScopeKey(): string;
  shouldUseSdkCrud(): boolean;
  checkSdkHealth(): Promise<unknown>;
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

export interface OpenCodeServiceLifecycleAssembly {
  serverManager: ServerManager;
  serviceLifecycle: OpenCodeServiceLifecycleCoordinator;
}

interface OpenCodeSettingsUpdatePlan {
  previousSettings: OpenCodianSettings;
  nextSettings: OpenCodianSettings;
  previousMode: OpenCodianSettings['server']['mode'];
  nextMode: OpenCodianSettings['server']['mode'];
  previousToolCatalogScope: string;
  previousBaseUrl: string;
  shouldResumeSyncEvents: boolean;
  shouldResumeOpenCodeEvents: boolean;
  serverConfigChanged: boolean;
  shouldRestartManagedServer: boolean;
  shouldStopManagedServer: boolean;
}

interface OpenCodeSettingsRestartDecision {
  previousSettings: OpenCodianSettings;
  nextSettings: OpenCodianSettings;
  previousMode: OpenCodianSettings['server']['mode'];
  nextMode: OpenCodianSettings['server']['mode'];
  serverConfigChanged: boolean;
  authChanged: boolean;
}

function cloneSettings(settings: OpenCodianSettings): OpenCodianSettings {
  return JSON.parse(JSON.stringify(settings)) as OpenCodianSettings;
}

export class OpenCodeServiceLifecycleCoordinator {
  static createServerConfig(settings: OpenCodianSettings): OpenCodeServerConfig {
    return {
      mode: settings.server.mode,
      baseUrl: getServerBaseUrl(settings.server),
      local: settings.server.local,
      auth: settings.server.auth,
      modelSourceMode: settings.modelSourceMode,
      pluginIsolationMode: settings.pluginIsolationMode,
    };
  }

  static createAssembly(
    host: OpenCodeServiceLifecycleAssemblyHost,
  ): OpenCodeServiceLifecycleAssembly {
    const serviceLifecycleRef: {
      current: OpenCodeServiceLifecycleCoordinator | null;
    } = { current: null };

    const serverManager = new ServerManager(
      OpenCodeServiceLifecycleCoordinator.createServerConfig(host.getSettings()),
      {
        onStatusChange: (status) => {
          serviceLifecycleRef.current?.handleServerStatusChange(status);
        },
        onError: (error) => {
          host.onError?.(error);
        },
      },
      {
        initialManagedServerState: host.initialManagedServerState,
        onManagedServerStateChange: host.onManagedServerStateChange,
      },
    );

    const serviceLifecycle = new OpenCodeServiceLifecycleCoordinator({
      getSettings: host.getSettings,
      setSettings: host.setSettings,
      getBaseUrl: host.getBaseUrl,
      setBaseUrl: host.setBaseUrl,
      getToolCatalogScopeKey: host.getToolCatalogScopeKey,
      shouldUseSdkCrud: host.shouldUseSdkCrud,
      checkSdkHealth: host.checkSdkHealth,
      logHealthProbeFallback: host.logHealthProbeFallback,
      resetTransientConnectivityLogState: host.resetTransientConnectivityLogState,
      notifyServerStatusChange: (status) => host.onServerStatusChange?.(status),
      setVaultPath: host.setVaultPath,
      clearToolSchemaCacheIfScopeChanged: host.clearToolSchemaCacheIfScopeChanged,
      fetchAvailableModels: host.fetchAvailableModels,
      refreshToolIds: host.refreshToolIds,
      refreshMcpServerStatus: host.refreshMcpServerStatus,
      notifyModelsLoaded: (providers) => host.onModelsLoaded?.(providers),
      serverManager,
      syncEvents: host.syncEvents,
      openCodeEvents: host.openCodeEvents,
    });
    serviceLifecycleRef.current = serviceLifecycle;

    return {
      serverManager,
      serviceLifecycle,
    };
  }

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
        const healthy = this.normalizeHealthResponse(await this.host.checkSdkHealth());
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

  async updateSettings(settings: OpenCodianSettings): Promise<void> {
    const plan = this.createSettingsUpdatePlan(settings);
    await this.validateSettingsUpdatePlan(plan);
    this.applySettingsUpdatePlan(plan);

    try {
      await this.completeSettingsUpdatePlan(plan);
    } catch (error) {
      await this.rollbackSettingsUpdatePlan(plan);
      throw error;
    }
  }

  isReady(): boolean {
    return this.host.serverManager.getStatus() === 'running';
  }

  getServerStatus(): ServerStatus {
    return this.host.serverManager.getStatus();
  }

  getServerDiagnostics(): ServerDiagnostics {
    return this.host.serverManager.getServerDiagnosticsSnapshot();
  }

  isServerProcessRunning(): boolean {
    return this.host.serverManager.isRunning();
  }

  getServerRuntimeMetadata(): {
    serverStatus: ServerStatus;
    isManagedServerRunning: boolean;
    managedServerState: ManagedServerState | null;
  } {
    return {
      serverStatus: this.host.serverManager.getStatus(),
      isManagedServerRunning: this.host.serverManager.isRunning(),
      managedServerState: this.host.serverManager.getManagedServerStateSnapshot(),
    };
  }

  private normalizeHealthResponse(response: unknown): boolean {
    if (typeof response === 'boolean') {
      return response;
    }

    if (response && typeof response === 'object' && 'healthy' in response) {
      return Boolean((response as { healthy?: unknown }).healthy);
    }

    return false;
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

  private createSettingsUpdatePlan(settings: OpenCodianSettings): OpenCodeSettingsUpdatePlan {
    const previousSettings = this.host.getSettings();
    const previousMode = previousSettings.server.mode;
    const nextMode = settings.server.mode;
    const serverConfigChanged = this.hasLocalServerConfigChanged(previousSettings, settings);
    const authChanged = this.hasServerAuthChanged(previousSettings, settings);

    return {
      previousSettings,
      nextSettings: cloneSettings(settings),
      previousMode,
      nextMode,
      previousToolCatalogScope: this.host.getToolCatalogScopeKey(),
      previousBaseUrl: this.host.getBaseUrl(),
      shouldResumeSyncEvents: this.host.syncEvents.hasListeners(),
      shouldResumeOpenCodeEvents: this.host.openCodeEvents.hasListeners(),
      serverConfigChanged,
      shouldRestartManagedServer: this.shouldRestartManagedServer({
        previousSettings,
        nextSettings: settings,
        previousMode,
        nextMode,
        serverConfigChanged,
        authChanged,
      }),
      shouldStopManagedServer: this.shouldStopManagedServer(previousMode, nextMode),
    };
  }

  private hasLocalServerConfigChanged(
    previousSettings: OpenCodianSettings,
    nextSettings: OpenCodianSettings,
  ): boolean {
    return (
      previousSettings.server.local.host !== nextSettings.server.local.host
      || previousSettings.server.local.port !== nextSettings.server.local.port
    );
  }

  private hasServerAuthChanged(
    previousSettings: OpenCodianSettings,
    nextSettings: OpenCodianSettings,
  ): boolean {
    return (
      previousSettings.server.auth.type !== nextSettings.server.auth.type
      || previousSettings.server.auth.username !== nextSettings.server.auth.username
      || previousSettings.server.auth.password !== nextSettings.server.auth.password
      || previousSettings.server.auth.token !== nextSettings.server.auth.token
    );
  }

  private shouldRestartManagedServer(decision: OpenCodeSettingsRestartDecision): boolean {
    if (!this.host.serverManager.isRunning() || decision.nextMode !== 'local') {
      return false;
    }

    return (
      decision.previousMode !== decision.nextMode
      || decision.serverConfigChanged
      || decision.authChanged
      || decision.previousSettings.modelSourceMode !== decision.nextSettings.modelSourceMode
      || decision.previousSettings.pluginIsolationMode !== decision.nextSettings.pluginIsolationMode
    );
  }

  private shouldStopManagedServer(
    previousMode: OpenCodianSettings['server']['mode'],
    nextMode: OpenCodianSettings['server']['mode'],
  ): boolean {
    return this.host.serverManager.isRunning() && previousMode === 'local' && nextMode !== 'local';
  }

  private async validateSettingsUpdatePlan(plan: OpenCodeSettingsUpdatePlan): Promise<void> {
    if (
      !this.host.serverManager.isRunning()
      || plan.previousMode !== 'local'
      || plan.nextMode !== 'local'
      || !plan.serverConfigChanged
    ) {
      return;
    }

    const endpointAvailable = await this.host.serverManager.canBindLocalEndpoint(
      plan.nextSettings.server.local.host,
      plan.nextSettings.server.local.port,
    );
    if (!endpointAvailable) {
      throw new Error(
        `Cannot switch to ${plan.nextSettings.server.local.host}:${plan.nextSettings.server.local.port}. The target port is already in use.`,
      );
    }
  }

  private applySettingsUpdatePlan(plan: OpenCodeSettingsUpdatePlan): void {
    this.host.setSettings(plan.nextSettings);
    this.host.setBaseUrl(getServerBaseUrl(plan.nextSettings.server));
    this.host.serverManager.updateConfig(
      OpenCodeServiceLifecycleCoordinator.createServerConfig(plan.nextSettings),
    );
    this.host.clearToolSchemaCacheIfScopeChanged(plan.previousToolCatalogScope);
    this.pauseSubscriptions(plan);
  }

  private async completeSettingsUpdatePlan(plan: OpenCodeSettingsUpdatePlan): Promise<void> {
    if (plan.shouldStopManagedServer) {
      await this.host.serverManager.stop();
      this.resumeSubscriptions();
      return;
    }

    if (plan.shouldRestartManagedServer) {
      await this.host.serverManager.restart();
    }

    this.resumeSubscriptions();
  }

  private async rollbackSettingsUpdatePlan(plan: OpenCodeSettingsUpdatePlan): Promise<void> {
    this.host.setSettings(plan.previousSettings);
    this.host.setBaseUrl(plan.previousBaseUrl);
    this.host.serverManager.updateConfig(
      OpenCodeServiceLifecycleCoordinator.createServerConfig(plan.previousSettings),
    );
    this.host.clearToolSchemaCacheIfScopeChanged(plan.previousToolCatalogScope);
    this.pauseSubscriptions(plan);
    await this.restorePreviousManagedServerAfterFailedUpdate(plan);
    this.resumeSubscriptions();
  }

  private pauseSubscriptions(plan: OpenCodeSettingsUpdatePlan): void {
    this.host.syncEvents.stopSubscription(plan.shouldResumeSyncEvents);
    this.host.openCodeEvents.stopSubscriptions(plan.shouldResumeOpenCodeEvents);
  }

  private resumeSubscriptions(): void {
    this.host.syncEvents.ensureSubscription();
    this.host.openCodeEvents.ensureSubscriptions();
  }

  private async restorePreviousManagedServerAfterFailedUpdate(
    plan: OpenCodeSettingsUpdatePlan,
  ): Promise<void> {
    if (plan.previousMode !== 'local' || (!plan.shouldRestartManagedServer && !plan.shouldStopManagedServer)) {
      return;
    }

    try {
      await this.host.serverManager.start();
    } catch (restoreError) {
      logger.error('Failed to restore previous OpenCode server after settings update failure:', restoreError);
    }
  }
}
