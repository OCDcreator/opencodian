import { App, Modal, Notice, setIcon } from 'obsidian';

import type {
  OpencodeModelConfigSubset,
  OpencodeProviderConfig,
} from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
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
  PROVIDER_INTERFACE_FORMAT_OPTIONS,
  type ProviderFormState,
  type ProviderInterfaceFormatId,
} from './modelConfigWorkspace';
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
    });
  }

  async onOpen(): Promise<void> {
    const service = this.plugin.modelConfigService;
    this.modalEl.addClass('opencodian-model-workspace-modal');
    this.contentEl.empty();

    if (!service) {
      this.contentEl.createEl('p', { text: t('settings.model.config.unavailable') });
      return;
    }

    try {
      this.localConfigAtOpen = await service.readLocalModelConfig();
      const catalogs = await service.getCatalogs(
        this.plugin.settings.modelSourceMode,
        this.plugin.settings.disabledModelRefs,
      );
      this.serverConfigAtOpen = catalogs.serverConfig;
    } catch (error) {
      logger.error('Failed to load model workspace config:', error);
      this.localConfigAtOpen = await service.readLocalModelConfig();
      this.serverConfigAtOpen = {};
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
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    this.dropdownsEnhancer?.destroy();
    this.dropdownsEnhancer = null;
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
      text: `${t('settings.model.config.path')}: ${service.getConfigPath()}`,
    });

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
      this.previewEl.value = nextValue;
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
        jsonDraftValue: resolveModelConfigJsonDraftValue(this.previewEl?.value, this.jsonDraftValue),
      });
      await this.applySavePlan(savePlan);
      await this.finalizeSavePlan(savePlan);
    } catch (error) {
      this.handleSaveFailure(error);
    }
  }

  private async applySavePlan(savePlan: ModelConfigSavePlan): Promise<void> {
    this.plugin.settings.disabledModelRefs = [...savePlan.nextDisabledModelRefs];
    await this.plugin.modelConfigService!.writeLocalModelConfig(savePlan.nextConfig);
    if (savePlan.restartServerAfterWrite) {
      await this.maybeRestartServer();
    }
    await this.plugin.saveSettings({
      syncConfig: false,
      reloadModels: true,
      applyUi: true,
    });
  }

  private async finalizeSavePlan(savePlan: ModelConfigSavePlan): Promise<void> {
    this.localConfigAtOpen = savePlan.nextConfig;
    this.initialDisabledModelRefs = [...this.plugin.settings.disabledModelRefs];
    this.initialSnapshot = this.createSnapshot();
    await this.runOnSavedCallback();
    new Notice(t('settings.model.visualEditor.saveSuccess'));
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

  private async maybeRestartServer(): Promise<void> {
    if (!this.restartToggleEl?.checked) {
      return;
    }

    if (this.plugin.settings.server.mode !== 'local') {
      new Notice(t('settings.server.remoteManageUnavailable'));
      return;
    }

    const running = await this.plugin.openCodeService.checkHealth();
    if (!running) {
      return;
    }

    await this.plugin.openCodeService.stop();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.plugin.openCodeService.start();
    new Notice(t('settings.model.config.restartSuccess'));
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
