import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  createOpenCodeServiceTestContext,
  type MockOpenCodeServiceSdkClient,
} from './OpenCodeService.testSupport';

type CapabilityProbeSdkClient = MockOpenCodeServiceSdkClient & {
  global: {
    health: jest.Mock;
    event: jest.Mock;
  };
  v2: {
    pty: { create: jest.Mock };
  };
};

function attachCapabilityProbeSdkClient(mockSdkClient: MockOpenCodeServiceSdkClient): CapabilityProbeSdkClient {
  const client = mockSdkClient as CapabilityProbeSdkClient;
  client.global = {
    ...client.global,
    health: jest.fn().mockResolvedValue({ healthy: true, version: '1.17.18' }),
  };
  client.v2 = { pty: { create: jest.fn() } };
  return client;
}

function createCapabilitySettings() {
  return {
    ...DEFAULT_SETTINGS,
    opencodeCapabilities: {
      schemaVersion: 1,
      experimentalGates: { 'v2.pty.create': true },
      preferences: {},
    },
  };
}

async function refreshPtyCapability(settings = createCapabilitySettings()) {
  const context = createOpenCodeServiceTestContext(settings);
  attachCapabilityProbeSdkClient(context.mockSdkClient);
  await context.service.refreshSdkCapabilities();
  expect(context.service.requireSdkCapability('v2.pty.create')).toEqual({ kind: 'available' });
  return { ...context, settings };
}

describe('OpenCodeService capability cache', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('preserves refreshed server evidence for unrelated settings updates', async () => {
    const { service, settings } = await refreshPtyCapability();

    await service.updateSettings({ ...settings, userName: 'Unrelated preference' });

    expect(service.requireSdkCapability('v2.pty.create')).toEqual({ kind: 'available' });
  });

  it('invalidates refreshed evidence after the effective local endpoint changes', async () => {
    const { service, settings } = await refreshPtyCapability();

    await service.updateSettings({
      ...settings,
      server: {
        ...settings.server,
        local: { ...settings.server.local, port: settings.server.local.port + 1 },
      },
    });

    expect(service.requireSdkCapability('v2.pty.create')).toMatchObject({ kind: 'unknown' });
  });

  it('invalidates refreshed evidence after a remote base URL change', async () => {
    const settings = {
      ...createCapabilitySettings(),
      server: {
        ...DEFAULT_SETTINGS.server,
        mode: 'remote' as const,
        remote: { baseUrl: 'http://first.example.test' },
      },
    };
    const { service } = await refreshPtyCapability(settings);

    await service.updateSettings({
      ...settings,
      server: { ...settings.server, remote: { baseUrl: 'http://second.example.test' } },
    });

    expect(service.requireSdkCapability('v2.pty.create')).toMatchObject({ kind: 'unknown' });
  });

  it('preserves refreshed evidence for inactive branches and normalized-equivalent URLs', async () => {
    const local = await refreshPtyCapability();
    await local.service.updateSettings({
      ...local.settings,
      server: { ...local.settings.server, remote: { baseUrl: 'http://inactive.example.test' } },
    });
    expect(local.service.requireSdkCapability('v2.pty.create')).toEqual({ kind: 'available' });

    const remoteSettings = {
      ...createCapabilitySettings(),
      server: {
        ...DEFAULT_SETTINGS.server,
        mode: 'remote' as const,
        remote: { baseUrl: 'http://remote.example.test' },
      },
    };
    const remote = await refreshPtyCapability(remoteSettings);
    await remote.service.updateSettings({
      ...remoteSettings,
      server: { ...remoteSettings.server, remote: { baseUrl: 'http://remote.example.test/' } },
    });
    expect(remote.service.requireSdkCapability('v2.pty.create')).toEqual({ kind: 'available' });
  });

  it('invalidates refreshed evidence after auth and experimental-gate changes', async () => {
    const bearerSettings = {
      ...createCapabilitySettings(),
      server: {
        ...DEFAULT_SETTINGS.server,
        auth: { ...DEFAULT_SETTINGS.server.auth, type: 'bearer' as const, token: 'first-token' },
      },
    };
    const bearer = await refreshPtyCapability(bearerSettings);
    await bearer.service.updateSettings({
      ...bearerSettings,
      server: {
        ...bearerSettings.server,
        auth: { ...bearerSettings.server.auth, token: 'second-token' },
      },
    });
    expect(bearer.service.requireSdkCapability('v2.pty.create')).toMatchObject({ kind: 'unknown' });

    const gated = await refreshPtyCapability();
    await gated.service.updateSettings({
      ...gated.settings,
      opencodeCapabilities: {
        ...gated.settings.opencodeCapabilities,
        experimentalGates: { 'v2.pty.create': false },
      },
    });
    expect(gated.service.requireSdkCapability('v2.pty.create')).toMatchObject({ kind: 'disabled-by-user' });
  });

  it('uses the effective authorization header for cache identity', async () => {
    const bearerSettings = {
      ...createCapabilitySettings(),
      server: {
        ...DEFAULT_SETTINGS.server,
        auth: { ...DEFAULT_SETTINGS.server.auth, type: 'bearer' as const, token: ' first-token ' },
      },
    };
    const bearer = await refreshPtyCapability(bearerSettings);
    await bearer.service.updateSettings({
      ...bearerSettings,
      server: {
        ...bearerSettings.server,
        auth: { ...bearerSettings.server.auth, token: 'first-token' },
      },
    });
    expect(bearer.service.requireSdkCapability('v2.pty.create')).toEqual({ kind: 'available' });

    const basicSettings = {
      ...createCapabilitySettings(),
      server: {
        ...DEFAULT_SETTINGS.server,
        auth: {
          ...DEFAULT_SETTINGS.server.auth,
          type: 'basic' as const,
          username: 'user',
          password: 'first-password',
        },
      },
    };
    const basic = await refreshPtyCapability(basicSettings);
    await basic.service.updateSettings({
      ...basicSettings,
      server: {
        ...basicSettings.server,
        auth: { ...basicSettings.server.auth, password: 'second-password' },
      },
    });
    expect(basic.service.requireSdkCapability('v2.pty.create')).toMatchObject({ kind: 'unknown' });
  });
});
