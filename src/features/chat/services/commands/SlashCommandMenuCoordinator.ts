import type { SlashCommandMenuItem } from '../../../../core/config/slashCommandCatalog';
import type { SlashCommandSkillMode } from '../../../../core/types';
import { t } from '../../../../i18n';
import {
  getCodexSkillMenuQuery,
  getSlashCommandMenuQuery,
  replaceSlashTokenAtCursor,
  type SlashCommandMenuQuery,
} from '../composer/composerInputParsing';
import { filterSlashCommandMenuItems } from './slashCommandMenuFilter';
import {
  getSlashCommandMenuGroup,
  renderSlashCommandMenu,
  type SlashCommandMenuGroup,
  type SlashCommandMenuStatus,
} from './slashCommandMenuRenderer';

export interface SlashCommandMenuCoordinatorHost {
  getTextarea(): HTMLTextAreaElement | null;
  getMenuElement(): HTMLElement | null;
  getCatalogItems(): SlashCommandMenuItem[] | null;
  setCatalogItems(items: SlashCommandMenuItem[] | null): void;
  loadItems(): Promise<SlashCommandMenuItem[]>;
  getSkillMode(): SlashCommandSkillMode;
  /**
   * Optional: returns true when the Codex backend is active, so the filter
   * routes `codex-skill` items through the `/skills` browser and inserts the
   * raw `$skill-name ` text. Runtime-only — never persists or alters
   * `slashCommandSkillMode`.
   */
  isCodexSkillMode?(): boolean;
  /**
   * Invoked when the user selects the `/skills` capability entry (or `$`)
   * under the Codex backend but there are no runtime skills to show. The host
   * shows an actionable notice (reason + a link into Codex resource
   * management settings). Prevents a blank empty menu.
   */
  onCodexSkillsEmpty?(): void;
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
  private query: (SlashCommandMenuQuery & { trigger?: '/' | '$' }) | null = null;
  private readonly collapsedGroups = new Set<SlashCommandMenuGroup>();

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

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveSelection(event.key === 'ArrowDown' ? 1 : -1);
      return true;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.clear();
      return true;
    }

    if (event.key === 'Tab' && event.shiftKey) return false;
    if (event.key === 'Tab' && this.selectedIndex < 0) {
      event.preventDefault();
      this.host.getMenuElement()?.querySelector<HTMLButtonElement>('button[data-group]')?.focus();
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

    // When the Codex backend is active, also honor the `$skill-name` trigger
    // so users can filter/select the same runtime skills by typing `$`.
    const skillQuery = getCodexSkillMenuQuery(textarea);
    const slashQuery = getSlashCommandMenuQuery(textarea);
    const query = skillQuery
      ? { ...skillQuery, trigger: '$' as const }
      : slashQuery ? { ...slashQuery, trigger: '/' as const } : null;
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
      const items = await this.host.loadItems();
      if (currentRunId !== this.runId) {
        return;
      }

      this.host.setCatalogItems(items);
      this.visibleItems = this.filterItems(items, query);
      if (query.trigger !== '$' && query.query.trim()) {
        for (const item of this.visibleItems) this.collapsedGroups.delete(getSlashCommandMenuGroup(item));
      }
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
    const indexes = this.selectableIndexes();
    if (!indexes.length) return;
    this.selectedIndex = indexes[(indexes.indexOf(this.selectedIndex) + delta + indexes.length) % indexes.length];
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
      // Codex: selecting `/skills` with zero runtime skills must not leave a
      // blank menu — surface an actionable empty state instead.
      if (this.host.isCodexSkillMode?.()) {
        const catalog = this.host.getCatalogItems() ?? [];
        const hasCodexSkills = catalog.some((entry) => entry.source === 'codex-skill');
        if (!hasCodexSkills) {
          this.host.onCodexSkillsEmpty?.();
          this.clear();
          return;
        }
      }
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
      isMidText: this.query?.isMidText,
      grouped: this.query?.trigger !== '$',
      collapsedGroups: this.collapsedGroups,
      onToggleGroup: (group) => {
        const restoreFocus = menuEl.contains(document.activeElement);
        if (this.collapsedGroups.has(group)) this.collapsedGroups.delete(group);
        else this.collapsedGroups.add(group);
        this.render();
        if (restoreFocus) menuEl.querySelector<HTMLButtonElement>(`button[data-group="${group}"]`)?.focus();
      },
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
    // A refresh owns the next catalog. Re-filtering the previous backend's
    // items here would replace loading with a selectable stale menu.
    if (this.status === 'loading') return;
    const catalogItems = this.host.getCatalogItems();
    if (this.query === null || !catalogItems) {
      return;
    }

    this.visibleItems = this.filterItems(catalogItems, this.query);
    const indexes = this.selectableIndexes();
    if (!indexes.includes(this.selectedIndex)) this.selectedIndex = indexes.find((index) => index >= this.selectedIndex) ?? indexes[0] ?? -1;
    this.status = this.visibleItems.length > 0
      ? 'idle'
      : this.getEmptyStatus(catalogItems);
  }

  private filterItems(
    items: SlashCommandMenuItem[],
    query: SlashCommandMenuQuery & { trigger?: '/' | '$' },
  ): SlashCommandMenuItem[] {
    const filtered = filterSlashCommandMenuItems(items, query.query, {
      skillMode: this.host.getSkillMode(),
      trigger: query.trigger,
      skillsCommandDescription: t('slashCommand.skillsCommand.description'),
      isMidText: query.isMidText,
      ...(this.host.isCodexSkillMode?.() ? { codexSkillMode: true } : {}),
    });
    return query.trigger === '$' ? filtered : filtered.sort((left, right) =>
      Number(getSlashCommandMenuGroup(left) === 'skills') - Number(getSlashCommandMenuGroup(right) === 'skills'));
  }

  private selectableIndexes(): number[] {
    return this.visibleItems.flatMap((item, index) =>
      this.query?.trigger !== '$' && this.collapsedGroups.has(getSlashCommandMenuGroup(item)) ? [] : [index]);
  }

  private getEmptyStatus(items: SlashCommandMenuItem[]): SlashCommandMenuStatus {
    return items.length === 0 ? 'emptyCatalog' : 'noMatches';
  }
}
