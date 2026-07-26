import { App, Modal, Notice, setIcon } from 'obsidian';

import type { ModelCatalogBundle } from '../../core/config';
import { OpencodeConfigManager } from '../../core/config/OpencodeConfigManager';
import type {
  OpencodeConfigSourceCandidate,
  OpencodeConfigSourceMutationOutcome,
} from '../../core/config/OpencodeConfigSourceService';
import type {
  OpencodeModelConfigSubset,
  OpencodeProviderConfig,
} from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger, getVaultBasePath } from '../../shared';
import { ProviderIconService } from '../../utils/icons/ProviderIconService';
import {
  createModelConfigKeyValueState,
  createModelConfigModalSnapshot,
  isBlankProviderState,
  parseAddProviderJsonDraft,
  resolveModelConfigJsonDraftValue,
  syncProviderFormFromJsonDraft,
  tryParseAddProviderJsonDraft,
} from './modelConfigModalState';
import {
  ModelConfigProviderEditor,
  type ProviderCheckState,
  type SelectedProviderEditorState,
} from './ModelConfigProviderEditor';
import {
  buildAvailabilitySubset,
  buildModelConfigSavePlan,
  type ModelConfigSavePlan,
  serializeProviderConfig,
} from './modelConfigSavePlan';
import {
  buildConfigPreview,
  createEmptyModel,
  createEmptyProvider,
  DEFAULT_PROVIDER_INTERFACE_FORMAT,
  type FetchedProviderModelCandidate,
  fetchProviderModels,
  hydrateWorkspaceState,
  isSafeProviderExtraOptionForVisualEditor,
  PROVIDER_INTERFACE_FORMAT_OPTIONS,
  type ProviderFormState,
  type ProviderInterfaceFormatId,
} from './modelConfigWorkspace';
import { OpencodeConfigModal } from './OpencodeConfigModal';
import {
  presetToFormState,
  PROVIDER_PRESETS,
  type ProviderPreset,
} from './providerPresets';
import {
  enhanceSettingsDropdowns,
  type SettingsDropdownsEnhancerHandle,
} from './SettingsDropdownControl';

const logger = createLogger('ModelConfigModal');

interface ModelConfigModalOpenOptions {
  initialProviderId?: string;
  initialView?: 'preset-selector' | 'editor';
  onSaved?: () => Promise<void> | void;
}

type SourceInventoryMode = 'legacy' | 'ready' | 'failed';
type SourceLoadFailure = 'inventory' | 'read';
type RestartFailureStage = 'stop' | 'start';

export class ModelConfigModal extends Modal {
  private modelValue = '';
  private smallModelValue = '';
  private providers: ProviderFormState[] = [];
  private selectedProviderUid: string | null = null;
  private restartToggleEl: HTMLInputElement | null = null;
  private previewEl: HTMLTextAreaElement | null = null;
  private jsonDraftValue = '';
  private initialSnapshot = '';
  private localConfigAtOpen: OpencodeModelConfigSubset = {};
  private serverConfigAtOpen: OpencodeModelConfigSubset = {};
  private initialDisabledModelRefs: string[] = [];
  private expandedModelUids = new Set<string>();
  private providerChecks = new Map<string, ProviderCheckState>();
  private fetchedModelCandidates = new Map<string, FetchedProviderModelCandidate[]>();
  private readonly providerEditor: ModelConfigProviderEditor;
  private dropdownsEnhancer: SettingsDropdownsEnhancerHandle | null = null;
  private sourceCandidates: readonly OpencodeConfigSourceCandidate[] = [];
  private selectedSource: OpencodeConfigSourceCandidate | null = null;
  private sourceLoadGeneration = 0;
  private sourceInventoryMode: SourceInventoryMode = 'legacy';
  private sourceLoadInProgress = false;
  private sourceLoadFailure: SourceLoadFailure | null = null;
  private catalogBundleAtOpen: ModelCatalogBundle | null = null;
  private runtimeCatalogUnavailable = false;
  private sourceConflict: OpencodeConfigSourceMutationOutcome | null = null;
  private lastSaveRestarted = false;
  private savePendingRestart = false;
  private savePartialPersistenceFailure = false;
  private saveRestartFailure: RestartFailureStage | null = null;

  constructor(
    app: App,
    private readonly plugin: OpenCodianPlugin,
    private readonly openOptions: ModelConfigModalOpenOptions = {},
  ) {
    super(app);
    this.providerEditor = new ModelConfigProviderEditor({
      plugin: this.plugin,
      getFlow: () => (this.isAddProviderFlow() ? 'add-provider' : 'workspace'),
      expandedModelUids: this.expandedModelUids,
      getModelValue: () => this.modelValue,
      setModelValue: (value) => {
        this.modelValue = value;
      },
      getSmallModelValue: () => this.smallModelValue,
      setSmallModelValue: (value) => {
        this.smallModelValue = value;
      },
      getProviderCheckState: (providerUid) => this.providerChecks.get(providerUid),
      getFetchedModelCandidates: (providerUid) => this.fetchedModelCandidates.get(providerUid) ?? [],
      setPreviewEl: (element) => {
        this.previewEl = element;
      },
      setRestartToggleEl: (element) => {
        this.restartToggleEl = element;
      },
      setJsonDraftValue: (value) => {
        this.jsonDraftValue = value;
      },
      updatePreview: () => {
        this.updatePreview();
      },
      rerender: () => {
        this.render();
      },
      runProviderCheck: (provider) => {
        void this.runProviderCheck(provider);
      },
      fetchModelsForProvider: (provider) => {
        void this.fetchModelsForProvider(provider);
      },
      importFetchedModels: (provider, candidates) => {
        this.importFetchedModels(provider, candidates);
      },
      deleteSelectedProvider: () => {
        this.deleteSelectedProvider();
      },
      syncProviderRawFromJsonDraft: (provider) => {
        this.syncProviderRawFromJsonDraft(provider);
      },
      formatAddProviderJson: () => {
        this.formatAddProviderJson();
      },
      openAdvancedEditor: () => this.openAdvancedEditor(),
    });
  }

