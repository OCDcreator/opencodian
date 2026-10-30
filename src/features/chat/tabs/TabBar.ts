import { setIcon } from 'obsidian';

import { t } from '../../../i18n';
import { TooltipLayerController } from '../../../shared/TooltipLayerController';
import type { TabBarItem, TabBarLayoutMode, TabId } from './types';

export interface TabBarCallbacks {
  onTabClick: (tabId: TabId) => void;
  onTabClose: (tabId: TabId) => void;
  onNewTab?: () => void | Promise<void>;
  canCreateTab?: () => boolean;
  getMaxTabs?: () => number;
}

const HEADER_MAX_VISIBLE_TABS = 4;
const INPUT_MAX_VISIBLE_TABS = 5;
const VERTICAL_MAX_VISIBLE_TABS = 5;

export class TabBar {
  private static tooltipLabelId = 0;
  private overflowMenuEl: HTMLDivElement | null = null;
  private overflowMenuCleanup: (() => void) | null = null;
  private items: TabBarItem[] = [];
  private layout: TabBarLayoutMode | null = null;
  private isCreating = false;
  private resizeObserver: ResizeObserver | null = null;
  private observedParent: HTMLElement | null = null;
  private observedWidth = 0;

  constructor(
    private readonly containerEl: HTMLElement,
    private readonly callbacks: TabBarCallbacks,
  ) {
    this.containerEl.addClass('opencodian-tab-bar');
  }

  render(items: TabBarItem[], layout: TabBarLayoutMode): void {
    const focused = this.containerEl.ownerDocument.activeElement as HTMLElement | null;
    const reopenMenu = this.layout === layout && Boolean(this.overflowMenuEl);
    const menuFocusId = focused && this.overflowMenuEl?.contains(focused) ? focused.dataset.tabId : null;
    const focusKey = focused && this.containerEl.contains(focused)
      ? focused.dataset.tabId ?? focused.dataset.action : menuFocusId;
    this.items = items;
    this.layout = layout;
    this.closeOverflowMenu();
    this.containerEl.removeClass('is-compact');
    this.containerEl.setAttribute('data-layout', layout);
    this.containerEl.setAttribute('role', 'group');
    if (layout !== 'below-header-vertical') {
      TooltipLayerController.ensureForElement(this.containerEl);
    }

    let limit = this.getMaxVisibleTabs(layout);
    do {
      this.containerEl.empty();
      const { visibleItems, overflowItems } = this.partitionItems(items, layout, limit);
      this.renderParentBreadcrumb(items, layout);
      for (const item of visibleItems) this.renderTabItem(item, layout);
      if (overflowItems.length > 0) this.renderOverflowButton(overflowItems, layout);
      this.renderNewButton(layout);
      if (layout === 'below-header-vertical' || !this.containerEl.clientWidth
        || this.containerEl.scrollWidth <= this.containerEl.clientWidth + 1 || limit <= 1) break;
      limit -= 1;
    } while (limit > 0);
    this.containerEl.toggleClass('is-compact', layout !== 'below-header-vertical'
      && this.containerEl.clientWidth > 0 && this.containerEl.scrollWidth > this.containerEl.clientWidth + 1);
    this.restoreInteractionState(focusKey, menuFocusId, reopenMenu);
    this.observeAvailableWidth();
  }

  renderParentNavigation(items: TabBarItem[], layout: TabBarLayoutMode): void {
    this.layout = null;
    this.resizeObserver?.disconnect();
    this.observedParent = null;
    this.containerEl.removeClass('is-compact');
    this.closeOverflowMenu();
    this.containerEl.empty();
    this.containerEl.setAttribute('data-layout', layout);
    if (layout !== 'below-header-vertical') {
      TooltipLayerController.ensureForElement(this.containerEl);
    }
    this.renderParentBreadcrumb(items, layout);
  }

  destroy(): void {
    this.layout = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.observedParent = null;
    this.closeOverflowMenu();
    this.containerEl.empty();
    this.containerEl.removeClass('opencodian-tab-bar');
  }

