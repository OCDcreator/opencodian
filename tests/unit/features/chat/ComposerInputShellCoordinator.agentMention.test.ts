import type { SlashCommandMenuItem } from '../../../../src/core/config/slashCommandCatalog';
import type { AgentMentionCandidate } from '../../../../src/features/chat/services/AgentMentionComposerController';
import {
  ComposerInputShellCoordinator,
  type ComposerInputShellCoordinatorHost,
} from '../../../../src/features/chat/services/ComposerInputShellCoordinator';
import {
  attachAgentMentionCandidatesToSlashCommandMenuItems,
  attachAgentSelectionCandidatesToSlashCommandMenuItems,
} from '../../../../src/features/chat/services/SlashCommandMenuCatalogCache';
import { t } from '../../../../src/i18n';

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];

  readonly observe = jest.fn();
  readonly disconnect = jest.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }

  trigger(): void {
    this.callback([], this as unknown as ResizeObserver);
  }

  static reset(): void {
    ResizeObserverMock.instances = [];
  }
}

let animationFrameQueue: FrameRequestCallback[] = [];

function flushAnimationFrames(): void {
  while (animationFrameQueue.length > 0) {
    const callback = animationFrameQueue.shift();
    callback?.(0);
  }
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function slashItem(id: string, description: string): SlashCommandMenuItem {
  return {
    id,
    description,
    hasProjectOverride: false,
    runtimeAvailable: true,
    source: 'command',
    subtask: false,
  };
}

function createFixture(options: { slashCommandMenuItems?: SlashCommandMenuItem[] } = {}) {
  let slashCommandMenuItems: SlashCommandMenuItem[] = options.slashCommandMenuItems ?? [];
  let agentMentionCandidates: AgentMentionCandidate[] = [];

  const host: jest.Mocked<ComposerInputShellCoordinatorHost> = {
    attachSessionTodo: jest.fn(),
    attachQuestionDock: jest.fn(),
    setContextRowElement: jest.fn(),
    setTooltipLabel: jest.fn(),
    getInputPlaceholder: jest.fn(() => t('chat.input.placeholder')),
    getSlashCommandSkillMode: jest.fn(() => 'direct'),
    addChosenFileContextToActiveTab: jest.fn().mockResolvedValue(undefined),
    mountSelectionControls: jest.fn(),
    mountContextUsageIndicator: jest.fn(),
    mountEffortSelector: jest.fn(),
    isActiveTabStreaming: jest.fn(() => false),
    cancelStreaming: jest.fn(),
    isTabForegroundBusy: jest.fn(() => false),
    showProcessingBlockedNotice: jest.fn(),
    getComposerInputMode: jest.fn(() => 'prompt'),
    submitMessage: jest.fn().mockResolvedValue(undefined),
    loadSlashCommandMenuItems: jest.fn().mockImplementation(async () => slashCommandMenuItems),
    loadAgentMentionCandidates: jest.fn().mockImplementation(async () => agentMentionCandidates),
    setComposerStackHeight: jest.fn(),
    scheduleSettledScrollToBottomIfNeeded: jest.fn(),
  };

  const container = document.createElement('div');
  Object.defineProperty(container, 'offsetHeight', {
    configurable: true,
    get: () => 88,
  });
  document.body.appendChild(container);

  const coordinator = new ComposerInputShellCoordinator(host);
  coordinator.build(container);
  flushAnimationFrames();

  const textarea = container.querySelector<HTMLTextAreaElement>('.opencodian-input');
  if (!textarea) {
    throw new Error('textarea was not created');
  }
  Object.defineProperty(textarea, 'scrollHeight', {
    configurable: true,
    get: () => 32,
  });

  return {
    container,
    host,
    textarea,
    setSlashCommandMenuItems(nextValue: SlashCommandMenuItem[]) {
      slashCommandMenuItems = nextValue;
    },
    setAgentMentionCandidates(nextValue: AgentMentionCandidate[]) {
      agentMentionCandidates = nextValue;
    },
  };
}

function installCoordinatorDomMocks(): void {
  ResizeObserverMock.reset();
  animationFrameQueue = [];
  (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    animationFrameQueue.push(callback);
    return animationFrameQueue.length;
  });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
}

