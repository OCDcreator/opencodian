import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { PiAdapter } from '../../../../../../src/core/agents/backend/pi/PiAdapter';
import { PI_OPTIONAL_RPC_COMMANDS, PI_RPC_COMMANDS, type PiCommandName, type PiNativeSessionEntry } from '../../../../../../src/core/agents/backend/pi/PiProtocol';
import type { PiLaunchOptions, PiRecord } from '../../../../../../src/core/agents/backend/pi/PiRpcClient';

const root = path.resolve(__dirname, '../../../../../..');
const commandModuleUrl = pathToFileURL(path.join(root, 'assets/pi/commands.mjs')).href;
// Exercise the real service handler in external Node using only offline SDK fixtures.
// Credentials, model factories and the production service bootstrap are never loaded.
const offlineDispatchSource = `
import { readFileSync } from 'node:fs';
const { executeCommand } = await import(${JSON.stringify(commandModuleUrl)});
const { command, fixture } = JSON.parse(readFileSync(0, 'utf8'));
const sessionManager = {
  ...(fixture.entriesAvailable ? { getEntries: () => fixture.entries } : {}),
  ...(fixture.leafAvailable ? { getLeafId: () => fixture.leafId } : {}),
};
const host = { sdk: { VERSION: 'offline-fixture-sdk' }, auth: {}, runtime: { session: {
  messages: [], modelRegistry: {}, sessionManager,
  ...(fixture.thinkingAvailable ? { getAvailableThinkingLevels: () => fixture.levels } : {}),
} } };
try { process.stdout.write(JSON.stringify({ success: true, data: await executeCommand(host, command) })); }
catch (error) { process.stdout.write(JSON.stringify({ success: false, error: error.message })); }
`;

interface OfflineSdkFixture {
  thinkingAvailable: boolean;
  entriesAvailable: boolean;
  leafAvailable: boolean;
  levels: string[];
  entries: PiNativeSessionEntry[];
  leafId: string | null;
}

const nativeEntries: PiNativeSessionEntry[] = [
  { id: 'native-root', parentId: null, type: 'thinking_level_change', thinkingLevel: 'low' },
  { id: 'native-old-branch', parentId: 'native-root', type: 'message', message: { role: 'user', content: 'First branch' } },
  { id: 'native-current-branch', parentId: 'native-root', type: 'custom', customType: 'fixture', data: { untouched: true } },
];

function publicReadFixture(overrides: Partial<OfflineSdkFixture> = {}) {
  const fixture: OfflineSdkFixture = { thinkingAvailable: true, entriesAvailable: true, leafAvailable: true,
    levels: ['off', 'minimal'], entries: nativeEntries, leafId: 'native-current-branch', ...overrides };
  const request = jest.fn(async (command: PiRecord): Promise<PiRecord> => {
    const report = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', offlineDispatchSource], {
      cwd: root, input: JSON.stringify({ command, fixture }), encoding: 'utf8', windowsHide: true,
    })) as { success: boolean; data: PiRecord; error?: string };
    if (!report.success) throw new Error(report.error);
    return report.data;
  });
  const close = jest.fn();
  const createClient = jest.fn((launch: PiLaunchOptions) => {
    if (launch.configurationOnly) throw new Error('Optional session reads must never launch the configuration client.');
    return { request, subscribe: () => () => {}, close };
  });
  const adapter = new PiAdapter({ workingDirectory: root, createClient });
  return { adapter, fixture, request, createClient, close };
}

it('runs the offline SDK read-command contract through the standard unit test entrypoint', () => {
  const testFile = path.join(__dirname, 'PiSdkReadCommands.test.mjs');
  const report = execFileSync(process.execPath, ['--test', testFile], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  });
  expect(report).toContain('# fail 0');
});

it('keeps optional RPC reads separate from the legacy mandatory handshake', () => {
  expect(PI_OPTIONAL_RPC_COMMANDS).toEqual(['get_available_thinking_levels', 'get_entries']);
  for (const command of PI_OPTIONAL_RPC_COMMANDS) expect(PI_RPC_COMMANDS as readonly string[]).not.toContain(command);
});

