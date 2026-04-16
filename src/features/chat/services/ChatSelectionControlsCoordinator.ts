import { setIcon } from 'obsidian';

import type { ResolvedModelSelection } from '../../../core/config/modelConfig';
import type { PermissionMode } from '../../../core/types/settings';
import { t } from '../../../i18n';
import { buildModelSelectorDisplayState } from '../ui/modelSelector/ModelSelectorDisplay';
import {
  highlightModelOption as highlightRenderedModelOption,
  navigateModelList as navigateRenderedModelList,
  scrollToCurrentModel as scrollRenderedCurrentModel,
  selectHighlightedModel as selectRenderedHighlightedModel,
} from '../ui/modelSelector/ModelSelectorInteractions';
import { renderModelList as renderModelSelectorList } from '../ui/modelSelector/ModelSelectorRenderer';
import type {
  ModelSelectorKnownModelInfo,
  ModelSelectorProvider,
  ModelSelectorSelection,
} from '../ui/modelSelector/types';
import {
  ModelSelectionRuntime,
  type ModelSelectionRuntimeHost,
  type ModelUnavailableNoticeContent,
} from './ModelSelectionRuntime';
import { PermissionModeSelectorCoordinator } from './PermissionModeSelectorCoordinator';

export interface ChatSelectionControlsCoordinatorHost extends ModelSelectionRuntimeHost {
  registerEscapeHandler(handler: () => boolean): void;
  resolveProviderIconUrl(providerId: string): Promise<string | null>;
  updateEffortSelectorDisplay(): void;
  getPermissionMode(): PermissionMode;
  switchPermissionMode(mode: PermissionMode): Promise<void>;
}

const MODEL_SEARCH_PLACEHOLDER = 'Search models...';

export class ChatSelectionControlsCoordinator {
  private toolbarEl: HTMLElement | null = null;
  private readonly modelSelectionRuntime: ModelSelectionRuntime;
  private readonly permissionSelector: PermissionModeSelectorCoordinator;

  private modelSelectorContainer: HTMLElement | null = null;
  private modelSelectorTrigger: HTMLElement | null = null;
  private modelSelectorDropdown: HTMLElement | null = null;
  private modelSelectorSearchInput: HTMLInputElement | null = null;
  private modelSelectorScrollContainer: HTMLElement | null = null;
  private disposeModelSelectorStickyHeaders: (() => void) | null = null;
  private isModelDropdownOpen = false;
  private modelFilterQuery = '';
  private modelDropdownClickOutsideHandler: ((event: MouseEvent) => void) | null = null;
  private currentModelTriggerIconUrl: string | null = null;
  private modelSelectorIconRequestId = 0;

  private hasRegisteredEscapeHandler = false;

  constructor(private readonly host: ChatSelectionControlsCoordinatorHost) {
    this.modelSelectionRuntime = new ModelSelectionRuntime(host);
    this.permissionSelector = new PermissionModeSelectorCoordinator({
      getPermissionMode: () => this.host.getPermissionMode(),
      switchPermissionMode: (mode) => this.host.switchPermissionMode(mode),
    });
  }

  build(toolbarEl: HTMLElement): void {
    this.destroy();
    this.toolbarEl = toolbarEl;
    this.registerEscapeHandler();

    this.permissionSelector.mount(toolbarEl.createDiv({ cls: 'opencodian-permission-selector' }));
    this.mountModelSelector(toolbarEl.createDiv({ cls: 'opencodian-model-selector' }));
  }

  async reloadModelCatalog(): Promise<void> {
    await this.modelSelectionRuntime.reloadModelCatalog();
    this.refreshModelOptions();
    this.updateModelSelectorDisplay();
  }

  hasLoadedModelCatalog(): boolean {
    return this.modelSelectionRuntime.hasLoadedModelCatalog();
  }

  getAvailableProviders(): readonly ModelSelectorProvider[] {
    return this.modelSelectionRuntime.getAvailableProviders();
  }

