/* eslint-disable max-lines -- This suite intentionally keeps shared DOM fixture helpers and coordinator interaction coverage together. */
import {
  clearPromptSuggestionSink,
  emitPromptSuggestionSessionChange,
  findPromptSuggestionScope,
  registerPromptSuggestionSink,
} from '../../../../src/core/agents/backend/promptSuggestionSink';
import type { SlashCommandMenuItem } from '../../../../src/core/config/slashCommandCatalog';
import {
  buildComposerInputSubmission,
  ComposerInputShellCoordinator,
  type ComposerInputShellCoordinatorHost,
} from '../../../../src/features/chat/services/ComposerInputShellCoordinator';
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
}

function slashItem(id: string, description: string, overrides: Partial<SlashCommandMenuItem> = {}): SlashCommandMenuItem {
  return { id, description, hasProjectOverride: false, runtimeAvailable: true, source: 'command', subtask: false, ...overrides };
}

const createdCoordinators: ComposerInputShellCoordinator[] = [];

function createFixture(options: {
  shouldMountAgentSelector?: boolean;
  composerAvailabilityState?: { kind: 'ready' | 'no-backend' | 'backend-offline'; title?: string; description?: string };
  composerCapabilityHint?: { text: string } | null;
  currentBackendSessionId?: string | null;
} = {}) {
  let isStreaming = false;
  let isForegroundBusy = false;
  let inputContainerHeight = 88;
  let textareaScrollHeight = 0;
  let slashCommandMenuItems: SlashCommandMenuItem[] = [];
  let slashCommandMenuError: Error | null = null;

  const host: jest.Mocked<ComposerInputShellCoordinatorHost> = {
    attachSessionTodo: jest.fn(),
    attachQuestionDock: jest.fn(),
    setContextRowElement: jest.fn(),
    setTooltipLabel: jest.fn((element, label, position) => {
      element.setAttribute('data-tooltip', label);
      if (position) {
        element.setAttribute('data-tooltip-position', position);
      }
    }),
    getInputPlaceholder: jest.fn(() => t('chat.input.placeholder')),
    getSlashCommandSkillMode: jest.fn(() => 'direct'),
    addChosenFileContextToActiveTab: jest.fn().mockResolvedValue(undefined),
    mountSelectionControls: jest.fn(),
    mountContextUsageIndicator: jest.fn(),
    mountEffortSelector: jest.fn(),
    shouldMountAgentSelector: jest.fn(() => options.shouldMountAgentSelector ?? true),
    isActiveTabStreaming: jest.fn(() => isStreaming),
    cancelStreaming: jest.fn(),
    isTabForegroundBusy: jest.fn(() => isForegroundBusy),
    showProcessingBlockedNotice: jest.fn(),
    getComposerInputMode: jest.fn(() => 'prompt'),
    submitMessage: jest.fn().mockResolvedValue(undefined),
    loadSlashCommandMenuItems: jest.fn().mockImplementation(async () => {
      if (slashCommandMenuError) {
        throw slashCommandMenuError;
      }

      return slashCommandMenuItems;
    }),
    setComposerStackHeight: jest.fn(),
    scheduleSettledScrollToBottomIfNeeded: jest.fn(),
    getComposerAvailabilityState: jest.fn(() => options.composerAvailabilityState ?? { kind: 'ready' }),
  };

  // Only mock getComposerCapabilityHint when explicitly provided in options.
  // When absent, the coordinator falls back to deriving the hint from shouldMountAgentSelector.
  if (options.composerCapabilityHint !== undefined) {
    host.getComposerCapabilityHint = jest.fn(() => options.composerCapabilityHint);
  }

  const container = document.createElement('div');
  Object.defineProperty(container, 'offsetHeight', {
    configurable: true,
    get: () => inputContainerHeight,
  });
  document.body.appendChild(container);

  const coordinator = new ComposerInputShellCoordinator(host);
  coordinator.build(container);
  createdCoordinators.push(coordinator);
  flushAnimationFrames();

  const textarea = container.querySelector<HTMLTextAreaElement>('.opencodian-input');
  if (!textarea) {
    throw new Error('textarea was not created');
  }
  Object.defineProperty(textarea, 'scrollHeight', {
    configurable: true,
    get: () => textareaScrollHeight,
  });

  const sendBtn = container.querySelector<HTMLButtonElement>('.opencodian-send-btn');
  const addContextBtn = container.querySelector<HTMLButtonElement>('.opencodian-composer-add-btn');
  if (!sendBtn || !addContextBtn) {
    throw new Error('composer buttons were not created');
  }

  return {
    coordinator,
    host,
    container,
    textarea,
    sendBtn,
    addContextBtn,
    setStreaming(nextValue: boolean) {
      isStreaming = nextValue;
    },
    setForegroundBusy(nextValue: boolean) {
      isForegroundBusy = nextValue;
    },
    setInputContainerHeight(nextValue: number) {
      inputContainerHeight = nextValue;
    },
    setTextareaScrollHeight(nextValue: number) {
      textareaScrollHeight = nextValue;
    },
    setSlashCommandMenuItems(nextValue: SlashCommandMenuItem[]) {
      slashCommandMenuItems = nextValue;
    },
    failSlashCommandMenuLoad(error: Error) {
      slashCommandMenuError = error;
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
  for (const coordinator of createdCoordinators) {
    try { coordinator.destroy(); } catch { /* ignore */ }
  }
  createdCoordinators.length = 0;
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

describe('ComposerInputShellCoordinator', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    installCoordinatorDomMocks();
  });

  afterEach(() => {
    restoreCoordinatorDomMocks(originalResizeObserver);
  });

  it('builds the composer shell and routes add-context and submit actions through the host', () => {
    const fixture = createFixture();

    fixture.setTextareaScrollHeight(96);
    fixture.textarea.value = '  Hello coordinator  ';
    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    flushAnimationFrames();
    fixture.addContextBtn.click();

    expect(fixture.coordinator.getTabBarSlotEl()).toBe(
      fixture.container.querySelector('.opencodian-tab-bar-slot--input'),
    );
    expect(fixture.host.attachSessionTodo).toHaveBeenCalledWith(fixture.container);
    expect(fixture.host.attachQuestionDock).toHaveBeenCalledWith(fixture.container);
    expect(fixture.host.mountSelectionControls).toHaveBeenCalledTimes(1);
    expect(fixture.host.mountContextUsageIndicator).toHaveBeenCalledTimes(1);
    expect(fixture.host.mountEffortSelector).toHaveBeenCalledTimes(1);
    expect(fixture.host.submitMessage).toHaveBeenCalledWith({
      kind: 'prompt',
      content: 'Hello coordinator',
    });
    expect(fixture.host.addChosenFileContextToActiveTab).toHaveBeenCalledTimes(1);
    expect(fixture.textarea.value).toBe('');
  });

  it('removes the empty toolbar when no selector, model, permission, context, or effort controls are mounted', () => {
    const fixture = createFixture({ shouldMountAgentSelector: false });

    expect(fixture.container.querySelector('.opencodian-input-toolbar')).toBeNull();
  });

  it('remounts toolbar controls when backend capabilities change', () => {
    const fixture = createFixture();

    expect(fixture.container.querySelector('.opencodian-agent-selector')).not.toBeNull();
    expect(fixture.container.querySelector('.opencodian-input-capability-hint')).toBeNull();

    fixture.host.shouldMountAgentSelector.mockReturnValue(false);
    fixture.coordinator.refreshToolbarControls();

    expect(fixture.container.querySelector('.opencodian-agent-selector')).toBeNull();
    expect(
      fixture.container.querySelector('.opencodian-input-capability-hint-text')?.textContent,
    ).toBe(t('chat.input.capabilityHint.json'));
    expect(fixture.host.mountSelectionControls).toHaveBeenCalledTimes(2);
    expect(fixture.host.mountContextUsageIndicator).toHaveBeenCalledTimes(2);
    expect(fixture.host.mountEffortSelector).toHaveBeenCalledTimes(2);
  });

  it('renders a disabled composer shell when no backend is enabled', () => {
    const fixture = createFixture({
      shouldMountAgentSelector: false,
      composerAvailabilityState: {
        kind: 'no-backend',
        title: 'No backend enabled',
        description: 'Enable at least one backend to start chatting.',
      },
    });

    expect(fixture.textarea.disabled).toBe(true);
    expect(fixture.sendBtn.disabled).toBe(true);
    expect(fixture.addContextBtn.disabled).toBe(true);
    expect(fixture.container.querySelector('.opencodian-composer-disabled-state')?.textContent)
      .toContain('No backend enabled');
  });

  it('refreshes composer availability state when locale-driven refresh reapplies texts', () => {
    const fixture = createFixture();

    fixture.host.getComposerAvailabilityState.mockReturnValue({
      kind: 'backend-offline',
      title: 'Backend unavailable',
      description: 'The current backend is enabled, but it is not connected right now.',
    });

    fixture.coordinator.applyLocaleTexts();

    expect(fixture.textarea.disabled).toBe(true);
    expect(fixture.sendBtn.disabled).toBe(true);
    expect(
      fixture.container.querySelector('.opencodian-composer-disabled-state')?.textContent,
    ).toContain('Backend unavailable');
  });

  it('keeps submit gating and send/stop affordance inside the coordinator', () => {
    const fixture = createFixture();

    fixture.textarea.value = 'busy';
    fixture.setForegroundBusy(true);
    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    flushAnimationFrames();

    expect(fixture.host.showProcessingBlockedNotice).toHaveBeenCalledTimes(1);
    expect(fixture.host.submitMessage).not.toHaveBeenCalled();

    fixture.setStreaming(true);
    fixture.coordinator.updateSendButtonState();
    fixture.sendBtn.click();

    expect(fixture.sendBtn.getAttribute('data-tooltip')).toBe(t('chat.input.stopStreaming'));
    expect(fixture.host.cancelStreaming).toHaveBeenCalledTimes(1);
  });

  it('parses slash and shell submissions into structured composer intents', () => {
    expect(buildComposerInputSubmission('  explain this  ')).toEqual({
      kind: 'prompt',
      content: 'explain this',
    });
    expect(buildComposerInputSubmission('/review --focus tests')).toEqual({
      kind: 'command',
      rawContent: '/review --focus tests',
      command: 'review',
      arguments: '--focus tests',
    });
    expect(buildComposerInputSubmission('  npm test  ', 'shell')).toEqual({
      kind: 'shell',
      rawContent: 'npm test',
      command: 'npm test',
    });
  });

  it('submits slash commands as structured command intents', () => {
    const fixture = createFixture();

    fixture.textarea.value = ' /review --focus tests ';
    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    flushAnimationFrames();

    expect(fixture.host.submitMessage).toHaveBeenCalledWith({
      kind: 'command',
      rawContent: '/review --focus tests',
      command: 'review',
      arguments: '--focus tests',
    });
  });

  it('submits shell commands when the composer mode is shell', () => {
    const fixture = createFixture();
    fixture.host.getComposerInputMode.mockReturnValue('shell');

    fixture.textarea.value = ' npm test ';
    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    flushAnimationFrames();

    expect(fixture.host.submitMessage).toHaveBeenCalledWith({
      kind: 'shell',
      rawContent: 'npm test',
      command: 'npm test',
    });
  });
  it('derives capability hint from shouldMountAgentSelector=false when host provides no explicit hint', () => {
    // shouldMountAgentSelector returning false means no Subagents capability → Claude Code backend
    const fixture = createFixture({ shouldMountAgentSelector: false });

    const hintEl = fixture.container.querySelector<HTMLElement>('.opencodian-input-capability-hint');
    expect(hintEl).toBeTruthy();
    expect(hintEl?.querySelector('.opencodian-input-capability-hint-text')?.textContent)
      .toBe(t('chat.input.capabilityHint.json'));
  });

  it('does not derive capability hint when shouldMountAgentSelector returns true', () => {
    // shouldMountAgentSelector returning true means Subagents capability → OpenCode or similar
    const fixture = createFixture({ shouldMountAgentSelector: true });

    const hintEl = fixture.container.querySelector<HTMLElement>('.opencodian-input-capability-hint');
    expect(hintEl).toBeNull();
  });

  it('explicit getComposerCapabilityHint takes priority over derived fallback', () => {
    const fixture = createFixture({
      shouldMountAgentSelector: false,
      composerCapabilityHint: null, // explicit null overrides fallback
    });

    const hintEl = fixture.container.querySelector<HTMLElement>('.opencodian-input-capability-hint');
    expect(hintEl).toBeNull();
  });

});

