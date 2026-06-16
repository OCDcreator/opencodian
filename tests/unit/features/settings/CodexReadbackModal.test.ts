import type { App } from 'obsidian';

import { CodexReadbackModal } from '../../../../src/features/settings/CodexReadbackModal';
import { setLocale, t } from '../../../../src/i18n';

interface TestItem {
  id: string;
  name: string;
}

function createModal(options: {
  fetchItems?: () => Promise<TestItem[] | null>;
  renderItems?: (container: HTMLElement, items: TestItem[]) => void;
} = {}): CodexReadbackModal<TestItem> {
  return new CodexReadbackModal<TestItem>({
    app: {} as App,
    title: 'Test readback',
    intro: 'Intro text',
    readonlyNote: 'Read-only note',
    refreshNote: 'Refresh note',
    loadingText: 'Loading...',
    unavailableText: 'Unavailable.',
    failedText: 'Failed.',
    emptyText: 'Empty.',
    fetchItems: options.fetchItems ?? (async () => []),
    renderItems: options.renderItems ?? (() => {}),
  });
}

beforeEach(() => {
  setLocale('en');
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CodexReadbackModal', () => {
  it('renders shell with intro, notes, and status badge on open', () => {
    const modal = createModal();
    modal.onOpen();

    expect(modal.modalEl.classList.contains('opencodian-codex-readback-modal')).toBe(true);
    expect(modal.contentEl.querySelector('.opencodian-codex-readback-intro')?.textContent).toBe('Intro text');
    expect(modal.contentEl.querySelectorAll('.opencodian-codex-readback-note').length).toBe(2);
    expect(modal.contentEl.querySelector('.opencodian-codex-readback-status-value')).toBeTruthy();
    expect(modal.contentEl.querySelector('[data-readback-content="true"]')).toBeTruthy();
  });

  it('shows loading state while fetching', async () => {
    let release: (value: TestItem[]) => void = () => {};
    const modal = createModal({
      fetchItems: () => new Promise((resolve) => { release = resolve; }),
    });

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const statusValue = modal.contentEl.querySelector('.opencodian-codex-readback-status-value');
    expect(statusValue?.getAttribute('data-readback-state')).toBe('loading');
    expect(statusValue?.textContent).toBe(t('settings.codex.readback.statusLoading'));
    expect(modal.contentEl.textContent).toContain('Loading...');

    release([{ id: '1', name: 'Item' }]);
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });

  it('shows success state with rendered items', async () => {
    const renderItems = jest.fn((container: HTMLElement, items: TestItem[]) => {
      for (const item of items) {
        container.createDiv({ text: item.name, attr: { 'data-item-id': item.id } });
      }
    });
    const modal = createModal({
      fetchItems: async () => [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ],
      renderItems,
    });

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const statusValue = modal.contentEl.querySelector('.opencodian-codex-readback-status-value');
    expect(statusValue?.getAttribute('data-readback-state')).toBe('success');
    expect(statusValue?.textContent).toBe(t('settings.codex.readback.statusCount', { count: 2 }));

    expect(renderItems).toHaveBeenCalledTimes(1);
    expect(modal.contentEl.querySelector('[data-item-id="a"]')?.textContent).toBe('Alpha');
    expect(modal.contentEl.querySelector('[data-item-id="b"]')?.textContent).toBe('Beta');
  });

  it('shows unavailable state when fetch returns null', async () => {
    const modal = createModal({
      fetchItems: async () => null,
    });

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const statusValue = modal.contentEl.querySelector('.opencodian-codex-readback-status-value');
    expect(statusValue?.getAttribute('data-readback-state')).toBe('unavailable');
    expect(statusValue?.textContent).toBe(t('settings.codex.readback.statusUnavailable'));
    expect(modal.contentEl.textContent).toContain('Unavailable.');
  });

  it('shows empty state when fetch returns empty array', async () => {
    const modal = createModal({
      fetchItems: async () => [],
    });

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const statusValue = modal.contentEl.querySelector('.opencodian-codex-readback-status-value');
    expect(statusValue?.getAttribute('data-readback-state')).toBe('empty');
    expect(statusValue?.textContent).toBe(t('settings.codex.readback.statusEmpty'));
    expect(modal.contentEl.textContent).toContain('Empty.');
  });

  it('shows failed state when fetch throws', async () => {
    const modal = createModal({
      fetchItems: async () => { throw new Error('boom'); },
    });

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const statusValue = modal.contentEl.querySelector('.opencodian-codex-readback-status-value');
    expect(statusValue?.getAttribute('data-readback-state')).toBe('failed');
    expect(statusValue?.textContent).toBe(t('settings.codex.readback.statusFailed'));
    expect(modal.contentEl.textContent).toContain('Failed.');
  });

  it('localizes the shared status labels', async () => {
    setLocale('zh');
    const modal = createModal({
      fetchItems: async () => [{ id: 'a', name: 'Alpha' }],
      renderItems: (container: HTMLElement, items: TestItem[]) => {
        container.createDiv({ text: items[0].name, attr: { 'data-item-id': items[0].id } });
      },
    });

    modal.onOpen();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(modal.contentEl.querySelector('.opencodian-codex-readback-status-value')?.textContent)
      .toBe(t('settings.codex.readback.statusCount', { count: 1 }));
  });
});
