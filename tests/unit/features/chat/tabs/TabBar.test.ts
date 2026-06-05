import type { TabBarItem, TabBarLayoutMode } from '../../../../../src/features/chat/tabs';
import { TabBar } from '../../../../../src/features/chat/tabs';
import { t } from '../../../../../src/i18n';

function createItems(count: number, activeIndex = 0): TabBarItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `tab-${index + 1}`,
    index: index + 1,
    title: `Tab ${index + 1}`,
    isActive: index === activeIndex,
    isStreaming: false,
    hasBackgroundTask: false,
    needsAttention: false,
    canClose: true,
  }));
}

function renderTabBar(
  items: TabBarItem[],
  layout: TabBarLayoutMode,
  callbacks?: Partial<ConstructorParameters<typeof TabBar>[1]>,
): HTMLElement {
  const containerEl = document.createElement('div');
  const tabBar = new TabBar(containerEl, {
    onTabClick: jest.fn(),
    onTabClose: jest.fn(),
    ...callbacks,
  });

  tabBar.render(items, layout);
  return containerEl;
}

describe('TabBar', () => {
  it('limits header layout to four visible tabs plus overflow', () => {
    const containerEl = renderTabBar(createItems(6, 5), 'header');

    const tabButtons = containerEl.querySelectorAll('.opencodian-tab-bar-item');
    const overflowButton = containerEl.querySelector('.opencodian-tab-bar-overflow');

    expect(containerEl.getAttribute('data-layout')).toBe('header');
    expect(tabButtons).toHaveLength(4);
    expect(overflowButton).not.toBeNull();
    expect(Array.from(tabButtons).some((button) => button.textContent?.includes('Tab 6'))).toBe(true);
  });

  it('limits the below-header grid layout to five visible tabs plus overflow', () => {
    const containerEl = renderTabBar(createItems(7, 6), 'below-header-grid');

    const tabButtons = containerEl.querySelectorAll('.opencodian-tab-bar-item');
    const overflowButton = containerEl.querySelector('.opencodian-tab-bar-overflow');

    expect(containerEl.getAttribute('data-layout')).toBe('below-header-grid');
    expect(tabButtons).toHaveLength(5);
    expect(overflowButton?.textContent).toContain('+2');
    expect(Array.from(tabButtons).some((button) => button.textContent?.includes('Tab 7'))).toBe(true);
  });

  it('limits the vertical below-header layout to five visible tabs plus overflow', () => {
    const containerEl = renderTabBar(createItems(7, 6), 'below-header-vertical');

    const tabButtons = containerEl.querySelectorAll('.opencodian-tab-bar-item');
    const overflowButton = containerEl.querySelector('.opencodian-tab-bar-overflow');

    expect(containerEl.getAttribute('data-layout')).toBe('below-header-vertical');
    expect(tabButtons).toHaveLength(5);
    expect(overflowButton?.textContent).toContain('+2');
    expect(Array.from(tabButtons).every((button) => !button.classList.contains('opencodian-tooltip-trigger'))).toBe(true);
    expect(Array.from(tabButtons).some((button) => button.textContent?.includes('Tab 7'))).toBe(true);
  });

  it('renders streaming state inside the badge wrap', () => {
    const items = createItems(1, 0);
    items[0].isStreaming = true;

    const containerEl = renderTabBar(items, 'input');
    const badgeWrap = containerEl.querySelector('.opencodian-tab-bar-badge-wrap');
    const stateEl = badgeWrap?.querySelector('.opencodian-tab-bar-state');

    expect(badgeWrap).not.toBeNull();
    expect(stateEl).not.toBeNull();
    expect(stateEl?.querySelector('svg')).toBeNull();
  });

  it('renders a dedicated background-task state inside the badge wrap', () => {
    const items = createItems(1, 0);
    items[0].hasBackgroundTask = true;

    const containerEl = renderTabBar(items, 'input');
    const tabEl = containerEl.querySelector('.opencodian-tab-bar-item');
    const stateEl = containerEl.querySelector('.opencodian-tab-bar-state.is-background-task');
    const dots = containerEl.querySelectorAll('.opencodian-tab-activity-dot');

    expect(tabEl?.classList.contains('has-background-task')).toBe(true);
    expect(stateEl).not.toBeNull();
    expect(dots).toHaveLength(3);
  });

  it('renders a back-to-parent breadcrumb for the active child tab', () => {
    const items = createItems(2, 1);
    items[0].title = 'Parent session';
    items[1].title = 'Child session';
    items[1].parentTabId = items[0].id;
    const onTabClick = jest.fn();

    const containerEl = renderTabBar(items, 'input', { onTabClick });
    const breadcrumbEl = containerEl.querySelector<HTMLButtonElement>('.opencodian-tab-bar-parent-breadcrumb');

    expect(breadcrumbEl).not.toBeNull();
    expect(breadcrumbEl?.textContent).toContain(t('chat.tab.backToParent', { title: 'Parent session' }));

    breadcrumbEl?.click();

    expect(onTabClick).toHaveBeenCalledWith(items[0].id);
  });

  it('renders only the parent breadcrumb for disabled tab UI', () => {
    const items = createItems(2, 1);
    items[0].title = 'Parent session';
    items[1].title = 'Child session';
    items[1].parentTabId = items[0].id;
    const onTabClick = jest.fn();
    const onTabClose = jest.fn();
    const containerEl = document.createElement('div');
    const tabBar = new TabBar(containerEl, {
      onTabClick,
      onTabClose,
    });

    tabBar.renderParentNavigation(items, 'below-header-grid');

    expect(containerEl.querySelector('.opencodian-tab-bar-parent-breadcrumb')).not.toBeNull();
    const closeEl = containerEl.querySelector<HTMLButtonElement>('.opencodian-tab-bar-parent-close');
    expect(closeEl).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-tab-bar-item')).toBeNull();
    expect(containerEl.querySelector('.opencodian-tab-bar-overflow')).toBeNull();
    expect(closeEl?.hasAttribute('aria-label')).toBe(false);
    const hiddenLabel = closeEl?.querySelector<HTMLElement>('.opencodian-visually-hidden');
    expect(hiddenLabel?.textContent).toBe(t('chat.tab.close'));
    expect(closeEl?.getAttribute('aria-labelledby')).toBe(hiddenLabel?.id);

    closeEl?.click();

    expect(onTabClose).toHaveBeenCalledWith(items[1].id);
  });

  it('renders a close-only affordance for an orphan active child tab', () => {
    const items = createItems(1, 0);
    items[0].title = 'Orphan child';
    items[0].parentTabId = 'missing-parent';
    items[0].canClose = true;
    const onTabClose = jest.fn();
    const containerEl = document.createElement('div');
    const tabBar = new TabBar(containerEl, {
      onTabClick: jest.fn(),
      onTabClose,
    });

    tabBar.renderParentNavigation(items, 'below-header-grid');

    expect(containerEl.querySelector('.opencodian-tab-bar-parent-breadcrumb')).toBeNull();
    const closeEl = containerEl.querySelector<HTMLButtonElement>('.opencodian-tab-bar-parent-close');
    expect(closeEl).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-tab-bar-item')).toBeNull();

    closeEl?.click();

    expect(onTabClose).toHaveBeenCalledWith(items[0].id);
  });
});
