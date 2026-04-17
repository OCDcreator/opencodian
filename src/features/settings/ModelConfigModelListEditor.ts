import { setIcon } from 'obsidian';

import { t } from '../../i18n';
import {
  createModelConfigKeyValueState,
  type ModelConfigModalFlow,
} from './modelConfigModalState';
import {
  createEmptyModel,
  type FetchedProviderModelCandidate,
  type KeyValueFieldState,
  type ModelFormState,
  type ProviderFormState,
  type ProviderInterfaceFormatOption,
} from './modelConfigWorkspace';

export type ModelKeyValueCollectionKey = 'options' | 'variants' | 'extraFields';

export interface ModelConfigTextFieldConfig {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
  secret?: boolean;
}

export interface ModelConfigSelectFieldOption {
  value: string;
  label: string;
}

export interface ModelConfigSelectFieldConfig {
  label: string;
  value: string;
  options: ModelConfigSelectFieldOption[];
  onChange: (value: string) => void;
  description?: string;
}

export interface ModelConfigKeyValueEditorConfig {
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

interface ModelConfigModelListEditorOptions {
  expandedModelUids: Set<string>;
  getFlow: () => ModelConfigModalFlow;
  getFetchedModelCandidates: (providerUid: string) => FetchedProviderModelCandidate[];
  fetchModelsForProvider: (provider: ProviderFormState) => void;
  importFetchedModels: (
    provider: ProviderFormState,
    candidates: FetchedProviderModelCandidate[],
  ) => void;
  updatePreview: () => void;
  rerender: () => void;
  bindEditableControl: (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => void;
  createTextField: (containerEl: HTMLElement, config: ModelConfigTextFieldConfig) => HTMLElement;
  createSectionHeader: (containerEl: HTMLElement, title: string, description: string) => void;
  createSubsectionHeader: (containerEl: HTMLElement, title: string, description: string) => HTMLDivElement;
  renderKeyValueEditor: (containerEl: HTMLElement, config: ModelConfigKeyValueEditorConfig) => void;
}

export class ModelConfigModelListEditor {
  constructor(private readonly options: ModelConfigModelListEditorOptions) {}

