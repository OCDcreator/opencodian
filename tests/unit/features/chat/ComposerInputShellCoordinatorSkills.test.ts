import type { SlashCommandMenuItem } from '../../../../src/core/config/slashCommandCatalog';
import type { SlashCommandSkillMode } from '../../../../src/core/types';
import {
  ComposerInputShellCoordinator,
  type ComposerInputShellCoordinatorHost,
} from '../../../../src/features/chat/services/ComposerInputShellCoordinator';
import { setLocale, t } from '../../../../src/i18n';

class ResizeObserverMock {
  readonly observe = jest.fn();
  readonly disconnect = jest.fn();
}

function slashItem(
  id: string,
  description: string,
  source: SlashCommandMenuItem['source'] = 'command',
  overrides: Record<string, unknown> = {},
): SlashCommandMenuItem {
  return {
    id,
    description,
    hasProjectOverride: false,
    runtimeAvailable: true,
    source,
    subtask: false,
    ...overrides,
  } as SlashCommandMenuItem;
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createFixture() {
  let skillMode: SlashCommandSkillMode = 'direct';
  let menuItems: SlashCommandMenuItem[] = [];
  const host: jest.Mocked<ComposerInputShellCoordinatorHost> = {
    attachSessionTodo: jest.fn(),
    attachQuestionDock: jest.fn(),
    setContextRowElement: jest.fn(),
    setTooltipLabel: jest.fn(),
    getInputPlaceholder: jest.fn(() => t('chat.input.placeholder')),
    getSlashCommandSkillMode: jest.fn(() => skillMode),
    addChosenFileContextToActiveTab: jest.fn().mockResolvedValue(undefined),
    mountSelectionControls: jest.fn(),
    mountContextUsageIndicator: jest.fn(),
    mountEffortSelector: jest.fn(),
    isActiveTabStreaming: jest.fn(() => false),
    cancelStreaming: jest.fn(),
    isTabForegroundBusy: jest.fn(() => false),
    showProcessingBlockedNotice: jest.fn(),
    getComposerInputMode: jest.fn(() => 'prompt'),
    submitMessage: jest.fn(),
    loadSlashCommandMenuItems: jest.fn().mockImplementation(async () => menuItems),
    setComposerStackHeight: jest.fn(),
    scheduleSettledScrollToBottomIfNeeded: jest.fn(),
  };
  const container = document.body.createDiv();
  const coordinator = new ComposerInputShellCoordinator(host);
  coordinator.build(container);
  const textarea = container.querySelector<HTMLTextAreaElement>('.opencodian-input');
  if (!textarea) {
    throw new Error('textarea was not created');
  }

  return {
    container,
    textarea,
    setMenuItems(nextItems: SlashCommandMenuItem[]) {
      menuItems = nextItems;
    },
    setSkillMode(nextMode: SlashCommandSkillMode) {
      skillMode = nextMode;
    },
  };
}

function getRenderedMenuText(container: HTMLElement): Array<string | null> {
  return Array.from(
    container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item'),
    (item) => item.textContent,
  );
}

function getRenderedHighlightText(
  container: HTMLElement,
  className = 'opencodian-input-highlight-skill',
): string[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(`.${className}`),
    (item) => item.textContent ?? '',
  );
}

