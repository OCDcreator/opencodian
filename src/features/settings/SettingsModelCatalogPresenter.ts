import { setIcon } from 'obsidian';

import {
  type ModelCatalogState,
  type ModelCatalogStateMode,
  type ModelCatalogStateService,
} from '../../core/config';
import {
  formatModelReference,
  type ModelCatalog,
  type ModelCatalogProvider,
} from '../../core/config/modelConfig';
import type { ModelSourceMode } from '../../core/types';
import { t } from '../../i18n';
import { createLogger } from '../../shared';
import { enhanceSearchInput } from './searchInputEnhancer';
import {
  describeModelAvailabilitySummary,
  describeProviderAvailabilityProbe,
  describeProviderModels,
  getCatalogPlaceholderReason,
  getProviderAvailabilityProbeBadge,
  getProviderAvailabilityStatusClass,
  getProviderAvailabilityStatusLabel,
  getProviderPrimaryDisabledReason,
  getProviderServerConstraintBadge,
  isProviderDisabledByScope,
  type ProviderAvailabilityCheckState,
  type ProviderAvailabilityDisplayState,
} from './SettingsModelCatalogAvailability';

const logger = createLogger('SettingsModelCatalogPresenter');

interface SettingsModelCatalogPresenterOptions {
  catalogStateService: ModelCatalogStateService;
  applyInlineCodeText: (targetEl: HTMLElement, text: string) => void;
  applyProviderIcon: (targetEl: HTMLElement, providerId: string, label?: string) => Promise<void> | void;
  onProviderAvailabilityChange: (providerIds: Iterable<string>, enabled: boolean) => Promise<void>;
  onModelAvailabilityChange: (modelRefs: Iterable<string>, enabled: boolean) => Promise<void>;
}

interface SettingsModelCatalogPresenterRenderState {
  containerEl: HTMLElement;
  catalogState: ModelCatalogState | null;
}

interface ModelAvailabilitySearchSelection {
  start: number | null;
  end: number | null;
  direction?: 'forward' | 'backward' | 'none' | null;
}

interface SettingsModelCatalogPresenterRenderOptions {
  restoreSearchSelection?: ModelAvailabilitySearchSelection;
}

interface ScrollHostSnapshot {
  element: HTMLElement;
  scrollTop: number;
}

interface ModelCatalogRenderContext {
  catalogState: ModelCatalogState;
  selectedCatalog: ModelCatalog;
  providerStatusById: Map<string, ModelCatalogProvider>;
  selectedCatalogProviderIds: string[];
  catalogScopedProviderIds: string[];
}

type ModelCatalogProviderModel = ModelCatalogProvider['models'][number];

interface ProviderModelVisibilityOptions {
  provider: ModelCatalogProvider;
  model: ModelCatalogProviderModel;
  providerEnabled: boolean;
  providerMatchesQuery: boolean;
  disabledModelRefs: Set<string>;
  normalizedQuery: string;
}

interface ProviderRenderState {
  provider: ModelCatalogProvider;
  providerStatusSource: ModelCatalogProvider;
  providerEnabled: boolean;
  providerServerDisabled: boolean;
  providerProjectDisabled: boolean;
  providerCheckState: ProviderAvailabilityCheckState;
  availabilityDisplayState: ProviderAvailabilityDisplayState;
  isExpanded: boolean;
  modelsToRender: ModelCatalogProviderModel[];
}

export class SettingsModelCatalogPresenter {
  private readonly catalogStateService: ModelCatalogStateService;
  private readonly applyInlineCodeText: (targetEl: HTMLElement, text: string) => void;
  private readonly applyProviderIcon: (targetEl: HTMLElement, providerId: string, label?: string) => Promise<void> | void;
  private readonly onProviderAvailabilityChange: (providerIds: Iterable<string>, enabled: boolean) => Promise<void>;
  private readonly onModelAvailabilityChange: (modelRefs: Iterable<string>, enabled: boolean) => Promise<void>;
  private activeCatalogTab: ModelCatalogStateMode = 'effective';
  private expandedProviderIds = new Set<string>();
  private modelAvailabilityQuery = '';
  private modelAvailabilityOnlyDisabled = false;
  private modelAvailabilityOnlyEnabled = false;
  private providerListScrollTop = 0;
  private readonly providerAvailabilityChecks = new Map<string, ProviderAvailabilityCheckState>();
  private lastRenderState: SettingsModelCatalogPresenterRenderState | null = null;

