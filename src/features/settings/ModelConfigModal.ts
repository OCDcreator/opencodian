import { App, Modal, Notice, setIcon } from 'obsidian';

import {
  collectConfiguredProviderIds,
  formatModelReference,
  setProviderEnabled,
} from '../../core/config/modelConfig';
import type {
  OpencodeModelConfigSubset,
  OpencodeProviderConfig,
  OpencodeProviderModelConfig,
} from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import { ProviderIconService } from '../../utils/icons/ProviderIconService';
import { ModelConfigJsonModal } from './ModelConfigJsonModal';
import {
  assertModelExtraFieldKeyAllowed,
  buildConfigPreview,
  createEmptyModel,
  createEmptyProvider,
  DEFAULT_PROVIDER_INTERFACE_FORMAT,
  extractModelExtraFields,
  extractModelOptions,
  extractModelVariants,
  extractProviderExtraOptions,
  type FetchedProviderModelCandidate,
  fetchProviderModels,
  hydrateWorkspaceState,
  type KeyValueFieldState,
  type ModelFormState,
  parseLooseValue,
  parseModelVariantValue,
  PROVIDER_ID_PATTERN,
  PROVIDER_INTERFACE_FORMAT_OPTIONS,
  type ProviderFormState,
  type ProviderInterfaceFormatId,
  resolveInterfaceFormatState,
  resolveNpmForInterfaceFormat,
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
    const provider = this.getSelectedProvider();
    if (!provider) {
      this.previewEl = null;
      this.restartToggleEl = null;
      containerEl.createDiv({
        cls: 'opencodian-model-workspace-empty',
        text: t('settings.model.visualEditor.noProviderSelected'),
      });
      return;
    }

    if (this.isAddProviderFlow()) {
      this.renderAddProviderEditor(containerEl, provider);
      return;
    }

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
    const providerTestButton = utilityActionsEl.createEl('button', {
      text: this.providerChecks.get(provider.uid)?.status === 'loading'
        ? t('settings.model.availability.check.loading')
        : t('settings.model.visualEditor.testProvider'),
    });
    providerTestButton.type = 'button';
    providerTestButton.disabled = this.providerChecks.get(provider.uid)?.status === 'loading' || !provider.id.trim();
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

    const sectionsEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-editor-panel' });

    const identitySectionEl = sectionsEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    this.createSectionHeader(
      identitySectionEl,
      t('settings.model.visualEditor.identitySectionTitle'),
      t('settings.model.visualEditor.identitySectionDesc'),
    );
    const identityGridEl = identitySectionEl.createDiv({ cls: 'opencodian-model-workspace-grid is-identity-grid' });
    const providerIdField = this.createTextField(
      identityGridEl,
      `${t('settings.model.visualEditor.providerId')} *`,
      provider.id,
      (value) => {
        provider.id = value;
      },
      'my-provider',
      t('settings.model.visualEditor.providerIdDesc'),
    );
    providerIdField.addClass('is-full-span');

    const providerNameField = this.createTextField(
      identityGridEl,
      `${t('settings.model.visualEditor.providerName')} *`,
      provider.name,
      (value) => {
        provider.name = value;
      },
      'My Provider',
    );
    providerNameField.addClass('is-full-span');

    const connectionSectionEl = sectionsEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    this.createSectionHeader(
      connectionSectionEl,
      t('settings.model.visualEditor.providerSectionTitle'),
      t('settings.model.visualEditor.providerSectionDesc'),
    );
    const connectionGridEl = connectionSectionEl.createDiv({ cls: 'opencodian-model-workspace-grid is-connection-grid' });
    const interfaceField = this.createSelectField(
      connectionGridEl,
      t('settings.model.visualEditor.interfaceFormat'),
      provider.interfaceFormat,
      PROVIDER_INTERFACE_FORMAT_OPTIONS.map((entry) => ({
        value: entry.id,
        label: t(entry.labelKey as never),
      })),
      (value) => {
        const previous = PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === provider.interfaceFormat)
          ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1];
        const next = PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === value)
          ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1];
        provider.interfaceFormat = value as ProviderInterfaceFormatId;
        if (!provider.baseURL.trim() || provider.baseURL.trim() === previous.defaultBaseUrl) {
          provider.baseURL = '';
        }
        this.setProviderBaseUrlSuggestion(provider, next.defaultBaseUrl);
        this.updatePreview();
        this.render();
      },
      t((PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === provider.interfaceFormat)?.descriptionKey
        ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1].descriptionKey) as never),
    );
    interfaceField.addClass('is-full-span');

    if (provider.interfaceFormat === 'custom') {
      const customNpmField = this.createTextField(
        connectionGridEl,
        t('settings.model.visualEditor.customNpm'),
        provider.customNpm,
        (value) => {
          provider.customNpm = value;
        },
        '@scope/custom-adapter',
      );
      customNpmField.addClass('is-full-span');
    }

    const formatMeta = PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === provider.interfaceFormat)
      ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1];
    const baseUrlField = this.createTextField(
      connectionGridEl,
      `${t('settings.model.visualEditor.baseURL')} *`,
      provider.baseURL,
      (value) => {
        provider.baseURL = value;
      },
      formatMeta.baseUrlPlaceholder,
    );
    baseUrlField.addClass('is-full-span');
    const apiKeyField = this.createTextField(
      connectionGridEl,
      t('settings.model.visualEditor.apiKey'),
      provider.apiKey,
      (value) => {
        provider.apiKey = value;
      },
      formatMeta.apiKeyPlaceholder,
      undefined,
      false,
      true,
    );
    apiKeyField.addClass('is-full-span');

    const providerCheckState = this.providerChecks.get(provider.uid);
    if (providerCheckState && providerCheckState.status !== 'idle' && providerCheckState.status !== 'loading') {
      connectionSectionEl.createDiv({
        cls: `opencodian-model-workspace-inline-status ${this.getProviderCheckClass(providerCheckState)}`,
        text: providerCheckState.message,
      });
    }

    const extraOptionsSectionEl = sectionsEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    this.renderKeyValueEditor(
      extraOptionsSectionEl,
      t('settings.model.visualEditor.extraOptionsTitle'),
      t('settings.model.visualEditor.extraOptionsDesc'),
      provider.extraOptions,
      () => {
        provider.extraOptions.push(this.createKeyValueState());
        this.updatePreview();
        this.render();
      },
      (uid) => {
        provider.extraOptions = provider.extraOptions.filter((entry) => entry.uid !== uid);
        this.updatePreview();
        this.render();
      },
      (uid, value) => {
        const field = provider.extraOptions.find((entry) => entry.uid === uid);
        if (!field) {
          return;
        }
        field.key = value;
        this.updatePreview();
      },
      (uid, value) => {
        const field = provider.extraOptions.find((entry) => entry.uid === uid);
        if (!field) {
          return;
        }
        field.value = value;
        this.updatePreview();
      },
      false,
      {
        stackedLabels: true,
      },
    );

    const modelsSectionEl = sectionsEl.createDiv({ cls: 'opencodian-model-workspace-section' });
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

    const fetchedCandidates = this.fetchedModelCandidates.get(provider.uid) ?? [];
    if (fetchedCandidates.length > 0) {
      const importPanelEl = modelsSectionEl.createDiv({ cls: 'opencodian-model-workspace-import-panel is-inline' });
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

    if (provider.models.length === 0) {
      modelsSectionEl.createDiv({
        cls: 'opencodian-model-workspace-empty',
        text: t('settings.model.visualEditor.noModels'),
      });
    } else {
      const modelsListEl = modelsSectionEl.createDiv({ cls: 'opencodian-model-workspace-model-list' });
      for (const model of provider.models) {
        this.renderModelCard(modelsListEl, provider, model);
      }
    }

    const defaultsSectionEl = sectionsEl.createDiv({ cls: 'opencodian-model-workspace-section' });
    this.createSectionHeader(
      defaultsSectionEl,
      t('settings.model.visualEditor.defaultsTitle'),
      t('settings.model.visualEditor.defaultsDesc'),
    );
    const defaultsGridEl = defaultsSectionEl.createDiv({ cls: 'opencodian-model-workspace-grid' });
    this.createTextField(
      defaultsGridEl,
      t('settings.model.visualEditor.defaultModel'),
      this.modelValue,
      (value) => {
        this.modelValue = value;
      },
      'provider/model',
      t('settings.model.visualEditor.defaultModelDesc'),
    );
    this.createTextField(
      defaultsGridEl,
      t('settings.model.visualEditor.smallModel'),
      this.smallModelValue,
      (value) => {
        this.smallModelValue = value;
      },
      'provider/model',
      t('settings.model.visualEditor.smallModelDesc'),
    );

    const previewSectionEl = sectionsEl.createDiv({ cls: 'opencodian-model-workspace-section' });
    this.createSectionHeader(
      previewSectionEl,
      this.isAddProviderFlow()
        ? t('settings.model.visualEditor.addProviderPreviewTitle')
        : t('settings.model.visualEditor.previewTitle'),
      this.isAddProviderFlow()
        ? t('settings.model.visualEditor.addProviderPreviewDesc')
        : t('settings.model.visualEditor.previewDesc'),
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

  private renderAddProviderEditor(containerEl: HTMLElement, provider: ProviderFormState): void {
    containerEl.addClass('is-add-provider-flow');

    const sectionsEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-editor-panel is-add-provider-flow' });

    const identitySectionEl = sectionsEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    const identityGridEl = identitySectionEl.createDiv({ cls: 'opencodian-model-workspace-grid is-identity-grid' });
    const providerIdField = this.createTextField(
      identityGridEl,
      `${t('settings.model.visualEditor.providerId')} *`,
      provider.id,
      (value) => {
        provider.id = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      },
      'my-provider',
      t('settings.model.visualEditor.providerIdDesc'),
    );
    providerIdField.addClass('is-full-span');

    const providerNameField = this.createTextField(
      identityGridEl,
      `${t('settings.model.visualEditor.providerName')} *`,
      provider.name,
      (value) => {
        provider.name = value;
      },
      t('settings.model.visualEditor.providerNamePlaceholder'),
    );
    providerNameField.addClass('is-full-span');

    const connectionSectionEl = sectionsEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    const connectionGridEl = connectionSectionEl.createDiv({ cls: 'opencodian-model-workspace-grid is-connection-grid' });
    const interfaceField = this.createSelectField(
      connectionGridEl,
      t('settings.model.visualEditor.interfaceFormat'),
      provider.interfaceFormat,
      PROVIDER_INTERFACE_FORMAT_OPTIONS.map((entry) => ({
        value: entry.id,
        label: t(entry.labelKey as never),
      })),
      (value) => {
        const previous = PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === provider.interfaceFormat)
          ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1];
        const next = PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === value)
          ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1];
        provider.interfaceFormat = value as ProviderInterfaceFormatId;
        if (!provider.baseURL.trim() || provider.baseURL.trim() === previous.defaultBaseUrl) {
          provider.baseURL = '';
        }
        this.setProviderBaseUrlSuggestion(provider, next.defaultBaseUrl);
        this.updatePreview();
        this.render();
      },
      t((PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === provider.interfaceFormat)?.descriptionKey
        ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1].descriptionKey) as never),
    );
    interfaceField.addClass('is-full-span');

    if (provider.interfaceFormat === 'custom') {
      const customNpmField = this.createTextField(
        connectionGridEl,
        t('settings.model.visualEditor.customNpm'),
        provider.customNpm,
        (value) => {
          provider.customNpm = value;
        },
        '@scope/custom-adapter',
      );
      customNpmField.addClass('is-full-span');
    }

    const formatMeta = PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === provider.interfaceFormat)
      ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1];
    const baseUrlPlaceholder = this.getProviderBaseUrlPlaceholder(provider, formatMeta.baseUrlPlaceholder);
    const apiKeyField = this.createTextField(
      connectionGridEl,
      t('settings.model.visualEditor.apiKey'),
      provider.apiKey,
      (value) => {
        provider.apiKey = value;
      },
      formatMeta.apiKeyPlaceholder || t('settings.model.visualEditor.apiKeyPlaceholder'),
      t('settings.model.visualEditor.apiKeyAutoFill'),
      false,
      true,
    );
    apiKeyField.addClass('is-full-span');

    const baseUrlField = this.createTextField(
      connectionGridEl,
      `${t('settings.model.visualEditor.baseURL')} *`,
      provider.baseURL,
      (value) => {
        provider.baseURL = value;
      },
      baseUrlPlaceholder,
    );
    baseUrlField.addClass('is-full-span');

    const extraOptionsSectionEl = sectionsEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    this.renderKeyValueEditor(
      extraOptionsSectionEl,
      t('settings.model.visualEditor.extraOptionsTitle'),
      t('settings.model.visualEditor.addProviderExtraOptionsDesc'),
      provider.extraOptions,
      () => {
        provider.extraOptions.push(this.createKeyValueState());
        this.updatePreview();
        this.render();
      },
      (uid) => {
        provider.extraOptions = provider.extraOptions.filter((entry) => entry.uid !== uid);
        this.updatePreview();
        this.render();
      },
      (uid, value) => {
        const field = provider.extraOptions.find((entry) => entry.uid === uid);
        if (!field) {
          return;
        }
        field.key = value;
        this.updatePreview();
      },
      (uid, value) => {
        const field = provider.extraOptions.find((entry) => entry.uid === uid);
        if (!field) {
          return;
        }
        field.value = value;
        this.updatePreview();
      },
      false,
      {
        stackedLabels: true,
        iconRemoveButton: true,
      },
    );

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

    if (!expanded) {
      return;
    }

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
    this.createTextField(
      limitsGridEl,
      t('settings.model.visualEditor.contextLimit'),
      model.context,
      (value) => {
        model.context = value;
      },
      '200000',
      t('settings.model.visualEditor.contextLimitDesc'),
    );
    this.createTextField(
      limitsGridEl,
      t('settings.model.visualEditor.outputLimit'),
      model.output,
      (value) => {
        model.output = value;
      },
      '65536',
      t('settings.model.visualEditor.outputLimitDesc'),
    );

    this.renderKeyValueEditor(
      detailsEl,
      t('settings.model.visualEditor.modelOptionsTitle'),
      t('settings.model.visualEditor.modelOptionsDesc'),
      model.options,
      () => {
        model.options.push(this.createKeyValueState());
        this.updatePreview();
        this.render();
      },
      (uid) => {
        model.options = model.options.filter((entry) => entry.uid !== uid);
        this.updatePreview();
        this.render();
      },
      (uid, value) => {
        const target = model.options.find((entry) => entry.uid === uid);
        if (!target) {
          return;
        }
        target.key = value;
        this.updatePreview();
      },
      (uid, value) => {
        const target = model.options.find((entry) => entry.uid === uid);
        if (!target) {
          return;
        }
        target.value = value;
        this.updatePreview();
      },
      false,
      {
        emptyState: t('settings.model.visualEditor.modelOptionsEmpty'),
        keyPlaceholder: t('settings.model.visualEditor.modelOptionsKeyPlaceholder'),
        valuePlaceholder: t('settings.model.visualEditor.modelOptionsValuePlaceholder'),
      },
    );

    this.renderKeyValueEditor(
      detailsEl,
      t('settings.model.visualEditor.modelVariantsTitle'),
      t('settings.model.visualEditor.modelVariantsDesc'),
      model.variants,
      () => {
        model.variants.push(this.createKeyValueState());
        this.updatePreview();
        this.render();
      },
      (uid) => {
        model.variants = model.variants.filter((entry) => entry.uid !== uid);
        this.updatePreview();
        this.render();
      },
      (uid, value) => {
        const target = model.variants.find((entry) => entry.uid === uid);
        if (!target) {
          return;
        }
        target.key = value;
        this.updatePreview();
      },
      (uid, value) => {
        const target = model.variants.find((entry) => entry.uid === uid);
        if (!target) {
          return;
        }
        target.value = value;
        this.updatePreview();
      },
      false,
      {
        emptyState: t('settings.model.visualEditor.modelVariantsEmpty'),
        keyPlaceholder: t('settings.model.visualEditor.modelVariantsKeyPlaceholder'),
        valuePlaceholder: t('settings.model.visualEditor.modelVariantsValuePlaceholder'),
      },
    );

    this.renderKeyValueEditor(
      detailsEl,
      t('settings.model.visualEditor.modelExtraFieldsTitle'),
      t('settings.model.visualEditor.modelExtraFieldsDesc'),
      model.extraFields,
      () => {
        model.extraFields.push(this.createKeyValueState());
        this.updatePreview();
        this.render();
      },
      (uid) => {
        model.extraFields = model.extraFields.filter((entry) => entry.uid !== uid);
        this.updatePreview();
        this.render();
      },
      (uid, value) => {
        const target = model.extraFields.find((entry) => entry.uid === uid);
        if (!target) {
          return;
        }
        target.key = value;
        this.updatePreview();
      },
      (uid, value) => {
        const target = model.extraFields.find((entry) => entry.uid === uid);
        if (!target) {
          return;
        }
        target.value = value;
        this.updatePreview();
      },
      false,
      {
        emptyState: t('settings.model.visualEditor.modelAdvancedFieldsEmpty'),
        keyPlaceholder: t('settings.model.visualEditor.modelAdvancedFieldsKeyPlaceholder'),
        valuePlaceholder: t('settings.model.visualEditor.modelAdvancedFieldsValuePlaceholder'),
      },
    );
  }

  private renderKeyValueEditor(
    containerEl: HTMLElement,
    title: string,
    description: string,
    values: KeyValueFieldState[],
    onAdd: () => void,
    onRemove: (uid: string) => void,
    onKeyChange: (uid: string, value: string) => void,
    onValueChange: (uid: string, value: string) => void,
    showColumnHeaders = false,
    options: {
      stackedLabels?: boolean;
      iconRemoveButton?: boolean;
      emptyState?: string;
      keyPlaceholder?: string;
      valuePlaceholder?: string;
    } = {},
  ): void {
    const useIconRemoveButton = options.iconRemoveButton ?? true;
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
        text: options.emptyState ?? t('settings.model.visualEditor.noExtraFields'),
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
        cls: `opencodian-model-workspace-keyvalue-row${options.stackedLabels ? ' is-stacked-labels' : ''}`,
      });
      const keyFieldEl = options.stackedLabels
        ? rowEl.createDiv({ cls: 'opencodian-model-workspace-keyvalue-cell' })
        : rowEl;
      if (options.stackedLabels) {
        keyFieldEl.createDiv({
          cls: 'opencodian-model-workspace-keyvalue-cell-label',
          text: t('settings.model.visualEditor.fieldKeyLabel'),
        });
      }
      const keyInput = keyFieldEl.createEl('input', {
        cls: 'opencodian-model-workspace-keyvalue-input',
        attr: {
          type: 'text',
          placeholder: options.keyPlaceholder ?? t('settings.model.visualEditor.fieldKeyPlaceholder'),
        },
      });
      this.bindEditableControl(keyInput);
      keyInput.value = field.key;
      keyInput.addEventListener('input', () => {
        onKeyChange(field.uid, keyInput.value);
      });
      const valueFieldEl = options.stackedLabels
        ? rowEl.createDiv({ cls: 'opencodian-model-workspace-keyvalue-cell' })
        : rowEl;
      if (options.stackedLabels) {
        valueFieldEl.createDiv({
          cls: 'opencodian-model-workspace-keyvalue-cell-label',
          text: t('settings.model.visualEditor.fieldValueLabel'),
        });
      }
      const valueInput = valueFieldEl.createEl('textarea', {
        cls: 'opencodian-model-workspace-keyvalue-textarea',
        attr: {
          rows: '2',
          placeholder: options.valuePlaceholder ?? t('settings.model.visualEditor.fieldValuePlaceholder'),
        },
      });
      this.bindEditableControl(valueInput);
      valueInput.value = field.value;
      valueInput.addEventListener('input', () => {
        onValueChange(field.uid, valueInput.value);
      });
      const removeButton = rowEl.createEl('button', {
        cls: `opencodian-model-workspace-danger-button${useIconRemoveButton ? ' is-icon-only' : ''}`,
        text: useIconRemoveButton ? '' : t('settings.model.visualEditor.removeField'),
        attr: useIconRemoveButton
          ? { 'aria-label': t('settings.model.visualEditor.removeField') }
          : undefined,
      });
      removeButton.type = 'button';
      if (useIconRemoveButton) {
        setIcon(removeButton, 'trash-2');
      }
      removeButton.addEventListener('click', () => onRemove(field.uid));
    }
  }

  private createTextField(
    containerEl: HTMLElement,
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder = '',
    description?: string,
    _rerenderOnBlur = false,
    secret = false,
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
    label: string,
    value: string,
    options: Array<{ value: string; label: string }>,
    onChange: (value: string) => void,
    description?: string,
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
    return JSON.stringify({
      modelValue: this.modelValue,
      smallModelValue: this.smallModelValue,
      jsonDraftValue: this.isAddProviderFlow() ? this.getJsonDraftValue() : undefined,
      providers: this.providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        interfaceFormat: provider.interfaceFormat,
        customNpm: provider.customNpm,
        baseURL: provider.baseURL,
        apiKey: provider.apiKey,
        enabled: provider.enabled,
        extraOptions: provider.extraOptions.map((entry) => ({ key: entry.key, value: entry.value })),
        models: provider.models.map((model) => ({
          id: model.id,
          name: model.name,
          context: model.context,
          output: model.output,
          enabled: model.enabled,
          options: model.options.map((entry) => ({ key: entry.key, value: entry.value })),
          variants: model.variants.map((entry) => ({ key: entry.key, value: entry.value })),
          extraFields: model.extraFields.map((entry) => ({ key: entry.key, value: entry.value })),
        })),
      })),
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
      const subset = this.buildAvailabilitySubset();
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

  private buildAvailabilitySubset(): Pick<OpencodeModelConfigSubset, 'enabled_providers' | 'disabled_providers'> {
    const providerIds = Array.from(new Set([
      ...this.providers.map((provider) => provider.id.trim()).filter(Boolean),
      ...collectConfiguredProviderIds(this.localConfigAtOpen),
      ...collectConfiguredProviderIds(this.serverConfigAtOpen),
    ]));

    let subset: OpencodeModelConfigSubset = {
      enabled_providers: Array.isArray(this.localConfigAtOpen.enabled_providers)
        ? [...this.localConfigAtOpen.enabled_providers]
        : undefined,
      disabled_providers: Array.isArray(this.localConfigAtOpen.disabled_providers)
        ? [...this.localConfigAtOpen.disabled_providers]
        : undefined,
    };

    for (const provider of this.providers) {
      const providerId = provider.id.trim();
      if (!providerId) {
        continue;
      }
      subset = setProviderEnabled({
        subset,
        providerId,
        enabled: provider.enabled,
        knownProviderIds: providerIds,
        inherited: this.serverConfigAtOpen,
      });
    }

    return {
      enabled_providers: subset.enabled_providers,
      disabled_providers: subset.disabled_providers,
    };
  }

  private toModelConfig(): OpencodeModelConfigSubset {
    const providerEntries = this.providers.reduce<Record<string, OpencodeProviderConfig>>((result, provider) => {
      const isBlankProvider = !provider.id.trim()
        && !provider.name.trim()
        && !provider.baseURL.trim()
        && !provider.apiKey.trim()
        && provider.extraOptions.every((entry) => !entry.key.trim() && !entry.value.trim())
        && provider.models.length === 0;
      if (isBlankProvider) {
        return result;
      }

      const providerId = provider.id.trim();
      const providerName = provider.name.trim();
      const baseURL = provider.baseURL.trim();

      if (!providerId) {
        throw new Error(t('settings.model.visualEditor.errorProviderId'));
      }
      if (!PROVIDER_ID_PATTERN.test(providerId)) {
        throw new Error(t('settings.model.visualEditor.errorProviderIdFormat'));
      }
      if (!providerName) {
        throw new Error(t('settings.model.visualEditor.errorProviderName'));
      }
      if (!baseURL) {
        throw new Error(t('settings.model.visualEditor.errorBaseURL'));
      }
      if (Object.prototype.hasOwnProperty.call(result, providerId)) {
        throw new Error(t('settings.model.visualEditor.errorProviderDuplicate'));
      }

      const nextProvider = this.serializeProviderConfig(provider, {
        validate: true,
        includeName: true,
      });
      result[providerId] = nextProvider;
      return result;
    }, {});

    const availabilitySubset = this.buildAvailabilitySubset();
    return {
      model: this.modelValue.trim() || undefined,
      small_model: this.smallModelValue.trim() || undefined,
      provider: providerEntries,
      enabled_providers: availabilitySubset.enabled_providers,
      disabled_providers: availabilitySubset.disabled_providers,
    };
  }

  private buildNextDisabledModelRefs(): string[] {
    const managedProviderIds = new Set([
      ...Object.keys(this.localConfigAtOpen.provider ?? {}),
      ...this.providers.map((provider) => provider.id.trim()).filter(Boolean),
    ]);
    const nextRefs = this.initialDisabledModelRefs.filter((ref) => {
      const [providerId] = ref.split('/');
      return !managedProviderIds.has(providerId);
    });

    for (const provider of this.providers) {
      const providerId = provider.id.trim();
      if (!providerId) {
        continue;
      }
      for (const model of provider.models) {
        const modelId = model.id.trim();
        if (!modelId || model.enabled) {
          continue;
        }
        nextRefs.push(formatModelReference(providerId, modelId));
      }
    }

    return Array.from(new Set(nextRefs)).sort((left, right) => left.localeCompare(right));
  }

  private async save(): Promise<void> {
    if (!this.plugin.modelConfigService) {
      return;
    }

    try {
      if (this.isAddProviderFlow()) {
        await this.saveAddProvider();
        return;
      }

      const modelConfig = this.toModelConfig();
      this.plugin.settings.disabledModelRefs = this.buildNextDisabledModelRefs();
      await this.plugin.modelConfigService.writeLocalModelConfig(modelConfig);
      await this.maybeRestartServer();
      await this.plugin.saveSettings({
        syncConfig: false,
        reloadModels: true,
        applyUi: true,
      });
      this.initialDisabledModelRefs = [...this.plugin.settings.disabledModelRefs];
      this.localConfigAtOpen = modelConfig;
      this.initialSnapshot = this.createSnapshot();
      try {
        await this.openOptions.onSaved?.();
      } catch (error) {
        logger.error('Failed to run model workspace save callback:', error);
      }
      new Notice(t('settings.model.visualEditor.saveSuccess'));
      this.close();
    } catch (error) {
      logger.error('Failed to save visual model config:', error);
      new Notice(`${t('settings.model.visualEditor.saveFailed')}: ${(error as Error).message}`);
    }
  }

  private async saveAddProvider(): Promise<void> {
    if (!this.plugin.modelConfigService) {
      return;
    }

    const provider = this.getSelectedProvider();
    if (!provider) {
      throw new Error(t('settings.model.visualEditor.noProviderSelected'));
    }

    const providerId = provider.id.trim();
    const providerName = provider.name.trim();
    if (!providerId) {
      throw new Error(t('settings.model.visualEditor.errorProviderId'));
    }
    if (!PROVIDER_ID_PATTERN.test(providerId)) {
      throw new Error(t('settings.model.visualEditor.errorProviderIdFormat'));
    }
    if (!providerName) {
      throw new Error(t('settings.model.visualEditor.errorProviderName'));
    }
    if (Object.prototype.hasOwnProperty.call(this.localConfigAtOpen.provider ?? {}, providerId)) {
      throw new Error(t('settings.model.visualEditor.errorProviderDuplicate'));
    }

    const parsedConfig = this.parseAddProviderJsonDraft();
    parsedConfig.name = providerName;

    const availabilitySubset = this.buildAvailabilitySubset();
    const nextConfig: OpencodeModelConfigSubset = {
      ...this.localConfigAtOpen,
      provider: {
        ...(this.localConfigAtOpen.provider ?? {}),
        [providerId]: parsedConfig,
      },
      enabled_providers: availabilitySubset.enabled_providers,
      disabled_providers: availabilitySubset.disabled_providers,
    };

    this.plugin.settings.disabledModelRefs = [...this.initialDisabledModelRefs];
    await this.plugin.modelConfigService.writeLocalModelConfig(nextConfig);
    await this.plugin.saveSettings({
      syncConfig: false,
      reloadModels: true,
      applyUi: true,
    });
    this.localConfigAtOpen = nextConfig;
    this.initialDisabledModelRefs = [...this.plugin.settings.disabledModelRefs];
    this.initialSnapshot = this.createSnapshot();
    try {
      await this.openOptions.onSaved?.();
    } catch (error) {
      logger.error('Failed to run model workspace save callback:', error);
    }
    new Notice(t('settings.model.visualEditor.saveSuccess'));
    this.close();
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
      this.createKeyValueState('setCacheKey', 'true'),
    ];
  }

  private createKeyValueState(key = '', value = ''): KeyValueFieldState {
    return {
      uid: `field-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      key,
      value,
    };
  }

  private upsertSelectedDraftProvider(nextProvider: ProviderFormState): void {
    const selectedProvider = this.getSelectedProvider();
    if (this.isAddProviderFlow() && selectedProvider) {
      this.providers = this.providers.map((provider) => (
        provider.uid === selectedProvider.uid ? nextProvider : provider
      ));
    } else if (selectedProvider && this.isBlankProvider(selectedProvider)) {
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
    const rawDraft = this.getJsonDraftValue().trim();
    let parsedDraft: OpencodeProviderConfig | null = null;
    try {
      parsedDraft = this.tryParseAddProviderJsonDraft(rawDraft);
      if (parsedDraft) {
        provider.raw = parsedDraft;
      }
    } catch {
      return rawDraft;
    }

    try {
      const providerConfig = this.serializeProviderConfig(provider, {
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
      const parsedDraft = this.tryParseAddProviderJsonDraft(this.jsonDraftValue);
      if (parsedDraft) {
        this.syncProviderFormFromJsonDraft(provider, parsedDraft);
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

  private getJsonDraftValue(): string {
    return this.previewEl?.value ?? this.jsonDraftValue;
  }

  private formatAddProviderJson(): void {
    try {
      const parsed = this.parseAddProviderJsonDraft();
      const nextValue = JSON.stringify(parsed, null, 2);
      this.jsonDraftValue = nextValue;
      const provider = this.getSelectedProvider();
      if (provider) {
        this.syncProviderFormFromJsonDraft(provider, parsed);
      }
      if (this.previewEl) {
        this.previewEl.value = nextValue;
      }
      new Notice(t('settings.model.jsonEditor.formatSuccess'));
    } catch (error) {
      new Notice(`${t('settings.model.jsonEditor.invalidJson')}: ${(error as Error).message}`);
    }
  }

  private parseAddProviderJsonDraft(): OpencodeProviderConfig {
    const rawValue = this.getJsonDraftValue().trim();
    const parsed = this.tryParseAddProviderJsonDraft(rawValue);
    if (!rawValue || !parsed) {
      throw new Error(t('settings.model.jsonEditor.invalidJson'));
    }
    return parsed;
  }

  private tryParseAddProviderJsonDraft(rawValue: string): OpencodeProviderConfig | null {
    if (!rawValue.trim()) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(t('settings.model.jsonEditor.providerObject'));
    }
    return parsed as OpencodeProviderConfig;
  }

  private serializeProviderConfig(
    provider: ProviderFormState,
    options: { validate: boolean; includeName: boolean },
  ): OpencodeProviderConfig {
    const providerName = provider.name.trim();
    const baseURL = provider.baseURL.trim();

    if (options.validate) {
      if (!providerName && options.includeName) {
        throw new Error(t('settings.model.visualEditor.errorProviderName'));
      }
      if (!baseURL) {
        throw new Error(t('settings.model.visualEditor.errorBaseURL'));
      }
    }

    const nextProvider = this.cloneUnmanagedProviderFields(provider.raw);
    if (options.includeName) {
      nextProvider.name = providerName;
    } else {
      delete nextProvider.name;
    }
    nextProvider.npm = resolveNpmForInterfaceFormat(provider);
    const nextOptions: Record<string, unknown> = {};
    if (baseURL) {
      nextOptions.baseURL = baseURL;
    } else {
      delete nextOptions.baseURL;
    }
    if (provider.apiKey.trim()) {
      nextOptions.apiKey = provider.apiKey.trim();
    } else {
      delete nextOptions.apiKey;
    }
    for (const entry of provider.extraOptions) {
      const key = entry.key.trim();
      if (!key || key === 'baseURL' || key === 'apiKey') {
        continue;
      }
      nextOptions[key] = parseLooseValue(entry.value);
    }
    nextProvider.options = nextOptions;

    const modelEntries = provider.models.reduce<Record<string, OpencodeProviderModelConfig>>((models, model) => {
      const modelId = model.id.trim();
      if (!modelId) {
        if (options.validate) {
          throw new Error(t('settings.model.visualEditor.errorModelId'));
        }
        return models;
      }
      if (Object.prototype.hasOwnProperty.call(models, modelId)) {
        throw new Error(t('settings.model.visualEditor.errorModelDuplicate'));
      }

      const nextModel: OpencodeProviderModelConfig = {};
      if (model.name.trim()) {
        nextModel.name = model.name.trim();
      } else {
        delete nextModel.name;
      }

      const nextLimit: NonNullable<OpencodeProviderModelConfig['limit']> = {};
      if (model.context.trim()) {
        const parsed = Number(model.context.trim());
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error(t('settings.model.visualEditor.errorContextLimit'));
        }
        nextLimit.context = parsed;
      } else {
        delete nextLimit.context;
      }
      if (model.output.trim()) {
        const parsed = Number(model.output.trim());
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error(t('settings.model.visualEditor.errorOutputLimit'));
        }
        nextLimit.output = parsed;
      } else {
        delete nextLimit.output;
      }
      if (Object.keys(nextLimit).length > 0) {
        nextModel.limit = nextLimit;
      } else {
        delete nextModel.limit;
      }

      const nextModelOptions: Record<string, unknown> = {};
      for (const entry of model.options) {
        const key = entry.key.trim();
        if (!key) {
          continue;
        }
        nextModelOptions[key] = parseLooseValue(entry.value);
      }
      if (Object.keys(nextModelOptions).length > 0) {
        nextModel.options = nextModelOptions;
      } else {
        delete nextModel.options;
      }

      const nextModelVariants: Record<string, Record<string, unknown>> = {};
      for (const entry of model.variants) {
        const key = entry.key.trim();
        if (!key) {
          continue;
        }
        nextModelVariants[key] = parseModelVariantValue(key, entry.value);
      }
      if (Object.keys(nextModelVariants).length > 0) {
        nextModel.variants = nextModelVariants;
      } else {
        delete nextModel.variants;
      }

      for (const entry of model.extraFields) {
        const key = assertModelExtraFieldKeyAllowed(entry.key);
        if (!key) {
          continue;
        }
        nextModel[key] = parseLooseValue(entry.value);
      }

      models[modelId] = nextModel;
      return models;
    }, {});

    nextProvider.models = modelEntries;
    return nextProvider;
  }

  private syncProviderFormFromJsonDraft(provider: ProviderFormState, draft: OpencodeProviderConfig): void {
    const interfaceState = resolveInterfaceFormatState(draft.npm);
    const existingModelEnabledMap = new Map(provider.models.map((model) => [model.id, model.enabled]));

    provider.interfaceFormat = interfaceState.interfaceFormat;
    provider.customNpm = interfaceState.customNpm;
    provider.baseURL = this.readOptionString(draft.options, 'baseURL');
    provider.apiKey = this.readOptionString(draft.options, 'apiKey');
    provider.extraOptions = extractProviderExtraOptions(draft.options);
    provider.models = Object.entries(draft.models ?? {}).map(([modelId, model]) => ({
      uid: `model-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      id: modelId,
      name: typeof model.name === 'string' ? model.name : '',
      context: this.readLimitNumber(model.limit, 'context'),
      output: this.readLimitNumber(model.limit, 'output'),
      enabled: existingModelEnabledMap.get(modelId) ?? true,
      options: extractModelOptions(model),
      variants: extractModelVariants(model),
      extraFields: extractModelExtraFields(model),
      raw: model,
    }));
    provider.raw = draft;
  }

  private cloneUnmanagedProviderFields(raw: OpencodeProviderConfig): OpencodeProviderConfig {
    return Object.entries(raw).reduce<OpencodeProviderConfig>((result, [key, value]) => {
      if (key === 'name' || key === 'npm' || key === 'options' || key === 'models') {
        return result;
      }
      result[key] = value;
      return result;
    }, {});
  }

  private readOptionString(options: unknown, key: string): string {
    if (typeof options !== 'object' || options === null || Array.isArray(options)) {
      return '';
    }
    const value = (options as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
  }

  private readLimitNumber(limit: unknown, key: 'context' | 'output'): string {
    if (typeof limit !== 'object' || limit === null || Array.isArray(limit)) {
      return '';
    }
    const value = (limit as Record<string, unknown>)[key];
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  }

  private isBlankProvider(provider: ProviderFormState): boolean {
    return !provider.id.trim()
      && !provider.name.trim()
      && !provider.baseURL.trim()
      && !provider.apiKey.trim()
      && provider.extraOptions.every((entry) => !entry.key.trim() && !entry.value.trim())
      && provider.models.length === 0;
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
