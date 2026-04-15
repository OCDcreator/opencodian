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

type ModelConfigService = NonNullable<OpenCodianPlugin['modelConfigService']>;

interface SettingsModelSectionRuntimeState {
  modelConfigService: ModelConfigService;
  modelCatalogStateService: ModelCatalogStateService;
  catalogState: ModelCatalogState | null;
  catalogs: ModelCatalogBundle | null;
  localModelConfig: OpencodeModelConfigSubset | null;
  modelPickerGroups: ModelPickerGroup[];
  commonSummaryEl: HTMLElement;
  configBodyEl: HTMLElement;
  availabilityManagementEl: HTMLElement;
  iconCacheOverviewSetting: Setting | null;
  defaultModelButton: ButtonComponent | null;
  refreshModelsButton: ButtonComponent | null;
  refreshIconCacheButton: ButtonComponent | null;
  warmIconCacheButton: ButtonComponent | null;
  viewIconCacheButton: ButtonComponent | null;
  isRefreshingModelCatalog: boolean;
}

interface SettingsModelSectionBodies {
  commonBodyEl: HTMLElement;
  toolsBodyEl: HTMLElement;
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
  private runtime: SettingsModelSectionRuntimeState | null = null;

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
    this.runtime = null;
    this.setRefreshModelsCallback(undefined);
    this.setRefreshModelCatalogStatusCallback(undefined);
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    this.dispose();

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

    const { commonBodyEl, toolsBodyEl } = this.initializeRuntime(containerEl, modelConfigService);
    this.attachCommonSettings(commonBodyEl);
    this.attachIconCacheTools(toolsBodyEl);
    this.updateCommonSummary();
    this.updateDefaultModelButton();
    void this.refreshIconCacheOverview();
    void this.bootstrapModelSection();

