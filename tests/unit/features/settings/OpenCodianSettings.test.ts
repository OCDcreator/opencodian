/* eslint-disable max-lines, max-lines-per-function -- This file covers both SettingsSectionCoordinator integration and OpenCodianSettingTab layout shell behavior; keeping those regression cases together makes the settings-surface contract easier to review. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianSettingTab } from '../../../../src/features/settings/OpenCodianSettings';
import { SettingsPluginSection } from '../../../../src/features/settings/SettingsPluginSection';
import { SettingsSectionCoordinator } from '../../../../src/features/settings/SettingsSectionCoordinator';
import { setLocale } from '../../../../src/i18n';
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

function registerScrollRestoreSuiteHooks() {
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
}

describe('SettingsSectionCoordinator scroll restore logging', () => {
  registerScrollRestoreSuiteHooks();

  it('captures the current settings scroll before rebuilding the panel', () => {
    const { coordinator, containerEl, state } = createCoordinator();
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'vertical-tab-content-container';
    installClampedScrollState(scrollContainer, {
      clientHeight: 200,
      scrollHeight: 900,
    });
    document.body.appendChild(scrollContainer);
    scrollContainer.appendChild(containerEl);

    coordinator.beginDisplay('Settings');
    coordinator.finishDisplay();
    jest.advanceTimersByTime(1);

    scrollContainer.scrollTop = 360;
    coordinator.beginDisplay('Settings');

    expect(state.settingsPanelScrollTop).toBe(360);
  });

  it('keeps the settings panel height stable while rebuilding visible content', () => {
    const { coordinator, containerEl } = createCoordinator();
    Object.defineProperty(containerEl, 'offsetHeight', {
      configurable: true,
      value: 720,
    });
    containerEl.style.minHeight = '12px';
    containerEl.createDiv({ text: 'old settings content' });

    coordinator.beginDisplay('Settings');

    expect(containerEl.style.minHeight).toBe('720px');

    coordinator.finishDisplay();
    jest.advanceTimersByTime(1);

    expect(containerEl.style.minHeight).toBe('12px');
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
});

describe('SettingsSectionCoordinator quick nav', () => {
  it('builds quick-nav buttons from registered section headings', () => {
    const { coordinator, containerEl } = createCoordinator();
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'vertical-tab-content-container';
    let scrollTop = 320;
    const scrollTo = jest.fn(({ top }: { top: number }) => {
      scrollTop = top;
    });

    Object.defineProperty(scrollContainer, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    Object.defineProperty(scrollContainer, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 100,
        right: 800,
        bottom: 700,
        width: 800,
        height: 600,
        x: 0,
        y: 100,
        toJSON: () => '',
      }),
    });

    document.body.appendChild(scrollContainer);
    scrollContainer.appendChild(containerEl);

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

    const quickNavEl = containerEl.querySelector<HTMLElement>('.opencodian-settings-quick-nav');
    Object.defineProperty(quickNavEl as HTMLElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 100,
        right: 800,
        bottom: 220,
        width: 800,
        height: 120,
        x: 0,
        y: 100,
        toJSON: () => '',
      }),
    });
    Object.defineProperty(modelHeadingEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 560,
        right: 800,
        bottom: 596,
        width: 800,
        height: 36,
        x: 0,
        y: 560,
        toJSON: () => '',
      }),
    });

    const buttons = Array.from(
      containerEl.querySelectorAll<HTMLButtonElement>('.opencodian-settings-quick-nav-btn'),
    );
    expect(buttons.map((button) => button.textContent)).toEqual(['Server', 'Model']);
    expect(buttons[0]?.dataset.tooltipAlign).toBe('left');
    expect(buttons[1]?.dataset.tooltipAlign).toBe('left');

    buttons[1]?.click();

    expect(serverScrollIntoView).not.toHaveBeenCalled();
    expect(modelScrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'smooth',
      top: 660,
    });
  });
});

describe('SettingsSectionCoordinator subsection navigation', () => {
  it('scrolls to subsection headings that are not registered in quick-nav', () => {
    const { coordinator, containerEl } = createCoordinator();
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'vertical-tab-content-container';
    let scrollTop = 200;
    const scrollTo = jest.fn(({ top }: { top: number }) => {
      scrollTop = top;
    });

    Object.defineProperty(scrollContainer, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    Object.defineProperty(scrollContainer, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 80,
        right: 800,
        bottom: 680,
        width: 800,
        height: 600,
        x: 0,
        y: 80,
        toJSON: () => '',
      }),
    });

    document.body.appendChild(scrollContainer);
    scrollContainer.appendChild(containerEl);

    coordinator.beginDisplay('Settings');
    coordinator.createSectionHeading(containerEl, {
      title: 'Conversation',
      tooltip: 'Conversation settings',
    });
    const titleBlockHeadingEl = containerEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading opencodian-settings-section-heading',
      text: 'Conversation Title',
    });
    Object.defineProperty(titleBlockHeadingEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 520,
        right: 800,
        bottom: 556,
        width: 800,
        height: 36,
        x: 0,
        y: 520,
        toJSON: () => '',
      }),
    });
    coordinator.finishDisplay();

    coordinator.scrollToSectionByTitle('Conversation Title');

    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'smooth',
      top: 640,
    });
  });
});

describe('SettingsSectionCoordinator quick nav tooltip', () => {
  it('renders quick-nav tooltip content in a body-level overlay instead of inside the settings container', () => {
    const { coordinator, containerEl } = createCoordinator();
    document.body.appendChild(containerEl);

    coordinator.beginDisplay('Settings');
    coordinator.createSectionHeading(containerEl, {
      title: 'Server',
      tooltip: 'Server settings',
    });
    coordinator.finishDisplay();

    const button = containerEl.querySelector<HTMLButtonElement>('.opencodian-settings-quick-nav-btn');
    expect(button).not.toBeNull();

    Object.defineProperty(button as HTMLButtonElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 100,
        top: 140,
        right: 180,
        bottom: 172,
        width: 80,
        height: 32,
        x: 100,
        y: 140,
        toJSON: () => '',
      }),
    });

    button?.dispatchEvent(new Event('mouseenter'));

    const overlay = document.body.querySelector<HTMLElement>('.opencodian-settings-quick-nav-tooltip-layer');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('Server settings');
    expect(containerEl.contains(overlay)).toBe(false);

    button?.dispatchEvent(new Event('mouseleave'));
    expect(document.body.querySelector('.opencodian-settings-quick-nav-tooltip-layer')).toBeNull();
  });

  it('places quick-nav tooltip below top-edge buttons and above bottom-edge buttons', () => {
    const { coordinator, containerEl } = createCoordinator();
    document.body.appendChild(containerEl);
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 300,
    });

    coordinator.beginDisplay('Settings');
    coordinator.createSectionHeading(containerEl, {
      title: 'Server',
      tooltip: 'Server settings',
    });
    coordinator.createSectionHeading(containerEl, {
      title: 'Model',
      tooltip: 'Model settings',
    });
    coordinator.finishDisplay();

    const button = containerEl.querySelectorAll<HTMLButtonElement>('.opencodian-settings-quick-nav-btn')[0];
    expect(button?.dataset.tooltipAlign).toBe('left');

    Object.defineProperty(button as HTMLButtonElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 12,
        top: 8,
        right: 92,
        bottom: 40,
        width: 80,
        height: 32,
        x: 12,
        y: 8,
        toJSON: () => '',
      }),
    });

    button?.dispatchEvent(new Event('mouseenter'));

    const overlay = document.body.querySelector<HTMLElement>('.opencodian-settings-quick-nav-tooltip-layer');
    expect(overlay).not.toBeNull();
    expect(overlay?.dataset.placement).toBe('bottom');

    button?.dispatchEvent(new Event('mouseleave'));

    Object.defineProperty(button as HTMLButtonElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 12,
        top: 260,
        right: 92,
        bottom: 292,
        width: 80,
        height: 32,
        x: 12,
        y: 260,
        toJSON: () => '',
      }),
    });

    button?.dispatchEvent(new Event('mouseenter'));

    const bottomOverlay = document.body.querySelector<HTMLElement>('.opencodian-settings-quick-nav-tooltip-layer');
    expect(bottomOverlay?.dataset.placement).toBe('top');

    button?.dispatchEvent(new Event('mouseleave'));
  });
});

function createSettingsTab(layoutMode: 'classic' | 'tabbed' = 'classic') {
  const app = {
    vault: {
      adapter: {
        getResourcePath: (assetPath: string) => `app://opencodian/${assetPath}`,
      },
    },
  };
  const plugin = {
    app,
    manifest: {
      dir: '/plugins/opencodian',
    },
    settings: {
      ...DEFAULT_SETTINGS,
      settingsLayoutMode: layoutMode,
      settingsTabbedPrimaryTab: 'general',
      settingsTabbedSecondaryTabByPrimary: { general: 'basic' },
      settingsPanelScrollTop: 0,
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    scheduleSettingsUiStateSave: jest.fn(),
    openCodeService: {
      requireSdkCapability: jest.fn().mockReturnValue({ kind: 'available' }),
      refreshSdkCapabilities: jest.fn().mockResolvedValue({ entries: [], generatedAt: 0 }),
    },
  };
  const tab = new OpenCodianSettingTab(app as never, plugin as never);
  document.body.appendChild(tab.containerEl);
  return { app, plugin, tab };
}

describe('OpenCodianSettingTab scroll restoration', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('captures tabbed settings scroll before clearing tabbed content during refresh', () => {
    jest.useFakeTimers();
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
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

    try {
      const { plugin, tab } = createSettingsTab('tabbed');
      const scrollContainer = document.createElement('div');
      scrollContainer.className = 'vertical-tab-content-container';
      installClampedScrollState(scrollContainer, {
        clientHeight: 200,
        scrollHeight: 1200,
      });
      scrollContainer.appendChild(tab.containerEl);
      document.body.appendChild(scrollContainer);

      Object.assign(tab as unknown as Record<string, unknown>, {
        getOrCreateTabbedRenderer: () => ({
          renderDisplay: (containerEl: HTMLElement) => {
            containerEl.createDiv({ text: 'tabbed content' });
          },
        }),
      });
      const empty = tab.containerEl.empty.bind(tab.containerEl);
      Object.defineProperty(tab.containerEl, 'empty', {
        configurable: true,
        value: () => {
          scrollContainer.scrollTop = 0;
          empty();
        },
      });

      tab.display();
      jest.advanceTimersByTime(1);
      scrollContainer.scrollTop = 480;
      tab.display();

      expect(plugin.settings.settingsPanelScrollTop).toBe(480);
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      jest.useRealTimers();
    }
  });
});

describe('OpenCodianSettingTab layout shell', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('disposes the active tabbed plugin section before rendering another plugin subtab', () => {
    const { plugin, tab } = createSettingsTab('tabbed');
    plugin.settings.settingsTabbedPrimaryTab = 'plugins';
    plugin.settings.settingsTabbedSecondaryTabByPrimary = { plugins: 'overview' };
    const attachSpy = jest
      .spyOn(SettingsPluginSection.prototype, 'attachTabbed')
      .mockImplementation(() => undefined);
    const disposeSpy = jest.spyOn(SettingsPluginSection.prototype, 'dispose');

    tab.display();
    plugin.settings.settingsTabbedSecondaryTabByPrimary = { plugins: 'global' };
    tab.display();

    expect(attachSpy).toHaveBeenCalledTimes(2);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('uses General as the first classic quick-nav section', () => {
    const { tab } = createSettingsTab('classic');
    const appendMarker = (className: string) => (containerEl: HTMLElement) => {
      containerEl.createDiv({ cls: className, text: className });
    };

    Object.assign(tab as unknown as Record<string, unknown>, {
      addServerSettings: jest.fn(),
      addMcpSettings: jest.fn(),
      addModelSettings: jest.fn(),
      addConversationSettings: jest.fn(),
      addAgentsSettings: jest.fn(),
      addCommandsSettings: jest.fn(),
      addFormatterSettings: jest.fn(),
      addPluginSettings: jest.fn(),
      addSecuritySettings: jest.fn(),
      addUISettings: jest.fn(),
      addStyleSettings: jest.fn(),
      addDebugSettings: jest.fn(),
      addUserSettings: jest.fn(),
      addSkillsSettings: jest.fn(),
      addToolsSettings: jest.fn(),
      addAcpSettings: jest.fn(),
      renderLayoutModeSetting: appendMarker('layout-mode-setting'),
      renderLanguageSetting: appendMarker('language-setting'),
    });

    tab.display();

    expect(tab.containerEl.dataset.settingsLayoutMode).toBe('classic');
    expect(tab.containerEl.dataset.settingsSurface).toBe('page');
    expect(
      Array.from(tab.containerEl.querySelectorAll<HTMLHeadingElement>('.opencodian-settings-section-heading')).map(
        (element) => element.textContent?.trim(),
      ),
    ).toContain('General');
    expect(
      Array.from(tab.containerEl.querySelectorAll<HTMLButtonElement>('.opencodian-settings-quick-nav-btn')).map(
        (element) => element.textContent?.trim(),
      ),
    ).toEqual(['General']);
    const generalBlock = tab.containerEl.querySelector<HTMLElement>('.opencodian-settings-general-merged-block');
    expect(generalBlock).not.toBeNull();
    expect(
      Array.from(generalBlock!.querySelectorAll<HTMLElement>('.opencodian-settings-subsection-heading')).map(
        (element) => element.textContent?.trim(),
      ),
    ).toEqual([]);
    expect(generalBlock?.classList.contains('opencodian-settings-section')).toBe(true);
    expect(generalBlock?.dataset.settingsSurface).toBe('section');
    expect(generalBlock?.querySelector('.opencodian-settings-section-body')).not.toBeNull();
    expect(generalBlock?.querySelector('.layout-mode-setting')).not.toBeNull();
    expect(generalBlock?.querySelector('.language-setting')).not.toBeNull();
  });

  it('keeps ordinary setting rows scoped under marked classic settings sections', () => {
    const { tab } = createSettingsTab('classic');
    const appendSettingRow = (containerEl: HTMLElement) => {
      containerEl.createDiv({ cls: 'setting-item', text: 'setting row' });
    };

    Object.assign(tab as unknown as Record<string, unknown>, {
      addServerSettings: jest.fn(),
      addMcpSettings: jest.fn(),
      addModelSettings: jest.fn(),
      addConversationSettings: jest.fn(),
      addAgentsSettings: jest.fn(),
      addCommandsSettings: jest.fn(),
      addFormatterSettings: jest.fn(),
      addPluginSettings: jest.fn(),
      addSecuritySettings: jest.fn(),
      addUISettings: jest.fn(),
      addStyleSettings: jest.fn(),
      addDebugSettings: jest.fn(),
      addUserSettings: jest.fn(),
      renderLayoutModeSetting: jest.fn(appendSettingRow),
      renderLanguageSetting: jest.fn(appendSettingRow),
      renderSettingsInEditorAreaSetting: jest.fn(appendSettingRow),
    });

    tab.display();

    const sectionEl = tab.containerEl.querySelector<HTMLElement>('.opencodian-settings-section');
    expect(sectionEl).not.toBeNull();
    expect(sectionEl?.querySelectorAll('.setting-item').length).toBeGreaterThan(0);
    expect(
      tab.containerEl.querySelector('.opencodian-settings-content-shell .opencodian-settings-tab-panel'),
    ).toBeNull();
  });

  it('places MCP between Commands and Formatter in classic quick-nav order', () => {
    const { tab } = createSettingsTab('classic');
    const appendHeading = (title: string) => (containerEl: HTMLElement) => {
      (tab as unknown as { createSectionHeading: (host: HTMLElement, heading: string, tooltip?: string) => HTMLHeadingElement })
        .createSectionHeading(containerEl, title, `${title} tooltip`);
    };

    Object.assign(tab as unknown as Record<string, unknown>, {
      addServerSettings: appendHeading('Server'),
      addMcpSettings: appendHeading('MCP'),
      addModelSettings: appendHeading('Model'),
      addConversationSettings: appendHeading('Conversation'),
      addAgentsSettings: appendHeading('Agents'),
      addCommandsSettings: appendHeading('Commands'),
      addFormatterSettings: appendHeading('Formatter'),
      addPluginSettings: appendHeading('Plugins'),
      addSecuritySettings: appendHeading('Security'),
      addUISettings: appendHeading('UI'),
      addStyleSettings: appendHeading('Style'),
      addDebugSettings: appendHeading('Debug'),
      addUserSettings: appendHeading('User'),
      renderLayoutModeSetting: jest.fn(),
      renderLanguageSetting: jest.fn(),
    });

    tab.display();

    const labels = Array.from(
      tab.containerEl.querySelectorAll<HTMLButtonElement>('.opencodian-settings-quick-nav-btn'),
    ).map((element) => element.textContent?.trim());
    expect(labels.indexOf('Commands')).toBeLessThan(labels.indexOf('MCP'));
    expect(labels.indexOf('MCP')).toBeLessThan(labels.indexOf('Formatter'));
  });

  it('hides OpenCode-owned classic settings sections when Claude Code is active', () => {
    const { plugin, tab } = createSettingsTab('classic');
    plugin.settings.enabledBackends = ['opencode', 'claude-code'];
    plugin.settings.activeBackend = 'claude-code';
    const appendHeading = (title: string) => (containerEl: HTMLElement) => {
      (tab as unknown as { createSectionHeading: (host: HTMLElement, heading: string, tooltip?: string) => HTMLHeadingElement })
        .createSectionHeading(containerEl, title, `${title} tooltip`);
    };

    Object.assign(tab as unknown as Record<string, unknown>, {
      addServerSettings: appendHeading('Server'),
      addMcpSettings: appendHeading('MCP'),
      addModelSettings: appendHeading('Model'),
      addConversationSettings: appendHeading('Conversation'),
      addAgentsSettings: appendHeading('Agents'),
      addCommandsSettings: appendHeading('Commands'),
      addFormatterSettings: appendHeading('Formatter'),
      addPluginSettings: appendHeading('Plugins'),
      addSecuritySettings: appendHeading('Security'),
      addUISettings: appendHeading('UI'),
      addStyleSettings: appendHeading('Style'),
      addDebugSettings: appendHeading('Debug'),
      addUserSettings: appendHeading('User'),
      addClaudeCodeSettings: appendHeading('Claude Code'),
      addSkillsSettings: appendHeading('Skills'),
      addToolsSettings: appendHeading('Tools'),
      addAcpSettings: appendHeading('ACP'),
      renderLayoutModeSetting: jest.fn(),
      renderLanguageSetting: jest.fn(),
    });

    tab.display();

    const labels = Array.from(
      tab.containerEl.querySelectorAll<HTMLButtonElement>('.opencodian-settings-quick-nav-btn'),
    ).map((element) => element.textContent?.trim());
    expect(labels).toEqual(['General', 'Claude Code', 'Conversation', 'UI', 'Style', 'Debug', 'User']);
    expect(labels).not.toContain('Server');
    expect(labels).not.toContain('Model');
    expect(labels).not.toContain('Security');
  });

  it('does not render quick-nav in tabbed layout mode', () => {
    const { tab } = createSettingsTab('tabbed');
    const renderDisplay = jest.fn((containerEl: HTMLElement) => {
      containerEl.createDiv({ cls: 'opencodian-settings-content-shell tabbed-render-marker', text: 'tabbed-rendered' });
    });

    Object.assign(tab as unknown as Record<string, unknown>, {
      getOrCreateTabbedRenderer: () => ({
        renderDisplay,
        switchToPrimaryTab: jest.fn(),
      }),
    });

    tab.display();

    expect(renderDisplay).toHaveBeenCalledTimes(1);
    expect(tab.containerEl.dataset.settingsLayoutMode).toBe('tabbed');
    expect(tab.containerEl.dataset.settingsSurface).toBe('page');
    expect(tab.containerEl.classList.contains('opencodian-settings--tabbed')).toBe(true);
    expect(tab.containerEl.querySelector('.opencodian-settings-quick-nav')).toBeNull();
    expect(tab.containerEl.querySelector('.opencodian-settings-content-shell')).not.toBeNull();
    expect(tab.containerEl.querySelector('.opencodian-settings-tab-panel')).toBeNull();
    expect(tab.containerEl.querySelector('.tabbed-render-marker')?.textContent).toBe('tabbed-rendered');
  });

  it('keeps the visible settings hierarchy token-scoped and avoids heavy legacy tab panels', () => {
    const contractCss = readFileSync(
      join(process.cwd(), 'src/style/components/settings-layout-contract.css'),
      'utf8',
    );
    const legacyCss = readFileSync(
      join(process.cwd(), 'src/style/components/model-selector.css'),
      'utf8',
    );

    expect(contractCss).toContain('--opencodian-settings-nav-bg');
    expect(contractCss).toContain('--opencodian-settings-section-bg');
    expect(contractCss).toContain('--opencodian-settings-row-bg');
    expect(contractCss).toContain('--opencodian-settings-object-bg');
    expect(contractCss).toContain('--opencodian-settings-form-row-bg');
    expect(contractCss).toContain('--opencodian-settings-form-row-border');
    expect(contractCss).toContain('--opencodian-settings-form-row-hover-bg');
    expect(contractCss).toMatch(
      /--opencodian-settings-row-bg:\s*var\(--opencodian-settings-form-row-bg\)/,
    );
    expect(contractCss).toMatch(/\.opencodian-settings\s+\.opencodian-settings-quick-nav/);
    expect(contractCss).toMatch(/\.opencodian-settings\s+\.opencodian-settings-tab-primary/);
    const ordinaryRowBlock = contractCss.match(
      /\.opencodian-settings\s+\.opencodian-settings-section\s+\.setting-item,\s*[\s\S]*?\.opencodian-settings\s+\.opencodian-settings-content-shell\s+\.setting-item\s*\{[^}]*\}/,
    )?.[0] ?? '';

    expect(ordinaryRowBlock).toContain('grid-template-columns: minmax(min(160px, 45%), 1fr) minmax(min(180px, 50%), max-content)');
    expect(ordinaryRowBlock).toContain('background: var(--opencodian-settings-form-row-bg)');
    expect(contractCss).toMatch(/\.opencodian-settings\s+\.opencodian-settings-content-shell\s+\.setting-item/);
    expect(contractCss).not.toMatch(/\.opencodian-settings\s+\.opencodian-settings-content-shell\s*>\s*\.setting-item/);
    expect(contractCss).toMatch(
      /\.opencodian-settings\s+\.opencodian-wide-text-setting\.setting-item\s*\{[\s\S]*minmax\(min\(280px,\s*50%\),\s*min\(clamp\(320px,\s*42vw,\s*520px\),\s*100%\)\)/,
    );
    expect(contractCss).toMatch(
      /\.opencodian-settings\s+\.opencodian-wide-text-setting\s+\.setting-item-control\s*\{[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;/,
    );
    expect(legacyCss).toMatch(
      /\.opencodian-style-setting\.opencodian-style-setting-long-text(?:\.setting-item)?\s*(?:,|\{)[\s\S]*minmax\(min\(360px,\s*55%\),\s*min\(520px,\s*100%\)\)/,
    );
    expect(legacyCss).toMatch(
      /\.opencodian-style-setting\.opencodian-style-setting-long-text\s+\.setting-item-control\s*\{[\s\S]*max-width:\s*520px;/,
    );

    expect(legacyCss).not.toMatch(/\.opencodian-settings-tab-panel\s*\{[^}]*box-shadow:/);
    expect(legacyCss).not.toMatch(/\.opencodian-style-section\s*\{[^}]*border-left:\s*[2-9]px/);
  });

  it('keeps ordinary settings row cards neutral instead of using status-tinted fills', () => {
    const contractCss = readFileSync(
      join(process.cwd(), 'src/style/components/settings-layout-contract.css'),
      'utf8',
    );
    const overrideRowBlock = contractCss.match(
      /\.opencodian-settings\s+\.opencodian-tool-permission-row\[data-tool-permission-source='override'\]\s+\.setting-item\s*\{[^}]*\}/,
    )?.[0] ?? '';

    expect(overrideRowBlock).toContain('background: var(--opencodian-settings-form-row-bg)');
    expect(overrideRowBlock).not.toMatch(/background:\s*color-mix\(in srgb,[^}]*var\(--interactive-accent\)/);
    expect(contractCss).toMatch(
      /\.opencodian-settings\s+\.opencodian-skill-card,\s*[\s\S]*\.opencodian-settings\s+\.opencodian-acp-agent-row-card\s*\{[\s\S]*background:\s*var\(--opencodian-settings-form-row-bg\)/,
    );
  });

  it('documents mode-aware settings hierarchy rules after the regression audit', () => {
    const contractDoc = readFileSync(
      join(process.cwd(), 'docs/modules/style/components/settings-layout-contract.md'),
      'utf8',
    );
    const modalDoc = readFileSync(
      join(process.cwd(), 'docs/modules/style/modals/config-editor-modal.md'),
      'utf8',
    );
    const modalCss = readFileSync(
      join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    expect(contractDoc).toContain('Mode-Aware Hierarchy Taxonomy');
    expect(contractDoc).toContain('classic child panel');
    expect(contractDoc).toContain('tabbed mode');
    expect(contractDoc).toContain('classic mode');
    expect(contractDoc).toContain('row tokens');
    expect(contractDoc).toContain('inline tokens');
    expect(modalDoc).toContain('classic hierarchy repair');
    expect(modalCss).toMatch(/data-settings-layout-mode="classic"[\s\S]*\.opencodian-plugin-block/);
    expect(modalCss).toMatch(
      /\.opencodian-settings-catalog-scroll > \.setting-item\s*\{[\s\S]*var\(--opencodian-settings-row-bg/,
    );
  });
});

describe('OpenCodianSettingTab title styling', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders a branded settings title using the shared OpenCodian title logic', () => {
    const { tab } = createSettingsTab('classic');
    Object.assign(tab as unknown as Record<string, unknown>, {
      addServerSettings: jest.fn(),
      addMcpSettings: jest.fn(),
      addModelSettings: jest.fn(),
      addConversationSettings: jest.fn(),
      addAgentsSettings: jest.fn(),
      addCommandsSettings: jest.fn(),
      addFormatterSettings: jest.fn(),
      addPluginSettings: jest.fn(),
      addSecuritySettings: jest.fn(),
      addUISettings: jest.fn(),
      addStyleSettings: jest.fn(),
      addDebugSettings: jest.fn(),
      addUserSettings: jest.fn(),
      renderLayoutModeSetting: jest.fn(),
      renderLanguageSetting: jest.fn(),
    });

    tab.display();

    const headingEl = tab.containerEl.querySelector<HTMLElement>('.opencodian-settings-panel-title');
    expect(headingEl).not.toBeNull();
    expect(headingEl?.querySelector('.opencodian-title')).not.toBeNull();
    expect(headingEl?.querySelector('.opencodian-logo')).not.toBeNull();
    expect(
      Array.from(headingEl?.querySelectorAll<HTMLImageElement>('.opencodian-settings-title-wordmark') ?? []).map(
        (element) => element.getAttribute('src'),
      ),
    ).toEqual([
      'app://opencodian//plugins/opencodian/assets/branding/opencodian-wordmark-light.svg',
      'app://opencodian//plugins/opencodian/assets/branding/opencodian-wordmark-dark.svg',
    ]);
    expect(headingEl?.querySelector('.opencodian-settings-panel-title-suffix')).toBeNull();
  });

  it('keeps the branded title visible and places backend icons inline in the title row', () => {
    const { tab } = createSettingsTab('tabbed');
    tab.plugin.settings.enabledBackends = ['opencode', 'claude-code'];
    tab.plugin.settings.activeBackend = 'opencode';

    tab.display();

    const headingEl = tab.containerEl.querySelector<HTMLElement>('.opencodian-settings-panel-title');
    const actionsEl = headingEl?.querySelector<HTMLElement>('.opencodian-settings-panel-title-actions');
    const iconButtons = Array.from(
      actionsEl?.querySelectorAll<HTMLButtonElement>('.opencodian-agent-switcher-header-icon') ?? [],
    );

    expect(headingEl).not.toBeNull();
    expect(headingEl?.querySelector('.opencodian-title')).not.toBeNull();
    expect(headingEl?.querySelector('.opencodian-logo')).not.toBeNull();
    expect(actionsEl).not.toBeNull();
    expect(iconButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'OpenCode',
      'Claude Code',
    ]);
    expect(iconButtons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(tab.containerEl.querySelector('.opencodian-agent-chip')).toBeNull();
  });

  it('styles the settings title flush-left, borderless, and slightly larger', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/components/model-selector.css'),
      'utf8',
    );
    const contractCss = readFileSync(
      join(process.cwd(), 'src/style/components/settings-layout-contract.css'),
      'utf8',
    );

    expect(css).toMatch(
      /\.opencodian-settings h2\s*\{[\s\S]*margin-top:\s*12px;[\s\S]*margin-left:\s*0;[\s\S]*margin-bottom:\s*12px;[\s\S]*padding-bottom:\s*0;[\s\S]*border-bottom:\s*none;/,
    );
    expect(css).toMatch(
      /\.opencodian-settings-panel-title\s*\{[\s\S]*gap:\s*12px;/,
    );
    expect(css).toMatch(
      /\.opencodian-settings\s+\.opencodian-settings-panel-title\s*\{[\s\S]*padding:\s*0\s+56px\s+0\s+0;/,
    );
    expect(css).toMatch(
      /\.opencodian-settings-panel-title \.opencodian-title\s*\{[\s\S]*padding-left:\s*0;/,
    );
    expect(css).toMatch(
      /\.opencodian-settings-panel-title \.opencodian-title-text\s*\{[\s\S]*height:\s*18px;/,
    );
    expect(css).toMatch(
      /\.opencodian-settings-panel-title-actions\s*\{[\s\S]*margin-left:\s*auto;/,
    );
    expect(css).toMatch(
      /\.opencodian-settings\.opencodian-settings--tabbed\s+\.opencodian-settings-panel-title\s*\{[\s\S]*justify-content:\s*space-between;/,
    );
    expect(css).toMatch(
      /\.workspace-leaf-content\[data-type="opencodian-settings-view"\]\s*>\s*\.view-content\.opencodian-settings\.opencodian-settings--classic\s*\{[\s\S]*padding-top:\s*0\s*!important;/,
    );
    expect(contractCss).toMatch(
      /\.opencodian-settings\s+\.opencodian-settings-quick-nav\s*\{[\s\S]*padding:\s*10px\s+12px;/,
    );
    expect(css).toMatch(
      /\.opencodian-settings-quick-nav-tooltip-layer\s*\{[\s\S]*position:\s*fixed;[\s\S]*z-index:\s*2260;/,
    );
    expect(css).toMatch(
      /\.opencodian-settings-quick-nav-tooltip-layer\s*\{[\s\S]*gap:\s*0;/,
    );
    expect(css).toMatch(
      /\.opencodian-settings-quick-nav-tooltip-layer\.is-visible\s*\{[\s\S]*translateY\(-2px\);/,
    );
    expect(css).toMatch(
      /\.opencodian-settings-quick-nav-tooltip-bubble\s*\{[\s\S]*max-width:\s*min\(240px,\s*calc\(100vw\s*-\s*48px\)\);/,
    );
    expect(css).toMatch(
      /\.opencodian-settings-quick-nav-tooltip-bubble\s*\{[\s\S]*box-shadow:\s*none;/,
    );
    expect(css).not.toMatch(/opencodian-settings-quick-nav-tooltip-layer\[data-align="left"\]/);
    expect(css).not.toMatch(/opencodian-settings-quick-nav-tooltip-layer\[data-align="right"\]/);
    expect(css).not.toMatch(/opencodian-settings-quick-nav-tooltip-bubble\s*\{[\s\S]*backdrop-filter:/);
  });

  it('keeps the quick-nav tooltip below the shared settings tooltip and popover layers', () => {
    const overlayCss = readFileSync(
      join(process.cwd(), 'src/style/components/model-selector.css'),
      'utf8',
    );
    const popoverCss = readFileSync(
      join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    // Quick-nav tooltip: z-index 2260 (lowest)
    expect(overlayCss).toMatch(/\.opencodian-settings-quick-nav-tooltip-layer\s*\{[\s\S]*z-index:\s*2260;/);
    // Settings popover: z-index 2280 (middle)
    expect(popoverCss).toMatch(/\.opencodian-builtin-list-search-popover\s*\{[\s\S]*z-index:\s*2280;/);
    // Settings tooltip: z-index 2300 (highest)
    expect(overlayCss).toMatch(/\.opencodian-settings-tooltip-layer\s*\{[\s\S]*z-index:\s*2300;/);
  });
});