  async onOpen(): Promise<void> {
    const service = this.plugin.modelConfigService;
    this.modalEl.addClass('opencodian-model-workspace-modal');
    this.contentEl.empty();
    this.catalogBundleAtOpen = null;
    this.runtimeCatalogUnavailable = false;
    this.sourceConflict = null;
    this.lastSaveRestarted = false;
    this.savePendingRestart = false;
    this.saveRestartFailure = null;
    this.sourceCandidates = [];
    this.selectedSource = null;
    this.sourceLoadGeneration = 0;
    this.sourceInventoryMode = 'legacy';
    this.sourceLoadInProgress = false;
    this.sourceLoadFailure = null;
    this.localConfigAtOpen = {};
    this.serverConfigAtOpen = {};

    if (!service) {
      this.contentEl.createEl('p', { text: t('settings.model.config.unavailable') });
      return;
    }

    if (typeof service.inventoryConfigurationSources === 'function') {
      this.sourceInventoryMode = 'ready';
      try {
        this.sourceCandidates = await service.inventoryConfigurationSources();
        const projectSources = this.sourceCandidates.filter((source) => source.scope === 'project');
        const initialSource = projectSources.find((source) => source.exists)
          ?? projectSources.find((source) => source.source === 'project-default')
          ?? null;
        if (initialSource) {
          this.sourceLoadInProgress = true;
          const generation = ++this.sourceLoadGeneration;
          await this.hydrateSelectedSource(initialSource, generation);
          if (generation === this.sourceLoadGeneration) {
            this.sourceLoadInProgress = false;
          }
        }
      } catch (error) {
        logger.error('Failed to inventory model workspace configuration sources:', error);
        this.sourceInventoryMode = 'failed';
        this.sourceCandidates = [];
        this.selectedSource = null;
        this.sourceLoadInProgress = false;
        this.sourceLoadFailure = 'inventory';
      }
    } else {
      try {
        // Compatibility for older test/downgraded runtime service shapes only.
        this.localConfigAtOpen = await service.readLocalModelConfig();
      } catch (error) {
        logger.error('Failed to load legacy model workspace configuration source:', error);
        this.localConfigAtOpen = {};
      }
    }

    try {
      const catalogs = await service.getCatalogs(
        this.plugin.settings.modelSourceMode,
        this.plugin.settings.disabledModelRefs,
      );
      this.serverConfigAtOpen = catalogs.serverConfig;
      this.catalogBundleAtOpen = catalogs;
    } catch {
      logger.error('Failed to load model workspace runtime catalog.');
      this.serverConfigAtOpen = {};
      this.catalogBundleAtOpen = null;
      this.runtimeCatalogUnavailable = true;
    }

    this.initialDisabledModelRefs = [...this.plugin.settings.disabledModelRefs];
    const hydrated = hydrateWorkspaceState(this.localConfigAtOpen, this.plugin.settings.disabledModelRefs);
    this.modelValue = hydrated.modelValue;
    this.smallModelValue = hydrated.smallModelValue;
    this.providers = hydrated.providers;
    if (this.openOptions.initialView === 'preset-selector' || this.providers.length === 0) {
      const draftProvider = createEmptyProvider(DEFAULT_PROVIDER_INTERFACE_FORMAT);
      this.ensureAddProviderDefaultExtraOptions(draftProvider);
      this.providers.push(draftProvider);
      this.selectedProviderUid = draftProvider.uid;
    } else {
      const initiallySelectedProvider = this.openOptions.initialProviderId
        ? this.providers.find((provider) => provider.id === this.openOptions.initialProviderId)
        : null;
      this.selectedProviderUid = initiallySelectedProvider?.uid ?? this.providers[0]?.uid ?? null;
    }
    this.render();
    this.initialSnapshot = this.createSnapshot();
  }

  close(): void {
    if (this.hasUnsavedChanges()) {
      const confirmed = window.confirm(t('settings.model.config.unsavedConfirm'));
      if (!confirmed) {
        return;
      }
    }

    super.close();
  }

  onClose(): void {
    this.dropdownsEnhancer?.destroy();
    this.dropdownsEnhancer = null;
    this.providerEditor.dispose();
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    this.dropdownsEnhancer?.destroy();
    this.dropdownsEnhancer = null;
    this.providerEditor.dispose();
    contentEl.empty();

    const service = this.plugin.modelConfigService;
    if (!service) {
      contentEl.createEl('p', { text: t('settings.model.config.unavailable') });
      return;
    }

    const shellEl = contentEl.createDiv({ cls: 'opencodian-model-workspace-shell' });

    const topbarEl = shellEl.createDiv({ cls: 'opencodian-model-workspace-topbar' });
    const backButton = topbarEl.createEl('button', {
      cls: 'opencodian-model-workspace-back-button',
      attr: { 'aria-label': t('settings.model.presets.back') },
    });
    backButton.type = 'button';
    setIcon(backButton, 'arrow-left');
    backButton.addEventListener('click', () => this.close());

    const headlineEl = topbarEl.createDiv({ cls: 'opencodian-model-workspace-headline' });
    headlineEl.createEl('h2', {
      text: this.isAddProviderFlow()
        ? t('settings.model.visualEditor.addProviderTitle')
        : t('settings.model.visualEditor.workspaceTitle'),
    });
    headlineEl.createEl('p', {
      cls: 'opencodian-model-workspace-intro',
      text: this.isAddProviderFlow()
        ? t('settings.model.visualEditor.addProviderIntro')
        : t('settings.model.visualEditor.workspaceIntro'),
    });
    shellEl.createEl('p', {
      cls: 'opencodian-config-path opencodian-model-workspace-path',
      text: this.selectedSource
        ? `${t('settings.model.config.path')}: ${this.selectedSource.path}`
        : `${t('settings.model.config.path')}: ${this.sourceInventoryMode === 'legacy'
          ? service.getConfigPath()
          : t('settings.model.config.source.pathUnavailable')}`,
    });
    this.renderSourceSelector(shellEl);

    if (this.isAddProviderFlow()) {
      this.renderPresetPicker(shellEl);
    }
    if (!this.isAddProviderFlow() && this.providers.length > 1) {
      this.renderProviderTabs(shellEl);
    }

    const editorEl = shellEl.createDiv({ cls: 'opencodian-model-workspace-editor' });
    this.renderEditor(editorEl);

    const footerEl = shellEl.createDiv({ cls: 'opencodian-config-buttons opencodian-model-workspace-footer' });
    const closeButton = footerEl.createEl('button', {
      text: this.isAddProviderFlow()
        ? t('settings.model.visualEditor.cancel')
        : t('settings.model.visualEditor.close'),
    });
    closeButton.type = 'button';
    closeButton.addEventListener('click', () => this.close());

    const saveButton = footerEl.createEl('button', { cls: 'mod-cta' });
    saveButton.type = 'button';
    if (this.isAddProviderFlow()) {
      const iconEl = saveButton.createSpan({ cls: 'opencodian-model-workspace-footer-button-icon' });
      setIcon(iconEl, 'plus');
      saveButton.appendText(` ${t('settings.model.visualEditor.addAction')}`);
    } else {
      saveButton.setText(t('settings.model.visualEditor.save'));
    }
    const sourceWriteBlocked = this.sourceInventoryMode !== 'legacy' && (
      this.sourceInventoryMode === 'failed'
      || this.sourceLoadInProgress
      || !this.selectedSource
      || !this.selectedSource.editable
    );
    if (sourceWriteBlocked) {
      saveButton.disabled = true;
      saveButton.setAttribute('aria-disabled', 'true');
    }
    saveButton.addEventListener('click', () => void this.save());
    this.dropdownsEnhancer = enhanceSettingsDropdowns(contentEl);
  }

