import { setIcon } from 'obsidian';

import type { SlashCommandCatalogEntry, SlashCommandCatalogSource } from '../../core/config/slashCommandCatalog';
import { t } from '../../i18n';
import { enhanceSearchInput } from './searchInputEnhancer';

type CatalogFilterTab = 'all' | 'skill' | 'command' | 'enabled' | 'disabled';

function fuzzyMatch(text: string, query: string): boolean {
  const lt = text.toLowerCase();
  const lq = query.toLowerCase();
  if (lt.includes(lq)) return true;
  let qi = 0;
  for (let ti = 0; ti < lt.length && qi < lq.length; ti++) {
    if (lt[ti] === lq[qi]) qi++;
  }
  return qi === lq.length;
}

function getSourceChipLabel(source: SlashCommandCatalogSource): string {
  switch (source) {
    case 'command': return t('settings.commands.catalog.chip.command');
    case 'skill': return t('settings.commands.catalog.chip.skill');
    case 'project': return t('settings.commands.catalog.chip.project');
    case 'md-command': return t('settings.commands.catalog.chip.md-command');
  }
}

interface CatalogRenderCallbacks {
  getDisplayId: (c: SlashCommandCatalogEntry) => string;
  updateVisibility: (id: string, visible: boolean) => Promise<void>;
  refreshCatalog: () => void;
  refreshCatalogPreservingSearch: () => void;
}

export class SlashCommandCatalogRenderer {
  private filter: CatalogFilterTab = 'all';
  private searchQuery = '';
  private selectedIds = new Set<string>();
  private expandedIds = new Set<string>();

  // Cached DOM references for local re-rendering without losing search focus
  private batchBarEl: HTMLElement | null = null;
  private scrollEl: HTMLElement | null = null;
  private pillsEl: HTMLElement | null = null;
  private lastCommands: SlashCommandCatalogEntry[] = [];
  private lastCallbacks: CatalogRenderCallbacks | null = null;

  render(
    catalogBodyEl: HTMLElement,
    mergedCommands: SlashCommandCatalogEntry[],
    callbacks: CatalogRenderCallbacks,
  ): void {
    this.lastCommands = mergedCommands;
    this.lastCallbacks = callbacks;

    // Prune stale selections — commands that no longer exist in the merged list
    if (this.selectedIds.size > 0) {
      const currentIds = new Set(mergedCommands.map((c) => c.id));
      for (const id of this.selectedIds) {
        if (!currentIds.has(id)) {
          this.selectedIds.delete(id);
        }
      }
    }

    // Preserve scroll before replacing the entire catalog body
    const existingScrollEl = catalogBodyEl.querySelector<HTMLElement>('.opencodian-cmd-catalog-scroll');
    const previousScrollTop = existingScrollEl?.scrollTop ?? 0;

    catalogBodyEl.replaceChildren();

    const controlsEl = catalogBodyEl.createDiv({ cls: 'opencodian-cmd-catalog-controls' });
    this.renderSearch(controlsEl, callbacks);
    this.pillsEl = controlsEl.createDiv({ cls: 'opencodian-cmd-catalog-filter-pills' });
    this.renderPills(this.pillsEl, callbacks);

    this.batchBarEl = null;
    this.scrollEl = catalogBodyEl.createDiv({ cls: 'opencodian-cmd-catalog-scroll' });

    this.rerenderGrid(callbacks);

    // Restore scroll after full render
    if (previousScrollTop > 0 && this.scrollEl) {
      window.requestAnimationFrame(() => {
        if (this.scrollEl?.isConnected) {
          this.scrollEl.scrollTop = previousScrollTop;
        }
      });
    }
  }

  /** Re-render only the batch bar + card grid, preserving search input and filter pills. */
  private rerenderGrid(callbacks: CatalogRenderCallbacks): void {
    const { getDisplayId } = callbacks;
    // Preserve scroll position
    const previousScrollTop = this.scrollEl?.scrollTop ?? 0;

    // Batch bar
    if (this.selectedIds.size > 0) {
      if (!this.batchBarEl || !this.batchBarEl.isConnected) {
        this.batchBarEl = document.createElement('div');
        this.batchBarEl.className = 'opencodian-cmd-catalog-batch-bar';
        this.scrollEl?.parentElement?.insertBefore(this.batchBarEl, this.scrollEl);
      }
      this.batchBarEl.replaceChildren();
      this.renderBatchBar(this.batchBarEl, this.lastCommands, callbacks);
    } else {
      this.batchBarEl?.remove();
      this.batchBarEl = null;
    }
    // Card grid
    this.scrollEl?.replaceChildren();
    const filtered = this.applyFilters(this.lastCommands, getDisplayId);
    if (filtered.length === 0) {
      this.scrollEl?.createDiv({
        cls: 'opencodian-cmd-catalog-empty',
        text: this.lastCommands.length === 0
          ? t('settings.commands.catalog.empty')
          : t('settings.commands.catalog.noResults'),
      });
    } else {
      const gridEl = this.scrollEl!.createDiv({ cls: 'opencodian-cmd-catalog-grid' });
      for (const cmd of filtered) {
        this.renderCard(gridEl, cmd, callbacks);
      }
    }

    // Restore scroll position
    if (previousScrollTop > 0 && this.scrollEl) {
      window.requestAnimationFrame(() => {
        if (this.scrollEl?.isConnected) {
          this.scrollEl.scrollTop = previousScrollTop;
        }
      });
    }
  }

