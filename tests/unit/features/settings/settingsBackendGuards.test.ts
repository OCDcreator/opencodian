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
        enabledBackends: ['opencode2', 'claude-code'],
      }),
    ).toBe('opencode2');
  });

  it('treats unavailable settings as retired-backend inactive (opencode2)', () => {
    expect(isOpenCodeSettingsBackendActive(undefined)).toBe(false);
    expect(resolveSettingsActiveBackend(undefined)).toBe('opencode2');
  });
});