  private renderPresetPicker(containerEl: HTMLElement): void {
    const panelEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-preset-panel' });
    const headerEl = panelEl.createDiv({ cls: 'opencodian-model-workspace-preset-header' });
    headerEl.createDiv({
      cls: 'opencodian-model-workspace-section-title',
      text: t('settings.model.visualEditor.templateLabel'),
    });
    headerEl.createDiv({
      cls: 'opencodian-model-workspace-section-desc',
      text: t('settings.model.visualEditor.templateHint'),
    });

    const chipRowEl = panelEl.createDiv({ cls: 'opencodian-model-workspace-preset-chip-row' });
    this.renderPresetChip(chipRowEl, t('settings.model.presets.customConfig'), () => {
      this.addProviderFromTemplate(DEFAULT_PROVIDER_INTERFACE_FORMAT);
    }, !this.getSelectedProvider()?.id.trim());
    for (const preset of PROVIDER_PRESETS) {
      this.renderPresetChip(chipRowEl, this.getPresetDisplayName(preset), () => {
        this.addProviderFromPreset(preset);
      });
    }
  }

  private renderProviderTabs(containerEl: HTMLElement): void {
    const panelEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-provider-strip' });
    const headerEl = panelEl.createDiv({ cls: 'opencodian-model-workspace-provider-strip-header' });
    headerEl.createDiv({
      cls: 'opencodian-model-workspace-section-title',
      text: t('settings.model.visualEditor.providersTitle'),
    });
    headerEl.createDiv({
      cls: 'opencodian-model-workspace-section-desc',
      text: t('settings.model.visualEditor.sidebarSummary', {
        providers: String(this.providers.length),
      }),
    });

    const listEl = panelEl.createDiv({ cls: 'opencodian-model-workspace-provider-strip-list' });
    for (const provider of this.providers) {
      const selected = provider.uid === this.selectedProviderUid;
      const itemEl = listEl.createEl('button', {
        cls: `opencodian-model-workspace-provider-tab${selected ? ' is-selected' : ''}${provider.enabled ? '' : ' is-disabled'}`,
      });
      itemEl.type = 'button';
      itemEl.addEventListener('click', () => {
        this.selectedProviderUid = provider.uid;
        this.render();
      });

      const iconEl = itemEl.createDiv({ cls: 'opencodian-model-workspace-provider-item-icon' });
      setIcon(iconEl, 'bot');
      if (provider.id.trim()) {
        void this.applyProviderIcon(iconEl, provider.id.trim(), provider.name.trim() || provider.id.trim());
      }

      const copyEl = itemEl.createDiv({ cls: 'opencodian-model-workspace-provider-tab-copy' });
      copyEl.createDiv({
        cls: 'opencodian-model-workspace-provider-item-title',
        text: provider.name.trim() || provider.id.trim() || t('settings.model.visualEditor.providerUntitled'),
      });
      copyEl.createDiv({
        cls: 'opencodian-model-workspace-provider-item-meta',
        text: this.describeProviderListMeta(provider),
      });
    }
  }

  private renderEditor(containerEl: HTMLElement): void {
    const editorState = this.getSelectedProviderEditorState();
    if (!editorState) {
      this.renderNoProviderSelectedState(containerEl);
      return;
    }

    if (editorState.flow === 'add-provider') {
      this.providerEditor.renderAddProviderEditor(containerEl, editorState);
      return;
    }

    this.providerEditor.renderWorkspaceEditor(containerEl, editorState);
  }

  private renderNoProviderSelectedState(containerEl: HTMLElement): void {
    this.previewEl = null;
    this.restartToggleEl = null;
    containerEl.createDiv({
      cls: 'opencodian-model-workspace-empty',
      text: t('settings.model.visualEditor.noProviderSelected'),
    });
  }

  private getSelectedProviderEditorState(): SelectedProviderEditorState | null {
    const provider = this.getSelectedProvider();
    if (!provider) {
      return null;
    }

    return {
      flow: this.isAddProviderFlow() ? 'add-provider' : 'workspace',
      provider,
      providerCheckState: this.providerChecks.get(provider.uid) ?? { status: 'idle' },
    };
  }

  private renderPresetChip(
    containerEl: HTMLElement,
    label: string,
    onClick: () => void,
    selected = false,
  ): void {
    const chipEl = containerEl.createEl('button', {
      cls: `opencodian-model-workspace-preset-chip${selected ? ' is-selected' : ''}`,
      text: label,
    });
    chipEl.type = 'button';
    chipEl.addEventListener('click', onClick);
  }

  private getSelectedProvider(): ProviderFormState | null {
    return this.providers.find((provider) => provider.uid === this.selectedProviderUid) ?? null;
  }

