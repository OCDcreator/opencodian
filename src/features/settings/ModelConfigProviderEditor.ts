import { setIcon } from 'obsidian';

import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { ModelConfigJsonModal } from './ModelConfigJsonModal';
import {
  createModelConfigKeyValueState,
  type ModelConfigModalFlow,
} from './modelConfigModalState';
import type {
  ModelConfigKeyValueEditorConfig,
  ModelConfigSelectFieldConfig,
  ModelConfigTextFieldConfig,
} from './ModelConfigModelListEditor';
import { ModelConfigModelListEditor } from './ModelConfigModelListEditor';
import {
  PROVIDER_INTERFACE_FORMAT_OPTIONS,
  type ProviderFormState,
  type ProviderInterfaceFormatId,
  type ProviderInterfaceFormatOption,
} from './modelConfigWorkspace';
import { ProviderIconCacheModal } from './ProviderIconCacheModal';

export type ProviderCheckState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; message: string }
  | { status: 'warning'; message: string }
  | { status: 'error'; message: string };

export interface SelectedProviderEditorState {
  flow: ModelConfigModalFlow;
  provider: ProviderFormState;
  providerCheckState: ProviderCheckState;
}

interface ModelConfigProviderEditorOptions {
  plugin: OpenCodianPlugin;
  getFlow: () => ModelConfigModalFlow;
  expandedModelUids: Set<string>;
  getModelValue: () => string;
  setModelValue: (value: string) => void;
  getSmallModelValue: () => string;
  setSmallModelValue: (value: string) => void;
  getProviderCheckState: (providerUid: string) => ProviderCheckState | undefined;
  getFetchedModelCandidates: (providerUid: string) => Array<{
    id: string;
    name: string;
    context?: number;
    output?: number;
  }>;
  setPreviewEl: (element: HTMLTextAreaElement | null) => void;
  setRestartToggleEl: (element: HTMLInputElement | null) => void;
  setJsonDraftValue: (value: string) => void;
  updatePreview: () => void;
  rerender: () => void;
  runProviderCheck: (provider: ProviderFormState) => void;
  fetchModelsForProvider: (provider: ProviderFormState) => void;
  importFetchedModels: (
    provider: ProviderFormState,
    candidates: Array<{
      id: string;
      name: string;
      context?: number;
      output?: number;
    }>,
  ) => void;
  deleteSelectedProvider: () => void;
  syncProviderRawFromJsonDraft: (provider: ProviderFormState) => void;
  formatAddProviderJson: () => void;
}

export class ModelConfigProviderEditor {
  private readonly modelListEditor: ModelConfigModelListEditor;

  constructor(private readonly options: ModelConfigProviderEditorOptions) {
    this.modelListEditor = new ModelConfigModelListEditor({
      expandedModelUids: options.expandedModelUids,
      getFlow: options.getFlow,
      getFetchedModelCandidates: options.getFetchedModelCandidates,
      fetchModelsForProvider: options.fetchModelsForProvider,
      importFetchedModels: options.importFetchedModels,
      updatePreview: options.updatePreview,
      rerender: options.rerender,
      bindEditableControl: (element) => this.bindEditableControl(element),
      createTextField: (containerEl, config) => this.createTextField(containerEl, config),
      createSectionHeader: (containerEl, title, description) => this.createSectionHeader(containerEl, title, description),
      createSubsectionHeader: (containerEl, title, description) => this.createSubsectionHeader(containerEl, title, description),
      renderKeyValueEditor: (containerEl, config) => this.renderKeyValueEditor(containerEl, config),
    });
  }

  renderWorkspaceEditor(containerEl: HTMLElement, editorState: SelectedProviderEditorState): void {
    const { provider } = editorState;
    const formatMeta = this.getProviderInterfaceFormatMeta(provider.interfaceFormat);
    this.renderProviderToolbar(containerEl, provider);
    const sectionsEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-editor-panel' });
    this.renderProviderIdentitySection(sectionsEl, provider, false);
    this.renderProviderConnectionSection(sectionsEl, editorState, formatMeta, false);
    this.renderProviderExtraOptionsSection(
      sectionsEl,
      provider,
      t('settings.model.visualEditor.extraOptionsDesc'),
    );
    this.modelListEditor.renderWorkspaceModelsSection(sectionsEl, provider, formatMeta);
    this.renderProviderDefaultsSection(sectionsEl);
    this.renderWorkspacePreviewSection(sectionsEl);
  }