describe('ComposerInputShellCoordinator — slash menu core behaviors', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    installCoordinatorDomMocks();
  });

  afterEach(() => {
    restoreCoordinatorDomMocks(originalResizeObserver);
  });

  it('opens slash autocomplete from the merged menu catalog and applies the selected command', async () => {
    const fixture = createFixture();
    fixture.setSlashCommandMenuItems([
      slashItem('review', 'Review changes', { hasProjectOverride: true }),
      slashItem('refactor', 'Refactor touched files'),
    ]);

    fixture.textarea.value = '/re';
    fixture.textarea.setSelectionRange(3, 3);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const menuItems = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item'),
    );
    expect(fixture.host.loadSlashCommandMenuItems).toHaveBeenCalledTimes(1);
    expect(menuItems).toHaveLength(2);
    expect(menuItems[0]?.textContent).toContain('/review');
    expect(menuItems[1]?.textContent).toContain('/refactor');

    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushAsync();

    expect(fixture.textarea.value).toBe('/refactor ');
    expect(fixture.host.submitMessage).not.toHaveBeenCalled();
    expect(
      fixture.container.querySelector('.opencodian-slash-command-menu-item'),
    ).toBeNull();
  });

  it('renders every visible slash command when the query is empty', async () => {
    const fixture = createFixture();
    const commands = Array.from({ length: 12 }, (_, index) => {
      const commandNumber = String(index + 1).padStart(2, '0');
      return slashItem(`command-${commandNumber}`, `Command ${commandNumber}`);
    });
    fixture.setSlashCommandMenuItems(commands);

    fixture.textarea.value = '/';
    fixture.textarea.setSelectionRange(1, 1);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const menuItems = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item'),
    );
    expect(menuItems).toHaveLength(commands.length);
    expect(menuItems.at(-1)?.textContent).toContain('/command-12');
  });

  it('mounts slash autocomplete as an overlay above the composer shell', async () => {
    const fixture = createFixture();
    fixture.setSlashCommandMenuItems([
      slashItem('review', 'Review changes'),
    ]);

    fixture.textarea.value = '/';
    fixture.textarea.setSelectionRange(1, 1);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const shell = fixture.container.querySelector('.opencodian-composer-shell');
    const content = fixture.container.querySelector('.opencodian-composer-content');
    const menu = fixture.container.querySelector('.opencodian-slash-command-menu');

    expect(menu?.parentElement).toBe(shell);
    expect(menu?.parentElement).not.toBe(content);
  });

  it('closes slash autocomplete after the command token is finished', async () => {
    const fixture = createFixture();
    fixture.setSlashCommandMenuItems([
      slashItem('review', 'Review changes'),
    ]);

    fixture.textarea.value = '/review';
    fixture.textarea.setSelectionRange(7, 7);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(
      fixture.container.querySelector('.opencodian-slash-command-menu-item'),
    ).not.toBeNull();

    fixture.textarea.value = '/review now';
    fixture.textarea.setSelectionRange(11, 11);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(
      fixture.container.querySelector('.opencodian-slash-command-menu-item'),
    ).toBeNull();
  });

  it('shows only skill suggestions for a slash trigger mid-sentence after whitespace', async () => {
    const fixture = createFixture();
    fixture.setSlashCommandMenuItems([
      slashItem('review', 'Review changes'),
      slashItem('analyze', 'Analyze context', { source: 'skill' }),
    ]);

    fixture.textarea.value = 'some text /an';
    fixture.textarea.setSelectionRange(13, 13);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const menuItems = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item'),
    );
    expect(menuItems).toHaveLength(1);
    expect(menuItems[0]?.textContent).toContain('/analyze');
    expect(menuItems[0]?.textContent).not.toContain('/review');
  });

  it('does not trigger slash menu for // at start of input', async () => {
    const fixture = createFixture();
    fixture.setSlashCommandMenuItems([
      slashItem('review', 'Review changes'),
    ]);

    fixture.textarea.value = '//re';
    fixture.textarea.setSelectionRange(4, 4);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    expect(
      fixture.container.querySelector('.opencodian-slash-command-menu-item'),
    ).toBeNull();
  });

  it('syncs textarea height and composer layout metrics, then tears them down on destroy', () => {
    const fixture = createFixture();
    const resizeObserver = ResizeObserverMock.instances[0];

    fixture.setTextareaScrollHeight(420);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    flushAnimationFrames();
    fixture.setInputContainerHeight(132);
    resizeObserver?.trigger();
    flushAnimationFrames();
    fixture.coordinator.destroy();

    expect(fixture.textarea.style.height).toBe('240px');
    expect(fixture.textarea.style.overflowY).toBe('auto');
    expect(fixture.host.setComposerStackHeight).toHaveBeenCalledWith(88);
    expect(fixture.host.setComposerStackHeight).toHaveBeenCalledWith(132);
    expect(fixture.host.scheduleSettledScrollToBottomIfNeeded).toHaveBeenCalled();
    expect(resizeObserver?.disconnect).toHaveBeenCalledTimes(1);
    expect(fixture.host.setContextRowElement).toHaveBeenLastCalledWith(null);
  });
  it('derives capability hint from shouldMountAgentSelector=false when host provides no explicit hint', () => {
    // shouldMountAgentSelector returning false means no Subagents capability → Claude Code backend
    const fixture = createFixture({ shouldMountAgentSelector: false });

    const hintEl = fixture.container.querySelector<HTMLElement>('.opencodian-input-capability-hint');
    expect(hintEl).toBeTruthy();
    expect(hintEl?.querySelector('.opencodian-input-capability-hint-text')?.textContent)
      .toBe(t('chat.input.capabilityHint.json'));
  });

  it('does not derive capability hint when shouldMountAgentSelector returns true', () => {
    // shouldMountAgentSelector returning true means Subagents capability → OpenCode or similar
    const fixture = createFixture({ shouldMountAgentSelector: true });

    const hintEl = fixture.container.querySelector<HTMLElement>('.opencodian-input-capability-hint');
    expect(hintEl).toBeNull();
  });

  it('explicit getComposerCapabilityHint takes priority over derived fallback', () => {
    const fixture = createFixture({
      shouldMountAgentSelector: false,
      composerCapabilityHint: null, // explicit null overrides fallback
    });

    const hintEl = fixture.container.querySelector<HTMLElement>('.opencodian-input-capability-hint');
    expect(hintEl).toBeNull();
  });

});

