import type { App } from 'obsidian';

import { LiquidGlassSettingHelpModal } from '../../../../src/features/settings/LiquidGlassSettingHelpModal';
import { setLocale } from '../../../../src/i18n';

describe('LiquidGlassSettingHelpModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setLocale('zh');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the title and plain-language paragraphs', () => {
    const modal = new LiquidGlassSettingHelpModal(
      {} as App,
      '位移强度',
      '这是最核心的玻璃强度滑块。\n\n如果你只想调一个参数，通常先调它。',
    );

    modal.onOpen();

    expect(modal.contentEl.querySelector('h2')?.textContent).toBe('位移强度');
    expect(modal.contentEl.querySelector('h5')?.textContent).toBe('这项到底会让哪里变');
    const paragraphs = Array.from(modal.contentEl.querySelectorAll('p')).map((element) => element.textContent);
    expect(paragraphs).toEqual([
      '这是最核心的玻璃强度滑块。',
      '如果你只想调一个参数，通常先调它。',
    ]);
  });
});
