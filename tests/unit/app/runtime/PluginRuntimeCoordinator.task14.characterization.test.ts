import { PluginRuntimeCoordinator } from '../../../../src/app/runtime/PluginRuntimeCoordinator';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

function createHost() {
  return {
    getSettings: jest.fn(() => ({
      ...DEFAULT_SETTINGS,
      enabledBackends: ['opencode'],
      activeBackend: 'opencode',
      server: {
        ...DEFAULT_SETTINGS.server,
        mode: 'local' as const,
        local: { ...DEFAULT_SETTINGS.server.local, autoStart: true },
      },
    })),
    getOpenCodeService: jest.fn(() => ({ isReady: jest.fn(() => false) })),
    getPluginUpdateService: jest.fn(() => null),
    getPluginVersion: jest.fn(() => '1.0.0'),
    getOpenCodianLeaves: jest.fn(() => []),
    hasEnabledBackend: jest.fn(() => true),
    applyProviderIconColorMode: jest.fn(),
    startConfiguredLocalServerIfNeeded: jest.fn().mockResolvedValue(undefined),
    logServerStatusSnapshot: jest.fn().mockResolvedValue(undefined),
    onModelsLoaded: jest.fn(),
  };
}

function createOpenCodianViewHarness() {
  return Object.assign(Object.create(OpenCodianView.prototype), {
    contentEl: document.createElement('div'),
    applyLocaleTexts: jest.fn(),
    applyChatAppearanceSettings: jest.fn(),
    applyChatScrollMode: jest.fn(),
    applyTabBarLayout: jest.fn(),
    refreshAvailabilityUi: jest.fn(),
    reloadModelCatalog: jest.fn().mockResolvedValue(undefined),
    invalidateSlashCommandMenuCatalog: jest.fn(),
  }) as OpenCodianView;
}

describe('Task 14 PluginRuntimeCoordinator lifecycle characterization', () => {
  it('only refreshes OpenCodianView leaves with the current UI order and model reload defaults', async () => {
    const host = createHost();
    const view = createOpenCodianViewHarness();
    const ignoredView = {
      applyLocaleTexts: jest.fn(() => { throw new Error('non-OpenCodian leaf must be ignored'); }),
      reloadModelCatalog: jest.fn(() => { throw new Error('non-OpenCodian leaf must be ignored'); }),
    };
    host.getOpenCodianLeaves.mockReturnValue([{ view }, { view: ignoredView }]);
    const coordinator = new PluginRuntimeCoordinator(host as never);

    coordinator.refreshOpenCodianViews();
    await Promise.resolve();

    expect(host.applyProviderIconColorMode).toHaveBeenCalledTimes(1);
    const uiInvocationOrder = [
      view.applyLocaleTexts,
      view.applyChatAppearanceSettings,
      view.applyChatScrollMode,
      view.applyTabBarLayout,
      view.refreshAvailabilityUi,
    ].map((mock) => mock.mock.invocationCallOrder[0]);
    expect(uiInvocationOrder).toEqual([...uiInvocationOrder].sort((left, right) => left - right));
    expect(view.reloadModelCatalog).toHaveBeenCalledTimes(1);
    expect(ignoredView.applyLocaleTexts).not.toHaveBeenCalled();
    expect(ignoredView.reloadModelCatalog).not.toHaveBeenCalled();
  });

  it('forwards slash-menu invalidation options only to OpenCodianView leaves', () => {
    const host = createHost();
    const view = createOpenCodianViewHarness();
    const ignoredView = { invalidateSlashCommandMenuCatalog: jest.fn() };
    host.getOpenCodianLeaves.mockReturnValue([{ view }, { view: ignoredView }]);
    const coordinator = new PluginRuntimeCoordinator(host as never);

    coordinator.invalidateSlashCommandMenuCatalogs({ preload: true });

    expect(view.invalidateSlashCommandMenuCatalog).toHaveBeenCalledWith({ preload: true });
    expect(ignoredView.invalidateSlashCommandMenuCatalog).not.toHaveBeenCalled();
  });

  it('cancels queued model refresh frames and deferred warmup timers on dispose', () => {
    jest.useFakeTimers();
    const requestFrame = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 41);
    const cancelFrame = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const clearTimeout = jest.spyOn(window, 'clearTimeout');
    const host = createHost();
    const coordinator = new PluginRuntimeCoordinator(host as never);

    coordinator.queueModelRefresh();
    coordinator.scheduleDeferredRuntimeWarmup();
    coordinator.dispose();

    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledWith(41);
    expect(clearTimeout).toHaveBeenCalled();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
});