function restoreCoordinatorDomMocks(originalResizeObserver: typeof ResizeObserver | undefined): void {
  document.body.innerHTML = '';
  jest.restoreAllMocks();
  ResizeObserverMock.reset();
  if (originalResizeObserver) {
    (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      originalResizeObserver;
  } else {
    delete (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  }
}

describe('ComposerInputShellCoordinator agent mention menu', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    installCoordinatorDomMocks();
  });

  afterEach(() => {
    restoreCoordinatorDomMocks(originalResizeObserver);
  });

  it('opens from an @ query and only shows visible subagent candidates', async () => {
    const fixture = createFixture();
    fixture.setAgentMentionCandidates([
      { id: 'build', displayName: 'Build', description: 'Primary agent', mode: 'primary' },
      { id: 'reviewer', displayName: 'Reviewer', description: 'Reviews changes', mode: 'subagent' },
      { id: 'planner', displayName: 'Planner', description: 'Plans tasks', mode: 'all' },
      { id: 'secret', displayName: 'Secret', description: 'Hidden subagent', mode: 'subagent', hidden: true },
    ]);

    fixture.textarea.value = 'ask @re';
    fixture.textarea.setSelectionRange(7, 7);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const menuItems = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item'),
    );
    const itemText = menuItems.map((item) => item.textContent ?? '').join('\n');

    expect(fixture.host.loadAgentMentionCandidates).toHaveBeenCalledTimes(1);
    expect(menuItems).toHaveLength(1);
    expect(itemText).toContain('@reviewer');
    expect(itemText).toContain('Reviews changes');
    expect(itemText).not.toContain('@build');
    expect(itemText).not.toContain('@secret');
  });

  it('loads @agent candidates from the shared composer catalog when no direct host loader is present', async () => {
    const fixture = createFixture();
    fixture.host.loadAgentMentionCandidates = undefined;
    fixture.setSlashCommandMenuItems(attachAgentMentionCandidatesToSlashCommandMenuItems([], [
      { id: 'reviewer', displayName: 'Reviewer', description: 'Reviews changes', mode: 'subagent' },
    ]));

    fixture.textarea.value = 'ask @re';
    fixture.textarea.setSelectionRange(7, 7);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const menuItems = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item'),
    );

    expect(fixture.host.loadSlashCommandMenuItems).toHaveBeenCalledTimes(1);
    expect(menuItems).toHaveLength(1);
    expect(menuItems[0]?.textContent).toContain('@reviewer');
  });

  it('inserts a selected agent mention and submits prompt content with tracked mention intent', async () => {
    const fixture = createFixture();
    fixture.setAgentMentionCandidates([
      { id: 'reviewer', displayName: 'Reviewer', description: 'Reviews changes', mode: 'subagent' },
    ]);

    fixture.textarea.value = 'please ask @re';
    fixture.textarea.setSelectionRange(14, 14);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushAsync();

    expect(fixture.textarea.value).toBe('please ask @reviewer ');
    expect(fixture.host.submitMessage).not.toHaveBeenCalled();

    fixture.textarea.value += 'to check this';
    fixture.textarea.setSelectionRange(fixture.textarea.value.length, fixture.textarea.value.length);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushAsync();

    expect(fixture.host.submitMessage).toHaveBeenCalledWith({
      kind: 'prompt',
      content: 'please ask @reviewer to check this',
      invocationIntent: {
        kind: 'prompt',
        mentions: [
          {
            agentId: 'reviewer',
            source: {
              value: '@reviewer',
              start: 11,
              end: 20,
            },
          },
        ],
      },
    });
  });

  it('submits the toolbar-selected primary agent alongside tracked mention intents', async () => {
    const fixture = createFixture({
      slashCommandMenuItems: attachAgentSelectionCandidatesToSlashCommandMenuItems([], [
        { id: 'build', displayName: 'Build', description: 'Builds changes', mode: 'primary' },
      ]),
    });
    fixture.setAgentMentionCandidates([
      { id: 'reviewer', displayName: 'Reviewer', description: 'Reviews changes', mode: 'subagent' },
    ]);
    await flushAsync();

    fixture.container.querySelector<HTMLElement>('.opencodian-agent-trigger')?.click();
    await flushAsync();
    fixture.container.querySelector<HTMLElement>('[data-agent-id="build"]')?.click();

    fixture.textarea.value = 'please ask @re';
    fixture.textarea.setSelectionRange(14, 14);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushAsync();

    fixture.textarea.value += 'to check this';
    fixture.textarea.setSelectionRange(fixture.textarea.value.length, fixture.textarea.value.length);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushAsync();

    expect(fixture.host.submitMessage).toHaveBeenCalledWith({
      kind: 'prompt',
      content: 'please ask @reviewer to check this',
      invocationIntent: {
        kind: 'prompt',
        primaryAgent: 'build',
        mentions: [
          {
            agentId: 'reviewer',
            source: {
              value: '@reviewer',
              start: 11,
              end: 20,
            },
          },
        ],
      },
    });
  });

  it('keeps the selected mention source span when the same token was typed manually earlier', async () => {
    const fixture = createFixture();
    fixture.setAgentMentionCandidates([
      { id: 'reviewer', displayName: 'Reviewer', description: 'Reviews changes', mode: 'subagent' },
    ]);

    fixture.textarea.value = 'manual @reviewer ask @re';
    fixture.textarea.setSelectionRange(24, 24);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushAsync();

    fixture.textarea.value += 'please';
    fixture.textarea.setSelectionRange(fixture.textarea.value.length, fixture.textarea.value.length);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushAsync();

    expect(fixture.host.submitMessage).toHaveBeenCalledWith({
      kind: 'prompt',
      content: 'manual @reviewer ask @reviewer please',
      invocationIntent: {
        kind: 'prompt',
        mentions: [
          {
            agentId: 'reviewer',
            source: {
              value: '@reviewer',
              start: 21,
              end: 30,
            },
          },
        ],
      },
    });
  });
});