  /** Update active class on filter pills after a local filter change. */
  private updatePillActiveState(): void {
    if (!this.pillsEl) return;
    const pills = this.pillsEl.querySelectorAll<HTMLButtonElement>('.opencodian-cmd-catalog-filter-pill');
    pills.forEach((pill) => {
      const tabId = pill.dataset.filterTab as CatalogFilterTab;
      pill.classList.toggle('is-active', tabId === this.filter);
    });
  }

  private renderSearch(controlsEl: HTMLElement, callbacks: CatalogRenderCallbacks): void {
    const wrap = controlsEl.createDiv({ cls: 'opencodian-cmd-catalog-search' });
    const container = wrap.createDiv({ cls: 'opencodian-cmd-catalog-search-container' });
    const icon = container.createSpan({ cls: 'opencodian-cmd-catalog-search-icon' });
    setIcon(icon, 'search');
    const input = container.createEl('input', {
      cls: 'opencodian-cmd-catalog-search-input',
      attr: { type: 'text', placeholder: t('settings.commands.catalog.searchPlaceholder') },
    });
    input.value = this.searchQuery;
    enhanceSearchInput({ historyKey: 'command-catalog', inputEl: input, containerEl: container });
    // Local re-render: only update the grid, don't destroy the search input
    input.addEventListener('input', () => {
      this.searchQuery = input.value;
      this.rerenderGrid(callbacks);
    });
  }

  private renderPills(pillsEl: HTMLElement, callbacks: CatalogRenderCallbacks): void {
    const tabs: Array<{ id: CatalogFilterTab; label: string }> = [
      { id: 'all', label: t('settings.commands.catalog.filterAll') },
      { id: 'skill', label: t('settings.commands.catalog.filterSkills') },
      { id: 'command', label: t('settings.commands.catalog.filterCommands') },
      { id: 'enabled', label: t('settings.commands.catalog.filterEnabled') },
      { id: 'disabled', label: t('settings.commands.catalog.filterDisabled') },
    ];
    for (const tab of tabs) {
      const pill = pillsEl.createEl('button', {
        cls: `opencodian-cmd-catalog-filter-pill${tab.id === this.filter ? ' is-active' : ''}`,
        attr: { type: 'button', 'data-filter-tab': tab.id },
        text: tab.label,
      });
      pill.addEventListener('click', () => {
        this.filter = tab.id;
        this.updatePillActiveState();
        this.rerenderGrid(callbacks);
      });
    }
  }

  private renderBatchBar(
    barEl: HTMLElement,
    commands: SlashCommandCatalogEntry[],
    callbacks: CatalogRenderCallbacks,
  ): void {
    barEl.createSpan({
      cls: 'opencodian-cmd-catalog-batch-count',
      text: t('settings.commands.catalog.selectedCount', { count: String(this.selectedIds.size) }),
    });
    const makeBtn = (label: string, visible: boolean) => {
      const btn = barEl.createEl('button', {
        cls: 'opencodian-cmd-catalog-batch-btn',
        attr: { type: 'button' },
        text: label,
      });
      btn.addEventListener('click', async () => {
        for (const id of this.selectedIds) await callbacks.updateVisibility(id, visible);
        this.selectedIds.clear();
        callbacks.refreshCatalog();
      });
    };
    makeBtn(t('settings.commands.catalog.batchEnable'), true);
    makeBtn(t('settings.commands.catalog.batchDisable'), false);
  }

