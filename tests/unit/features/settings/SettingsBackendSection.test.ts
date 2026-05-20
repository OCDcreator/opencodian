import { Setting } from 'obsidian';

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

  it('exposes implemented backends without exposing future placeholders', () => {
    expect(BACKEND_OPTIONS.map((option) => option.id)).toEqual(['opencode', 'claude-code']);
  });

  it('attaches implemented backend options without rendering future backend placeholders', () => {
    const containerEl = document.createElement('div');
    const names: string[] = [];
    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
      names.push(name);
      return this;
    });
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

    expect(names).toContain('Claude Code');
    expect(names).not.toContain('Codex');
  });
});
