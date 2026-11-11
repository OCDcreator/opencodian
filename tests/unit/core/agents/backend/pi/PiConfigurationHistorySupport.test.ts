import { PiAdapter } from '../../../../../../src/core/agents/backend/pi/PiAdapter';
import { PI_CONFIG_COMMANDS, PI_OPTIONAL_CONFIG_COMMANDS, PI_OPTIONAL_RPC_COMMANDS, PI_RPC_COMMANDS, PI_SDK_COMMANDS, type PiConfigurationHistory } from '../../../../../../src/core/agents/backend/pi/PiProtocol';
import type { PiLaunchOptions, PiRecord, PiRpcPort } from '../../../../../../src/core/agents/backend/pi/PiRpcClient';
import { PiSessionRuntime } from '../../../../../../src/core/agents/backend/pi/PiSessionRuntime';

interface ClientHarness {
  client: PiRpcPort;
  request: jest.Mock;
  respond?: jest.Mock;
}

function createClientHarness(commands: readonly string[], stateExtra: PiRecord = {}): ClientHarness {
  const request = jest.fn(async (message: PiRecord) => {
    if (message.type === 'get_state') return { serviceProtocol: 1, commands: [...commands], ...stateExtra };
    return { ok: true };
  });
  return { client: { request: request as unknown as PiRpcPort['request'], subscribe: () => () => {}, close: jest.fn() }, request };
}

function createAdapter(client: PiRpcPort): PiAdapter {
  return new PiAdapter({
    workingDirectory: '/fixture',
    sessionDirectory: '/fixture',
    servicePath: '/service',
    createClient: (_options: PiLaunchOptions) => client,
  });
}

describe('PI configuration history handshake contract', () => {
  it('keeps the required handshake minimal while exposing the optional history commands separately', () => {
    expect(PI_CONFIG_COMMANDS).toEqual(['get_configuration', 'save_configuration', 'get_model_configuration', 'save_model_configuration']);
    expect(PI_OPTIONAL_CONFIG_COMMANDS).toEqual(['get_configuration_history', 'restore_configuration']);
    // Optional config commands must never join the required handshake list.
    for (const name of PI_OPTIONAL_CONFIG_COMMANDS) expect(PI_CONFIG_COMMANDS).not.toContain(name);
    for (const name of PI_OPTIONAL_RPC_COMMANDS) expect(PI_CONFIG_COMMANDS).not.toContain(name);
    expect([...PI_RPC_COMMANDS, ...PI_SDK_COMMANDS]).not.toContain('restore_configuration');
  });

  it.each([true, false])('accepts assets with optional history commands advertised=%s and records them', async (advertised) => {
    const commands = [...PI_RPC_COMMANDS, ...PI_SDK_COMMANDS, ...PI_CONFIG_COMMANDS, ...(advertised ? PI_OPTIONAL_CONFIG_COMMANDS : [])];
    const harness = createClientHarness(commands);
    const runtime = new PiSessionRuntime({ workingDirectory: '/fixture', sessionDirectory: '/fixture', servicePath: '/service', createClient: () => harness.client });
    try {
      await runtime.get('configuration');
      await expect(runtime.getAdvertisedCommands('configuration')).resolves.toEqual(commands);
    } finally { runtime.dispose(); }
  });

  it('returns null advertised commands with no live connection and after disposal', async () => {
    const harness = createClientHarness([...PI_RPC_COMMANDS, ...PI_SDK_COMMANDS, ...PI_CONFIG_COMMANDS]);
    const runtime = new PiSessionRuntime({ workingDirectory: '/fixture', sessionDirectory: '/fixture', servicePath: '/service', createClient: () => harness.client });
    await expect(runtime.getAdvertisedCommands('configuration')).resolves.toBeNull();
    await runtime.get('configuration');
    runtime.dispose();
    await expect(runtime.getAdvertisedCommands('configuration')).resolves.toBeNull();
  });

  it('still rejects a handshake that drops a mandatory configuration command', async () => {
    const close = jest.fn();
    const runtime = new PiSessionRuntime({ workingDirectory: '/fixture', sessionDirectory: '/fixture', servicePath: '/service', createClient: () => ({
      request: async () => ({ serviceProtocol: 1, commands: [...PI_RPC_COMMANDS, ...PI_SDK_COMMANDS, ...PI_CONFIG_COMMANDS].filter(name => name !== 'save_model_configuration') }),
      subscribe: () => () => {}, close,
    }) });
    await expect(runtime.get('configuration')).rejects.toThrow('Pi service protocol mismatch');
    expect(close).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });
});