describe('ComposerInputShellCoordinator — fuzzy matching and dropdown UI', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    installCoordinatorDomMocks();
  });

  afterEach(() => {
    restoreCoordinatorDomMocks(originalResizeObserver);
  });

  it('uses fuzzy matching to find commands by non-contiguous characters', async () => {
    const fixture = createFixture();
    fixture.setSlashCommandMenuItems([
      slashItem('clear', 'Clear conversation'),
      slashItem('commit', 'Create commit'),
      slashItem('review', 'Review code'),
    ]);

    fixture.textarea.value = '/cr';
    fixture.textarea.setSelectionRange(3, 3);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const menuItems = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item'),
    );
    const itemTexts = menuItems.map((el) => el.textContent);
    expect(itemTexts.some((t) => t?.includes('/clear'))).toBe(true);
    expect(itemTexts.some((t) => t?.includes('/commit'))).toBe(true);
    expect(itemTexts.some((t) => t?.includes('/review'))).toBe(false);
  });

  it('renders source badges on menu items', async () => {
    const fixture = createFixture();
    fixture.setSlashCommandMenuItems([
      slashItem('review', 'Review changes', { hasProjectOverride: true }),
      slashItem('build-mcp-server', 'Build an MCP server', { source: 'skill' }),
    ]);

    fixture.textarea.value = '/';
    fixture.textarea.setSelectionRange(1, 1);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const badges = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-badge'),
    );
    expect(badges.length).toBeGreaterThanOrEqual(2);
  });

  it('renders neutral menu options with full descriptions available for clipped UI', async () => {
    const fixture = createFixture();
    fixture.setSlashCommandMenuItems([
      slashItem('build-mcp-server', 'This skill should be used when the user asks to build an MCP server, create an MCP integration, wrap an API for Claude, or expose tools to Claude.'),
    ]);

    fixture.textarea.value = '/';
    fixture.textarea.setSelectionRange(1, 1);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const menuItem = fixture.container.querySelector<HTMLElement>('.opencodian-slash-command-menu-item');
    const description = fixture.container.querySelector<HTMLElement>('.opencodian-slash-command-menu-description');

    expect(menuItem?.tagName).toBe('DIV');
    expect(menuItem?.getAttribute('role')).toBe('option');
    expect(menuItem?.textContent).toContain('This skill should be used');
    expect(description?.getAttribute('title')).toContain('This skill should be used');
  });

  it('highlights items on mouseenter and selects on click', async () => {
    const fixture = createFixture();
    fixture.setSlashCommandMenuItems([
      slashItem('review', 'Review changes'),
      slashItem('refactor', 'Refactor touched files'),
    ]);

    fixture.textarea.value = '/';
    fixture.textarea.setSelectionRange(1, 1);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const menuItems = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item'),
    );
    expect(menuItems).toHaveLength(2);

    const secondItem = menuItems[1];
    secondItem?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    const selectedItems = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item.is-selected'),
    );
    expect(selectedItems).toHaveLength(1);
    expect(selectedItems[0]?.textContent).toContain('/refactor');

    secondItem?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    secondItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsync();

    expect(fixture.textarea.value).toBe('/refactor ');
  });

  it('wraps selection around when navigating past the last item', async () => {
    const fixture = createFixture();
    fixture.setSlashCommandMenuItems([
      slashItem('review', 'Review changes'),
      slashItem('refactor', 'Refactor touched files'),
    ]);

    fixture.textarea.value = '/';
    fixture.textarea.setSelectionRange(1, 1);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await flushAsync();

    const selectedItems = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item.is-selected'),
    );
    expect(selectedItems).toHaveLength(1);
    expect(selectedItems[0]?.textContent).toContain('/review');
  });

  it('keeps slash menu visible with an empty-catalog state when no commands are available', async () => {
    const fixture = createFixture();
    fixture.setSlashCommandMenuItems([]);

    fixture.textarea.value = '/';
    fixture.textarea.setSelectionRange(1, 1);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const menu = fixture.container.querySelector<HTMLElement>('.opencodian-slash-command-menu');
    const state = fixture.container.querySelector<HTMLElement>('.opencodian-slash-command-menu-state');

    expect(menu?.classList.contains('is-hidden')).toBe(false);
    expect(state?.textContent).toContain('No slash commands available');
    expect(
      fixture.container.querySelector('.opencodian-slash-command-menu-item'),
    ).toBeNull();
  });

  it('keeps slash menu visible with a load-failed state when command catalog loading fails', async () => {
    const fixture = createFixture();
    fixture.failSlashCommandMenuLoad(new Error('connection refused'));

    fixture.textarea.value = '/';
    fixture.textarea.setSelectionRange(1, 1);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const menu = fixture.container.querySelector<HTMLElement>('.opencodian-slash-command-menu');
    const state = fixture.container.querySelector<HTMLElement>('.opencodian-slash-command-menu-state');

    expect(menu?.classList.contains('is-hidden')).toBe(false);
    expect(state?.textContent).toContain('Could not load slash commands');
    expect(
      fixture.container.querySelector('.opencodian-slash-command-menu-item'),
    ).toBeNull();
  });

  it('renders the composer capability hint when host returns a hint', () => {
    const fixture = createFixture({
      composerCapabilityHint: { text: '/json — structured output' },
    });

    const hintEl = fixture.container.querySelector<HTMLElement>('.opencodian-input-capability-hint');
    expect(hintEl).toBeTruthy();
    expect(hintEl?.querySelector('.opencodian-input-capability-hint-text')?.textContent)
      .toBe('/json — structured output');
  });

  it('does not render the composer capability hint when host returns null', () => {
    const fixture = createFixture({ composerCapabilityHint: null });

    const hintEl = fixture.container.querySelector<HTMLElement>('.opencodian-input-capability-hint');
    expect(hintEl).toBeNull();
  });

  it('removes the composer capability hint when host switches from hint to null via locale refresh', () => {
    const fixture = createFixture({
      composerCapabilityHint: { text: '/json — structured output' },
    });

    let hintEl = fixture.container.querySelector<HTMLElement>('.opencodian-input-capability-hint');
    expect(hintEl).toBeTruthy();

    fixture.host.getComposerCapabilityHint.mockReturnValue(null);
    fixture.coordinator.applyLocaleTexts();

    hintEl = fixture.container.querySelector<HTMLElement>('.opencodian-input-capability-hint');
    expect(hintEl).toBeNull();
  });

  it('updates the composer capability hint text when host returns a different hint', () => {
    const fixture = createFixture({
      composerCapabilityHint: { text: '/json — structured output' },
    });

    let hintText = fixture.container.querySelector<HTMLElement>('.opencodian-input-capability-hint-text');
    expect(hintText?.textContent).toBe('/json — structured output');

    fixture.host.getComposerCapabilityHint.mockReturnValue({ text: '/json — 结构化输出' });
    fixture.coordinator.applyLocaleTexts();

    // Re-query after applyLocaleTexts() empties and recreates the span element.
    hintText = fixture.container.querySelector<HTMLElement>('.opencodian-input-capability-hint-text');
    expect(hintText?.textContent).toBe('/json — 结构化输出');
  });
  it('derives capability hint from shouldMountAgentSelector=false when host provides no explicit hint', () => {
    // shouldMountAgentSelector returning false means no Subagents capability → Claude Code backend
    const fixture = createFixture({ shouldMountAgentSelector: false });

    const hintEl = fixture.container.querySelector<HTMLElement>('.opencodian-input-capability-hint');
    expect(hintEl).toBeTruthy();
    expect(hintEl?.querySelector('.opencodian-input-capability-hint-text')?.textContent)
      .toBe(t('chat.input.capabilityHint.json'));
  });

  it('does not derive capability hint when shouldMountAgentSelector returns true', () => {
    // shouldMountAgentSelector returning true means Subagents capability → OpenCode or similar
    const fixture = createFixture({ shouldMountAgentSelector: true });

    const hintEl = fixture.container.querySelector<HTMLElement>('.opencodian-input-capability-hint');
    expect(hintEl).toBeNull();
  });

  it('explicit getComposerCapabilityHint takes priority over derived fallback', () => {
    const fixture = createFixture({
      shouldMountAgentSelector: false,
      composerCapabilityHint: null, // explicit null overrides fallback
    });

    const hintEl = fixture.container.querySelector<HTMLElement>('.opencodian-input-capability-hint');
    expect(hintEl).toBeNull();
  });

});

