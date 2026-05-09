import type { SlashCommandMenuItem } from '../../../core/config/slashCommandCatalog';
import type { SlashCommandSkillMode } from '../../../core/types';
import { t } from '../../../i18n';
import {
  getSlashCommandMenuQuery,
  replaceSlashTokenAtCursor,
} from './composerInputParsing';
import { filterSlashCommandMenuItems } from './slashCommandMenuFilter';
import { renderSlashCommandMenu, type SlashCommandMenuStatus } from './slashCommandMenuRenderer';

export interface SlashCommandMenuCoordinatorHost {
  getTextarea(): HTMLTextAreaElement | null;
  getMenuElement(): HTMLElement | null;
  getCatalogItems(): SlashCommandMenuItem[] | null;
  setCatalogItems(items: SlashCommandMenuItem[] | null): void;
  loadItems(): Promise<SlashCommandMenuItem[]>;
  getSkillMode(): SlashCommandSkillMode;
  onMenuLoadFailed(error: unknown): void;
  onCatalogStateChanged(): void;
  onMenuItemApplied(): void;
  scheduleLayoutSync(): void;
}

export class SlashCommandMenuCoordinator {
  private visibleItems: SlashCommandMenuItem[] = [];
  private selectedIndex = 0;
  private runId = 0;
  private status: SlashCommandMenuStatus = 'idle';
  private query: string | null = null;

  constructor(private readonly host: SlashCommandMenuCoordinatorHost) {}

  reset(): void {
    this.visibleItems = [];
    this.selectedIndex = 0;
    this.runId += 1;
    this.status = 'idle';
    this.query = null;
  }

  tryHandleKeydown(event: KeyboardEvent): boolean {
    this.syncStateWithCurrentContext();

    if (this.visibleItems.length === 0) {
      if (event.key === 'Escape' && this.status !== 'idle') {
        event.preventDefault();
        this.clear();
        return true;
      }

      return false;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveSelection(1);
      return true;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveSelection(-1);
      return true;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.clear();
      return true;
    }

    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
      event.preventDefault();
      this.applySelectedItem();
      return true;
    }

    return false;
  }

  async refresh(): Promise<void> {
    const textarea = this.host.getTextarea();
    if (!textarea) {
      return;
    }

    const query = getSlashCommandMenuQuery(textarea);
    if (query === null) {
      this.clear();
      return;
    }

    this.query = query;
    const currentRunId = ++this.runId;
    this.visibleItems = [];
    this.selectedIndex = 0;
    this.status = 'loading';
    this.render();

    try {
      const items = this.host.getCatalogItems() ?? await this.host.loadItems();
      if (currentRunId !== this.runId) {
        return;
      }

      this.host.setCatalogItems(items);
      this.visibleItems = this.filterItems(items, query);
      this.selectedIndex = 0;
      this.status = this.visibleItems.length > 0
        ? 'idle'
        : this.getEmptyStatus(items);
      this.host.onCatalogStateChanged();
      this.render();
    } catch (error) {
      if (currentRunId !== this.runId) {
        return;
      }

      this.host.onMenuLoadFailed(error);
      this.host.setCatalogItems(null);
      this.visibleItems = [];
      this.selectedIndex = 0;
      this.status = 'loadFailed';
      this.host.onCatalogStateChanged();
      this.render();
    }
  }

  clear(options: { resetCatalog?: boolean } = {}): void {
    this.runId += 1;
    if (options.resetCatalog) {
      this.host.setCatalogItems(null);
    }
    this.visibleItems = [];
    this.selectedIndex = 0;
    this.status = 'idle';
    this.query = null;
    this.host.onCatalogStateChanged();
    this.render();
  }

  private moveSelection(delta: number): void {
    if (this.visibleItems.length === 0) {
      return;
    }

    const itemCount = this.visibleItems.length;
    this.selectedIndex = (this.selectedIndex + delta + itemCount) % itemCount;
    this.render();
    this.scrollSelectedItemIntoView();
  }

  private scrollSelectedItemIntoView(): void {
    const menuEl = this.host.getMenuElement();
    if (!menuEl) {
      return;
    }

    const selectedEl = menuEl.querySelector<HTMLElement>(
      '.opencodian-slash-command-menu-item.is-selected',
    );
    if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  private applySelectedItem(): void {
    this.syncStateWithCurrentContext();

    const item = this.visibleItems[this.selectedIndex];
    const textarea = this.host.getTextarea();
    if (!item || !textarea) {
      return;
    }

    const cursorPos = textarea.selectionStart ?? textarea.value.length;
    const replacement = item.insertText ?? `/${item.id} `;
    const { value: nextValue, cursorPos: nextCursorPos } =
      replaceSlashTokenAtCursor(textarea.value, cursorPos, replacement);

    textarea.value = nextValue;
    textarea.focus();
    textarea.setSelectionRange(nextCursorPos, nextCursorPos);
    this.host.onMenuItemApplied();
    if (item.source === 'skills-command') {
      void this.refresh();
      return;
    }

    this.clear();
  }

  private render(): void {
    const menuEl = this.host.getMenuElement();
    if (!menuEl) {
      return;
    }

    this.syncStateWithCurrentContext();
    renderSlashCommandMenu({
      menuEl,
      items: this.visibleItems,
      selectedIndex: this.selectedIndex,
      status: this.status,
      onHoverItem: (index) => {
        if (this.selectedIndex === index) {
          return;
        }

        this.selectedIndex = index;
        this.render();
      },
      onSelectItem: (index) => {
        this.selectedIndex = index;
        this.applySelectedItem();
      },
    });

    this.host.scheduleLayoutSync();
  }

  private syncStateWithCurrentContext(): void {
    const catalogItems = this.host.getCatalogItems();
    if (this.query === null || !catalogItems) {
      return;
    }

    this.visibleItems = this.filterItems(catalogItems, this.query);
    this.selectedIndex = Math.min(
      this.selectedIndex,
      Math.max(0, this.visibleItems.length - 1),
    );
    this.status = this.visibleItems.length > 0
      ? 'idle'
      : this.getEmptyStatus(catalogItems);
  }

  private filterItems(
    items: SlashCommandMenuItem[],
    query: string,
  ): SlashCommandMenuItem[] {
    return filterSlashCommandMenuItems(items, query, {
      skillMode: this.host.getSkillMode(),
      skillsCommandDescription: t('slashCommand.skillsCommand.description'),
    });
  }

  private getEmptyStatus(items: SlashCommandMenuItem[]): SlashCommandMenuStatus {
    return items.length === 0 ? 'emptyCatalog' : 'noMatches';
  }
}
