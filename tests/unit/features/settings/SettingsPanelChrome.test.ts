import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { App } from 'obsidian';

import {
  createSettingsBlock,
  renderSettingsPanelTitle,
} from '../../../../src/features/settings/SettingsPanelChrome';
import type OpenCodianPlugin from '../../../../src/main';

describe('SettingsPanelChrome', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps footer descriptions visible outside collapsible details content', () => {
    const containerEl = document.createElement('div');
    const bodyEl = createSettingsBlock(
      containerEl,
      {
        title: 'Provider and model management',
        description: 'Manage providers grouped by provider.',
        collapsible: true,
        defaultOpen: false,
        descriptionPlacement: 'footer',
      },
      (targetEl, text) => targetEl?.setText(text),
    );

    const detailsEl = containerEl.querySelector('details.opencodian-settings-block-details');
    const summaryDescEl = containerEl.querySelector('.opencodian-settings-block-summary .opencodian-settings-block-desc');
    const footerDescEl = containerEl.querySelector<HTMLElement>('.opencodian-settings-block-footer-desc');

    expect(detailsEl).not.toBeNull();
    expect(detailsEl!.open).toBe(false);
    expect(bodyEl.classList.contains('opencodian-settings-block-body')).toBe(true);
    expect(summaryDescEl).toBeNull();
    expect(footerDescEl?.textContent).toBe('Manage providers grouped by provider.');
    expect(footerDescEl?.classList.contains('opencodian-settings-block-desc')).toBe(true);
    expect(detailsEl!.contains(footerDescEl)).toBe(false);
  });

  it('embeds both title wordmarks so a standard three-file plugin installation can render them', () => {
    const containerEl = document.createElement('div');
    const getResourcePath = jest.fn((path: string) => `app://vault/${path}`);
    const app = {
      vault: {
        adapter: { getResourcePath },
      },
    } as unknown as App;
    const plugin = {
      manifest: { dir: '.obsidian/plugins/opencodian' },
    } as unknown as OpenCodianPlugin;

    renderSettingsPanelTitle(containerEl, app, plugin);

    const wordmarks = Array.from(containerEl.querySelectorAll<HTMLImageElement>(
      '.opencodian-settings-title-wordmark',
    ));
    expect(wordmarks).toHaveLength(2);
    expect(wordmarks.every((wordmark) => wordmark.src.startsWith('data:image/svg+xml'))).toBe(true);
    expect(getResourcePath).not.toHaveBeenCalled();
  });

  it('reclaims the narrow-header wordmark without wrapping or hiding the icon rail', () => {
    const css = readFileSync(join(process.cwd(), 'src/style/components/settings-layout-contract.css'), 'utf8');
    const readRule = (selector: string): string => {
      const start = css.lastIndexOf(`${selector} {`);
      expect(start).toBeGreaterThanOrEqual(0);
      return css.slice(start, css.indexOf('}', start) + 1);
    };
    const style = document.head.createEl('style', { text: [
      '.opencodian-settings .opencodian-settings-panel-title',
      '.opencodian-settings .opencodian-settings-panel-title-actions,\n  .opencodian-settings .opencodian-agent-switcher-header-icons',
      '.opencodian-settings .opencodian-settings-panel-title-actions',
      '.opencodian-settings .opencodian-agent-switcher-header-icons',
      '.opencodian-settings .opencodian-settings-panel-title :is(.opencodian-title-text, .opencodian-settings-panel-title-fallback)',
    ].map(readRule).join('\n') });
    try {
      const containerEl = document.body.createDiv({ cls: 'opencodian-settings' });
      const app = { vault: { adapter: { getResourcePath: jest.fn() } } } as unknown as App;
      const plugin = { manifest: { dir: '.obsidian/plugins/opencodian' } } as unknown as OpenCodianPlugin;
      renderSettingsPanelTitle(containerEl, app, plugin);
      const title = containerEl.querySelector('.opencodian-settings-panel-title')!;
      const actions = title.createDiv({ cls: 'opencodian-settings-panel-title-actions' });
      const icons = actions.createDiv({ cls: 'opencodian-agent-switcher-header-icons' });
      const wordmark = title.querySelector('.opencodian-title-text')!;
      const logo = title.querySelector('.opencodian-logo')!;

      expect(getComputedStyle(title).flexWrap).toBe('nowrap');
      expect(getComputedStyle(actions).flexWrap).toBe('nowrap');
      expect(getComputedStyle(actions).flexShrink).toBe('1');
      expect(getComputedStyle(icons).flexWrap).toBe('nowrap');
      expect(getComputedStyle(icons).overflowX).toBe('auto');
      expect(getComputedStyle(wordmark).position).toBe('absolute');
      expect(getComputedStyle(wordmark).width).toBe('1px');
      expect(getComputedStyle(wordmark).height).toBe('1px');
      expect(getComputedStyle(wordmark).clipPath).toBe('inset(50%)');
      expect(getComputedStyle(wordmark).display).not.toBe('none');
      expect(wordmark.getAttribute('alt')).toBe('OpenCodian');
      expect(getComputedStyle(logo).position).not.toBe('absolute');
    } finally {
      style.remove();
    }
  });
});
