import type { App, ButtonComponent } from 'obsidian';
import { Notice, setIcon, Setting } from 'obsidian';

import {
  type ModelCatalogBundle,
  type ModelCatalogState,
  ModelCatalogStateService,
} from '../../core/config';
import {
  formatModelReference,
  isProviderEnabled,
  type ModelCatalog,
} from '../../core/config/modelConfig';
import type {
  LobehubIconVariant,
  ModelSourceMode,
  OpencodeModelConfigSubset,
  ProviderIconColorMode,
} from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger, getVaultBasePath } from '../../shared';
import { ProviderIconService } from '../../utils/icons';
import { ModelConfigJsonModal } from './ModelConfigJsonModal';
import { ModelConfigModal } from './ModelConfigModal';
import {
  buildModelPickerGroups,
  findModelPickerOption,
  type ModelPickerGroup,
} from './modelPicker';
import { ModelPickerModal } from './ModelPickerModal';
import { ProviderIconCacheModal } from './ProviderIconCacheModal';
import { SettingsModelCatalogPresenter } from './SettingsModelCatalogPresenter';

const logger = createLogger('SettingsModelSection');

type OpenCodeServerStatus = ReturnType<OpenCodianPlugin['openCodeService']['getServerStatus']>;

interface SettingsModelBlockOptions {
  title: string;
  description: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
}

interface SettingsModelSectionOptions {
  app: App;
  plugin: OpenCodianPlugin;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
  createSettingsBlock: (containerEl: HTMLElement, options: SettingsModelBlockOptions) => HTMLElement;
  setSettingDescWithFormatting: (setting: Setting, text: string) => void;
  applyInlineCodeText: (targetEl: HTMLElement | null, text: string) => void;
  refreshTitleModels: () => void;
  setRefreshModelsCallback: (callback?: () => void) => void;
  setRefreshModelCatalogStatusCallback: (callback?: () => void) => void;
  getServerState: () => {
    healthy: boolean;
    status: OpenCodeServerStatus;
  };
  setServerState: (state: {
    healthy: boolean;
    status: OpenCodeServerStatus;
  }) => void;
}

export class SettingsModelSection {
  private readonly app: App;
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
  private readonly createSettingsBlock: (containerEl: HTMLElement, options: SettingsModelBlockOptions) => HTMLElement;
  private readonly setSettingDescWithFormatting: (setting: Setting, text: string) => void;
  private readonly applyInlineCodeText: (targetEl: HTMLElement | null, text: string) => void;
  private readonly refreshTitleModels: () => void;
  private readonly setRefreshModelsCallback: (callback?: () => void) => void;
  private readonly setRefreshModelCatalogStatusCallback: (callback?: () => void) => void;
  private readonly getServerState: () => {
    healthy: boolean;
    status: OpenCodeServerStatus;
  };
  private readonly setServerState: (state: {
    healthy: boolean;
    status: OpenCodeServerStatus;
  }) => void;
  private modelCatalogPresenter: SettingsModelCatalogPresenter | null = null;

  constructor(options: SettingsModelSectionOptions) {
    this.app = options.app;
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.createSettingsBlock = options.createSettingsBlock;
    this.setSettingDescWithFormatting = options.setSettingDescWithFormatting;
    this.applyInlineCodeText = options.applyInlineCodeText;
    this.refreshTitleModels = options.refreshTitleModels;
    this.setRefreshModelsCallback = options.setRefreshModelsCallback;
    this.setRefreshModelCatalogStatusCallback = options.setRefreshModelCatalogStatusCallback;
    this.getServerState = options.getServerState;
    this.setServerState = options.setServerState;
  }

  dispose(): void {
    this.setRefreshModelsCallback(undefined);
    this.setRefreshModelCatalogStatusCallback(undefined);
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.model.title'),
      t('settings.quickNav.modelDesc'),
    );
    const modelConfigService = this.plugin.modelConfigService;

    if (!modelConfigService) {
      this.dispose();
      new Setting(containerEl)
        .setName(t('settings.model.config.unavailableTitle'))
        .setDesc(t('settings.model.config.unavailable'));
      return headingEl;
    }

