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

  it('skips restore observers and timers when the requested scroll position is already at the top', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = {
      settings: {
        settingsPanelScrollTop: 0,
      },
      scheduleSettingsUiStateSave: jest.fn(),
    } as unknown as ConstructorParameters<typeof OpenCodianSettingTab>[1];
    const tab = new OpenCodianSettingTab({} as App, plugin);
    const scrollContainer = document.createElement('div');

    installClampedScrollState(scrollContainer, {
      clientHeight: 200,
      scrollHeight: 800,
    });
    scrollContainer.scrollTop = 160;

    document.body.appendChild(scrollContainer);
    scrollContainer.appendChild(tab.containerEl);

    (tab as unknown as {
      restoreSettingsPanelScrollPosition: (scrollTop: number, scrollContainer: HTMLElement) => void;
      settingsPanelRestoreObserver: MutationObserver | null;
      settingsPanelRestoreTimeoutIds: number[];
    }).restoreSettingsPanelScrollPosition(0, scrollContainer);

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
  });

  it('skips deferred DOM tracking when the initial restore reaches the target immediately', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = {
      settings: {
        settingsPanelScrollTop: 0,
      },
      scheduleSettingsUiStateSave: jest.fn(),
    } as unknown as ConstructorParameters<typeof OpenCodianSettingTab>[1];
    const tab = new OpenCodianSettingTab({} as App, plugin);
    const scrollContainer = document.createElement('div');

    installClampedScrollState(scrollContainer, {
      clientHeight: 200,
      scrollHeight: 800,
    });

    document.body.appendChild(scrollContainer);
    scrollContainer.appendChild(tab.containerEl);

    (tab as unknown as {
      restoreSettingsPanelScrollPosition: (scrollTop: number, scrollContainer: HTMLElement) => void;
      settingsPanelRestoreObserver: MutationObserver | null;
      settingsPanelRestoreTimeoutIds: number[];
    }).restoreSettingsPanelScrollPosition(400, scrollContainer);

    jest.advanceTimersByTime(1);
    expect(scrollContainer.scrollTop).toBe(400);
    expect(MutationObserverMock.instances).toHaveLength(0);
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
    const plugin = {
      settings: {
        settingsPanelScrollTop: 0,
      },
      scheduleSettingsUiStateSave: jest.fn(),
    } as unknown as ConstructorParameters<typeof OpenCodianSettingTab>[1];
    const tab = new OpenCodianSettingTab({} as App, plugin);
    const scrollContainer = document.createElement('div');

    installClampedScrollState(scrollContainer, {
      clientHeight: 200,
      scrollHeight: 800,
    });

    document.body.appendChild(scrollContainer);
    scrollContainer.appendChild(tab.containerEl);

    (tab as unknown as {
      restoreSettingsPanelScrollPosition: (scrollTop: number, scrollContainer: HTMLElement) => void;
    }).restoreSettingsPanelScrollPosition(400, scrollContainer);

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

describe('OpenCodianSettingTab model catalog views', () => {
  function createTab(disabledModelRefs: string[] = []): OpenCodianSettingTab {
    const plugin = {
      settings: {
        modelAvailabilitySectionOpen: true,
        modelToolsSectionOpen: true,
        disabledModelRefs,
      },
    } as unknown as ConstructorParameters<typeof OpenCodianSettingTab>[1];

    return new OpenCodianSettingTab({} as App, plugin);
  }

  it('hides server-disabled providers from the server catalog', () => {
    const tab = createTab();
    const catalogs = {
      local: { providers: [], defaults: {} },
      server: {
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            models: [{
              id: 'gpt-4.1',
              name: 'GPT-4.1',
              source: 'server' as const,
              existsInLocal: false,
              existsInServer: true,
            }],
            source: 'server' as const,
            existsInLocal: false,
            existsInServer: true,
          },
          {
            id: 'alibaba',
            name: 'Alibaba',
            models: [],
            source: 'server' as const,
            existsInLocal: false,
            existsInServer: true,
            disabledScopes: ['global' as const],
          },
        ],
        defaults: {},
      },
      baseEffective: { providers: [], defaults: {} },
      effective: { providers: [], defaults: {} },
      currentEnabledProviderIds: ['openai'],
      serverConfig: {},
      effectiveProviderConfig: { disabled_providers: ['deepseek'] },
    };

    const serverCatalog = (tab as unknown as {
      getDisplayCatalogForMode: (mode: 'server', catalogs: typeof catalogs, localModelConfig: { disabled_providers: string[] }) => {
        providers: Array<{ id: string; models: unknown[]; source: string }>;
      };
    }).getDisplayCatalogForMode('server', catalogs, { disabled_providers: ['deepseek'] });

    expect(serverCatalog.providers.map((provider) => provider.id)).toEqual(['openai']);
  });

  it('shows disabled models from merged local and server catalogs in the disabled view', () => {
    const tab = createTab(['local-only/alpha', 'openai/gpt-4.1']);
    const catalogs = {
      local: {
        providers: [{
          id: 'local-only',
          name: 'Local Only',
          models: [{
            id: 'alpha',
            name: 'Alpha',
            source: 'local' as const,
            existsInLocal: true,
            existsInServer: false,
          }],
          source: 'local' as const,
          existsInLocal: true,
          existsInServer: false,
        }],
        defaults: {},
      },
      server: {
        providers: [{
          id: 'openai',
          name: 'OpenAI',
          models: [{
            id: 'gpt-4.1',
            name: 'GPT-4.1',
            source: 'server' as const,
            existsInLocal: false,
            existsInServer: true,
          }],
          source: 'server' as const,
          existsInLocal: false,
          existsInServer: true,
        }],
        defaults: {},
      },
      baseEffective: { providers: [], defaults: {} },
      effective: { providers: [], defaults: {} },
      currentEnabledProviderIds: [],
      serverConfig: {},
      effectiveProviderConfig: { disabled_providers: ['deepseek'] },
    };

    const disabledCatalog = (tab as unknown as {
      getDisplayCatalogForMode: (
        mode: 'disabled',
        catalogs: typeof catalogs,
        localModelConfig: { disabled_providers: string[] },
      ) => {
        providers: Array<{ id: string; models: Array<{ id: string }> }>;
      };
    }).getDisplayCatalogForMode('disabled', catalogs, { disabled_providers: ['deepseek'] });

    expect(disabledCatalog.providers.map((provider) => provider.id)).toEqual(['deepseek', 'local-only', 'openai']);
    expect(disabledCatalog.providers.find((provider) => provider.id === 'deepseek')?.models).toEqual([]);
    expect(disabledCatalog.providers.find((provider) => provider.id === 'local-only')?.models.map((model) => model.id)).toEqual(['alpha']);
    expect(disabledCatalog.providers.find((provider) => provider.id === 'openai')?.models.map((model) => model.id)).toEqual(['gpt-4.1']);
  });

  it('omits server-disabled providers from the disabled view after a project override enables them', () => {
    const tab = createTab();
    const catalogs = {
      local: { providers: [], defaults: {} },
      server: {
        providers: [
          {
            id: 'alibaba',
            name: 'Alibaba',
            models: [{
              id: 'qwen-max',
              name: 'Qwen Max',
              source: 'server' as const,
              existsInLocal: false,
              existsInServer: true,
            }],
            source: 'server' as const,
            existsInLocal: false,
            existsInServer: true,
            disabledScopes: ['global' as const],
          },
          {
            id: 'alibaba-cn',
            name: 'Alibaba CN',
            models: [{
              id: 'qwen-plus',
              name: 'Qwen Plus',
              source: 'server' as const,
              existsInLocal: false,
              existsInServer: true,
            }],
            source: 'server' as const,
            existsInLocal: false,
            existsInServer: true,
            disabledScopes: ['global' as const],
          },
        ],
        defaults: {},
      },
      baseEffective: { providers: [], defaults: {} },
      effective: { providers: [], defaults: {} },
      currentEnabledProviderIds: [],
      serverConfig: { disabled_providers: ['alibaba', 'alibaba-cn'] },
      effectiveProviderConfig: { disabled_providers: ['alibaba-cn'] },
    };

    const disabledCatalog = (tab as unknown as {
      getDisplayCatalogForMode: (
        mode: 'disabled',
        catalogs: typeof catalogs,
        localModelConfig: { disabled_providers: string[] },
      ) => {
        providers: Array<{ id: string; disabledScopes?: Array<'global' | 'project'> }>;
      };
    }).getDisplayCatalogForMode('disabled', catalogs, { disabled_providers: ['alibaba-cn'] });

    expect(disabledCatalog.providers.map((provider) => provider.id)).toEqual(['alibaba', 'alibaba-cn']);
    expect(disabledCatalog.providers[0].disabledScopes).toEqual(['global']);
    expect(disabledCatalog.providers[1].disabledScopes).toEqual(['global', 'project']);
  });

  it('prefers project-disabled over server-disabled when both apply', () => {
    const tab = createTab();
    const reason = (tab as unknown as {
      getProviderPrimaryDisabledReason: (
        provider: {
          id: string;
          disabledScopes?: Array<'global' | 'project'>;
        },
        localModelConfig: { disabled_providers: string[] },
        providerEnabled: boolean,
      ) => 'project' | 'server' | null;
    }).getProviderPrimaryDisabledReason(
      {
        id: 'alibaba',
        disabledScopes: ['global'],
      },
      { disabled_providers: ['alibaba'] },
      false,
    );

    expect(reason).toBe('project');
  });

  it('treats server catalog providers as disabled when the global server config disabled them', () => {
    const tab = createTab();
    const statusClass = (tab as unknown as {
      getProviderAvailabilityStatusClass: (
        provider: {
          id: string;
          disabledScopes?: Array<'global' | 'project'>;
        },
        providerEnabled: boolean,
        disabledCount: number,
        mode: 'local' | 'server' | 'effective' | 'disabled',
      ) => 'is-disabled' | 'is-partial' | 'is-available';
    }).getProviderAvailabilityStatusClass(
      {
        id: 'alibaba',
        disabledScopes: ['global'],
      },
      true,
      0,
      'server',
    );

    expect(statusClass).toBe('is-disabled');
  });

  it('treats a provider as disabled when it is absent from currentEnabledProviderIds', () => {
    const tab = createTab();
    const enabled = (tab as unknown as {
      isProviderCurrentlyEnabled: (
        providerId: string,
        catalogs: {
          currentEnabledProviderIds: string[];
        },
      ) => boolean;
    }).isProviderCurrentlyEnabled('alibaba', {
      currentEnabledProviderIds: ['deepseek'],
    });

    expect(enabled).toBe(false);
  });
});
