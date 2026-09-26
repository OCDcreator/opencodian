/**
 * ZCodeAdapter.hardening.test.ts — compatibility hardening (ticket 09).
 *
 * Explicit protocol negotiation capture, child-process restart coverage
 * (stop → start again with the first transport disposed and no orphan), and
 * diagnostic redaction boundaries (remote error payloads can never flood or
 * leak into the user-facing surface).
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { ZCodeAdapter } from '../../../../../src/core/agents/backend/zcode/ZCodeAdapter';
import type { ZCodeAppServerTransport } from '../../../../../src/core/agents/backend/zcode/ZCodeAppServerTransport';
import { redactZCodeDiagnosticText } from '../../../../../src/core/agents/backend/zcode/ZCodeProtocolTypes';
import type { ZCodeProviderConfigSnapshot } from '../../../../../src/core/agents/backend/zcode/ZCodeProviderConfigDiscovery';
import type { ZCodeRuntimeResolution } from '../../../../../src/core/agents/backend/zcode/ZCodeRuntimeResolver';

const providerConfig: ZCodeProviderConfigSnapshot = {
  dataRoot: '/home/tester/.zcode',
  configPath: '/home/tester/.zcode/v2/provider_config.json',
  builtinConfigPath: '/builtin/zcode-builtin.json',
  state: 'validated',
  providerCount: 7,
  detail: null,
  env: { ZCODE_STORAGE_DIR: '/home/tester/.zcode' },
};

const readyResolution: ZCodeRuntimeResolution = {
  mode: 'ready',
  launch: {
    command: '/runtime/zcode-agent',
    args: ['app-server', '--stdio'],
    entryKind: 'native-binary',
    entryPath: '/runtime/zcode-agent',
    source: 'app-bundled',
    extraEnv: {},
  },
};

interface FakeTransport {
  start: jest.Mock<() => Promise<void>>;
  request: jest.Mock<(method: string, params?: Record<string, unknown>) => Promise<unknown>>;
  dispose: jest.Mock<() => void>;
  onNotification: jest.Mock<() => { dispose: () => void }>;
  onServerRequest: jest.Mock<() => { dispose: () => void }>;
}

let slashCommandsInCreate: { name: string; description: string; inputHint: string; source: string }[] = [];
let capturedExits: Array<((detail: { exitCode: number | null; signal: string | null }) => void) | undefined> = [];

function createFakeTransport(overrides: Partial<FakeTransport> = {}): FakeTransport {
  return {
    start: jest.fn(async () => {}),
    request: jest.fn(async (method: string) => {
      if (method === 'runtime/capabilities') return { independentPlanState: true };
      if (method === 'session/create') return {
        session: { sessionId: 'sess_a' },
        protocol: { name: 'ZCode Protocol', version: 1 },
        settings: { model: { available: [{ ref: { providerId: 'p', modelId: 'm1' }, label: 'm1', reasoning: { levels: [] } }] } },
        slashCommands: slashCommandsInCreate,
      };
      return {};
    }),
    dispose: jest.fn(),
    onNotification: jest.fn(() => ({ dispose: jest.fn() })),
    onServerRequest: jest.fn(() => ({ dispose: jest.fn() })),
    ...overrides,
  };
}

describe('ZCodeAdapter — protocol negotiation and restart hardening', () => {
  let transports: FakeTransport[];

  function startAdapter(): ZCodeAdapter {
    transports = [];
    capturedExits = [];
    slashCommandsInCreate = [];
    return new ZCodeAdapter({
      workingDirectory: '/vault',
      resolveRuntime: () => readyResolution,
      discoverProviderConfig: () => providerConfig,
      createTransport: (options) => {
        capturedExits.push(options.onExit);
        const fake = createFakeTransport();
        transports.push(fake);
        return fake as unknown as ZCodeAppServerTransport;
      },
    });
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('captures the negotiated protocol version from session/create (additive negotiation evidence)', async () => {
    const adapter = startAdapter();
    await adapter.start();
    expect(adapter.getRuntimeDiagnostics().protocolVersion).toBeNull();
    await adapter.createSession();
    expect(adapter.getRuntimeDiagnostics().protocolVersion).toBe(1);
    adapter.dispose();
  });

  it('restart disposes the first transport and completes a fresh handshake with no orphan', async () => {
    const adapter = startAdapter();
    await adapter.start();
    expect(transports).toHaveLength(1);
    await adapter.stop();
    expect(transports[0].dispose).toHaveBeenCalledTimes(1);
    expect(adapter.status).toBe('disconnected');

    await adapter.start();
    expect(transports).toHaveLength(2);
    expect(transports[1].request).toHaveBeenCalledWith('runtime/capabilities', {});
    expect(adapter.status).toBe('connected');
    adapter.dispose();
    expect(transports[1].dispose).toHaveBeenCalledTimes(1);
  });

  it('ignores a disposed predecessor transport exit (restart lifecycle poison regression)', async () => {
    const adapter = startAdapter();
    await adapter.start();
    const firstExit = capturedExits[0];
    await adapter.stop();
    await adapter.start();
    expect(adapter.status).toBe('connected');

    // The disposed predecessor's late exit must not poison the fresh lifecycle.
    firstExit?.({ exitCode: 143, signal: null });
    expect(adapter.status).toBe('connected');
    expect(adapter.getRuntimeDiagnostics().lastError).toBeNull();

    // The CURRENT transport's exit still ends the lifecycle honestly.
    capturedExits[1]?.({ exitCode: 1, signal: null });
    expect(adapter.status).toBe('error');
    expect(adapter.getRuntimeDiagnostics().lastError).toContain('process exited');
    adapter.dispose();
  });

  it('captures slash commands from the snapshot root (real-snapshot wiring regression)', async () => {
    const adapter = startAdapter();
    await adapter.start();
    slashCommandsInCreate.push({ name: 'goal', description: 'Set the goal', inputHint: '/goal', source: 'builtin' });
    await adapter.createSession();
    expect(adapter.getSlashCommands().map((command) => command.name)).toContain('goal');
    adapter.dispose();
  });

  it('never copies untrusted remote text into user-facing diagnostics', () => {
    const remote = 'token=abc prompt=private-notes path=/Users/example/vault image=data:image/png;base64,AAAA';
    const diagnostic = redactZCodeDiagnosticText(remote);
    expect(diagnostic).toContain('ZCode');
    for (const sensitive of ['abc', 'private-notes', '/Users/example/vault', 'data:image/png']) {
      expect(diagnostic).not.toContain(sensitive);
    }
    expect(redactZCodeDiagnosticText('short')).not.toBe('short');
  });
});