    const modelCatalogStateService = new ModelCatalogStateService(modelConfigService);
    const modelCatalogPresenter = this.modelCatalogPresenter ??= new SettingsModelCatalogPresenter({
      catalogStateService: modelCatalogStateService,
      applyInlineCodeText: (targetEl, text) => {
        this.applyInlineCodeText(targetEl, text);
      },
      applyProviderIcon: (targetEl, providerId, label) => this.applyProviderIcon(targetEl, providerId, label),
      onProviderAvailabilityChange: async (providerIds, enabled) => {
        await applyProviderAvailabilityChange(providerIds, enabled);
      },
      onModelAvailabilityChange: async (modelRefs, enabled) => {
        await applyModelAvailabilityChange(modelRefs, enabled);
      },
    });
    modelCatalogPresenter.setPreferredCatalogTab(this.plugin.settings.modelSourceMode);

    let catalogState: ModelCatalogState | null = null;
    let catalogs: ModelCatalogBundle | null = null;
    let localModelConfig: OpencodeModelConfigSubset | null = null;
    let modelPickerGroups: ModelPickerGroup[] = [];
    let defaultModelButton: ButtonComponent | null = null;
    const commonBodyEl = this.createSettingsBlock(containerEl, {
      title: t('settings.model.common.title'),
      description: t('settings.model.common.desc'),
    });
    const configBodyEl = this.createSettingsBlock(containerEl, {
      title: t('settings.model.configBlock.title'),
      description: t('settings.model.configBlock.desc'),
    });
    const availabilityBodyEl = this.createSettingsBlock(containerEl, {
      title: t('settings.model.availability.title'),
      description: t('settings.model.availability.desc'),
      collapsible: true,
      defaultOpen: this.plugin.settings.modelAvailabilitySectionOpen,
      onToggle: (isOpen) => {
        this.plugin.settings.modelAvailabilitySectionOpen = isOpen;
        this.plugin.scheduleSettingsUiStateSave();
      },
    });
    const availabilityManagementEl = availabilityBodyEl.createDiv({ cls: 'opencodian-model-toggle-management' });
    const toolsBodyEl = this.createSettingsBlock(containerEl, {
      title: t('settings.model.tools.title'),
      description: t('settings.model.tools.desc'),
      collapsible: true,
      defaultOpen: this.plugin.settings.modelToolsSectionOpen,
      onToggle: (isOpen) => {
        this.plugin.settings.modelToolsSectionOpen = isOpen;
        this.plugin.scheduleSettingsUiStateSave();
      },
    });
    toolsBodyEl.parentElement?.addClass('opencodian-icon-cache-block');
    const commonSummaryEl = commonBodyEl.createDiv({ cls: 'opencodian-model-common-summary' });

    const syncSettingsWithCatalogs = (nextCatalogs: ModelCatalogBundle): boolean => {
      const effectiveProviders = nextCatalogs.effective.providers;
      const effectiveProvider = effectiveProviders.find(
        (provider) => provider.id === this.plugin.settings.defaultProvider,
      ) ?? null;
      let dirty = false;

      if (!effectiveProvider && this.plugin.settings.defaultProvider !== '') {
        this.plugin.settings.defaultProvider = '';
        dirty = true;
      }

      const effectiveModel = effectiveProvider?.models.find(
        (model) => model.id === this.plugin.settings.defaultModel,
      ) ?? null;
      if (!effectiveProvider || !effectiveModel) {
        if (this.plugin.settings.defaultModel !== '') {
          this.plugin.settings.defaultModel = '';
          dirty = true;
        }
      }

      return dirty;
    };

    const updateCommonSummary = (): void => {
      if (!catalogs) {
        commonSummaryEl.setText(t('settings.model.common.summaryLoading'));
        return;
      }

      commonSummaryEl.setText(t('settings.model.common.summary', {
        providers: String(catalogs.effective.providers.length),
        models: String(modelCatalogPresenter.getCatalogModelCount(catalogs.effective)),
      }));
    };

    const openModelWorkspace = (options?: ConstructorParameters<typeof ModelConfigModal>[2]): void => {
      new ModelConfigModal(this.app, this.plugin, {
        ...options,
        onSaved: async () => {
          await refreshModelSettings({ forceViewReload: true });
          await refreshIconCacheOverview();
          await options?.onSaved?.();
        },
      }).open();
    };