  private partitionItems(items: TabBarItem[], layout: TabBarLayoutMode, limit = this.getMaxVisibleTabs(layout)): {
    visibleItems: TabBarItem[];
    overflowItems: TabBarItem[];
  } {
    const maxVisibleTabs = limit;

    if (items.length <= maxVisibleTabs) {
      return {
        visibleItems: items,
        overflowItems: [],
      };
    }

    const activeIndex = items.findIndex((item) => item.isActive);
    if (activeIndex === -1 || activeIndex < maxVisibleTabs) {
      return {
        visibleItems: items.slice(0, maxVisibleTabs),
        overflowItems: items.slice(maxVisibleTabs),
      };
    }

    const visibleItems = [...items.slice(0, maxVisibleTabs - 1), items[activeIndex]];
    const overflowItems = items.filter((item, index) => index >= maxVisibleTabs - 1 && index !== activeIndex);

    return {
      visibleItems,
      overflowItems,
    };
  }

  private getMaxVisibleTabs(layout: TabBarLayoutMode): number {
    switch (layout) {
      case 'header':
        return HEADER_MAX_VISIBLE_TABS;
      case 'below-header-grid':
      case 'below-header-vertical':
        return VERTICAL_MAX_VISIBLE_TABS;
      case 'input':
      default:
        return INPUT_MAX_VISIBLE_TABS;
    }
  }

  private renderParentBreadcrumb(items: TabBarItem[], layout: TabBarLayoutMode): void {
    const activeItem = items.find((item) => item.isActive);
    const parentItem = activeItem?.parentTabId
      ? items.find((item) => item.id === activeItem.parentTabId)
      : null;
    if (!activeItem?.parentTabId) {
      return;
    }

    if (parentItem) {
      this.renderParentBackButton(parentItem, layout);
    }

    if (activeItem.canClose) {
      this.renderParentCloseButton(activeItem, layout);
    }
  }

  private renderParentBackButton(parentItem: TabBarItem, layout: TabBarLayoutMode): void {
    const label = t('chat.tab.backToParent', { title: parentItem.title });
    const breadcrumbEl = this.createButton('opencodian-tab-bar-parent-breadcrumb', label, layout);

    const iconEl = breadcrumbEl.createSpan({ cls: 'opencodian-tab-bar-parent-breadcrumb-icon' });
    iconEl.setAttribute('aria-hidden', 'true');
    setIcon(iconEl, 'arrow-left');
    breadcrumbEl.createSpan({
      cls: 'opencodian-tab-bar-parent-breadcrumb-title',
      text: label,
    });

    breadcrumbEl.addEventListener('click', (event) => {
      event.preventDefault();
      this.callbacks.onTabClick(parentItem.id);
    });
  }

