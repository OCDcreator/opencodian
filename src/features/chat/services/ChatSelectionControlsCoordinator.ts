import { Notice, setIcon } from 'obsidian';

import type { ModelCatalogBundle } from '../../../core/config';
import {
  formatModelReference,
  type ResolvedModelSelection,
  resolveModelSelection,
  resolvePreferredAvailableModel,
} from '../../../core/config/modelConfig';
import type { ModelSourceMode, PermissionMode } from '../../../core/types/settings';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import { buildModelSelectorDisplayState } from '../ui/modelSelector/ModelSelectorDisplay';
import {
  highlightModelOption as highlightRenderedModelOption,
  navigateModelList as navigateRenderedModelList,
  scrollToCurrentModel as scrollRenderedCurrentModel,
  selectHighlightedModel as selectRenderedHighlightedModel,
} from '../ui/modelSelector/ModelSelectorInteractions';
import { renderModelList as renderModelSelectorList } from '../ui/modelSelector/ModelSelectorRenderer';
import type {
  ModelSelectorAvailableModelInfo,
  ModelSelectorDisplayResolution,
  ModelSelectorKnownModelInfo,
  ModelSelectorProvider,
  ModelSelectorSelection,
} from '../ui/modelSelector/types';

const logger = createLogger('ChatSelectionControlsCoordinator');

export interface ChatSelectionControlsCoordinatorHost {
  registerEscapeHandler(handler: () => boolean): void;
  loadModelCatalogData(): Promise<{
    catalogBundle: ModelCatalogBundle | null;
    providers: readonly ModelSelectorProvider[];
  }>;
  getActiveTabModelOverride(): ModelSelectorSelection | null;
  setActiveTabModelOverride(selection: ModelSelectorSelection): boolean;
  getDefaultModelSelection(): ModelSelectorSelection | null;
  syncActiveTabContextUsageIdentity(): void;
  getModelSourceMode(): ModelSourceMode;
  isModelAvailableOnServer(provider: string, model: string): Promise<boolean>;
  resolveProviderIconUrl(providerId: string): Promise<string | null>;
  updateEffortSelectorDisplay(): void;
  getPermissionMode(): PermissionMode;
  switchPermissionMode(mode: PermissionMode): Promise<void>;
}

interface PermissionModeOption {
  id: PermissionMode;
  label: string;
  description: string;
}

const MODEL_SEARCH_PLACEHOLDER = 'Search models...';

const PERMISSION_MODE_DISPLAY: Record<PermissionMode, string> = {
  yolo: 'YOLO',
  normal: 'ASK',
  plan: 'PLAN',
};

export class ChatSelectionControlsCoordinator {
  private toolbarEl: HTMLElement | null = null;
  private availableModels: ModelSelectorAvailableModelInfo[] = [];
  private availableProviders: ModelSelectorProvider[] = [];
  private modelCatalogBundle: ModelCatalogBundle | null = null;
  private hasLoadedCatalog = false;

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

  private permissionSelectorContainer: HTMLElement | null = null;
  private permissionSelectorTrigger: HTMLElement | null = null;
  private permissionSelectorDropdown: HTMLElement | null = null;
  private isPermissionDropdownOpen = false;
  private permissionDropdownClickOutsideHandler: ((event: MouseEvent) => void) | null = null;

  private hasRegisteredEscapeHandler = false;

  constructor(private readonly host: ChatSelectionControlsCoordinatorHost) {}

  build(toolbarEl: HTMLElement): void {
    this.destroy();
    this.toolbarEl = toolbarEl;
    this.registerEscapeHandler();

    this.mountPermissionSelector(toolbarEl.createDiv({ cls: 'opencodian-permission-selector' }));
    this.mountModelSelector(toolbarEl.createDiv({ cls: 'opencodian-model-selector' }));
  }

