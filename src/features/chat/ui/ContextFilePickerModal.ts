import type { App, TFile } from 'obsidian';
import { Modal } from 'obsidian';

import { t } from '../../../i18n';
import type { ContextFileCatalog, ContextFileEntry } from '../services/ContextFileCatalogService';

const MAX_RENDERED_FILES = 200;
const ALL_EXTENSION_FILTER = '__all__';

export function chooseContextFile(
  app: App,
  loadCatalog: () => ContextFileCatalog | Promise<ContextFileCatalog>,
): Promise<TFile | null> {
  return new Promise((resolve) => {
    new ContextFilePickerModal(app, loadCatalog, resolve).open();
  });
}

class ContextFilePickerModal extends Modal {
  private readonly loadCatalog: () => ContextFileCatalog | Promise<ContextFileCatalog>;
  private readonly onResolve: (file: TFile | null) => void;
  private catalog: ContextFileCatalog | null = null;
  private settled = false;
  private query = '';
  private selectedExtension = ALL_EXTENSION_FILTER;
  private isLoading = true;
  private isClosed = false;
  private searchInput: HTMLInputElement | null = null;
  private filterBarEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private renderFrameId: number | null = null;

  constructor(
    app: App,
    loadCatalog: () => ContextFileCatalog | Promise<ContextFileCatalog>,
    onResolve: (file: TFile | null) => void,
  ) {
    super(app);
    this.loadCatalog = loadCatalog;
    this.onResolve = onResolve;
  }