  getCurrentSessionModel(): ModelSelectorSelection | null {
    return this.modelSelectionRuntime.getCurrentSessionModel();
  }

  getCurrentSessionModelResolution(): ResolvedModelSelection {
    return this.modelSelectionRuntime.getCurrentSessionModelResolution();
  }

  findKnownModelInfo(selection: ModelSelectorSelection | null): ModelSelectorKnownModelInfo | null {
    return this.modelSelectionRuntime.findKnownModelInfo(selection);
  }

  formatModelId(
    model: Partial<ModelSelectorSelection> | null | undefined,
  ): string | undefined {
    return this.modelSelectionRuntime.formatModelId(model);
  }

  async ensureSelectedModelAvailable(
    provider: string | undefined,
    model: string | undefined,
  ): Promise<boolean> {
    if (!this.modelSelectionRuntime.hasLoadedModelCatalog()) {
      await this.reloadModelCatalog();
    }

    return this.modelSelectionRuntime.ensureSelectedModelAvailable(provider, model);
  }

  getModelUnavailableNoticeContent(): ModelUnavailableNoticeContent {
    return this.modelSelectionRuntime.getModelUnavailableNoticeContent();
  }

  refreshModelOptions(): void {
    this.renderModelList();
  }

  updateModelSelectorDisplay(): void {
    if (!this.modelSelectorTrigger) {
      return;
    }

    const current = this.getCurrentSessionModel();
    const resolution = this.getCurrentSessionModelResolution();
    const modelInfo = this.findKnownModelInfo(current);
    const displayState = buildModelSelectorDisplayState({
      currentSelection: current,
      resolution,
      knownModelInfo: modelInfo,
      hasLoadedModelCatalog: this.hasLoadedModelCatalog(),
      availableProviderCount: this.getAvailableProviders().length,
      unavailableTitle: this.getModelUnavailableNoticeContent().message,
      unconfiguredLabel: t('settings.model.unconfigured'),
    });

    this.modelSelectorTrigger.toggleClass('is-unavailable', displayState.isUnavailable);
    this.modelSelectorTrigger.toggleClass('is-unconfigured', displayState.isUnconfigured);

    const textEl = this.modelSelectorTrigger.querySelector('.opencodian-model-trigger-text');
    if (textEl) {
      textEl.textContent = displayState.text;
    }

    this.modelSelectorTrigger.setAttribute('title', displayState.title);
    void this.updateModelSelectorIcon(current?.provider ?? null, displayState.iconLabel);
    this.host.updateEffortSelectorDisplay();
  }

  updatePermissionTriggerDisplay(): void {
    this.permissionSelector.updateTriggerDisplay();
  }

  applyLocaleTexts(): void {
    this.modelSelectorSearchInput?.setAttribute('placeholder', MODEL_SEARCH_PLACEHOLDER);
    this.refreshModelOptions();
    this.updateModelSelectorDisplay();
    this.permissionSelector.applyLocaleTexts();
  }

  destroy(): void {
    this.closeModelDropdown();
    this.permissionSelector.destroy();
    this.disposeModelSelectorStickyHeaders?.();
    this.disposeModelSelectorStickyHeaders = null;
    this.toolbarEl = null;
    this.modelSelectorContainer = null;
    this.modelSelectorTrigger = null;
    this.modelSelectorDropdown = null;
    this.modelSelectorSearchInput = null;
    this.modelSelectorScrollContainer = null;
    this.modelFilterQuery = '';
    this.modelSelectionRuntime.reset();
    this.currentModelTriggerIconUrl = null;
    this.modelSelectorIconRequestId += 1;
  }

  private registerEscapeHandler(): void {
    if (this.hasRegisteredEscapeHandler) {
      return;
    }

    this.hasRegisteredEscapeHandler = true;
    this.host.registerEscapeHandler(() => {
      if (!this.isModelDropdownOpen && !this.permissionSelector.isOpen()) {
        return false;
      }

      this.closeModelDropdown();
      this.permissionSelector.closeDropdown();
      return true;
    });
  }

