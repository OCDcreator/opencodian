import { SettingsSectionCoordinator } from '../../../../src/features/settings/SettingsSectionCoordinator';
import { setDebugLoggingEnabled } from '../../../../src/shared';

class MutationObserverMock {
  static instances: MutationObserverMock[] = [];

  readonly disconnect = jest.fn();
  readonly observe = jest.fn();
  private readonly callback: MutationCallback;

  constructor(callback: MutationCallback) {
    this.callback = callback;
    MutationObserverMock.instances.push(this);
  }

  trigger(): void {
    this.callback([], this as unknown as MutationObserver);
  }

  static reset(): void {
    MutationObserverMock.instances = [];
  }
}

function installClampedScrollState(element: HTMLElement, options: { clientHeight: number; scrollHeight: number }) {
  let currentScrollHeight = options.scrollHeight;
  let currentScrollTop = 0;

  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => options.clientHeight,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => currentScrollHeight,
  });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: (value: number) => {
      const maxScrollTop = Math.max(0, currentScrollHeight - options.clientHeight);
      currentScrollTop = Math.max(0, Math.min(value, maxScrollTop));
    },
  });

  return {
    setScrollHeight(nextScrollHeight: number) {
      currentScrollHeight = nextScrollHeight;
      const maxScrollTop = Math.max(0, currentScrollHeight - options.clientHeight);
      currentScrollTop = Math.min(currentScrollTop, maxScrollTop);
    },
  };
}