  renderAddProviderEditor(containerEl: HTMLElement, editorState: SelectedProviderEditorState): void {
    const { provider } = editorState;
    const formatMeta = this.getProviderInterfaceFormatMeta(provider.interfaceFormat);
    containerEl.addClass('is-add-provider-flow');
    this.options.setRestartToggleEl(null);

    const sectionsEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-editor-panel is-add-provider-flow' });
    this.renderProviderIdentitySection(sectionsEl, provider, true);
    this.renderProviderConnectionSection(sectionsEl, editorState, formatMeta, true);
    this.renderProviderExtraOptionsSection(
      sectionsEl,
      provider,
      t('settings.model.visualEditor.addProviderExtraOptionsDesc'),
    );
    this.modelListEditor.renderAddProviderModelsSection(sectionsEl, provider, formatMeta);
    this.renderAddProviderPreviewSection(sectionsEl, provider);
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
      this.options.updatePreview();
      this.options.rerender();
    });
    availabilityLabel.createSpan({
      text: t('settings.model.visualEditor.providerAvailability'),
    });

    const utilityActionsEl = actionsEl.createDiv({ cls: 'opencodian-model-workspace-editor-actions-group' });
    const providerCheckState = this.options.getProviderCheckState(provider.uid);
    const providerTestButton = utilityActionsEl.createEl('button', {
      text: providerCheckState?.status === 'loading'
        ? t('settings.model.availability.check.loading')
        : t('settings.model.visualEditor.testProvider'),
    });
    providerTestButton.type = 'button';
    providerTestButton.disabled = providerCheckState?.status === 'loading' || !provider.id.trim();
    providerTestButton.addEventListener('click', () => {
      this.options.runProviderCheck(provider);
    });

    const iconButton = utilityActionsEl.createEl('button', {
      text: t('settings.model.visualEditor.manageIcons'),
    });
    iconButton.type = 'button';
    iconButton.disabled = !provider.id.trim();
    iconButton.addEventListener('click', () => {
      new ProviderIconCacheModal(
        this.options.plugin.app,
        this.options.plugin,
        provider.id.trim() ? [provider.id.trim()] : [],
        () => {
          this.options.rerender();
        },
      ).open();
    });

    const dangerActionsEl = actionsEl.createDiv({ cls: 'opencodian-model-workspace-editor-actions-group is-danger' });
    const deleteButton = dangerActionsEl.createEl('button', {
      cls: 'opencodian-model-workspace-danger-button',
      text: t('settings.model.visualEditor.deleteProvider'),
    });
    deleteButton.type = 'button';
    deleteButton.addEventListener('click', () => {
      this.options.deleteSelectedProvider();
    });
  }

  private renderProviderIdentitySection(
    containerEl: HTMLElement,
    provider: ProviderFormState,
    sanitizeProviderId: boolean,
  ): void {
    const identitySectionEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    if (!sanitizeProviderId) {
      this.createSectionHeader(
        identitySectionEl,
        t('settings.model.visualEditor.identitySectionTitle'),
        t('settings.model.visualEditor.identitySectionDesc'),
      );
    }
    const identityGridEl = identitySectionEl.createDiv({ cls: 'opencodian-model-workspace-grid is-identity-grid' });
    const providerIdField = this.createTextField(identityGridEl, {
      label: `${t('settings.model.visualEditor.providerId')} *`,
      value: provider.id,
      onChange: (value) => {
        provider.id = sanitizeProviderId
          ? value.toLowerCase().replace(/[^a-z0-9-]/g, '')
          : value;
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
      placeholder: sanitizeProviderId
        ? t('settings.model.visualEditor.providerNamePlaceholder')
        : 'My Provider',
    });
    providerNameField.addClass('is-full-span');
  }

  private renderProviderConnectionSection(
    containerEl: HTMLElement,
    editorState: SelectedProviderEditorState,
    formatMeta: ProviderInterfaceFormatOption,
    addProviderFlow: boolean,
  ): void {
    const { provider, providerCheckState } = editorState;
    const connectionSectionEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    if (!addProviderFlow) {
      this.createSectionHeader(
        connectionSectionEl,
        t('settings.model.visualEditor.providerSectionTitle'),
        t('settings.model.visualEditor.providerSectionDesc'),
      );
    }
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
        this.options.updatePreview();
        this.options.rerender();
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

    const apiKeyField = this.createTextField(connectionGridEl, {
      label: t('settings.model.visualEditor.apiKey'),
      value: provider.apiKey,
      onChange: (value) => {
        provider.apiKey = value;
      },
      placeholder: addProviderFlow
        ? formatMeta.apiKeyPlaceholder || t('settings.model.visualEditor.apiKeyPlaceholder')
        : formatMeta.apiKeyPlaceholder,
      description: addProviderFlow ? t('settings.model.visualEditor.apiKeyAutoFill') : undefined,
      secret: true,
    });
    apiKeyField.addClass('is-full-span');

    const baseUrlField = this.createTextField(connectionGridEl, {
      label: `${t('settings.model.visualEditor.baseURL')} *`,
      value: provider.baseURL,
      onChange: (value) => {
        provider.baseURL = value;
      },
      placeholder: addProviderFlow
        ? this.getProviderBaseUrlPlaceholder(provider, formatMeta.baseUrlPlaceholder)
        : formatMeta.baseUrlPlaceholder,
    });
    baseUrlField.addClass('is-full-span');

    if (!addProviderFlow && providerCheckState.status !== 'idle' && providerCheckState.status !== 'loading') {
      connectionSectionEl.createDiv({
        cls: `opencodian-model-workspace-inline-status ${this.getProviderCheckClass(providerCheckState)}`,
        text: providerCheckState.message,
      });
    }
  }

  private renderProviderExtraOptionsSection(
    containerEl: HTMLElement,
    provider: ProviderFormState,
    description: string,
  ): void {
    const extraOptionsSectionEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    this.renderKeyValueEditor(extraOptionsSectionEl, {
      title: t('settings.model.visualEditor.extraOptionsTitle'),
      description,
      values: provider.extraOptions,
      onAdd: () => {
        provider.extraOptions.push(createModelConfigKeyValueState());
        this.options.updatePreview();
        this.options.rerender();
      },
      onRemove: (uid) => {
        provider.extraOptions = provider.extraOptions.filter((entry) => entry.uid !== uid);
        this.options.updatePreview();
        this.options.rerender();
      },
      onKeyChange: (uid, value) => {
        const field = provider.extraOptions.find((entry) => entry.uid === uid);
        if (!field) {
          return;
        }
        field.key = value;
        this.options.updatePreview();
      },
      onValueChange: (uid, value) => {
        const field = provider.extraOptions.find((entry) => entry.uid === uid);
        if (!field) {
          return;
        }
        field.value = value;
        this.options.updatePreview();
      },
      stackedLabels: true,
      iconRemoveButton: true,
    });
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
      value: this.options.getModelValue(),
      onChange: (value) => {
        this.options.setModelValue(value);
      },
      placeholder: 'provider/model',
      description: t('settings.model.visualEditor.defaultModelDesc'),
    });
    this.createTextField(defaultsGridEl, {
      label: t('settings.model.visualEditor.smallModel'),
      value: this.options.getSmallModelValue(),
      onChange: (value) => {
        this.options.setSmallModelValue(value);
      },
      placeholder: 'provider/model',
      description: t('settings.model.visualEditor.smallModelDesc'),
    });
  }

  private renderWorkspacePreviewSection(containerEl: HTMLElement): void {
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
      new ModelConfigJsonModal(this.options.plugin.app, this.options.plugin).open();
    });

    const restartLabel = previewToolbarEl.createEl('label', {
      cls: 'opencodian-model-config-checkbox opencodian-model-workspace-restart-toggle',
    });
    const restartToggleEl = restartLabel.createEl('input', { attr: { type: 'checkbox' } });
    restartToggleEl.checked = this.options.plugin.settings.server.mode === 'local';
    restartLabel.createSpan({ text: t('settings.model.config.restart') });
    this.options.setRestartToggleEl(restartToggleEl);

    const previewEl = previewSectionEl.createEl('textarea', {
      cls: 'opencodian-config-editor opencodian-model-config-json-editor',
      attr: {
        readonly: 'true',
        spellcheck: 'false',
      },
    });
    this.options.setPreviewEl(previewEl);
    this.options.updatePreview();
  }

  private renderAddProviderPreviewSection(
    containerEl: HTMLElement,
    provider: ProviderFormState,
  ): void {
    const previewSectionEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
    this.createSectionHeader(
      previewSectionEl,
      t('settings.model.visualEditor.addProviderPreviewTitle'),
      t('settings.model.visualEditor.addProviderPreviewDesc'),
    );
    const previewEl = previewSectionEl.createEl('textarea', {
      cls: 'opencodian-config-editor opencodian-model-config-json-editor is-add-provider-flow',
      attr: {
        spellcheck: 'false',
      },
    });
    previewEl.addEventListener('input', () => {
      this.options.setJsonDraftValue(previewEl.value);
      this.options.syncProviderRawFromJsonDraft(provider);
    });
    this.options.setPreviewEl(previewEl);

    const previewActionsEl = previewSectionEl.createDiv({ cls: 'opencodian-model-workspace-json-actions' });
    const formatButton = previewActionsEl.createEl('button', {
      text: t('settings.model.jsonEditor.format'),
    });
    formatButton.type = 'button';
    formatButton.addEventListener('click', () => {
      this.options.formatAddProviderJson();
    });

    this.options.updatePreview();
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
    }: ModelConfigTextFieldConfig,
  ): HTMLElement {
    const fieldEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-field' });
    fieldEl.createEl('label', { text: label });
    const inputEl = fieldEl.createEl('input', { attr: { type: secret ? 'password' : 'text' } });
    this.bindEditableControl(inputEl);
    inputEl.value = value;
    inputEl.placeholder = placeholder;
    inputEl.addEventListener('input', () => {
      onChange(inputEl.value);
      this.options.updatePreview();
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
    }: ModelConfigSelectFieldConfig,
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
      this.options.updatePreview();
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
    }: ModelConfigKeyValueEditorConfig,
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

  private getProviderInterfaceFormatMeta(value: ProviderInterfaceFormatId): ProviderInterfaceFormatOption {
    return PROVIDER_INTERFACE_FORMAT_OPTIONS.find((entry) => entry.id === value)
      ?? PROVIDER_INTERFACE_FORMAT_OPTIONS[1];
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
}
