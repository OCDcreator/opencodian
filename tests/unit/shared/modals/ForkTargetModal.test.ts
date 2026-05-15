import { App } from 'obsidian';

import { setLocale, t } from '../../../../src/i18n';
import { ForkTargetModal } from '../../../../src/shared/modals/ForkTargetModal';

describe('ForkTargetModal', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('hides the new-tab option when new tab targets are disabled', () => {
    const resolveChoice = jest.fn();
    const modal = new ForkTargetModal({} as App, resolveChoice, {
      allowNewTab: false,
    });
    (modal as unknown as { setTitle: jest.Mock }).setTitle = jest.fn();

    modal.onOpen();

    expect(modal.contentEl.textContent).toContain(t('chat.fork.targetCurrentTab'));
    expect(modal.contentEl.textContent).not.toContain(t('chat.fork.targetNewTab'));
    expect(modal.contentEl.textContent).toContain(t('chat.fork.newTabDisabled'));
  });
});
