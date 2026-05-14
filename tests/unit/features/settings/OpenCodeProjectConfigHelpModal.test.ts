import type { App } from 'obsidian';

import { OpenCodeProjectConfigHelpModal } from '../../../../src/features/settings/OpenCodeProjectConfigHelpModal';
import { setLocale, t } from '../../../../src/i18n';

describe('OpenCodeProjectConfigHelpModal', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('explains session sharing in user-facing language and links to official docs', () => {
    const modal = new OpenCodeProjectConfigHelpModal({} as App, 'share');

    modal.onOpen();

    expect(modal.contentEl.querySelector('h2')?.textContent).toBe(t('settings.conversation.share.help.title'));
    expect(modal.contentEl.textContent).toContain('public link');
    expect(modal.contentEl.textContent).toContain('not a Markdown export');
    expect(
      Array.from(modal.contentEl.querySelectorAll<HTMLAnchorElement>('a')).map((link) => link.href),
    ).toEqual([
      'https://opencode.ai/docs/zh-cn/share',
      'https://opencode.ai/docs/zh-cn/config',
    ]);
  });

  it('explains bash permission deny patterns and links to official docs', () => {
    const modal = new OpenCodeProjectConfigHelpModal({} as App, 'bashPermission');

    modal.onOpen();

    expect(modal.contentEl.querySelector('h2')?.textContent).toBe(t('settings.security.blockedCommands.help.title'));
    expect(modal.contentEl.textContent).toContain('permission.bash');
    expect(modal.contentEl.textContent).toContain('not a sandbox');
    expect(
      Array.from(modal.contentEl.querySelectorAll<HTMLAnchorElement>('a')).map((link) => link.href),
    ).toEqual([
      'https://opencode.ai/docs/zh-cn/permissions',
      'https://opencode.ai/docs/zh-cn/tools',
    ]);
  });
});
