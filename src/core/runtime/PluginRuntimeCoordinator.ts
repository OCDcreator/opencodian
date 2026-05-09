import type { WorkspaceLeaf } from 'obsidian';

import { OpenCodianView } from '../../features/chat/OpenCodianView';
import { UserMessageFooterRenderer } from '../../features/chat/runtime/UserMessageFooterRenderer';
import { createLogger, formatDurationMs, getPerformanceTimestampMs } from '../../shared';
import { OpenCodeService } from '../opencode';
import type { OpenCodianSettings } from '../types';
import { isLocalServerMode } from '../types';

const logger = createLogger('PluginRuntimeCoordinator');

export type RuntimeWarmupSource = 'deferred-onload' | 'session-bootstrap';

export interface RuntimeRefreshOptions {
  reloadModels?: boolean;
  applyUi?: boolean;
}

export interface SlashCommandCatalogInvalidationOptions {
  preload?: boolean;
}

export interface PluginRuntimeCoordinatorHost {
  getSettings(): OpenCodianSettings | null;
  getOpenCodeService(): OpenCodeService | null;
  getOpenCodianLeaves(): WorkspaceLeaf[];
  applyProviderIconColorMode(): void;
  startConfiguredLocalServerIfNeeded(): Promise<void>;
  logServerStatusSnapshot(source?: string): Promise<void>;
  onModelsLoaded(): void;
}

export class PluginRuntimeCoordinator {
  private modelRefreshFrameId: number | null = null;
  private deferredRuntimeWarmupTimerId: number | null = null;
  private deferredRuntimeWarmupPromise: Promise<void> | null = null;

  constructor(private readonly host: PluginRuntimeCoordinatorHost) {}

  dispose(): void {
    this.clearDeferredRuntimeWarmupTimer();
    this.clearQueuedModelRefresh();
  }

  refreshOpenCodianViews(options: RuntimeRefreshOptions = {}): void {
    const { reloadModels = true, applyUi = true } = options;

    if (applyUi) {
      this.host.applyProviderIconColorMode();
    }

    for (const view of this.getOpenCodianViews()) {
      if (applyUi) {
        view.applyLocaleTexts();
        UserMessageFooterRenderer.refreshTooltips(view.contentEl);
        view.applyChatAppearanceSettings();
        view.applyChatScrollMode();
        view.applyTabBarLayout();
      }
      if (reloadModels) {
        void view.reloadModelCatalog();
      }
    }
  }

  invalidateSlashCommandMenuCatalogs(options: SlashCommandCatalogInvalidationOptions = {}): void {
    for (const view of this.getOpenCodianViews()) {
      view.invalidateSlashCommandMenuCatalog(options);
    }
  }

  queueModelRefresh(): void {
    this.clearQueuedModelRefresh();
    this.modelRefreshFrameId = window.requestAnimationFrame(() => {
      this.modelRefreshFrameId = null;
      this.refreshOpenCodianViews({ reloadModels: true, applyUi: false });
      this.host.onModelsLoaded();
    });
  }

  scheduleDeferredRuntimeWarmup(): void {
    if (!this.shouldWarmupRuntimeAfterStartup()) {
      return;
    }

    if (this.deferredRuntimeWarmupTimerId !== null || this.deferredRuntimeWarmupPromise) {
      return;
    }

    this.deferredRuntimeWarmupTimerId = window.setTimeout(() => {
      this.deferredRuntimeWarmupTimerId = null;
      void this.startDeferredRuntimeWarmup('deferred-onload');
    }, 0);
  }

  async ensureRuntimeWarmupReadyForSessionBootstrap(): Promise<void> {
    const openCodeService = this.host.getOpenCodeService();
    if (!this.shouldWarmupRuntimeAfterStartup() || openCodeService?.isReady()) {
      return;
    }

    if (this.deferredRuntimeWarmupTimerId !== null) {
      this.clearDeferredRuntimeWarmupTimer();
      await this.startDeferredRuntimeWarmup('session-bootstrap');
      return;
    }

    if (this.deferredRuntimeWarmupPromise) {
      await this.deferredRuntimeWarmupPromise;
      return;
    }

    await this.startDeferredRuntimeWarmup('session-bootstrap');
  }

  private getOpenCodianViews(): OpenCodianView[] {
    return this.host
      .getOpenCodianLeaves()
      .map((leaf) => leaf.view)
      .filter((view): view is OpenCodianView => view instanceof OpenCodianView);
  }

  private clearQueuedModelRefresh(): void {
    if (this.modelRefreshFrameId !== null) {
      window.cancelAnimationFrame(this.modelRefreshFrameId);
      this.modelRefreshFrameId = null;
    }
  }

  private clearDeferredRuntimeWarmupTimer(): void {
    if (this.deferredRuntimeWarmupTimerId !== null) {
      window.clearTimeout(this.deferredRuntimeWarmupTimerId);
      this.deferredRuntimeWarmupTimerId = null;
    }
  }

  private shouldWarmupRuntimeAfterStartup(): boolean {
    const settings = this.host.getSettings();
    return Boolean(
      this.host.getOpenCodeService()
      && settings
      && isLocalServerMode(settings.server)
      && settings.server.local.autoStart,
    );
  }

  private async startDeferredRuntimeWarmup(source: RuntimeWarmupSource): Promise<void> {
    if (this.deferredRuntimeWarmupPromise) {
      return this.deferredRuntimeWarmupPromise;
    }

    this.deferredRuntimeWarmupPromise = this.runDeferredRuntimeWarmup(source)
      .catch((error) => {
        logger.warn('Deferred runtime warmup failed', error);
        throw error;
      })
      .finally(() => {
        this.deferredRuntimeWarmupPromise = null;
      });

    return this.deferredRuntimeWarmupPromise;
  }

  private async runDeferredRuntimeWarmup(source: RuntimeWarmupSource): Promise<void> {
    if (!this.host.getOpenCodeService()) {
      return;
    }

    const startedAt = getPerformanceTimestampMs();
    logger.debug(`[startup] deferred runtime warmup started (${source})`);

    await this.host.startConfiguredLocalServerIfNeeded();
    await this.host.logServerStatusSnapshot(source);

    logger.info(
      `[startup] deferred runtime warmup completed in ${formatDurationMs(getPerformanceTimestampMs() - startedAt)} (${source})`,
    );
  }
}
