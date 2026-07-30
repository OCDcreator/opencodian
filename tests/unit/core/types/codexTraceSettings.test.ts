import { CODEX_TRACE_CHANNEL_IDS } from '../../../../src/core/agents/backend/diagnostics/types';
import { getDefaultBackendSettings, normalizeBackendSettings } from '../../../../src/core/types/settings';

describe('codex sessionTrace settings', () => {
  it('provides defaults mirroring the opencode trace defaults plus captureContent', () => {
    const defaults = getDefaultBackendSettings();
    const trace = defaults.codex.sessionTrace;
    expect(trace.enabled).toBe(true);
    expect(trace.consolePreset).toBe('standard');
    expect(trace.storageDirectory).toBe('');
    expect(trace.captureContent).toBe(true);
    for (const channel of CODEX_TRACE_CHANNEL_IDS) {
      expect(trace.consoleChannels[channel]).toBe(true);
    }
  });

  it('normalizes missing/partial persisted values', () => {
    const normalized = normalizeBackendSettings({ codex: { sessionTrace: { enabled: false, consolePreset: 'full', consoleChannels: { transport: false }, storageDirectory: '  /tmp/x  ', captureContent: false } } } as never);
    const trace = normalized.codex.sessionTrace;
    expect(trace.enabled).toBe(false);
    expect(trace.consolePreset).toBe('full');
    expect(trace.consoleChannels.transport).toBe(false);
    expect(trace.consoleChannels.lifecycle).toBe(true);
    expect(trace.storageDirectory).toBe('/tmp/x');
    expect(trace.captureContent).toBe(false);
  });

  it('defaults captureContent to true unless explicitly false', () => {
    const normalized = normalizeBackendSettings({ codex: {} } as never);
    expect(normalized.codex.sessionTrace.captureContent).toBe(true);
  });
});
