import {
  getDefaultBackendSettings,
  normalizeBackendSettings,
} from '../../../../src/core/types/settings';

describe('OpenCode session trace settings', () => {
  it('defaults safe structural tracing on with all six console channels', () => {
    const trace = getDefaultBackendSettings().opencode.sessionTrace;

    expect(trace.enabled).toBe(true);
    expect(trace.consolePreset).toBe('standard');
    expect(Object.keys(trace.consoleChannels)).toHaveLength(6);
    expect(Object.values(trace.consoleChannels).every(Boolean)).toBe(true);
    expect(trace.storageDirectory).toBe('');
  });

  it('migrates missing settings and normalizes invalid persisted values', () => {
    expect(normalizeBackendSettings({}).opencode.sessionTrace.enabled).toBe(true);
    expect(normalizeBackendSettings({
      opencode: {
        sessionTrace: {
          enabled: false,
          consolePreset: 'unknown',
          consoleChannels: { transport: false },
          storageDirectory: '  /tmp/traces  ',
        },
      },
    }).opencode.sessionTrace).toEqual(expect.objectContaining({
      enabled: false,
      consolePreset: 'standard',
      storageDirectory: '/tmp/traces',
      consoleChannels: expect.objectContaining({
        transport: false,
        lifecycle: true,
      }),
    }));
  });
});
