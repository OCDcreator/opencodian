import type { SlashCommandMenuItem } from '../../../../src/core/config/slashCommandCatalog';
import { SlashCommandMenuCoordinator } from '../../../../src/features/chat/services/commands/SlashCommandMenuCoordinator';
import { t } from '../../../../src/i18n';

function fixture(backend = 'opencode2') {
  const textarea = document.body.appendChild(document.createElement('textarea'));
  const menu = document.body.appendChild(document.createElement('div'));
  const skill: SlashCommandMenuItem = { id: 'design', description: 'Design notes',
    source: backend === 'codex' ? 'codex-skill' : 'skill', nativeSkill: true,
    insertText: backend === 'codex' ? '$design ' : backend === 'pi' ? '/skill:design ' : '/design ',
    hasProjectOverride: false, runtimeAvailable: true, subtask: false, isBuiltin: false };
  const commands: SlashCommandMenuItem[] = ['new', 'compact'].map((id) => ({
    ...skill, id, description: id, source: 'command', insertText: `/${id} `,
  }));
  let catalog: SlashCommandMenuItem[] | null = [skill, ...commands];
  const onApplied = jest.fn();
  const coordinator = new SlashCommandMenuCoordinator({
    getTextarea: () => textarea, getMenuElement: () => menu, getCatalogItems: () => catalog,
    setCatalogItems: (items) => { catalog = items; }, loadItems: async () => [skill, ...commands],
    getSkillMode: () => 'skills-command', isCodexSkillMode: () => backend === 'codex',
    onMenuLoadFailed: jest.fn(), onCatalogStateChanged: jest.fn(), onMenuItemApplied: onApplied, scheduleLayoutSync: jest.fn(),
  });
  const refresh = async (text = '/') => {
    textarea.value = text; textarea.setSelectionRange(text.length, text.length); await coordinator.refresh();
  };
  const button = (group: string) => menu.querySelector<HTMLButtonElement>(`button[data-group="${group}"]`)!;
  const key = (value: string, shiftKey = false) => {
    const event = new KeyboardEvent('keydown', { key: value, shiftKey, cancelable: true });
    return { handled: coordinator.tryHandleKeydown(event), event };
  };
  return { textarea, menu, skill, onApplied, coordinator, refresh, button, key };
}

describe('slash menu command and skill groups', () => {
  afterEach(() => document.body.replaceChildren());

  it.each(['opencode2', 'claude-code', 'codex', 'pi', 'zcode', 'dsh'])('%s collapses commands to reveal and insert its native skill', async (backend) => {
    const view = fixture(backend);
    await view.refresh();
    expect(Array.from(view.menu.querySelectorAll('.opencodian-reference-menu-group-label'), (el) => el.textContent))
      .toEqual([t('slashCommand.group.commands'), t('slashCommand.group.skills')]);
    expect(view.button('commands').querySelector('.opencodian-reference-menu-count')?.textContent).toBe('2');
    expect(view.button('skills').querySelector('.opencodian-reference-menu-count')?.textContent).toBe('1');
    view.button('commands').click();
    expect(view.button('commands').getAttribute('aria-expanded')).toBe('false');
    expect(view.menu.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(view.menu.querySelector('[role="option"].is-selected')?.textContent).toContain('design');
    expect(view.key('Tab').handled).toBe(true);
    expect(view.textarea.value).toBe(view.skill.insertText);
    expect(view.onApplied).toHaveBeenCalledTimes(1);
    await view.refresh();
    expect(view.button('commands').getAttribute('aria-expanded')).toBe('false');
  });

  it('skips folded skills with arrows and inserts only a displayed command', async () => {
    const view = fixture();
    await view.refresh();
    view.button('skills').click();
    view.key('ArrowUp');
    expect(view.menu.querySelector('[role="option"].is-selected')?.textContent).toContain('/compact');
    view.key('ArrowDown');
    expect(view.menu.querySelector('[role="option"].is-selected')?.textContent).toContain('/new');
    view.key('Enter');
    expect(view.textarea.value).toBe('/new ');
  });

  it('keeps all-folded headers reachable and restores keyboard focus on reopening', async () => {
    const view = fixture();
    await view.refresh();
    view.button('commands').click(); view.button('skills').click();
    expect(view.menu.querySelector('[role="option"]')).toBeNull();
    expect(view.menu.classList.contains('is-hidden')).toBe(false);
    expect(view.key('Enter').event.defaultPrevented).toBe(true);
    expect(view.onApplied).not.toHaveBeenCalled();
    expect(view.textarea.value).toBe('/');
    view.key('Tab');
    expect(document.activeElement).toBe(view.button('commands'));
    view.button('commands').click();
    expect(document.activeElement).toBe(view.button('commands'));
    expect(view.button('commands').getAttribute('aria-expanded')).toBe('true');
    expect(view.menu.querySelectorAll('[role="option"]')).toHaveLength(2);
    const controlled = document.getElementById(view.button('skills').getAttribute('aria-controls')!);
    expect(controlled?.hidden).toBe(true);
  });

  it('keeps the dedicated $ skill browser usable when slash skills are folded', async () => {
    const view = fixture('codex');
    await view.refresh(); view.button('skills').click();
    await view.refresh('$');
    expect(view.menu.querySelector('button[data-group]')).toBeNull();
    expect(view.menu.querySelectorAll('[role="option"]')).toHaveLength(1);
    view.key('Tab');
    expect(view.textarea.value).toBe('$design ');
    await view.refresh();
    expect(view.button('skills').getAttribute('aria-expanded')).toBe('false');
  });

  it.each(['opencode2', 'claude-code', 'codex', 'pi', 'zcode', 'dsh'])('%s expands folded matching skills while searching', async (backend) => {
    const view = fixture(backend);
    await view.refresh(); view.button('skills').click();
    await view.refresh('/design');
    expect(view.menu.querySelector('button[data-group="commands"]')).toBeNull();
    expect(view.button('skills').getAttribute('aria-expanded')).toBe('true');
    expect(view.menu.querySelector('[role="option"].is-selected')?.textContent).toContain('design');
    view.key('Tab');
    expect(view.textarea.value).toBe(view.skill.insertText);
  });

  it('expands matching commands and leaves unrelated folded skills closed', async () => {
    const view = fixture();
    await view.refresh(); view.button('commands').click(); view.button('skills').click();
    await view.refresh('/new');
    expect(view.button('commands').getAttribute('aria-expanded')).toBe('true');
    view.key('Enter');
    expect(view.textarea.value).toBe('/new ');
    await view.refresh();
    expect(view.button('skills').getAttribute('aria-expanded')).toBe('false');
  });
});
