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
  buildConfigPreview,
  createEmptyModel,
  createEmptyProvider,
  DEFAULT_PROVIDER_INTERFACE_FORMAT,
  fetchProviderModels,
  type FetchedProviderModelCandidate,
  type KeyValueFieldState,
  hydrateWorkspaceState,
  parseLooseValue,
  PROVIDER_ID_PATTERN,
  PROVIDER_INTERFACE_FORMAT_OPTIONS,
  resolveNpmForInterfaceFormat,
  type ModelFormState,
  type ProviderFormState,
  type ProviderInterfaceFormatId,
} from './modelConfigWorkspace';
import { ProviderIconCacheModal } from './ProviderIconCacheModal';

const logger = createLogger('ModelConfigModal');

type ProviderCheckState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; message: string }
  | { status: 'warning'; message: string }
  | { status: 'error'; message: string };

export class ModelConfigModal extends Modal {
  private modelValue = '';
  private smallModelValue = '';
  private providers: ProviderFormState[] = [];
  private selectedProviderUid: string | null = null;
  private advancedSectionOpen = false;
  private restartToggleEl: HTMLInputElement | null = null;
  private previewEl: HTMLTextAreaElement | null = null;
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
    this.providers = hydrated.providers.length > 0 ? hydrated.providers : [createEmptyProvider()];
    this.selectedProviderUid = this.providers[0]?.uid ?? null;
    this.initialSnapshot = this.createSnapshot();

    this.render();
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

    const headerEl = contentEl.createDiv({ cls: 'opencodian-model-workspace-header' });
    const headlineEl = headerEl.createDiv({ cls: 'opencodian-model-workspace-headline' });
    headlineEl.createEl('h2', { text: t('settings.model.visualEditor.workspaceTitle') });
    headlineEl.createEl('p', {
      cls: 'opencodian-model-workspace-intro',
      text: t('settings.model.visualEditor.workspaceIntro'),
    });
    headerEl.createEl('p', {
      cls: 'opencodian-config-path opencodian-model-workspace-path',
      text: `${t('settings.model.config.path')}: ${service.getConfigPath()}`,
    });

    const toolbarEl = contentEl.createDiv({ cls: 'opencodian-model-workspace-toolbar' });
    const toolbarTextEl = toolbarEl.createDiv({ cls: 'opencodian-model-workspace-toolbar-copy' });
    toolbarTextEl.createDiv({
      cls: 'opencodian-model-workspace-toolbar-label',
      text: t('settings.model.visualEditor.templateLabel'),
    });
    toolbarTextEl.createDiv({
      cls: 'opencodian-model-workspace-toolbar-hint',
      text: t('settings.model.visualEditor.templateHint'),
    });
    const templateButtonsEl = toolbarEl.createDiv({ cls: 'opencodian-model-workspace-template-buttons' });
    for (const option of PROVIDER_INTERFACE_FORMAT_OPTIONS) {
      const buttonEl = templateButtonsEl.createEl('button', {
        cls: 'opencodian-model-workspace-template-button',
        text: t(option.labelKey as never),
      });
      buttonEl.type = 'button';
      buttonEl.addEventListener('click', () => {
        this.addProviderFromTemplate(option.id);
      });
    }

    const workspaceEl = contentEl.createDiv({ cls: 'opencodian-model-workspace-layout' });
    const sidebarEl = workspaceEl.createDiv({ cls: 'opencodian-model-workspace-sidebar' });
    const editorEl = workspaceEl.createDiv({ cls: 'opencodian-model-workspace-editor' });

    this.renderProviderSidebar(sidebarEl);
    this.renderEditor(editorEl);

    const footerEl = contentEl.createDiv({ cls: 'opencodian-config-buttons opencodian-model-workspace-footer' });
    const saveButton = footerEl.createEl('button', {
      cls: 'mod-cta',
      text: t('settings.model.visualEditor.save'),
    });
    saveButton.type = 'button';
    saveButton.addEventListener('click', () => void this.save());

