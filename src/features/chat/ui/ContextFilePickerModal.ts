import type { App, TFile, TFolder } from 'obsidian';
import { Modal, setIcon,TFile as TFileClass } from 'obsidian';

import { t } from '../../../i18n';
import type { ContextFileCatalog, ContextFileEntry } from '../services/ContextFileCatalogService';

const MAX_RENDERED_FILES = 200;
const ALL_EXTENSION_FILTER = '__all__';

export type ContextPickedEntry = TFile | TFolder;

export interface ContextFilePickerOptions {
  /**
   * When true, the picker shows a read-only hint that the connected OpenCode
   * server can browse server-side files/references. The hint is informational
   * only and does not add a duplicate filesystem browser; vault file selection
   * behavior is unchanged.
   */
  serverContextAvailable?: boolean;
}

/**
 * Multi-select vault picker (R-A7): files and folders, check-mark toggling,
 * and one "attach" footer that resolves every picked entry. Replaces the old
 * single-select `chooseContextFile` — callers attach each picked entry as a
 * context item, so picking three notes in a row yields three chips.
 */
export function chooseContextFiles(
  app: App,
  loadCatalog: () => ContextFileCatalog | Promise<ContextFileCatalog>,
  options?: ContextFilePickerOptions,
): Promise<readonly ContextPickedEntry[]> {
  return new Promise((resolve) => {
    new ContextFilePickerModal(app, loadCatalog, resolve, options).open();
  });
}

class ContextFilePickerModal extends Modal {
  private readonly loadCatalog: () => ContextFileCatalog | Promise<ContextFileCatalog>;
  private readonly onResolve: (entries: readonly ContextPickedEntry[]) => void;
  private catalog: ContextFileCatalog | null = null;
  private settled = false;
  private query = '';
  private selectedExtension = ALL_EXTENSION_FILTER;
  private isLoading = true;
  private isClosed = false;
  private readonly selectedPaths = new Set<string>();
  private searchInput: HTMLInputElement | null = null;
  private filterBarEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private footerEl: HTMLElement | null = null;
  private renderFrameId: number | null = null;

  constructor(
    app: App,
    loadCatalog: () => ContextFileCatalog | Promise<ContextFileCatalog>,
    onResolve: (entries: readonly ContextPickedEntry[]) => void,
    private readonly options?: ContextFilePickerOptions,
  ) {
    super(app);
    this.loadCatalog = loadCatalog;
    this.onResolve = onResolve;
  }

  onOpen(): void {
    this.titleEl.setText(t('chat.context.filePicker.title'));
    this.contentEl.empty();
    this.modalEl.addClass('opencodian-context-file-modal');

    // Read-only informational hint shown when the connected OpenCode server
    // advertises the v2 fs/reference capability family. This does not add a
    // duplicate server filesystem browser; it only surfaces that server-side
    // context is reachable. Vault file selection behavior is unchanged.
    if (this.options?.serverContextAvailable) {
      this.contentEl.createDiv({
        cls: 'opencodian-context-file-server-hint',
        text: t('chat.context.filePicker.serverHint'),
      });
    }

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
    this.footerEl = this.contentEl.createDiv({ cls: 'opencodian-context-file-footer' });

    this.searchInput.addEventListener('input', () => {
      this.query = this.searchInput?.value.trim().toLowerCase() ?? '';
      this.scheduleRender();
    });

    this.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.finish([]);
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
      this.finish([], false);
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
    if (!this.filterBarEl || !this.listEl || !this.summaryEl || !this.footerEl) {
      return;
    }

    this.filterBarEl.empty();
    this.listEl.empty();
    this.summaryEl.empty();
    this.footerEl.empty();

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
      const isSelected = this.selectedPaths.has(entry.file.path);
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));

      const headerEl = button.createDiv({ cls: 'opencodian-context-file-item-header' });
      const checkEl = headerEl.createSpan({ cls: 'opencodian-context-file-item-check' });
      setIcon(checkEl, 'check');
      const glyphEl = headerEl.createSpan({ cls: 'opencodian-context-file-item-glyph' });
      setIcon(glyphEl, entry.kind === 'folder' ? 'folder' : 'file-text');
      const titleEl = headerEl.createDiv({
        cls: 'opencodian-context-file-name',
        text: entryDisplayName(entry),
      });
      titleEl.setAttribute('title', entryDisplayName(entry));
      if (entry.kind === 'file') {
        headerEl.createDiv({
          cls: 'opencodian-context-file-ext',
          text: `.${entry.extension}`,
        });
      } else {
        headerEl.createDiv({
          cls: 'opencodian-context-file-ext is-folder',
          text: t('chat.context.kind.folder'),
        });
      }

      const pathEl = button.createDiv({
        cls: 'opencodian-context-file-path',
        text: entry.file.path,
      });
      pathEl.setAttribute('title', entry.file.path);
      button.addEventListener('click', () => {
        // Multi-select (R-A7): a row toggles, it does not resolve. Rows stay
        // open until the footer confirms, so several notes can be picked in a
        // row without reopening the picker.
        if (this.selectedPaths.has(entry.file.path)) {
          this.selectedPaths.delete(entry.file.path);
        } else {
          this.selectedPaths.add(entry.file.path);
        }
        this.scheduleRender();
      });
    }

    if (filteredEntries.length > MAX_RENDERED_FILES) {
      this.summaryEl.setText(t('chat.context.filePicker.summary', {
        shown: String(visibleEntries.length),
        total: String(filteredEntries.length),
      }));
    }

    this.renderFooter();
  }

  private renderFooter(): void {
    const footer = this.footerEl;
    if (!footer) return;
    footer.empty();
    const count = this.selectedPaths.size;
    footer.createSpan({
      cls: 'opencodian-context-file-selected-count',
      text: t('chat.context.filePicker.selectedCount', { count }),
    });
    const confirm = footer.createEl('button', {
      cls: 'mod-cta opencodian-context-file-confirm',
      attr: { type: 'button' },
    });
    confirm.disabled = count === 0;
    confirm.textContent = t('chat.context.filePicker.addSelected', { count });
    confirm.addEventListener('click', () => {
      const entries = this.catalog?.entries ?? [];
      const picked = entries
        .filter((entry) => this.selectedPaths.has(entry.file.path))
        .map((entry) => entry.file);
      this.finish(picked);
    });
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
      // Folder entries have no extension and only appear under "all" (R-A7).
      if (this.selectedExtension !== ALL_EXTENSION_FILTER) {
        if (entry.kind !== 'file' || entry.extension !== this.selectedExtension) {
          return false;
        }
      }

      if (!query) {
        return true;
      }

      return entry.lowerPath.includes(query)
        || entry.lowerBasename.includes(query)
        || (entry.kind === 'file' && entry.lowerExtension.includes(normalizedExtensionQuery));
    });
  }

  private finish(entries: readonly ContextPickedEntry[], shouldClose = true): void {
    if (this.settled) {
      return;
    }

    this.settled = true;
    // Only real vault entries resolve: the modal never hands out path strings.
    this.onResolve(entries.filter((entry) => entry instanceof TFileClass || isFolder(entry)));
    if (shouldClose) {
      this.close();
    }
  }
}

/** Folders carry `name` instead of `basename`; files keep the basename. */
function entryDisplayName(entry: ContextFileEntry): string {
  return entry.file instanceof TFileClass ? entry.file.basename : entry.file.name;
}

function isFolder(entry: ContextPickedEntry): entry is TFolder {
  return !(entry instanceof TFileClass);
}
