import { TabBar } from '../../../../../src/features/chat/tabs';
import type { TabBarItem, TabBarLayoutMode } from '../../../../../src/features/chat/tabs';

function createItems(count: number, activeIndex = 0): TabBarItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `tab-${index + 1}`,
    index: index + 1,
    title: `Tab ${index + 1}`,
    isActive: index === activeIndex,
    isStreaming: false,
    needsAttention: false,
    canClose: true,
  }));
}

function renderTabBar(items: TabBarItem[], layout: TabBarLayoutMode): HTMLElement {
  const containerEl = document.createElement('div');
  const tabBar = new TabBar(containerEl, {
    onTabClick: jest.fn(),
    onTabClose: jest.fn(),
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
});
