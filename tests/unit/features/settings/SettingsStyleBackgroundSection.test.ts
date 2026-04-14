import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS, getDefaultChatAppearanceSettings } from '../../../../src/core/types';
import { SettingsStyleBackgroundSection } from '../../../../src/features/settings/SettingsStyleBackgroundSection';
import { setLocale } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

type BackgroundSectionPlugin = Pick<
  OpenCodianPlugin,
  | 'settings'
  | 'getChatAppearanceBaseline'
  | 'updateChatAppearance'
  | 'applyChatAppearanceSettings'
  | 'scheduleChatAppearanceSave'
  | 'resolveChatThemeBackgroundDataUrl'
  | 'importChatThemeBackgroundFile'
  | 'clearChatThemeBackground'
  | 'resetChatAppearanceGroupAndSave'
>;

describe('SettingsStyleBackgroundSection', () => {
  let fitModeOnChange: ((value: string) => void | Promise<void>) | null = null;

  function createPlugin(): BackgroundSectionPlugin {
    const chatAppearance = getDefaultChatAppearanceSettings();

    return {
      settings: {
        ...DEFAULT_SETTINGS,
        chatAppearance,
      },
      getChatAppearanceBaseline: jest.fn(() => getDefaultChatAppearanceSettings()),
      updateChatAppearance: jest.fn((mutator: (appearance: typeof chatAppearance) => void) => {
        mutator(chatAppearance);
      }),
      applyChatAppearanceSettings: jest.fn(),
      scheduleChatAppearanceSave: jest.fn(),
      resolveChatThemeBackgroundDataUrl: jest.fn().mockResolvedValue(null),
      importChatThemeBackgroundFile: jest.fn().mockResolvedValue(undefined),
      clearChatThemeBackground: jest.fn().mockResolvedValue(undefined),
      resetChatAppearanceGroupAndSave: jest.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(() => {
    setLocale('zh');
    document.body.innerHTML = '';
    fitModeOnChange = null;

    jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function addDropdown(
      this: Setting,
      callback: (control: {
        addOption: (value: string, label: string) => unknown;
        setValue: (value: string) => unknown;
        onChange: (next: (value: string) => void | Promise<void>) => unknown;
        selectEl: HTMLSelectElement;
      }) => unknown,
    ) {
      const control = {
        addOption: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn((next: (value: string) => void | Promise<void>) => {
          fitModeOnChange = next;
          return control;
        }),
        selectEl: document.createElement('select'),
      };
      callback(control);
      return this;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the full background subsection and clears stale bindings before rebuilds', () => {
    const plugin = createPlugin();
    const addNumericStyleControl = jest.fn((containerEl: HTMLElement) => {
      containerEl.createDiv({ cls: 'background-control' });
    });
    const clearStyleControlBindings = jest.fn();
    const refreshStyleControlValues = jest.fn();
    const applyAndScheduleStyleUpdate = jest.fn();
    const section = new SettingsStyleBackgroundSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createStyleGroupSection: (containerEl) => containerEl.createDiv(),
      addNumericStyleControl,
      clearStyleControlBindings,
      refreshStyleControlValues,
      applyAndScheduleStyleUpdate,
      clampStyleNumber: (value, min, max) => Math.min(max, Math.max(min, value)),
    });
    const containerEl = document.createElement('div');

    section.attach(containerEl);

    expect(containerEl.querySelector('.opencodian-style-background-group-host')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-theme-background-card')).not.toBeNull();
    expect(clearStyleControlBindings).toHaveBeenCalledWith('background');
    expect(addNumericStyleControl).toHaveBeenCalledTimes(9);
    expect(containerEl.querySelectorAll('.background-control')).toHaveLength(9);
  });

  it('updates fit mode through the owner and rerenders the subsection', () => {
    const plugin = createPlugin();
    const addNumericStyleControl = jest.fn((containerEl: HTMLElement) => {
      containerEl.createDiv({ cls: 'background-control' });
    });
    const clearStyleControlBindings = jest.fn();
    const refreshStyleControlValues = jest.fn();
    const applyAndScheduleStyleUpdate = jest.fn();
    const section = new SettingsStyleBackgroundSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createStyleGroupSection: (containerEl) => containerEl.createDiv(),
      addNumericStyleControl,
      clearStyleControlBindings,
      refreshStyleControlValues,
      applyAndScheduleStyleUpdate,
      clampStyleNumber: (value, min, max) => Math.min(max, Math.max(min, value)),
    });
    const containerEl = document.createElement('div');

    section.attach(containerEl);

    expect(fitModeOnChange).not.toBeNull();
    void fitModeOnChange?.('contain');

    expect(plugin.updateChatAppearance).toHaveBeenCalledTimes(1);
    expect(plugin.settings.chatAppearance.background.fitMode).toBe('contain');
    expect(applyAndScheduleStyleUpdate).toHaveBeenCalledTimes(1);
    expect(clearStyleControlBindings).toHaveBeenCalledTimes(2);
    expect(addNumericStyleControl).toHaveBeenCalledTimes(18);
    expect(refreshStyleControlValues).not.toHaveBeenCalled();
  });

  it('resets the background group through the subsection owner', async () => {
    const plugin = createPlugin();
    const addNumericStyleControl = jest.fn();
    const clearStyleControlBindings = jest.fn();
    const refreshStyleControlValues = jest.fn();
    const applyAndScheduleStyleUpdate = jest.fn();
    const section = new SettingsStyleBackgroundSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createStyleGroupSection: (containerEl) => containerEl.createDiv(),
      addNumericStyleControl,
      clearStyleControlBindings,
      refreshStyleControlValues,
      applyAndScheduleStyleUpdate,
      clampStyleNumber: (value, min, max) => Math.min(max, Math.max(min, value)),
    });
    const containerEl = document.createElement('div');

    section.attach(containerEl);
    await section.reset();

    expect(plugin.resetChatAppearanceGroupAndSave).toHaveBeenCalledWith('background');
    expect(refreshStyleControlValues).toHaveBeenCalledWith('background');
    expect(clearStyleControlBindings).toHaveBeenCalledTimes(2);
    expect(applyAndScheduleStyleUpdate).not.toHaveBeenCalled();
  });
});