it('dispatches both typed reads through the real SDK command handler without a configuration client', async () => {
  const { adapter, fixture, request, createClient, close } = publicReadFixture();
  // Both assignments must compile without a type assertion.
  const thinkingCommand: PiCommandName = 'get_available_thinking_levels';
  const entriesCommand: PiCommandName = 'get_entries';
  try {
    await expect(adapter.command(undefined, thinkingCommand)).resolves.toEqual({ levels: ['off', 'minimal'] });
    fixture.levels = ['high'];
    await expect(adapter.command(undefined, thinkingCommand)).resolves.toEqual({ levels: ['high'] });
    fixture.levels = [];
    await expect(adapter.command(undefined, thinkingCommand)).resolves.toEqual({ levels: [] });
    await expect(adapter.command(undefined, entriesCommand)).resolves.toEqual({ entries: nativeEntries, leafId: fixture.leafId });
    await expect(adapter.command(undefined, entriesCommand, { since: 'native-root', type: 'get_configuration' })).resolves.toEqual({
      entries: nativeEntries.slice(1), leafId: fixture.leafId,
    });
    expect(request).toHaveBeenCalledWith({ type: entriesCommand, since: 'native-root' }, 30000);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(expect.objectContaining({ configurationOnly: false }));
  } finally { adapter.dispose(); }
  expect(close).toHaveBeenCalledTimes(1);
});

it('preserves append-order since and native leaf identity across branch moves, including empty history', async () => {
  const { adapter, fixture } = publicReadFixture();
  const command: PiCommandName = 'get_entries';
  try {
    await expect(adapter.command(undefined, command, { since: 'native-old-branch' })).resolves.toEqual({
      entries: [nativeEntries[2]], leafId: 'native-current-branch',
    });
    fixture.leafId = 'native-old-branch';
    await expect(adapter.command(undefined, command, { since: 'native-current-branch' })).resolves.toEqual({
      entries: [], leafId: 'native-old-branch',
    });
    fixture.entries = [];
    fixture.leafId = null;
    await expect(adapter.command(undefined, command)).resolves.toEqual({ entries: [], leafId: null });
  } finally { adapter.dispose(); }
});

it.each([
  { thinkingAvailable: false, entriesAvailable: true, leafAvailable: true },
  { thinkingAvailable: true, entriesAvailable: false, leafAvailable: true },
  { thinkingAvailable: true, entriesAvailable: true, leafAvailable: false },
  { thinkingAvailable: false, entriesAvailable: false, leafAvailable: false },
])('keeps legacy mandatory handshake and reports actual SDK method availability: %j', async (availability) => {
  const { adapter, createClient } = publicReadFixture(availability);
  const entriesAvailable = availability.entriesAvailable && availability.leafAvailable;
  try {
    const state = await adapter.command(undefined, 'get_state');
    const commands = state.commands as string[];
    const capabilities = state.capabilities as Record<string, { status: string }>;
    expect(commands.includes('get_available_thinking_levels')).toBe(availability.thinkingAvailable);
    expect(commands.includes('get_entries')).toBe(entriesAvailable);
    expect(capabilities.get_available_thinking_levels.status).toBe(availability.thinkingAvailable ? 'available' : 'unavailable');
    expect(capabilities.get_entries.status).toBe(entriesAvailable ? 'available' : 'unavailable');
    const thinking = await adapter.command(undefined, 'get_available_thinking_levels');
    const history = await adapter.command(undefined, 'get_entries');
    const unavailableReason = expect.any(String);
    expect(thinking).toEqual(availability.thinkingAvailable ? { levels: ['off', 'minimal'] } : {
      command: 'get_available_thinking_levels', status: 'unavailable', reason: unavailableReason,
    });
    expect(history).toEqual(entriesAvailable ? { entries: nativeEntries, leafId: 'native-current-branch' } : {
      command: 'get_entries', status: 'unavailable', reason: unavailableReason,
    });
    expect(createClient).toHaveBeenCalledWith(expect.objectContaining({ configurationOnly: false }));
  } finally { adapter.dispose(); }
});

it.each(['missing-native-id', '0', ''])('rejects unknown since ID %j through public dispatch without full-history fallback', async (since) => {
  const { adapter } = publicReadFixture();
  try { await expect(adapter.command(undefined, 'get_entries', { since })).rejects.toThrow(`Entry not found: ${since}`); }
  finally { adapter.dispose(); }
});

it.each([0, null, {}])('rejects invalid native since cursor %j through public dispatch', async (since) => {
  const { adapter } = publicReadFixture();
  try { await expect(adapter.command(undefined, 'get_entries', { since })).rejects.toThrow('since must be a native entry ID.'); }
  finally { adapter.dispose(); }
});

it('rejects undeclared public operations before launching any SDK/configuration client', async () => {
  const createClient = jest.fn(() => { throw new Error('No client should start for an undeclared operation.'); });
  const adapter = new PiAdapter({ workingDirectory: root, createClient });
  try {
    await expect(adapter.command(undefined, 'get_entries_typo' as PiCommandName, { type: 'get_configuration' })).rejects.toThrow('Unknown Pi operation.');
    expect(createClient).not.toHaveBeenCalled();
  } finally { adapter.dispose(); }
});