  onOpen(): void {
    this.titleEl.setText(t('chat.context.filePicker.title'));
    this.contentEl.empty();
    this.modalEl.addClass('opencodian-context-file-modal');

    const searchSectionEl = this.contentEl.createDiv({ cls: 'opencodian-context-file-search-section' });
    this.searchInput = this.contentEl.createEl('input', {
      cls: 'opencodian-context-file-search',
      attr: {
        type: 'text',
        placeholder: t('chat.context.filePicker.searchPlaceholder'),
      },
    });
    this.searchInput.disabled = true;
    searchSectionEl.appendChild(this.searchInput);

    const filterSectionEl = this.contentEl.createDiv({ cls: 'opencodian-context-file-filter-section' });
    filterSectionEl.createDiv({
      cls: 'opencodian-context-file-filter-heading',
      text: t('chat.context.filePicker.filterLabel'),
    });
    this.filterBarEl = this.contentEl.createDiv({ cls: 'opencodian-context-file-filters' });
    filterSectionEl.appendChild(this.filterBarEl);
    this.listEl = this.contentEl.createDiv({ cls: 'opencodian-context-file-list' });
    this.summaryEl = this.contentEl.createDiv({ cls: 'opencodian-context-file-summary' });

    this.searchInput.addEventListener('input', () => {
      this.query = this.searchInput?.value.trim().toLowerCase() ?? '';
      this.scheduleRender();
    });

    this.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.finish(null);
      }
    });

    this.render();
    window.setTimeout(() => {
      void this.loadCatalogData();
    }, 0);
  }

  onClose(): void {
    this.isClosed = true;
    if (this.renderFrameId !== null) {
      window.cancelAnimationFrame(this.renderFrameId);
      this.renderFrameId = null;
    }

    this.contentEl.empty();
    this.modalEl.removeClass('opencodian-context-file-modal');

    if (!this.settled) {
      this.finish(null, false);
    }
  }

  private async loadCatalogData(): Promise<void> {
    this.isLoading = true;
    this.render();

    const catalog = await Promise.resolve(this.loadCatalog());
    if (this.isClosed) {
      return;
    }

    this.catalog = catalog;
    this.isLoading = false;
    if (this.searchInput) {
      this.searchInput.disabled = false;
      window.setTimeout(() => this.searchInput?.focus(), 0);
    }

    this.render();
  }

  private scheduleRender(): void {
    if (this.renderFrameId !== null) {
      return;
    }

    this.renderFrameId = window.requestAnimationFrame(() => {
      this.renderFrameId = null;
      this.render();
    });
  }

  private render(): void {
    if (!this.filterBarEl || !this.listEl || !this.summaryEl) {
      return;
    }

    this.filterBarEl.empty();
    this.listEl.empty();
    this.summaryEl.empty();

    if (this.isLoading) {
      this.listEl.createDiv({
        cls: 'opencodian-context-file-empty is-loading',
        text: t('chat.context.filePicker.loading'),
      });
      return;
    }

    if (!this.catalog || this.catalog.entries.length === 0) {
      this.listEl.createDiv({
        cls: 'opencodian-context-file-empty',
        text: t('chat.context.filePicker.noFiles'),
      });
      return;
    }

    this.renderExtensionFilters();

    const filteredEntries = this.getFilteredEntries();
    this.summaryEl.setText(t('chat.context.filePicker.results', {
      visible: String(filteredEntries.length),
      total: String(this.catalog.entries.length),
      suffix: this.selectedExtension === ALL_EXTENSION_FILTER
        ? t('chat.context.filePicker.filterAll')
        : `.${this.selectedExtension}`,
    }));

    if (filteredEntries.length === 0) {
      this.listEl.createDiv({
        cls: 'opencodian-context-file-empty',
        text: t('chat.context.filePicker.empty'),
      });
      return;
    }

    const visibleEntries = filteredEntries.slice(0, MAX_RENDERED_FILES);
    for (const entry of visibleEntries) {
      const button = this.listEl.createEl('button', {
        cls: 'opencodian-context-file-item',
        attr: { type: 'button' },
      });

      const headerEl = button.createDiv({ cls: 'opencodian-context-file-item-header' });
      const titleEl = headerEl.createDiv({
        cls: 'opencodian-context-file-name',
        text: entry.file.basename,
      });
      titleEl.setAttribute('title', entry.file.basename);
      headerEl.createDiv({
        cls: 'opencodian-context-file-ext',
        text: `.${entry.extension}`,
      });

      const pathEl = button.createDiv({
        cls: 'opencodian-context-file-path',
        text: entry.file.path,
      });
      pathEl.setAttribute('title', entry.file.path);
      button.addEventListener('click', () => {
        this.finish(entry.file);
      });
    }

    if (filteredEntries.length > MAX_RENDERED_FILES) {
      this.summaryEl.setText(t('chat.context.filePicker.summary', {
        shown: String(visibleEntries.length),
        total: String(filteredEntries.length),
      }));
    }
  }

  private renderExtensionFilters(): void {
    if (!this.filterBarEl || !this.catalog) {
      return;
    }

    this.filterBarEl.appendChild(
      this.createExtensionFilterButton(
        ALL_EXTENSION_FILTER,
        t('chat.context.filePicker.filterAll'),
        this.catalog.entries.length,
      ),
    );

    for (const bucket of this.catalog.extensions) {
      this.filterBarEl.appendChild(
        this.createExtensionFilterButton(bucket.value, `.${bucket.value}`, bucket.count),
      );
    }
  }

  private createExtensionFilterButton(
    value: string,
    label: string,
    count: number,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'opencodian-context-file-filter';
    if (this.selectedExtension === value) {
      button.classList.add('is-active');
    }

    const labelEl = document.createElement('span');
    labelEl.className = 'opencodian-context-file-filter-label';
    labelEl.textContent = label;
    button.appendChild(labelEl);

    const countEl = document.createElement('span');
    countEl.className = 'opencodian-context-file-filter-count';
    countEl.textContent = String(count);
    button.appendChild(countEl);

    button.addEventListener('click', () => {
      this.selectedExtension = value;
      this.scheduleRender();
    });

    return button;
  }

  private getFilteredEntries(): ContextFileEntry[] {
    const entries = this.catalog?.entries ?? [];
    const query = this.query;
    const normalizedExtensionQuery = query.startsWith('.') ? query.slice(1) : query;

    return entries.filter((entry) => {
      if (this.selectedExtension !== ALL_EXTENSION_FILTER && entry.extension !== this.selectedExtension) {
        return false;
      }

      if (!query) {
        return true;
      }

      return entry.lowerPath.includes(query)
        || entry.lowerBasename.includes(query)
        || entry.lowerExtension.includes(normalizedExtensionQuery);
    });
  }

  private finish(file: TFile | null, shouldClose = true): void {
    if (this.settled) {
      return;
    }

    this.settled = true;
    this.onResolve(file);
    if (shouldClose) {
      this.close();
    }
  }
}
