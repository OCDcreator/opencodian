import { App, Modal, setIcon } from 'obsidian';

import { t } from '../../i18n';
import { filterModelPickerGroups, type ModelPickerGroup, type ModelPickerOption } from './modelPicker';
import { enhanceSearchInput, type SearchInputEnhancerHandle } from './searchInputEnhancer';

interface ModelPickerModalOptions {
  title: string;
  description: string;
  groups: ModelPickerGroup[];
  selectedRef?: string;
  emptySelectionLabel?: string;
  onChoose: (option: ModelPickerOption | null) => void | Promise<void>;
}

export class ModelPickerModal extends Modal {
  private readonly options: ModelPickerModalOptions;
  private searchInputEl: HTMLInputElement | null = null;
  private listEl: HTMLElement | null = null;
  private highlightedValue = '';
  private providerFilter = '';
  private query = '';
  private searchEnhancer: SearchInputEnhancerHandle | null = null;

  constructor(app: App, options: ModelPickerModalOptions) {
    super(app);
    this.options = options;
  }

  onOpen(): void {
    this.contentEl.empty();
    this.modalEl.addClass('opencodian-model-picker-modal');

    this.contentEl.createEl('h2', { text: this.options.title });
    this.contentEl.createEl('p', {
      cls: 'opencodian-model-picker-modal-desc',
      text: this.options.description,
    });

    const controlsEl = this.contentEl.createDiv({ cls: 'opencodian-model-picker-controls' });

    const providerFilterWrapEl = controlsEl.createDiv({
      cls: 'opencodian-model-picker-provider-select-wrap',
    });
    const providerFilterEl = providerFilterWrapEl.createEl('select', {
      cls: 'opencodian-model-picker-provider-select',
      attr: {
        'aria-label': t('settings.model.picker.providerLabel'),
      },
    });
    providerFilterEl.createEl('option', {
      value: '',
      text: t('settings.model.picker.providerAll'),
    });
    for (const group of this.options.groups) {
      providerFilterEl.createEl('option', {
        value: group.providerId,
        text: group.providerName,
      });
    }
    providerFilterEl.value = this.providerFilter;
    providerFilterEl.addEventListener('change', () => {
      this.providerFilter = providerFilterEl.value;
      this.highlightedValue = '';
      this.renderList();
    });
    const providerFilterChevronEl = providerFilterWrapEl.createSpan({
      cls: 'opencodian-model-picker-provider-select-chevron',
    });
    setIcon(providerFilterChevronEl, 'chevron-down');

    const searchWrapperEl = controlsEl.createDiv({ cls: 'opencodian-model-picker-search' });
    const searchContainerEl = searchWrapperEl.createDiv({ cls: 'opencodian-model-picker-search-container' });
    const searchIconEl = searchContainerEl.createSpan({ cls: 'opencodian-model-picker-search-icon' });
    setIcon(searchIconEl, 'search');

    this.searchInputEl = searchContainerEl.createEl('input', {
      cls: 'opencodian-model-picker-search-input',
      attr: {
        type: 'text',
        placeholder: t('settings.model.picker.searchPlaceholder'),
      },
    });
    this.searchEnhancer = enhanceSearchInput({
      historyKey: 'model-picker',
      inputEl: this.searchInputEl,
      containerEl: searchContainerEl,
    });
    this.searchInputEl.addEventListener('input', () => {
      this.query = this.searchInputEl?.value ?? '';
      this.highlightedValue = '';
      this.renderList();
    });
    this.searchInputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.close();
        event.preventDefault();
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        this.navigate(event.key === 'ArrowDown' ? 1 : -1);
        event.preventDefault();
        return;
      }

