import type { App } from 'obsidian';
import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS, getDefaultChatAppearanceSettings } from '../../../../src/core/types';
import { LiquidGlassSettingHelpModal } from '../../../../src/features/settings/LiquidGlassSettingHelpModal';
import { SettingsStyleInputPanelSection } from '../../../../src/features/settings/SettingsStyleInputPanelSection';
import { SettingsStyleLiquidGlassInputControls } from '../../../../src/features/settings/SettingsStyleLiquidGlassInputControls';
import { setLocale } from '../../../../src/i18n';
import { registerBuiltinGlassAdapters } from '../../../../src/utils/glass/builtin-adapters';

interface MockDropdownControl {
  addOption: jest.MockedFunction<(value: string, label: string) => MockDropdownControl>;
  setValue: jest.MockedFunction<(value: string) => MockDropdownControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>;
  selectEl: HTMLSelectElement;
}

interface DropdownRecord {
  name: string;
  control: MockDropdownControl;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function createDropdownRecord(name: string): DropdownRecord {
  const record: DropdownRecord = {
    name,
    control: {
      addOption: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
      selectEl: document.createElement('select'),
    },
  };

  record.control.addOption.mockReturnValue(record.control);
  record.control.setValue.mockReturnValue(record.control);
  record.control.onChange.mockReturnValue(record.control);

  return record;
}

const dropdownRecords: DropdownRecord[] = [];

function registerDropdownRecordHooks() {
  beforeEach(() => {
    setLocale('zh');
    document.body.innerHTML = '';
    dropdownRecords.length = 0;

    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
      (this as Setting & { __settingName?: string }).__settingName = name;
      return this;
    });
    jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting) {
      return this;
    });
    jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function addDropdown(
      this: Setting,
      callback: (control: MockDropdownControl) => unknown,
    ) {
      const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
      const record = createDropdownRecord(name);
      dropdownRecords.push(record);
      callback(record.control);
      return this;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
}

function createInputPanelSection(
  plugin: ConstructorParameters<typeof SettingsStyleInputPanelSection>[0]['plugin'],
  overrides: Partial<Omit<ConstructorParameters<typeof SettingsStyleInputPanelSection>[0], 'app' | 'plugin'>> = {},
): SettingsStyleInputPanelSection {
  return new SettingsStyleInputPanelSection({
    app: {} as App,
    plugin,
    createStyleGroupSection: (containerEl) => containerEl.createDiv(),
    addNumericControl: jest.fn(),
    addNumericStyleControl: jest.fn(),
    createStyleResetSetting: jest.fn(),
    registerStyleControlBinding: jest.fn(),
    clearStyleControlBindings: jest.fn(),
    applyAndScheduleStyleUpdate: jest.fn(),
    addSettingHelpButton: jest.fn(),
    ...overrides,
  });
}

function createLiquidGlassControls(
  plugin: ConstructorParameters<typeof SettingsStyleLiquidGlassInputControls>[0]['plugin'],
): SettingsStyleLiquidGlassInputControls {
  return new SettingsStyleLiquidGlassInputControls({
    app: {} as App,
    plugin,
    addNumericControl: jest.fn(),
    addSettingHelpButton: jest.fn(),
  });
}

describe('SettingsStyleInputPanelSection', () => {
  registerDropdownRecordHooks();

  it('does not expose the standalone diamond input theme in the liquid glass adapter dropdown', () => {
    registerBuiltinGlassAdapters();

    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        inputPanelTheme: 'liquid-glass-shuding',
        chatAppearance: getDefaultChatAppearanceSettings(),
      },
      getChatAppearanceBaseline: jest.fn(() => getDefaultChatAppearanceSettings()),
    } as unknown as ConstructorParameters<typeof SettingsStyleInputPanelSection>[0]['plugin'];
    const inputPanelSection = createInputPanelSection(plugin);

    inputPanelSection.attach(document.createElement('div'));

    const liquidAdapterDropdown = dropdownRecords.find((record) => record.name === 'Liquid Glass 适配器');
    expect(liquidAdapterDropdown).toBeDefined();
    expect(liquidAdapterDropdown?.control.addOption).not.toHaveBeenCalledWith('liquid-diamond-shuding', 'Shuding Diamond');
    expect(liquidAdapterDropdown?.control.addOption).toHaveBeenCalledWith('liquid-glass-shuding', 'Shuding Liquid Glass');
    expect(liquidAdapterDropdown?.control.addOption).toHaveBeenCalledWith('liquid-glass-nikdelvin', 'Nikdelvin Liquid Glass');
  });

  it('switches input panel theme by rerendering only the input subsection', async () => {
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        chatAppearance: getDefaultChatAppearanceSettings(),
      },
      saveSettings: jest.fn().mockResolvedValue(undefined),
      getChatAppearanceBaseline: jest.fn(() => getDefaultChatAppearanceSettings()),
    } as unknown as ConstructorParameters<typeof SettingsStyleInputPanelSection>[0]['plugin'];
    const inputPanelSection = createInputPanelSection(plugin);
    inputPanelSection.attach(document.createElement('div'));

    const refreshSpy = jest.spyOn(inputPanelSection, 'refresh').mockImplementation(() => {});

    await inputPanelSection.applyInputPanelThemeChange('glass-refraction-card');

    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(plugin.settings.inputPanelTheme).toBe('glass-refraction-card');
  });

  it('skips stale input rerenders after the owner is disposed', async () => {
    const saveDeferred = createDeferred<void>();
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        chatAppearance: getDefaultChatAppearanceSettings(),
      },
      saveSettings: jest.fn().mockImplementation(() => saveDeferred.promise),
      getChatAppearanceBaseline: jest.fn(() => getDefaultChatAppearanceSettings()),
    } as unknown as ConstructorParameters<typeof SettingsStyleInputPanelSection>[0]['plugin'];
    const inputPanelSection = createInputPanelSection(plugin);
    inputPanelSection.attach(document.createElement('div'));

    const refreshSpy = jest.spyOn(inputPanelSection, 'refresh').mockImplementation(() => {});

    const changePromise = inputPanelSection.applyInputPanelThemeChange('glass-refraction-card');
    inputPanelSection.dispose();
    saveDeferred.resolve();
    await changePromise;

    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});

describe('SettingsStyleLiquidGlassInputControls', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a plain-language help button config for shuding settings only', () => {
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        inputPanelTheme: 'liquid-glass-shuding',
        chatAppearance: getDefaultChatAppearanceSettings(),
      },
    } as unknown as ConstructorParameters<typeof SettingsStyleLiquidGlassInputControls>[0]['plugin'];
    const controls = createLiquidGlassControls(plugin);
    const privateControls = controls as unknown as {
      getLiquidGlassSettingHelpButtonConfig: (
        adapterId: 'shuding' | 'nikdelvin',
        paramKey: string,
        title: string,
      ) => { tooltip: string; onClick: () => void } | undefined;
    };
    const openSpy = jest.spyOn(LiquidGlassSettingHelpModal.prototype, 'open').mockImplementation(() => {});

    const shudingHelp = privateControls.getLiquidGlassSettingHelpButtonConfig('shuding', 'displacementScale', '位移强度');
    const nikdelvinHelp = privateControls.getLiquidGlassSettingHelpButtonConfig('nikdelvin', 'depth', '景深');

    expect(shudingHelp?.tooltip).toBe('用大白话解释这项');
    expect(nikdelvinHelp).toBeUndefined();

    shudingHelp?.onClick();
    expect(openSpy).toHaveBeenCalledTimes(1);
  });
});
