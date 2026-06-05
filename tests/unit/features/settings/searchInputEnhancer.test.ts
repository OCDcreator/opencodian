import { enhanceSearchInput } from '../../../../src/features/settings/searchInputEnhancer';
import { SettingsPopoverController } from '../../../../src/features/settings/SettingsPopoverController';
import { setLocale } from '../../../../src/i18n';

function mockRect(element: HTMLElement, rect: Partial<DOMRect>): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: rect.left ?? 0,
      y: rect.top ?? 0,
      left: rect.left ?? 0,
      top: rect.top ?? 0,
      right: rect.right ?? ((rect.left ?? 0) + (rect.width ?? 0)),
      bottom: rect.bottom ?? ((rect.top ?? 0) + (rect.height ?? 0)),
      width: rect.width ?? 0,
      height: rect.height ?? 0,
      toJSON: () => '',
    }),
  });
}

describe('searchInputEnhancer', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 220 });
  });

  afterEach(() => {
    SettingsPopoverController.ensureForDocument(document).destroy();
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  it('renders the recent-history popover in document.body and removes it on destroy', () => {
    const containerEl = document.createElement('div');
    const inputEl = document.createElement('input');
    containerEl.appendChild(inputEl);
    document.body.appendChild(containerEl);

    window.localStorage.setItem(
      'opencodian:settings-search-history:test-history',
      JSON.stringify(['prettier', 'biome']),
    );

    const handle = enhanceSearchInput({
      historyKey: 'test-history',
      inputEl,
      containerEl,
    });

    inputEl.dispatchEvent(new FocusEvent('focus'));

    const popover = document.body.querySelector<HTMLElement>('.opencodian-settings-search-history-popover');
    expect(popover).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-settings-search-history-popover')).toBeNull();

    handle.destroy();
    expect(document.body.querySelector('.opencodian-settings-search-history-popover')).toBeNull();
  });

  it('auto-resolves boundary from nearest settings container when boundaryEl is omitted', () => {
    const modalEl = document.createElement('div');
    modalEl.className = 'modal-content';
    const containerEl = document.createElement('div');
    const inputEl = document.createElement('input');
    containerEl.appendChild(inputEl);
    modalEl.appendChild(containerEl);
    document.body.appendChild(modalEl);

    window.localStorage.setItem(
      'opencodian:settings-search-history:modal-test',
      JSON.stringify(['alpha', 'beta']),
    );

    // No explicit boundaryEl — should auto-resolve from nearest
    // .modal-content / .vertical-tab-content-container / .vertical-tab-content.
    const handle = enhanceSearchInput({
      historyKey: 'modal-test',
      inputEl,
      containerEl,
    });

    const popover = document.body.querySelector<HTMLElement>('.opencodian-settings-search-history-popover');
    expect(popover).not.toBeNull();

    mockRect(modalEl, { left: 100, top: 50, width: 180, height: 200 });
    mockRect(inputEl, { left: 250, top: 80, width: 24, height: 28 });
    mockRect(popover!, { left: 0, top: 0, width: 120, height: 80 });
    inputEl.dispatchEvent(new FocusEvent('focus'));

    const popoverLeft = Number.parseFloat(popover!.style.left);
    const popoverTop = Number.parseFloat(popover!.style.top);

    expect(popoverLeft).toBeGreaterThanOrEqual(100);
    expect(popoverLeft + 120).toBeLessThanOrEqual(280);
    expect(popoverTop + 80).toBeLessThanOrEqual(250);

    handle.destroy();
  });

  it('auto-resolves boundary from nearest vertical-tab-content-container', () => {
    const tabContent = document.createElement('div');
    tabContent.className = 'vertical-tab-content-container';
    const containerEl = document.createElement('div');
    const inputEl = document.createElement('input');
    containerEl.appendChild(inputEl);
    tabContent.appendChild(containerEl);
    document.body.appendChild(tabContent);

    window.localStorage.setItem(
      'opencodian:settings-search-history:tab-test',
      JSON.stringify(['one', 'two']),
    );

    const handle = enhanceSearchInput({
      historyKey: 'tab-test',
      inputEl,
      containerEl,
    });

    const popover = document.body.querySelector<HTMLElement>('.opencodian-settings-search-history-popover');
    expect(popover).not.toBeNull();

    mockRect(tabContent, { left: 60, top: 40, width: 170, height: 180 });
    mockRect(inputEl, { left: 190, top: 60, width: 28, height: 28 });
    mockRect(popover!, { left: 0, top: 0, width: 110, height: 76 });
    inputEl.dispatchEvent(new FocusEvent('focus'));

    const popoverLeft = Number.parseFloat(popover!.style.left);
    const popoverTop = Number.parseFloat(popover!.style.top);

    expect(popoverLeft).toBeGreaterThanOrEqual(60);
    expect(popoverLeft + 110).toBeLessThanOrEqual(230);
    expect(popoverTop + 76).toBeLessThanOrEqual(220);

    handle.destroy();
  });
});
