import type { SlashCommandMenuItem } from '../../../../src/core/config/slashCommandCatalog';
import { renderSlashCommandMenu } from '../../../../src/features/chat/services/slashCommandMenuRenderer';
import { setLocale } from '../../../../src/i18n';

function menuItem(overrides: Partial<SlashCommandMenuItem> = {}): SlashCommandMenuItem {
  return {
    id: 'review',
    description: 'Review changes',
    hasProjectOverride: false,
    runtimeAvailable: true,
    source: 'command',
    subtask: false,
    ...overrides,
  };
}

describe('slashCommandMenuRenderer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    setLocale('en');
  });

  it('labels runtime-backed slash commands as command in localized menus', () => {
    setLocale('zh');
    const menuEl = document.body.createDiv();

    renderSlashCommandMenu({
      menuEl,
      items: [menuItem()],
      selectedIndex: 0,
      status: 'idle',
      onHoverItem: jest.fn(),
      onSelectItem: jest.fn(),
    });

    expect(menuEl.querySelector('.opencodian-slash-command-menu-badge')?.textContent).toBe('command');
  });
});