    const renderConfigCards = (): void => {
      configBodyEl.empty();

      configBodyEl.createDiv({
        cls: 'opencodian-config-path opencodian-model-config-block-path',
        text: `${t('settings.model.config.path')}: ${modelConfigService.getConfigPath()}`,
      });

      const providers = Object.entries(localModelConfig?.provider ?? {});
      if (providers.length === 0) {
        configBodyEl.createDiv({
          cls: 'opencodian-model-config-block-empty',
          text: t('settings.model.configCard.empty'),
        });
      }

      const gridEl = configBodyEl.createDiv({ cls: 'opencodian-settings-provider-grid' });
      for (const [providerId, provider] of providers) {
        const providerName = typeof provider.name === 'string' && provider.name.trim().length > 0
          ? provider.name.trim()
          : providerId;
        const providerEnabled = isProviderEnabled(localModelConfig ?? {}, providerId);
        const modelCount = Object.keys(provider.models ?? {}).length;
        const cardEl = gridEl.createEl('button', {
          cls: `opencodian-preset-card opencodian-settings-provider-card${providerEnabled ? '' : ' is-disabled'}`,
        });
        cardEl.type = 'button';
        cardEl.addEventListener('click', () => {
          openModelWorkspace({
            initialProviderId: providerId,
            initialView: 'editor',
          });
        });

        const iconEl = cardEl.createDiv({ cls: 'opencodian-preset-card-icon' });
        setIcon(iconEl, 'bot');
        void this.applyProviderIcon(iconEl, providerId, providerName);

        const copyEl = cardEl.createDiv({ cls: 'opencodian-preset-card-copy' });
        copyEl.createDiv({
          cls: 'opencodian-preset-card-title',
          text: providerName,
        });
        copyEl.createDiv({
          cls: 'opencodian-preset-card-subtitle',
          text: providerId,
        });
        copyEl.createDiv({
          cls: 'opencodian-preset-card-meta',
          text: t('settings.model.configCard.modelCount', {
            count: String(modelCount),
          }),
        });

        const badgesEl = copyEl.createDiv({ cls: 'opencodian-settings-provider-card-badges' });
        badgesEl.createSpan({
          cls: `opencodian-model-workspace-status-badge ${providerEnabled ? 'is-enabled' : 'is-disabled'}`,
          text: providerEnabled
            ? t('settings.model.configCard.enabled')
            : t('settings.model.configCard.disabled'),
        });
      }

      const addCardEl = gridEl.createEl('button', {
        cls: 'opencodian-preset-card opencodian-settings-provider-card is-add-card',
      });
      addCardEl.type = 'button';
      addCardEl.addEventListener('click', () => {
        openModelWorkspace({
          initialView: 'preset-selector',
        });
      });

      const addIconEl = addCardEl.createDiv({ cls: 'opencodian-preset-card-icon' });
      setIcon(addIconEl, 'plus');
      const addCopyEl = addCardEl.createDiv({ cls: 'opencodian-preset-card-copy' });
      addCopyEl.createDiv({
        cls: 'opencodian-preset-card-title',
        text: t('settings.model.configCard.add'),
      });
      addCopyEl.createDiv({
        cls: 'opencodian-preset-card-meta',
        text: t('settings.model.configCard.addDesc'),
      });

      const actionsEl = configBodyEl.createDiv({ cls: 'opencodian-config-buttons' });
      const jsonButton = actionsEl.createEl('button', {
        text: t('settings.model.config.jsonButton'),
      });
      jsonButton.type = 'button';
      jsonButton.addEventListener('click', () => {
        new ModelConfigJsonModal(this.app, this.plugin).open();
      });
    };

    const updateDefaultModelButton = (): void => {
      if (!defaultModelButton) {
        return;
      }

      const selected = findModelPickerOption(
        modelPickerGroups,
        this.plugin.settings.defaultProvider,
        this.plugin.settings.defaultModel,
      );
      defaultModelButton.setButtonText(
        selected
          ? `${selected.providerName} / ${selected.modelName}`
          : t('settings.model.unconfigured'),
      );
      defaultModelButton.setDisabled(modelPickerGroups.length === 0);
    };

    const applyProviderAvailabilityChange = async (
      providerIds: Iterable<string>,
      enabled: boolean,
    ): Promise<void> => {
      try {
        const state = catalogState ?? await modelCatalogStateService.getCatalogState(
          this.plugin.settings.modelSourceMode,
          this.plugin.settings.disabledModelRefs,
        );
        const changed = await modelCatalogStateService.applyProviderAvailabilityChange({
          state,
          providerIds,
          enabled,
        });
        if (!changed) {
          return;
        }
        await refreshModelSettings({ forceViewReload: true });
        await refreshIconCacheOverview();
      } catch (error) {
        logger.error('Failed to update provider availability in bulk:', error);
        new Notice(t('settings.model.toggle.saveFailed'));
        throw error;
      }
    };