function registerSkillSlashModeHooks(): void {
  beforeEach(() => {
    setLocale('en');
    (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
    delete (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  });
}

describe('ComposerInputShellCoordinator skill slash modes', () => {
  registerSkillSlashModeHooks();

  it('shows skill commands directly when the skill mode is direct', async () => {
    const fixture = createFixture();
    fixture.setMenuItems([
      slashItem('review', 'Review changes'),
      slashItem('build-mcp-server', 'Build an MCP server', 'skill'),
    ]);

    fixture.textarea.value = '/';
    fixture.textarea.setSelectionRange(1, 1);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const menuText = getRenderedMenuText(fixture.container);
    expect(menuText).toEqual([
      expect.stringContaining('/review'),
      expect.stringContaining('/build-mcp-server'),
    ]);
    expect(menuText[1]).toContain('skill');
  });

  it('opens skill-only slash autocomplete for a bare slash between surrounding spaces', async () => {
    const fixture = createFixture();
    fixture.setMenuItems([
      slashItem('review', 'Review changes'),
      slashItem('refactor', 'Refactor touched files', 'skill'),
    ]);

    fixture.textarea.value = 'before / after';
    fixture.textarea.setSelectionRange('before /'.length, 'before /'.length);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(getRenderedMenuText(fixture.container)).toEqual([
      expect.stringContaining('/refactor'),
    ]);
  });

  it('only highlights direct slash skills that exist in the loaded catalog', async () => {
    const fixture = createFixture();
    fixture.setMenuItems([
      slashItem('using-superpowers', 'Use the superpowers workflow', 'skill'),
    ]);

    fixture.textarea.value = '/using-superpowers';
    fixture.textarea.setSelectionRange('/using-superpowers'.length, '/using-superpowers'.length);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(getRenderedHighlightText(fixture.container)).toEqual(['/using-superpowers']);

    fixture.textarea.value = '/using-superpowert';
    fixture.textarea.setSelectionRange('/using-superpowert'.length, '/using-superpowert'.length);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(getRenderedHighlightText(fixture.container)).toEqual([]);
  });

  it('uses separate input highlight classes for commands and skills', async () => {
    const fixture = createFixture();
    fixture.setMenuItems([
      slashItem('review', 'Review changes'),
      slashItem('writing-skills', 'Use the writing skills workflow', 'skill'),
    ]);

    fixture.textarea.value = '/review and /writing-skills';
    fixture.textarea.setSelectionRange('/review and /writing-skills'.length, '/review and /writing-skills'.length);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(getRenderedHighlightText(fixture.container, 'opencodian-input-highlight-command')).toEqual(['/review']);
    expect(getRenderedHighlightText(fixture.container, 'opencodian-input-highlight-skill')).toEqual(['/writing-skills']);
  });

  it('keeps highlighting a known direct skill after the cursor moves past the token', async () => {
    const fixture = createFixture();
    fixture.setMenuItems([
      slashItem('writing-skills', 'Use the writing skills workflow', 'skill'),
    ]);

    fixture.textarea.value = '/writing-skills';
    fixture.textarea.setSelectionRange('/writing-skills'.length, '/writing-skills'.length);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(getRenderedHighlightText(fixture.container)).toEqual(['/writing-skills']);

    fixture.textarea.value = 'nihao /writing-skills weishenme hui';
    fixture.textarea.setSelectionRange(
      'nihao /writing-skills weishenme hui'.length,
      'nihao /writing-skills weishenme hui'.length,
    );
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(getRenderedHighlightText(fixture.container)).toEqual(['/writing-skills']);
  });

  it('uses a /skills prefix entry and nested skill suggestions when skill mode is prefixed', async () => {
    const fixture = createFixture();
    fixture.setSkillMode('skills-command');
    fixture.setMenuItems([
      slashItem('review', 'Review changes'),
      slashItem('build-mcp-server', 'Build an MCP server', 'skill'),
      slashItem('frontend-design', 'Design a frontend', 'skill'),
    ]);

    fixture.textarea.value = '/';
    fixture.textarea.setSelectionRange(1, 1);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(getRenderedMenuText(fixture.container)).toEqual([
      expect.stringContaining('/review'),
      expect.stringContaining('/skills'),
    ]);

    const prefixedEntry = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item'),
    ).find((item) => item.textContent?.includes('/skills'));
    prefixedEntry?.click();
    await flushAsync();

    expect(fixture.textarea.value).toBe('/skills ');
    expect(getRenderedMenuText(fixture.container)).toEqual([
      expect.stringContaining('/skills build-mcp-server'),
      expect.stringContaining('/skills frontend-design'),
    ]);

    fixture.textarea.value = '/skills build';
    fixture.textarea.setSelectionRange('/skills build'.length, '/skills build'.length);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const nestedItem = fixture.container.querySelector<HTMLElement>('.opencodian-slash-command-menu-item');
    expect(getRenderedMenuText(fixture.container)).toHaveLength(1);
    expect(nestedItem?.textContent).toContain('/skills build-mcp-server');

    nestedItem?.click();

    expect(fixture.textarea.value).toBe('/skills build-mcp-server ');
  });

  it('opens nested skill suggestions for a later /skills token after earlier prefixed content', async () => {
    const fixture = createFixture();
    fixture.setSkillMode('skills-command');
    fixture.setMenuItems([
      slashItem('agent-browser', 'Use browser automation', 'skill'),
      slashItem('frontend-design', 'Design a frontend', 'skill'),
    ]);

    fixture.textarea.value = '/skills agent-browser weishenmehui /skills ';
    fixture.textarea.setSelectionRange(
      '/skills agent-browser weishenmehui /skills '.length,
      '/skills agent-browser weishenmehui /skills '.length,
    );
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(getRenderedMenuText(fixture.container)).toEqual([
      expect.stringContaining('/skills agent-browser'),
      expect.stringContaining('/skills frontend-design'),
    ]);
  });

  it('opens nested skill suggestions when prefixed /skills follows plain text', async () => {
    const fixture = createFixture();
    fixture.setSkillMode('skills-command');
    fixture.setMenuItems([
      slashItem('agent-browser', 'Use browser automation', 'skill'),
      slashItem('frontend-design', 'Design a frontend', 'skill'),
    ]);

    fixture.textarea.value = 'hello /skills ';
    fixture.textarea.setSelectionRange(
      'hello /skills '.length,
      'hello /skills '.length,
    );
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(getRenderedMenuText(fixture.container)).toEqual([
      expect.stringContaining('/skills agent-browser'),
      expect.stringContaining('/skills frontend-design'),
    ]);
  });

  it('preserves surrounding text when selecting a nested skill from a mid-text /skills prefix', async () => {
    const fixture = createFixture();
    fixture.setSkillMode('skills-command');
    fixture.setMenuItems([
      slashItem('agent-browser', 'Use browser automation', 'skill'),
      slashItem('frontend-design', 'Design a frontend', 'skill'),
    ]);

    fixture.textarea.value = 'hello /skills  world';
    fixture.textarea.setSelectionRange('hello /skills '.length, 'hello /skills '.length);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const nestedItems = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item'),
    );
    expect(nestedItems).toHaveLength(2);

    nestedItems[1]?.click();
    await flushAsync();

    expect(fixture.textarea.value).toBe('hello /skills frontend-design  world');
    expect(fixture.textarea.selectionStart).toBe('hello /skills frontend-design '.length);
  });

  it('treats an exact later /skills token as a nested skill query', async () => {
    const fixture = createFixture();
    fixture.setSkillMode('skills-command');
    fixture.setMenuItems([
      slashItem('agent-browser', 'Use browser automation', 'skill'),
      slashItem('frontend-design', 'Design a frontend', 'skill'),
      slashItem('review', 'Review changes'),
    ]);

    fixture.textarea.value = 'hello /skills';
    fixture.textarea.setSelectionRange(
      'hello /skills'.length,
      'hello /skills'.length,
    );
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(getRenderedMenuText(fixture.container)).toEqual([
      expect.stringContaining('/skills agent-browser'),
      expect.stringContaining('/skills frontend-design'),
    ]);
  });
});

