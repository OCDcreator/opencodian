import { Setting, type TextComponent } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { prepareLoadedSettingsBootstrapState } from '../../../../src/core/types/settingsLoadNormalization';
import { SettingsInlineEditSection } from '../../../../src/features/settings/general/SettingsInlineEditSection';
import { setLocale, t } from '../../../../src/i18n';

interface CapturedTextControl {
  value: string;
  change(value: string): unknown;
}

function captureTextControls(): Map<string, CapturedTextControl> {
  const names = new WeakMap<Setting, string>();
  const controls = new Map<string, CapturedTextControl>();
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (this: Setting, name: string) {
    names.set(this, name);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (this: Setting, configure) {
    const control: CapturedTextControl = { value: '', change: () => undefined };
    const text = {
      setPlaceholder: () => text,
      setValue: (value: string) => { control.value = value; return text; },
      onChange: (change: (value: string) => unknown) => { control.change = change; return text; },
    };
    configure(text as unknown as TextComponent);
    controls.set(names.get(this) ?? '', control);
    return this;
  });
  return controls;
}

describe('per-backend inline model settings', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('keeps per-backend override rows out of the shared inline-edit page', () => {
    setLocale('en');
    const names: string[] = [];
    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
      names.push(name);
      return this;
    });
    const section = new SettingsInlineEditSection({
      plugin: {
        settings: { ...DEFAULT_SETTINGS, enabledBackends: ['opencode2', 'claude-code'] },
        saveSettings: jest.fn().mockResolvedValue(undefined),
      },
      createSectionHeading: (container, title) => container.createEl('h3', { text: title }),
    });

    section.attach(document.createElement('div'));

    expect(names.filter((name) => name.includes('opencode2'))).toHaveLength(0);
    expect(names.filter((name) => name.includes('claude-code'))).toHaveLength(0);
    expect(names).toContain(t('settings.inlineEdit.enabled.name'));
    expect(names).toContain(t('settings.inlineCompletion.enabled.name'));
  });

  it.each([
    ['inlineEditModelOverrides', 'settings.inlineEdit.override.name'],
    ['inlineCompletionModelOverrides', 'settings.inlineCompletion.modelOverride.name'],
  ] as const)('renders, saves, reloads and clears the OpenCode 2 %s workspace control', async (field, nameKey) => {
    setLocale('en');
    const controls = captureTextControls();
    const snapshots: string[] = [];
    const plugin: { settings: typeof DEFAULT_SETTINGS; saveSettings(): Promise<void> } = {
      settings: {
        ...DEFAULT_SETTINGS,
        enabledBackends: ['opencode', 'opencode2', 'zcode'],
        inlineEditModelOverrides: { opencode: 'legacy/edit' },
        inlineCompletionModelOverrides: { opencode: 'legacy/fast', zcode: 'zcode/fast' },
      },
      saveSettings: jest.fn(async () => { snapshots.push(JSON.stringify(plugin.settings)); }),
    };
    const existingOverrides = { ...plugin.settings[field] };
    const mount = () => {
      const host = document.createElement('div');
      SettingsInlineEditSection.renderBackendModelOverrides(host, 'opencode2', plugin);
      return host;
    };
    mount();

    const rowName = t(nameKey, { backend: 'opencode2' });
    expect(controls.has(t('settings.inlineEdit.override.name', { backend: 'zcode' }))).toBe(false);
    expect(controls.has(rowName)).toBe(true);
    await controls.get(rowName)!.change('  next/model  ');

    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(JSON.parse(snapshots[0])[field]).toEqual({ ...existingOverrides, opencode2: 'next/model' });
    plugin.settings = prepareLoadedSettingsBootstrapState({
      core: {
        data: JSON.parse(snapshots[0]),
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
    }).settings;
    expect(plugin.settings[field]).toEqual({ ...existingOverrides, opencode2: 'next/model' });
    expect(plugin.settings.inlineEditModelOverrides.zcode).toBeUndefined();
    expect(plugin.settings.inlineCompletionModelOverrides.zcode).toBe('zcode/fast');
    controls.clear();
    mount();
    expect(controls.get(rowName)?.value).toBe('next/model');

    // A malformed edit stays visible without overwriting the saved selection.
    await controls.get(rowName)!.change('no-slash');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.settings[field].opencode2).toBe('next/model');

    await controls.get(rowName)!.change('   ');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
    expect(JSON.parse(snapshots[1])[field]).toEqual(existingOverrides);
  });

  it('renders only the completion override for ZCode because aux edit is not supported', () => {
    setLocale('en');
    const names: string[] = [];
    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
      names.push(name);
      return this;
    });
    SettingsInlineEditSection.renderBackendModelOverrides(
      document.createElement('div'),
      'zcode',
      { settings: { ...DEFAULT_SETTINGS }, saveSettings: jest.fn() },
    );

    expect(names).toEqual([t('settings.inlineCompletion.modelOverride.name', { backend: 'zcode' })]);
  });
});
