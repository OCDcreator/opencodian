import type { App, ButtonComponent } from 'obsidian';
import { Notice, setIcon, Setting } from 'obsidian';

import type { LobehubIconVariant, ProviderIconColorMode } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import { ProviderIconService } from '../../utils/icons';
import { ProviderIconCacheModal } from './ProviderIconCacheModal';
import { SettingsTooltipController } from './SettingsTooltipController';

const logger = createLogger('SettingsModelIconCacheManager');

export interface SettingsModelIconCacheRuntimeState {
  iconCacheOverviewSetting: Setting | null;
  refreshIconCacheButton: ButtonComponent | null;
  warmIconCacheButton: ButtonComponent | null;
  viewIconCacheButton: ButtonComponent | null;
}

interface SettingsModelIconCacheManagerOptions {
  app: App;
  plugin: OpenCodianPlugin;
  getRuntime: () => SettingsModelIconCacheRuntimeState | null;
  isRuntimeActive: (runtime: SettingsModelIconCacheRuntimeState) => boolean;
  onProviderIconsChanged: () => void;
}

export class SettingsModelIconCacheManager {
  private readonly app: App;
  private readonly plugin: OpenCodianPlugin;
  private readonly getRuntime: () => SettingsModelIconCacheRuntimeState | null;
  private readonly isRuntimeActive: (runtime: SettingsModelIconCacheRuntimeState) => boolean;
  private readonly onProviderIconsChanged: () => void;

  constructor(options: SettingsModelIconCacheManagerOptions) {
    this.app = options.app;
    this.plugin = options.plugin;
    this.getRuntime = options.getRuntime;
    this.isRuntimeActive = options.isRuntimeActive;
    this.onProviderIconsChanged = options.onProviderIconsChanged;
  }

  attachTools(toolsBodyEl: HTMLElement): void {
    const runtime = this.getRuntime();
    if (!runtime) {
      return;
    }

    runtime.iconCacheOverviewSetting = new Setting(toolsBodyEl)
      .setName(t('settings.model.iconCache.currentName'))
      .setDesc(t('settings.model.iconCache.currentLoading'))
      .addButton((btn) => {
        runtime.viewIconCacheButton = btn;
        btn
          .setButtonText(t('settings.model.iconCache.view'))
          .onClick(async () => {
            const providerIds = await this.getCurrentProviderIdsForIconCache();
            new ProviderIconCacheModal(this.app, this.plugin, providerIds, () => {
              this.onProviderIconsChanged();
              void this.refreshIconCacheOverview();
            }).open();
          });
      });

    new Setting(toolsBodyEl)
      .setName(t('settings.model.iconCache.name'))
      .setDesc(t('settings.model.iconCache.desc'))
      .addButton((btn) => {
        runtime.refreshIconCacheButton = btn;
        btn
          .setButtonText(t('settings.model.iconCache.refresh'))
          .onClick(async () => {
            await this.refreshProviderIconCache('refresh');
          });
      })
      .addButton((btn) => {
        runtime.warmIconCacheButton = btn;
        btn
          .setButtonText(t('settings.model.iconCache.warm'))
          .setCta()
          .onClick(async () => {
            await this.refreshProviderIconCache('warm');
          });
      });

    new Setting(toolsBodyEl)
      .setName(t('settings.model.iconCache.colorMode.name'))
      .setDesc(t('settings.model.iconCache.colorMode.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('system', t('settings.model.iconCache.colorMode.system'))
          .addOption('monochrome', t('settings.model.iconCache.colorMode.monochrome'))
          .addOption('color', t('settings.model.iconCache.colorMode.color'))
          .setValue(this.plugin.settings.providerIconColorMode)
          .onChange(async (value) => {
            const previousMode = this.plugin.settings.providerIconColorMode;
            this.plugin.settings.providerIconColorMode = value as ProviderIconColorMode;
            this.plugin.applyProviderIconColorMode();
            try {
              await this.plugin.saveSettings({
                syncService: false,
                reloadModels: false,
                syncConfig: false,
                applyUi: true,
              });
            } catch (error) {
              this.plugin.settings.providerIconColorMode = previousMode;
              this.plugin.applyProviderIconColorMode();
              new Notice(
                error instanceof Error ? error.message : t('settings.model.iconCache.colorMode.saveFailed'),
              );
            }
          });
      });

    new Setting(toolsBodyEl)
      .setName(t('settings.model.iconCache.defaultVariant.name'))
      .setDesc(t('settings.model.iconCache.defaultVariant.desc'))
      .addDropdown((dropdown) => {
        const variantOptions: LobehubIconVariant[] = [
          'auto',
          'mono',
          'color',
          'brand',
          'brand-color',
          'text',
          'text-cn',
          'text-color',
          'combine',
          'avatar',
        ];
        for (const variant of variantOptions) {
          dropdown.addOption(variant, t(`settings.model.iconCache.variant.${variant}` as const));
        }

        dropdown
          .setValue(this.plugin.settings.providerIconDefaultVariant)
          .onChange(async (value) => {
            const previousVariant = this.plugin.settings.providerIconDefaultVariant;
            this.plugin.settings.providerIconDefaultVariant = value as LobehubIconVariant;
            this.plugin.applyProviderIconColorMode();
            try {
              await this.plugin.saveSettings({
                syncService: false,
                reloadModels: false,
                syncConfig: false,
                applyUi: true,
              });
            } catch (error) {
              this.plugin.settings.providerIconDefaultVariant = previousVariant;
              this.plugin.applyProviderIconColorMode();
              new Notice(
                error instanceof Error ? error.message : t('settings.model.iconCache.defaultVariant.saveFailed'),
              );
            }
          });
      });
  }

