import { type App, Setting } from 'obsidian';

import { ModelCatalogStateService } from '../../core/config';
import type { ModelSourceMode } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import {
  type OpenCodeServerStatus,
  SettingsModelCatalogCoordinator,
  type SettingsModelCatalogRuntimeState,
} from './SettingsModelCatalogCoordinator';
import { SettingsModelCatalogPresenter } from './SettingsModelCatalogPresenter';
import {
  SettingsModelIconCacheManager,
  type SettingsModelIconCacheRuntimeState,
} from './SettingsModelIconCacheManager';

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

interface SettingsModelSectionRuntimeState
  extends SettingsModelCatalogRuntimeState, SettingsModelIconCacheRuntimeState {}

type SettingsModelSectionActiveRuntime =
  SettingsModelCatalogRuntimeState
  | SettingsModelIconCacheRuntimeState;

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
  private readonly catalogCoordinator: SettingsModelCatalogCoordinator;
  private readonly iconCacheManager: SettingsModelIconCacheManager;
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
    this.iconCacheManager = new SettingsModelIconCacheManager({
      app: this.app,
      plugin: this.plugin,
      getRuntime: () => this.runtime,
      isRuntimeActive: (runtime) => this.isRuntimeActive(runtime),
      onProviderIconsChanged: () => {
        this.catalogCoordinator.renderConfigCards();
      },
    });
    this.catalogCoordinator = new SettingsModelCatalogCoordinator({
      app: this.app,
      plugin: this.plugin,
      refreshTitleModels: this.refreshTitleModels,
      getServerState: this.getServerState,
      setServerState: this.setServerState,
      getPresenter: () => this.modelCatalogPresenter,
      getRuntime: () => this.runtime,
      isRuntimeActive: (runtime) => this.isRuntimeActive(runtime),
      refreshIconCacheOverview: () => this.iconCacheManager.refreshIconCacheOverview(),
      applyProviderIcon: (targetEl, providerId, label) => this.iconCacheManager.applyProviderIcon(
        targetEl,
        providerId,
        label,
      ),
    });
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
    this.iconCacheManager.attachTools(toolsBodyEl);
    this.catalogCoordinator.updateCommonSummary();
    this.catalogCoordinator.updateDefaultModelButton();
    void this.iconCacheManager.refreshIconCacheOverview();
    void this.bootstrapModelSection();

    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    this.dispose();

    const modelConfigService = this.plugin.modelConfigService;

    if (!modelConfigService) {
      this.dispose();
      new Setting(containerEl)
        .setName(t('settings.model.config.unavailableTitle'))
        .setDesc(t('settings.model.config.unavailable'));
      return;
    }

    const { commonBodyEl, toolsBodyEl } = this.initializeRuntime(containerEl, modelConfigService);
    const runtime = this.runtime!;
    const configBodyEl = runtime.configBodyEl;
    const availabilityBodyEl = runtime.availabilityManagementEl.parentElement!;

    const commonWrapper = commonBodyEl.closest<HTMLElement>('.opencodian-settings-block') ?? commonBodyEl.parentElement!;
    const configWrapper = configBodyEl.closest<HTMLElement>('.opencodian-settings-block') ?? configBodyEl.parentElement!;
    const availabilityWrapper = availabilityBodyEl.closest<HTMLElement>('.opencodian-settings-block') ?? availabilityBodyEl.parentElement!;
    const toolsWrapper = toolsBodyEl.closest<HTMLElement>('.opencodian-settings-block') ?? toolsBodyEl.parentElement!;

    commonWrapper.setAttribute('data-section-block', 'common');
    configWrapper.setAttribute('data-section-block', 'project-config');
    availabilityWrapper.setAttribute('data-section-block', 'availability');
    toolsWrapper.setAttribute('data-section-block', 'tools');

    this.attachCommonSettings(commonBodyEl);
    this.iconCacheManager.attachTools(toolsBodyEl);
    this.catalogCoordinator.updateCommonSummary();
    this.catalogCoordinator.updateDefaultModelButton();

    const blocks: Record<string, HTMLElement> = {
      common: commonWrapper,
      'project-config': configWrapper,
      availability: availabilityWrapper,
      tools: toolsWrapper,
    };

    for (const [tabId, el] of Object.entries(blocks)) {
      if (tabId !== secondaryTabId) {
        el.style.display = 'none';
      }
    }

    void this.iconCacheManager.refreshIconCacheOverview();
    void this.bootstrapModelSection();
  }

  private initializeRuntime(
    containerEl: HTMLElement,
    modelConfigService: ModelConfigService,
  ): SettingsModelSectionBodies {
    const modelCatalogStateService = new ModelCatalogStateService(modelConfigService);
    const modelCatalogPresenter = this.modelCatalogPresenter ??= new SettingsModelCatalogPresenter({
      catalogStateService: modelCatalogStateService,
      applyInlineCodeText: (targetEl, text) => this.applyInlineCodeText(targetEl, text),
      applyProviderIcon: (targetEl, providerId, label) => this.iconCacheManager.applyProviderIcon(
        targetEl,
        providerId,
        label ?? providerId,
      ),
      onProviderAvailabilityChange: (providerIds, enabled) => this.catalogCoordinator.applyProviderAvailabilityChange(
        providerIds,
        enabled,
      ),
      onModelAvailabilityChange: (modelRefs, enabled) => this.catalogCoordinator.applyModelAvailabilityChange(
        modelRefs,
        enabled,
      ),
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
      availabilityManagementEl: availabilityBodyEl,
      iconCacheOverviewSetting: null,
      defaultModelButton: null,
      refreshModelsButton: null,
      refreshIconCacheButton: null,
      warmIconCacheButton: null,
      viewIconCacheButton: null,
      isRefreshingModelCatalog: false,
    };
    this.runtime.availabilityManagementEl.addClass('opencodian-model-toggle-management');

    this.setRefreshModelsCallback(() => {
      void this.catalogCoordinator.refreshModelSettings();
    });
    this.setRefreshModelCatalogStatusCallback(() => {
      this.catalogCoordinator.updateModelRefreshButtonState();
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
            this.catalogCoordinator.openDefaultModelPicker();
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
            await this.catalogCoordinator.handleModelSourceModeChange(value as ModelSourceMode);
          });
      });
    this.setSettingDescWithFormatting(modelSourceSetting, t('settings.model.source.desc'));

    new Setting(commonBodyEl)
      .setName(t('settings.model.refresh.name'))
      .setDesc(t('settings.model.refresh.desc'))
      .addButton((btn) => {
        runtime.refreshModelsButton = btn;
        this.catalogCoordinator.updateModelRefreshButtonState();
        btn
          .setButtonText(t('settings.model.refresh.button'))
          .onClick(async () => {
            await this.catalogCoordinator.handleManualModelRefresh();
          });
      });
    this.catalogCoordinator.updateModelRefreshButtonState();

    this.catalogCoordinator.renderConfigCards();
  }

  private async bootstrapModelSection(): Promise<void> {
    await this.catalogCoordinator.refreshModelSettings();
    await this.iconCacheManager.refreshIconCacheOverview();
  }

  private isRuntimeActive(runtime: SettingsModelSectionActiveRuntime): boolean {
    return this.runtime === runtime;
  }
}
