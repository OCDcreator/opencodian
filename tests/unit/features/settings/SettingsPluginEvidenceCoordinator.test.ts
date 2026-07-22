import type {
  OpenCodeEventSubscriptionInput,
  OpenCodeEventUnsubscribe,
} from '../../../../src/core/opencode/OpenCodeEventSubscriptionCoordinator';
import { OpenCodeSdkFacade } from '../../../../src/core/opencode/OpenCodeSdkFacade';
import type { OpenCodeService } from '../../../../src/core/opencode/OpenCodeService';
import type { OpenCodianSettings } from '../../../../src/core/types/settings';
import { getServerBaseUrl } from '../../../../src/core/types/settings';
import { SettingsPluginEvidenceCoordinator } from '../../../../src/features/settings/SettingsPluginEvidenceCoordinator';

jest.mock('../../../../src/core/opencode/OpenCodeSdkFacade', () => ({
  OpenCodeSdkFacade: jest.fn(),
}));

const mockConfigGet = jest.fn().mockResolvedValue({ plugin: ['test-plugin'] });
const mockGetConnectionSignature = jest.fn().mockReturnValue('gen-1');

(OpenCodeSdkFacade as unknown as jest.Mock).mockImplementation(() => ({
  getConnectionSignature: mockGetConnectionSignature,
  config: {
    get: mockConfigGet,
  },
}));

function createSettings(overrides: Partial<OpenCodianSettings['server']> = {}): OpenCodianSettings {
  return {
    server: {
      mode: 'local',
      local: {
        host: '127.0.0.1',
        port: 4096,
        autoStart: true,
        executablePath: '',
      },
      remote: {
        baseUrl: 'http://127.0.0.1:4096',
      },
      auth: {
        type: 'none',
        username: 'opencode',
        password: '',
        token: '',
      },
      ...overrides,
    },
  } as unknown as OpenCodianSettings;
}

describe('SettingsPluginEvidenceCoordinator transport construction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function captureFacadeOptions(): { baseUrl: string; authHeaders: Record<string, string>; directory?: string } | undefined {
    const call = (OpenCodeSdkFacade as unknown as jest.Mock).mock.calls[0];
    if (!call) return undefined;
    const provider = call[0] as () => { baseUrl: string; authHeaders: Record<string, string>; directory?: string };
    return provider();
  }

  function createService(observerRef: { current?: { fetchPluginConfig: () => Promise<unknown> } }): OpenCodeService {
    return {
      subscribeToOpenCodeEvents: jest.fn((input: OpenCodeEventSubscriptionInput) => {
        const observer = input as { fetchPluginConfig: () => Promise<unknown> };
        observerRef.current = observer;
        const dispose = jest.fn() as OpenCodeEventUnsubscribe;
        dispose.getPluginEvidenceSnapshot = jest.fn();
        dispose.refreshPluginConfigEvidence = jest.fn().mockImplementation(() => observer.fetchPluginConfig());
        return dispose;
      }),
    } as unknown as OpenCodeService;
  }

  it('builds directory-scoped SDK facade with current baseUrl and no auth', async () => {
    const settings = createSettings();
    const observerRef: { current?: { fetchPluginConfig: () => Promise<unknown> } } = {};
    const coordinator = new SettingsPluginEvidenceCoordinator({
      openCodeService: createService(observerRef),
      getSettings: () => settings,
      vaultPath: '/vault',
    });

    coordinator.subscribe(jest.fn());
    await observerRef.current?.fetchPluginConfig();

    expect(OpenCodeSdkFacade).toHaveBeenCalledTimes(1);
    const options = captureFacadeOptions();
    expect(options?.baseUrl).toBe(getServerBaseUrl(settings.server));
    expect(options?.directory).toBe('/vault');
    expect(options?.authHeaders).toEqual({});
  });

  it('uses bearer auth headers when configured', async () => {
    const settings = createSettings({
      auth: {
        type: 'bearer',
        username: 'opencode',
        password: '',
        token: 'secret-token',
      },
    });
    const observerRef: { current?: { fetchPluginConfig: () => Promise<unknown> } } = {};
    const coordinator = new SettingsPluginEvidenceCoordinator({
      openCodeService: createService(observerRef),
      getSettings: () => settings,
      vaultPath: '/vault',
    });

    coordinator.subscribe(jest.fn());
    await observerRef.current?.fetchPluginConfig();

    const options = captureFacadeOptions();
    expect(options?.authHeaders).toEqual({ Authorization: 'Bearer secret-token' });
  });

  it('uses basic auth headers when configured', async () => {
    const settings = createSettings({
      auth: {
        type: 'basic',
        username: 'user',
        password: 'pass',
        token: '',
      },
    });
    const observerRef: { current?: { fetchPluginConfig: () => Promise<unknown> } } = {};
    const coordinator = new SettingsPluginEvidenceCoordinator({
      openCodeService: createService(observerRef),
      getSettings: () => settings,
      vaultPath: '/vault',
    });

    coordinator.subscribe(jest.fn());
    await observerRef.current?.fetchPluginConfig();

    const credentials = Buffer.from('user:pass').toString('base64');
    const options = captureFacadeOptions();
    expect(options?.authHeaders).toEqual({ Authorization: `Basic ${credentials}` });
  });

  it('normalizes Windows vault directory paths', async () => {
    const observerRef: { current?: { fetchPluginConfig: () => Promise<unknown> } } = {};
    const coordinator = new SettingsPluginEvidenceCoordinator({
      openCodeService: createService(observerRef),
      getSettings: () => createSettings(),
      vaultPath: 'C:\\vault',
    });

    coordinator.subscribe(jest.fn());
    await observerRef.current?.fetchPluginConfig();

    const options = captureFacadeOptions();
    expect(options?.directory).toBe('C:/vault');
  });

  it('refresh delegates to directory-scoped config.get through the observer handle', async () => {
    const observerRef: { current?: { fetchPluginConfig: () => Promise<unknown> } } = {};
    const coordinator = new SettingsPluginEvidenceCoordinator({
      openCodeService: createService(observerRef),
      getSettings: () => createSettings(),
      vaultPath: '/vault',
    });

    coordinator.subscribe(jest.fn());
    const result = await coordinator.refresh();

    expect(mockConfigGet).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ plugin: ['test-plugin'] });
  });

  it('recreates facade when server settings change', async () => {
    let settings = createSettings({ mode: 'remote', remote: { baseUrl: 'http://first' } });
    const observerRef: { current?: { fetchPluginConfig: () => Promise<unknown> } } = {};
    const coordinator = new SettingsPluginEvidenceCoordinator({
      openCodeService: createService(observerRef),
      getSettings: () => settings,
      vaultPath: '/vault',
    });

    coordinator.subscribe(jest.fn());
    await observerRef.current?.fetchPluginConfig();
    expect(captureFacadeOptions()?.baseUrl).toBe('http://first');

    settings = createSettings({ mode: 'remote', remote: { baseUrl: 'http://second' } });
    coordinator.dispose();
    coordinator.subscribe(jest.fn());
    await observerRef.current?.fetchPluginConfig();

    expect(OpenCodeSdkFacade).toHaveBeenCalledTimes(2);
    expect(captureFacadeOptions()?.baseUrl).toBe('http://second');
  });
});