  private mountModelSelector(containerEl: HTMLElement): void {
    this.modelSelectorContainer = containerEl;
    this.modelSelectorTrigger = containerEl.createDiv({ cls: 'opencodian-model-trigger' });
    const triggerContent = this.modelSelectorTrigger.createDiv({ cls: 'opencodian-model-trigger-content' });

    const iconWrapper = triggerContent.createSpan({ cls: 'opencodian-model-trigger-icon' });
    setIcon(iconWrapper, 'bot');
    triggerContent.createSpan({ cls: 'opencodian-model-trigger-text' });

    this.modelSelectorDropdown = containerEl.createDiv({ cls: 'opencodian-model-dropdown' });
    this.modelSelectorDropdown.style.display = 'none';
    this.buildModelDropdown();

    void this.reloadModelCatalog();
    this.updateModelSelectorDisplay();

    this.modelSelectorTrigger.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggleModelDropdown();
    });

    this.modelDropdownClickOutsideHandler = (event: MouseEvent) => {
      if (!this.modelSelectorContainer?.contains(event.target as Node)) {
        this.closeModelDropdown();
      }
    };
  }

  private buildModelDropdown(): void {
    if (!this.modelSelectorDropdown) {
      return;
    }

    this.modelSelectorDropdown.empty();

    const searchWrapper = this.modelSelectorDropdown.createDiv({ cls: 'opencodian-model-dropdown-search' });
    const searchContainer = searchWrapper.createDiv({ cls: 'opencodian-model-dropdown-search-container' });
    const searchIcon = searchContainer.createSpan({ cls: 'opencodian-model-dropdown-search-icon' });
    setIcon(searchIcon, 'search');

    this.modelSelectorSearchInput = searchContainer.createEl('input', {
      cls: 'opencodian-model-dropdown-search-input',
      attr: {
        type: 'text',
        placeholder: MODEL_SEARCH_PLACEHOLDER,
      },
    });

    this.modelSelectorSearchInput.addEventListener('input', (event) => {
      this.modelFilterQuery = (event.target as HTMLInputElement).value.toLowerCase();
      this.renderModelList();
    });

    this.modelSelectorSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeModelDropdown();
        event.preventDefault();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        this.navigateModelList(event.key === 'ArrowDown' ? 1 : -1);
        event.preventDefault();
      } else if (event.key === 'Enter') {
        this.selectHighlightedModel();
        event.preventDefault();
      }
    });

    this.modelSelectorScrollContainer = this.modelSelectorDropdown.createDiv({
      cls: 'opencodian-model-dropdown-scroll',
    });

    this.renderModelList();
  }

  private toggleModelDropdown(): void {
    if (this.isModelDropdownOpen) {
      this.closeModelDropdown();
    } else {
      this.openModelDropdown();
    }
  }

  private openModelDropdown(): void {
    if (!this.modelSelectorDropdown || !this.modelSelectorTrigger) {
      return;
    }

    this.isModelDropdownOpen = true;
    this.modelSelectorDropdown.style.display = 'block';
    this.modelSelectorTrigger.addClass('is-open');

    this.modelFilterQuery = '';
    if (this.modelSelectorSearchInput) {
      this.modelSelectorSearchInput.value = '';
    }
    this.renderModelList();

    window.setTimeout(() => {
      this.modelSelectorSearchInput?.focus();
      this.scrollToCurrentModel();
    }, 0);

    if (this.modelDropdownClickOutsideHandler) {
      document.addEventListener('click', this.modelDropdownClickOutsideHandler);
    }
  }

  private closeModelDropdown(): void {
    this.isModelDropdownOpen = false;
    if (this.modelSelectorDropdown) {
      this.modelSelectorDropdown.style.display = 'none';
    }
    this.modelSelectorTrigger?.removeClass('is-open');

    if (this.modelDropdownClickOutsideHandler) {
      document.removeEventListener('click', this.modelDropdownClickOutsideHandler);
    }
  }

  private renderModelList(): void {
    if (!this.modelSelectorScrollContainer) {
      return;
    }

    const highlightedValue = this.modelSelectorScrollContainer
      .querySelector<HTMLElement>('.opencodian-model-option.is-highlighted')
      ?.dataset.value ?? null;

    const renderResult = renderModelSelectorList({
      scrollContainer: this.modelSelectorScrollContainer,
      providers: this.getAvailableProviders(),
      hasLoadedModelCatalog: this.hasLoadedModelCatalog(),
      filterQuery: this.modelFilterQuery,
      currentSelection: this.getCurrentSessionModel(),
      highlightedValue,
      previousStickyHeadersCleanup: this.disposeModelSelectorStickyHeaders,
      texts: {
        loading: 'Loading models...',
        noModels: t('settings.model.noModels'),
        noModelsFound: 'No models found',
        noModelsAvailable: 'No models available',
      },
      onSelect: (provider, model) => {
        this.selectModel(provider, model);
        this.closeModelDropdown();
      },
      onHighlight: (value) => {
        this.highlightModelOption(value);
      },
    });

    this.disposeModelSelectorStickyHeaders = renderResult.disposeStickyHeaders;
  }

  private navigateModelList(direction: 1 | -1): void {
    if (!this.modelSelectorScrollContainer) {
      return;
    }

    navigateRenderedModelList(this.modelSelectorScrollContainer, direction);
  }

  private highlightModelOption(value: string): void {
    if (!this.modelSelectorScrollContainer) {
      return;
    }

    highlightRenderedModelOption(this.modelSelectorScrollContainer, value);
  }

  private selectHighlightedModel(): void {
    if (!this.modelSelectorScrollContainer) {
      return;
    }

    const didSelect = selectRenderedHighlightedModel(
      this.modelSelectorScrollContainer,
      (provider, model) => {
        this.selectModel(provider, model);
      },
    );
    if (didSelect) {
      this.closeModelDropdown();
    }
  }

  private scrollToCurrentModel(): void {
    if (!this.modelSelectorScrollContainer) {
      return;
    }

    scrollRenderedCurrentModel(this.modelSelectorScrollContainer, this.getCurrentSessionModel());
  }

  private selectModel(provider: string, model: string): void {
    this.modelSelectionRuntime.switchModel(provider, model);
    this.updateModelSelectorDisplay();
  }

  private async updateModelSelectorIcon(providerId: string | null, iconLabel: string): Promise<void> {
    if (!this.modelSelectorTrigger) {
      return;
    }

    const iconWrapper = this.modelSelectorTrigger.querySelector('.opencodian-model-trigger-icon');
    if (!iconWrapper) {
      return;
    }

    const requestId = ++this.modelSelectorIconRequestId;

    if (!providerId) {
      iconWrapper.empty();
      setIcon(iconWrapper as HTMLElement, 'bot');
      this.currentModelTriggerIconUrl = null;
      return;
    }

    const iconUrl = await this.host.resolveProviderIconUrl(providerId);
    if (requestId !== this.modelSelectorIconRequestId) {
      return;
    }

    if (iconUrl !== this.currentModelTriggerIconUrl) {
      iconWrapper.empty();

      if (iconUrl) {
        const img = document.createElement('img');
        img.classList.add('opencodian-provider-icon-image');
        img.src = iconUrl;
        img.alt = iconLabel;
        img.title = iconLabel;
        iconWrapper.appendChild(img);
      } else {
        setIcon(iconWrapper as HTMLElement, 'bot');
      }

      this.currentModelTriggerIconUrl = iconUrl;
      return;
    }

    if (iconUrl) {
      const existingImg = iconWrapper.querySelector('img');
      if (existingImg) {
        existingImg.alt = iconLabel;
        existingImg.title = iconLabel;
      }
    }
  }
}
