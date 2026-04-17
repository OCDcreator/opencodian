import { App, Modal, Notice, setIcon } from 'obsidian';

import type {
  OpencodeModelConfigSubset,
  OpencodeProviderConfig,
} from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import { ProviderIconService } from '../../utils/icons/ProviderIconService';
import { ModelConfigJsonModal } from './ModelConfigJsonModal';
import {
  createModelConfigKeyValueState,
  createModelConfigModalSnapshot,
  isBlankProviderState,
  type ModelConfigModalFlow,
  parseAddProviderJsonDraft,
  resolveModelConfigJsonDraftValue,
  syncProviderFormFromJsonDraft,
  tryParseAddProviderJsonDraft,
} from './modelConfigModalState';
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
  type KeyValueFieldState,
  type ModelFormState,
  PROVIDER_INTERFACE_FORMAT_OPTIONS,
  type ProviderFormState,
  type ProviderInterfaceFormatId,
} from './modelConfigWorkspace';
import { ProviderIconCacheModal } from './ProviderIconCacheModal';
import {
  presetToFormState,
  PROVIDER_PRESETS,
  type ProviderPreset,
} from './providerPresets';

const logger = createLogger('ModelConfigModal');

type ProviderCheckState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; message: string }
  | { status: 'warning'; message: string }
  | { status: 'error'; message: string };

type ProviderInterfaceFormatOption = (typeof PROVIDER_INTERFACE_FORMAT_OPTIONS)[number];
type ModelKeyValueCollectionKey = 'options' | 'variants' | 'extraFields';

interface SelectedProviderEditorState {
  flow: ModelConfigModalFlow;
  provider: ProviderFormState;
  formatMeta: ProviderInterfaceFormatOption;
  providerCheckState: ProviderCheckState;
}

interface ModelConfigModalOpenOptions {
  initialProviderId?: string;
  initialView?: 'preset-selector' | 'editor';
  onSaved?: () => Promise<void> | void;
}

interface KeyValueEditorConfig {
  title: string;
  description: string;
  values: KeyValueFieldState[];
  onAdd: () => void;
  onRemove: (uid: string) => void;
  onKeyChange: (uid: string, value: string) => void;
  onValueChange: (uid: string, value: string) => void;
  showColumnHeaders?: boolean;
  stackedLabels?: boolean;
  iconRemoveButton?: boolean;
  emptyState?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

interface TextFieldConfig {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
  secret?: boolean;
}

interface SelectFieldOption {
  value: string;
  label: string;
}

interface SelectFieldConfig {
  label: string;
  value: string;
  options: SelectFieldOption[];
  onChange: (value: string) => void;
  description?: string;
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

  constructor(
    app: App,
    private readonly plugin: OpenCodianPlugin,
    private readonly openOptions: ModelConfigModalOpenOptions = {},
  ) {
    super(app);
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
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
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
      this.renderAddProviderEditor(containerEl, editorState);
      return;
    }