      if (event.key === 'Enter') {
        this.selectHighlighted();
        event.preventDefault();
      }
    });

    this.listEl = this.contentEl.createDiv({ cls: 'opencodian-model-picker-list' });
    this.renderList();

    window.setTimeout(() => {
      this.searchInputEl?.focus();
    }, 0);
  }

  onClose(): void {
    this.searchEnhancer?.commitCurrentValue();
    this.searchEnhancer?.destroy();
    this.searchEnhancer = null;
    this.contentEl.empty();
    this.modalEl.removeClass('opencodian-model-picker-modal');
  }

  private renderList(): void {
    if (!this.listEl) {
      return;
    }

    this.listEl.empty();

    const groups = this.getFilteredGroups();
    const optionValues = this.getOptionValues(groups);
    if (!this.highlightedValue && optionValues.length > 0) {
      this.highlightedValue = optionValues[0];
    }

    if (this.options.emptySelectionLabel) {
      const selected = !this.options.selectedRef;
      const emptyOptionEl = this.listEl.createDiv({ cls: 'opencodian-model-picker-empty-option' });
      this.renderOption(
        emptyOptionEl,
        {
          ref: '',
          providerId: '',
          providerName: '',
          modelId: '',
          modelName: this.options.emptySelectionLabel,
          source: 'server',
          searchText: '',
        },
        {
          selected,
          highlighted: this.highlightedValue === '__empty__',
          empty: true,
        },
      );
    }

    if (groups.length === 0) {
      this.listEl.createDiv({
        cls: 'opencodian-model-picker-empty',
        text: this.query.trim()
          ? t('settings.model.picker.noResults')
          : t('settings.model.noModels'),
      });
      return;
    }

    for (const group of groups) {
      const groupEl = this.listEl.createDiv({ cls: 'opencodian-model-picker-group' });
      const headerEl = groupEl.createDiv({ cls: 'opencodian-model-picker-group-header' });
      headerEl.createDiv({
        cls: 'opencodian-model-picker-group-title',
        text: group.providerName,
      });
      headerEl.createDiv({
        cls: `opencodian-model-source-badge is-${group.source}`,
        text: t(`settings.model.sourceBadge.${group.source}` as const),
      });

      const bodyEl = groupEl.createDiv({ cls: 'opencodian-model-picker-group-body' });
      for (const option of group.options) {
        this.renderOption(bodyEl, option, {
          selected: option.ref === (this.options.selectedRef ?? ''),
          highlighted: option.ref === this.highlightedValue,
        });
      }
    }
  }

  private renderOption(
    containerEl: HTMLElement,
    option: ModelPickerOption,
    flags: { selected: boolean; highlighted: boolean; empty?: boolean },
  ): void {
    const value = flags.empty ? '__empty__' : option.ref;
    const optionEl = containerEl.createDiv({
      cls: 'opencodian-model-picker-option',
      attr: { 'data-value': value },
    });
    optionEl.toggleClass('is-selected', flags.selected);
    optionEl.toggleClass('is-highlighted', flags.highlighted);
    optionEl.addEventListener('mouseenter', () => {
      this.highlightedValue = value;
      this.syncHighlight();
    });
    optionEl.addEventListener('click', () => {
      void this.choose(flags.empty ? null : option);
    });

    const infoEl = optionEl.createDiv({ cls: 'opencodian-model-picker-option-info' });
    infoEl.createDiv({
      cls: 'opencodian-model-picker-option-name',
      text: option.modelName,
    });
    if (!flags.empty) {
      infoEl.createDiv({
        cls: 'opencodian-model-picker-option-meta',
        text: `${option.providerName} · ${option.ref}`,
      });
    }

    const checkEl = optionEl.createSpan({ cls: 'opencodian-model-picker-option-check' });
    setIcon(checkEl, 'check');
  }

  private getFilteredGroups(): ModelPickerGroup[] {
    return filterModelPickerGroups(this.options.groups, this.query, this.providerFilter);
  }

  private getOptionValues(groups: ModelPickerGroup[]): string[] {
    const values: string[] = [];
    if (this.options.emptySelectionLabel) {
      values.push('__empty__');
    }

    for (const group of groups) {
      for (const option of group.options) {
        values.push(option.ref);
      }
    }

    return values;
  }

  private navigate(direction: 1 | -1): void {
    if (!this.listEl) {
      return;
    }

    const values = this.getOptionValues(this.getFilteredGroups());
    if (values.length === 0) {
      return;
    }

    const currentIndex = values.indexOf(this.highlightedValue);
    const nextIndex = currentIndex === -1
      ? 0
      : Math.max(0, Math.min(values.length - 1, currentIndex + direction));
    this.highlightedValue = values[nextIndex];
    this.syncHighlight();

    const targetEl = this.listEl.querySelector<HTMLElement>(`[data-value="${this.highlightedValue}"]`);
    targetEl?.scrollIntoView({ block: 'nearest' });
  }

  private syncHighlight(): void {
    if (!this.listEl) {
      return;
    }

    this.listEl.querySelectorAll<HTMLElement>('.opencodian-model-picker-option').forEach((optionEl) => {
      optionEl.toggleClass('is-highlighted', optionEl.dataset.value === this.highlightedValue);
    });
  }

  private selectHighlighted(): void {
    if (!this.highlightedValue) {
      return;
    }

    if (this.highlightedValue === '__empty__') {
      void this.choose(null);
      return;
    }

    for (const group of this.options.groups) {
      const match = group.options.find((option) => option.ref === this.highlightedValue);
      if (match) {
        void this.choose(match);
        return;
      }
    }
  }

  private async choose(option: ModelPickerOption | null): Promise<void> {
    await this.options.onChoose(option);
    this.close();
  }
}
