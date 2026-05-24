import {
  isOpenCodeSettingsBackendActive,
  resolveSettingsActiveBackend,
} from '../../../../src/features/settings/settingsBackendGuards';

describe('settingsBackendGuards', () => {
  it('uses the configured active backend when it is enabled', () => {
    expect(
      resolveSettingsActiveBackend({
        activeBackend: 'claude-code',
        enabledBackends: ['opencode', 'claude-code'],
      }),
    ).toBe('claude-code');
  });

  it('falls back to the first enabled backend when activeBackend is stale', () => {
    expect(
      resolveSettingsActiveBackend({
        activeBackend: 'missing-backend',
        enabledBackends: ['opencode', 'claude-code'],
      }),
    ).toBe('opencode');
  });

  it('preserves legacy OpenCode-active behavior when settings are unavailable', () => {
    expect(isOpenCodeSettingsBackendActive(undefined)).toBe(true);
  });
});
