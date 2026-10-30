import type { TabBarItem, TabBarLayoutMode } from '../../../../../src/features/chat/tabs';
import { TabBar } from '../../../../../src/features/chat/tabs';
import { t } from '../../../../../src/i18n';
import { TooltipLayerController } from '../../../../../src/shared/TooltipLayerController';

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

afterEach(() => {
  TooltipLayerController.ensureForDocument(document).destroy();
  document.body.innerHTML = '';
});

describe('TabBar creation and interaction', () => {
  it.each(['header', 'input', 'below-header-grid', 'below-header-vertical'] as const)(
    'keeps a single create button inside the %s bar, including the empty state', async (layout) => {
      const onNewTab = jest.fn().mockResolvedValue(undefined);
      const container = renderTabBar([], layout, { onNewTab });
      const button = container.querySelector<HTMLButtonElement>('.opencodian-tab-bar-new');
      expect(button).not.toBeNull();
      expect(button?.disabled).toBe(false);
      button?.click();
      await Promise.resolve();
      expect(onNewTab).toHaveBeenCalledTimes(1);
    },
  );

  it('disables creation while pending and at the tab limit, then recovers', async () => {
    let finish!: () => void;
    let canCreate = true;
    const onNewTab = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const container = document.createElement('div');
    const bar = new TabBar(container, { onTabClick: jest.fn(), onTabClose: jest.fn(), onNewTab, canCreateTab: () => canCreate });
    bar.render(createItems(2), 'header');
    container.querySelector<HTMLButtonElement>('.opencodian-tab-bar-new')!.click();
    container.querySelector<HTMLButtonElement>('.opencodian-tab-bar-new')!.click();
    expect(onNewTab).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLButtonElement>('.opencodian-tab-bar-new')!.disabled).toBe(true);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    canCreate = false;
    bar.render(createItems(2), 'header');
    expect(container.querySelector<HTMLButtonElement>('.opencodian-tab-bar-new')!.disabled).toBe(true);
    canCreate = true;
    bar.render(createItems(1), 'header');
    expect(container.querySelector<HTMLButtonElement>('.opencodian-tab-bar-new')!.disabled).toBe(false);
    bar.destroy();
  });

  it('fits a narrow bar without hiding the active tab, overflow, or create action', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 104 });
    Object.defineProperty(container, 'scrollWidth', { get: () => container.querySelectorAll('.opencodian-tab-bar-item').length * 26 + 60 });
    const bar = new TabBar(container, { onTabClick: jest.fn(), onTabClose: jest.fn(), onNewTab: jest.fn() });
    bar.render(createItems(12, 11), 'header');
    expect(container.querySelectorAll('.opencodian-tab-bar-item')).toHaveLength(1);
    expect(container.querySelector('.is-active .opencodian-tab-bar-badge')?.textContent).toBe('12');
    expect(container.querySelector('.opencodian-tab-bar-overflow')?.textContent).toContain('+11');
    expect(container.lastElementChild?.classList.contains('opencodian-tab-bar-new')).toBe(true);
    bar.destroy();
  });

  it('falls back to compact parent navigation when a child title cannot fit', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 150 });
    Object.defineProperty(container, 'scrollWidth', { get: () => container.classList.contains('is-compact') ? 132 : 420 });
    const items = createItems(7, 6);
    items[6].parentTabId = items[0].id;
    const bar = new TabBar(container, { onTabClick: jest.fn(), onTabClose: jest.fn(), onNewTab: jest.fn() });
    bar.render(items, 'input');
    expect(container.classList.contains('is-compact')).toBe(true);
    expect(container.querySelector('[data-tab-id="tab-7"]')).not.toBeNull();
    expect(container.querySelector('.opencodian-tab-bar-parent-breadcrumb')).not.toBeNull();
    expect(container.querySelector('.opencodian-tab-bar-new')).not.toBeNull();
    bar.destroy();
  });

  it('keeps the overflow menu and its focus while stream status refreshes', () => {
    const container = document.body.createDiv();
    const bar = new TabBar(container, { onTabClick: jest.fn(), onTabClose: jest.fn() });
    const items = createItems(9);
    bar.render(items, 'header');
    container.querySelector<HTMLButtonElement>('.opencodian-tab-bar-overflow')!.click();
    const buttons = document.querySelectorAll<HTMLButtonElement>('.opencodian-tab-overflow-menu-item');
    buttons[2].focus();
    const focusedId = buttons[2].dataset.tabId;
    items[1].isStreaming = true;
    bar.render(items, 'header');
    expect(document.querySelector('.opencodian-tab-overflow-menu')).not.toBeNull();
    expect((document.activeElement as HTMLElement).dataset.tabId).toBe(focusedId);
    expect(container.querySelector('.opencodian-tab-bar-overflow')?.getAttribute('aria-expanded')).toBe('true');
    bar.destroy();
    expect(document.querySelector('.opencodian-tab-overflow-menu')).toBeNull();
  });

  it('preserves keyboard focus across status rerenders and supports Delete and middle-click closing', () => {
    const onTabClose = jest.fn();
    const container = document.body.createDiv();
    const items = createItems(3);
    const bar = new TabBar(container, { onTabClick: jest.fn(), onTabClose });
    bar.render(items, 'header');
    (container.querySelectorAll('.opencodian-tab-bar-item')[1] as HTMLElement).focus();
    items[1].isStreaming = true;
    bar.render(items, 'header');
    expect(document.activeElement?.getAttribute('data-tab-id')).toBe('tab-2');
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(onTabClose).toHaveBeenCalledWith('tab-2');
    container.querySelector('.opencodian-tab-bar-item')!.dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true }));
    expect(onTabClose).toHaveBeenCalledWith('tab-1');
    bar.destroy();
  });

});

describe('TabBar rendering', () => {
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

  it('shows tab tooltips through the shared body-level overlay in non-vertical layouts', () => {
    const containerEl = renderTabBar(createItems(1, 0), 'input');
    document.body.appendChild(containerEl);
    const tabEl = containerEl.querySelector<HTMLButtonElement>('.opencodian-tab-bar-item');

    Object.defineProperty(tabEl as HTMLButtonElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 120,
        top: 72,
        right: 260,
        bottom: 104,
        width: 140,
        height: 32,
        x: 120,
        y: 72,
        toJSON: () => '',
      }),
    });

    tabEl?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const overlay = document.body.querySelector<HTMLElement>('.opencodian-tooltip-layer');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('Tab 1');
    expect(containerEl.contains(overlay)).toBe(false);
  });
});
