import { Modal, setIcon } from 'obsidian';

import type { ProviderIconLibrary } from '../../core/types';
import { t } from '../../i18n';
import { ProviderIconService } from '../../utils/icons';
import type { BuiltinIconLibraryId } from '../../utils/icons';
import { enhanceSearchInput, type SearchInputEnhancerHandle } from './searchInputEnhancer';

interface ProviderBuiltinIconPickerModalOptions {
  providerId: string;
  library: ProviderIconLibrary;
  onChoose: (selection: { libraryId: BuiltinIconLibraryId; iconId: string }) => void | Promise<void>;
}

export class ProviderBuiltinIconPickerModal extends Modal {
  private readonly options: ProviderBuiltinIconPickerModalOptions;
  private searchInputEl: HTMLInputElement | null = null;
  private gridEl: HTMLElement | null = null;
  private searchEnhancer: SearchInputEnhancerHandle | null = null;
  private query = '';
  private libraryFilter: '' | BuiltinIconLibraryId = '';
  private choosing = false;

  constructor(app: Modal['app'], options: ProviderBuiltinIconPickerModalOptions) {
    super(app);
    this.options = options;
  }

  onOpen(): void {
    this.contentEl.empty();
    this.modalEl.addClass('opencodian-builtin-icon-picker-modal');

    this.contentEl.createEl('h2', {
      text: t('settings.model.iconCache.builtinPicker.title', {
        providerId: this.options.providerId,
      }),
    });
    this.contentEl.createEl('p', {
      cls: 'opencodian-builtin-icon-picker-desc',
      text: t('settings.model.iconCache.builtinPicker.desc'),
    });

    const controlsEl = this.contentEl.createDiv({ cls: 'opencodian-builtin-icon-picker-controls' });
    const filterWrapEl = controlsEl.createDiv({ cls: 'opencodian-builtin-icon-picker-filter-wrap' });
    const filterEl = filterWrapEl.createEl('select', {
      cls: 'opencodian-builtin-icon-picker-filter',
      attr: {
        'aria-label': t('settings.model.iconCache.builtinPicker.libraryLabel'),
      },
    });
    filterEl.createEl('option', {
      value: '',
      text: t('settings.model.iconCache.builtinPicker.library.all'),
    });
    filterEl.createEl('option', {
      value: 'lobehub',
      text: t('settings.model.iconCache.builtinPicker.library.lobehub'),
    });
    filterEl.createEl('option', {
      value: 'opencode',
      text: t('settings.model.iconCache.builtinPicker.library.opencode'),
    });
    filterEl.addEventListener('change', () => {
      this.libraryFilter = (filterEl.value as '' | BuiltinIconLibraryId) ?? '';
      this.renderGrid();
    });
    const chevronEl = filterWrapEl.createSpan({ cls: 'opencodian-builtin-icon-picker-filter-chevron' });
    setIcon(chevronEl, 'chevron-down');

    const searchWrapEl = controlsEl.createDiv({ cls: 'opencodian-builtin-icon-picker-search' });
    const searchContainerEl = searchWrapEl.createDiv({ cls: 'opencodian-builtin-icon-picker-search-container' });
    const searchIconEl = searchContainerEl.createSpan({ cls: 'opencodian-builtin-icon-picker-search-icon' });
    setIcon(searchIconEl, 'search');

    this.searchInputEl = searchContainerEl.createEl('input', {
      cls: 'opencodian-builtin-icon-picker-search-input',
      attr: {
        type: 'text',
        placeholder: t('settings.model.iconCache.builtinPicker.searchPlaceholder'),
      },
    });
    this.searchEnhancer = enhanceSearchInput({
      historyKey: 'provider-builtin-icon-picker',
      inputEl: this.searchInputEl,
      containerEl: searchContainerEl,
    });
    this.searchInputEl.addEventListener('input', () => {
      this.query = this.searchInputEl?.value ?? '';
      this.renderGrid();
    });
    this.searchInputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.close();
      }
    });

    this.gridEl = this.contentEl.createDiv({ cls: 'opencodian-builtin-icon-picker-grid' });
    this.renderGrid();

    window.setTimeout(() => {
      this.searchInputEl?.focus();
    }, 0);
  }

  onClose(): void {
    this.searchEnhancer?.commitCurrentValue();
    this.searchEnhancer?.destroy();
    this.searchEnhancer = null;
    this.contentEl.empty();
    this.modalEl.removeClass('opencodian-builtin-icon-picker-modal');
  }

  private renderGrid(): void {
    if (!this.gridEl) {
      return;
    }

    this.gridEl.empty();
    const options = ProviderIconService.listBuiltinIconOptions(
      this.app,
      this.options.providerId,
      this.options.library,
      {
        query: this.query,
        libraryId: this.libraryFilter || undefined,
      },
    );

    if (options.length === 0) {
      this.gridEl.createDiv({
        cls: 'opencodian-builtin-icon-picker-empty',
        text: t('settings.model.iconCache.builtinPicker.empty'),
      });
      return;
    }

    for (const option of options) {
      const cardEl = this.gridEl.createEl('button', {
        cls: 'opencodian-builtin-icon-picker-card',
        attr: {
          type: 'button',
          'aria-pressed': option.isSelected ? 'true' : 'false',
        },
      });
      cardEl.toggleClass('is-selected', option.isSelected);
      cardEl.addEventListener('click', () => {
        void this.choose(option.libraryId, option.iconId);
      });

      const previewEl = cardEl.createDiv({ cls: 'opencodian-builtin-icon-picker-card-preview' });
      const placeholderEl = previewEl.createSpan({
        cls: 'opencodian-builtin-icon-picker-card-placeholder',
        text: option.iconId[0]?.toUpperCase() ?? '?',
      });
      if (option.previewUrl) {
        const imgEl = document.createElement('img');
        imgEl.src = option.previewUrl;
        imgEl.alt = option.displayName;
        imgEl.loading = 'lazy';
        imgEl.addEventListener('error', () => {
          imgEl.remove();
          previewEl.addClass('is-fallback');
          placeholderEl.hidden = false;
        });
        previewEl.appendChild(imgEl);
        placeholderEl.hidden = true;
      } else {
        previewEl.addClass('is-fallback');
      }

      const bodyEl = cardEl.createDiv({ cls: 'opencodian-builtin-icon-picker-card-body' });
      const titleRowEl = bodyEl.createDiv({ cls: 'opencodian-builtin-icon-picker-card-title-row' });
      titleRowEl.createDiv({
        cls: 'opencodian-builtin-icon-picker-card-title',
        text: option.displayName,
      });

      const badgesEl = bodyEl.createDiv({ cls: 'opencodian-builtin-icon-picker-card-badges' });
      badgesEl.createSpan({
        cls: 'opencodian-builtin-icon-picker-card-badge',
        text: t(`settings.model.iconCache.builtinPicker.library.${option.libraryId}` as const),
      });
      if (option.isRecommended) {
        badgesEl.createSpan({
          cls: 'opencodian-builtin-icon-picker-card-badge is-recommended',
          text: t('settings.model.iconCache.builtinPicker.recommended'),
        });
      }
      if (option.isSelected) {
        badgesEl.createSpan({
          cls: 'opencodian-builtin-icon-picker-card-badge is-selected',
          text: t('settings.model.iconCache.builtinPicker.selected'),
        });
      }

      bodyEl.createDiv({
        cls: 'opencodian-builtin-icon-picker-card-meta',
        text: option.iconId,
      });

      const stateEl = cardEl.createDiv({ cls: 'opencodian-builtin-icon-picker-card-state' });
      if (option.isSelected) {
        setIcon(stateEl, 'check');
      }
    }
  }

  private async choose(libraryId: BuiltinIconLibraryId, iconId: string): Promise<void> {
    if (this.choosing) {
      return;
    }

    this.choosing = true;
    try {
      await this.options.onChoose({ libraryId, iconId });
      this.close();
    } finally {
      this.choosing = false;
    }
  }
}
