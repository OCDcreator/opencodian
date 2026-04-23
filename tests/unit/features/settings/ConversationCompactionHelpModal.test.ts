import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { App } from 'obsidian';

import { ConversationCompactionHelpModal } from '../../../../src/features/settings/ConversationCompactionHelpModal';
import { setLocale } from '../../../../src/i18n';

describe('ConversationCompactionHelpModal', () => {
  beforeEach(() => {
    setLocale('zh');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders reserved-token help with OpenCode default explanation', () => {
    const modal = new ConversationCompactionHelpModal({} as App, 'reserved');

    modal.onOpen();

    expect(modal.contentEl.querySelector('h2')?.textContent).toBe('预留 Token');
    expect(modal.contentEl.textContent).toContain('留空时会跟随 OpenCode 默认策略');
    expect(modal.contentEl.textContent).toContain('调小后，当前请求可用的上下文通常会更多');
  });

  it('uses a dedicated wide modal shell with four summary cards', () => {
    const modal = new ConversationCompactionHelpModal({} as App, 'reserved');

    modal.onOpen();

    expect(modal.modalEl.hasClass('opencodian-conversation-compaction-help-modal')).toBe(true);
    expect(
      modal.contentEl.querySelectorAll('.opencodian-compaction-help-card'),
    ).toHaveLength(4);
  });

  it('defines a wide non-scrolling compaction help layout in css', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    expect(css).toMatch(
      /\.opencodian-conversation-compaction-help-modal\s*\{[\s\S]*width:\s*min\(920px,\s*calc\(100vw - 40px\)\)/,
    );
    expect(css).toMatch(
      /\.opencodian-compaction-help-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(css).toMatch(
      /\.opencodian-conversation-compaction-help\s*\{[\s\S]*overflow:\s*visible;/,
    );
  });
});