  private renderCard(
    gridEl: HTMLElement,
    cmd: SlashCommandCatalogEntry,
    callbacks: CatalogRenderCallbacks,
  ): void {
    const { getDisplayId, updateVisibility, refreshCatalogPreservingSearch } = callbacks;
    const expanded = this.expandedIds.has(cmd.id);
    const card = gridEl.createDiv({
      cls: `opencodian-cmd-catalog-card${cmd.hidden ? ' is-hidden' : ''}${expanded ? ' is-expanded' : ''}`,
    });
    const header = card.createDiv({ cls: 'opencodian-cmd-catalog-card-header' });
    const left = header.createDiv({ cls: 'opencodian-cmd-catalog-card-left' });
    const displayId = getDisplayId(cmd);
    const commandLabel = `/${displayId}`;
    const selectCb = left.createEl('input', {
      cls: 'opencodian-cmd-catalog-select-checkbox',
      attr: {
        type: 'checkbox',
        'aria-label': t('settings.commands.catalog.selection.toggle', { command: commandLabel }),
      },
    });
    selectCb.checked = this.selectedIds.has(cmd.id);
    selectCb.addEventListener('click', (e) => e.stopPropagation());
    selectCb.addEventListener('change', () => {
      if (selectCb.checked) this.selectedIds.add(cmd.id); else this.selectedIds.delete(cmd.id);
      if (this.lastCallbacks) this.rerenderGrid(this.lastCallbacks);
    });
    const name = left.createDiv({
      cls: 'opencodian-cmd-catalog-card-name',
      text: commandLabel,
    });
    name.createSpan({
      cls: `opencodian-cmd-catalog-chip opencodian-cmd-catalog-chip-source-${cmd.source}`,
      text: getSourceChipLabel(cmd.source),
    });
    if (cmd.isBuiltin) {
      name.createSpan({
        cls: 'opencodian-cmd-catalog-chip opencodian-cmd-catalog-chip-builtin',
        text: t('settings.commands.catalog.chip.builtin'),
      });
    }
    if (cmd.subtask) {
      left.createSpan({
        cls: 'opencodian-cmd-catalog-chip opencodian-cmd-catalog-chip-subtask',
        text: t('settings.commands.catalog.chip.subtask'),
      });
    }
    if (!cmd.runtimeAvailable) {
      left.createSpan({
        cls: 'opencodian-cmd-catalog-chip opencodian-cmd-catalog-chip-unavailable',
        text: t('settings.commands.catalog.chip.unavailable'),
      });
    }
    // Agent and model chips
    if (cmd.agent) {
      left.createSpan({
        cls: 'opencodian-cmd-catalog-chip opencodian-cmd-catalog-chip-agent',
        text: t('settings.commands.catalog.agent', { agent: cmd.agent }),
      });
    }
    if (cmd.model) {
      left.createSpan({
        cls: 'opencodian-cmd-catalog-chip opencodian-cmd-catalog-chip-model',
        text: t('settings.commands.catalog.model', { model: cmd.model }),
      });
    }
    const toggleWrap = header.createEl('label', {
      cls: 'checkbox-container opencodian-cmd-catalog-card-toggle',
    });
    const toggle = toggleWrap.createEl('input', {
      attr: {
        type: 'checkbox',
        class: 'opencodian-cmd-catalog-toggle-checkbox',
        role: 'switch',
      },
    });
    const syncToggleLabel = () => {
      const stateLabel = toggle.checked
        ? t('settings.commands.catalog.visibility.visible')
        : t('settings.commands.catalog.visibility.hidden');
      toggle.setAttribute('aria-checked', String(toggle.checked));
      toggle.setAttribute('aria-label', t('settings.commands.catalog.visibility.toggle', {
        command: commandLabel,
        state: stateLabel,
      }));
      toggleWrap.classList.toggle('is-enabled', toggle.checked);
      toggleWrap.setAttribute('title', stateLabel);
    };
    toggle.checked = !cmd.hidden;
    syncToggleLabel();
    toggle.addEventListener('click', (e) => e.stopPropagation());
    toggleWrap.addEventListener('click', (e) => e.stopPropagation());
    toggle.addEventListener('change', async () => {
      syncToggleLabel();
      await updateVisibility(cmd.id, toggle.checked);
      refreshCatalogPreservingSearch();
    });
    if (cmd.description) {
      const desc = card.createDiv({
        cls: `opencodian-cmd-catalog-card-desc${expanded ? ' is-expanded' : ''}`,
        text: cmd.description,
      });
      desc.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleExpand(cmd.id, callbacks);
      });
    }
    card.addEventListener('click', () => this.toggleExpand(cmd.id, callbacks));
  }

  private toggleExpand(id: string, callbacks: CatalogRenderCallbacks): void {
    if (this.expandedIds.has(id)) this.expandedIds.delete(id); else this.expandedIds.add(id);
    if (this.lastCallbacks) this.rerenderGrid(callbacks);
  }

  private applyFilters(
    commands: SlashCommandCatalogEntry[],
    getDisplayId: (c: SlashCommandCatalogEntry) => string,
  ): SlashCommandCatalogEntry[] {
    let filtered = commands;
    if (this.filter === 'skill') filtered = filtered.filter((c) => c.source === 'skill');
    else if (this.filter === 'command') filtered = filtered.filter((c) => c.source === 'command' || c.source === 'md-command');
    else if (this.filter === 'enabled') filtered = filtered.filter((c) => !c.hidden);
    else if (this.filter === 'disabled') filtered = filtered.filter((c) => c.hidden);
    const q = this.searchQuery.trim();
    if (q) {
      filtered = filtered.filter((c) =>
        fuzzyMatch(c.id, q) || fuzzyMatch(c.description, q) || fuzzyMatch(getDisplayId(c), q));
    }
    return filtered;
  }
}