    return headingEl;
  }

  private initializeRuntime(
    containerEl: HTMLElement,
    modelConfigService: ModelConfigService,
  ): SettingsModelSectionBodies {
    const modelCatalogStateService = new ModelCatalogStateService(modelConfigService);
    const modelCatalogPresenter = this.modelCatalogPresenter ??= new SettingsModelCatalogPresenter({
      catalogStateService: modelCatalogStateService,
      applyInlineCodeText: (targetEl, text) => this.applyInlineCodeText(targetEl, text),
      applyProviderIcon: (targetEl, providerId, label) => this.applyProviderIcon(targetEl, providerId, label),
      onProviderAvailabilityChange: (providerIds, enabled) => this.applyProviderAvailabilityChange(providerIds, enabled),
      onModelAvailabilityChange: (modelRefs, enabled) => this.applyModelAvailabilityChange(modelRefs, enabled),
    });
    modelCatalogPresenter.setPreferredCatalogTab(this.plugin.settings.modelSourceMode);

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

    this.runtime = {
      modelConfigService,
      modelCatalogStateService,
      catalogState: null,
      catalogs: null,
      localModelConfig: null,
      modelPickerGroups: [],
      commonSummaryEl: commonBodyEl.createDiv({ cls: 'opencodian-model-common-summary' }),
      configBodyEl,
      availabilityManagementEl: availabilityBodyEl.createDiv({ cls: 'opencodian-model-toggle-management' }),
      iconCacheOverviewSetting: null,
      defaultModelButton: null,
      refreshModelsButton: null,
      refreshIconCacheButton: null,
      warmIconCacheButton: null,
      viewIconCacheButton: null,
      isRefreshingModelCatalog: false,
    };

    this.setRefreshModelsCallback(() => {
      void this.refreshModelSettings();
    });
    this.setRefreshModelCatalogStatusCallback(() => {
      this.updateModelRefreshButtonState();
    });

    return {
      commonBodyEl,
      toolsBodyEl,
    };
  }

  private attachCommonSettings(commonBodyEl: HTMLElement): void {
    const runtime = this.runtime;
    if (!runtime) {
      return;
    }

    new Setting(commonBodyEl)
      .setName(t('settings.model.defaultChatModel.name'))
      .setDesc(t('settings.model.defaultChatModel.desc'))
      .addButton((btn) => {
        runtime.defaultModelButton = btn;
        btn
          .setButtonText(t('settings.model.common.summaryLoading'))
          .setCta()
          .onClick(() => {
            this.openDefaultModelPicker();
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
            await this.handleModelSourceModeChange(value as ModelSourceMode);
          });
      });
    this.setSettingDescWithFormatting(modelSourceSetting, t('settings.model.source.desc'));

    new Setting(commonBodyEl)
      .setName(t('settings.model.refresh.name'))
      .setDesc(t('settings.model.refresh.desc'))
      .addButton((btn) => {
        runtime.refreshModelsButton = btn;
        this.updateModelRefreshButtonState();
        btn
          .setButtonText(t('settings.model.refresh.button'))
          .onClick(async () => {
            await this.handleManualModelRefresh();
          });
      });
    this.updateModelRefreshButtonState();

    this.renderConfigCards();
  }

  private attachIconCacheTools(toolsBodyEl: HTMLElement): void {
    const runtime = this.runtime;
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
              this.renderConfigCards();
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

  private async bootstrapModelSection(): Promise<void> {
    await this.refreshModelSettings();
    await this.refreshIconCacheOverview();
  }

  private syncSettingsWithCatalogs(nextCatalogs: ModelCatalogBundle): boolean {
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
    if ((!effectiveProvider || !effectiveModel) && this.plugin.settings.defaultModel !== '') {
      this.plugin.settings.defaultModel = '';
      dirty = true;
    }

    return dirty;
  }

  private updateCommonSummary(): void {
    const runtime = this.runtime;
    const modelCatalogPresenter = this.modelCatalogPresenter;
    if (!runtime || !modelCatalogPresenter) {
      return;
    }

    if (!runtime.catalogs) {
      runtime.commonSummaryEl.setText(t('settings.model.common.summaryLoading'));
      return;
    }

    runtime.commonSummaryEl.setText(t('settings.model.common.summary', {
      providers: String(runtime.catalogs.effective.providers.length),
      models: String(modelCatalogPresenter.getCatalogModelCount(runtime.catalogs.effective)),
    }));
  }

  private openModelWorkspace(options?: ConstructorParameters<typeof ModelConfigModal>[2]): void {
    new ModelConfigModal(this.app, this.plugin, {
      ...options,
      onSaved: async () => {
        await this.refreshModelSettings({ forceViewReload: true });
        await this.refreshIconCacheOverview();
        await options?.onSaved?.();
      },
    }).open();
  }

  private renderConfigCards(): void {
    const runtime = this.runtime;
    if (!runtime) {
      return;
    }

    runtime.configBodyEl.empty();
    runtime.configBodyEl.createDiv({
      cls: 'opencodian-config-path opencodian-model-config-block-path',
      text: `${t('settings.model.config.path')}: ${runtime.modelConfigService.getConfigPath()}`,
    });

    const providers = Object.entries(runtime.localModelConfig?.provider ?? {});
    if (providers.length === 0) {
      runtime.configBodyEl.createDiv({
        cls: 'opencodian-model-config-block-empty',
        text: t('settings.model.configCard.empty'),
      });
    }

    const gridEl = runtime.configBodyEl.createDiv({ cls: 'opencodian-settings-provider-grid' });
    for (const [providerId, provider] of providers) {
      const providerName = typeof provider.name === 'string' && provider.name.trim().length > 0
        ? provider.name.trim()
        : providerId;
      const providerEnabled = isProviderEnabled(runtime.localModelConfig ?? {}, providerId);
      const modelCount = Object.keys(provider.models ?? {}).length;
      const cardEl = gridEl.createEl('button', {
        cls: `opencodian-preset-card opencodian-settings-provider-card${providerEnabled ? '' : ' is-disabled'}`,
      });
      cardEl.type = 'button';
      cardEl.addEventListener('click', () => {
        this.openModelWorkspace({
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
      this.openModelWorkspace({
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

    const actionsEl = runtime.configBodyEl.createDiv({ cls: 'opencodian-config-buttons' });
    const jsonButton = actionsEl.createEl('button', {
      text: t('settings.model.config.jsonButton'),
    });
    jsonButton.type = 'button';
    jsonButton.addEventListener('click', () => {
      new ModelConfigJsonModal(this.app, this.plugin).open();
    });
  }

  private updateDefaultModelButton(): void {
    const runtime = this.runtime;
    if (!runtime?.defaultModelButton) {
      return;
    }

    const selected = findModelPickerOption(
      runtime.modelPickerGroups,
      this.plugin.settings.defaultProvider,
      this.plugin.settings.defaultModel,
    );
    runtime.defaultModelButton.setButtonText(
      selected
        ? `${selected.providerName} / ${selected.modelName}`
        : t('settings.model.unconfigured'),
    );
    runtime.defaultModelButton.setDisabled(runtime.modelPickerGroups.length === 0);
  }

  private async applyProviderAvailabilityChange(
    providerIds: Iterable<string>,
    enabled: boolean,
  ): Promise<void> {
    const runtime = this.runtime;
    if (!runtime) {
      return;
    }

    try {
      const state = runtime.catalogState ?? await runtime.modelCatalogStateService.getCatalogState(
        this.plugin.settings.modelSourceMode,
        this.plugin.settings.disabledModelRefs,
      );
      if (!this.isRuntimeActive(runtime)) {
        return;
      }

      const changed = await runtime.modelCatalogStateService.applyProviderAvailabilityChange({
        state,
        providerIds,
        enabled,
      });
      if (!changed) {
        return;
      }
      await this.refreshModelSettings({ forceViewReload: true });
      await this.refreshIconCacheOverview();
    } catch (error) {
      logger.error('Failed to update provider availability in bulk:', error);
      new Notice(t('settings.model.toggle.saveFailed'));
      throw error;
    }
  }

  private async applyModelAvailabilityChange(
    modelRefs: Iterable<string>,
    enabled: boolean,
  ): Promise<void> {
    const runtime = this.runtime;
    if (!runtime) {
      return;
    }

    const previousDisabledModelRefs = [...this.plugin.settings.disabledModelRefs];
    this.plugin.settings.disabledModelRefs = runtime.modelCatalogStateService.applyModelAvailabilityChange({
      disabledModelRefs: previousDisabledModelRefs,
      modelRefs,
      enabled,
    });
    if (this.plugin.settings.disabledModelRefs.join('\u0000') === previousDisabledModelRefs.join('\u0000')) {
      return;
    }

    try {
      await this.refreshModelSettings({ forceViewReload: true });
      await this.refreshIconCacheOverview();
    } catch (error) {
      logger.error('Failed to update model availability in bulk:', error);
      this.plugin.settings.disabledModelRefs = previousDisabledModelRefs;
      new Notice(t('settings.model.toggle.saveFailed'));
      throw error;
    }
  }

  private openDefaultModelPicker(): void {
    const runtime = this.runtime;
    if (!runtime) {
      return;
    }

    new ModelPickerModal(this.app, {
      title: t('settings.model.defaultChatModel.pickerTitle'),
      description: t('settings.model.defaultChatModel.pickerDesc'),
      groups: runtime.modelPickerGroups,
      selectedRef: this.plugin.settings.defaultProvider && this.plugin.settings.defaultModel
        ? formatModelReference(this.plugin.settings.defaultProvider, this.plugin.settings.defaultModel)
        : '',
      emptySelectionLabel: t('settings.model.unconfigured'),
      onChoose: async (option) => {
        this.plugin.settings.defaultProvider = option?.providerId ?? '';
        this.plugin.settings.defaultModel = option?.modelId ?? '';
        this.updateDefaultModelButton();
        await this.plugin.saveSettings({
          syncConfig: false,
          reloadModels: true,
          applyUi: true,
        });
      },
    }).open();
  }

  private renderAvailabilityManagement(): void {
    const runtime = this.runtime;
    const modelCatalogPresenter = this.modelCatalogPresenter;
    if (!runtime || !modelCatalogPresenter) {
      return;
    }

    modelCatalogPresenter.render({
      containerEl: runtime.availabilityManagementEl,
      catalogState: runtime.catalogState,
    });
  }

  private async refreshModelSettings(
    options: { showNotice?: boolean; forceViewReload?: boolean } = {},
  ): Promise<ModelCatalogState | null> {
    const runtime = this.runtime;
    if (!runtime) {
      return null;
    }

    const {
      showNotice = false,
      forceViewReload = false,
    } = options;

    try {
      const catalogState = await runtime.modelCatalogStateService.getCatalogState(
        this.plugin.settings.modelSourceMode,
        this.plugin.settings.disabledModelRefs,
      );
      if (!this.isRuntimeActive(runtime)) {
        return null;
      }

      runtime.catalogState = catalogState;
      runtime.localModelConfig = catalogState.localModelConfig;
      runtime.catalogs = catalogState.catalogs;
      runtime.modelPickerGroups = buildModelPickerGroups(runtime.catalogs.effective);
      const dirty = this.syncSettingsWithCatalogs(runtime.catalogs);

      this.updateCommonSummary();
      this.renderConfigCards();
      this.updateDefaultModelButton();
      this.renderAvailabilityManagement();
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
          disabledProviders: [...(runtime.localModelConfig?.disabled_providers ?? [])],
          enabledProviders: [...(runtime.localModelConfig?.enabled_providers ?? [])],
          disabledModelRefs: [...this.plugin.settings.disabledModelRefs],
          selectedDefaultProvider: this.plugin.settings.defaultProvider,
          selectedDefaultModel: this.plugin.settings.defaultModel,
          selectedSmallModel: runtime.localModelConfig?.small_model ?? null,
          local: this.serializeCatalog(runtime.catalogs.local),
          server: this.serializeCatalog(runtime.catalogs.server),
          baseEffective: this.serializeCatalog(runtime.catalogs.baseEffective),
          effective: this.serializeCatalog(runtime.catalogs.effective),
          disabled: this.serializeCatalog(catalogState.displayCatalogs.disabled),
        });
        new Notice(t('settings.model.refresh.success', {
          serverCount: String(serverDisplayCatalog.providers.length),
          effectiveCount: String(runtime.catalogs.effective.providers.length),
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
  }

  private serializeCatalog(catalog: ModelCatalog) {
    return {
      defaults: { ...catalog.defaults },
      providerCount: catalog.providers.length,
      modelCount: this.modelCatalogPresenter?.getCatalogModelCount(catalog) ?? 0,
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
    };
  }

  private async handleModelSourceModeChange(mode: ModelSourceMode): Promise<void> {
    this.plugin.settings.modelSourceMode = mode;
    this.modelCatalogPresenter?.setPreferredCatalogTab(mode);
    await this.plugin.saveSettings({
      syncConfig: false,
      reloadModels: true,
      applyUi: true,
    });
    new Notice(t('settings.model.source.updated'));
    await this.refreshModelSettings();
    await this.refreshIconCacheOverview();
  }

  private async handleManualModelRefresh(): Promise<void> {
    const runtime = this.runtime;
    if (!runtime) {
      return;
    }

    runtime.isRefreshingModelCatalog = true;
    this.updateModelRefreshButtonState();
    try {
      const serverState = this.getServerState();
      const isHealthy = serverState.healthy || await this.plugin.openCodeService.checkHealth();
      if (!isHealthy) {
        if (this.isRuntimeActive(runtime)) {
          this.setServerState({
            healthy: false,
            status: this.plugin.openCodeService.getServerStatus(),
          });
          new Notice(t('settings.model.refresh.unavailable'));
        }
        return;
      }

      await this.refreshModelSettings({ showNotice: true, forceViewReload: true });
      await this.refreshIconCacheOverview();
    } finally {
      if (this.isRuntimeActive(runtime)) {
        runtime.isRefreshingModelCatalog = false;
        this.updateModelRefreshButtonState();
      }
    }
  }

  private updateModelRefreshButtonState(): void {
    const runtime = this.runtime;
    if (!runtime?.refreshModelsButton) {
      return;
    }

    const serverState = this.getServerState();
    const serverBusy = serverState.status === 'starting' || serverState.status === 'restarting';
    runtime.refreshModelsButton.setButtonText(
      runtime.isRefreshingModelCatalog
        ? t('settings.model.refresh.loading')
        : t('settings.model.refresh.button'),
    );
    runtime.refreshModelsButton.setDisabled(runtime.isRefreshingModelCatalog || !serverState.healthy || serverBusy);
  }

  private setIconCacheButtonsDisabled(disabled: boolean): void {
    const runtime = this.runtime;
    if (!runtime) {
      return;
    }

    runtime.refreshIconCacheButton?.setDisabled(disabled);
    runtime.warmIconCacheButton?.setDisabled(disabled);
    runtime.viewIconCacheButton?.setDisabled(disabled);
  }

  private async refreshProviderIconCache(mode: 'refresh' | 'warm'): Promise<void> {
    const runtime = this.runtime;
    if (!runtime) {
      return;
    }

    this.setIconCacheButtonsDisabled(true);
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

      this.renderConfigCards();
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
        this.setIconCacheButtonsDisabled(false);
      }
    }
  }

  private async refreshIconCacheOverview(): Promise<void> {
    const runtime = this.runtime;
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

  private isRuntimeActive(runtime: SettingsModelSectionRuntimeState): boolean {
    return this.runtime === runtime;
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
