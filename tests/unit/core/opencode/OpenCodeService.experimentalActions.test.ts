import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  createOpenCodeServiceTestContext,
  type MockOpenCodeServiceSdkClient,
} from './OpenCodeService.testSupport';

type ExperimentalSdkClient = MockOpenCodeServiceSdkClient & {
  global: {
    health: jest.Mock;
    event: jest.Mock;
  };
  experimental: {
    controlPlane: { moveSession: jest.Mock };
    session: { background: jest.Mock };
  };
  v2: {
    pty: { create: jest.Mock; remove: jest.Mock };
    projectCopy: { create: jest.Mock };
    session: { create: jest.Mock };
  };
};

function attachExperimentalSdkClient(mockSdkClient: MockOpenCodeServiceSdkClient): ExperimentalSdkClient {
  const client = mockSdkClient as ExperimentalSdkClient;
  client.global = {
    ...client.global,
    health: jest.fn().mockResolvedValue({ healthy: true, version: '1.17.18' }),
  };
  client.experimental = {
    controlPlane: { moveSession: jest.fn().mockResolvedValue({ data: true }) },
    session: { background: jest.fn().mockResolvedValue({ data: true }) },
  };
  client.v2 = {
    pty: {
      create: jest.fn().mockResolvedValue({ data: { id: 'pty-1' } }),
      remove: jest.fn().mockResolvedValue({ data: true }),
    },
    projectCopy: { create: jest.fn().mockResolvedValue({ data: { id: 'copy-1' } }) },
    session: { create: jest.fn().mockResolvedValue({ data: { id: 'session-2' } }) },
  };
  return client;
}

describe('OpenCodeService experimental actions', () => {
  it('does not call the SDK while the PTY user gate is disabled', async () => {
    const { service, mockSdkClient } = createOpenCodeServiceTestContext(DEFAULT_SETTINGS);
    const client = attachExperimentalSdkClient(mockSdkClient);

    await expect(service.runExperimentalAction({
      action: 'pty.create',
      capabilityId: 'v2.pty.create',
      confirmation: {
        confirmed: true,
        scope: 'test vault',
        target: 'echo smoke-test',
        cleanup: 'remove-created-pty',
      },
      input: { cmd: 'echo', args: ['smoke-test'] },
    })).resolves.toMatchObject({
      kind: 'unsupported',
      availability: 'disabled-by-user',
    });
    expect(client.v2.pty.create).not.toHaveBeenCalled();
  });

  it('routes an enabled confirmed PTY action through the facade and returns a redacted result', async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      opencodeCapabilities: {
        schemaVersion: 1,
        experimentalGates: { 'v2.pty.create': true },
        preferences: {},
      },
    };
    const { service, mockSdkClient } = createOpenCodeServiceTestContext(settings);
    const client = attachExperimentalSdkClient(mockSdkClient);
    const input = { command: 'echo', args: ['smoke-test'], cwd: 'test vault' };

    await expect(service.runExperimentalAction({
      action: 'pty.create',
      capabilityId: 'v2.pty.create',
      confirmation: {
        confirmed: true,
        scope: 'test vault',
        target: 'echo',
        cleanup: 'remove-created-pty',
      },
      input,
    })).resolves.toEqual({ kind: 'completed', ptyId: 'pty-1' });
    expect(client.v2.pty.create).toHaveBeenCalledWith(input);
    expect(client.v2.pty.remove).not.toHaveBeenCalled();
  });
});
