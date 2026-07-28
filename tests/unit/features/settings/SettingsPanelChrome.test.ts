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
});
