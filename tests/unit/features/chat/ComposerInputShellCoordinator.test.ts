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

function createFixture() {
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
  };

  const container = document.createElement('div');
  Object.defineProperty(container, 'offsetHeight', {
    configurable: true,
    get: () => inputContainerHeight,
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

  it('detects slash trigger mid-sentence after whitespace', async () => {
    const fixture = createFixture();
    fixture.setSlashCommandMenuItems([
      slashItem('review', 'Review changes'),
    ]);

    fixture.textarea.value = 'some text /re';
    fixture.textarea.setSelectionRange(13, 13);
    fixture.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsync();

    const menuItems = Array.from(
      fixture.container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item'),
    );
    expect(menuItems).toHaveLength(1);
    expect(menuItems[0]?.textContent).toContain('/review');
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
});