  async reloadModelCatalog(): Promise<void> {
    try {
      const { catalogBundle, providers } = await this.host.loadModelCatalogData();
      this.hasLoadedCatalog = true;
      this.modelCatalogBundle = catalogBundle;
      this.availableModels = [];
      this.availableProviders = [];

      for (const provider of providers) {
        const providerModels = provider.models.map((model) => ({
          id: model.id,
          name: model.name,
          contextWindow: model.contextWindow,
        }));

        for (const model of providerModels) {
          this.availableModels.push({
            provider: provider.id,
            model: model.id,
            label: `${provider.name}/${model.name}`,
            providerName: provider.name,
            modelName: model.name,
            contextWindow: model.contextWindow,
          });
        }

        this.availableProviders.push({
          id: provider.id,
          name: provider.name,
          models: providerModels,
        });
      }

      this.host.syncActiveTabContextUsageIdentity();
    } catch (error) {
      logger.error('Failed to load models:', error);
    }

    this.refreshModelOptions();
    this.updateModelSelectorDisplay();
  }

  hasLoadedModelCatalog(): boolean {
    return this.hasLoadedCatalog;
  }

  getAvailableProviders(): readonly ModelSelectorProvider[] {
    return this.availableProviders;
  }

  getCurrentSessionModel(): ModelSelectorSelection | null {
    const requestedModel = this.getRequestedSessionModel();
    if (!this.hasLoadedCatalog || !this.modelCatalogBundle) {
      return requestedModel;
    }

    const resolvedModel = resolvePreferredAvailableModel(
      this.modelCatalogBundle.effective,
      requestedModel?.provider,
      requestedModel?.model,
    );
    if (!resolvedModel) {
      return null;
    }

    return {
      provider: resolvedModel.provider,
      model: resolvedModel.model,
    };
  }

  getCurrentSessionModelResolution(): ResolvedModelSelection {
    const currentModel = this.getCurrentSessionModel();
    if (!currentModel) {
      return {
        status: 'unconfigured',
        provider: '',
        model: '',
        ref: '',
      };
    }

    if (!this.hasLoadedCatalog || !this.modelCatalogBundle) {
      return {
        status: 'available',
        provider: currentModel.provider,
        model: currentModel.model,
        ref: formatModelReference(currentModel.provider, currentModel.model),
      };
    }

    return resolveModelSelection(
      this.modelCatalogBundle.baseEffective,
      this.modelCatalogBundle.effective,
      currentModel.provider,
      currentModel.model,
    );
  }

  findKnownModelInfo(selection: ModelSelectorSelection | null): ModelSelectorKnownModelInfo | null {
    if (!selection) {
      return null;
    }

    const availableModel = this.availableModels.find(
      (item) => item.provider === selection.provider && item.model === selection.model,
    );
    if (availableModel) {
      return availableModel;
    }

    const baseProvider = this.modelCatalogBundle?.baseEffective.providers.find(
      (provider) => provider.id === selection.provider,
    );
    const baseModel = baseProvider?.models.find((model) => model.id === selection.model);
    if (!baseProvider || !baseModel) {
      return null;
    }

    return {
      providerName: baseProvider.name,
      modelName: baseModel.name,
      contextWindow: baseModel.contextWindow,
    };
  }

  formatModelId(
    model: Partial<ModelSelectorSelection> | null | undefined,
  ): string | undefined {
    if (!model?.provider || !model.model) {
      return undefined;
    }

    return `${model.provider}/${model.model}`;
  }

  async ensureSelectedModelAvailable(
    provider: string | undefined,
    model: string | undefined,
  ): Promise<boolean> {
    if (!this.hasLoadedCatalog) {
      await this.reloadModelCatalog();
    }

    const resolution = this.modelCatalogBundle
      ? resolveModelSelection(
          this.modelCatalogBundle.baseEffective,
          this.modelCatalogBundle.effective,
          provider,
          model,
        )
      : this.getCurrentSessionModelResolution();
    if (resolution.status !== 'available') {
      return false;
    }

    if (!provider || !model) {
      return false;
    }

    try {
      const available = await this.host.isModelAvailableOnServer(provider, model);
      if (available) {
        return true;
      }
    } catch (error) {
      logger.warn('Failed to verify model availability on server', error);
    }

    return false;
  }