  renderWorkspaceModelsSection(
    containerEl: HTMLElement,
    provider: ProviderFormState,
    formatMeta: ProviderInterfaceFormatOption,
  ): void {
    const modelsSectionEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-section' });
    this.options.createSectionHeader(
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
    this.renderFetchButton(modelButtonsEl, provider, formatMeta);

    const addModelButton = modelButtonsEl.createEl('button', {
      cls: 'mod-cta',
      text: t('settings.model.visualEditor.addModel'),
    });
    addModelButton.type = 'button';
    addModelButton.addEventListener('click', () => {
      this.addModel(provider);
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

  renderAddProviderModelsSection(
    containerEl: HTMLElement,
    provider: ProviderFormState,
    formatMeta: ProviderInterfaceFormatOption,
  ): void {
    const modelsSectionEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-section is-flow-section' });
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
    this.renderFetchButton(modelButtonsEl, provider, formatMeta);

    const addModelButton = modelButtonsEl.createEl('button', {
      text: t('settings.model.visualEditor.addModel'),
    });
    addModelButton.type = 'button';
    addModelButton.addEventListener('click', () => {
      this.addModel(provider);
    });

    if (provider.models.length === 0) {
      modelsSectionEl.createDiv({
        cls: 'opencodian-model-workspace-empty is-prominent',
        text: t('settings.model.visualEditor.noModels'),
      });
      return;
    }

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

  private renderFetchButton(
    containerEl: HTMLElement,
    provider: ProviderFormState,
    formatMeta: ProviderInterfaceFormatOption,
  ): void {
    const fetchButton = containerEl.createEl('button', {
      text: t('settings.model.visualEditor.fetchModels'),
    });
    fetchButton.type = 'button';
    fetchButton.disabled = !formatMeta.canFetchModels;
    fetchButton.addEventListener('click', () => {
      this.options.fetchModelsForProvider(provider);
    });
  }

  private renderFetchedModelCandidates(containerEl: HTMLElement, provider: ProviderFormState): void {
    const fetchedCandidates = this.options.getFetchedModelCandidates(provider.uid);
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
      this.options.importFetchedModels(provider, fetchedCandidates);
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

  private renderModelCard(containerEl: HTMLElement, provider: ProviderFormState, model: ModelFormState): void {
    const expanded = this.options.expandedModelUids.has(model.uid);
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
        this.options.expandedModelUids.delete(model.uid);
      } else {
        this.options.expandedModelUids.add(model.uid);
      }
      this.options.rerender();
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
    this.options.bindEditableControl(modelIdInput);
    modelIdInput.value = model.id;
    modelIdInput.addEventListener('input', () => {
      model.id = modelIdInput.value;
      this.options.updatePreview();
    });

    const modelNameInput = rowEl.createEl('input', {
      cls: 'opencodian-model-workspace-model-input',
      attr: {
        type: 'text',
        placeholder: t('settings.model.visualEditor.modelName'),
        'aria-label': t('settings.model.visualEditor.modelName'),
      },
    });
    this.options.bindEditableControl(modelNameInput);
    modelNameInput.value = model.name;
    modelNameInput.addEventListener('input', () => {
      model.name = modelNameInput.value;
      this.options.updatePreview();
    });

    if (!this.isAddProviderFlow()) {
      const modelToggleWrap = headerEl.createDiv({ cls: 'opencodian-model-workspace-model-toggle' });
      const modelToggle = modelToggleWrap.createEl('input', { attr: { type: 'checkbox' } });
      modelToggle.checked = model.enabled;
      modelToggle.addEventListener('change', () => {
        model.enabled = modelToggle.checked;
        this.options.updatePreview();
        this.options.rerender();
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
      this.options.expandedModelUids.delete(model.uid);
      this.options.updatePreview();
      this.options.rerender();
    });
  }

  private renderExpandedModelCardDetails(modelEl: HTMLElement, model: ModelFormState): void {
    const detailsEl = modelEl.createDiv({ cls: 'opencodian-model-workspace-model-details' });
    const limitsSectionEl = detailsEl.createDiv({
      cls: 'opencodian-model-workspace-subsection opencodian-model-workspace-model-limit-section',
    });
    this.options.createSubsectionHeader(
      limitsSectionEl,
      t('settings.model.visualEditor.modelLimitsTitle'),
      t('settings.model.visualEditor.modelLimitsDesc'),
    );
    const limitsGridEl = limitsSectionEl.createDiv({ cls: 'opencodian-model-workspace-grid is-model-limits-grid' });
    this.options.createTextField(limitsGridEl, {
      label: t('settings.model.visualEditor.contextLimit'),
      value: model.context,
      onChange: (value) => {
        model.context = value;
      },
      placeholder: '200000',
      description: t('settings.model.visualEditor.contextLimitDesc'),
    });
    this.options.createTextField(limitsGridEl, {
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
    }: Pick<ModelConfigKeyValueEditorConfig, 'title' | 'description' | 'emptyState' | 'keyPlaceholder' | 'valuePlaceholder'>,
  ): void {
    this.options.renderKeyValueEditor(containerEl, {
      title,
      description,
      values: model[field],
      onAdd: () => {
        model[field].push(createModelConfigKeyValueState());
        this.options.updatePreview();
        this.options.rerender();
      },
      onRemove: (uid) => {
        model[field] = model[field].filter((entry) => entry.uid !== uid);
        this.options.updatePreview();
        this.options.rerender();
      },
      onKeyChange: (uid, value) => {
        const target = model[field].find((entry) => entry.uid === uid);
        if (!target) {
          return;
        }
        target.key = value;
        this.options.updatePreview();
      },
      onValueChange: (uid, value) => {
        const target = model[field].find((entry) => entry.uid === uid);
        if (!target) {
          return;
        }
        target.value = value;
        this.options.updatePreview();
      },
      emptyState,
      keyPlaceholder,
      valuePlaceholder,
    });
  }

  private addModel(provider: ProviderFormState): void {
    provider.models.push(createEmptyModel());
    this.options.updatePreview();
    this.options.rerender();
  }

  private isAddProviderFlow(): boolean {
    return this.options.getFlow() === 'add-provider';
  }
}