describe('PI adapter configuration history support', () => {
  const historyDocument: PiConfigurationHistory = {
    models: { path: '/fixture/agent/models.json', key: 'models', entries: [{ index: 1, savedAt: 1700000000000, revision: 'a'.repeat(64), bytes: 42 }] },
    settings: {
      global: { path: '/fixture/agent/settings.json', key: 'settings-global', entries: [] },
      project: { path: '/fixture/project/.pi/settings.json', key: 'settings-project', entries: [{ index: 1, savedAt: 1700000000001, revision: 'b'.repeat(64), bytes: 7 }] },
    },
  };

  it('detects support on modern assets and routes history commands to the configuration session', async () => {
    const commands = [...PI_RPC_COMMANDS, ...PI_SDK_COMMANDS, ...PI_CONFIG_COMMANDS, ...PI_OPTIONAL_CONFIG_COMMANDS];
    const harness = createClientHarness(commands);
    (harness.request as jest.Mock).mockImplementation(async (message: PiRecord) => {
      if (message.type === 'get_state') return { serviceProtocol: 1, commands: [...commands] };
      if (message.type === 'get_configuration_history') return historyDocument;
      return { ok: true };
    });
    const adapter = createAdapter(harness.client);
    await expect(adapter.supportsConfigurationHistory()).resolves.toBe(true);
    await expect(adapter.getConfigurationHistory()).resolves.toEqual(historyDocument);
    const [, request] = harness.request.mock.calls as unknown as [[PiRecord], [PiRecord]];
    expect(request[0].type).toBe('get_configuration_history');
    await adapter.restoreConfiguration({ target: 'models', index: 1, archivedRevision: 'a'.repeat(64), revision: 'c'.repeat(64) });
    const third = (harness.request.mock.calls as unknown as [[PiRecord]])[2][0];
    expect(third.type).toBe('restore_configuration');
    expect(third.target).toBe('models');
    expect(third.index).toBe(1);
    expect(third.archivedRevision).toBe('a'.repeat(64));
    expect(third.revision).toBe('c'.repeat(64));
  });

  it('degrades honestly on legacy assets instead of pretending history exists', async () => {
    const harness = createClientHarness([...PI_RPC_COMMANDS, ...PI_SDK_COMMANDS, ...PI_CONFIG_COMMANDS]);
    const adapter = createAdapter(harness.client);
    await expect(adapter.supportsConfigurationHistory()).resolves.toBe(false);
    await expect(adapter.getConfigurationHistory()).rejects.toThrow('Pi service does not support configuration history. Update the bundled Pi service assets.');
    await expect(adapter.restoreConfiguration({ target: 'settings', scope: 'global', index: 1, archivedRevision: 'a', revision: 'b' })).rejects.toThrow('Pi service does not support configuration history');
    // The unsupported service must never receive the optional commands.
    for (const call of harness.request.mock.calls as unknown as [[PiRecord]]) {
      expect(PI_OPTIONAL_CONFIG_COMMANDS).not.toContain(call[0].type);
    }
  });

  it('rejects malformed history payloads instead of passing them to the UI', async () => {
    const commands = [...PI_RPC_COMMANDS, ...PI_SDK_COMMANDS, ...PI_CONFIG_COMMANDS, ...PI_OPTIONAL_CONFIG_COMMANDS];
    const request = jest.fn(async (message: PiRecord) => {
      if (message.type === 'get_state') return { serviceProtocol: 1, commands: [...commands] };
      if (message.type === 'get_configuration_history') return { models: {}, settings: {} };
      return { ok: true };
    });
    const adapter = createAdapter({ request: request as unknown as PiRpcPort['request'], subscribe: () => () => {}, close: jest.fn() });
    await expect(adapter.getConfigurationHistory()).rejects.toThrow('Invalid Pi configuration history response.');
  });
});
