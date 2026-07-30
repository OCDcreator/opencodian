import { CLAUDE_TRACE_CHANNEL_IDS } from '../../../../src/core/agents/backend/diagnostics/types';
import {
  getDefaultBackendSettings,
  normalizeBackendSettings,
} from '../../../../src/core/types/settings';
import { prepareLoadedSettingsBootstrapState } from '../../../../src/core/types/settingsLoadNormalization';

describe('claude sessionTrace settings', () => {
  it('provides enabled standard defaults for all five channels', () => {
    const trace = getDefaultBackendSettings().claudeCode.sessionTrace;

    expect(trace).toEqual({
      enabled: true,
      consolePreset: 'standard',
      consoleChannels: {
        lifecycle: true,
        'stream-sync': true,
        'tool-interaction': true,
        'persistence-recovery': true,
        'service-output': true,
      },
      storageDirectory: '',
    });
    for (const channel of CLAUDE_TRACE_CHANNEL_IDS) {
      expect(trace.consoleChannels[channel]).toBe(true);
    }
  });

  it('normalizes partial persisted values and trims the storage directory', () => {
    const normalized = normalizeBackendSettings({
      claudeCode: {
        sessionTrace: {
          enabled: false,
          consolePreset: 'full',
          consoleChannels: { lifecycle: false },
          storageDirectory: '  /tmp/claude-traces  ',
        },
      },
    } as never);
    const trace = normalized.claudeCode.sessionTrace;

    expect(trace.enabled).toBe(false);
    expect(trace.consolePreset).toBe('full');
    expect(trace.consoleChannels.lifecycle).toBe(false);
    expect(trace.consoleChannels['stream-sync']).toBe(true);
    expect(trace.storageDirectory).toBe('/tmp/claude-traces');
  });

  it('accepts the off preset and falls back to standard for invalid values', () => {
    expect(normalizeBackendSettings({
      claudeCode: { sessionTrace: { consolePreset: 'off' } },
    } as never).claudeCode.sessionTrace.consolePreset).toBe('off');
    expect(normalizeBackendSettings({
      claudeCode: { sessionTrace: { consolePreset: 'bogus' } },
    } as never).claudeCode.sessionTrace.consolePreset).toBe('standard');
  });

  it('normalizes invalid and non-object values to safe defaults', () => {
    const normalized = normalizeBackendSettings({
      claudeCode: {
        sessionTrace: {
          enabled: 'yes',
          consolePreset: 42,
          consoleChannels: 'invalid',
          storageDirectory: 42,
        },
      },
    } as never).claudeCode.sessionTrace;

    expect(normalized.enabled).toBe(true);
    expect(normalized.consolePreset).toBe('standard');
    expect(normalized.storageDirectory).toBe('');
    expect(Object.values(normalized.consoleChannels)).toEqual([true, true, true, true, true]);
  });

  it('keeps sessionTrace normalization when settings are loaded from storage', () => {
    const state = prepareLoadedSettingsBootstrapState({
      core: {
        data: {
          backendSettings: {
            claudeCode: {
              sessionTrace: {
                enabled: false,
                consolePreset: 'off',
                consoleChannels: { 'service-output': false },
                storageDirectory: '  /var/tmp/claude  ',
              },
            },
          },
        },
        filePath: '.opencodian/settings.core.json',
        source: 'primary',
        shouldPersist: false,
      },
      ui: {
        data: null,
        filePath: '.opencodian/settings.ui.json',
        source: 'missing',
        shouldPersist: false,
      },
      writable: true,
      shouldPersist: false,
    });

    expect(state.settings.backendSettings.claudeCode.sessionTrace).toEqual({
      enabled: false,
      consolePreset: 'off',
      consoleChannels: {
        lifecycle: true,
        'stream-sync': true,
        'tool-interaction': true,
        'persistence-recovery': true,
        'service-output': false,
      },
      storageDirectory: '/var/tmp/claude',
    });
  });
});
