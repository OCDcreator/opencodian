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
    });
  });
  it('preserves an explicit ACP compatibility choice', () => {
    expect(normalizeDshBackendSettings({ transport: 'acp' }).transport).toBe('acp');
    expect(normalizeDshBackendSettings({ transport: 'web' }).transport).toBe('native');
  });
});
