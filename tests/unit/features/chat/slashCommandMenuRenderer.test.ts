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
    isBuiltin: false,
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

  it('shows a hint at the top when items are present', () => {
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

    const hint = menuEl.querySelector('.opencodian-slash-command-menu-hint');
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toBe('斜杠命令仅在输入框开头输入时生效');
  });

  it('does not show a hint when the menu is empty', () => {
    const menuEl = document.body.createDiv();

    renderSlashCommandMenu({
      menuEl,
      items: [],
      selectedIndex: -1,
      status: 'emptyCatalog',
      onHoverItem: jest.fn(),
      onSelectItem: jest.fn(),
    });

    expect(menuEl.querySelector('.opencodian-slash-command-menu-hint')).toBeNull();
  });

  it('does not show a hint in mid-text mode', () => {
    const menuEl = document.body.createDiv();

    renderSlashCommandMenu({
      menuEl,
      items: [menuItem()],
      selectedIndex: 0,
      status: 'idle',
      isMidText: true,
      onHoverItem: jest.fn(),
      onSelectItem: jest.fn(),
    });

    expect(menuEl.querySelector('.opencodian-slash-command-menu-hint')).toBeNull();
  });

  it('marks the hint with aria-hidden for a11y', () => {
    const menuEl = document.body.createDiv();

    renderSlashCommandMenu({
      menuEl,
      items: [menuItem()],
      selectedIndex: 0,
      status: 'idle',
      onHoverItem: jest.fn(),
      onSelectItem: jest.fn(),
    });

    const hint = menuEl.querySelector('.opencodian-slash-command-menu-hint');
    expect(hint?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders a direct Codex skill with a truthful $name title (no /$) and a Skill badge', () => {
    const menuEl = document.body.createDiv();

    renderSlashCommandMenu({
      menuEl,
      items: [menuItem({
        id: 'opencodian-runtime-smoke-skill',
        displayId: '$opencodian-runtime-smoke-skill',
        insertText: '$opencodian-runtime-smoke-skill ',
        source: 'codex-skill',
      })],
      selectedIndex: 0,
      status: 'idle',
      onHoverItem: jest.fn(),
      onSelectItem: jest.fn(),
    });

    const title = menuEl.querySelector('.opencodian-slash-command-menu-title')?.textContent;
    expect(title).toBe('$opencodian-runtime-smoke-skill');
    expect(title).not.toContain('/$');
    // Badge must denote Skill, not Command.
    expect(menuEl.querySelector('.opencodian-slash-command-menu-badge')?.textContent).toBe('skill');
  });

  it('renders a Codex skill reached via /skills prefix with a /skills <name> title', () => {
    const menuEl = document.body.createDiv();

    renderSlashCommandMenu({
      menuEl,
      items: [menuItem({
        id: 'code-review',
        displayId: 'skills code-review',
        insertText: '$code-review ',
        source: 'codex-skill',
      })],
      selectedIndex: 0,
      status: 'idle',
      onHoverItem: jest.fn(),
      onSelectItem: jest.fn(),
    });

    const title = menuEl.querySelector('.opencodian-slash-command-menu-title')?.textContent;
    expect(title).toBe('/skills code-review');
  });

  it('keeps the / prefix for ordinary slash commands', () => {
    const menuEl = document.body.createDiv();

    renderSlashCommandMenu({
      menuEl,
      items: [menuItem({ id: 'review', displayId: 'review' })],
      selectedIndex: 0,
      status: 'idle',
      onHoverItem: jest.fn(),
      onSelectItem: jest.fn(),
    });

    expect(menuEl.querySelector('.opencodian-slash-command-menu-title')?.textContent).toBe('/review');
  });
});
