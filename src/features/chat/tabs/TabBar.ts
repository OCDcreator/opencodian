import { setIcon } from 'obsidian';

import { t } from '../../../i18n';
import type { TabBarItem, TabBarLayoutMode, TabId } from './types';

export interface TabBarCallbacks {
  onTabClick: (tabId: TabId) => void;
  onTabClose: (tabId: TabId) => void;
}

const HEADER_MAX_VISIBLE_TABS = 4;
const INPUT_MAX_VISIBLE_TABS = 5;
const VERTICAL_MAX_VISIBLE_TABS = 5;

export class TabBar {
  private static tooltipLabelId = 0;
  private overflowMenuEl: HTMLDivElement | null = null;
  private overflowMenuCleanup: (() => void) | null = null;

  constructor(
    private readonly containerEl: HTMLElement,
    private readonly callbacks: TabBarCallbacks,
  ) {
    this.containerEl.addClass('opencodian-tab-bar');
  }

  render(items: TabBarItem[], layout: TabBarLayoutMode): void {
    this.closeOverflowMenu();
    this.containerEl.empty();
    this.containerEl.setAttribute('data-layout', layout);

    const { visibleItems, overflowItems } = this.partitionItems(items, layout);
    this.renderParentBreadcrumb(items, layout);

    for (const item of visibleItems) {
      this.renderTabItem(item, layout);
    }

    if (overflowItems.length > 0) {
      this.renderOverflowButton(overflowItems, layout);
    }
  }

  destroy(): void {
    this.closeOverflowMenu();
    this.containerEl.empty();
    this.containerEl.removeClass('opencodian-tab-bar');
  }

  private partitionItems(items: TabBarItem[], layout: TabBarLayoutMode): {
    visibleItems: TabBarItem[];
    overflowItems: TabBarItem[];
  } {
    const maxVisibleTabs = this.getMaxVisibleTabs(layout);

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
    if (!parentItem) {
      return;
    }

    const label = t('chat.tab.backToParent', { title: parentItem.title });
    const useTooltip = layout !== 'below-header-vertical';
    const breadcrumbEl = this.containerEl.createEl('button', {
      cls: useTooltip
        ? 'opencodian-tab-bar-parent-breadcrumb opencodian-tooltip-trigger'
        : 'opencodian-tab-bar-parent-breadcrumb',
      attr: useTooltip
        ? {
            type: 'button',
            'data-tooltip': label,
          }
        : {
            type: 'button',
          },
    });
    this.attachTooltipLabel(breadcrumbEl, label);

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

  private renderTabItem(item: TabBarItem, layout: TabBarLayoutMode): void {
    const tooltip = `${item.title}${item.canClose ? ` · ${t('chat.tab.close')}` : ''}`;
    const useTooltip = layout !== 'below-header-vertical';
    const tabEl = this.containerEl.createEl('button', {
      cls: useTooltip
        ? 'opencodian-tab-bar-item opencodian-tooltip-trigger'
        : 'opencodian-tab-bar-item',
      attr: useTooltip
        ? {
            type: 'button',
            'data-tooltip': tooltip,
          }
        : {
            type: 'button',
          },
    });
    this.attachTooltipLabel(tabEl, tooltip);

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
    }
  }

  private renderOverflowButton(items: TabBarItem[], layout: TabBarLayoutMode): void {
    const tooltip = t('chat.tab.moreMenu', { count: items.length });
    const useTooltip = layout !== 'below-header-vertical';
    const overflowEl = this.containerEl.createEl('button', {
      cls: useTooltip
        ? 'opencodian-tab-bar-overflow opencodian-tooltip-trigger'
        : 'opencodian-tab-bar-overflow',
      text: t('chat.tab.more', { count: items.length }),
      attr: useTooltip
        ? {
            type: 'button',
            'aria-haspopup': 'menu',
            'data-tooltip': tooltip,
          }
        : {
            type: 'button',
            'aria-haspopup': 'menu',
          },
    });
    this.attachTooltipLabel(overflowEl, tooltip);

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

    for (const item of items) {
      const itemEl = doc.createElement('button');
      itemEl.className = 'opencodian-tab-overflow-menu-item';
      itemEl.type = 'button';
      itemEl.setAttribute('role', 'menuitem');
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
      if (!(target instanceof Node)) {
        return;
      }
      if (menuEl.contains(target) || anchorEl.contains(target)) {
        return;
      }
      this.closeOverflowMenu();
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.closeOverflowMenu();
        anchorEl.focus();
      }
    };

    doc.addEventListener('mousedown', closeOnPointerDown, true);
    doc.addEventListener('keydown', closeOnEscape, true);

    this.overflowMenuEl = menuEl;
    this.overflowMenuCleanup = () => {
      doc.removeEventListener('mousedown', closeOnPointerDown, true);
      doc.removeEventListener('keydown', closeOnEscape, true);
      menuEl.remove();
    };
  }

  private positionOverflowMenu(anchorEl: HTMLElement, menuEl: HTMLDivElement): void {
    const rect = anchorEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuWidth = Math.max(220, rect.width + 160);
    const margin = 12;
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

    const maxHeight = Math.max(120, openAbove ? spaceAbove : spaceBelow);
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

  private renderBackgroundTaskState(containerEl: HTMLElement): void {
    containerEl.empty();
    containerEl.addClass('is-background-task');
    const dotsEl = containerEl.createSpan({ cls: 'opencodian-tab-activity-dots' });
    dotsEl.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index += 1) {
      dotsEl.createSpan({ cls: 'opencodian-tab-activity-dot' });
    }
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