    const applyModelAvailabilityChange = async (
      modelRefs: Iterable<string>,
      enabled: boolean,
    ): Promise<void> => {
      const previousDisabledModelRefs = [...this.plugin.settings.disabledModelRefs];
      this.plugin.settings.disabledModelRefs = modelCatalogStateService.applyModelAvailabilityChange({
        disabledModelRefs: previousDisabledModelRefs,
        modelRefs,
        enabled,
      });
      if (this.plugin.settings.disabledModelRefs.join('\u0000') === previousDisabledModelRefs.join('\u0000')) {
        return;
      }

      try {
        await refreshModelSettings({ forceViewReload: true });
        await refreshIconCacheOverview();
      } catch (error) {
        logger.error('Failed to update model availability in bulk:', error);
        this.plugin.settings.disabledModelRefs = previousDisabledModelRefs;
        new Notice(t('settings.model.toggle.saveFailed'));
        throw error;
      }
    };

    const openDefaultModelPicker = (): void => {
      new ModelPickerModal(this.app, {
        title: t('settings.model.defaultChatModel.pickerTitle'),
        description: t('settings.model.defaultChatModel.pickerDesc'),
        groups: modelPickerGroups,
        selectedRef: this.plugin.settings.defaultProvider && this.plugin.settings.defaultModel
          ? formatModelReference(this.plugin.settings.defaultProvider, this.plugin.settings.defaultModel)
          : '',
        emptySelectionLabel: t('settings.model.unconfigured'),
        onChoose: async (option) => {
          this.plugin.settings.defaultProvider = option?.providerId ?? '';
          this.plugin.settings.defaultModel = option?.modelId ?? '';
          updateDefaultModelButton();
          await this.plugin.saveSettings({
            syncConfig: false,
            reloadModels: true,
            applyUi: true,
          });
        },
      }).open();
    };

    const renderAvailabilityManagement = (): void => {
      modelCatalogPresenter.render({
        containerEl: availabilityManagementEl,
        catalogState,
      });
    };

    const refreshModelSettings = async (
      options: { showNotice?: boolean; forceViewReload?: boolean } = {},
    ): Promise<ModelCatalogState | null> => {
      const {
        showNotice = false,
        forceViewReload = false,
      } = options;

      try {
        catalogState = await modelCatalogStateService.getCatalogState(
          this.plugin.settings.modelSourceMode,
          this.plugin.settings.disabledModelRefs,
        );
        localModelConfig = catalogState.localModelConfig;
        catalogs = catalogState.catalogs;
        modelPickerGroups = buildModelPickerGroups(catalogs.effective);
        const dirty = syncSettingsWithCatalogs(catalogs);

        const serializeCatalog = (catalog: ModelCatalog) => ({
          defaults: { ...catalog.defaults },
          providerCount: catalog.providers.length,
          modelCount: modelCatalogPresenter.getCatalogModelCount(catalog),
          providers: catalog.providers.map((provider) => ({
            id: provider.id,
            name: provider.name,
            source: provider.source,
            existsInLocal: provider.existsInLocal,
            existsInServer: provider.existsInServer,
            modelCount: provider.models.length,
            models: provider.models.map((model) => ({
              id: model.id,
              name: model.name,
              source: model.source,
              existsInLocal: model.existsInLocal,
              existsInServer: model.existsInServer,
              contextWindow: model.contextWindow,
            })),
          })),
        });

        updateCommonSummary();
        renderConfigCards();
        updateDefaultModelButton();
        renderAvailabilityManagement();
        this.refreshTitleModels();

        if (dirty || forceViewReload) {
          await this.plugin.saveSettings({
            syncConfig: false,
            reloadModels: true,
            applyUi: true,
          });
        }

        if (showNotice) {
          const serverDisplayCatalog = catalogState.displayCatalogs.server;
          logger.debug('Manual model refresh snapshot', {
            modelSourceMode: this.plugin.settings.modelSourceMode,
            vaultPath: getVaultBasePath(this.app) ?? null,
            disabledProviders: [...(localModelConfig.disabled_providers ?? [])],
            enabledProviders: [...(localModelConfig.enabled_providers ?? [])],
            disabledModelRefs: [...this.plugin.settings.disabledModelRefs],
            selectedDefaultProvider: this.plugin.settings.defaultProvider,
            selectedDefaultModel: this.plugin.settings.defaultModel,
            selectedSmallModel: localModelConfig.small_model ?? null,
            local: serializeCatalog(catalogs.local),
            server: serializeCatalog(catalogs.server),
            baseEffective: serializeCatalog(catalogs.baseEffective),
            effective: serializeCatalog(catalogs.effective),
            disabled: serializeCatalog(catalogState.displayCatalogs.disabled),
          });
          new Notice(t('settings.model.refresh.success', {
            serverCount: String(serverDisplayCatalog.providers.length),
            effectiveCount: String(catalogs.effective.providers.length),
          }));
        }

        return catalogState;
      } catch (error) {
        logger.error('Failed to load models:', error);
        if (showNotice) {
          new Notice(t('settings.model.refresh.failed'));
        }
        return null;
      }
    };

