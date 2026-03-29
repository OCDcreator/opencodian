import type { App } from 'obsidian';

import { OpenCodianSettingTab } from '../../../../src/features/settings/OpenCodianSettings';
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

describe('OpenCodianSettingTab scroll restore logging', () => {
  const originalMutationObserver = globalThis.MutationObserver;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

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
    const plugin = {
      settings: {
        settingsPanelScrollTop: 0,
      },
      scheduleSettingsUiStateSave: jest.fn(),
    } as unknown as ConstructorParameters<typeof OpenCodianSettingTab>[1];
    const tab = new OpenCodianSettingTab({} as App, plugin);
    const scrollContainer = document.createElement('div');
    const scrollState = installClampedScrollState(scrollContainer, {
      clientHeight: 200,
      scrollHeight: 400,
    });

    document.body.appendChild(scrollContainer);
    scrollContainer.appendChild(tab.containerEl);

    (tab as unknown as {
      restoreSettingsPanelScrollPosition: (scrollTop: number, scrollContainer: HTMLElement) => void;
      settingsPanelRestoreObserver: MutationObserver | null;
      settingsPanelRestoreTimeoutIds: number[];
    }).restoreSettingsPanelScrollPosition(400, scrollContainer);

    jest.advanceTimersByTime(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(scrollContainer.scrollTop).toBe(200);

    scrollState.setScrollHeight(800);
    MutationObserverMock.instances[0]?.trigger();
    jest.advanceTimersByTime(1);

    expect(scrollContainer.scrollTop).toBe(400);
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
      (tab as unknown as {
        settingsPanelRestoreObserver: MutationObserver | null;
        settingsPanelRestoreTimeoutIds: number[];
      }).settingsPanelRestoreObserver,
    ).toBeNull();
    expect(
      (tab as unknown as {
        settingsPanelRestoreTimeoutIds: number[];
      }).settingsPanelRestoreTimeoutIds,
    ).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);

    jest.advanceTimersByTime(1500);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