  private addProviderFromTemplate(templateId: ProviderInterfaceFormatId): void {
    const provider = createEmptyProvider(templateId);
    this.ensureAddProviderDefaultExtraOptions(provider);
    this.upsertSelectedDraftProvider(provider);
    this.updatePreview();
    this.render();
  }

  private addProviderFromPreset(preset: ProviderPreset): void {
    const provider = presetToFormState(preset);
    this.ensureAddProviderDefaultExtraOptions(provider);
    this.upsertSelectedDraftProvider(provider);
    this.updatePreview();
    this.render();
  }

  private deleteSelectedProvider(): void {
    const provider = this.getSelectedProvider();
    if (!provider) {
      return;
    }
    const index = this.providers.findIndex((entry) => entry.uid === provider.uid);
    this.providers = this.providers.filter((entry) => entry.uid !== provider.uid);
    this.providerChecks.delete(provider.uid);
    this.fetchedModelCandidates.delete(provider.uid);
    if (this.isAddProviderFlow()) {
      const draftProvider = createEmptyProvider(DEFAULT_PROVIDER_INTERFACE_FORMAT);
      this.ensureAddProviderDefaultExtraOptions(draftProvider);
      this.providers.push(draftProvider);
      this.selectedProviderUid = draftProvider.uid;
      this.jsonDraftValue = '';
    } else if (this.providers.length === 0) {
      const draftProvider = createEmptyProvider(DEFAULT_PROVIDER_INTERFACE_FORMAT);
      this.providers.push(draftProvider);
      this.selectedProviderUid = draftProvider.uid;
    } else {
      this.selectedProviderUid = this.providers[Math.min(index, this.providers.length - 1)]?.uid ?? null;
    }
    this.updatePreview();
    this.render();
  }

