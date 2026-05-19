import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  BACKEND_OPTIONS,
  SettingsBackendSection,
} from '../../../../src/features/settings/SettingsBackendSection';
import { setLocale } from '../../../../src/i18n';

describe('SettingsBackendSection', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes only implemented backends in Phase 0', () => {
    expect(BACKEND_OPTIONS.map((option) => option.id)).toEqual(['opencode']);
  });

  it('attaches without rendering future backend options', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsBackendSection({
      plugin: {
        settings: { ...DEFAULT_SETTINGS },
        saveSettings: jest.fn().mockResolvedValue(undefined),
        agentServiceRegistry: undefined,
        openCodeService: undefined,
      } as never,
      requestDisplayRefresh: jest.fn(),
    });

    section.attach(containerEl);

    expect(containerEl.textContent).not.toContain('Claude Code');
    expect(containerEl.textContent).not.toContain('Codex');
  });
});
