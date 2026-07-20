import type { App, ButtonComponent } from 'obsidian';
import { Notice, setIcon } from 'obsidian';

import {
  type ModelCatalogBundle,
  type ModelCatalogState,
  type ModelCatalogStateService,
} from '../../core/config';
import {
  formatModelReference,
  isProviderEnabled,
  type ModelCatalog,
} from '../../core/config/modelConfig';
import type { ModelSourceMode, OpencodeModelConfigSubset } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger, getVaultBasePath } from '../../shared';
import { ModelConfigJsonModal } from './ModelConfigJsonModal';
import { ModelConfigModal } from './ModelConfigModal';
import {
  buildModelPickerGroups,
  findModelPickerOption,
  findModelPickerOptionByRef,
  type ModelPickerGroup,
} from './modelPicker';
import { ModelPickerModal } from './ModelPickerModal';
import { describeModelCatalogComparison } from './SettingsModelCatalogAvailability';
import type { SettingsModelCatalogPresenter } from './SettingsModelCatalogPresenter';

const logger = createLogger('SettingsModelCatalogCoordinator');

export type OpenCodeServerStatus = ReturnType<OpenCodianPlugin['openCodeService']['getServerStatus']>;

export interface SettingsModelCatalogRuntimeState {
  modelConfigService: NonNullable<OpenCodianPlugin['modelConfigService']>;
  modelCatalogStateService: ModelCatalogStateService;
  catalogState: ModelCatalogState | null;
  catalogs: ModelCatalogBundle | null;
  localModelConfig: OpencodeModelConfigSubset | null;
  modelPickerGroups: ModelPickerGroup[];
  commonSummaryEl: HTMLElement;
  catalogComparisonEl: HTMLElement;
  configBodyEl: HTMLElement;
  availabilityManagementEl: HTMLElement;
  defaultModelButton: ButtonComponent | null;
  smallModelButton: ButtonComponent | null;
  refreshModelsButton: ButtonComponent | null;
  isRefreshingModelCatalog: boolean;
}

interface SettingsModelCatalogCoordinatorOptions {
  app: App;
  plugin: OpenCodianPlugin;
  refreshTitleModels: () => void;
  getServerState: () => {
    healthy: boolean;
    status: OpenCodeServerStatus;
  };
  setServerState: (state: {
    healthy: boolean;
    status: OpenCodeServerStatus;
  }) => void;
  getPresenter: () => SettingsModelCatalogPresenter | null;
  getRuntime: () => SettingsModelCatalogRuntimeState | null;
  isRuntimeActive: (runtime: SettingsModelCatalogRuntimeState) => boolean;
  refreshIconCacheOverview: () => Promise<void>;
  applyProviderIcon: (targetEl: HTMLElement, providerId: string, label: string) => Promise<void>;
}