  private async fetchModelsForProvider(provider: ProviderFormState): Promise<void> {
    const format = PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === provider.interfaceFormat)
      ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1];
    if (!format.canFetchModels) {
      new Notice(t('settings.model.visualEditor.fetchModelsUnsupported'));
      return;
    }
    if (!provider.baseURL.trim()) {
      new Notice(t('settings.model.visualEditor.fetchModelsMissingBaseUrl'));
      return;
    }
    if (!provider.apiKey.trim()) {
      new Notice(t('settings.model.visualEditor.fetchModelsMissingApiKey'));
      return;
    }

    this.providerChecks.set(provider.uid, {
      status: 'loading',
    });
    this.render();

    try {
      const candidates = await fetchProviderModels(
        provider.interfaceFormat,
        provider.baseURL,
        provider.apiKey,
      );
      this.fetchedModelCandidates.set(provider.uid, candidates);
      this.providerChecks.set(provider.uid, {
        status: 'success',
        message: t('settings.model.visualEditor.fetchModelsSuccess', {
          count: String(candidates.length),
        }),
      });
      new Notice(t('settings.model.visualEditor.fetchModelsSuccess', {
        count: String(candidates.length),
      }));
    } catch (error) {
      logger.error('Failed to fetch provider models:', error);
      const message = error instanceof Error ? error.message : String(error);
      this.providerChecks.set(provider.uid, {
        status: 'error',
        message: t('settings.model.visualEditor.fetchModelsFailed', { message }),
      });
      new Notice(t('settings.model.visualEditor.fetchModelsFailed', { message }));
    }

    this.render();
  }

  private importFetchedModels(provider: ProviderFormState, candidates: FetchedProviderModelCandidate[]): void {
    const existingIds = new Set(provider.models.map((entry) => entry.id.trim()).filter(Boolean));
    let imported = 0;
    for (const candidate of candidates) {
      if (existingIds.has(candidate.id)) {
        continue;
      }
      provider.models.push({
        ...createEmptyModel(),
        id: candidate.id,
        name: candidate.name !== candidate.id ? candidate.name : '',
        context: candidate.context ? String(candidate.context) : '',
        output: candidate.output ? String(candidate.output) : '',
      });
      existingIds.add(candidate.id);
      imported += 1;
    }

    this.updatePreview();
    this.render();
    new Notice(t('settings.model.visualEditor.importModelsSuccess', {
      count: String(imported),
    }));
  }

  private async runProviderCheck(provider: ProviderFormState): Promise<void> {
    const providerId = provider.id.trim();
    if (!providerId || !this.plugin.modelConfigService) {
      return;
    }

    this.providerChecks.set(provider.uid, {
      status: 'loading',
    });
    this.render();

    try {
      const probe = await this.plugin.modelConfigService.testProviderAvailability(providerId);
      const nextState: ProviderCheckState = probe.status === 'available'
        ? {
          status: 'success',
          message: t('settings.model.visualEditor.testProviderSuccess', {
            providerId,
            modelId: probe.testedModelId ?? '',
          }),
        }
        : {
          status: probe.status === 'project_disabled' || probe.status === 'server_disabled' || probe.status === 'catalog_only'
            ? 'warning'
            : 'error',
          message: probe.sendTestError
            ? probe.sendTestError
            : t(`settings.model.visualEditor.testProviderStatus.${probe.status}` as never),
        };
      this.providerChecks.set(provider.uid, nextState);
    } catch (error) {
      logger.error('Failed to probe provider:', error);
      this.providerChecks.set(provider.uid, {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }

    this.render();
  }

  private describeProviderListMeta(provider: ProviderFormState): string {
    const parts: string[] = [];
    if (provider.id.trim()) {
      parts.push(provider.id.trim());
    }
    const format = PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === provider.interfaceFormat);
    if (format) {
      parts.push(t(format.labelKey as never));
    }
    parts.push(t('settings.model.visualEditor.providerModelCount', {
      count: String(provider.models.length),
    }));
    return parts.join(' · ');
  }

  private createSnapshot(): string {
    return createModelConfigModalSnapshot({
      flow: this.isAddProviderFlow() ? 'add-provider' : 'workspace',
      modelValue: this.modelValue,
      smallModelValue: this.smallModelValue,
      jsonDraftValue: resolveModelConfigJsonDraftValue(this.previewEl?.value, this.jsonDraftValue),
      providers: this.providers,
    });
  }

  private hasUnsavedChanges(): boolean {
    return this.createSnapshot() !== this.initialSnapshot;
  }

  private updatePreview(): void {
    if (!this.previewEl) {
      return;
    }

    if (this.isAddProviderFlow()) {
      const provider = this.getSelectedProvider();
      if (!provider) {
        this.previewEl.value = '';
        this.jsonDraftValue = '';
        return;
      }

      const nextValue = this.getAddProviderPreviewValue(provider);
      this.previewEl.value = nextValue;
      this.jsonDraftValue = nextValue;
      return;
    }

    try {
      const subset = buildAvailabilitySubset({
        providers: this.providers,
        localConfigAtOpen: this.localConfigAtOpen,
        serverConfigAtOpen: this.serverConfigAtOpen,
      });
      const nextValue = buildConfigPreview(
        this.modelValue,
        this.smallModelValue,
        this.providers,
        subset,
      );
      this.previewEl.value = this.maskSecretPreview(nextValue);
      this.jsonDraftValue = nextValue;
    } catch (error) {
      const nextValue = error instanceof Error ? error.message : String(error);
      this.previewEl.value = nextValue;
      this.jsonDraftValue = nextValue;
    }
  }

  private async save(): Promise<void> {
    if (!this.plugin.modelConfigService) {
      return;
    }

    try {
      const savePlan = buildModelConfigSavePlan({
        flow: this.isAddProviderFlow() ? 'add-provider' : 'workspace',
        modelValue: this.modelValue,
        smallModelValue: this.smallModelValue,
        providers: this.providers,
        selectedProvider: this.getSelectedProvider(),
        localConfigAtOpen: this.localConfigAtOpen,
        serverConfigAtOpen: this.serverConfigAtOpen,
        initialDisabledModelRefs: this.initialDisabledModelRefs,
        jsonDraftValue: this.isAddProviderFlow()
          ? resolveModelConfigJsonDraftValue(this.previewEl?.value, this.jsonDraftValue)
          : this.jsonDraftValue,
      });
      const saved = await this.applySavePlan(savePlan);
      if (!saved) return;
      await this.finalizeSavePlan(savePlan);
    } catch (error) {
      this.handleSaveFailure(error);
    }
  }

  private async applySavePlan(savePlan: ModelConfigSavePlan): Promise<boolean> {
    this.lastSaveRestarted = false;
    this.savePartialPersistenceFailure = false;
    this.saveRestartFailure = null;
    if (this.sourceInventoryMode === 'failed') {
      new Notice(t('settings.model.config.source.inventoryUnavailable'));
      return false;
    }
    if (this.sourceLoadInProgress) {
      new Notice(t('settings.model.config.source.loading'));
      return false;
    }
    if (this.sourceInventoryMode !== 'legacy' && !this.selectedSource) {
      new Notice(t('settings.model.config.source.selectBeforeSave'));
      return false;
    }
    if (this.selectedSource && !this.selectedSource.editable) {
      new Notice(t('settings.model.config.source.managedReadonly'));
      return false;
    }
    if (this.selectedSource) {
      const source = this.selectedSource;
      const outcome = await this.plugin.modelConfigService!.applyModelConfigurationSource(
        source.path,
        savePlan.nextConfig,
        source.revision,
      );
      if (outcome.result.status === 'conflict') {
        this.sourceConflict = outcome;
        this.render();
        new Notice(t('settings.model.config.source.conflictDraftRetained'));
        return false;
      }
      if (outcome.result.status !== 'success') {
        new Notice(t('settings.model.config.source.writeFailed', {
          status: outcome.result.status,
        }));
        return false;
      }
      const updatedSource: OpencodeConfigSourceCandidate = {
        ...source,
        exists: true,
        revision: outcome.result.revision ?? source.revision,
        evidence: outcome.evidence,
      };
      this.selectedSource = updatedSource;
      this.sourceCandidates = this.sourceCandidates.map((candidate) => (
        candidate.path === updatedSource.path ? updatedSource : candidate
      ));
      this.sourceConflict = null;
    } else if (this.sourceInventoryMode === 'legacy') {
      await this.plugin.modelConfigService!.writeLocalModelConfig(savePlan.nextConfig);
    } else {
      return false;
    }
    const previousDisabledModelRefs = [...this.plugin.settings.disabledModelRefs];
    this.plugin.settings.disabledModelRefs = [...savePlan.nextDisabledModelRefs];
    try {
      await this.plugin.saveSettings({
        syncConfig: false,
        reloadModels: true,
        applyUi: true,
      });
    } catch {
      this.plugin.settings.disabledModelRefs = previousDisabledModelRefs;
      this.savePartialPersistenceFailure = true;
      this.render();
      new Notice(t('settings.model.config.source.pluginSettingsSaveFailed'));
      return false;
    }
    const restartRequested = savePlan.restartServerAfterWrite && this.restartToggleEl?.checked === true;
    if (restartRequested) {
      this.lastSaveRestarted = await this.maybeRestartServer();
    }
    return true;
  }

  private async finalizeSavePlan(savePlan: ModelConfigSavePlan): Promise<void> {
    this.sourceConflict = null;
    this.savePartialPersistenceFailure = false;
    this.localConfigAtOpen = savePlan.nextConfig;
    this.initialDisabledModelRefs = [...this.plugin.settings.disabledModelRefs];
    this.initialSnapshot = this.createSnapshot();
    if (this.saveRestartFailure) {
      this.savePendingRestart = false;
      this.render();
      this.initialSnapshot = this.createSnapshot();
      new Notice(t(`settings.model.config.restartFailure.${this.saveRestartFailure}` as never));
      return;
    }
    await this.runOnSavedCallback();
    new Notice(t('settings.model.visualEditor.saveSuccess'));
    this.savePendingRestart = !this.lastSaveRestarted;
    if (this.savePendingRestart) {
      this.render();
      this.initialSnapshot = this.createSnapshot();
      new Notice(t('settings.model.config.savePendingRestart'));
      return;
    }
    this.close();
  }

  private async runOnSavedCallback(): Promise<void> {
    try {
      await this.openOptions.onSaved?.();
    } catch (error) {
      logger.error('Failed to run model workspace save callback:', error);
    }
  }

  private handleSaveFailure(error: unknown): void {
    logger.error('Failed to save visual model config:', error);
    const message = error instanceof Error ? error.message : String(error);
    new Notice(`${t('settings.model.visualEditor.saveFailed')}: ${message}`);
  }

  private async maybeRestartServer(): Promise<boolean> {
    if (!this.restartToggleEl?.checked) {
      return false;
    }

    if (this.plugin.settings.server.mode !== 'local') {
      new Notice(t('settings.server.remoteManageUnavailable'));
      return false;
    }

    const running = await this.plugin.openCodeService.checkHealth();
    if (!running) {
      return false;
    }

    try {
      await this.plugin.openCodeService.stop();
    } catch (error) {
      logger.error('Failed to stop OpenCode before model configuration restart:', error);
      this.saveRestartFailure = 'stop';
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      await this.plugin.openCodeService.start();
    } catch (error) {
      logger.error('Failed to start OpenCode after model configuration restart stop:', error);
      this.saveRestartFailure = 'start';
      return false;
    }
    new Notice(t('settings.model.config.restartSuccess'));
    return true;
  }

  private openAdvancedEditor(): void {
    if (!this.selectedSource) {
      new Notice(t('settings.model.config.source.selectBeforeAdvanced'));
      return;
    }
    const vaultPath = getVaultBasePath(this.plugin.app);
    if (!vaultPath) {
      new Notice(t('settings.model.config.source.advancedVaultUnavailable'));
      return;
    }
    new OpencodeConfigModal(
      this.app,
      new OpencodeConfigManager(vaultPath),
      { targetPath: this.selectedSource.path },
    ).open();
  }

  private ensureAddProviderDefaultExtraOptions(provider: ProviderFormState): void {
    if (!this.isAddProviderFlow()) {
      return;
    }
    if (provider.extraOptions.length > 0) {
      return;
    }
    provider.extraOptions = [
      createModelConfigKeyValueState('setCacheKey', 'true'),
    ];
  }

  private maskSecretPreview(value: string): string {
    try {
      const mask = (entry: unknown, path: readonly string[] = []): unknown => {
        if (Array.isArray(entry)) return entry.map((child) => mask(child, path));
        if (!entry || typeof entry !== 'object') return entry;
        return Object.fromEntries(Object.entries(entry as Record<string, unknown>).map(([key, child]) => [
          key,
          (path.length === 3 && path[0] === 'provider' && path[2] === 'options'
            && key !== 'baseURL'
            && !isSafeProviderExtraOptionForVisualEditor(key, child))
            || /(?:api[-_]?key|token|secret|password|credential|authorization)/i.test(key)
            ? t('settings.model.config.configuredHidden')
            : mask(child, [...path, key]),
        ]));
      };
      return JSON.stringify(mask(JSON.parse(value)), null, 2);
    } catch {
      return t('settings.model.config.configuredHidden');
    }
  }

  private async hydrateSelectedSource(
    source: OpencodeConfigSourceCandidate,
    generation: number,
  ): Promise<boolean> {
    const service = this.plugin.modelConfigService;
    if (!service) {
      return false;
    }
    try {
      const snapshot = await service.readModelConfigurationSource(source.path);
      if (generation !== this.sourceLoadGeneration) {
        return false;
      }
      if (!('subset' in snapshot)) {
        this.sourceLoadFailure = 'read';
        return false;
      }
      this.selectedSource = snapshot.source;
      this.sourceCandidates = this.sourceCandidates.map((candidate) => (
        candidate.path === snapshot.source.path ? snapshot.source : candidate
      ));
      this.localConfigAtOpen = snapshot.subset;
      this.sourceLoadFailure = null;
      return true;
    } catch (error) {
      if (generation === this.sourceLoadGeneration) {
        logger.error('Failed to load selected model workspace configuration source:', error);
        this.sourceLoadFailure = 'read';
      }
      return false;
    }
  }

  private renderSourceSelector(containerEl: HTMLElement): void {
    const section = containerEl.createDiv({ cls: 'opencodian-model-config-source-selector' });
    section.createEl('label', { text: t('settings.model.config.source.title') });
    const select = section.createEl('select', { attr: { 'aria-label': t('settings.model.config.source.title') } });
    select.disabled = this.sourceInventoryMode === 'failed';
    if (this.sourceLoadInProgress) {
      select.setAttribute('aria-busy', 'true');
    }
    select.createEl('option', {
      text: t('settings.model.config.source.selectPrompt'),
      attr: { value: '' },
    });
    for (const source of this.sourceCandidates) {
      select.createEl('option', {
        attr: { value: source.path },
        text: source.editable
          ? t('settings.model.config.source.option', {
            scope: this.localizeSourceScope(source.scope),
            source: this.localizeSourceOrigin(source.source),
            path: source.path,
          })
          : t('settings.model.config.source.optionReadonly', {
            scope: this.localizeSourceScope(source.scope),
            source: this.localizeSourceOrigin(source.source),
            path: source.path,
          }),
      });
    }
    select.value = this.selectedSource?.path ?? '';
    select.addEventListener('change', () => {
      const nextSource = this.sourceCandidates.find((source) => source.path === select.value) ?? null;
      const selectedPath = this.selectedSource?.path ?? '';
      if (nextSource?.path !== selectedPath && this.hasUnsavedChanges()) {
        select.value = selectedPath;
        new Notice(t('settings.model.config.source.dirtySwitchBlocked'));
        return;
      }
      if (!nextSource || (nextSource.path === selectedPath && !this.sourceLoadInProgress)) {
        select.value = selectedPath;
        return;
      }
      void this.switchSource(nextSource);
    });
    if (this.sourceInventoryMode === 'failed') {
      section.createEl('p', {
        cls: 'setting-item-description is-warning',
        attr: { 'data-model-config-source-inventory-unavailable': 'true' },
        text: t('settings.model.config.source.inventoryUnavailable'),
      });
    } else if (this.sourceLoadInProgress) {
      section.createEl('p', {
        cls: 'setting-item-description',
        attr: { 'data-model-config-source-loading': 'true' },
        text: t('settings.model.config.source.loading'),
      });
    } else if (this.sourceLoadFailure === 'read') {
      section.createEl('p', {
        cls: 'setting-item-description is-warning',
        attr: { 'data-model-config-source-read-failed': 'true' },
        text: t('settings.model.config.source.readFailed'),
      });
    }
    if (this.selectedSource) {
      const source = this.selectedSource;
      section.createEl('p', {
        cls: 'setting-item-description',
        text: t('settings.model.config.source.metadata', {
          scope: this.localizeSourceScope(source.scope),
          source: this.localizeSourceOrigin(source.source),
          path: source.path,
          exists: source.exists ? t('settings.model.config.source.yes') : t('settings.model.config.source.no'),
          revision: source.revision
            ? t('settings.model.config.source.revisionCaptured')
            : t('settings.model.config.source.revisionNone'),
        }),
      });
      section.createEl('p', {
        cls: 'setting-item-description',
        text: t('settings.model.config.source.evidence', {
          persistence: this.localizeSourceEvidenceStatus(source.evidence.persistence),
          application: this.localizeSourceEvidenceStatus(source.evidence.application),
          runtime: this.localizeSourceEvidenceStatus(source.evidence.runtime),
        }),
      });
      if (source.parseError) {
        section.createEl('p', {
          cls: 'setting-item-description is-warning',
          text: t('settings.model.config.source.parseError', { error: source.parseError }),
        });
      }
      if (!source.editable) {
        section.createEl('p', {
          cls: 'setting-item-description is-warning',
          text: t('settings.model.config.source.managedReadonly'),
        });
      }
      const advancedButton = section.createEl('button', {
        text: t('settings.model.config.jsonButton'),
        attr: { type: 'button', 'data-model-config-open-advanced': 'true' },
      });
      advancedButton.addEventListener('click', () => this.openAdvancedEditor());
    }
    if (this.savePendingRestart) {
      section.createEl('p', {
        cls: 'setting-item-description is-warning',
        attr: { 'data-model-config-save-pending-restart': 'true' },
        text: t('settings.model.config.savePendingRestart'),
      });
    }
    if (this.savePartialPersistenceFailure) {
      section.createEl('p', {
        cls: 'setting-item-description is-warning',
        attr: { 'data-model-config-partial-persistence': 'true' },
        text: t('settings.model.config.source.pluginSettingsSaveFailed'),
      });
    }
    if (this.saveRestartFailure) {
      section.createEl('p', {
        cls: 'setting-item-description is-warning',
        attr: { 'data-model-config-restart-failure': this.saveRestartFailure },
        text: t(`settings.model.config.restartFailure.${this.saveRestartFailure}` as never),
      });
    }
    this.renderReadonlyCatalogSummary(section);
    this.renderSourceConflictActions(section);
  }

  private renderReadonlyCatalogSummary(containerEl: HTMLElement): void {
    const catalogs = this.catalogBundleAtOpen;
    const summaryEl = containerEl.createDiv({
      cls: 'opencodian-model-config-readonly-summary',
      attr: { 'data-model-config-readonly-summary': 'true' },
    });
    summaryEl.createEl('strong', { text: t('settings.model.config.source.readonlySummaryTitle') });
    if (!catalogs) {
      if (this.runtimeCatalogUnavailable) {
        summaryEl.createEl('p', {
          cls: 'setting-item-description is-warning',
          text: t('settings.model.config.source.readonlySummaryUnavailable'),
        });
      }
      return;
    }
    const connectedProviderIds = catalogs.providerDirectory.connectedProviderIds;
    summaryEl.createEl('p', {
      text: t('settings.model.config.source.readonlySummary', {
        baseEffectiveCount: String(catalogs.baseEffective.providers.length),
        effectiveCount: String(catalogs.effective.providers.length),
        connectedProviders: connectedProviderIds.length > 0
          ? connectedProviderIds.join(', ')
          : t('settings.model.config.source.none'),
      }),
    });
    summaryEl.createEl('p', {
      cls: 'setting-item-description',
      text: t('settings.model.config.source.readonlySummaryDescription'),
    });
  }

  private renderSourceConflictActions(containerEl: HTMLElement): void {
    if (!this.sourceConflict || this.sourceConflict.targetPath !== this.selectedSource?.path) return;
    const conflictEl = containerEl.createDiv({
      cls: 'opencodian-model-config-source-conflict',
      attr: {
        'data-model-config-conflict': 'true',
        role: 'alert',
        'aria-live': 'assertive',
        'aria-atomic': 'true',
      },
    });
    conflictEl.createEl('h3', {
      text: t('settings.model.config.source.conflictTitle'),
      attr: { 'data-model-config-conflict-heading': 'true', tabindex: '-1' },
    });
    conflictEl.createEl('p', { text: t('settings.model.config.source.conflictDraftRetained') });
    const actionsEl = conflictEl.createDiv({ cls: 'opencodian-config-buttons' });
    const reloadButton = actionsEl.createEl('button', {
      text: t('settings.model.config.source.reload'),
      attr: { type: 'button', 'data-model-config-reload': 'true' },
    });
    reloadButton.disabled = this.sourceLoadInProgress;
    reloadButton.addEventListener('click', () => void this.reloadSelectedSource());
    const inspectButton = actionsEl.createEl('button', {
      text: t('settings.model.config.source.inspect'),
      attr: { type: 'button', 'data-model-config-inspect': 'true' },
    });
    inspectButton.disabled = this.sourceLoadInProgress;
    inspectButton.addEventListener('click', () => this.openAdvancedEditor());
    const retryButton = actionsEl.createEl('button', {
      text: t('settings.model.config.source.retry'),
      attr: { type: 'button', 'data-model-config-retry': 'true' },
    });
    retryButton.disabled = this.sourceLoadInProgress;
    retryButton.addEventListener('click', () => void this.retrySourceConflict());
    reloadButton.focus();
  }

  private localizeSourceEvidenceStatus(status: string): string {
    return t(`settings.model.config.source.evidence.${status}` as never);
  }

  private localizeSourceScope(scope: OpencodeConfigSourceCandidate['scope']): string {
    return t(`settings.model.config.source.scope.${scope}` as never);
  }

  private localizeSourceOrigin(source: OpencodeConfigSourceCandidate['source']): string {
    return t(`settings.model.config.source.origin.${source}` as never);
  }

  private async reloadSelectedSource(): Promise<void> {
    if (!this.selectedSource) return;
    await this.switchSource(this.selectedSource);
  }

  private async switchSource(nextSource: OpencodeConfigSourceCandidate): Promise<void> {
    const generation = ++this.sourceLoadGeneration;
    this.sourceLoadInProgress = true;
    this.sourceLoadFailure = null;
    this.render();
    const hydratedSource = await this.hydrateSelectedSource(nextSource, generation);
    if (generation !== this.sourceLoadGeneration) return;
    this.sourceLoadInProgress = false;
    if (!hydratedSource) {
      this.render();
      return;
    }
    const hydrated = hydrateWorkspaceState(this.localConfigAtOpen, this.plugin.settings.disabledModelRefs);
    this.modelValue = hydrated.modelValue;
    this.smallModelValue = hydrated.smallModelValue;
    this.providers = hydrated.providers;
    this.selectedProviderUid = this.providers[0]?.uid ?? null;
    this.sourceConflict = null;
    this.render();
    this.initialSnapshot = this.createSnapshot();
  }

  private async retrySourceConflict(): Promise<void> {
    const service = this.plugin.modelConfigService;
    const source = this.selectedSource;
    if (!service || !source || !this.sourceConflict || this.sourceConflict.targetPath !== source.path) {
      return;
    }

    const generation = ++this.sourceLoadGeneration;
    this.sourceLoadInProgress = true;
    this.sourceLoadFailure = null;
    this.render();
    try {
      const snapshot = await service.readModelConfigurationSource(source.path);
      if (generation !== this.sourceLoadGeneration) {
        return;
      }
      if (!('subset' in snapshot)) {
        this.sourceLoadFailure = 'read';
        return;
      }
      this.selectedSource = snapshot.source;
      this.sourceCandidates = this.sourceCandidates.map((candidate) => (
        candidate.path === snapshot.source.path ? snapshot.source : candidate
      ));
      this.sourceLoadInProgress = false;
      await this.save();
      if (generation === this.sourceLoadGeneration && this.sourceConflict) {
        this.render();
      }
    } catch (error) {
      if (generation === this.sourceLoadGeneration) {
        logger.error('Failed to refresh model workspace source revision before retry:', error);
        this.sourceLoadFailure = 'read';
      }
    } finally {
      if (generation === this.sourceLoadGeneration && this.sourceLoadInProgress) {
        this.sourceLoadInProgress = false;
        this.render();
      }
    }
  }

  private upsertSelectedDraftProvider(nextProvider: ProviderFormState): void {
    const selectedProvider = this.getSelectedProvider();
    if (this.isAddProviderFlow() && selectedProvider) {
      this.providers = this.providers.map((provider) => (
        provider.uid === selectedProvider.uid ? nextProvider : provider
      ));
    } else if (selectedProvider && isBlankProviderState(selectedProvider)) {
      this.providers = this.providers.map((provider) => (
        provider.uid === selectedProvider.uid ? nextProvider : provider
      ));
    } else {
      this.providers.push(nextProvider);
    }
    if (this.isAddProviderFlow()) {
      this.jsonDraftValue = '';
    }
    this.selectedProviderUid = nextProvider.uid;
  }

  private isAddProviderFlow(): boolean {
    return this.openOptions.initialView === 'preset-selector';
  }

  private getAddProviderPreviewValue(provider: ProviderFormState): string {
    const rawDraft = resolveModelConfigJsonDraftValue(this.previewEl?.value, this.jsonDraftValue).trim();
    let parsedDraft: OpencodeProviderConfig | null = null;
    try {
      parsedDraft = tryParseAddProviderJsonDraft(rawDraft);
      if (parsedDraft) {
        provider.raw = parsedDraft;
      }
    } catch {
      return rawDraft;
    }

    try {
      const providerConfig = serializeProviderConfig(provider, {
        validate: false,
        includeName: false,
      });
      return JSON.stringify(providerConfig, null, 2);
    } catch (error) {
      if (rawDraft) {
        return rawDraft;
      }
      return error instanceof Error ? error.message : String(error);
    }
  }

  private syncProviderRawFromJsonDraft(provider: ProviderFormState): void {
    try {
      const parsedDraft = tryParseAddProviderJsonDraft(this.jsonDraftValue);
      if (parsedDraft) {
        syncProviderFormFromJsonDraft(provider, parsedDraft);
      }
    } catch {
      return;
    }
  }

  private formatAddProviderJson(): void {
    try {
      const parsed = parseAddProviderJsonDraft(
        resolveModelConfigJsonDraftValue(this.previewEl?.value, this.jsonDraftValue),
      );
      const nextValue = JSON.stringify(parsed, null, 2);
      this.jsonDraftValue = nextValue;
      const provider = this.getSelectedProvider();
      if (provider) {
        syncProviderFormFromJsonDraft(provider, parsed);
      }
      if (this.previewEl) {
        this.previewEl.value = nextValue;
      }
      new Notice(t('settings.model.jsonEditor.formatSuccess'));
    } catch (error) {
      new Notice(`${t('settings.model.jsonEditor.invalidJson')}: ${(error as Error).message}`);
    }
  }

  private getPresetDisplayName(preset: ProviderPreset): string {
    return t(`settings.model.presets.provider.${preset.id}` as never) || preset.name;
  }

  private async applyProviderIcon(targetEl: HTMLElement, providerId: string, label: string): Promise<void> {
    const url = await ProviderIconService.resolveIconUrl(
      this.app,
      providerId,
      this.plugin.settings.providerIconLibrary,
    );
    targetEl.empty();
    if (!url) {
      setIcon(targetEl, 'bot');
      return;
    }
    const imgEl = document.createElement('img');
    imgEl.classList.add('opencodian-provider-icon-image');
    imgEl.src = url;
    imgEl.alt = label;
    targetEl.appendChild(imgEl);
  }
}