    this.renderWorkspaceEditor(containerEl, editorState);
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
      formatMeta: this.getProviderInterfaceFormatMeta(provider.interfaceFormat),
      providerCheckState: this.providerChecks.get(provider.uid) ?? { status: 'idle' },
    };
  }

  private renderWorkspaceEditor(
    containerEl: HTMLElement,
    editorState: SelectedProviderEditorState,
  ): void {
    const { provider } = editorState;
    this.renderProviderToolbar(containerEl, provider);
    const sectionsEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-editor-panel' });
    this.renderProviderIdentitySection(sectionsEl, provider);
    this.renderProviderConnectionSection(sectionsEl, editorState);
    this.renderProviderExtraOptionsSection(sectionsEl, provider);
    this.renderProviderModelsSection(sectionsEl, editorState);
    this.renderProviderDefaultsSection(sectionsEl);
    this.renderEditorPreviewSection(sectionsEl);
  }

  private renderProviderToolbar(containerEl: HTMLElement, provider: ProviderFormState): void {
    const toolbarEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-toolbar is-cc-switch' });
    const toolbarCopyEl = toolbarEl.createDiv({ cls: 'opencodian-model-workspace-toolbar-copy' });
    toolbarCopyEl.createDiv({
      cls: 'opencodian-model-workspace-toolbar-label',
      text: provider.name.trim() || provider.id.trim() || t('settings.model.visualEditor.providerUntitled'),
    });
    toolbarCopyEl.createDiv({
      cls: 'opencodian-model-workspace-toolbar-hint',
      text: this.describeProviderListMeta(provider),
    });

    const badgeRowEl = toolbarCopyEl.createDiv({ cls: 'opencodian-model-workspace-provider-item-badges' });
    badgeRowEl.createSpan({
      cls: `opencodian-model-workspace-status-badge ${provider.enabled ? 'is-enabled' : 'is-disabled'}`,
      text: provider.enabled
        ? t('settings.model.visualEditor.providerEnabledBadge')
        : t('settings.model.visualEditor.providerDisabledBadge'),
    });

    const actionsEl = toolbarEl.createDiv({ cls: 'opencodian-model-workspace-editor-actions' });
    const availabilityLabel = actionsEl.createEl('label', {
      cls: 'opencodian-model-workspace-toolbar-toggle',
    });
    const availabilityInput = availabilityLabel.createEl('input', { attr: { type: 'checkbox' } });
    availabilityInput.checked = provider.enabled;
    availabilityInput.addEventListener('change', () => {
      provider.enabled = availabilityInput.checked;
      this.updatePreview();
      this.render();
    });
    availabilityLabel.createSpan({
      text: t('settings.model.visualEditor.providerAvailability'),
    });

    const utilityActionsEl = actionsEl.createDiv({ cls: 'opencodian-model-workspace-editor-actions-group' });
    const providerCheckState = this.providerChecks.get(provider.uid);
    const providerTestButton = utilityActionsEl.createEl('button', {
      text: providerCheckState?.status === 'loading'
        ? t('settings.model.availability.check.loading')
        : t('settings.model.visualEditor.testProvider'),
    });
    providerTestButton.type = 'button';
    providerTestButton.disabled = providerCheckState?.status === 'loading' || !provider.id.trim();
    providerTestButton.addEventListener('click', () => {
      void this.runProviderCheck(provider);
    });

    const iconButton = utilityActionsEl.createEl('button', {
      text: t('settings.model.visualEditor.manageIcons'),
    });
    iconButton.type = 'button';
    iconButton.disabled = !provider.id.trim();
    iconButton.addEventListener('click', () => {
      new ProviderIconCacheModal(this.app, this.plugin, provider.id.trim() ? [provider.id.trim()] : [], () => {
        this.render();
      }).open();
    });

    const dangerActionsEl = actionsEl.createDiv({ cls: 'opencodian-model-workspace-editor-actions-group is-danger' });
    const deleteButton = dangerActionsEl.createEl('button', {
      cls: 'opencodian-model-workspace-danger-button',
      text: t('settings.model.visualEditor.deleteProvider'),
    });
    deleteButton.type = 'button';
    deleteButton.addEventListener('click', () => {
      this.deleteSelectedProvider();
    });
  }

  private renderProviderIdentitySection(containerEl: HTMLElement, provider: ProviderFormState): void {
    const identitySectionEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    this.createSectionHeader(
      identitySectionEl,
      t('settings.model.visualEditor.identitySectionTitle'),
      t('settings.model.visualEditor.identitySectionDesc'),
    );
    const identityGridEl = identitySectionEl.createDiv({ cls: 'opencodian-model-workspace-grid is-identity-grid' });
    const providerIdField = this.createTextField(identityGridEl, {
      label: `${t('settings.model.visualEditor.providerId')} *`,
      value: provider.id,
      onChange: (value) => {
        provider.id = value;
      },
      placeholder: 'my-provider',
      description: t('settings.model.visualEditor.providerIdDesc'),
    });
    providerIdField.addClass('is-full-span');

    const providerNameField = this.createTextField(identityGridEl, {
      label: `${t('settings.model.visualEditor.providerName')} *`,
      value: provider.name,
      onChange: (value) => {
        provider.name = value;
      },
      placeholder: 'My Provider',
    });
    providerNameField.addClass('is-full-span');
  }

  private renderProviderConnectionSection(
    containerEl: HTMLElement,
    editorState: SelectedProviderEditorState,
  ): void {
    const { provider, formatMeta, providerCheckState } = editorState;
    const connectionSectionEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    this.createSectionHeader(
      connectionSectionEl,
      t('settings.model.visualEditor.providerSectionTitle'),
      t('settings.model.visualEditor.providerSectionDesc'),
    );
    const connectionGridEl = connectionSectionEl.createDiv({ cls: 'opencodian-model-workspace-grid is-connection-grid' });
    const interfaceField = this.createSelectField(connectionGridEl, {
      label: t('settings.model.visualEditor.interfaceFormat'),
      value: provider.interfaceFormat,
      options: PROVIDER_INTERFACE_FORMAT_OPTIONS.map((entry) => ({
        value: entry.id,
        label: t(entry.labelKey as never),
      })),
      onChange: (value) => {
        const previous = this.getProviderInterfaceFormatMeta(provider.interfaceFormat);
        const next = this.getProviderInterfaceFormatMeta(value as ProviderInterfaceFormatId);
        provider.interfaceFormat = value as ProviderInterfaceFormatId;
        if (!provider.baseURL.trim() || provider.baseURL.trim() === previous.defaultBaseUrl) {
          provider.baseURL = '';
        }
        this.setProviderBaseUrlSuggestion(provider, next.defaultBaseUrl);
        this.updatePreview();
        this.render();
      },
      description: t(formatMeta.descriptionKey as never),
    });
    interfaceField.addClass('is-full-span');

    if (provider.interfaceFormat === 'custom') {
      const customNpmField = this.createTextField(connectionGridEl, {
        label: t('settings.model.visualEditor.customNpm'),
        value: provider.customNpm,
        onChange: (value) => {
          provider.customNpm = value;
        },
        placeholder: '@scope/custom-adapter',
      });
      customNpmField.addClass('is-full-span');
    }

    const baseUrlField = this.createTextField(connectionGridEl, {
      label: `${t('settings.model.visualEditor.baseURL')} *`,
      value: provider.baseURL,
      onChange: (value) => {
        provider.baseURL = value;
      },
      placeholder: formatMeta.baseUrlPlaceholder,
    });
    baseUrlField.addClass('is-full-span');
    const apiKeyField = this.createTextField(connectionGridEl, {
      label: t('settings.model.visualEditor.apiKey'),
      value: provider.apiKey,
      onChange: (value) => {
        provider.apiKey = value;
      },
      placeholder: formatMeta.apiKeyPlaceholder,
      secret: true,
    });
    apiKeyField.addClass('is-full-span');

    if (providerCheckState.status !== 'idle' && providerCheckState.status !== 'loading') {
      connectionSectionEl.createDiv({
        cls: `opencodian-model-workspace-inline-status ${this.getProviderCheckClass(providerCheckState)}`,
        text: providerCheckState.message,
      });
    }
  }

  private renderProviderExtraOptionsSection(containerEl: HTMLElement, provider: ProviderFormState): void {
    const extraOptionsSectionEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    this.renderKeyValueEditor(extraOptionsSectionEl, {
      title: t('settings.model.visualEditor.extraOptionsTitle'),
      description: t('settings.model.visualEditor.extraOptionsDesc'),
      values: provider.extraOptions,
      onAdd: () => {
        provider.extraOptions.push(createModelConfigKeyValueState());
        this.updatePreview();
        this.render();
      },
      onRemove: (uid) => {
        provider.extraOptions = provider.extraOptions.filter((entry) => entry.uid !== uid);
        this.updatePreview();
        this.render();
      },
      onKeyChange: (uid, value) => {
        const field = provider.extraOptions.find((entry) => entry.uid === uid);
        if (!field) {
          return;
        }
        field.key = value;
        this.updatePreview();
      },
      onValueChange: (uid, value) => {
        const field = provider.extraOptions.find((entry) => entry.uid === uid);
        if (!field) {
          return;
        }
        field.value = value;
        this.updatePreview();
      },
      stackedLabels: true,
    });
  }

  private renderProviderModelsSection(
    containerEl: HTMLElement,
    editorState: SelectedProviderEditorState,
  ): void {
    const { provider, formatMeta } = editorState;
    const modelsSectionEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-section' });
    this.createSectionHeader(
      modelsSectionEl,
      t('settings.model.visualEditor.modelsTitle'),
      t('settings.model.visualEditor.modelsDesc'),
    );
    const modelControlsEl = modelsSectionEl.createDiv({ cls: 'opencodian-model-workspace-model-controls' });
    const modelControlsCopyEl = modelControlsEl.createDiv({ cls: 'opencodian-model-workspace-model-controls-copy' });
    modelControlsCopyEl.createDiv({
      cls: 'opencodian-model-workspace-model-hint',
      text: t('settings.model.visualEditor.modelToggleHint'),
    });
    const modelButtonsEl = modelControlsEl.createDiv({ cls: 'opencodian-model-workspace-model-control-buttons' });
    const fetchButton = modelButtonsEl.createEl('button', {
      text: t('settings.model.visualEditor.fetchModels'),
    });
    fetchButton.type = 'button';
    fetchButton.disabled = !formatMeta.canFetchModels;
    fetchButton.addEventListener('click', () => {
      void this.fetchModelsForProvider(provider);
    });

    const addModelButton = modelButtonsEl.createEl('button', {
      cls: 'mod-cta',
      text: t('settings.model.visualEditor.addModel'),
    });
    addModelButton.type = 'button';
    addModelButton.addEventListener('click', () => {
      provider.models.push(createEmptyModel());
      this.updatePreview();
      this.render();
    });

    this.renderFetchedModelCandidates(modelsSectionEl, provider);

    if (provider.models.length === 0) {
      modelsSectionEl.createDiv({
        cls: 'opencodian-model-workspace-empty',
        text: t('settings.model.visualEditor.noModels'),
      });
      return;
    }

    const modelsListEl = modelsSectionEl.createDiv({ cls: 'opencodian-model-workspace-model-list' });
    for (const model of provider.models) {
      this.renderModelCard(modelsListEl, provider, model);
    }
  }

  private renderFetchedModelCandidates(containerEl: HTMLElement, provider: ProviderFormState): void {
    const fetchedCandidates = this.fetchedModelCandidates.get(provider.uid) ?? [];
    if (fetchedCandidates.length === 0) {
      return;
    }

    const importPanelEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-import-panel is-inline' });
    const importHeaderEl = importPanelEl.createDiv({ cls: 'opencodian-model-workspace-import-header' });
    importHeaderEl.createDiv({
      cls: 'opencodian-model-workspace-import-title',
      text: t('settings.model.visualEditor.fetchResultTitle', {
        count: String(fetchedCandidates.length),
      }),
    });
    const importButton = importHeaderEl.createEl('button', {
      cls: 'mod-cta',
      text: t('settings.model.visualEditor.importMissingModels'),
    });
    importButton.type = 'button';
    importButton.addEventListener('click', () => {
      this.importFetchedModels(provider, fetchedCandidates);
    });
    const importListEl = importPanelEl.createDiv({ cls: 'opencodian-model-workspace-import-list' });
    for (const candidate of fetchedCandidates.slice(0, 12)) {
      importListEl.createDiv({
        cls: 'opencodian-model-workspace-import-item',
        text: candidate.name && candidate.name !== candidate.id
          ? `${candidate.name} · ${candidate.id}`
          : candidate.id,
      });
    }
  }

  private renderProviderDefaultsSection(containerEl: HTMLElement): void {
    const defaultsSectionEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-section' });
    this.createSectionHeader(
      defaultsSectionEl,
      t('settings.model.visualEditor.defaultsTitle'),
      t('settings.model.visualEditor.defaultsDesc'),
    );
    const defaultsGridEl = defaultsSectionEl.createDiv({ cls: 'opencodian-model-workspace-grid' });
    this.createTextField(defaultsGridEl, {
      label: t('settings.model.visualEditor.defaultModel'),
      value: this.modelValue,
      onChange: (value) => {
        this.modelValue = value;
      },
      placeholder: 'provider/model',
      description: t('settings.model.visualEditor.defaultModelDesc'),
    });
    this.createTextField(defaultsGridEl, {
      label: t('settings.model.visualEditor.smallModel'),
      value: this.smallModelValue,
      onChange: (value) => {
        this.smallModelValue = value;
      },
      placeholder: 'provider/model',
      description: t('settings.model.visualEditor.smallModelDesc'),
    });
  }

  private renderEditorPreviewSection(containerEl: HTMLElement): void {
    const previewSectionEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-section' });
    this.createSectionHeader(
      previewSectionEl,
      t('settings.model.visualEditor.previewTitle'),
      t('settings.model.visualEditor.previewDesc'),
    );

    const previewToolbarEl = previewSectionEl.createDiv({ cls: 'opencodian-model-workspace-preview-toolbar' });
    const jsonButton = previewToolbarEl.createEl('button', { text: t('settings.model.config.jsonButton') });
    jsonButton.type = 'button';
    jsonButton.addEventListener('click', () => {
      new ModelConfigJsonModal(this.app, this.plugin).open();
    });

    const restartLabel = previewToolbarEl.createEl('label', {
      cls: 'opencodian-model-config-checkbox opencodian-model-workspace-restart-toggle',
    });
    this.restartToggleEl = restartLabel.createEl('input', { attr: { type: 'checkbox' } });
    this.restartToggleEl.checked = this.plugin.settings.server.mode === 'local';
    restartLabel.createSpan({ text: t('settings.model.config.restart') });

    this.previewEl = previewSectionEl.createEl('textarea', {
      cls: 'opencodian-config-editor opencodian-model-config-json-editor',
      attr: {
        readonly: 'true',
        spellcheck: 'false',
      },
    });
    this.updatePreview();
  }

  private getProviderInterfaceFormatMeta(value: ProviderInterfaceFormatId): ProviderInterfaceFormatOption {
    return PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === value)
      ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1];
  }

  private renderAddProviderEditor(
    containerEl: HTMLElement,
    editorState: SelectedProviderEditorState,
  ): void {
    const { provider, formatMeta } = editorState;
    containerEl.addClass('is-add-provider-flow');

    const sectionsEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-editor-panel is-add-provider-flow' });

    const identitySectionEl = sectionsEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    const identityGridEl = identitySectionEl.createDiv({ cls: 'opencodian-model-workspace-grid is-identity-grid' });
    const providerIdField = this.createTextField(identityGridEl, {
      label: `${t('settings.model.visualEditor.providerId')} *`,
      value: provider.id,
      onChange: (value) => {
        provider.id = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      },
      placeholder: 'my-provider',
      description: t('settings.model.visualEditor.providerIdDesc'),
    });
    providerIdField.addClass('is-full-span');

    const providerNameField = this.createTextField(identityGridEl, {
      label: `${t('settings.model.visualEditor.providerName')} *`,
      value: provider.name,
      onChange: (value) => {
        provider.name = value;
      },
      placeholder: t('settings.model.visualEditor.providerNamePlaceholder'),
    });
    providerNameField.addClass('is-full-span');

    const connectionSectionEl = sectionsEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    const connectionGridEl = connectionSectionEl.createDiv({ cls: 'opencodian-model-workspace-grid is-connection-grid' });
    const interfaceField = this.createSelectField(connectionGridEl, {
      label: t('settings.model.visualEditor.interfaceFormat'),
      value: provider.interfaceFormat,
      options: PROVIDER_INTERFACE_FORMAT_OPTIONS.map((entry) => ({
        value: entry.id,
        label: t(entry.labelKey as never),
      })),
      onChange: (value) => {
        const previous = this.getProviderInterfaceFormatMeta(provider.interfaceFormat);
        const next = this.getProviderInterfaceFormatMeta(value as ProviderInterfaceFormatId);
        provider.interfaceFormat = value as ProviderInterfaceFormatId;
        if (!provider.baseURL.trim() || provider.baseURL.trim() === previous.defaultBaseUrl) {
          provider.baseURL = '';
        }
        this.setProviderBaseUrlSuggestion(provider, next.defaultBaseUrl);
        this.updatePreview();
        this.render();
      },
      description: t(formatMeta.descriptionKey as never),
    });
    interfaceField.addClass('is-full-span');

    if (provider.interfaceFormat === 'custom') {
      const customNpmField = this.createTextField(connectionGridEl, {
        label: t('settings.model.visualEditor.customNpm'),
        value: provider.customNpm,
        onChange: (value) => {
          provider.customNpm = value;
        },
        placeholder: '@scope/custom-adapter',
      });
      customNpmField.addClass('is-full-span');
    }

    const baseUrlPlaceholder = this.getProviderBaseUrlPlaceholder(provider, formatMeta.baseUrlPlaceholder);
    const apiKeyField = this.createTextField(connectionGridEl, {
      label: t('settings.model.visualEditor.apiKey'),
      value: provider.apiKey,
      onChange: (value) => {
        provider.apiKey = value;
      },
      placeholder: formatMeta.apiKeyPlaceholder || t('settings.model.visualEditor.apiKeyPlaceholder'),
      description: t('settings.model.visualEditor.apiKeyAutoFill'),
      secret: true,
    });
    apiKeyField.addClass('is-full-span');

    const baseUrlField = this.createTextField(connectionGridEl, {
      label: `${t('settings.model.visualEditor.baseURL')} *`,
      value: provider.baseURL,
      onChange: (value) => {
        provider.baseURL = value;
      },
      placeholder: baseUrlPlaceholder,
    });
    baseUrlField.addClass('is-full-span');

    const extraOptionsSectionEl = sectionsEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    this.renderKeyValueEditor(extraOptionsSectionEl, {
      title: t('settings.model.visualEditor.extraOptionsTitle'),
      description: t('settings.model.visualEditor.addProviderExtraOptionsDesc'),
      values: provider.extraOptions,
      onAdd: () => {
        provider.extraOptions.push(createModelConfigKeyValueState());
        this.updatePreview();
        this.render();
      },
      onRemove: (uid) => {
        provider.extraOptions = provider.extraOptions.filter((entry) => entry.uid !== uid);
        this.updatePreview();
        this.render();
      },
      onKeyChange: (uid, value) => {
        const field = provider.extraOptions.find((entry) => entry.uid === uid);
        if (!field) {
          return;
        }
        field.key = value;
        this.updatePreview();
      },
      onValueChange: (uid, value) => {
        const field = provider.extraOptions.find((entry) => entry.uid === uid);
        if (!field) {
          return;
        }
        field.value = value;
        this.updatePreview();
      },
      stackedLabels: true,
      iconRemoveButton: true,
    });

    const modelsSectionEl = sectionsEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    const modelHeaderEl = modelsSectionEl.createDiv({ cls: 'opencodian-model-workspace-section-header is-with-actions' });
    const modelHeaderCopyEl = modelHeaderEl.createDiv({ cls: 'opencodian-model-workspace-section-copy' });
    modelHeaderCopyEl.createDiv({
      cls: 'opencodian-model-workspace-section-title',
      text: t('settings.model.visualEditor.modelsTitle'),
    });
    modelHeaderCopyEl.createDiv({
      cls: 'opencodian-model-workspace-section-desc',
      text: t('settings.model.visualEditor.addProviderModelsDesc'),
    });
    const modelControlsEl = modelHeaderEl.createDiv({ cls: 'opencodian-model-workspace-model-controls' });
    const modelButtonsEl = modelControlsEl.createDiv({ cls: 'opencodian-model-workspace-model-control-buttons' });
    const fetchButton = modelButtonsEl.createEl('button', {
      text: t('settings.model.visualEditor.fetchModels'),
    });
    fetchButton.type = 'button';
    fetchButton.disabled = !formatMeta.canFetchModels;
    fetchButton.addEventListener('click', () => {
      void this.fetchModelsForProvider(provider);
    });

    const addModelButton = modelButtonsEl.createEl('button', {
      text: t('settings.model.visualEditor.addModel'),
    });
    addModelButton.type = 'button';
    addModelButton.addEventListener('click', () => {
      provider.models.push(createEmptyModel());
      this.updatePreview();
      this.render();
    });

    if (provider.models.length === 0) {
      modelsSectionEl.createDiv({
        cls: 'opencodian-model-workspace-empty is-prominent',
        text: t('settings.model.visualEditor.noModels'),
      });
    } else {
      const headerRowEl = modelsSectionEl.createDiv({ cls: 'opencodian-model-workspace-list-header' });
      headerRowEl.createSpan({ text: '' });
      headerRowEl.createSpan({ text: t('settings.model.visualEditor.modelId') });
      headerRowEl.createSpan({ text: t('settings.model.visualEditor.modelName') });
      headerRowEl.createSpan({ text: '' });

      const modelsListEl = modelsSectionEl.createDiv({ cls: 'opencodian-model-workspace-model-list' });
      for (const model of provider.models) {
        this.renderModelCard(modelsListEl, provider, model);
      }
    }

    const previewSectionEl = sectionsEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    this.createSectionHeader(
      previewSectionEl,
      t('settings.model.visualEditor.addProviderPreviewTitle'),
      t('settings.model.visualEditor.addProviderPreviewDesc'),
    );
    this.previewEl = previewSectionEl.createEl('textarea', {
      cls: 'opencodian-config-editor opencodian-model-config-json-editor is-add-provider-flow',
      attr: {
        spellcheck: 'false',
      },
    });
    this.previewEl.addEventListener('input', () => {
      this.jsonDraftValue = this.previewEl?.value ?? '';
      this.syncProviderRawFromJsonDraft(provider);
    });

    const previewActionsEl = previewSectionEl.createDiv({ cls: 'opencodian-model-workspace-json-actions' });
    const formatButton = previewActionsEl.createEl('button', {
      text: t('settings.model.jsonEditor.format'),
    });
    formatButton.type = 'button';
    formatButton.addEventListener('click', () => this.formatAddProviderJson());

    this.updatePreview();
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

  private renderModelCard(containerEl: HTMLElement, provider: ProviderFormState, model: ModelFormState): void {
    const expanded = this.expandedModelUids.has(model.uid);
    const modelEl = containerEl.createDiv({ cls: `opencodian-model-workspace-model-card${model.enabled ? '' : ' is-disabled'}` });
    const headerEl = modelEl.createDiv({ cls: 'opencodian-model-workspace-model-header' });
    this.renderModelCardHeader(headerEl, provider, model, expanded);
    if (!expanded) {
      return;
    }

    this.renderExpandedModelCardDetails(modelEl, model);
  }

  private renderModelCardHeader(
    headerEl: HTMLElement,
    provider: ProviderFormState,
    model: ModelFormState,
    expanded: boolean,
  ): void {
    const expandButton = headerEl.createEl('button', { cls: 'opencodian-model-workspace-model-expand' });
    expandButton.type = 'button';
    setIcon(expandButton, expanded ? 'chevron-down' : 'chevron-right');
    expandButton.addEventListener('click', () => {
      if (expanded) {
        this.expandedModelUids.delete(model.uid);
      } else {
        this.expandedModelUids.add(model.uid);
      }
      this.render();
    });

    const rowEl = this.isAddProviderFlow()
      ? headerEl
      : headerEl.createDiv({ cls: 'opencodian-model-workspace-model-header-fields is-compact' });
    const modelIdInput = rowEl.createEl('input', {
      cls: 'opencodian-model-workspace-model-input',
      attr: {
        type: 'text',
        placeholder: t('settings.model.visualEditor.modelId'),
        'aria-label': t('settings.model.visualEditor.modelId'),
      },
    });
    this.bindEditableControl(modelIdInput);
    modelIdInput.value = model.id;
    modelIdInput.addEventListener('input', () => {
      model.id = modelIdInput.value;
      this.updatePreview();
    });

    const modelNameInput = rowEl.createEl('input', {
      cls: 'opencodian-model-workspace-model-input',
      attr: {
        type: 'text',
        placeholder: t('settings.model.visualEditor.modelName'),
        'aria-label': t('settings.model.visualEditor.modelName'),
      },
    });
    this.bindEditableControl(modelNameInput);
    modelNameInput.value = model.name;
    modelNameInput.addEventListener('input', () => {
      model.name = modelNameInput.value;
      this.updatePreview();
    });

    if (!this.isAddProviderFlow()) {
      const modelToggleWrap = headerEl.createDiv({ cls: 'opencodian-model-workspace-model-toggle' });
      const modelToggle = modelToggleWrap.createEl('input', { attr: { type: 'checkbox' } });
      modelToggle.checked = model.enabled;
      modelToggle.addEventListener('change', () => {
        model.enabled = modelToggle.checked;
        this.updatePreview();
        this.render();
      });
      modelToggleWrap.createSpan({
        text: model.enabled
          ? t('settings.model.visualEditor.modelEnabledBadge')
          : t('settings.model.visualEditor.modelDisabledBadge'),
      });
    }

    const deleteButton = headerEl.createEl('button', {
      cls: `opencodian-model-workspace-danger-button${this.isAddProviderFlow() ? ' is-icon-only' : ''}`,
      text: this.isAddProviderFlow() ? '' : t('settings.model.visualEditor.deleteModel'),
      attr: this.isAddProviderFlow()
        ? { 'aria-label': t('settings.model.visualEditor.deleteModel') }
        : undefined,
    });
    deleteButton.type = 'button';
    if (this.isAddProviderFlow()) {
      setIcon(deleteButton, 'trash-2');
    }
    deleteButton.addEventListener('click', () => {
      provider.models = provider.models.filter((entry) => entry.uid !== model.uid);
      this.expandedModelUids.delete(model.uid);
      this.updatePreview();
      this.render();
    });
  }

  private renderExpandedModelCardDetails(modelEl: HTMLElement, model: ModelFormState): void {
    const detailsEl = modelEl.createDiv({ cls: 'opencodian-model-workspace-model-details' });
    const limitsSectionEl = detailsEl.createDiv({
      cls: 'opencodian-model-workspace-subsection opencodian-model-workspace-model-limit-section',
    });
    this.createSubsectionHeader(
      limitsSectionEl,
      t('settings.model.visualEditor.modelLimitsTitle'),
      t('settings.model.visualEditor.modelLimitsDesc'),
    );
    const limitsGridEl = limitsSectionEl.createDiv({ cls: 'opencodian-model-workspace-grid is-model-limits-grid' });
    this.createTextField(limitsGridEl, {
      label: t('settings.model.visualEditor.contextLimit'),
      value: model.context,
      onChange: (value) => {
        model.context = value;
      },
      placeholder: '200000',
      description: t('settings.model.visualEditor.contextLimitDesc'),
    });
    this.createTextField(limitsGridEl, {
      label: t('settings.model.visualEditor.outputLimit'),
      value: model.output,
      onChange: (value) => {
        model.output = value;
      },
      placeholder: '65536',
      description: t('settings.model.visualEditor.outputLimitDesc'),
    });

    this.renderModelCollectionEditor(detailsEl, model, 'options', {
      title: t('settings.model.visualEditor.modelOptionsTitle'),
      description: t('settings.model.visualEditor.modelOptionsDesc'),
      emptyState: t('settings.model.visualEditor.modelOptionsEmpty'),
      keyPlaceholder: t('settings.model.visualEditor.modelOptionsKeyPlaceholder'),
      valuePlaceholder: t('settings.model.visualEditor.modelOptionsValuePlaceholder'),
    });

    this.renderModelCollectionEditor(detailsEl, model, 'variants', {
      title: t('settings.model.visualEditor.modelVariantsTitle'),
      description: t('settings.model.visualEditor.modelVariantsDesc'),
      emptyState: t('settings.model.visualEditor.modelVariantsEmpty'),
      keyPlaceholder: t('settings.model.visualEditor.modelVariantsKeyPlaceholder'),
      valuePlaceholder: t('settings.model.visualEditor.modelVariantsValuePlaceholder'),
    });

    this.renderModelCollectionEditor(detailsEl, model, 'extraFields', {
      title: t('settings.model.visualEditor.modelExtraFieldsTitle'),
      description: t('settings.model.visualEditor.modelExtraFieldsDesc'),
      emptyState: t('settings.model.visualEditor.modelAdvancedFieldsEmpty'),
      keyPlaceholder: t('settings.model.visualEditor.modelAdvancedFieldsKeyPlaceholder'),
      valuePlaceholder: t('settings.model.visualEditor.modelAdvancedFieldsValuePlaceholder'),
    });
  }

  private renderModelCollectionEditor(
    containerEl: HTMLElement,
    model: ModelFormState,
    field: ModelKeyValueCollectionKey,
    {
      title,
      description,
      emptyState,
      keyPlaceholder,
      valuePlaceholder,
    }: Pick<KeyValueEditorConfig, 'title' | 'description' | 'emptyState' | 'keyPlaceholder' | 'valuePlaceholder'>,
  ): void {
    this.renderKeyValueEditor(containerEl, {
      title,
      description,
      values: model[field],
      onAdd: () => {
        model[field].push(createModelConfigKeyValueState());
        this.updatePreview();
        this.render();
      },
      onRemove: (uid) => {
        model[field] = model[field].filter((entry) => entry.uid !== uid);
        this.updatePreview();
        this.render();
      },
      onKeyChange: (uid, value) => {
        const target = model[field].find((entry) => entry.uid === uid);
        if (!target) {
          return;
        }
        target.key = value;
        this.updatePreview();
      },
      onValueChange: (uid, value) => {
        const target = model[field].find((entry) => entry.uid === uid);
        if (!target) {
          return;
        }
        target.value = value;
        this.updatePreview();
      },
      emptyState,
      keyPlaceholder,
      valuePlaceholder,
    });
  }

  private renderKeyValueEditor(
    containerEl: HTMLElement,
    {
      title,
      description,
      values,
      onAdd,
      onRemove,
      onKeyChange,
      onValueChange,
      showColumnHeaders = false,
      stackedLabels = false,
      iconRemoveButton = true,
      emptyState,
      keyPlaceholder,
      valuePlaceholder,
    }: KeyValueEditorConfig,
  ): void {
    const sectionEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-subsection' });
    const headerEl = this.createSubsectionHeader(sectionEl, title, description);
    const addButton = headerEl.createEl('button', {
      text: t('settings.model.visualEditor.addField'),
    });
    addButton.type = 'button';
    addButton.addEventListener('click', onAdd);

    if (values.length === 0) {
      sectionEl.createDiv({
        cls: 'opencodian-model-workspace-empty small',
        text: emptyState ?? t('settings.model.visualEditor.noExtraFields'),
      });
      return;
    }

    const listEl = sectionEl.createDiv({ cls: 'opencodian-model-workspace-keyvalue-list' });
    if (showColumnHeaders) {
      const headerRowEl = listEl.createDiv({ cls: 'opencodian-model-workspace-list-header is-keyvalue' });
      headerRowEl.createSpan({ text: t('settings.model.visualEditor.fieldKeyLabel') });
      headerRowEl.createSpan({ text: t('settings.model.visualEditor.fieldValueLabel') });
      headerRowEl.createSpan({ text: '' });
    }
    for (const field of values) {
      const rowEl = listEl.createDiv({
        cls: `opencodian-model-workspace-keyvalue-row${stackedLabels ? ' is-stacked-labels' : ''}`,
      });
      const keyFieldEl = stackedLabels
        ? rowEl.createDiv({ cls: 'opencodian-model-workspace-keyvalue-cell' })
        : rowEl;
      if (stackedLabels) {
        keyFieldEl.createDiv({
          cls: 'opencodian-model-workspace-keyvalue-cell-label',
          text: t('settings.model.visualEditor.fieldKeyLabel'),
        });
      }
      const keyInput = keyFieldEl.createEl('input', {
        cls: 'opencodian-model-workspace-keyvalue-input',
        attr: {
          type: 'text',
          placeholder: keyPlaceholder ?? t('settings.model.visualEditor.fieldKeyPlaceholder'),
        },
      });
      this.bindEditableControl(keyInput);
      keyInput.value = field.key;
      keyInput.addEventListener('input', () => {
        onKeyChange(field.uid, keyInput.value);
      });
      const valueFieldEl = stackedLabels
        ? rowEl.createDiv({ cls: 'opencodian-model-workspace-keyvalue-cell' })
        : rowEl;
      if (stackedLabels) {
        valueFieldEl.createDiv({
          cls: 'opencodian-model-workspace-keyvalue-cell-label',
          text: t('settings.model.visualEditor.fieldValueLabel'),
        });
      }
      const valueInput = valueFieldEl.createEl('textarea', {
        cls: 'opencodian-model-workspace-keyvalue-textarea',
        attr: {
          rows: '2',
          placeholder: valuePlaceholder ?? t('settings.model.visualEditor.fieldValuePlaceholder'),
        },
      });
      this.bindEditableControl(valueInput);
      valueInput.value = field.value;
      valueInput.addEventListener('input', () => {
        onValueChange(field.uid, valueInput.value);
      });
      const removeButton = rowEl.createEl('button', {
        cls: `opencodian-model-workspace-danger-button${iconRemoveButton ? ' is-icon-only' : ''}`,
        text: iconRemoveButton ? '' : t('settings.model.visualEditor.removeField'),
        attr: iconRemoveButton
          ? { 'aria-label': t('settings.model.visualEditor.removeField') }
          : undefined,
      });
      removeButton.type = 'button';
      if (iconRemoveButton) {
        setIcon(removeButton, 'trash-2');
      }
      removeButton.addEventListener('click', () => onRemove(field.uid));
    }
  }

  private createTextField(
    containerEl: HTMLElement,
    {
      label,
      value,
      onChange,
      placeholder = '',
      description,
      secret = false,
    }: TextFieldConfig,
  ): HTMLElement {
    const fieldEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-field' });
    fieldEl.createEl('label', { text: label });
    const inputEl = fieldEl.createEl('input', { attr: { type: secret ? 'password' : 'text' } });
    this.bindEditableControl(inputEl);
    inputEl.value = value;
    inputEl.placeholder = placeholder;
    inputEl.addEventListener('input', () => {
      onChange(inputEl.value);
      this.updatePreview();
    });
    if (description) {
      fieldEl.createDiv({
        cls: 'opencodian-model-workspace-field-description',
        text: description,
      });
    }
    return fieldEl;
  }

  private createSubsectionHeader(containerEl: HTMLElement, title: string, description: string): HTMLDivElement {
    const headerEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-subsection-header' });
    const copyEl = headerEl.createDiv({ cls: 'opencodian-model-workspace-subsection-copy' });
    copyEl.createDiv({
      cls: 'opencodian-model-workspace-subsection-title',
      text: title,
    });
    copyEl.createDiv({
      cls: 'opencodian-model-workspace-subsection-desc',
      text: description,
    });
    return headerEl;
  }

  private createSelectField(
    containerEl: HTMLElement,
    {
      label,
      value,
      options,
      onChange,
      description,
    }: SelectFieldConfig,
  ): HTMLElement {
    const fieldEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-field' });
    fieldEl.createEl('label', { text: label });
    const selectEl = fieldEl.createEl('select');
    this.bindEditableControl(selectEl);
    for (const option of options) {
      const optionEl = selectEl.createEl('option', { text: option.label });
      optionEl.value = option.value;
    }
    selectEl.value = value;
    selectEl.addEventListener('change', () => {
      onChange(selectEl.value);
      this.updatePreview();
    });
    if (description) {
      fieldEl.createDiv({
        cls: 'opencodian-model-workspace-field-description',
        text: description,
      });
    }
    return fieldEl;
  }

  private createSectionHeader(containerEl: HTMLElement, title: string, description: string): void {
    const headerEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-section-header' });
    headerEl.createDiv({
      cls: 'opencodian-model-workspace-section-title',
      text: title,
    });
    headerEl.createDiv({
      cls: 'opencodian-model-workspace-section-desc',
      text: description,
    });
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

  private getProviderBaseUrlPlaceholder(provider: ProviderFormState, fallback: string): string {
    const rawOptions = provider.raw.options;
    const rawBaseUrl = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
      ? rawOptions.baseURL
      : undefined;
    return typeof rawBaseUrl === 'string' && rawBaseUrl.trim()
      ? rawBaseUrl
      : fallback;
  }

  private setProviderBaseUrlSuggestion(provider: ProviderFormState, baseURL: string): void {
    const rawOptions = provider.raw.options;
    const nextOptions = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
      ? { ...rawOptions }
      : {};
    if (baseURL.trim()) {
      nextOptions.baseURL = baseURL;
    } else {
      delete nextOptions.baseURL;
    }
    provider.raw = {
      ...provider.raw,
      options: nextOptions,
    };
  }

  private bindEditableControl(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void {
    element.addEventListener('keydown', (event) => {
      event.stopPropagation();
    });
    element.addEventListener('mousedown', (event) => {
      event.stopPropagation();
    });
    element.addEventListener('click', (event) => {
      event.stopPropagation();
    });
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

  private getProviderCheckClass(state: ProviderCheckState): string {
    switch (state.status) {
      case 'success':
        return 'is-success';
      case 'warning':
        return 'is-warning';
      case 'error':
        return 'is-error';
      case 'loading':
        return 'is-loading';
      default:
        return '';
    }
  }

  private getPresetDisplayName(preset: ProviderPreset): string {
    return t(`settings.model.presets.provider.${preset.id}` as never) || preset.name;
  }

  private getProviderCheckLabel(state: ProviderCheckState): string {
    switch (state.status) {
      case 'success':
        return t('settings.model.visualEditor.providerCheckBadge.success');
      case 'warning':
        return t('settings.model.visualEditor.providerCheckBadge.warning');
      case 'error':
        return t('settings.model.visualEditor.providerCheckBadge.error');
      case 'loading':
        return t('settings.model.visualEditor.providerCheckBadge.loading');
      default:
        return '';
    }
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