describe('ComposerInputShellCoordinator skill slash presentation', () => {
  registerSkillSlashModeHooks();

  it('only highlights prefixed /skills entries when the nested skill exists', async () => {
    const fixture = createFixture();
    fixture.setSkillMode('skills-command');
    fixture.setMenuItems([
      slashItem('using-superpowers', 'Use the superpowers workflow', 'skill'),
    ]);

    fixture.textarea.value = '/skills using-superpowers';
    fixture.textarea.setSelectionRange('/skills using-superpowers'.length, '/skills using-superpowers'.length);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(getRenderedHighlightText(fixture.container)).toEqual(['/skills using-superpowers']);

    fixture.textarea.value = '/skills using-superpowert';
    fixture.textarea.setSelectionRange('/skills using-superpowert'.length, '/skills using-superpowert'.length);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(getRenderedHighlightText(fixture.container)).toEqual([]);
  });

  it('renders localized skill provenance details in prefixed skill suggestions', async () => {
    setLocale('zh');

    const fixture = createFixture();
    fixture.setSkillMode('skills-command');
    fixture.setMenuItems([
      slashItem(
        'claude-md-improver',
        'Improve CLAUDE.md',
        'skill',
        { skillSource: { kind: 'plugin', pluginName: 'claude-md-management' } },
      ),
      slashItem(
        'opencode-skill',
        'OpenCode helper',
        'skill',
        { skillSource: { kind: 'opencodeProject' } },
      ),
    ]);

    fixture.textarea.value = '/skills ';
    fixture.textarea.setSelectionRange('/skills '.length, '/skills '.length);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const menuItems = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item'),
    );

    expect(menuItems[0]?.textContent).toContain('/skills claude-md-improver');
    expect(menuItems[0]?.textContent).toContain('插件提供：claude-md-management');
    expect(menuItems[1]?.textContent).toContain('当前项目（OpenCode）');
  });

  it('re-syncs an open menu when the skill mode changes to prefixed', async () => {
    const fixture = createFixture();
    fixture.setMenuItems([
      slashItem('review', 'Review changes'),
      slashItem('x-reader/video', 'Video summary', 'skill'),
    ]);

    fixture.textarea.value = '/';
    fixture.textarea.setSelectionRange(1, 1);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(getRenderedMenuText(fixture.container)).toEqual([
      expect.stringContaining('/review'),
      expect.stringContaining('/x-reader/video'),
    ]);

    fixture.setSkillMode('skills-command');
    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await flushAsync();

    expect(getRenderedMenuText(fixture.container)).toEqual([
      expect.stringContaining('/review'),
      expect.stringContaining('/skills'),
    ]);
  });
});