  async refreshProviderIconCache(mode: 'refresh' | 'warm'): Promise<void> {
    const runtime = this.getRuntime();
    if (!runtime) {
      return;
    }

    this.setButtonsDisabled(true);
    try {
      const providerIds = await this.getCurrentProviderIdsForIconCache();
      this.plugin.settings.providerIconLibrary = ProviderIconService.persistDefaultEntries(
        providerIds,
        this.plugin.settings.providerIconLibrary,
      );

      let removed = 0;
      if (mode === 'refresh') {
        removed = await ProviderIconService.clearCache(this.app);
      }

      const summary = await ProviderIconService.warmProviderIcons(
        this.app,
        providerIds,
        this.plugin.settings.providerIconLibrary,
      );
      await this.plugin.saveSettings({
        syncService: false,
        reloadModels: true,
        syncConfig: false,
        applyUi: true,
      });

      if (mode === 'warm' && summary.total === 0) {
        new Notice(t('settings.model.iconCache.noProviders'));
        return;
      }

      new Notice(mode === 'refresh'
        ? t('settings.model.iconCache.refreshSuccess', {
          cached: String(summary.cached),
          supported: String(summary.supported),
          removed: String(removed),
        })
        : t('settings.model.iconCache.warmSuccess', {
          cached: String(summary.cached),
          supported: String(summary.supported),
        }));

      this.onProviderIconsChanged();
      await this.refreshIconCacheOverview();
    } catch (error) {
      logger.error(
        mode === 'refresh'
          ? 'Failed to refresh provider icon cache:'
          : 'Failed to warm provider icon cache:',
        error,
      );
      new Notice(
        mode === 'refresh'
          ? t('settings.model.iconCache.refreshFailed')
          : t('settings.model.iconCache.warmFailed'),
      );
    } finally {
      if (this.isRuntimeActive(runtime)) {
        this.setButtonsDisabled(false);
      }
    }
  }

  async refreshIconCacheOverview(): Promise<void> {
    const runtime = this.getRuntime();
    if (!runtime?.iconCacheOverviewSetting) {
      return;
    }

    try {
      const providerIds = await this.getCurrentProviderIdsForIconCache();
      const { summary } = await ProviderIconService.getProviderCacheState(
        this.app,
        providerIds,
        this.plugin.settings.providerIconLibrary,
      );
      if (!this.isRuntimeActive(runtime) || !runtime.iconCacheOverviewSetting) {
        return;
      }

      runtime.iconCacheOverviewSetting.setDesc(t('settings.model.iconCache.currentStatus', {
        cachedProviders: String(summary.cachedProviders),
        totalProviders: String(summary.totalProviders),
        cachedIcons: String(summary.cachedIcons),
        totalIcons: String(summary.totalIcons),
        currentProviders: String(summary.currentProviders),
      }));
      runtime.viewIconCacheButton?.setDisabled(summary.totalProviders === 0);
    } catch (error) {
      logger.error('Failed to load provider icon cache overview:', error);
      if (!this.isRuntimeActive(runtime) || !runtime.iconCacheOverviewSetting) {
        return;
      }

      runtime.iconCacheOverviewSetting.setDesc(t('settings.model.iconCache.currentFailed'));
      runtime.viewIconCacheButton?.setDisabled(true);
    }
  }

  async applyProviderIcon(targetEl: HTMLElement, providerId: string, label: string): Promise<void> {
    const iconUrl = await ProviderIconService.resolveIconUrl(
      this.app,
      providerId,
      this.plugin.settings.providerIconLibrary,
    );
    if (!targetEl.isConnected) {
      return;
    }

    targetEl.empty();
    if (iconUrl) {
      const imgEl = document.createElement('img');
      imgEl.classList.add('opencodian-provider-icon-image');
      imgEl.src = iconUrl;
      imgEl.alt = label;
      targetEl.appendChild(imgEl);
    } else {
      setIcon(targetEl, 'bot');
    }
    SettingsTooltipController.ensureForDocument(targetEl.ownerDocument);
    targetEl.dataset.settingsTooltip = label;
  }

  private setButtonsDisabled(disabled: boolean): void {
    const runtime = this.getRuntime();
    if (!runtime) {
      return;
    }

    runtime.refreshIconCacheButton?.setDisabled(disabled);
    runtime.warmIconCacheButton?.setDisabled(disabled);
    runtime.viewIconCacheButton?.setDisabled(disabled);
  }

  private async getCurrentProviderIdsForIconCache(): Promise<string[]> {
    if (this.plugin.modelConfigService) {
      const catalogs = await this.plugin.modelConfigService.getCatalogs(
        this.plugin.settings.modelSourceMode,
        this.plugin.settings.disabledModelRefs,
      );
      return catalogs.effective.providers.map((provider) => provider.id);
    }

    const availableModels = await this.plugin.openCodeService.getAvailableModels();
    return availableModels.providers.map((provider) => provider.id);
  }
}