  constructor(options: SettingsModelCatalogPresenterOptions) {
    this.catalogStateService = options.catalogStateService;
    this.applyInlineCodeText = options.applyInlineCodeText;
    this.applyProviderIcon = options.applyProviderIcon;
    this.onProviderAvailabilityChange = options.onProviderAvailabilityChange;
    this.onModelAvailabilityChange = options.onModelAvailabilityChange;
  }

  setPreferredCatalogTab(mode: ModelSourceMode): void {
    switch (mode) {
      case 'local':
        this.activeCatalogTab = 'local';
        break;
      case 'server':
        this.activeCatalogTab = 'server';
        break;
      case 'merge':
      default:
        this.activeCatalogTab = 'effective';
        break;
    }
  }

  render(
    state: SettingsModelCatalogPresenterRenderState,
    options: SettingsModelCatalogPresenterRenderOptions = {},
  ): void {
    this.lastRenderState = state;
    const outerScrollHostSnapshot = this.captureOuterScrollHostSnapshot(state.containerEl);
    this.captureProviderListScrollPosition(state.containerEl);

    const { containerEl, catalogState } = state;
    const disabledModelRefs = new Set(catalogState?.disabledModelRefs ?? []);

    containerEl.empty();

    const blockEl = this.renderModelToggleBlock(containerEl);
    const catalogContext = catalogState
      ? this.createCatalogRenderContext(catalogState)
      : null;
    if (catalogState) {
      this.renderCatalogOverview(blockEl, catalogState);
    }

    const controlsEl = blockEl.createDiv({ cls: 'opencodian-model-availability-controls' });
    this.renderAvailabilityControls(controlsEl, options, catalogContext);

    this.renderProviderList(blockEl, catalogContext, disabledModelRefs);
    this.restoreOuterScrollHostPosition(outerScrollHostSnapshot);
  }

  private captureProviderListScrollPosition(containerEl: HTMLElement): void {
    const existingProviderListEl = containerEl.querySelector('.opencodian-model-toggle-provider-list');
    if (existingProviderListEl instanceof HTMLElement) {
      this.providerListScrollTop = existingProviderListEl.scrollTop;
    }
  }

  private captureOuterScrollHostSnapshot(containerEl: HTMLElement): ScrollHostSnapshot | null {
    const scrollHostEl = this.findOuterScrollHost(containerEl);
    if (!scrollHostEl) {
      return null;
    }

    return {
      element: scrollHostEl,
      scrollTop: scrollHostEl.scrollTop,
    };
  }

  private renderModelToggleBlock(containerEl: HTMLElement): HTMLElement {
    const descText = t('settings.model.toggle.desc');
    if (descText.trim().length > 0) {
      const descEl = containerEl.createDiv({ cls: 'opencodian-model-toggle-desc' });
      this.applyInlineCodeText(descEl, descText);
    }

    return containerEl;
  }

  private renderAvailabilityControls(
    controlsEl: HTMLElement,
    options: SettingsModelCatalogPresenterRenderOptions,
    catalogContext: ModelCatalogRenderContext | null,
  ): void {
    const searchInputEl = this.renderAvailabilitySearchInput(controlsEl);
    this.restoreAvailabilitySearchSelection(searchInputEl, options.restoreSearchSelection);
    this.renderAvailabilityFilterToggle(controlsEl, 'disabled');
    this.renderAvailabilityFilterToggle(controlsEl, 'enabled');
    if (catalogContext) {
      this.renderCatalogActionButtons(controlsEl, catalogContext);
    }
  }

  private renderAvailabilitySearchInput(controlsEl: HTMLElement): HTMLInputElement {
    const searchWrapperEl = controlsEl.createDiv({ cls: 'opencodian-model-availability-search' });
    const searchContainerEl = searchWrapperEl.createDiv({ cls: 'opencodian-model-availability-search-container' });
    const searchIconEl = searchContainerEl.createSpan({ cls: 'opencodian-model-availability-search-icon' });
    setIcon(searchIconEl, 'search');
    const searchInputEl = searchContainerEl.createEl('input', {
      cls: 'opencodian-model-availability-search-input',
      attr: {
        type: 'text',
        placeholder: t('settings.model.availability.searchPlaceholder'),
      },
    });
    searchInputEl.value = this.modelAvailabilityQuery;
    enhanceSearchInput({
      historyKey: 'model-availability',
      inputEl: searchInputEl,
      containerEl: searchContainerEl,
    });
    searchInputEl.addEventListener('input', () => {
      const restoreSearchSelection: ModelAvailabilitySearchSelection = {
        start: searchInputEl.selectionStart,
        end: searchInputEl.selectionEnd,
        direction: searchInputEl.selectionDirection,
      };
      this.modelAvailabilityQuery = searchInputEl.value;
      this.rerender({ restoreSearchSelection });
    });

    return searchInputEl;
  }

