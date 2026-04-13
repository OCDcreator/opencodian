import { t } from '../../../../src/i18n';
import {
  ComposerInputShellCoordinator,
  type ComposerInputShellCoordinatorHost,
} from '../../../../src/features/chat/services/ComposerInputShellCoordinator';

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

function createFixture() {
  let isStreaming = false;
  let isForegroundBusy = false;
  let inputContainerHeight = 88;
  let textareaScrollHeight = 0;

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
    addChosenFileContextToActiveTab: jest.fn().mockResolvedValue(undefined),
    mountSelectionControls: jest.fn(),
    mountContextUsageIndicator: jest.fn(),
    mountEffortSelector: jest.fn(),
    isActiveTabStreaming: jest.fn(() => isStreaming),
    cancelStreaming: jest.fn(),
    isTabForegroundBusy: jest.fn(() => isForegroundBusy),
    showProcessingBlockedNotice: jest.fn(),
    submitMessage: jest.fn().mockResolvedValue(undefined),
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
  };
}

describe('ComposerInputShellCoordinator', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    ResizeObserverMock.reset();
    animationFrameQueue = [];
    (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      animationFrameQueue.push(callback);
      return animationFrameQueue.length;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
    ResizeObserverMock.reset();
    if (originalResizeObserver) {
      (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
        originalResizeObserver;
    } else {
      delete (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    }
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
    expect(fixture.host.submitMessage).toHaveBeenCalledWith('Hello coordinator');
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
