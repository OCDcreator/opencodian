import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsInlineEditSection } from '../../../../src/features/settings/SettingsInlineEditSection';
import { setLocale } from '../../../../src/i18n';

describe('OpenCode 2 inline model settings', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('shows separate edit and completion override controls when the backend is enabled', () => {
    setLocale('en');
    const names: string[] = [];
    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
      names.push(name);
      return this;
    });
    const section = new SettingsInlineEditSection({
      plugin: {
        settings: { ...DEFAULT_SETTINGS, enabledBackends: ['opencode2'] },
        saveSettings: jest.fn().mockResolvedValue(undefined),
      },
      createSectionHeading: (container, title) => container.createEl('h3', { text: title }),
    });

    section.attach(document.createElement('div'));

    expect(names.filter((name) => name.includes('opencode2'))).toHaveLength(2);
  });
});