describe('ComposerInputShellCoordinator — prompt suggestion lifecycle (channel bus)', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    installCoordinatorDomMocks();
    clearPromptSuggestionSink();
  });

  afterEach(() => {
    restoreCoordinatorDomMocks(originalResizeObserver);
    clearPromptSuggestionSink();
  });

  it('stamps a channel scope on the container during build', () => {
    const fixture = createFixture();

    const channelId = findPromptSuggestionScope(fixture.container);
    expect(channelId).toBeDefined();
    expect(channelId).toMatch(/^ps-ch-/);
  });

  it('wires prompt suggestion service and receives adapter callbacks via channel bus', () => {
    const mockSink = {
      onPostResultChunk: jest.fn(() => jest.fn()),
    };
    registerPromptSuggestionSink(mockSink);

    const fixture = createFixture();

    // Coordinator should have subscribed to the sink
    expect(mockSink.onPostResultChunk).toHaveBeenCalledTimes(1);

    // Simulate receiving a suggestion
    const callback = mockSink.onPostResultChunk.mock.calls[0][0];
    callback({
      type: 'prompt_suggestion',
      suggestion: 'Write tests',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });

    // Suggestion is stored but not visible until session is emitted through channel bus
    expect(fixture.container.querySelector('.opencodian-suggestion-chip')).toBeNull();

    // Discover the channel and emit session change through the bus
    const channelId = findPromptSuggestionScope(fixture.container);
    emitPromptSuggestionSessionChange('sess-1', channelId);

    // Now the chip is visible
    expect(fixture.container.querySelector('.opencodian-suggestion-chip')).not.toBeNull();
  });

  it('suggestion can arrive before session writeback, then becomes visible after emission', () => {
    const mockSink = {
      onPostResultChunk: jest.fn(() => jest.fn()),
    };
    registerPromptSuggestionSink(mockSink);

    const fixture = createFixture();

    const callback = mockSink.onPostResultChunk.mock.calls[0][0];

    // Suggestion arrives before backend session id is known
    callback({
      type: 'prompt_suggestion',
      suggestion: 'Write tests',
      uuid: 'ps-1',
      sessionId: 'sdk-sess-1',
    });

    // Not visible yet
    expect(fixture.container.querySelector('.opencodian-suggestion-chip')).toBeNull();

    // Emit session through channel bus
    const channelId = findPromptSuggestionScope(fixture.container);
    emitPromptSuggestionSessionChange('sdk-sess-1', channelId);

    expect(fixture.container.querySelector('.opencodian-suggestion-chip')).not.toBeNull();
  });

  it('clears active suggestion on new user turn', () => {
    const mockSink = {
      onPostResultChunk: jest.fn(() => jest.fn()),
    };
    registerPromptSuggestionSink(mockSink);

    const fixture = createFixture();
    const callback = mockSink.onPostResultChunk.mock.calls[0][0];

    callback({
      type: 'prompt_suggestion',
      suggestion: 'Write tests',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });
    const channelId = findPromptSuggestionScope(fixture.container);
    emitPromptSuggestionSessionChange('sess-1', channelId);
    expect(fixture.container.querySelector('.opencodian-suggestion-chip')).not.toBeNull();

    // Submit a new message — suggestion should clear
    fixture.textarea.value = 'new message';
    fixture.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    flushAnimationFrames();

    expect(fixture.container.querySelector('.opencodian-suggestion-chip')).toBeNull();
  });

  it('clears prompt suggestion state on destroy and removes channel scope', () => {
    const mockSink = {
      onPostResultChunk: jest.fn(() => jest.fn()),
    };
    registerPromptSuggestionSink(mockSink);

    const fixture = createFixture();
    const callback = mockSink.onPostResultChunk.mock.calls[0][0];

    callback({
      type: 'prompt_suggestion',
      suggestion: 'Write tests',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });
    const channelId = findPromptSuggestionScope(fixture.container);
    emitPromptSuggestionSessionChange('sess-1', channelId);
    expect(fixture.container.querySelector('.opencodian-suggestion-chip')).not.toBeNull();

    fixture.coordinator.destroy();

    expect(fixture.container.querySelector('.opencodian-suggestion-chip')).toBeNull();
    // Scope should be removed from container
    expect(findPromptSuggestionScope(fixture.container)).toBeUndefined();
  });

  it('handles sink-null by clearing all suggestions', () => {
    const mockSink = {
      onPostResultChunk: jest.fn(() => jest.fn()),
    };
    registerPromptSuggestionSink(mockSink);

    const fixture = createFixture();
    const callback = mockSink.onPostResultChunk.mock.calls[0][0];

    callback({
      type: 'prompt_suggestion',
      suggestion: 'Write tests',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });
    const channelId = findPromptSuggestionScope(fixture.container);
    emitPromptSuggestionSessionChange('sess-1', channelId);
    expect(fixture.container.querySelector('.opencodian-suggestion-chip')).not.toBeNull();

    // Simulate backend stop
    clearPromptSuggestionSink();
    expect(fixture.container.querySelector('.opencodian-suggestion-chip')).toBeNull();
  });

  it('does not auto-send when clicking suggestion chip', () => {
    const mockSink = {
      onPostResultChunk: jest.fn(() => jest.fn()),
    };
    registerPromptSuggestionSink(mockSink);

    const fixture = createFixture();
    const callback = mockSink.onPostResultChunk.mock.calls[0][0];

    callback({
      type: 'prompt_suggestion',
      suggestion: 'Refactor this code',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });
    const channelId = findPromptSuggestionScope(fixture.container);
    emitPromptSuggestionSessionChange('sess-1', channelId);

    const chip = fixture.container.querySelector('.opencodian-suggestion-chip') as HTMLElement;
    expect(chip).not.toBeNull();

    // Click the chip
    chip.click();

    // Textarea should contain the suggestion text
    expect(fixture.textarea.value).toBe('Refactor this code');
    // submitMessage should NOT have been called
    expect(fixture.host.submitMessage).not.toHaveBeenCalled();
  });

  it('hides chip on session change to different session', () => {
    const mockSink = {
      onPostResultChunk: jest.fn(() => jest.fn()),
    };
    registerPromptSuggestionSink(mockSink);

    const fixture = createFixture();
    const callback = mockSink.onPostResultChunk.mock.calls[0][0];

    callback({
      type: 'prompt_suggestion',
      suggestion: 'Write tests',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });
    const channelId = findPromptSuggestionScope(fixture.container);
    emitPromptSuggestionSessionChange('sess-1', channelId);
    expect(fixture.container.querySelector('.opencodian-suggestion-chip')).not.toBeNull();

    // Change session
    emitPromptSuggestionSessionChange('sess-2', channelId);

    expect(fixture.container.querySelector('.opencodian-suggestion-chip')).toBeNull();
  });

  it('does not render chip when suggestion is for a different session', () => {
    const mockSink = {
      onPostResultChunk: jest.fn(() => jest.fn()),
    };
    registerPromptSuggestionSink(mockSink);

    const fixture = createFixture();
    const callback = mockSink.onPostResultChunk.mock.calls[0][0];

    callback({
      type: 'prompt_suggestion',
      suggestion: 'Write tests',
      uuid: 'ps-1',
      sessionId: 'sess-1',
    });
    // Sync to a DIFFERENT session
    const channelId = findPromptSuggestionScope(fixture.container);
    emitPromptSuggestionSessionChange('sess-2', channelId);

    expect(fixture.container.querySelector('.opencodian-suggestion-chip')).toBeNull();
  });
});
