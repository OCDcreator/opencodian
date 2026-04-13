import { setIcon } from 'obsidian';

import {
  type ModelCatalogState,
  type ModelCatalogStateMode,
  type ModelCatalogStateService,
  type ProviderAvailabilityProbe,
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

const logger = createLogger('SettingsModelCatalogPresenter');

interface ProviderAvailabilityCheckState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  probe?: ProviderAvailabilityProbe;
  error?: string;
}

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
    options: {
      restoreSearchSelection?: {
        start: number | null;
        end: number | null;
        direction?: 'forward' | 'backward' | 'none' | null;
      };
    } = {},
  ): void {
    this.lastRenderState = state;

    const existingProviderListEl = state.containerEl.querySelector('.opencodian-model-toggle-provider-list');
    if (existingProviderListEl instanceof HTMLElement) {
      this.providerListScrollTop = existingProviderListEl.scrollTop;
    }

    const { containerEl, catalogState } = state;
    const catalogs = catalogState?.catalogs ?? null;
    const disabledModelRefs = new Set(catalogState?.disabledModelRefs ?? []);

    containerEl.empty();

    const blockEl = containerEl.createDiv({ cls: 'opencodian-model-toggle-block' });
    const descEl = blockEl.createDiv({ cls: 'opencodian-model-toggle-desc' });
    this.applyInlineCodeText(descEl, t('settings.model.toggle.desc'));

    const controlsEl = blockEl.createDiv({ cls: 'opencodian-model-availability-controls' });
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
      const restoreSearchSelection = {
        start: searchInputEl.selectionStart,
        end: searchInputEl.selectionEnd,
        direction: searchInputEl.selectionDirection,
      };
      this.modelAvailabilityQuery = searchInputEl.value;
      this.rerender({ restoreSearchSelection });
    });

    const restoreSearchSelection = options.restoreSearchSelection;
    if (restoreSearchSelection) {
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

    const disabledToggleLabel = controlsEl.createEl('label', {
      cls: 'opencodian-model-availability-filter-toggle',
    });
    const disabledToggleEl = disabledToggleLabel.createEl('input', {
      attr: { type: 'checkbox' },
    });
    disabledToggleEl.checked = this.modelAvailabilityOnlyDisabled;
    disabledToggleEl.addEventListener('change', () => {
      this.modelAvailabilityOnlyDisabled = disabledToggleEl.checked;
      if (disabledToggleEl.checked) {
        this.modelAvailabilityOnlyEnabled = false;
      }
      this.rerender();
    });
    disabledToggleLabel.createSpan({ text: t('settings.model.availability.onlyDisabled') });

    const enabledToggleLabel = controlsEl.createEl('label', {
      cls: 'opencodian-model-availability-filter-toggle',
    });
    const enabledToggleEl = enabledToggleLabel.createEl('input', {
      attr: { type: 'checkbox' },
    });
    enabledToggleEl.checked = this.modelAvailabilityOnlyEnabled;
    enabledToggleEl.addEventListener('change', () => {
      this.modelAvailabilityOnlyEnabled = enabledToggleEl.checked;
      if (enabledToggleEl.checked) {
        this.modelAvailabilityOnlyDisabled = false;
      }
      this.rerender();
    });
    enabledToggleLabel.createSpan({ text: t('settings.model.availability.onlyEnabled') });

    let catalogSectionEl: HTMLElement | null = null;
    if (catalogs) {
      catalogSectionEl = blockEl.createDiv({ cls: 'opencodian-model-toggle-catalogs' });
      const summaryEl = catalogSectionEl.createDiv({ cls: 'opencodian-model-catalog-summary-grid' });
      this.renderModelCatalogSummaryCards(summaryEl, catalogState);
    }

    const selectedCatalog = catalogState
      ? this.getDisplayCatalogForMode(this.activeCatalogTab, catalogState)
      : null;
    const providerStatusCatalog = catalogState
      ? this.getProviderStatusCatalogForMode(this.activeCatalogTab, catalogState)
      : null;
    const providerStatusById = new Map(
      providerStatusCatalog?.providers.map((provider) => [provider.id, provider]) ?? [],
    );
    const selectedCatalogTitle = this.getCatalogTabTitle(this.activeCatalogTab);
    const selectedCatalogProviderIds = Array.from(new Set(
      selectedCatalog?.providers.map((provider) => provider.id) ?? [],
    ));
    const catalogScopedProviderIds = selectedCatalogProviderIds.filter((providerId) => {
      const provider = providerStatusById.get(providerId);
      return provider ? !this.isProviderDisabledByScope(provider, 'global') : true;
    });

    if (
      catalogSectionEl
      && catalogState
      && catalogs
      && selectedCatalog
      && this.activeCatalogTab !== 'disabled'
      && selectedCatalogProviderIds.length > 0
    ) {
      const catalogActionsEl = catalogSectionEl.createDiv({ cls: 'opencodian-model-catalog-actions' });
      const catalogActionsInfoEl = catalogActionsEl.createDiv({ cls: 'opencodian-model-catalog-actions-info' });
      catalogActionsInfoEl.createDiv({
        cls: 'opencodian-model-catalog-actions-title',
        text: selectedCatalogTitle,
      });
      catalogActionsInfoEl.createDiv({
        cls: 'opencodian-model-catalog-actions-meta',
        text: t('settings.model.catalog.summary', {
          providers: String(selectedCatalog.providers.length),
          models: String(this.getCatalogModelCount(selectedCatalog)),
        }),
      });

      const catalogActionsButtonsEl = catalogActionsEl.createDiv({
        cls: 'opencodian-model-catalog-actions-buttons',
      });
      const enableCatalogProvidersButton = catalogActionsButtonsEl.createEl('button', {
        cls: 'opencodian-model-toggle-provider-test-button opencodian-model-toggle-action-button',
        text: t('settings.model.availability.enableAllProviders'),
      });
      enableCatalogProvidersButton.type = 'button';
      enableCatalogProvidersButton.disabled = catalogScopedProviderIds.length === 0
        || catalogScopedProviderIds.every((providerId) => this.isProviderCurrentlyEnabled(providerId, catalogState));
      const disableCatalogProvidersButton = catalogActionsButtonsEl.createEl('button', {
        cls: 'opencodian-model-toggle-provider-test-button opencodian-model-toggle-action-button',
        text: t('settings.model.availability.disableAllProviders'),
      });
      disableCatalogProvidersButton.type = 'button';
      disableCatalogProvidersButton.disabled = catalogScopedProviderIds.length === 0
        || catalogScopedProviderIds.every((providerId) => !this.isProviderCurrentlyEnabled(providerId, catalogState));

      enableCatalogProvidersButton.addEventListener('click', async () => {
        enableCatalogProvidersButton.disabled = true;
        disableCatalogProvidersButton.disabled = true;
        try {
          await this.onProviderAvailabilityChange(catalogScopedProviderIds, true);
        } catch {
          // host already handled notice/logging
        } finally {
          if (enableCatalogProvidersButton.isConnected) {
            enableCatalogProvidersButton.disabled = false;
          }
          if (disableCatalogProvidersButton.isConnected) {
            disableCatalogProvidersButton.disabled = false;
          }
        }
      });
      disableCatalogProvidersButton.addEventListener('click', async () => {
        enableCatalogProvidersButton.disabled = true;
        disableCatalogProvidersButton.disabled = true;
        try {
          await this.onProviderAvailabilityChange(catalogScopedProviderIds, false);
        } catch {
          // host already handled notice/logging
        } finally {
          if (enableCatalogProvidersButton.isConnected) {
            enableCatalogProvidersButton.disabled = false;
          }
          if (disableCatalogProvidersButton.isConnected) {
            disableCatalogProvidersButton.disabled = false;
          }
        }
      });
    }

    const providers = selectedCatalog?.providers ?? [];
    if (providers.length === 0) {
      blockEl.createDiv({
        cls: 'opencodian-model-toggle-empty',
        text: t('settings.model.toggle.empty'),
      });
      return;
    }

    const normalizedQuery = this.modelAvailabilityQuery.trim().toLowerCase();
    const providerListEl = blockEl.createDiv({ cls: 'opencodian-model-toggle-provider-list' });
    providerListEl.scrollTop = this.providerListScrollTop;
    providerListEl.addEventListener('scroll', () => {
      this.providerListScrollTop = providerListEl.scrollTop;
    });

    for (const provider of providers) {
      const providerStatusSource = providerStatusById.get(provider.id) ?? provider;
      const providerEnabled = catalogState
        ? this.isProviderCurrentlyEnabled(provider.id, catalogState)
        : false;
      const primaryDisabledReason = this.getProviderPrimaryDisabledReason(
        providerStatusSource,
        providerEnabled,
      );
      const providerServerDisabled = primaryDisabledReason === 'server';
      const providerProjectDisabled = primaryDisabledReason === 'project';
      const providerCheckState = this.providerAvailabilityChecks.get(provider.id) ?? { status: 'idle' };
      const providerSearchText = `${provider.name || provider.id} ${provider.id}`.toLowerCase();
      const providerMatchesQuery = normalizedQuery.length > 0 && providerSearchText.includes(normalizedQuery);
      const disabledCount = providerEnabled
        ? providerStatusSource.models.filter((model) => disabledModelRefs.has(formatModelReference(provider.id, model.id))).length
        : providerStatusSource.models.length;
      const hasDisabledState = !providerEnabled || disabledCount > 0;
      const hasEnabledState = providerEnabled && disabledCount < providerStatusSource.models.length;
      if (this.modelAvailabilityOnlyDisabled && !hasDisabledState) {
        continue;
      }
      if (this.modelAvailabilityOnlyEnabled && !hasEnabledState) {
        continue;
      }

      const visibleModels = provider.models.filter((model) => {
        const modelRef = formatModelReference(provider.id, model.id);
        const modelSearchText = `${provider.name || provider.id} ${provider.id} ${model.name || model.id} ${model.id}`.toLowerCase();
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
      });

      if (normalizedQuery.length > 0 && !providerMatchesQuery && visibleModels.length === 0) {
        continue;
      }

      const isAutoExpanded = normalizedQuery.length > 0 && (providerMatchesQuery || visibleModels.length > 0);
      const isExpanded = isAutoExpanded || this.expandedProviderIds.has(provider.id);
      const providerEl = providerListEl.createDiv({
        cls: `opencodian-model-toggle-provider${providerEnabled ? '' : ' is-provider-disabled'}`,
      });

      const providerHeaderEl = providerEl.createDiv({ cls: 'opencodian-model-toggle-provider-header' });
      const expandButtonEl = providerHeaderEl.createEl('button', {
        cls: 'opencodian-model-toggle-provider-expand',
      });
      expandButtonEl.type = 'button';
      expandButtonEl.addEventListener('click', () => {
        if (this.expandedProviderIds.has(provider.id)) {
          this.expandedProviderIds.delete(provider.id);
        } else {
          this.expandedProviderIds.add(provider.id);
        }
        this.rerender();
      });

      const chevronEl = expandButtonEl.createSpan({ cls: 'opencodian-model-toggle-provider-chevron' });
      setIcon(chevronEl, isExpanded ? 'chevron-down' : 'chevron-right');
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
        text: this.describeModelAvailabilitySummary(
          providerStatusSource,
          providerEnabled,
          disabledCount,
          primaryDisabledReason,
          this.activeCatalogTab,
        ),
      });
      const badgesEl = providerInfoEl.createDiv({ cls: 'opencodian-model-toggle-provider-badges' });
      badgesEl.createSpan({
        cls: `opencodian-model-source-badge is-${provider.source}`,
        text: t(`settings.model.sourceBadge.${provider.source}` as const),
      });
      badgesEl.createSpan({
        cls: `opencodian-model-status-badge ${this.getProviderAvailabilityStatusClass(
          providerStatusSource,
          providerEnabled,
          disabledCount,
          this.activeCatalogTab,
        )}`,
        text: this.getProviderAvailabilityStatusLabel(
          providerStatusSource,
          providerEnabled,
          disabledCount,
          primaryDisabledReason,
          this.activeCatalogTab,
        ),
      });
      const serverDisabledBadge = this.getProviderServerConstraintBadge(
        providerStatusSource,
        providerEnabled,
        primaryDisabledReason,
        this.activeCatalogTab,
      );
      if (serverDisabledBadge) {
        badgesEl.createSpan({
          cls: `opencodian-model-status-badge ${serverDisabledBadge.className}`,
          text: serverDisabledBadge.text,
        });
      }
      const probeBadge = this.getProviderAvailabilityProbeBadge(providerCheckState);
      if (probeBadge) {
        badgesEl.createSpan({
          cls: `opencodian-model-status-badge ${probeBadge.className}`,
          text: probeBadge.text,
        });
      }
      const probeDetail = this.describeProviderAvailabilityProbe(providerCheckState);
      if (probeDetail) {
        providerInfoEl.createDiv({
          cls: `opencodian-model-toggle-provider-probe ${probeDetail.className}`,
          text: probeDetail.text,
        });
      }

      const providerActionsEl = providerHeaderEl.createDiv({ cls: 'opencodian-model-toggle-provider-actions' });
      const providerTestButton = providerActionsEl.createEl('button', {
        cls: 'opencodian-model-toggle-provider-test-button',
        text: providerCheckState.status === 'loading'
          ? t('settings.model.availability.check.loading')
          : t('settings.model.availability.check.button'),
      });
      providerTestButton.type = 'button';
      providerTestButton.disabled = providerCheckState.status === 'loading' || providerServerDisabled;
      providerTestButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.runProviderAvailabilityCheck(provider.id);
      });

      const providerToggleLabel = providerActionsEl.createEl('label', {
        cls: 'opencodian-model-toggle-switch',
      });
      const providerToggle = providerToggleLabel.createEl('input', {
        attr: { type: 'checkbox' },
      });
      providerToggle.checked = providerEnabled;
      providerToggle.disabled = providerServerDisabled;
      providerToggleLabel.createSpan({
        cls: 'opencodian-model-toggle-switch-label',
        text: providerProjectDisabled
          ? t('settings.model.toggle.providerProjectDisabled')
          : providerServerDisabled
            ? t('settings.model.toggle.providerServerDisabled')
            : t('settings.model.toggle.providerEnabled'),
      });
      providerToggle.addEventListener('change', () => {
        if (providerServerDisabled) {
          providerToggle.checked = false;
          return;
        }

        const requestedEnabled = providerToggle.checked;
        providerToggle.disabled = true;
        void (async () => {
          try {
            await this.onProviderAvailabilityChange([provider.id], requestedEnabled);
          } catch {
            providerToggle.checked = !requestedEnabled;
          } finally {
            if (providerToggle.isConnected) {
              providerToggle.disabled = false;
            }
          }
        })();
      });

      if (provider.models.length === 0) {
        providerEl.createDiv({
          cls: 'opencodian-model-toggle-empty',
          text: this.describeProviderModels(
            provider,
            (this.activeCatalogTab === 'server' || this.activeCatalogTab === 'disabled') && !providerEnabled
              ? this.getCatalogPlaceholderReason(provider, this.activeCatalogTab)
              : null,
          ) || t('settings.model.toggle.emptyModels'),
        });
        continue;
      }

      if (!isExpanded) {
        continue;
      }

      const modelsEl = providerEl.createDiv({ cls: 'opencodian-model-toggle-models' });
      const providerModelRefs = providerStatusSource.models.map((model) => formatModelReference(provider.id, model.id));
      if (providerModelRefs.length > 0) {
        const modelToolbarEl = modelsEl.createDiv({ cls: 'opencodian-model-toggle-model-toolbar' });
        modelToolbarEl.createDiv({
          cls: 'opencodian-model-toggle-model-toolbar-summary',
          text: t('settings.model.toggle.allModelsSummary', {
            count: String(providerModelRefs.length),
          }),
        });
        const modelBulkActionsEl = modelToolbarEl.createDiv({ cls: 'opencodian-model-toggle-model-bulk-actions' });
        const enableAllModelsButton = modelBulkActionsEl.createEl('button', {
          cls: 'opencodian-model-toggle-provider-test-button opencodian-model-toggle-action-button',
          text: t('settings.model.toggle.enableAllModels'),
        });
        enableAllModelsButton.type = 'button';
        const disableAllModelsButton = modelBulkActionsEl.createEl('button', {
          cls: 'opencodian-model-toggle-provider-test-button opencodian-model-toggle-action-button',
          text: t('settings.model.toggle.disableAllModels'),
        });
        disableAllModelsButton.type = 'button';
        enableAllModelsButton.addEventListener('click', async () => {
          enableAllModelsButton.disabled = true;
          disableAllModelsButton.disabled = true;
          try {
            await this.onModelAvailabilityChange(providerModelRefs, true);
          } catch {
            // host already handled notice/logging
          } finally {
            if (enableAllModelsButton.isConnected) {
              enableAllModelsButton.disabled = false;
            }
            if (disableAllModelsButton.isConnected) {
              disableAllModelsButton.disabled = false;
            }
          }
        });
        disableAllModelsButton.addEventListener('click', async () => {
          enableAllModelsButton.disabled = true;
          disableAllModelsButton.disabled = true;
          try {
            await this.onModelAvailabilityChange(providerModelRefs, false);
          } catch {
            // host already handled notice/logging
          } finally {
            if (enableAllModelsButton.isConnected) {
              enableAllModelsButton.disabled = false;
            }
            if (disableAllModelsButton.isConnected) {
              disableAllModelsButton.disabled = false;
            }
          }
        });
      }

      const modelsToRender = normalizedQuery.length > 0 || this.modelAvailabilityOnlyDisabled || this.modelAvailabilityOnlyEnabled
        ? visibleModels
        : provider.models;
      if (modelsToRender.length === 0) {
        modelsEl.createDiv({
          cls: 'opencodian-model-toggle-empty',
          text: t('settings.model.availability.noMatchingModels'),
        });
        continue;
      }

      for (const model of modelsToRender) {
        const modelRef = formatModelReference(provider.id, model.id);
        const modelEnabled = !disabledModelRefs.has(modelRef);
        const modelEl = modelsEl.createDiv({
          cls: `opencodian-model-toggle-model${modelEnabled ? '' : ' is-model-disabled'}${providerEnabled ? '' : ' is-provider-disabled'}`,
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
          text: !providerEnabled
            ? t('settings.model.toggle.providerDisabledPriority')
            : modelEnabled
              ? t('settings.model.toggle.modelEnabled')
              : t('settings.model.toggle.modelDisabled'),
        });
        modelToggle.addEventListener('change', () => {
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
        });
      }
    }

    window.requestAnimationFrame(() => {
      if (!providerListEl.isConnected) {
        return;
      }

      providerListEl.scrollTop = this.providerListScrollTop;
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
    options: {
      restoreSearchSelection?: {
        start: number | null;
        end: number | null;
        direction?: 'forward' | 'backward' | 'none' | null;
      };
    } = {},
  ): void {
    if (!this.lastRenderState) {
      return;
    }

    this.render(this.lastRenderState, options);
  }

  private getCatalogTabTitle(mode: ModelCatalogStateMode): string {
    switch (mode) {
      case 'local':
        return t('settings.model.catalog.localTitle');
      case 'server':
        return t('settings.model.catalog.serverTitle');
      case 'disabled':
        return t('settings.model.catalog.disabledTitle');
      case 'effective':
      default:
        return t('settings.model.catalog.effectiveTitle');
    }
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

  private describeModelAvailabilitySummary(
    provider: ModelCatalogProvider,
    providerEnabled: boolean,
    disabledCount: number,
    primaryDisabledReason: 'project' | 'server' | null,
    mode: ModelCatalogStateMode,
  ): string {
    if (mode === 'server' && this.isProviderDisabledByScope(provider, 'global')) {
      return t('settings.model.availability.summary.serverDisabled', {
        id: provider.id,
        count: String(provider.models.length),
      });
    }

    if (!providerEnabled) {
      if (primaryDisabledReason === 'project') {
        return t('settings.model.availability.summary.projectDisabled', {
          id: provider.id,
          count: String(provider.models.length),
        });
      }

      if (primaryDisabledReason === 'server') {
        return t('settings.model.availability.summary.serverDisabled', {
          id: provider.id,
          count: String(provider.models.length),
        });
      }

      return t('settings.model.availability.summary.providerDisabled', {
        id: provider.id,
        count: String(provider.models.length),
      });
    }

    if (disabledCount > 0) {
      return t('settings.model.availability.summary.partial', {
        id: provider.id,
        count: String(provider.models.length),
        disabled: String(disabledCount),
      });
    }

    if (this.isProviderDisabledByScope(provider, 'global')) {
      return t('settings.model.availability.summary.serverDisabledOverridden', {
        id: provider.id,
        count: String(provider.models.length),
      });
    }

    return t('settings.model.availability.summary.available', {
      id: provider.id,
      count: String(provider.models.length),
    });
  }

  private getProviderPrimaryDisabledReason(
    provider: ModelCatalogProvider,
    providerEnabled: boolean,
  ): 'project' | 'server' | null {
    if (providerEnabled) {
      return null;
    }

    if (this.isProviderDisabledByScope(provider, 'project')) {
      return 'project';
    }

    if (this.isProviderDisabledByScope(provider, 'global')) {
      return 'server';
    }

    return null;
  }

  private getProviderAvailabilityStatusClass(
    provider: ModelCatalogProvider,
    providerEnabled: boolean,
    disabledCount: number,
    mode: ModelCatalogStateMode,
  ): 'is-disabled' | 'is-partial' | 'is-available' {
    if (mode === 'server' && this.isProviderDisabledByScope(provider, 'global')) {
      return 'is-disabled';
    }

    if (!providerEnabled) {
      return 'is-disabled';
    }

    if (disabledCount > 0) {
      return 'is-partial';
    }

    return 'is-available';
  }

  private getProviderAvailabilityStatusLabel(
    provider: ModelCatalogProvider,
    providerEnabled: boolean,
    disabledCount: number,
    primaryDisabledReason: 'project' | 'server' | null,
    mode: ModelCatalogStateMode,
  ): string {
    if (mode === 'server' && this.isProviderDisabledByScope(provider, 'global')) {
      return t('settings.model.availability.status.serverDisabled');
    }

    if (!providerEnabled) {
      if (primaryDisabledReason === 'project') {
        return t('settings.model.availability.status.projectDisabled');
      }

      if (primaryDisabledReason === 'server') {
        return t('settings.model.availability.status.serverDisabled');
      }

      return t('settings.model.availability.status.providerDisabled');
    }

    return disabledCount > 0
      ? t('settings.model.availability.status.partial')
      : t('settings.model.availability.status.available');
  }

  private getProviderServerConstraintBadge(
    provider: ModelCatalogProvider,
    providerEnabled: boolean,
    primaryDisabledReason: 'project' | 'server' | null,
    mode: ModelCatalogStateMode,
  ): { text: string; className: 'is-disabled' | 'is-partial' } | null {
    if (!this.isProviderDisabledByScope(provider, 'global')) {
      return null;
    }

    if (mode === 'server' || primaryDisabledReason === 'server') {
      return null;
    }

    return {
      text: providerEnabled
        ? t('settings.model.availability.status.serverDisabledInherited')
        : t('settings.model.availability.status.serverDisabled'),
      className: providerEnabled ? 'is-partial' : 'is-disabled',
    };
  }

  private getProviderAvailabilityProbeBadge(
    state: ProviderAvailabilityCheckState,
  ): { text: string; className: 'is-available' | 'is-partial' | 'is-disabled' } | null {
    switch (state.status) {
      case 'loading':
        return {
          text: t('settings.model.availability.check.loading'),
          className: 'is-partial',
        };
      case 'error':
        return {
          text: t('settings.model.availability.check.failedBadge'),
          className: 'is-disabled',
        };
      case 'ready':
        if (!state.probe) {
          return null;
        }

        switch (state.probe.status) {
          case 'available':
            return {
              text: t('settings.model.availability.check.availableBadge'),
              className: 'is-available',
            };
          case 'send_failed':
            return {
              text: t('settings.model.availability.check.failedBadge'),
              className: 'is-disabled',
            };
          case 'catalog_only':
            return {
              text: t('settings.model.availability.check.catalogOnlyBadge'),
              className: 'is-partial',
            };
          case 'project_disabled':
            return {
              text: t('settings.model.availability.check.projectDisabledBadge'),
              className: 'is-disabled',
            };
          case 'server_disabled':
            return {
              text: t('settings.model.availability.check.serverDisabledBadge'),
              className: 'is-disabled',
            };
          case 'missing':
          default:
            return {
              text: t('settings.model.availability.check.missingBadge'),
              className: 'is-disabled',
            };
        }
      case 'idle':
      default:
        return null;
    }
  }

  private describeProviderAvailabilityProbe(
    state: ProviderAvailabilityCheckState,
  ): { text: string; className: string } | null {
    if (state.status === 'loading') {
      return {
        text: t('settings.model.availability.check.loadingDetail'),
        className: 'is-loading',
      };
    }

    if (state.status === 'error') {
      return {
        text: t('settings.model.availability.check.failedDetail', {
          message: state.error ?? t('settings.model.availability.check.unknownError'),
        }),
        className: 'is-error',
      };
    }

    if (state.status !== 'ready' || !state.probe) {
      return null;
    }

    const runtimeCount = String(state.probe.runtimeModelCount);
    const catalogCount = String(state.probe.catalogModelCount);
    const testedModelId = state.probe.testedModelId ?? t('settings.model.availability.check.unknownModel');
    switch (state.probe.status) {
      case 'available':
        return {
          text: state.probe.overridesServerDisabled
            ? t('settings.model.availability.check.availableOverrideDetail', { model: testedModelId })
            : t('settings.model.availability.check.availableDetail', { model: testedModelId }),
          className: 'is-success',
        };
      case 'send_failed':
        return {
          text: t('settings.model.availability.check.sendFailedDetail', {
            model: testedModelId,
            message: state.probe.sendTestError ?? t('settings.model.availability.check.unknownError'),
          }),
          className: 'is-error',
        };
      case 'project_disabled':
        return {
          text: state.probe.runtimeModelCount > 0
            ? t('settings.model.availability.check.projectDisabledWithRuntimeDetail', { count: runtimeCount })
            : t('settings.model.availability.check.projectDisabledDetail'),
          className: 'is-error',
        };
      case 'server_disabled':
        return {
          text: t('settings.model.availability.check.serverDisabledDetail'),
          className: 'is-error',
        };
      case 'catalog_only':
        return {
          text: state.probe.serverDisabled && state.probe.overridesServerDisabled
            ? t('settings.model.availability.check.catalogOnlyOverrideDetail', { count: catalogCount })
            : t('settings.model.availability.check.catalogOnlyDetail', { count: catalogCount }),
          className: 'is-warning',
        };
      case 'missing':
      default:
        return {
          text: t('settings.model.availability.check.missingDetail'),
          className: 'is-warning',
        };
    }
  }

  private getProviderStatusCatalogForMode(
    mode: ModelCatalogStateMode,
    catalogState: ModelCatalogState,
  ): ModelCatalog {
    return catalogState.providerStatusCatalogs[mode];
  }

  private isProviderDisabledByScope(provider: ModelCatalogProvider, scope: 'global' | 'project'): boolean {
    return provider.disabledScopes?.includes(scope) ?? false;
  }

  private isProviderCurrentlyEnabled(providerId: string, catalogState: ModelCatalogState): boolean {
    return catalogState.catalogs.currentEnabledProviderIds.includes(providerId);
  }

  private describeProviderModels(
    provider: ModelCatalogProvider,
    placeholderReason: 'project' | 'server' | null = null,
  ): string {
    if (provider.models.length === 0 && placeholderReason === 'project') {
      return t('settings.model.catalog.hiddenByProjectDisable');
    }

    if (provider.models.length === 0 && placeholderReason === 'server') {
      return t('settings.model.catalog.hiddenByServerDisable');
    }

    const modelNames = provider.models.map((model) => model.name);
    if (modelNames.length <= 6) {
      return modelNames.join(' · ');
    }

    const preview = modelNames.slice(0, 6).join(' · ');
    return `${preview} · +${modelNames.length - 6}`;
  }

  private getCatalogPlaceholderReason(
    provider: ModelCatalogProvider,
    mode: ModelCatalogStateMode,
  ): 'project' | 'server' | null {
    if (provider.models.length > 0) {
      return null;
    }

    if (mode === 'server' && this.isProviderDisabledByScope(provider, 'global')) {
      return 'server';
    }

    if (mode === 'disabled') {
      if (this.isProviderDisabledByScope(provider, 'project')) {
        return 'project';
      }
      if (this.isProviderDisabledByScope(provider, 'global')) {
        return 'server';
      }
    }

    return null;
  }
}