describe('ComposerInputShellCoordinator agent mentions in slash commands', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    installCoordinatorDomMocks();
  });

  afterEach(() => {
    restoreCoordinatorDomMocks(originalResizeObserver);
  });

  it('opens agent suggestions inside slash command arguments', async () => {
    const fixture = createFixture();
    fixture.setAgentMentionCandidates([
      { id: 'reviewer', displayName: 'Reviewer', description: 'Reviews changes', mode: 'subagent' },
    ]);

    fixture.textarea.value = '/review @re';
    fixture.textarea.setSelectionRange(11, 11);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(fixture.host.loadAgentMentionCandidates).toHaveBeenCalled();
    const menuItems = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item'),
    );
    expect(menuItems.length).toBeGreaterThan(0);
    expect(menuItems[0].textContent).toContain('@reviewer');

    // Press Enter to select the agent mention
    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushAsync();

    // After selecting the mention, the text should be updated
    expect(fixture.textarea.value).toBe('/review @reviewer ');

    // Press Enter again to submit the command with the inserted mention text
    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushAsync();

    expect(fixture.host.submitMessage).toHaveBeenCalledWith({
      kind: 'command',
      rawContent: '/review @reviewer',
      command: 'review',
      arguments: '@reviewer',
    });
  });

  it('opens agent suggestions after command arguments with spaces', async () => {
    const fixture = createFixture();
    fixture.setAgentMentionCandidates([
      { id: 'reviewer', displayName: 'Reviewer', description: 'Reviews changes', mode: 'subagent' },
    ]);

    fixture.textarea.value = '/skill nihao @re';
    fixture.textarea.setSelectionRange(16, 16);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(fixture.host.loadAgentMentionCandidates).toHaveBeenCalled();
    const menuItems = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item'),
    );
    expect(menuItems.length).toBeGreaterThan(0);
    expect(menuItems[0].textContent).toContain('@reviewer');
  });

  it('keeps slash autocomplete available while agent mentions are supported', async () => {
    const fixture = createFixture();
    fixture.setSlashCommandMenuItems([
      slashItem('review', 'Review changes'),
    ]);

    fixture.textarea.value = '/re';
    fixture.textarea.setSelectionRange(3, 3);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const menuItem = fixture.container.querySelector<HTMLElement>('.opencodian-slash-command-menu-item');
    expect(menuItem?.textContent).toContain('/review');
  });
});