export class SettingsModelCatalogCoordinator {
  constructor(private readonly options: SettingsModelCatalogCoordinatorOptions) {}
  updateCommonSummary(): void {
    const runtime = this.options.getRuntime();
    const modelCatalogPresenter = this.options.getPresenter();
    if (!runtime || !modelCatalogPresenter) return;

    if (!runtime.catalogs) {
      runtime.commonSummaryEl.setText(t('settings.model.common.summaryLoading'));
      return;
    }

    runtime.commonSummaryEl.setText(t('settings.model.common.summary', {
      providers: String(runtime.catalogs.effective.providers.length), models: String(modelCatalogPresenter.getCatalogModelCount(runtime.catalogs.effective)),
    }));
    const comparison = runtime.catalogState?.catalogComparison;
    const description = comparison
      ? describeModelCatalogComparison(comparison)
      : { text: t('settings.model.catalogComparison.loading'), className: 'is-unavailable' as const };
    runtime.catalogComparisonEl.setText(description.text);
    runtime.catalogComparisonEl.classList.remove('is-match', 'is-drift', 'is-unavailable');
    runtime.catalogComparisonEl.addClass(description.className);
    if (comparison?.status === 'drift') logger.debug('V2 model catalog shadow comparison drift', comparison);
  }
  openModelWorkspace(options?: ConstructorParameters<typeof ModelConfigModal>[2]): void {
    new ModelConfigModal(this.options.app, this.options.plugin, {
      ...options,
      onSaved: async () => {
        await this.refreshModelSettings({ forceViewReload: true });
        await this.options.refreshIconCacheOverview();
        await options?.onSaved?.();
      },
    }).open();
  }
  renderConfigCards(): void {
    const runtime = this.options.getRuntime();
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
      void this.options.applyProviderIcon(iconEl, providerId, providerName);

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
      new ModelConfigJsonModal(this.options.app, this.options.plugin).open();
    });
  }
  updateDefaultModelButton(): void {
    const runtime = this.options.getRuntime();
    if (!runtime?.defaultModelButton) {
      return;
    }

    const selected = findModelPickerOption(
      runtime.modelPickerGroups,
      this.options.plugin.settings.defaultProvider,
      this.options.plugin.settings.defaultModel,
    );
    runtime.defaultModelButton.setButtonText(
      selected
        ? `${selected.providerName} / ${selected.modelName}`
        : t('settings.model.unconfigured'),
    );
    runtime.defaultModelButton.setDisabled(runtime.modelPickerGroups.length === 0);
  }

  updateSmallModelButton(): void {
    const runtime = this.options.getRuntime();
    if (!runtime?.smallModelButton) {
      return;
    }

    const selected = findModelPickerOptionByRef(
      runtime.modelPickerGroups,
      runtime.localModelConfig?.small_model,
    );
    runtime.smallModelButton.setButtonText(
      selected
        ? `${selected.providerName} / ${selected.modelName}`
        : t('settings.model.smallModel.unconfigured'),
    );
    runtime.smallModelButton.setDisabled(runtime.modelPickerGroups.length === 0);
  }

  async applyProviderAvailabilityChange(
    providerIds: Iterable<string>,
    enabled: boolean,
  ): Promise<void> {
    const runtime = this.options.getRuntime();
    if (!runtime) {
      return;
    }

    try {
      const state = runtime.catalogState ?? await runtime.modelCatalogStateService.getCatalogState(
        this.options.plugin.settings.modelSourceMode,
        this.options.plugin.settings.disabledModelRefs,
      );
      if (!this.options.isRuntimeActive(runtime)) {
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
      await this.options.refreshIconCacheOverview();
    } catch (error) {
      logger.error('Failed to update provider availability in bulk:', error);
      new Notice(t('settings.model.toggle.saveFailed'));
      throw error;
    }
  }

  async applyModelAvailabilityChange(
    modelRefs: Iterable<string>,
    enabled: boolean,
  ): Promise<void> {
    const runtime = this.options.getRuntime();
    if (!runtime) {
      return;
    }

    const previousDisabledModelRefs = [...this.options.plugin.settings.disabledModelRefs];
    this.options.plugin.settings.disabledModelRefs = runtime.modelCatalogStateService.applyModelAvailabilityChange({
      disabledModelRefs: previousDisabledModelRefs,
      modelRefs,
      enabled,
    });
    if (this.options.plugin.settings.disabledModelRefs.join('\u0000') === previousDisabledModelRefs.join('\u0000')) {
      return;
    }

    try {
      await this.refreshModelSettings({ forceViewReload: true });
      await this.options.refreshIconCacheOverview();
    } catch (error) {
      logger.error('Failed to update model availability in bulk:', error);
      this.options.plugin.settings.disabledModelRefs = previousDisabledModelRefs;
      new Notice(t('settings.model.toggle.saveFailed'));
      throw error;
    }
  }

  openDefaultModelPicker(): void {
    const runtime = this.options.getRuntime();
    if (!runtime) {
      return;
    }

    new ModelPickerModal(this.options.app, {
      title: t('settings.model.defaultChatModel.pickerTitle'),
      description: t('settings.model.defaultChatModel.pickerDesc'),
      groups: runtime.modelPickerGroups,
      selectedRef: this.options.plugin.settings.defaultProvider && this.options.plugin.settings.defaultModel
        ? formatModelReference(this.options.plugin.settings.defaultProvider, this.options.plugin.settings.defaultModel)
        : '',
      emptySelectionLabel: t('settings.model.unconfigured'),
      onChoose: async (option) => {
        this.options.plugin.settings.defaultProvider = option?.providerId ?? '';
        this.options.plugin.settings.defaultModel = option?.modelId ?? '';
        this.updateDefaultModelButton();
        await this.options.plugin.saveSettings({
          syncConfig: false,
          reloadModels: true,
          applyUi: true,
        });
      },
    }).open();
  }

  openSmallModelPicker(): void {
    const runtime = this.options.getRuntime();
    if (!runtime) {
      return;
    }

    new ModelPickerModal(this.options.app, {
      title: t('settings.model.smallModel.pickerTitle'),
      description: t('settings.model.smallModel.pickerDesc'),
      groups: runtime.modelPickerGroups,
      selectedRef: runtime.localModelConfig?.small_model ?? '',
      emptySelectionLabel: t('settings.model.smallModel.unconfigured'),
      onChoose: async (option) => {
        const currentConfig = await runtime.modelConfigService.readLocalModelConfig();
        await runtime.modelConfigService.writeLocalModelConfig({
          ...currentConfig,
          small_model: option?.ref || undefined,
        });
        await this.refreshModelSettings({ forceViewReload: true });
        await this.options.refreshIconCacheOverview();
      },
    }).open();
  }

  renderAvailabilityManagement(): void {
    const runtime = this.options.getRuntime();
    const modelCatalogPresenter = this.options.getPresenter();
    if (!runtime || !modelCatalogPresenter) {
      return;
    }

    modelCatalogPresenter.render({
      containerEl: runtime.availabilityManagementEl,
      catalogState: runtime.catalogState,
    });
  }

  async refreshModelSettings(
    options: { showNotice?: boolean; forceViewReload?: boolean } = {},
  ): Promise<ModelCatalogState | null> {
    const runtime = this.options.getRuntime();
    if (!runtime) {
      return null;
    }

    const {
      showNotice = false,
      forceViewReload = false,
    } = options;

    try {
      const catalogState = await runtime.modelCatalogStateService.getCatalogState(
        this.options.plugin.settings.modelSourceMode,
        this.options.plugin.settings.disabledModelRefs,
      );
      if (!this.options.isRuntimeActive(runtime)) {
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
      this.updateSmallModelButton();
      this.renderAvailabilityManagement();
      this.options.refreshTitleModels();

      if (dirty || forceViewReload) {
        await this.options.plugin.saveSettings({
          syncConfig: false,
          reloadModels: true,
          applyUi: true,
        });
      }

      if (showNotice) {
        const serverDisplayCatalog = catalogState.displayCatalogs.server;
        logger.debug('Manual model refresh snapshot', {
          modelSourceMode: this.options.plugin.settings.modelSourceMode,
          vaultPath: getVaultBasePath(this.options.app) ?? null,
          disabledProviders: [...(runtime.localModelConfig?.disabled_providers ?? [])],
          enabledProviders: [...(runtime.localModelConfig?.enabled_providers ?? [])],
          disabledModelRefs: [...this.options.plugin.settings.disabledModelRefs],
          selectedDefaultProvider: this.options.plugin.settings.defaultProvider,
          selectedDefaultModel: this.options.plugin.settings.defaultModel,
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

  async handleModelSourceModeChange(mode: ModelSourceMode): Promise<void> {
    this.options.plugin.settings.modelSourceMode = mode;
    this.options.getPresenter()?.setPreferredCatalogTab(mode);
    await this.options.plugin.saveSettings({
      syncConfig: false,
      reloadModels: true,
      applyUi: true,
    });
    new Notice(t('settings.model.source.updated'));
    await this.refreshModelSettings();
    await this.options.refreshIconCacheOverview();
  }

  async handleManualModelRefresh(): Promise<void> {
    const runtime = this.options.getRuntime();
    if (!runtime) {
      return;
    }

    runtime.isRefreshingModelCatalog = true;
    this.updateModelRefreshButtonState();
    try {
      const serverState = this.options.getServerState();
      const isHealthy = serverState.healthy || await this.options.plugin.openCodeService.checkHealth();
      if (!isHealthy) {
        if (this.options.isRuntimeActive(runtime)) {
          this.options.setServerState({
            healthy: false,
            status: this.options.plugin.openCodeService.getServerStatus(),
          });
          new Notice(t('settings.model.refresh.unavailable'));
        }
        return;
      }

      await this.refreshModelSettings({ showNotice: true, forceViewReload: true });
      await this.options.refreshIconCacheOverview();
    } finally {
      if (this.options.isRuntimeActive(runtime)) {
        runtime.isRefreshingModelCatalog = false;
        this.updateModelRefreshButtonState();
      }
    }
  }

  updateModelRefreshButtonState(): void {
    const runtime = this.options.getRuntime();
    if (!runtime?.refreshModelsButton) {
      return;
    }

    const serverState = this.options.getServerState();
    const serverBusy = serverState.status === 'starting' || serverState.status === 'restarting';
    runtime.refreshModelsButton.setButtonText(
      runtime.isRefreshingModelCatalog
        ? t('settings.model.refresh.loading')
        : t('settings.model.refresh.button'),
    );
    runtime.refreshModelsButton.setDisabled(runtime.isRefreshingModelCatalog || !serverState.healthy || serverBusy);
  }

  private syncSettingsWithCatalogs(nextCatalogs: ModelCatalogBundle): boolean {
    const effectiveProviders = nextCatalogs.effective.providers;
    const effectiveProvider = effectiveProviders.find(
      (provider) => provider.id === this.options.plugin.settings.defaultProvider,
    ) ?? null;
    let dirty = false;

    if (!effectiveProvider && this.options.plugin.settings.defaultProvider !== '') {
      this.options.plugin.settings.defaultProvider = '';
      dirty = true;
    }

    const effectiveModel = effectiveProvider?.models.find(
      (model) => model.id === this.options.plugin.settings.defaultModel,
    ) ?? null;
    if ((!effectiveProvider || !effectiveModel) && this.options.plugin.settings.defaultModel !== '') {
      this.options.plugin.settings.defaultModel = '';
      dirty = true;
    }

    return dirty;
  }

  private serializeCatalog(catalog: ModelCatalog) {
    return {
      defaults: { ...catalog.defaults },
      providerCount: catalog.providers.length,
      modelCount: this.options.getPresenter()?.getCatalogModelCount(catalog) ?? 0,
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
}
