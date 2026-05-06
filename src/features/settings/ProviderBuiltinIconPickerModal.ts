import { Modal, Notice, setIcon } from 'obsidian';

import type { LobehubIconVariant, ProviderIconColorMode, ProviderIconLibrary } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import type { BuiltinIconLibraryId } from '../../utils/icons';
import { ProviderIconService } from '../../utils/icons';
import { enhanceSearchInput, type SearchInputEnhancerHandle } from './searchInputEnhancer';
import {
  enhanceSettingsDropdowns,
  type SettingsDropdownsEnhancerHandle,
} from './SettingsDropdownControl';

const LOBEHUB_ICON_VARIANT_OPTIONS: LobehubIconVariant[] = [
  'auto',
  'mono',
  'color',
  'brand',
  'brand-color',
  'text',
  'text-cn',
  'text-color',
  'combine',
  'avatar',
];

interface ProviderBuiltinIconPickerModalOptions {
  plugin?: OpenCodianPlugin;
  providerId: string;
  library: ProviderIconLibrary;
  onChoose: (selection: { libraryId: BuiltinIconLibraryId; iconId: string; variant: LobehubIconVariant }) => void | Promise<void>;
}

export class ProviderBuiltinIconPickerModal extends Modal {
  private readonly options: ProviderBuiltinIconPickerModalOptions;
  private searchInputEl: HTMLInputElement | null = null;
  private gridEl: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;
  private searchEnhancer: SearchInputEnhancerHandle | null = null;
  private dropdownsEnhancer: SettingsDropdownsEnhancerHandle | null = null;
  private readonly colorModeButtons = new Map<ProviderIconColorMode, HTMLButtonElement>();
  private query = '';
  private libraryFilter: '' | BuiltinIconLibraryId = '';
  private requestedVariant: LobehubIconVariant = 'auto';
  private choosing = false;
  private updatingColorMode = false;

  constructor(app: Modal['app'], options: ProviderBuiltinIconPickerModalOptions) {
    super(app);
    this.options = options;
    this.requestedVariant = ProviderIconService.getSelectedBuiltinVariant(options.providerId, options.library);
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
    const allOptionEl = filterEl.createEl('option', {
      text: t('settings.model.iconCache.builtinPicker.library.all'),
    });
    allOptionEl.value = '';
    const lobehubOptionEl = filterEl.createEl('option', {
      text: t('settings.model.iconCache.builtinPicker.library.lobehub'),
    });
    lobehubOptionEl.value = 'lobehub';
    const opencodeOptionEl = filterEl.createEl('option', {
      text: t('settings.model.iconCache.builtinPicker.library.opencode'),
    });
    opencodeOptionEl.value = 'opencode';
    filterEl.addEventListener('change', () => {
      this.libraryFilter = (filterEl.value as '' | BuiltinIconLibraryId) ?? '';
      this.renderGrid();
    });
    const chevronEl = filterWrapEl.createSpan({ cls: 'opencodian-builtin-icon-picker-filter-chevron' });
    setIcon(chevronEl, 'chevron-down');

    const variantWrapEl = controlsEl.createDiv({ cls: 'opencodian-builtin-icon-picker-filter-wrap' });
    const variantEl = variantWrapEl.createEl('select', {
      cls: 'opencodian-builtin-icon-picker-filter',
      attr: {
        'aria-label': t('settings.model.iconCache.builtinPicker.variantLabel'),
      },
    });
    for (const variant of LOBEHUB_ICON_VARIANT_OPTIONS) {
      const optionEl = variantEl.createEl('option', {
        text: t(`settings.model.iconCache.variant.${variant}` as const),
      });
      optionEl.value = variant;
    }
    variantEl.value = this.requestedVariant;
    variantEl.addEventListener('change', () => {
      this.requestedVariant = variantEl.value as LobehubIconVariant;
      this.renderGrid();
    });
    const variantChevronEl = variantWrapEl.createSpan({ cls: 'opencodian-builtin-icon-picker-filter-chevron' });
    setIcon(variantChevronEl, 'chevron-down');

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

    const appearanceEl = controlsEl.createDiv({ cls: 'opencodian-builtin-icon-picker-appearance' });
    const appearanceHeaderEl = appearanceEl.createDiv({ cls: 'opencodian-builtin-icon-picker-appearance-header' });
    appearanceHeaderEl.createDiv({
      cls: 'opencodian-builtin-icon-picker-appearance-label',
      text: t('settings.model.iconCache.builtinPicker.colorModeLabel'),
    });

    const modeButtonsEl = appearanceHeaderEl.createDiv({ cls: 'opencodian-builtin-icon-picker-mode-buttons' });
    this.createColorModeButton(modeButtonsEl, 'system');
    this.createColorModeButton(modeButtonsEl, 'monochrome');
    this.createColorModeButton(modeButtonsEl, 'color');

    this.previewEl = appearanceEl.createDiv({ cls: 'opencodian-builtin-icon-picker-preview' });
    this.renderColorModeButtons();
    this.renderPreview();

    this.gridEl = this.contentEl.createDiv({ cls: 'opencodian-builtin-icon-picker-grid' });
    this.renderGrid();
    this.dropdownsEnhancer = enhanceSettingsDropdowns(this.contentEl);

    window.setTimeout(() => {
      this.searchInputEl?.focus();
    }, 0);
  }

