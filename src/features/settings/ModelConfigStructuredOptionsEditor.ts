import { t } from '../../i18n';
import type { ModelConfigTextFieldConfig } from './ModelConfigModelListEditor';
import {
  getStructuredModelOptionsState,
  setStructuredModelOption,
  setStructuredStringArrayOption,
  setStructuredThinkingBudget,
  setStructuredThinkingType,
} from './modelConfigStructuredOptions';
import type { ModelFormState } from './modelConfigWorkspace';

interface ModelConfigStructuredOptionsEditorOptions {
  bindEditableControl: (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => void;
  createTextField: (containerEl: HTMLElement, config: ModelConfigTextFieldConfig) => HTMLElement;
  createSubsectionHeader: (containerEl: HTMLElement, title: string, description: string) => HTMLDivElement;
  updatePreview: () => void;
  rerender: () => void;
}

export class ModelConfigStructuredOptionsEditor {
  constructor(private readonly options: ModelConfigStructuredOptionsEditorOptions) {}

  render(containerEl: HTMLElement, model: ModelFormState): void {
    const state = getStructuredModelOptionsState(model.options);
    const structuredEl = containerEl.createDiv({
      cls: 'opencodian-model-workspace-subsection opencodian-model-workspace-structured-options',
    });
    this.options.createSubsectionHeader(
      structuredEl,
      t('settings.model.visualEditor.structuredOptionsTitle'),
      t('settings.model.visualEditor.structuredOptionsDesc'),
    );
    const gridEl = structuredEl.createDiv({ cls: 'opencodian-model-workspace-grid is-structured-options-grid' });

    this.renderSelect(gridEl, {
      label: t('settings.model.visualEditor.reasoningEffort'),
      value: state.reasoningEffort,
      options: ['', 'minimal', 'low', 'medium', 'high', 'xhigh'],
      onChange: (value) => {
        model.options = setStructuredModelOption(model.options, 'reasoningEffort', value);
      },
    });
    this.renderSelect(gridEl, {
      label: t('settings.model.visualEditor.textVerbosity'),
      value: state.textVerbosity,
      options: ['', 'low', 'medium', 'high'],
      onChange: (value) => {
        model.options = setStructuredModelOption(model.options, 'textVerbosity', value);
      },
    });
    this.renderSelect(gridEl, {
      label: t('settings.model.visualEditor.reasoningSummary'),
      value: state.reasoningSummary,
      options: ['', 'auto', 'concise', 'detailed'],
      onChange: (value) => {
        model.options = setStructuredModelOption(model.options, 'reasoningSummary', value);
      },
    });
    this.renderSelect(gridEl, {
      label: t('settings.model.visualEditor.thinkingType'),
      value: state.thinkingType,
      options: ['', 'enabled', 'disabled', 'auto'],
      onChange: (value) => {
        model.options = setStructuredThinkingType(model.options, value);
      },
    });
    this.renderText(gridEl, {
      label: t('settings.model.visualEditor.thinkingBudgetTokens'),
      value: state.thinkingBudgetTokens,
      placeholder: '4096',
      onChange: (value) => {
        model.options = setStructuredThinkingBudget(model.options, value);
      },
    });
    const includeField = this.renderText(gridEl, {
      label: t('settings.model.visualEditor.includeOption'),
      value: state.include.join(', '),
      placeholder: 'reasoning.encrypted_content',
      onChange: (value) => {
        model.options = setStructuredStringArrayOption(model.options, 'include', value);
      },
    });
    includeField.addClass('is-full-span');
  }

  private renderSelect(
    containerEl: HTMLElement,
    config: {
      label: string;
      value: string;
      options: string[];
      onChange: (value: string) => void;
    },
  ): HTMLElement {
    const fieldEl = containerEl.createDiv({ cls: 'opencodian-model-workspace-field' });
    fieldEl.createEl('label', {
      cls: 'opencodian-model-workspace-field-label',
      text: config.label,
    });
    const selectEl = fieldEl.createEl('select', { cls: 'opencodian-model-workspace-input' });
    for (const option of config.options) {
      selectEl.createEl('option', {
        value: option,
        text: option || t('settings.model.visualEditor.structuredOptionUnset'),
      });
    }
    selectEl.value = config.value;
    this.options.bindEditableControl(selectEl);
    selectEl.addEventListener('change', () => {
      config.onChange(selectEl.value);
      this.options.updatePreview();
      this.options.rerender();
    });
    return fieldEl;
  }

  private renderText(
    containerEl: HTMLElement,
    config: {
      label: string;
      value: string;
      placeholder: string;
      onChange: (value: string) => void;
    },
  ): HTMLElement {
    return this.options.createTextField(containerEl, {
      label: config.label,
      value: config.value,
      placeholder: config.placeholder,
      onChange: (value) => {
        config.onChange(value);
      },
    });
  }
}