  getModelUnavailableNoticeContent(): { title: string; message: string } {
    const resolution = this.getCurrentSessionModelResolution();
    if (resolution.status === 'unconfigured') {
      return {
        title: t('chat.notice.modelUnavailable.unconfiguredTitle'),
        message: t('chat.notice.modelUnavailable.unconfiguredBody'),
      };
    }

    if (this.availableProviders.length === 0) {
      switch (this.host.getModelSourceMode()) {
        case 'local':
          return {
            title: t('chat.notice.modelUnavailable.localTitle'),
            message: t('chat.notice.modelUnavailable.localBody'),
          };
        case 'server':
          return {
            title: t('chat.notice.modelUnavailable.serverTitle'),
            message: t('chat.notice.modelUnavailable.serverBody'),
          };
        default:
          return {
            title: t('chat.notice.modelUnavailable.mergeTitle'),
            message: t('chat.notice.modelUnavailable.mergeBody'),
          };
      }
    }

    return {
      title: t('chat.notice.modelUnavailable.selectedTitle'),
      message: t('chat.notice.modelUnavailable.selectedBody'),
    };
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
      availableProviderCount: this.availableProviders.length,
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
    if (!this.permissionSelectorTrigger) {
      return;
    }

    const mode = this.host.getPermissionMode();
    const textEl = this.permissionSelectorTrigger.querySelector('.opencodian-permission-trigger-text');
    if (textEl) {
      textEl.textContent = PERMISSION_MODE_DISPLAY[mode] || mode;
    }

    this.permissionSelectorTrigger.removeClass('mode-yolo', 'mode-normal', 'mode-plan');
    this.permissionSelectorTrigger.addClass(`mode-${mode}`);
    this.updatePermissionDropdownSelection();
  }

  applyLocaleTexts(): void {
    this.modelSelectorSearchInput?.setAttribute('placeholder', MODEL_SEARCH_PLACEHOLDER);
    this.refreshModelOptions();
    this.updateModelSelectorDisplay();
    this.buildPermissionDropdown();
    this.updatePermissionTriggerDisplay();
  }

  destroy(): void {
    this.closeModelDropdown();
    this.closePermissionDropdown();
    this.disposeModelSelectorStickyHeaders?.();
    this.disposeModelSelectorStickyHeaders = null;
    this.toolbarEl = null;
    this.modelSelectorContainer = null;
    this.modelSelectorTrigger = null;
    this.modelSelectorDropdown = null;
    this.modelSelectorSearchInput = null;
    this.modelSelectorScrollContainer = null;
    this.modelFilterQuery = '';
    this.availableModels = [];
    this.availableProviders = [];
    this.modelCatalogBundle = null;
    this.hasLoadedCatalog = false;
    this.currentModelTriggerIconUrl = null;
    this.modelSelectorIconRequestId += 1;
    this.permissionSelectorContainer = null;
    this.permissionSelectorTrigger = null;
    this.permissionSelectorDropdown = null;
  }