describe('SettingsSectionCoordinator scroll restore logging', () => {
  const originalMutationObserver = globalThis.MutationObserver;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  function createCoordinator(savedScrollTop = 0) {
    const state = {
      settingsPanelScrollTop: savedScrollTop,
    };
    const containerEl = document.createElement('div');
    const scheduleScrollStateSave = jest.fn();
    const coordinator = new SettingsSectionCoordinator({
      containerEl,
      getSavedScrollTop: () => state.settingsPanelScrollTop,
      setSavedScrollTop: (scrollTop) => {
        state.settingsPanelScrollTop = scrollTop;
      },
      scheduleScrollStateSave,
    });

    return {
      coordinator,
      containerEl,
      scheduleScrollStateSave,
      state,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    MutationObserverMock.reset();
    globalThis.MutationObserver = MutationObserverMock as unknown as typeof MutationObserver;

    let nextFrameId = 0;
    const frameTimeouts = new Map<number, number>();

    window.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      const frameId = ++nextFrameId;
      const timeoutId = window.setTimeout(() => {
        frameTimeouts.delete(frameId);
        callback(Date.now());
      }, 0);
      frameTimeouts.set(frameId, timeoutId);
      return frameId;
    }) as typeof window.requestAnimationFrame;

    window.cancelAnimationFrame = ((frameId: number): void => {
      const timeoutId = frameTimeouts.get(frameId);
      if (timeoutId === undefined) {
        return;
      }

      window.clearTimeout(timeoutId);
      frameTimeouts.delete(frameId);
    }) as typeof window.cancelAnimationFrame;

    setDebugLoggingEnabled(true);
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    setDebugLoggingEnabled(false);
    globalThis.MutationObserver = originalMutationObserver;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    document.body.innerHTML = '';
  });

  it('logs a single restore success and clears pending work after mutation succeeds', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { coordinator, containerEl } = createCoordinator();
    const scrollContainer = document.createElement('div');
    const scrollState = installClampedScrollState(scrollContainer, {
      clientHeight: 200,
      scrollHeight: 400,
    });

    document.body.appendChild(scrollContainer);
    scrollContainer.appendChild(containerEl);

    (coordinator as unknown as {
      restoreScrollPosition: (scrollTop: number, scrollContainer: HTMLElement) => void;
      settingsPanelRestoreObserver: MutationObserver | null;
      settingsPanelRestoreTimeoutIds: number[];
    }).restoreScrollPosition(400, scrollContainer);

    jest.advanceTimersByTime(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(scrollContainer.scrollTop).toBe(200);

    scrollState.setScrollHeight(800);
    MutationObserverMock.instances[0]?.trigger();
    jest.advanceTimersByTime(1);

    expect(scrollContainer.scrollTop).toBe(400);
    expect(logSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(200);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]?.[0]).toContain('[OpenCodianSettings] Settings scroll restored');
    expect(logSpy.mock.calls[0]?.[1]).toMatchObject({
      reason: 'mutation',
      attempts: 2,
      elapsedMs: expect.any(Number),
      targetScrollTop: 400,
      restoredScrollTop: 400,
    });

    expect(
      (coordinator as unknown as {
        settingsPanelRestoreObserver: MutationObserver | null;
        settingsPanelRestoreTimeoutIds: number[];
      }).settingsPanelRestoreObserver,
    ).toBeNull();
    expect(
      (coordinator as unknown as {
        settingsPanelRestoreTimeoutIds: number[];
      }).settingsPanelRestoreTimeoutIds,
    ).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);

    jest.advanceTimersByTime(1500);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('skips restore observers and timers when the requested scroll position is already at the top', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { coordinator, containerEl } = createCoordinator();
    const scrollContainer = document.createElement('div');

    installClampedScrollState(scrollContainer, {
      clientHeight: 200,
      scrollHeight: 800,
    });
    scrollContainer.scrollTop = 160;

    document.body.appendChild(scrollContainer);
    scrollContainer.appendChild(containerEl);

    (coordinator as unknown as {
      restoreScrollPosition: (scrollTop: number, scrollContainer: HTMLElement) => void;
      settingsPanelRestoreObserver: MutationObserver | null;
      settingsPanelRestoreTimeoutIds: number[];
    }).restoreScrollPosition(0, scrollContainer);

    expect(scrollContainer.scrollTop).toBe(0);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]?.[1]).toMatchObject({
      reason: 'already-at-top',
      attempts: 0,
      targetScrollTop: 0,
      restoredScrollTop: 0,
    });
    expect(MutationObserverMock.instances).toHaveLength(0);
    expect(
      (coordinator as unknown as {
        settingsPanelRestoreObserver: MutationObserver | null;
        settingsPanelRestoreTimeoutIds: number[];
      }).settingsPanelRestoreObserver,
    ).toBeNull();
    expect(
      (coordinator as unknown as {
        settingsPanelRestoreTimeoutIds: number[];
      }).settingsPanelRestoreTimeoutIds,
    ).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('skips deferred DOM tracking when the initial restore reaches the target immediately', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { coordinator, containerEl } = createCoordinator();
    const scrollContainer = document.createElement('div');

    installClampedScrollState(scrollContainer, {
      clientHeight: 200,
      scrollHeight: 800,
    });

    document.body.appendChild(scrollContainer);
    scrollContainer.appendChild(containerEl);

    (coordinator as unknown as {
      restoreScrollPosition: (scrollTop: number, scrollContainer: HTMLElement) => void;
      settingsPanelRestoreObserver: MutationObserver | null;
      settingsPanelRestoreTimeoutIds: number[];
    }).restoreScrollPosition(400, scrollContainer);

    jest.advanceTimersByTime(1);
    expect(scrollContainer.scrollTop).toBe(400);
    expect(MutationObserverMock.instances).toHaveLength(0);
    expect(
      (coordinator as unknown as {
        settingsPanelRestoreObserver: MutationObserver | null;
        settingsPanelRestoreTimeoutIds: number[];
      }).settingsPanelRestoreObserver,
    ).toBeNull();
    expect(
      (coordinator as unknown as {
        settingsPanelRestoreTimeoutIds: number[];
      }).settingsPanelRestoreTimeoutIds,
    ).toHaveLength(0);

    jest.advanceTimersByTime(220);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]?.[1]).toMatchObject({
      reason: 'animation-frame',
      attempts: 1,
      targetScrollTop: 400,
      restoredScrollTop: 400,
    });
  });

  it('reapplies the target scroll position when the panel drifts before settling', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { coordinator, containerEl } = createCoordinator();
    const scrollContainer = document.createElement('div');

    installClampedScrollState(scrollContainer, {
      clientHeight: 200,
      scrollHeight: 800,
    });

    document.body.appendChild(scrollContainer);
    scrollContainer.appendChild(containerEl);

    (coordinator as unknown as {
      restoreScrollPosition: (scrollTop: number, scrollContainer: HTMLElement) => void;
    }).restoreScrollPosition(400, scrollContainer);

    jest.advanceTimersByTime(1);
    expect(scrollContainer.scrollTop).toBe(400);
    expect(logSpy).not.toHaveBeenCalled();

    scrollContainer.scrollTop = 520;
    scrollContainer.dispatchEvent(new Event('scroll'));
    jest.advanceTimersByTime(1);

    expect(scrollContainer.scrollTop).toBe(400);
    expect(logSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(220);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]?.[1]).toMatchObject({
      reason: 'scroll',
      attempts: 2,
      targetScrollTop: 400,
      restoredScrollTop: 400,
    });
  });

  it('builds quick-nav buttons from registered section headings', () => {
    const { coordinator, containerEl } = createCoordinator();
    document.body.appendChild(containerEl);

    coordinator.beginDisplay('Settings');
    const serverHeadingEl = coordinator.createSectionHeading(containerEl, {
      title: 'Server',
      tooltip: 'Server settings',
    });
    const modelHeadingEl = coordinator.createSectionHeading(containerEl, {
      title: 'Model',
      tooltip: 'Model settings',
    });
    const serverScrollIntoView = jest.fn();
    const modelScrollIntoView = jest.fn();
    serverHeadingEl.scrollIntoView = serverScrollIntoView as typeof serverHeadingEl.scrollIntoView;
    modelHeadingEl.scrollIntoView = modelScrollIntoView as typeof modelHeadingEl.scrollIntoView;

    coordinator.finishDisplay();

    const buttons = Array.from(
      containerEl.querySelectorAll<HTMLButtonElement>('.opencodian-settings-quick-nav-btn'),
    );
    expect(buttons.map((button) => button.textContent)).toEqual(['Server', 'Model']);
    expect(buttons[0]?.dataset.tooltipAlign).toBe('left');
    expect(buttons[1]?.dataset.tooltipAlign).toBe('left');

    buttons[1]?.click();

    expect(serverScrollIntoView).not.toHaveBeenCalled();
    expect(modelScrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });
});