  private restoreAvailabilitySearchSelection(
    searchInputEl: HTMLInputElement,
    restoreSearchSelection: ModelAvailabilitySearchSelection | undefined,
  ): void {
    if (!restoreSearchSelection) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (!searchInputEl.isConnected) {
        return;
      }

      searchInputEl.focus();
      const { start, end, direction } = restoreSearchSelection;
      if (start !== null && end !== null) {
        searchInputEl.setSelectionRange(start, end, direction ?? 'none');
      }
    });
  }

  private renderAvailabilityFilterToggle(
    controlsEl: HTMLElement,
    filter: 'disabled' | 'enabled',
  ): void {
    const toggleLabel = controlsEl.createEl('label', {
      cls: 'opencodian-model-availability-filter-toggle',
    });
    const toggleEl = toggleLabel.createEl('input', {
      attr: { type: 'checkbox' },
    });
    toggleEl.checked = filter === 'disabled'
      ? this.modelAvailabilityOnlyDisabled
      : this.modelAvailabilityOnlyEnabled;
    toggleEl.addEventListener('change', () => {
      this.updateAvailabilityFilter(filter, toggleEl.checked);
      this.rerender();
    });
    toggleLabel.createSpan({
      text: filter === 'disabled'
        ? t('settings.model.availability.onlyDisabled')
        : t('settings.model.availability.onlyEnabled'),
    });
  }

  private updateAvailabilityFilter(filter: 'disabled' | 'enabled', checked: boolean): void {
    if (filter === 'disabled') {
      this.modelAvailabilityOnlyDisabled = checked;
      if (checked) {
        this.modelAvailabilityOnlyEnabled = false;
      }
      return;
    }

    this.modelAvailabilityOnlyEnabled = checked;
    if (checked) {
      this.modelAvailabilityOnlyDisabled = false;
    }
  }

  private renderCatalogOverview(
    blockEl: HTMLElement,
    catalogState: ModelCatalogState,
  ): HTMLElement {
    const catalogSectionEl = blockEl.createDiv({ cls: 'opencodian-model-toggle-catalogs' });
    const summaryEl = catalogSectionEl.createDiv({ cls: 'opencodian-model-catalog-summary-grid' });
    this.renderModelCatalogSummaryCards(summaryEl, catalogState);
    return catalogSectionEl;
  }

  private createCatalogRenderContext(catalogState: ModelCatalogState): ModelCatalogRenderContext {
    const selectedCatalog = this.getDisplayCatalogForMode(this.activeCatalogTab, catalogState);
    const providerStatusCatalog = this.getProviderStatusCatalogForMode(this.activeCatalogTab, catalogState);
    const providerStatusById = new Map(
      providerStatusCatalog.providers.map((provider) => [provider.id, provider]),
    );
    const selectedCatalogProviderIds = Array.from(new Set(
      selectedCatalog.providers.map((provider) => provider.id),
    ));
    const catalogScopedProviderIds = selectedCatalogProviderIds.filter((providerId) => {
      const provider = providerStatusById.get(providerId);
      return provider ? !isProviderDisabledByScope(provider, 'global') : true;
    });

    return {
      catalogState,
      selectedCatalog,
      providerStatusById,
      selectedCatalogProviderIds,
      catalogScopedProviderIds,
    };
  }

  private renderCatalogActionButtons(
    controlsEl: HTMLElement,
    context: ModelCatalogRenderContext,
  ): void {
    if (this.activeCatalogTab === 'disabled' || context.selectedCatalogProviderIds.length === 0) {
      return;
    }

    const catalogActionsButtonsEl = controlsEl.createDiv({
      cls: 'opencodian-model-catalog-actions-buttons',
    });
    const enableCatalogProvidersButton = this.createActionButton(
      catalogActionsButtonsEl,
      t('settings.model.availability.enableAllProviders'),
    );
    enableCatalogProvidersButton.disabled = context.catalogScopedProviderIds.length === 0
      || context.catalogScopedProviderIds.every((providerId) => this.isProviderCurrentlyEnabled(
        providerId,
        context.catalogState,
      ));
    const disableCatalogProvidersButton = this.createActionButton(
      catalogActionsButtonsEl,
      t('settings.model.availability.disableAllProviders'),
    );
    disableCatalogProvidersButton.disabled = context.catalogScopedProviderIds.length === 0
      || context.catalogScopedProviderIds.every((providerId) => !this.isProviderCurrentlyEnabled(
        providerId,
        context.catalogState,
      ));

    enableCatalogProvidersButton.addEventListener('click', () => {
      void this.runPairedButtonAction(
        [enableCatalogProvidersButton, disableCatalogProvidersButton],
        () => this.onProviderAvailabilityChange(context.catalogScopedProviderIds, true),
      );
    });
    disableCatalogProvidersButton.addEventListener('click', () => {
      void this.runPairedButtonAction(
        [enableCatalogProvidersButton, disableCatalogProvidersButton],
        () => this.onProviderAvailabilityChange(context.catalogScopedProviderIds, false),
      );
    });
  }

  private createActionButton(containerEl: HTMLElement, text: string): HTMLButtonElement {
    const buttonEl = containerEl.createEl('button', {
      cls: 'opencodian-model-toggle-provider-test-button opencodian-model-toggle-action-button',
      text,
    });
    buttonEl.type = 'button';
    return buttonEl;
  }

  private async runPairedButtonAction(
    buttonEls: [HTMLButtonElement, HTMLButtonElement],
    action: () => Promise<void>,
  ): Promise<void> {
    for (const buttonEl of buttonEls) {
      buttonEl.disabled = true;
    }

    try {
      await action();
    } catch {
      // host already handled notice/logging
    } finally {
      for (const buttonEl of buttonEls) {
        if (buttonEl.isConnected) {
          buttonEl.disabled = false;
        }
      }
    }
  }

  private renderProviderList(
    blockEl: HTMLElement,
    catalogContext: ModelCatalogRenderContext | null,
    disabledModelRefs: Set<string>,
  ): void {
    const providers = catalogContext?.selectedCatalog.providers ?? [];
    if (providers.length === 0 || !catalogContext) {
      blockEl.createDiv({
        cls: 'opencodian-model-toggle-empty',
        text: t('settings.model.toggle.empty'),
      });
      return;
    }

    const normalizedQuery = this.modelAvailabilityQuery.trim().toLowerCase();
    const providerListEl = this.createProviderList(blockEl);
    for (const provider of providers) {
      const providerRenderState = this.createProviderRenderState(
        provider,
        catalogContext,
        disabledModelRefs,
        normalizedQuery,
      );
      if (providerRenderState) {
        this.renderProviderAccordion(providerListEl, providerRenderState, disabledModelRefs);
      }
    }

    this.restoreProviderListScrollPosition(providerListEl);
  }

  private createProviderList(blockEl: HTMLElement): HTMLElement {
    const providerListEl = blockEl.createDiv({ cls: 'opencodian-model-toggle-provider-list' });
    providerListEl.scrollTop = this.providerListScrollTop;
    providerListEl.addEventListener('scroll', () => {
      this.providerListScrollTop = providerListEl.scrollTop;
    });
    return providerListEl;
  }

  private findOuterScrollHost(startEl: HTMLElement): HTMLElement | null {
    let current = startEl.parentElement;
    while (current) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY;
      const isScrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
        && current.scrollHeight > current.clientHeight + 1;
      if (isScrollable) {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }

  private createProviderRenderState(
    provider: ModelCatalogProvider,
    catalogContext: ModelCatalogRenderContext,
    disabledModelRefs: Set<string>,
    normalizedQuery: string,
  ): ProviderRenderState | null {
    const providerStatusSource = catalogContext.providerStatusById.get(provider.id) ?? provider;
    const providerEnabled = this.isProviderCurrentlyEnabled(provider.id, catalogContext.catalogState);
    const primaryDisabledReason = getProviderPrimaryDisabledReason(providerStatusSource, providerEnabled);
    const providerSearchText = `${provider.name || provider.id} ${provider.id}`.toLowerCase();
    const providerMatchesQuery = normalizedQuery.length > 0 && providerSearchText.includes(normalizedQuery);
    const disabledCount = providerEnabled
      ? providerStatusSource.models.filter((model) => disabledModelRefs.has(formatModelReference(provider.id, model.id))).length
      : providerStatusSource.models.length;
    const availabilityDisplayState: ProviderAvailabilityDisplayState = {
      provider: providerStatusSource,
      providerEnabled,
      disabledCount,
      primaryDisabledReason,
      mode: this.activeCatalogTab,
    };
    const hasDisabledState = !providerEnabled || disabledCount > 0;
    const hasEnabledState = providerEnabled && disabledCount < providerStatusSource.models.length;
    if (this.modelAvailabilityOnlyDisabled && !hasDisabledState) {
      return null;
    }
    if (this.modelAvailabilityOnlyEnabled && !hasEnabledState) {
      return null;
    }

    const visibleModels = provider.models.filter((model) => this.isProviderModelVisible({
      provider,
      model,
      providerEnabled,
      providerMatchesQuery,
      disabledModelRefs,
      normalizedQuery,
    }));
    if (normalizedQuery.length > 0 && !providerMatchesQuery && visibleModels.length === 0) {
      return null;
    }

    const isAutoExpanded = normalizedQuery.length > 0 && (providerMatchesQuery || visibleModels.length > 0);
    const modelsToRender = this.shouldUseFilteredModels(normalizedQuery)
      ? visibleModels
      : provider.models;

    return {
      provider,
      providerStatusSource,
      providerEnabled,
      providerServerDisabled: primaryDisabledReason === 'server',
      providerProjectDisabled: primaryDisabledReason === 'project',
      providerCheckState: this.providerAvailabilityChecks.get(provider.id) ?? { status: 'idle' },
      availabilityDisplayState,
      isExpanded: isAutoExpanded || this.expandedProviderIds.has(provider.id),
      modelsToRender,
    };
  }

  private isProviderModelVisible(options: ProviderModelVisibilityOptions): boolean {
    const {
      provider,
      model,
      providerEnabled,
      providerMatchesQuery,
      disabledModelRefs,
      normalizedQuery,
    } = options;
    const modelRef = formatModelReference(provider.id, model.id);
    const modelSearchText = `${provider.name || provider.id} ${provider.id} ${model.name || model.id} ${model.id}`
      .toLowerCase();
    const matchesQuery = normalizedQuery.length === 0
      ? true
      : providerMatchesQuery || modelSearchText.includes(normalizedQuery);
    if (!matchesQuery) {
      return false;
    }

    if (this.modelAvailabilityOnlyDisabled && providerEnabled && !disabledModelRefs.has(modelRef)) {
      return false;
    }
    if (this.modelAvailabilityOnlyEnabled && (!providerEnabled || disabledModelRefs.has(modelRef))) {
      return false;
    }

    return true;
  }

  private shouldUseFilteredModels(normalizedQuery: string): boolean {
    return normalizedQuery.length > 0
      || this.modelAvailabilityOnlyDisabled
      || this.modelAvailabilityOnlyEnabled;
  }

  private renderProviderAccordion(
    providerListEl: HTMLElement,
    providerRenderState: ProviderRenderState,
    disabledModelRefs: Set<string>,
  ): void {
    const providerEl = providerListEl.createDiv({
      cls: `opencodian-model-toggle-provider${providerRenderState.providerEnabled ? '' : ' is-provider-disabled'}`,
    });
    const providerHeaderEl = providerEl.createDiv({ cls: 'opencodian-model-toggle-provider-header' });
    this.renderProviderExpandButton(providerHeaderEl, providerRenderState);
    this.renderProviderActions(providerHeaderEl, providerRenderState);

    if (providerRenderState.provider.models.length === 0) {
      this.renderProviderEmptyModels(providerEl, providerRenderState);
      return;
    }

    if (!providerRenderState.isExpanded) {
      return;
    }

    this.renderProviderModels(providerEl, providerRenderState, disabledModelRefs);
  }

  private renderProviderExpandButton(
    providerHeaderEl: HTMLElement,
    state: ProviderRenderState,
  ): void {
    const { provider, availabilityDisplayState, providerCheckState } = state;
    const expandButtonEl = providerHeaderEl.createEl('button', {
      cls: 'opencodian-model-toggle-provider-expand',
    });
    expandButtonEl.type = 'button';
    expandButtonEl.addEventListener('click', () => {
      this.toggleProviderExpanded(provider.id);
    });

    const chevronEl = expandButtonEl.createSpan({ cls: 'opencodian-model-toggle-provider-chevron' });
    setIcon(chevronEl, state.isExpanded ? 'chevron-down' : 'chevron-right');
    const iconEl = expandButtonEl.createSpan({ cls: 'opencodian-model-toggle-provider-icon' });
    setIcon(iconEl, 'bot');
    void this.applyProviderIcon(iconEl, provider.id, provider.name || provider.id);

    const providerInfoEl = expandButtonEl.createDiv({ cls: 'opencodian-model-toggle-provider-info' });
    providerInfoEl.createDiv({
      cls: 'opencodian-model-toggle-provider-name',
      text: provider.name || provider.id,
    });
    providerInfoEl.createDiv({
      cls: 'opencodian-model-toggle-provider-meta',
      text: describeModelAvailabilitySummary(availabilityDisplayState),
    });
    this.renderProviderBadges(providerInfoEl, provider, availabilityDisplayState, providerCheckState);
  }

  private toggleProviderExpanded(providerId: string): void {
    if (this.expandedProviderIds.has(providerId)) {
      this.expandedProviderIds.delete(providerId);
    } else {
      this.expandedProviderIds.add(providerId);
    }
    this.rerender();
  }

  private renderProviderBadges(
    providerInfoEl: HTMLElement,
    provider: ModelCatalogProvider,
    availabilityDisplayState: ProviderAvailabilityDisplayState,
    providerCheckState: ProviderAvailabilityCheckState,
  ): void {
    const badgesEl = providerInfoEl.createDiv({ cls: 'opencodian-model-toggle-provider-badges' });
    badgesEl.createSpan({
      cls: `opencodian-model-source-badge is-${provider.source}`,
      text: t(`settings.model.sourceBadge.${provider.source}` as const),
    });
    badgesEl.createSpan({
      cls: `opencodian-model-status-badge ${getProviderAvailabilityStatusClass(availabilityDisplayState)}`,
      text: getProviderAvailabilityStatusLabel(availabilityDisplayState),
    });

    const serverDisabledBadge = getProviderServerConstraintBadge(availabilityDisplayState);
    if (serverDisabledBadge) {
      badgesEl.createSpan({
        cls: `opencodian-model-status-badge ${serverDisabledBadge.className}`,
        text: serverDisabledBadge.text,
      });
    }
    const probeBadge = getProviderAvailabilityProbeBadge(providerCheckState);
    if (probeBadge) {
      badgesEl.createSpan({
        cls: `opencodian-model-status-badge ${probeBadge.className}`,
        text: probeBadge.text,
      });
    }

    const probeDetail = describeProviderAvailabilityProbe(providerCheckState);
    if (probeDetail) {
      providerInfoEl.createDiv({
        cls: `opencodian-model-toggle-provider-probe ${probeDetail.className}`,
        text: probeDetail.text,
      });
    }
  }

  private renderProviderActions(
    providerHeaderEl: HTMLElement,
    state: ProviderRenderState,
  ): void {
    const providerActionsEl = providerHeaderEl.createDiv({ cls: 'opencodian-model-toggle-provider-actions' });
    const providerTestButton = providerActionsEl.createEl('button', {
      cls: 'opencodian-model-toggle-provider-test-button',
      text: state.providerCheckState.status === 'loading'
        ? t('settings.model.availability.check.loading')
        : t('settings.model.availability.check.button'),
    });
    providerTestButton.type = 'button';
    providerTestButton.disabled = state.providerCheckState.status === 'loading' || state.providerServerDisabled;
    providerTestButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.runProviderAvailabilityCheck(state.provider.id);
    });

    this.renderProviderToggle(providerActionsEl, state);
  }

  private renderProviderToggle(providerActionsEl: HTMLElement, state: ProviderRenderState): void {
    const providerToggleLabel = providerActionsEl.createEl('label', {
      cls: 'opencodian-model-toggle-switch',
    });
    const providerToggle = providerToggleLabel.createEl('input', {
      attr: { type: 'checkbox' },
    });
    providerToggle.checked = state.providerEnabled;
    providerToggle.disabled = state.providerServerDisabled;
    providerToggleLabel.createSpan({
      cls: 'opencodian-model-toggle-switch-label',
      text: this.getProviderToggleLabel(state),
    });
    providerToggle.addEventListener('change', () => {
      this.handleProviderToggleChange(providerToggle, state);
    });
  }

  private getProviderToggleLabel(state: ProviderRenderState): string {
    if (state.providerProjectDisabled) {
      return t('settings.model.toggle.providerProjectDisabled');
    }

    return state.providerServerDisabled
      ? t('settings.model.toggle.providerServerDisabled')
      : t('settings.model.toggle.providerEnabled');
  }

  private handleProviderToggleChange(
    providerToggle: HTMLInputElement,
    state: ProviderRenderState,
  ): void {
    if (state.providerServerDisabled) {
      providerToggle.checked = false;
      return;
    }

    const requestedEnabled = providerToggle.checked;
    providerToggle.disabled = true;
    void (async () => {
      try {
        await this.onProviderAvailabilityChange([state.provider.id], requestedEnabled);
      } catch {
        providerToggle.checked = !requestedEnabled;
      } finally {
        if (providerToggle.isConnected) {
          providerToggle.disabled = false;
        }
      }
    })();
  }

  private renderProviderEmptyModels(providerEl: HTMLElement, state: ProviderRenderState): void {
    providerEl.createDiv({
      cls: 'opencodian-model-toggle-empty',
      text: describeProviderModels(
        state.provider,
        (this.activeCatalogTab === 'server' || this.activeCatalogTab === 'disabled') && !state.providerEnabled
          ? getCatalogPlaceholderReason(state.provider, this.activeCatalogTab)
          : null,
      ) || t('settings.model.toggle.emptyModels'),
    });
  }

  private renderProviderModels(
    providerEl: HTMLElement,
    state: ProviderRenderState,
    disabledModelRefs: Set<string>,
  ): void {
    const modelsEl = providerEl.createDiv({ cls: 'opencodian-model-toggle-models' });
    this.renderProviderModelBulkToolbar(modelsEl, state);

    if (state.modelsToRender.length === 0) {
      modelsEl.createDiv({
        cls: 'opencodian-model-toggle-empty',
        text: t('settings.model.availability.noMatchingModels'),
      });
      return;
    }

    for (const model of state.modelsToRender) {
      this.renderProviderModelRow(modelsEl, state, model, disabledModelRefs);
    }
  }

  private renderProviderModelBulkToolbar(modelsEl: HTMLElement, state: ProviderRenderState): void {
    const providerModelRefs = state.providerStatusSource.models.map((model) => formatModelReference(
      state.provider.id,
      model.id,
    ));
    if (providerModelRefs.length === 0) {
      return;
    }

    const modelToolbarEl = modelsEl.createDiv({ cls: 'opencodian-model-toggle-model-toolbar' });
    modelToolbarEl.createDiv({
      cls: 'opencodian-model-toggle-model-toolbar-summary',
      text: t('settings.model.toggle.allModelsSummary', {
        count: String(providerModelRefs.length),
      }),
    });
    const modelBulkActionsEl = modelToolbarEl.createDiv({ cls: 'opencodian-model-toggle-model-bulk-actions' });
    const enableAllModelsButton = this.createActionButton(
      modelBulkActionsEl,
      t('settings.model.toggle.enableAllModels'),
    );
    const disableAllModelsButton = this.createActionButton(
      modelBulkActionsEl,
      t('settings.model.toggle.disableAllModels'),
    );
    enableAllModelsButton.addEventListener('click', () => {
      void this.runPairedButtonAction(
        [enableAllModelsButton, disableAllModelsButton],
        () => this.onModelAvailabilityChange(providerModelRefs, true),
      );
    });
    disableAllModelsButton.addEventListener('click', () => {
      void this.runPairedButtonAction(
        [enableAllModelsButton, disableAllModelsButton],
        () => this.onModelAvailabilityChange(providerModelRefs, false),
      );
    });
  }

  private renderProviderModelRow(
    modelsEl: HTMLElement,
    state: ProviderRenderState,
    model: ModelCatalogProviderModel,
    disabledModelRefs: Set<string>,
  ): void {
    const modelRef = formatModelReference(state.provider.id, model.id);
    const modelEnabled = !disabledModelRefs.has(modelRef);
    const modelEl = modelsEl.createDiv({
      cls: `opencodian-model-toggle-model${modelEnabled ? '' : ' is-model-disabled'}${state.providerEnabled ? '' : ' is-provider-disabled'}`,
    });
    const modelInfoEl = modelEl.createDiv({ cls: 'opencodian-model-toggle-model-info' });
    modelInfoEl.createDiv({
      cls: 'opencodian-model-toggle-model-name',
      text: model.name || model.id,
    });
    modelInfoEl.createDiv({
      cls: 'opencodian-model-toggle-model-meta',
      text: model.id,
    });

    const modelToggleLabel = modelEl.createEl('label', {
      cls: 'opencodian-model-toggle-switch',
    });
    const modelToggle = modelToggleLabel.createEl('input', {
      attr: { type: 'checkbox' },
    });
    modelToggle.checked = modelEnabled;
    modelToggleLabel.createSpan({
      cls: 'opencodian-model-toggle-switch-label',
      text: this.getModelToggleLabel(state.providerEnabled, modelEnabled),
    });
    modelToggle.addEventListener('change', () => {
      this.handleModelToggleChange(modelToggle, modelRef);
    });
  }

  private getModelToggleLabel(providerEnabled: boolean, modelEnabled: boolean): string {
    if (!providerEnabled) {
      return t('settings.model.toggle.providerDisabledPriority');
    }

    return modelEnabled
      ? t('settings.model.toggle.modelEnabled')
      : t('settings.model.toggle.modelDisabled');
  }

  private handleModelToggleChange(modelToggle: HTMLInputElement, modelRef: string): void {
    const requestedEnabled = modelToggle.checked;
    modelToggle.disabled = true;
    void (async () => {
      try {
        await this.onModelAvailabilityChange([modelRef], requestedEnabled);
      } catch {
        modelToggle.checked = !requestedEnabled;
      } finally {
        if (modelToggle.isConnected) {
          modelToggle.disabled = false;
        }
      }
    })();
  }

  private restoreProviderListScrollPosition(providerListEl: HTMLElement): void {
    window.requestAnimationFrame(() => {
      if (!providerListEl.isConnected) {
        return;
      }

      providerListEl.scrollTop = this.providerListScrollTop;
    });
  }

  private restoreOuterScrollHostPosition(snapshot: ScrollHostSnapshot | null): void {
    if (!snapshot) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (!snapshot.element.isConnected) {
        return;
      }

      snapshot.element.scrollTop = snapshot.scrollTop;
    });
  }

  getDisplayCatalogForMode(
    mode: ModelCatalogStateMode,
    catalogState: ModelCatalogState,
  ): ModelCatalog {
    return catalogState.displayCatalogs[mode];
  }

  getCatalogModelCount(catalog: ModelCatalog): number {
    return catalog.providers.reduce((total, provider) => total + provider.models.length, 0);
  }

  private rerender(
    options: SettingsModelCatalogPresenterRenderOptions = {},
  ): void {
    if (!this.lastRenderState) {
      return;
    }

    this.render(this.lastRenderState, options);
  }

  private renderModelCatalogSummaryCards(
    containerEl: HTMLElement,
    catalogState: ModelCatalogState,
  ): void {
    containerEl.empty();

    const cards: Array<{
      mode: ModelCatalogStateMode;
      title: string;
      catalog: ModelCatalog;
    }> = [
      {
        mode: 'local',
        title: t('settings.model.catalog.localTitle'),
        catalog: this.getDisplayCatalogForMode('local', catalogState),
      },
      {
        mode: 'server',
        title: t('settings.model.catalog.serverTitle'),
        catalog: this.getDisplayCatalogForMode('server', catalogState),
      },
      {
        mode: 'effective',
        title: t('settings.model.catalog.effectiveTitle'),
        catalog: this.getDisplayCatalogForMode('effective', catalogState),
      },
      {
        mode: 'disabled',
        title: t('settings.model.catalog.disabledTitle'),
        catalog: this.getDisplayCatalogForMode('disabled', catalogState),
      },
    ];

    for (const card of cards) {
      const cardEl = containerEl.createEl('button', { cls: 'opencodian-model-catalog-summary-card' });
      cardEl.type = 'button';
      if (card.mode === this.activeCatalogTab) {
        cardEl.addClass('is-active');
      }

      cardEl.createDiv({
        cls: 'opencodian-model-catalog-summary-card-title',
        text: card.title,
      });
      cardEl.createDiv({
        cls: 'opencodian-model-catalog-summary-card-meta',
        text: t('settings.model.catalog.summary', {
          providers: String(card.catalog.providers.length),
          models: String(this.getCatalogModelCount(card.catalog)),
        }),
      });

      cardEl.addEventListener('click', () => {
        if (this.activeCatalogTab === card.mode) {
          return;
        }

        this.activeCatalogTab = card.mode;
        this.rerender();
      });
    }
  }

  private async runProviderAvailabilityCheck(providerId: string): Promise<void> {
    const existing = this.providerAvailabilityChecks.get(providerId);
    if (existing?.status === 'loading') {
      return;
    }

    this.providerAvailabilityChecks.set(providerId, { status: 'loading' });
    this.rerender();

    try {
      const probe = await this.catalogStateService.probeProvider(providerId);
      this.providerAvailabilityChecks.set(providerId, {
        status: 'ready',
        probe,
      });
    } catch (error) {
      logger.error('Failed to test provider availability:', error);
      this.providerAvailabilityChecks.set(providerId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.rerender();
  }

  private getProviderStatusCatalogForMode(
    mode: ModelCatalogStateMode,
    catalogState: ModelCatalogState,
  ): ModelCatalog {
    return catalogState.providerStatusCatalogs[mode];
  }

  private isProviderCurrentlyEnabled(providerId: string, catalogState: ModelCatalogState): boolean {
    return catalogState.catalogs.currentEnabledProviderIds.includes(providerId);
  }

}