  private registerEscapeHandler(): void {
    if (this.hasRegisteredEscapeHandler) {
      return;
    }

    this.hasRegisteredEscapeHandler = true;
    this.host.registerEscapeHandler(() => {
      if (!this.isModelDropdownOpen && !this.isPermissionDropdownOpen) {
        return false;
      }

      this.closeModelDropdown();
      this.closePermissionDropdown();
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
      providers: this.availableProviders,
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
    this.switchModel(provider, model);
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

  private mountPermissionSelector(containerEl: HTMLElement): void {
    this.permissionSelectorContainer = containerEl;
    this.permissionSelectorTrigger = containerEl.createDiv({ cls: 'opencodian-permission-trigger' });

    const iconEl = this.permissionSelectorTrigger.createSpan({ cls: 'opencodian-permission-trigger-icon' });
    setIcon(iconEl, 'shield');
    this.permissionSelectorTrigger.createSpan({ cls: 'opencodian-permission-trigger-text' });

    this.permissionSelectorDropdown = containerEl.createDiv({ cls: 'opencodian-permission-dropdown' });
    this.permissionSelectorDropdown.style.display = 'none';
    this.buildPermissionDropdown();
    this.updatePermissionTriggerDisplay();

    this.permissionSelectorTrigger.addEventListener('click', (event) => {
      event.stopPropagation();
      this.togglePermissionDropdown();
    });

    this.permissionDropdownClickOutsideHandler = (event: MouseEvent) => {
      if (!this.permissionSelectorContainer?.contains(event.target as Node)) {
        this.closePermissionDropdown();
      }
    };
  }

  private buildPermissionDropdown(): void {
    if (!this.permissionSelectorDropdown) {
      return;
    }

    this.permissionSelectorDropdown.empty();

    for (const mode of this.getPermissionModeOptions()) {
      const optionEl = this.permissionSelectorDropdown.createDiv({
        cls: 'opencodian-permission-option',
        attr: { 'data-mode': mode.id },
      });

      const iconWrapper = optionEl.createSpan({ cls: 'opencodian-permission-option-icon' });
      setIcon(iconWrapper, 'shield');

      const contentEl = optionEl.createDiv({ cls: 'opencodian-permission-option-content' });
      contentEl.createDiv({ cls: 'opencodian-permission-option-label', text: mode.label });
      contentEl.createDiv({ cls: 'opencodian-permission-option-desc', text: mode.description });

      const checkmark = optionEl.createSpan({ cls: 'opencodian-permission-option-check' });
      setIcon(checkmark, 'check');

      optionEl.addEventListener('click', (event) => {
        event.stopPropagation();
        void this.selectPermissionMode(mode.id);
      });
    }

    this.updatePermissionDropdownSelection();
  }

  private getPermissionModeOptions(): PermissionModeOption[] {
    return [
      {
        id: 'yolo',
        label: t('settings.security.permissionMode.yolo'),
        description: t('settings.security.permissionMode.yoloDescription') || 'Allow all tools without asking',
      },
      {
        id: 'normal',
        label: t('settings.security.permissionMode.normal'),
        description: t('settings.security.permissionMode.normalDescription') || 'Ask before executing tools',
      },
      {
        id: 'plan',
        label: t('settings.security.permissionMode.plan'),
        description: t('settings.security.permissionMode.planDescription') || 'Review and approve all actions',
      },
    ];
  }

  private updatePermissionDropdownSelection(): void {
    if (!this.permissionSelectorDropdown) {
      return;
    }

    const currentMode = this.host.getPermissionMode();
    this.permissionSelectorDropdown.querySelectorAll('.opencodian-permission-option').forEach((option) => {
      const mode = option.getAttribute('data-mode');
      if (mode === currentMode) {
        option.addClass('is-selected');
      } else {
        option.removeClass('is-selected');
      }
    });
  }

  private togglePermissionDropdown(): void {
    if (this.isPermissionDropdownOpen) {
      this.closePermissionDropdown();
    } else {
      this.openPermissionDropdown();
    }
  }

  private openPermissionDropdown(): void {
    if (!this.permissionSelectorDropdown || !this.permissionSelectorTrigger) {
      return;
    }

    this.isPermissionDropdownOpen = true;
    this.permissionSelectorDropdown.style.display = 'block';
    this.permissionSelectorTrigger.addClass('is-open');
    this.updatePermissionDropdownSelection();

    if (this.permissionDropdownClickOutsideHandler) {
      document.addEventListener('click', this.permissionDropdownClickOutsideHandler);
    }
  }

  private closePermissionDropdown(): void {
    this.isPermissionDropdownOpen = false;
    if (this.permissionSelectorDropdown) {
      this.permissionSelectorDropdown.style.display = 'none';
    }
    this.permissionSelectorTrigger?.removeClass('is-open');

    if (this.permissionDropdownClickOutsideHandler) {
      document.removeEventListener('click', this.permissionDropdownClickOutsideHandler);
    }
  }

  private async selectPermissionMode(mode: PermissionMode): Promise<void> {
    await this.host.switchPermissionMode(mode);
    this.updatePermissionTriggerDisplay();
    this.closePermissionDropdown();
  }

  private getRequestedSessionModel(): ModelSelectorSelection | null {
    const override = this.host.getActiveTabModelOverride();
    if (override) {
      return override;
    }

    return this.host.getDefaultModelSelection();
  }

  private switchModel(provider: string, model: string): void {
    const didSetOverride = this.host.setActiveTabModelOverride({ provider, model });
    if (!didSetOverride) {
      return;
    }

    this.host.syncActiveTabContextUsageIdentity();

    const modelInfo = this.availableModels.find(
      (item) => item.provider === provider && item.model === model,
    );
    const modelName = modelInfo?.modelName || model;
    new Notice(`Model switched to: ${modelName}`);
  }
}
