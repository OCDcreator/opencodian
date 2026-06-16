import { PluginRuntimeCoordinator } from '../../../../src/core/runtime/PluginRuntimeCoordinator';
import type { OpenCodianSettings } from '../../../../src/core/types';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';

function createWarmupHost(settings: OpenCodianSettings) {
  return {
    getSettings: jest.fn(() => settings),
    getOpenCodeService: jest.fn(() => ({
      isReady: jest.fn(() => false),
    })),
    getOpenCodianLeaves: jest.fn(() => []),
    hasEnabledBackend: jest.fn((backendId: string) => settings.enabledBackends.includes(backendId as never)),
    applyProviderIconColorMode: jest.fn(),
    startConfiguredLocalServerIfNeeded: jest.fn().mockResolvedValue(undefined),
    logServerStatusSnapshot: jest.fn().mockResolvedValue(undefined),
    onModelsLoaded: jest.fn(),
  };
}

describe('PluginRuntimeCoordinator deferred runtime warmup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not probe OpenCode health when OpenCode is enabled but another backend is active', async () => {
    const settings: OpenCodianSettings = {
      ...DEFAULT_SETTINGS,
      enabledBackends: ['opencode', 'codex'],
      activeBackend: 'codex',
      server: {
        ...DEFAULT_SETTINGS.server,
        mode: 'local',
        local: {
          ...DEFAULT_SETTINGS.server.local,
          autoStart: true,
        },
      },
    };
    const host = createWarmupHost(settings);
    const coordinator = new PluginRuntimeCoordinator(host as never);

    coordinator.scheduleDeferredRuntimeWarmup();
    await jest.runOnlyPendingTimersAsync();

    expect(host.startConfiguredLocalServerIfNeeded).not.toHaveBeenCalled();
    expect(host.logServerStatusSnapshot).not.toHaveBeenCalled();
  });
});
