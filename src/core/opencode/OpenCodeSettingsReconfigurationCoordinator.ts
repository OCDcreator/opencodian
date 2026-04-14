import { createLogger } from '../../shared';
import type { OpenCodianSettings } from '../types/settings';
import { getServerBaseUrl } from '../types/settings';
import type { OpenCodeServerConfig } from './types';

const logger = createLogger('OpenCodeService');

function cloneSettings(settings: OpenCodianSettings): OpenCodianSettings {
  return JSON.parse(JSON.stringify(settings)) as OpenCodianSettings;
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

interface OpenCodeSettingsServerManagerPort {
  isRunning(): boolean;
  updateConfig(config: OpenCodeServerConfig): void;
  canBindLocalEndpoint(host: string, port: number): Promise<boolean>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  start(): Promise<void>;
}

interface OpenCodeSyncSubscriptionPort {
  hasListeners(): boolean;
  stopSubscription(keepWanted?: boolean): void;
  ensureSubscription(): void;
}

interface OpenCodeEventSubscriptionPort {
  hasListeners(): boolean;
  stopSubscriptions(keepWanted?: boolean): void;
  ensureSubscriptions(): void;
}

export interface OpenCodeSettingsReconfigurationCoordinatorHost {
  getCurrentSettings(): OpenCodianSettings;
  setCurrentSettings(settings: OpenCodianSettings): void;
  getCurrentBaseUrl(): string;
  setCurrentBaseUrl(baseUrl: string): void;
  getToolCatalogScopeKey(): string;
  clearToolSchemaCacheIfScopeChanged(previousScope: string): void;
  serverManager: OpenCodeSettingsServerManagerPort;
  syncEvents: OpenCodeSyncSubscriptionPort;
  openCodeEvents: OpenCodeEventSubscriptionPort;
}

export class OpenCodeSettingsReconfigurationCoordinator {
  constructor(private readonly host: OpenCodeSettingsReconfigurationCoordinatorHost) {}

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

  async updateSettings(settings: OpenCodianSettings): Promise<void> {
    const plan = this.createPlan(settings);
    await this.validatePlan(plan);
    this.applyPlan(plan);

    try {
      await this.completePlan(plan);
    } catch (error) {
      await this.rollbackPlan(plan);
      throw error;
    }
  }

  private createPlan(settings: OpenCodianSettings): OpenCodeSettingsUpdatePlan {
    const previousSettings = this.host.getCurrentSettings();
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
      previousBaseUrl: this.host.getCurrentBaseUrl(),
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

  private async validatePlan(plan: OpenCodeSettingsUpdatePlan): Promise<void> {
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

  private applyPlan(plan: OpenCodeSettingsUpdatePlan): void {
    this.host.setCurrentSettings(plan.nextSettings);
    this.host.setCurrentBaseUrl(getServerBaseUrl(plan.nextSettings.server));
    this.host.serverManager.updateConfig(OpenCodeSettingsReconfigurationCoordinator.createServerConfig(plan.nextSettings));
    this.host.clearToolSchemaCacheIfScopeChanged(plan.previousToolCatalogScope);
    this.pauseSubscriptions(plan);
  }

  private async completePlan(plan: OpenCodeSettingsUpdatePlan): Promise<void> {
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

  private async rollbackPlan(plan: OpenCodeSettingsUpdatePlan): Promise<void> {
    this.host.setCurrentSettings(plan.previousSettings);
    this.host.setCurrentBaseUrl(plan.previousBaseUrl);
    this.host.serverManager.updateConfig(OpenCodeSettingsReconfigurationCoordinator.createServerConfig(plan.previousSettings));
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