    const closeButton = footerEl.createEl('button', { text: t('settings.model.visualEditor.close') });
    closeButton.type = 'button';
    closeButton.addEventListener('click', () => this.close());
  }

  private renderProviderSidebar(containerEl: HTMLElement): void {
    const headerEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-sidebar-header' });
    const headlineEl = headerEl.createDiv({ cls: 'opencodian-model-workspace-sidebar-headline' });
    headlineEl.createDiv({
      cls: 'opencodian-model-workspace-sidebar-title',
      text: t('settings.model.visualEditor.providersTitle'),
    });
    const addButton = headlineEl.createEl('button', {
      cls: 'opencodian-model-workspace-sidebar-add mod-cta',
      text: t('settings.model.visualEditor.addProvider'),
    });
    addButton.type = 'button';
    addButton.addEventListener('click', () => {
      this.addProviderFromTemplate(DEFAULT_PROVIDER_INTERFACE_FORMAT);
    });

    headerEl.createDiv({
      cls: 'opencodian-model-workspace-sidebar-meta',
      text: t('settings.model.visualEditor.sidebarSummary', {
        providers: String(this.providers.length),
      }),
    });

    const listEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-provider-list' });
    for (const provider of this.providers) {
      const selected = provider.uid === this.selectedProviderUid;
      const itemEl = listEl.createEl('button', {
        cls: `opencodian-model-workspace-provider-item${selected ? ' is-selected' : ''}${provider.enabled ? '' : ' is-disabled'}`,
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

      const bodyEl = itemEl.createDiv({ cls: 'opencodian-model-workspace-provider-item-body' });
      const titleRowEl = bodyEl.createDiv({ cls: 'opencodian-model-workspace-provider-item-headline' });
      titleRowEl.createDiv({
        cls: 'opencodian-model-workspace-provider-item-title',
        text: provider.name.trim() || provider.id.trim() || t('settings.model.visualEditor.providerUntitled'),
      });
      bodyEl.createDiv({
        cls: 'opencodian-model-workspace-provider-item-meta',
        text: this.describeProviderListMeta(provider),
      });

      const badgesEl = bodyEl.createDiv({ cls: 'opencodian-model-workspace-provider-item-badges' });
      badgesEl.createSpan({
        cls: `opencodian-model-workspace-status-badge ${provider.enabled ? 'is-enabled' : 'is-disabled'}`,
        text: provider.enabled
          ? t('settings.model.visualEditor.providerEnabledBadge')
          : t('settings.model.visualEditor.providerDisabledBadge'),
      });

      const checkState = this.providerChecks.get(provider.uid);
      if (checkState && checkState.status !== 'idle') {
        badgesEl.createSpan({
          cls: `opencodian-model-workspace-status-badge ${this.getProviderCheckClass(checkState)}`,
          text: this.getProviderCheckLabel(checkState),
        });
      }
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

    const headerEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-editor-header' });
    const titleWrapEl = headerEl.createDiv({ cls: 'opencodian-model-workspace-editor-title-wrap' });
    titleWrapEl.createDiv({
      cls: 'opencodian-model-workspace-editor-title',
      text: provider.name.trim() || provider.id.trim() || t('settings.model.visualEditor.providerUntitled'),
    });
    titleWrapEl.createDiv({
      cls: 'opencodian-model-workspace-editor-subtitle',
      text: t('settings.model.visualEditor.editorSubtitle'),
    });

    const actionsEl = headerEl.createDiv({ cls: 'opencodian-model-workspace-editor-actions' });
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

    const providerEnabledField = identityGridEl.createDiv({ cls: 'opencodian-model-workspace-toggle-field' });
    providerEnabledField.createEl('label', { text: t('settings.model.visualEditor.providerAvailability') });
    const providerEnabledRow = providerEnabledField.createDiv({ cls: 'opencodian-model-workspace-toggle-row' });
    const providerEnabledInput = providerEnabledRow.createEl('input', { attr: { type: 'checkbox' } });
    providerEnabledInput.checked = provider.enabled;
    providerEnabledInput.addEventListener('change', () => {
      provider.enabled = providerEnabledInput.checked;
      this.updatePreview();
      this.render();
    });
    providerEnabledRow.createSpan({
      text: provider.enabled
        ? t('settings.model.visualEditor.providerEnabledHint')
        : t('settings.model.visualEditor.providerDisabledHint'),
    });
    providerEnabledRow.createSpan({
      cls: `opencodian-model-workspace-status-badge ${provider.enabled ? 'is-enabled' : 'is-disabled'}`,
      text: provider.enabled
        ? t('settings.model.visualEditor.providerEnabledBadge')
        : t('settings.model.visualEditor.providerDisabledBadge'),
    });

    this.createTextField(
      identityGridEl,
      `${t('settings.model.visualEditor.providerName')} *`,
      provider.name,
      (value) => {
        provider.name = value;
      },
      'My Provider',
    );
    this.createTextField(
      identityGridEl,
      `${t('settings.model.visualEditor.providerId')} *`,
      provider.id,
      (value) => {
        provider.id = value;
      },
      'my-provider',
      t('settings.model.visualEditor.providerIdDesc'),
      true,
    );

    const connectionSectionEl = sectionsEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    this.createSectionHeader(
      connectionSectionEl,
      t('settings.model.visualEditor.providerSectionTitle'),
      t('settings.model.visualEditor.providerSectionDesc'),
    );
    const connectionGridEl = connectionSectionEl.createDiv({ cls: 'opencodian-model-workspace-grid is-connection-grid' });
    this.createSelectField(
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
          provider.baseURL = next.defaultBaseUrl;
        }
        this.updatePreview();
        this.render();
      },
      t((PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === provider.interfaceFormat)?.descriptionKey
        ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1].descriptionKey) as never),
    );

    if (provider.interfaceFormat === 'custom') {
      this.createTextField(
        connectionGridEl,
        t('settings.model.visualEditor.customNpm'),
        provider.customNpm,
        (value) => {
          provider.customNpm = value;
        },
        '@scope/custom-adapter',
      );
    }

    const formatMeta = PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === provider.interfaceFormat)
      ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1];
    this.createTextField(
      connectionGridEl,
      `${t('settings.model.visualEditor.baseURL')} *`,
      provider.baseURL,
      (value) => {
        provider.baseURL = value;
      },
      formatMeta.baseUrlPlaceholder,
    );
    this.createTextField(
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

    const providerCheckState = this.providerChecks.get(provider.uid);
    if (providerCheckState && providerCheckState.status !== 'idle') {
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

    const advancedSectionEl = sectionsEl.createEl('details', { cls: 'opencodian-model-workspace-advanced' });
    advancedSectionEl.open = this.advancedSectionOpen;
    advancedSectionEl.addEventListener('toggle', () => {
      this.advancedSectionOpen = advancedSectionEl.open;
    });

    const advancedSummaryEl = advancedSectionEl.createEl('summary', {
      cls: 'opencodian-model-workspace-advanced-summary',
    });
    const advancedSummaryCopyEl = advancedSummaryEl.createDiv({ cls: 'opencodian-model-workspace-advanced-summary-copy' });
    advancedSummaryCopyEl.createDiv({
      cls: 'opencodian-model-workspace-section-title',
      text: t('settings.model.visualEditor.advancedTitle'),
    });
    advancedSummaryCopyEl.createDiv({
      cls: 'opencodian-model-workspace-section-desc',
      text: t('settings.model.visualEditor.advancedDesc'),
    });

    const advancedBodyEl = advancedSectionEl.createDiv({ cls: 'opencodian-model-workspace-advanced-body' });
    const advancedActionsEl = advancedBodyEl.createDiv({ cls: 'opencodian-model-workspace-advanced-actions' });
    const jsonButton = advancedActionsEl.createEl('button', { text: t('settings.model.config.jsonButton') });
    jsonButton.type = 'button';
    jsonButton.addEventListener('click', () => {
      new ModelConfigJsonModal(this.app, this.plugin).open();
    });

    const restartLabel = advancedBodyEl.createEl('label', {
      cls: 'opencodian-model-config-checkbox opencodian-model-workspace-restart-toggle',
    });
    this.restartToggleEl = restartLabel.createEl('input', { attr: { type: 'checkbox' } });
    this.restartToggleEl.checked = this.plugin.settings.server.mode === 'local';
    restartLabel.createSpan({ text: t('settings.model.config.restart') });

    const previewSectionEl = advancedBodyEl.createDiv({ cls: 'opencodian-model-workspace-advanced-preview' });
    previewSectionEl.createDiv({
      cls: 'opencodian-model-workspace-subsection-title',
      text: t('settings.model.visualEditor.previewTitle'),
    });
    previewSectionEl.createDiv({
      cls: 'opencodian-model-workspace-subsection-desc',
      text: t('settings.model.visualEditor.previewDesc'),
    });
    this.previewEl = previewSectionEl.createEl('textarea', {
      cls: 'opencodian-config-editor opencodian-model-config-json-editor',
      attr: {
        readonly: 'true',
        spellcheck: 'false',
      },
    });
    this.updatePreview();
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

    const rowEl = headerEl.createDiv({ cls: 'opencodian-model-workspace-model-header-fields is-compact' });
    const modelIdInput = rowEl.createEl('input', {
      cls: 'opencodian-model-workspace-model-input',
      attr: {
        type: 'text',
        placeholder: t('settings.model.visualEditor.modelId'),
        'aria-label': t('settings.model.visualEditor.modelId'),
      },
    });
    modelIdInput.value = model.id;
    modelIdInput.addEventListener('input', () => {
      model.id = modelIdInput.value;
      this.updatePreview();
    });
    modelIdInput.addEventListener('blur', () => {
      this.render();
    });

    const modelNameInput = rowEl.createEl('input', {
      cls: 'opencodian-model-workspace-model-input',
      attr: {
        type: 'text',
        placeholder: t('settings.model.visualEditor.modelName'),
        'aria-label': t('settings.model.visualEditor.modelName'),
      },
    });
    modelNameInput.value = model.name;
    modelNameInput.addEventListener('input', () => {
      model.name = modelNameInput.value;
      this.updatePreview();
    });
    modelNameInput.addEventListener('blur', () => {
      this.render();
    });

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

    const deleteButton = headerEl.createEl('button', {
      cls: 'opencodian-model-workspace-danger-button',
      text: t('settings.model.visualEditor.deleteModel'),
    });
    deleteButton.type = 'button';
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
    const gridEl = detailsEl.createDiv({ cls: 'opencodian-model-workspace-grid is-model-limits-grid' });
    this.createTextField(
      gridEl,
      t('settings.model.visualEditor.contextLimit'),
      model.context,
      (value) => {
        model.context = value;
      },
      '200000',
    );
    this.createTextField(
      gridEl,
      t('settings.model.visualEditor.outputLimit'),
      model.output,
      (value) => {
        model.output = value;
      },
      '65536',
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
  ): void {
    const sectionEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-subsection' });
    const headerEl = sectionEl.createDiv({ cls: 'opencodian-model-workspace-subsection-header' });
    headerEl.createDiv({
      cls: 'opencodian-model-workspace-subsection-title',
      text: title,
    });
    const addButton = headerEl.createEl('button', {
      text: t('settings.model.visualEditor.addField'),
    });
    addButton.type = 'button';
    addButton.addEventListener('click', onAdd);
    sectionEl.createDiv({
      cls: 'opencodian-model-workspace-subsection-desc',
      text: description,
    });

    if (values.length === 0) {
      sectionEl.createDiv({
        cls: 'opencodian-model-workspace-empty small',
        text: t('settings.model.visualEditor.noExtraFields'),
      });
      return;
    }

    const listEl = sectionEl.createDiv({ cls: 'opencodian-model-workspace-keyvalue-list' });
    for (const field of values) {
      const rowEl = listEl.createDiv({ cls: 'opencodian-model-workspace-keyvalue-row' });
      const keyInput = rowEl.createEl('input', {
        cls: 'opencodian-model-workspace-keyvalue-input',
        attr: {
          type: 'text',
          placeholder: t('settings.model.visualEditor.fieldKeyPlaceholder'),
        },
      });
      keyInput.value = field.key;
      keyInput.addEventListener('input', () => {
        onKeyChange(field.uid, keyInput.value);
      });
      const valueInput = rowEl.createEl('textarea', {
        cls: 'opencodian-model-workspace-keyvalue-textarea',
        attr: {
          rows: '2',
          placeholder: t('settings.model.visualEditor.fieldValuePlaceholder'),
        },
      });
      valueInput.value = field.value;
      valueInput.addEventListener('input', () => {
        onValueChange(field.uid, valueInput.value);
      });
      const removeButton = rowEl.createEl('button', {
        cls: 'opencodian-model-workspace-danger-button',
        text: t('settings.model.visualEditor.removeField'),
      });
      removeButton.type = 'button';
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
    rerenderOnBlur = false,
    secret = false,
  ): HTMLElement {
    const fieldEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-field' });
    fieldEl.createEl('label', { text: label });
    const inputEl = fieldEl.createEl('input', { attr: { type: secret ? 'password' : 'text' } });
    inputEl.value = value;
    inputEl.placeholder = placeholder;
    inputEl.addEventListener('input', () => {
      onChange(inputEl.value);
      this.updatePreview();
    });
    if (rerenderOnBlur) {
      inputEl.addEventListener('blur', () => {
        this.render();
      });
    }
    if (description) {
      fieldEl.createDiv({
        cls: 'opencodian-model-workspace-field-description',
        text: description,
      });
    }
    return fieldEl;
  }

  private createSelectField(
    containerEl: HTMLElement,
    label: string,
    value: string,
    options: Array<{ value: string; label: string }>,
    onChange: (value: string) => void,
    description?: string,
  ): void {
    const fieldEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-field' });
    fieldEl.createEl('label', { text: label });
    const selectEl = fieldEl.createEl('select');
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
    this.providers.push(provider);
    this.selectedProviderUid = provider.uid;
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
    if (this.providers.length === 0) {
      const next = createEmptyProvider(DEFAULT_PROVIDER_INTERFACE_FORMAT);
      this.providers = [next];
      this.selectedProviderUid = next.uid;
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
    try {
      const subset = this.buildAvailabilitySubset();
      this.previewEl.value = buildConfigPreview(
        this.modelValue,
        this.smallModelValue,
        this.providers,
        subset,
      );
    } catch (error) {
      this.previewEl.value = error instanceof Error ? error.message : String(error);
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
      subset = setProviderEnabled(
        subset,
        providerId,
        provider.enabled,
        providerIds,
        this.serverConfigAtOpen,
      );
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

      const nextProvider: OpencodeProviderConfig = { ...provider.raw };
      nextProvider.name = providerName;
      nextProvider.npm = resolveNpmForInterfaceFormat(provider);
      const nextOptions = typeof nextProvider.options === 'object' && nextProvider.options !== null && !Array.isArray(nextProvider.options)
        ? { ...nextProvider.options }
        : {};
      nextOptions.baseURL = baseURL;
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
          throw new Error(t('settings.model.visualEditor.errorModelId'));
        }
        if (Object.prototype.hasOwnProperty.call(models, modelId)) {
          throw new Error(t('settings.model.visualEditor.errorModelDuplicate'));
        }

        const nextModel: OpencodeProviderModelConfig = { ...model.raw };
        if (model.name.trim()) {
          nextModel.name = model.name.trim();
        } else {
          delete nextModel.name;
        }

        const nextLimit = typeof nextModel.limit === 'object' && nextModel.limit !== null && !Array.isArray(nextModel.limit)
          ? { ...nextModel.limit }
          : {};
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

        const nextOptions = typeof nextModel.options === 'object' && nextModel.options !== null && !Array.isArray(nextModel.options)
          ? { ...nextModel.options }
          : {};
        for (const entry of model.options) {
          const key = entry.key.trim();
          if (!key) {
            continue;
          }
          nextOptions[key] = parseLooseValue(entry.value);
        }
        if (Object.keys(nextOptions).length > 0) {
          nextModel.options = nextOptions;
        } else {
          delete nextModel.options;
        }

        for (const entry of model.extraFields) {
          const key = entry.key.trim();
          if (!key) {
            continue;
          }
          nextModel[key] = parseLooseValue(entry.value);
        }

        models[modelId] = nextModel;
        return models;
      }, {});

      nextProvider.models = modelEntries;
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
      new Notice(t('settings.model.visualEditor.saveSuccess'));
      this.close();
    } catch (error) {
      logger.error('Failed to save visual model config:', error);
      new Notice(`${t('settings.model.visualEditor.saveFailed')}: ${(error as Error).message}`);
    }
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

  private createKeyValueState(): KeyValueFieldState {
    return {
      uid: `field-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      key: '',
      value: '',
    };
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
