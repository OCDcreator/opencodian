import { describe, expect, it } from '@jest/globals';

import {
  getDefaultBackendSettings,
  normalizeBackendSettings,
  normalizeDshBackendSettings,
} from '../../../../src/core/types/settings';

describe('normalizeDshBackendSettings', () => {
  it('uses native transport and retains the legacy profile marker', () => {
    expect(normalizeDshBackendSettings(undefined)).toEqual({
      executablePath: '',
      workingDirectory: '',
      args: [],
      env: {},
      profile: 'acp',
      transport: 'native',
      mcpServers: [],
      sessionTrace: normalizeDshBackendSettings(undefined).sessionTrace,
    });
    expect(getDefaultBackendSettings().dsh.profile).toBe('acp');
  });

  it('trims launcher fields, preserves environment bytes and drops malformed entries', () => {
    expect(normalizeDshBackendSettings({
      executablePath: '  dsh  ',
      workingDirectory: ' /vault ',
      args: [' --flag ', 42, ''],
      env: { DSH_HOME: ' /tmp/dsh ', 'bad-key': 'drop', VALUE: 42 },
      profile: 'web',
    })).toEqual({
      executablePath: 'dsh',
      workingDirectory: '/vault',
      args: ['--flag'],
      env: { DSH_HOME: ' /tmp/dsh ' },
      profile: 'acp',
      transport: 'native',
      mcpServers: [],
      sessionTrace: normalizeDshBackendSettings(undefined).sessionTrace,
    });
  });

  it('is additive in the complete backend settings map', () => {
    expect(normalizeBackendSettings({ dsh: { executablePath: '/opt/dsh' } }).dsh).toEqual({
      executablePath: '/opt/dsh',
      workingDirectory: '',
      args: [],
      env: {},
      profile: 'acp',
      transport: 'native',
      mcpServers: [],
      sessionTrace: normalizeDshBackendSettings(undefined).sessionTrace,
    });
  });
  it('preserves an explicit ACP compatibility choice', () => {
    expect(normalizeDshBackendSettings({ transport: 'acp' }).transport).toBe('acp');
    expect(normalizeDshBackendSettings({ transport: 'web' }).transport).toBe('native');
  });

  it('leaves native configuration absent for old settings and preserves valid overrides', () => {
    expect(normalizeDshBackendSettings({})).not.toHaveProperty('nativeConfig');
    const nativeConfig = { version: 1, overrides: { 'llm-deepseek': { maxTokens: 1024 } } };
    expect(normalizeDshBackendSettings({ nativeConfig }).nativeConfig).toEqual(nativeConfig);
    expect(normalizeBackendSettings({ dsh: { nativeConfig } }).dsh.nativeConfig).toEqual(nativeConfig);
  });

  it.each([null, 'broken', { version: 2, overrides: {} }, { version: 1, overrides: { unknown: { enabled: true } } }])('preserves invalid persisted native config for the validator and UI %#', (nativeConfig) => {
    expect(normalizeDshBackendSettings({ nativeConfig }).nativeConfig).toBe(nativeConfig);
  });

  it('preserves native MCP advanced fields without changing the legacy declaration', () => {
    const mcpServers = [{ name: 'local', command: '/usr/bin/node', args: ['server.mjs'], env: [], cwd: '/workspace', toolCallTimeoutMs: 1000, failOnStartupError: true, maxInstructionBytes: 2048, reconnect: { enabled: true, initialDelayMs: 10, maxDelayMs: 100, maxAttempts: 2 } }];
    expect(normalizeDshBackendSettings({ mcpServers }).mcpServers).toEqual(mcpServers);
    const invalid = { reconnect: { maxAttempts: -1 } };
    expect(normalizeDshBackendSettings({ mcpServers: invalid }).mcpServers).toBe(invalid);
  });
});
