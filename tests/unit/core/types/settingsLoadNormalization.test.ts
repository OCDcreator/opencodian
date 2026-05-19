import { prepareLoadedSettingsBootstrapState } from '../../../../src/core/types/settingsLoadNormalization';

describe('prepareLoadedSettingsBootstrapState backend normalization', () => {
  it('keeps opencode enabled for a fresh install with no persisted settings', () => {
    const state = prepareLoadedSettingsBootstrapState({
      core: {
        data: null,
        filePath: '.opencodian/settings.core.json',
        source: 'missing',
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

    expect(state.settings.enabledBackends).toEqual(['opencode']);
    expect(state.settings.activeBackend).toBe('opencode');
  });

  it('filters unimplemented backends and repairs the active backend', () => {
    const state = prepareLoadedSettingsBootstrapState({
      core: {
        data: {
          enabledBackends: ['codex', 'opencode'],
          activeBackend: 'codex',
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

    expect(state.settings.enabledBackends).toEqual(['opencode']);
    expect(state.settings.activeBackend).toBe('opencode');
  });
});