  private renderParentCloseButton(item: TabBarItem, layout: TabBarLayoutMode): void {
    const label = t('chat.tab.close');
    const closeEl = this.createButton('opencodian-tab-bar-parent-close', label, layout);

    const iconEl = closeEl.createSpan({ cls: 'opencodian-tab-bar-parent-close-icon' });
    iconEl.setAttribute('aria-hidden', 'true');
    setIcon(iconEl, 'x');

    closeEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.callbacks.onTabClose(item.id);
    });
  }

  private renderTabItem(item: TabBarItem, layout: TabBarLayoutMode): void {
    const tooltip = `${item.title}${item.canClose ? ` · ${t('chat.tab.closeHint')}` : ''}`;
    const tabEl = this.createButton('opencodian-tab-bar-item', tooltip, layout);
    tabEl.dataset.tabId = item.id;
    tabEl.setAttribute('aria-pressed', String(item.isActive));
    tabEl.addEventListener('keydown', (event) => this.onTabKeyDown(event, item, layout));

    if (item.isActive) {
      tabEl.addClass('is-active');
    }
    if (item.isStreaming) {
      tabEl.addClass('is-streaming');
    }
    if (item.hasBackgroundTask) {
      tabEl.addClass('has-background-task');
    }
    if (item.isStreaming && item.hasBackgroundTask) {
      tabEl.addClass('has-background-task-secondary');
    }
    if (item.needsAttention) {
      tabEl.addClass('needs-attention');
    }

    const badgeWrapEl = tabEl.createSpan({ cls: 'opencodian-tab-bar-badge-wrap' });
    badgeWrapEl.setAttribute('aria-hidden', 'true');

    const badgeEl = badgeWrapEl.createSpan({ cls: 'opencodian-tab-bar-badge', text: String(item.index) });
    badgeEl.setAttribute('aria-hidden', 'true');

    tabEl.createSpan({
      cls: 'opencodian-tab-bar-title opencodian-tab-bar-title--collapsible',
      text: item.title,
    });

    const stateEl = badgeWrapEl.createSpan({ cls: 'opencodian-tab-bar-state' });
    stateEl.setAttribute('aria-hidden', 'true');
    if (item.hasBackgroundTask) {
      this.renderBackgroundTaskState(stateEl);
    } else if (item.needsAttention) {
      setIcon(stateEl, 'bell-ring');
    }

    tabEl.addEventListener('click', () => {
      this.callbacks.onTabClick(item.id);
    });

    if (item.canClose) {
      tabEl.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this.callbacks.onTabClose(item.id);
      });
      tabEl.addEventListener('auxclick', (event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        this.callbacks.onTabClose(item.id);
      });
    }
  }

  private renderOverflowButton(items: TabBarItem[], layout: TabBarLayoutMode): void {
    const tooltip = t('chat.tab.moreMenu', { count: items.length });
    const overflowEl = this.createButton('opencodian-tab-bar-overflow', tooltip, layout);
    overflowEl.setAttribute('aria-haspopup', 'menu');
    overflowEl.createSpan({ text: t('chat.tab.more', { count: items.length }) });
    overflowEl.dataset.action = 'tab-overflow';
    overflowEl.setAttribute('aria-expanded', 'false');
    overflowEl.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault();
      this.openOverflowMenu(overflowEl, items);
    });

    overflowEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.overflowMenuEl) {
        this.closeOverflowMenu();
        return;
      }

      this.openOverflowMenu(overflowEl, items);
    });
  }

  private openOverflowMenu(anchorEl: HTMLElement, items: TabBarItem[]): void {
    this.closeOverflowMenu();

    const doc = anchorEl.ownerDocument;
    const menuEl = doc.createElement('div');
    menuEl.className = 'opencodian-tab-overflow-menu';
    menuEl.setAttribute('role', 'menu');
    anchorEl.setAttribute('aria-expanded', 'true');

    for (const item of items) {
      const itemEl = doc.createElement('button');
      itemEl.className = 'opencodian-tab-overflow-menu-item';
      itemEl.type = 'button';
      itemEl.setAttribute('role', 'menuitem');
      itemEl.dataset.tabId = item.id;
      itemEl.addEventListener('keydown', (event) => this.onTabKeyDown(event, item, this.layout ?? 'header'));
      if (item.canClose) itemEl.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this.closeOverflowMenu();
        this.callbacks.onTabClose(item.id);
      });
      if (item.isActive) {
        itemEl.classList.add('is-active');
      }
      if (item.hasBackgroundTask) {
        itemEl.classList.add('has-background-task');
      }
      if (item.isStreaming && item.hasBackgroundTask) {
        itemEl.classList.add('has-background-task-secondary');
      }
      if (item.needsAttention) {
        itemEl.classList.add('needs-attention');
      }

      const badgeEl = doc.createElement('span');
      badgeEl.className = 'opencodian-tab-overflow-menu-badge';
      badgeEl.textContent = String(item.index);
      badgeEl.setAttribute('aria-hidden', 'true');
      itemEl.appendChild(badgeEl);

      const titleEl = doc.createElement('span');
      titleEl.className = 'opencodian-tab-overflow-menu-title';
      titleEl.textContent = item.title;
      itemEl.appendChild(titleEl);

      const stateEl = doc.createElement('span');
      stateEl.className = 'opencodian-tab-overflow-menu-state';
      stateEl.setAttribute('aria-hidden', 'true');
      if (item.isStreaming) {
        setIcon(stateEl, 'loader-circle');
        stateEl.classList.add('is-streaming');
      } else if (item.hasBackgroundTask) {
        stateEl.classList.add('is-background-task');
        this.renderBackgroundTaskState(stateEl);
      } else if (item.needsAttention) {
        setIcon(stateEl, 'bell-ring');
      }
      itemEl.appendChild(stateEl);

      itemEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.closeOverflowMenu();
        this.callbacks.onTabClick(item.id);
      });

      menuEl.appendChild(itemEl);
    }

    doc.body.appendChild(menuEl);
    this.positionOverflowMenu(anchorEl, menuEl);

    const closeOnPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!target || !('nodeType' in target)) {
        return;
      }
      if (menuEl.contains(target as Node) || anchorEl.contains(target as Node)) {
        return;
      }
      this.closeOverflowMenu();
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeOverflowMenu();
        anchorEl.focus();
      }
      const buttons = Array.from(menuEl.querySelectorAll<HTMLButtonElement>('button'));
      const index = buttons.indexOf(doc.activeElement as HTMLButtonElement);
      const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length
        : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
      if (next >= 0) {
        event.preventDefault();
        buttons[next]?.focus();
      }
    };

    doc.addEventListener('mousedown', closeOnPointerDown, true);
    doc.addEventListener('keydown', closeOnEscape, true);
    const win = doc.defaultView;
    const closeOnLayoutChange = (event: Event) => {
      if (event.target && 'nodeType' in event.target && menuEl.contains(event.target as Node)) return;
      this.closeOverflowMenu();
    };
    win?.addEventListener('resize', closeOnLayoutChange);
    win?.addEventListener('scroll', closeOnLayoutChange, true);

    this.overflowMenuEl = menuEl;
    this.overflowMenuCleanup = () => {
      anchorEl.setAttribute('aria-expanded', 'false');
      win?.removeEventListener('resize', closeOnLayoutChange);
      win?.removeEventListener('scroll', closeOnLayoutChange, true);
      doc.removeEventListener('mousedown', closeOnPointerDown, true);
      doc.removeEventListener('keydown', closeOnEscape, true);
      menuEl.remove();
    };
    menuEl.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }

  private positionOverflowMenu(anchorEl: HTMLElement, menuEl: HTMLDivElement): void {
    const rect = anchorEl.getBoundingClientRect();
    const win = anchorEl.ownerDocument.defaultView ?? window;
    const viewportWidth = win.innerWidth;
    const viewportHeight = win.innerHeight;
    const margin = 12;
    const menuWidth = Math.min(Math.max(220, rect.width + 160), Math.max(0, viewportWidth - 2 * margin));
    const spacing = 8;
    const left = Math.min(
      Math.max(margin, rect.right - menuWidth),
      viewportWidth - menuWidth - margin,
    );

    menuEl.style.left = `${left}px`;
    menuEl.style.width = `${menuWidth}px`;

    const menuHeight = menuEl.offsetHeight;
    const preferAbove = this.shouldOpenOverflowAbove(anchorEl);
    const spaceAbove = rect.top - margin - spacing;
    const spaceBelow = viewportHeight - rect.bottom - margin - spacing;
    const openAbove = preferAbove
      ? (spaceAbove >= 120 || spaceAbove >= spaceBelow)
      : !(spaceBelow >= 120 || spaceBelow >= spaceAbove);

    const maxHeight = Math.max(0, openAbove ? spaceAbove : spaceBelow);
    const top = openAbove
      ? Math.max(margin, rect.top - Math.min(menuHeight, maxHeight) - spacing)
      : rect.bottom + spacing;

    menuEl.style.top = `${top}px`;
    menuEl.style.maxHeight = `${maxHeight}px`;
  }

  private shouldOpenOverflowAbove(anchorEl: HTMLElement): boolean {
    return Boolean(anchorEl.closest('.opencodian-tab-bar-slot--input'));
  }

  private closeOverflowMenu(): void {
    this.overflowMenuCleanup?.();
    this.overflowMenuCleanup = null;
    this.overflowMenuEl = null;
  }

  private restoreInteractionState(focusKey: string | null | undefined, menuFocusId: string | null | undefined, reopenMenu: boolean): void {
    if (focusKey) {
      const next = Array.from(this.containerEl.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => (button.dataset.tabId ?? button.dataset.action) === focusKey);
      (next ?? this.containerEl.querySelector<HTMLButtonElement>('.is-active'))?.focus({ preventScroll: true });
    }
    const anchor = this.containerEl.querySelector<HTMLButtonElement>('.opencodian-tab-bar-overflow');
    if (reopenMenu && anchor) {
      const visibleIds = new Set(Array.from(this.containerEl.querySelectorAll<HTMLElement>('[data-tab-id]')).map(el => el.dataset.tabId));
      this.openOverflowMenu(anchor, this.items.filter(item => !visibleIds.has(item.id)));
      if (menuFocusId) Array.from(this.overflowMenuEl?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        .find(button => button.dataset.tabId === menuFocusId)?.focus({ preventScroll: true });
    }
  }

  private renderNewButton(layout: TabBarLayoutMode): void {
    if (!this.callbacks.onNewTab) return;
    const allowed = this.callbacks.canCreateTab?.() ?? true;
    const label = allowed ? t('chat.tab.newTooltip')
      : t('chat.tab.maxReached', { count: String(this.callbacks.getMaxTabs?.() ?? this.items.length) });
    const button = this.createButton('opencodian-tab-bar-new', label, layout);
    button.dataset.action = 'new-tab';
    const icon = button.createSpan();
    icon.setAttribute('aria-hidden', 'true');
    setIcon(icon, 'plus');
    button.disabled = !allowed || this.isCreating;
    button.setAttribute('aria-busy', String(this.isCreating));
    button.addEventListener('click', async () => {
      if (this.isCreating || !(this.callbacks.canCreateTab?.() ?? true)) return;
      this.isCreating = true;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try { await this.callbacks.onNewTab?.(); }
      finally {
        this.isCreating = false;
        if (this.layout) this.render(this.items, this.layout);
      }
    });
  }

  private observeAvailableWidth(): void {
    const parent = this.containerEl.parentElement;
    const Observer = this.containerEl.ownerDocument.defaultView?.ResizeObserver;
    if (!parent || !Observer || this.observedParent === parent) return;
    this.resizeObserver?.disconnect();
    this.observedParent = parent;
    this.observedWidth = parent.clientWidth;
    this.resizeObserver = new Observer(() => {
      if (!this.layout || parent.clientWidth === this.observedWidth) return;
      this.observedWidth = parent.clientWidth;
      this.render(this.items, this.layout);
    });
    this.resizeObserver.observe(parent);
  }

  private onTabKeyDown(event: KeyboardEvent, item: TabBarItem, layout: TabBarLayoutMode): void {
    if (event.key === 'Delete' && item.canClose) {
      event.preventDefault();
      this.closeOverflowMenu();
      this.callbacks.onTabClose(item.id);
      return;
    }
    if (this.overflowMenuEl) return;
    const buttons = Array.from(this.containerEl.querySelectorAll<HTMLButtonElement>('.opencodian-tab-bar-item'));
    const index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
    const vertical = layout === 'below-header-vertical';
    const next = event.key === (vertical ? 'ArrowDown' : 'ArrowRight') ? (index + 1) % buttons.length
      : event.key === (vertical ? 'ArrowUp' : 'ArrowLeft') ? (index - 1 + buttons.length) % buttons.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); buttons[next]?.focus(); }
  }

  private renderBackgroundTaskState(containerEl: HTMLElement): void {
    containerEl.empty();
    containerEl.addClass('is-background-task');
    const dotsEl = containerEl.createSpan({ cls: 'opencodian-tab-activity-dots' });
    dotsEl.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index += 1) {
      dotsEl.createSpan({ cls: 'opencodian-tab-activity-dot' });
    }
  }

  private createButton(cls: string, label: string, layout: TabBarLayoutMode): HTMLButtonElement {
    const button = this.containerEl.createEl('button', { cls, attr: { type: 'button' } });
    if (layout !== 'below-header-vertical') {
      button.addClass('opencodian-tooltip-trigger');
      button.dataset.tooltip = label;
    }
    this.attachTooltipLabel(button, label);
    return button;
  }

  private attachTooltipLabel(element: HTMLElement, label: string): void {
    const labelId = `opencodian-tab-tooltip-label-${TabBar.tooltipLabelId++}`;
    const labelEl = element.createSpan({
      cls: 'opencodian-visually-hidden',
      text: label,
    });
    labelEl.id = labelId;
    element.setAttribute('aria-labelledby', labelId);
  }
}
