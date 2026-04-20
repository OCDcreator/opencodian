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

describe('ComposerInputShellCoordinator skill slash modes', () => {
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
    expect(menuItems[0]?.textContent).toContain('插件：claude-md-management');
    expect(menuItems[1]?.textContent).toContain('OpenCode 项目');
  });
});
