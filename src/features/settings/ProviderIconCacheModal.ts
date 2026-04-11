import { App, Modal, Notice } from 'obsidian';

import type { ProviderIconEntry } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import {
  type ProviderIconProviderState,
  ProviderIconService,
} from '../../utils/icons/ProviderIconService';
import { ProviderBuiltinIconPickerModal } from './ProviderBuiltinIconPickerModal';

type ScrollRestoreState = {
  scrollTop: number;
  providerId?: string;
  providerOffset?: number;
  refocusAddInput?: boolean;
};

export class ProviderIconCacheModal extends Modal {
  private readonly providerSections = new Map<string, HTMLElement>();
  private quickJumpEl: HTMLElement | null = null;
  private scrollContainerEl: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly plugin: OpenCodianPlugin,
    private readonly currentProviderIds: string[],
    private readonly onLibraryChanged?: () => void,
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    this.setTitle(t('settings.model.iconCache.modal.title'));
    await this.render();
  }

  onClose(): void {
    this.quickJumpEl = null;
    this.scrollContainerEl = null;
    this.contentEl.empty();
  }

  private async render(restoreState?: ScrollRestoreState): Promise<void> {
    const { providers, summary } = await ProviderIconService.getProviderCacheState(
      this.app,
      this.currentProviderIds,
      this.plugin.settings.providerIconLibrary,
    );

    this.contentEl.empty();
    this.providerSections.clear();
    this.quickJumpEl = null;

    const summaryEl = this.contentEl.createDiv({ cls: 'opencodian-icon-cache-modal-summary' });
    summaryEl.setText(t('settings.model.iconCache.modal.summary', {
      cachedProviders: String(summary.cachedProviders),
      totalProviders: String(summary.totalProviders),
      cachedIcons: String(summary.cachedIcons),
      totalIcons: String(summary.totalIcons),
      currentProviders: String(summary.currentProviders),
    }));

    if (providers.length === 0) {
      this.contentEl.createDiv({
        cls: 'opencodian-icon-cache-modal-empty',
        text: t('settings.model.iconCache.noProviders'),
      });
      this.restoreScrollPosition(restoreState);
      return;
    }

    const quickJumpEl = this.contentEl.createDiv({ cls: 'opencodian-icon-cache-quick-jump' });
    this.quickJumpEl = quickJumpEl;
    quickJumpEl.createDiv({
      cls: 'opencodian-icon-cache-quick-jump-label',
      text: t('settings.model.iconCache.modal.quickJump'),
    });
    const quickJumpButtonsEl = quickJumpEl.createDiv({ cls: 'opencodian-icon-cache-quick-jump-buttons' });
    for (const provider of providers) {
      const buttonEl = quickJumpButtonsEl.createEl('button', {
        cls: `opencodian-icon-cache-quick-jump-button ${provider.isCurrentProvider ? 'is-current' : ''}`,
        text: provider.providerId,
      });
      buttonEl.type = 'button';
      buttonEl.addEventListener('click', () => {
        this.scrollToProviderSection(provider.providerId);
      });
    }

    for (const provider of providers) {
      this.renderProviderSection(provider);
    }

    this.restoreScrollPosition(restoreState);
  }

  private renderProviderSection(provider: ProviderIconProviderState): void {
    const sectionEl = this.contentEl.createDiv({ cls: 'opencodian-icon-cache-provider-section' });
    sectionEl.dataset.providerId = provider.providerId;
    this.providerSections.set(provider.providerId, sectionEl);
    const headerEl = sectionEl.createDiv({ cls: 'opencodian-icon-cache-provider-header' });
    const headingEl = headerEl.createDiv({ cls: 'opencodian-icon-cache-provider-heading' });
    headingEl.createDiv({
      cls: 'opencodian-icon-cache-provider-title',
      text: provider.providerId,
    });

    const badgesEl = headingEl.createDiv({ cls: 'opencodian-icon-cache-provider-badges' });
    badgesEl.createSpan({
      cls: `opencodian-icon-cache-provider-badge ${provider.isCurrentProvider ? 'is-current' : 'is-saved'}`,
      text: provider.isCurrentProvider
        ? t('settings.model.iconCache.modal.currentProvider')
        : t('settings.model.iconCache.modal.savedProvider'),
    });
    const headerActionsEl = headerEl.createDiv({ cls: 'opencodian-icon-cache-provider-header-actions' });
    const builtinButtonEl = headerActionsEl.createEl('button', {
      cls: 'mod-cta',
      text: t('settings.model.iconCache.modal.chooseBuiltin'),
    });
    builtinButtonEl.addEventListener('click', () => {
      this.openBuiltinPicker(provider.providerId);
    });

    const listEl = sectionEl.createDiv({ cls: 'opencodian-icon-cache-entry-list' });
    let draggedEntryId: string | null = null;

    if (provider.entries.length === 0) {
      listEl.createDiv({
        cls: 'opencodian-icon-cache-provider-empty',
        text: t('settings.model.iconCache.modal.emptyProvider'),
      });
    }

    for (const entry of provider.entries) {
      const itemEl = listEl.createDiv({ cls: 'opencodian-icon-cache-entry-item' });
      itemEl.draggable = provider.entries.length > 1;

      itemEl.addEventListener('dragstart', () => {
        draggedEntryId = entry.entry.id;
        itemEl.addClass('is-dragging');
      });
      itemEl.addEventListener('dragend', () => {
        draggedEntryId = null;
        itemEl.removeClass('is-dragging');
      });
      itemEl.addEventListener('dragover', (event) => {
        event.preventDefault();
        itemEl.addClass('is-drag-over');
      });
      itemEl.addEventListener('dragleave', () => {
        itemEl.removeClass('is-drag-over');
      });
      itemEl.addEventListener('drop', (event) => {
        event.preventDefault();
        itemEl.removeClass('is-drag-over');
        if (!draggedEntryId || draggedEntryId === entry.entry.id) {
          return;
        }
        void this.reorderProviderEntries(provider.providerId, draggedEntryId, entry.entry.id);
      });

      const previewEl = itemEl.createDiv({ cls: 'opencodian-icon-cache-card-preview' });
      if (entry.iconUrl) {
        const img = document.createElement('img');
        img.classList.add('opencodian-provider-icon-image');
        img.src = entry.iconUrl;
        img.alt = provider.providerId;
        previewEl.appendChild(img);
      } else {
        previewEl.createSpan({
          cls: 'opencodian-icon-cache-card-placeholder',
          text: entry.iconId ? '?' : '—',
        });
      }

      const bodyEl = itemEl.createDiv({ cls: 'opencodian-icon-cache-entry-body' });
      const titleRow = bodyEl.createDiv({ cls: 'opencodian-icon-cache-entry-title-row' });
      titleRow.createDiv({
        cls: 'opencodian-icon-cache-entry-title',
        text: entry.entry.type === 'mapped'
          ? t('settings.model.iconCache.modal.mappedEntry')
          : entry.entry.type === 'builtin'
            ? t('settings.model.iconCache.modal.builtinEntry')
          : t('settings.model.iconCache.modal.customEntry'),
      });
      if (entry.isSelected) {
        titleRow.createSpan({
          cls: 'opencodian-icon-cache-entry-badge is-selected',
          text: t('settings.model.iconCache.modal.selectedBadge'),
        });
      }
      if (entry.cached) {
        titleRow.createSpan({
          cls: 'opencodian-icon-cache-entry-badge is-cached',
          text: t('settings.model.iconCache.modal.cachedBadge'),
        });
      }
      if (entry.fallbackUsed) {
        titleRow.createSpan({
          cls: 'opencodian-icon-cache-entry-badge is-fallback',
          text: t('settings.model.iconCache.modal.fallbackBadge'),
        });
      }

      bodyEl.createDiv({
        cls: 'opencodian-icon-cache-entry-source',
        text: entry.sourceLabel,
      });
      const resolvedParts = [
        entry.requestedVariant
          ? t('settings.model.iconCache.modal.requestedVariant', {
              variant: t(`settings.model.iconCache.variant.${entry.requestedVariant}` as const),
            })
          : null,
        entry.resolvedVariant
          ? t('settings.model.iconCache.modal.resolvedVariant', {
              variant: t(`settings.model.iconCache.variant.${entry.resolvedVariant}` as const),
            })
          : null,
        entry.resolvedFormat
          ? t('settings.model.iconCache.modal.resolvedFormat', {
              format: entry.resolvedFormat,
            })
          : null,
      ].filter((part): part is string => Boolean(part));
      if (resolvedParts.length > 0) {
        const resolvedEl = bodyEl.createDiv({ cls: 'opencodian-icon-cache-entry-resolved' });
        for (const part of resolvedParts) {
          resolvedEl.createSpan({
            cls: 'opencodian-icon-cache-entry-resolved-badge',
            text: part,
          });
        }
      }
      if (entry.cachePath) {
        bodyEl.createDiv({
          cls: 'opencodian-icon-cache-entry-path',
          text: entry.cachePath,
        });
      }

      const actionsEl = itemEl.createDiv({ cls: 'opencodian-icon-cache-entry-actions' });
      if (!entry.isSelected) {
        const chooseBtn = actionsEl.createEl('button', {
          cls: 'mod-cta',
          text: t('settings.model.iconCache.modal.makeDefault'),
        });
        chooseBtn.addEventListener('click', () => {
          void this.moveEntryToFront(provider.providerId, entry.entry.id);
        });
      }

      if (entry.entry.type !== 'mapped') {
        const removeBtn = actionsEl.createEl('button', {
          text: t('settings.model.iconCache.modal.remove'),
        });
        removeBtn.addEventListener('click', () => {
          void this.removeCustomEntry(provider.providerId, entry.entry.id);
        });
      }
    }

    const addRowEl = sectionEl.createDiv({ cls: 'opencodian-icon-cache-add-row' });
    const controlsEl = addRowEl.createDiv({ cls: 'opencodian-icon-cache-add-controls' });
    const inputEl = controlsEl.createEl('textarea', {
      cls: 'opencodian-icon-cache-add-input',
      attr: {
        placeholder: t('settings.model.iconCache.modal.addPlaceholder'),
        rows: '3',
      },
    });
    const addBtn = controlsEl.createEl('button', {
      cls: 'mod-cta',
      text: t('settings.model.iconCache.modal.addButton'),
    });
    addRowEl.createDiv({
      cls: 'opencodian-icon-cache-add-hint',
      text: t('settings.model.iconCache.modal.addHint'),
    });
    addBtn.addEventListener('click', () => {
      void this.addCustomSource(provider.providerId, inputEl);
    });
    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void this.addCustomSource(provider.providerId, inputEl);
      }
    });
  }

  private async addCustomSource(providerId: string, inputEl: HTMLTextAreaElement): Promise<void> {
    const sources = ProviderIconService.splitCustomIconSourcesInput(inputEl.value);
    if (sources.length === 0) {
      new Notice(t('settings.model.iconCache.modal.addEmpty'));
      return;
    }

    const restoreState = this.captureScrollRestoreState(providerId, { refocusAddInput: true });
    let nextLibrary = this.plugin.settings.providerIconLibrary;
    const errors: string[] = [];
    let addedCount = 0;

    try {
      for (const source of sources) {
        try {
          nextLibrary = await ProviderIconService.addCustomIconSource(
            this.app,
            providerId,
            source,
            nextLibrary,
          );
          addedCount += 1;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : t('settings.model.iconCache.modal.addFailed'));
        }
      }

      if (addedCount === 0) {
        throw new Error(errors[0] ?? t('settings.model.iconCache.modal.addFailed'));
      }

      this.plugin.settings.providerIconLibrary = nextLibrary;
      await this.persistLibrary();
      inputEl.value = '';
      await this.render(restoreState);

      if (errors.length > 0) {
        new Notice(t('settings.model.iconCache.modal.addPartial', {
          successCount: String(addedCount),
          failedCount: String(errors.length),
          message: errors[0],
        }));
      }
    } catch (error) {
      new Notice(error instanceof Error ? error.message : t('settings.model.iconCache.modal.addFailed'));
    }
  }

  private async removeCustomEntry(providerId: string, entryId: string): Promise<void> {
    const restoreState = this.captureScrollRestoreState(providerId);
    this.plugin.settings.providerIconLibrary = ProviderIconService.removeProviderEntry(
      providerId,
      entryId,
      this.plugin.settings.providerIconLibrary,
    );
    await this.persistLibrary();
    await this.render(restoreState);
  }

  private async moveEntryToFront(providerId: string, entryId: string): Promise<void> {
    const entries = this.getEditableEntries(providerId);
    const targetIndex = entries.findIndex((entry) => entry.id === entryId);
    if (targetIndex <= 0) {
      return;
    }

    const [entry] = entries.splice(targetIndex, 1);
    entries.unshift(entry);
    this.plugin.settings.providerIconLibrary = ProviderIconService.updateProviderEntries(
      providerId,
      entries,
      this.plugin.settings.providerIconLibrary,
    );
    const restoreState = this.captureScrollRestoreState(providerId);
    await this.persistLibrary();
    await this.render(restoreState);
  }

  private async reorderProviderEntries(providerId: string, draggedId: string, targetId: string): Promise<void> {
    const entries = this.getEditableEntries(providerId);
    const draggedIndex = entries.findIndex((entry) => entry.id === draggedId);
    const targetIndex = entries.findIndex((entry) => entry.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
      return;
    }

    const [draggedEntry] = entries.splice(draggedIndex, 1);
    entries.splice(targetIndex, 0, draggedEntry);
    this.plugin.settings.providerIconLibrary = ProviderIconService.updateProviderEntries(
      providerId,
      entries,
      this.plugin.settings.providerIconLibrary,
    );
    const restoreState = this.captureScrollRestoreState(providerId);
    await this.persistLibrary();
    await this.render(restoreState);
  }

  private getEditableEntries(providerId: string): ProviderIconEntry[] {
    const currentEntries = this.plugin.settings.providerIconLibrary[providerId];
    if (currentEntries?.length) {
      return [...currentEntries];
    }

    const persisted = ProviderIconService.persistDefaultEntries(
      [providerId],
      this.plugin.settings.providerIconLibrary,
    );
    return [...(persisted[providerId] ?? [])];
  }

  private async persistLibrary(): Promise<void> {
    await this.plugin.saveSettings({
      syncService: false,
      reloadModels: true,
      syncConfig: false,
      applyUi: true,
    });
    this.onLibraryChanged?.();
  }

  private openBuiltinPicker(providerId: string): void {
    new ProviderBuiltinIconPickerModal(this.app, {
      plugin: this.plugin,
      providerId,
      library: this.plugin.settings.providerIconLibrary,
      onChoose: async ({ libraryId, iconId, variant }) => {
        this.plugin.settings.providerIconLibrary = ProviderIconService.selectBuiltinIcon(
          providerId,
          libraryId,
          iconId,
          this.plugin.settings.providerIconLibrary,
          variant,
        );
        const restoreState = this.captureScrollRestoreState(providerId);
        await this.persistLibrary();
        await this.render(restoreState);
        new Notice(t('settings.model.iconCache.builtinPicker.chooseSuccess', {
          providerId,
          iconId,
        }));
      },
    }).open();
  }

  private scrollToProviderSection(providerId: string): void {
    const sectionEl = this.providerSections.get(providerId);
    if (!sectionEl) {
      return;
    }

    sectionEl.style.scrollMarginTop = `${this.getQuickJumpScrollMargin()}px`;
    sectionEl.scrollIntoView({
      behavior: 'smooth',
    });
  }

  private getQuickJumpScrollMargin(): number {
    if (!this.quickJumpEl) {
      return 0;
    }

    return this.quickJumpEl.offsetHeight + 8;
  }

  private captureScrollRestoreState(
    providerId?: string,
    options?: { refocusAddInput?: boolean },
  ): ScrollRestoreState {
    const scrollContainer = this.getScrollContainer();
    const sectionEl = providerId ? this.providerSections.get(providerId) : null;

    return {
      scrollTop: scrollContainer.scrollTop,
      providerId,
      providerOffset: sectionEl
        ? scrollContainer.scrollTop - this.getElementOffsetWithinContainer(sectionEl, scrollContainer)
        : undefined,
      refocusAddInput: options?.refocusAddInput ?? false,
    };
  }

  private restoreScrollPosition(restoreState?: ScrollRestoreState): void {
    if (!restoreState) {
      return;
    }

    const scrollContainer = this.getScrollContainer();
    const applyRestore = () => {
      const sectionEl = restoreState.providerId
        ? this.providerSections.get(restoreState.providerId) ?? null
        : null;
      const nextScrollTop = sectionEl && restoreState.providerOffset !== undefined
        ? this.getElementOffsetWithinContainer(sectionEl, scrollContainer) + restoreState.providerOffset
        : restoreState.scrollTop;
      scrollContainer.scrollTop = Math.max(0, nextScrollTop);

      if (restoreState.refocusAddInput && sectionEl) {
        sectionEl.querySelector<HTMLTextAreaElement>('.opencodian-icon-cache-add-input')
          ?.focus({ preventScroll: true });
      }
    };

    applyRestore();
    window.requestAnimationFrame(() => {
      applyRestore();
      window.requestAnimationFrame(applyRestore);
    });
  }

  private getElementOffsetWithinContainer(element: HTMLElement, container: HTMLElement): number {
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return elementRect.top - containerRect.top + container.scrollTop;
  }

  private getScrollContainer(): HTMLElement {
    if (
      this.scrollContainerEl
      && this.scrollContainerEl.isConnected
      && this.scrollContainerEl.contains(this.contentEl)
    ) {
      return this.scrollContainerEl;
    }

    const matchedContainer = this.contentEl.closest<HTMLElement>('.modal-content');
    this.scrollContainerEl = matchedContainer ?? this.contentEl;
    return this.scrollContainerEl;
  }
}