    this.setRefreshModelsCallback(() => {
      void refreshModelSettings();
    });

    new Setting(commonBodyEl)
      .setName(t('settings.model.defaultChatModel.name'))
      .setDesc(t('settings.model.defaultChatModel.desc'))
      .addButton((btn) => {
        defaultModelButton = btn;
        btn
          .setButtonText(t('settings.model.common.summaryLoading'))
          .setCta()
          .onClick(() => {
            openDefaultModelPicker();
          });
      });

    const modelSourceSetting = new Setting(commonBodyEl)
      .setName(t('settings.model.source.name'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('merge', t('settings.model.source.merge'))
          .addOption('local', t('settings.model.source.local'))
          .addOption('server', t('settings.model.source.server'))
          .setValue(this.plugin.settings.modelSourceMode)
          .onChange(async (value) => {
            this.plugin.settings.modelSourceMode = value as ModelSourceMode;
            modelCatalogPresenter.setPreferredCatalogTab(value as ModelSourceMode);
            await this.plugin.saveSettings({
              syncConfig: false,
              reloadModels: true,
              applyUi: true,
            });
            new Notice(t('settings.model.source.updated'));
            await refreshModelSettings();
            await refreshIconCacheOverview();
          });
      });
    this.setSettingDescWithFormatting(modelSourceSetting, t('settings.model.source.desc'));

    let refreshModelsButton: ButtonComponent | undefined;
    let isRefreshingModelCatalog = false;
    const updateModelRefreshButtonState = () => {
      if (!refreshModelsButton) {
        return;
      }

      const serverState = this.getServerState();
      const serverBusy = serverState.status === 'starting' || serverState.status === 'restarting';
      refreshModelsButton.setButtonText(
        isRefreshingModelCatalog
          ? t('settings.model.refresh.loading')
          : t('settings.model.refresh.button'),
      );
      refreshModelsButton.setDisabled(isRefreshingModelCatalog || !serverState.healthy || serverBusy);
    };
    this.setRefreshModelCatalogStatusCallback(updateModelRefreshButtonState);
    updateModelRefreshButtonState();

    new Setting(commonBodyEl)
      .setName(t('settings.model.refresh.name'))
      .setDesc(t('settings.model.refresh.desc'))
      .addButton((btn) => {
        refreshModelsButton = btn;
        updateModelRefreshButtonState();
        btn
          .setButtonText(t('settings.model.refresh.button'))
          .onClick(async () => {
            isRefreshingModelCatalog = true;
            updateModelRefreshButtonState();
            const serverState = this.getServerState();
            const isHealthy = serverState.healthy || await this.plugin.openCodeService.checkHealth();
            if (!isHealthy) {
              this.setServerState({
                healthy: false,
                status: this.plugin.openCodeService.getServerStatus(),
              });
              isRefreshingModelCatalog = false;
              updateModelRefreshButtonState();
              new Notice(t('settings.model.refresh.unavailable'));
              return;
            }
            await refreshModelSettings({ showNotice: true, forceViewReload: true });
            await refreshIconCacheOverview();
            isRefreshingModelCatalog = false;
            updateModelRefreshButtonState();
          });
      });