  onClose(): void {
    this.dropdownsEnhancer?.destroy();
    this.dropdownsEnhancer = null;
    this.searchEnhancer?.commitCurrentValue();
    this.searchEnhancer?.destroy();
    this.searchEnhancer = null;
    this.colorModeButtons.clear();
    this.previewEl = null;
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
        requestedVariant: this.requestedVariant,
      },
    );
    this.renderPreview(options);

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
        void this.choose(option.libraryId, option.iconId, option.requestedVariant);
      });

      const previewEl = cardEl.createDiv({ cls: 'opencodian-builtin-icon-picker-card-preview' });
      const placeholderEl = previewEl.createSpan({
        cls: 'opencodian-builtin-icon-picker-card-placeholder',
        text: option.iconId[0]?.toUpperCase() ?? '?',
      });
      if (option.previewUrl) {
        const imgEl = document.createElement('img');
        imgEl.classList.add('opencodian-provider-icon-image');
        imgEl.alt = option.displayName;
        imgEl.loading = 'lazy';
        this.applyPreviewImageSources(
          imgEl,
          option.previewCandidates,
          () => {
            imgEl.remove();
            previewEl.addClass('is-fallback');
            placeholderEl.hidden = false;
          },
        );
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
      if (option.resolvedVariant) {
        badgesEl.createSpan({
          cls: 'opencodian-builtin-icon-picker-card-badge',
          text: t(`settings.model.iconCache.variant.${option.resolvedVariant}` as const),
        });
      }
      if (option.resolvedFormat) {
        badgesEl.createSpan({
          cls: 'opencodian-builtin-icon-picker-card-badge',
          text: option.resolvedFormat,
        });
      }
      if (
        option.libraryId === 'lobehub'
        && option.requestedVariant !== 'auto'
        && option.resolvedVariant
        && option.requestedVariant !== option.resolvedVariant
      ) {
        badgesEl.createSpan({
          cls: 'opencodian-builtin-icon-picker-card-badge is-fallback',
          text: t('settings.model.iconCache.builtinPicker.fallbackBadge'),
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

  private async choose(
    libraryId: BuiltinIconLibraryId,
    iconId: string,
    variant: LobehubIconVariant,
  ): Promise<void> {
    if (this.choosing) {
      return;
    }

    this.choosing = true;
    try {
      await this.options.onChoose({ libraryId, iconId, variant });
      this.close();
    } finally {
      this.choosing = false;
    }
  }

  private createColorModeButton(containerEl: HTMLElement, mode: ProviderIconColorMode): void {
    const buttonEl = containerEl.createEl('button', {
      cls: 'opencodian-builtin-icon-picker-mode-button',
      text: t(`settings.model.iconCache.colorMode.${mode}` as const),
      attr: {
        type: 'button',
      },
    });
    buttonEl.addEventListener('click', () => {
      void this.setColorMode(mode);
    });
    this.colorModeButtons.set(mode, buttonEl);
  }

  private renderColorModeButtons(): void {
    const currentMode = this.options.plugin?.settings.providerIconColorMode ?? 'system';
    for (const [mode, buttonEl] of this.colorModeButtons.entries()) {
      const isActive = mode === currentMode;
      buttonEl.classList.toggle('is-active', isActive);
      buttonEl.disabled = !this.options.plugin || (this.updatingColorMode && !isActive);
      buttonEl.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  private async setColorMode(mode: ProviderIconColorMode): Promise<void> {
    const plugin = this.options.plugin;
    if (!plugin || this.updatingColorMode || plugin.settings.providerIconColorMode === mode) {
      return;
    }

    const previousMode = plugin.settings.providerIconColorMode;
    this.updatingColorMode = true;
    plugin.settings.providerIconColorMode = mode;
    plugin.applyProviderIconColorMode();
    this.renderColorModeButtons();
    this.renderGrid();

    try {
      await plugin.saveSettings({
        syncService: false,
        reloadModels: false,
        syncConfig: false,
        applyUi: true,
      });
    } catch (error) {
      plugin.settings.providerIconColorMode = previousMode;
      plugin.applyProviderIconColorMode();
      this.renderGrid();
      new Notice(
        error instanceof Error ? error.message : t('settings.model.iconCache.colorMode.saveFailed'),
      );
    } finally {
      this.updatingColorMode = false;
      this.renderColorModeButtons();
    }
  }

  private renderPreview(
    options: Array<{
      libraryId: BuiltinIconLibraryId;
      iconId: string;
      displayName: string;
      previewUrl: string | null;
      previewCandidates: string[];
      source: string;
      requestedVariant?: LobehubIconVariant;
      resolvedFormat?: string;
      resolvedVariant?: string;
    }> = ProviderIconService.listBuiltinIconOptions(
      this.app,
      this.options.providerId,
      this.options.library,
      {
        libraryId: this.libraryFilter || undefined,
        requestedVariant: this.requestedVariant,
      },
    ),
  ): void {
    if (!this.previewEl) {
      return;
    }

    this.previewEl.empty();
    this.previewEl.createDiv({
      cls: 'opencodian-builtin-icon-picker-preview-label',
      text: t('settings.model.iconCache.builtinPicker.previewLabel'),
    });

    const previewListEl = this.previewEl.createDiv({ cls: 'opencodian-builtin-icon-picker-preview-list' });
    const previewOptions = options
      .filter((option) => Boolean(option.previewUrl))
      .filter((option, index, collection) =>
        collection.findIndex((candidate) => candidate.source === option.source) === index,
      )
      .slice(0, 4);

    if (previewOptions.length === 0) {
      previewListEl.createDiv({
        cls: 'opencodian-builtin-icon-picker-preview-empty',
        text: t('settings.model.iconCache.builtinPicker.previewEmpty'),
      });
      return;
    }

    for (const option of previewOptions) {
      const itemEl = previewListEl.createDiv({ cls: 'opencodian-builtin-icon-picker-preview-item' });
      const iconFrameEl = itemEl.createDiv({ cls: 'opencodian-builtin-icon-picker-preview-icon' });
      if (option.previewUrl) {
        const imgEl = document.createElement('img');
        imgEl.classList.add('opencodian-provider-icon-image');
        imgEl.alt = option.displayName;
        imgEl.loading = 'lazy';
        this.applyPreviewImageSources(
          imgEl,
          option.previewCandidates,
          () => imgEl.remove(),
        );
        iconFrameEl.appendChild(imgEl);
      }
      itemEl.createDiv({
        cls: 'opencodian-builtin-icon-picker-preview-name',
        text: option.displayName,
      });
    }
  }

  private applyPreviewImageSources(
    imgEl: HTMLImageElement,
    sources: string[],
    onExhausted: () => void,
  ): void {
    const candidates = sources.filter(Boolean);
    if (candidates.length === 0) {
      onExhausted();
      return;
    }

    let index = 0;
    const applyNext = () => {
      if (index >= candidates.length) {
        imgEl.removeEventListener('error', applyNext);
        onExhausted();
        return;
      }

      imgEl.src = candidates[index]!;
      index += 1;
    };

    imgEl.addEventListener('error', applyNext);
    applyNext();
  }
}