    renderConfigCards();
    let refreshIconCacheButton: ButtonComponent;
    let warmIconCacheButton: ButtonComponent;
    let viewIconCacheButton: ButtonComponent;
    const iconCacheOverviewSetting = new Setting(toolsBodyEl)
      .setName(t('settings.model.iconCache.currentName'))
      .setDesc(t('settings.model.iconCache.currentLoading'))
      .addButton((btn) => {
        viewIconCacheButton = btn;
        btn
          .setButtonText(t('settings.model.iconCache.view'))
          .onClick(async () => {
            const providerIds = await this.getCurrentProviderIdsForIconCache();
            new ProviderIconCacheModal(this.app, this.plugin, providerIds, () => {
              renderConfigCards();
              void refreshIconCacheOverview();
            }).open();
          });
      });

    const setIconCacheButtonsDisabled = (disabled: boolean) => {
      refreshIconCacheButton?.setDisabled(disabled);
      warmIconCacheButton?.setDisabled(disabled);
      viewIconCacheButton?.setDisabled(disabled);
    };

    const refreshIconCacheOverview = async () => {
      try {
        const providerIds = await this.getCurrentProviderIdsForIconCache();
        const { summary } = await ProviderIconService.getProviderCacheState(
          this.app,
          providerIds,
          this.plugin.settings.providerIconLibrary,
        );
        iconCacheOverviewSetting.setDesc(t('settings.model.iconCache.currentStatus', {
          cachedProviders: String(summary.cachedProviders),
          totalProviders: String(summary.totalProviders),
          cachedIcons: String(summary.cachedIcons),
          totalIcons: String(summary.totalIcons),
          currentProviders: String(summary.currentProviders),
        }));
        viewIconCacheButton?.setDisabled(summary.totalProviders === 0);
      } catch (error) {
        logger.error('Failed to load provider icon cache overview:', error);
        iconCacheOverviewSetting.setDesc(t('settings.model.iconCache.currentFailed'));
        viewIconCacheButton?.setDisabled(true);
      }
    };

    new Setting(toolsBodyEl)
      .setName(t('settings.model.iconCache.name'))
      .setDesc(t('settings.model.iconCache.desc'))
      .addButton((btn) => {
        refreshIconCacheButton = btn;
        btn
          .setButtonText(t('settings.model.iconCache.refresh'))
          .onClick(async () => {
            setIconCacheButtonsDisabled(true);
            try {
              const providerIds = await this.getCurrentProviderIdsForIconCache();
              this.plugin.settings.providerIconLibrary = ProviderIconService.persistDefaultEntries(
                providerIds,
                this.plugin.settings.providerIconLibrary,
              );
              const removed = await ProviderIconService.clearCache(this.app);
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
              new Notice(t('settings.model.iconCache.refreshSuccess', {
                cached: String(summary.cached),
                supported: String(summary.supported),
                removed: String(removed),
              }));
              renderConfigCards();
              await refreshIconCacheOverview();
            } catch (error) {
              logger.error('Failed to refresh provider icon cache:', error);
              new Notice(t('settings.model.iconCache.refreshFailed'));
            } finally {
              setIconCacheButtonsDisabled(false);
            }
          });
      })
      .addButton((btn) => {
        warmIconCacheButton = btn;
        btn
          .setButtonText(t('settings.model.iconCache.warm'))
          .setCta()
          .onClick(async () => {
            setIconCacheButtonsDisabled(true);
            try {
              const providerIds = await this.getCurrentProviderIdsForIconCache();
              this.plugin.settings.providerIconLibrary = ProviderIconService.persistDefaultEntries(
                providerIds,
                this.plugin.settings.providerIconLibrary,
              );
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
              if (summary.total === 0) {
                new Notice(t('settings.model.iconCache.noProviders'));
                return;
              }
              new Notice(t('settings.model.iconCache.warmSuccess', {
                cached: String(summary.cached),
                supported: String(summary.supported),
              }));
              renderConfigCards();
              await refreshIconCacheOverview();
            } catch (error) {
              logger.error('Failed to warm provider icon cache:', error);
              new Notice(t('settings.model.iconCache.warmFailed'));
            } finally {
              setIconCacheButtonsDisabled(false);
            }
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

    updateCommonSummary();
    updateDefaultModelButton();
    void refreshIconCacheOverview();

    void (async () => {
      await refreshModelSettings();
      await refreshIconCacheOverview();
    })();

    return headingEl;
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

  private async applyProviderIcon(targetEl: HTMLElement, providerId: string, label: string): Promise<void> {
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
      imgEl.title = label;
      targetEl.appendChild(imgEl);
      return;
    }

    setIcon(targetEl, 'bot');
  }
}
