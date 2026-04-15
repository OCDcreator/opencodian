import type { App } from 'obsidian';
import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS, getDefaultChatAppearanceSettings } from '../../../../src/core/types';
import { LiquidGlassSettingHelpModal } from '../../../../src/features/settings/LiquidGlassSettingHelpModal';
import { SettingsStyleSection } from '../../../../src/features/settings/SettingsStyleSection';
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

function createStyleSection(plugin: ConstructorParameters<typeof SettingsStyleSection>[0]['plugin']): SettingsStyleSection {
  return new SettingsStyleSection({
    app: {} as App,
    plugin,
    createSectionHeading: (containerEl, title) => containerEl.createEl('h3', { text: title }),
    setSettingDescWithFormatting: jest.fn(),
    addSettingHelpButton: jest.fn(),
  });
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

describe('OpenCodian style settings attach wiring', () => {
  registerDropdownRecordHooks();

  it('does not add a separate input theme dropdown anymore', () => {
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        chatAppearance: getDefaultChatAppearanceSettings(),
      },
      getChatAppearanceBaseline: jest.fn(() => getDefaultChatAppearanceSettings()),
    } as unknown as ConstructorParameters<typeof SettingsStyleSection>[0]['plugin'];
    const styleSection = createStyleSection(plugin);
    const containerEl = document.createElement('div');
    const privateSection = styleSection as unknown as {
      attach: (containerEl: HTMLElement) => void;
      addThemePresetSection: (containerEl: HTMLElement) => void;
      addNumericStyleControl: (containerEl: HTMLElement, config: unknown) => void;
      addColorStyleControl: (containerEl: HTMLElement, config: unknown) => void;
      createStyleResetSetting: (containerEl: HTMLElement, group: unknown) => void;
      createStyleGroupSection: (containerEl: HTMLElement, title: string, desc: string) => HTMLElement;
      registerStyleControlBinding: (group: unknown, callback: () => void) => void;
      createBackgroundStyleSection: () => {
        attach: (containerEl: HTMLElement) => void;
        refresh: () => void;
        dispose: () => void;
      };
    };

    jest.spyOn(privateSection, 'addThemePresetSection').mockImplementation(() => {});
    jest.spyOn(privateSection, 'addNumericStyleControl').mockImplementation(() => {});
    jest.spyOn(privateSection, 'addColorStyleControl').mockImplementation(() => {});
    jest.spyOn(privateSection, 'createStyleResetSetting').mockImplementation(() => {});
    jest.spyOn(privateSection, 'createStyleGroupSection').mockImplementation((parent) => parent.createDiv());
    jest.spyOn(privateSection, 'registerStyleControlBinding').mockImplementation(() => {});
    jest.spyOn(privateSection, 'createBackgroundStyleSection').mockReturnValue({
      attach: jest.fn(),
      refresh: jest.fn(),
      dispose: jest.fn(),
    });

    privateSection.attach(containerEl);

    expect(
      dropdownRecords.some((record) => record.name === 'Panel style theme' || record.name === '面板样式主题'),
    ).toBe(false);
  });

  it('adds the input action button style dropdown to the style settings', () => {
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        chatAppearance: getDefaultChatAppearanceSettings(),
      },
      getChatAppearanceBaseline: jest.fn(() => getDefaultChatAppearanceSettings()),
    } as unknown as ConstructorParameters<typeof SettingsStyleSection>[0]['plugin'];
    const styleSection = createStyleSection(plugin);
    const containerEl = document.createElement('div');
    const privateSection = styleSection as unknown as {
      attach: (containerEl: HTMLElement) => void;
      addThemePresetSection: (containerEl: HTMLElement) => void;
      addNumericStyleControl: (containerEl: HTMLElement, config: unknown) => void;
      addColorStyleControl: (containerEl: HTMLElement, config: unknown) => void;
      createStyleResetSetting: (containerEl: HTMLElement, group: unknown) => void;
      createStyleGroupSection: (containerEl: HTMLElement, title: string, desc: string) => HTMLElement;
      registerStyleControlBinding: (group: unknown, callback: () => void) => void;
      createBackgroundStyleSection: () => {
        attach: (containerEl: HTMLElement) => void;
        refresh: () => void;
        dispose: () => void;
      };
    };

    jest.spyOn(privateSection, 'addThemePresetSection').mockImplementation(() => {});
    jest.spyOn(privateSection, 'addNumericStyleControl').mockImplementation(() => {});
    jest.spyOn(privateSection, 'addColorStyleControl').mockImplementation(() => {});
    jest.spyOn(privateSection, 'createStyleResetSetting').mockImplementation(() => {});
    jest.spyOn(privateSection, 'createStyleGroupSection').mockImplementation((parent) => parent.createDiv());
    jest.spyOn(privateSection, 'registerStyleControlBinding').mockImplementation(() => {});
    jest.spyOn(privateSection, 'createBackgroundStyleSection').mockReturnValue({
      attach: jest.fn(),
      refresh: jest.fn(),
      dispose: jest.fn(),
    });

    privateSection.attach(containerEl);

    const actionButtonsDropdown = dropdownRecords.find((record) => record.name === '操作按钮样式');
    expect(actionButtonsDropdown).toBeDefined();
    expect(actionButtonsDropdown?.control.addOption).toHaveBeenCalledWith('default', '独立按钮');
    expect(actionButtonsDropdown?.control.addOption).toHaveBeenCalledWith('etched', '刻入玻璃');
  });
});

describe('OpenCodian style settings helpers', () => {
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
    } as unknown as ConstructorParameters<typeof SettingsStyleSection>[0]['plugin'];
    const styleSection = createStyleSection(plugin);
    const containerEl = document.createElement('div');
    const privateSection = styleSection as unknown as {
      renderInputStyleGroup: (containerEl?: HTMLElement) => void;
      createStyleGroupSection: (containerEl: HTMLElement, title: string, desc: string) => HTMLElement;
      addNumericStyleControl: (containerEl: HTMLElement, config: unknown) => void;
      addLiquidGlassInputControls: (containerEl: HTMLElement) => void;
      createStyleResetSetting: (containerEl: HTMLElement, group: unknown) => void;
      registerStyleControlBinding: (group: unknown, callback: () => void) => void;
    };

    jest.spyOn(privateSection, 'createStyleGroupSection').mockImplementation((parent) => parent.createDiv());
    jest.spyOn(privateSection, 'addNumericStyleControl').mockImplementation(() => {});
    jest.spyOn(privateSection, 'addLiquidGlassInputControls').mockImplementation(() => {});
    jest.spyOn(privateSection, 'createStyleResetSetting').mockImplementation(() => {});
    jest.spyOn(privateSection, 'registerStyleControlBinding').mockImplementation(() => {});

    privateSection.renderInputStyleGroup(containerEl);

    const liquidAdapterDropdown = dropdownRecords.find((record) => record.name === 'Liquid Glass 适配器');
    expect(liquidAdapterDropdown).toBeDefined();
    expect(liquidAdapterDropdown?.control.addOption).not.toHaveBeenCalledWith('liquid-diamond-shuding', 'Shuding Diamond');
    expect(liquidAdapterDropdown?.control.addOption).toHaveBeenCalledWith('liquid-glass-shuding', 'Shuding Liquid Glass');
    expect(liquidAdapterDropdown?.control.addOption).toHaveBeenCalledWith('liquid-glass-nikdelvin', 'Nikdelvin Liquid Glass');
  });

  it('sizes numeric inputs to fit the configured value range', () => {
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        chatAppearance: getDefaultChatAppearanceSettings(),
      },
    } as unknown as ConstructorParameters<typeof SettingsStyleSection>[0]['plugin'];
    const styleSection = createStyleSection(plugin);
    const privateSection = styleSection as unknown as {
      getNumericControlInputChars: (config: { min: number; max: number; step: number }) => number;
    };

    const inputChars = privateSection.getNumericControlInputChars({
      min: 0.01,
      max: 0.211,
      step: 0.001,
    });

    expect(inputChars).toBe(5);
  });

  it('switches input panel theme by rerendering only the input subsection', async () => {
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        chatAppearance: getDefaultChatAppearanceSettings(),
      },
      saveSettings: jest.fn().mockResolvedValue(undefined),
      getChatAppearanceBaseline: jest.fn(() => getDefaultChatAppearanceSettings()),
    } as unknown as ConstructorParameters<typeof SettingsStyleSection>[0]['plugin'];
    const styleSection = createStyleSection(plugin);
    const privateSection = styleSection as unknown as {
      renderInputStyleGroup: (containerEl?: HTMLElement) => void;
      applyInputPanelThemeChange: (themeId: 'preset' | 'glass-refraction-card') => Promise<void>;
    };

    const renderInputStyleGroupSpy = jest
      .spyOn(privateSection, 'renderInputStyleGroup')
      .mockImplementation(() => {});

    await privateSection.applyInputPanelThemeChange('glass-refraction-card');

    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(renderInputStyleGroupSpy).toHaveBeenCalledWith();
    expect(plugin.settings.inputPanelTheme).toBe('glass-refraction-card');
  });

  it('skips stale input rerenders after the attached style runtime is disposed', async () => {
    const saveDeferred = createDeferred<void>();
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        chatAppearance: getDefaultChatAppearanceSettings(),
      },
      saveSettings: jest.fn().mockImplementation(() => saveDeferred.promise),
      getChatAppearanceBaseline: jest.fn(() => getDefaultChatAppearanceSettings()),
    } as unknown as ConstructorParameters<typeof SettingsStyleSection>[0]['plugin'];
    const styleSection = createStyleSection(plugin);
    const backgroundStyleSection = {
      attach: jest.fn(),
      refresh: jest.fn(),
      dispose: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const privateSection = styleSection as unknown as {
      attach: (containerEl: HTMLElement) => void;
      dispose: () => void;
      renderInputStyleGroup: (containerEl?: HTMLElement) => void;
      applyInputPanelThemeChange: (themeId: 'glass-refraction-card') => Promise<void>;
      addThemePresetSection: (containerEl: HTMLElement) => void;
      addNumericStyleControl: (containerEl: HTMLElement, config: unknown) => void;
      addColorStyleControl: (containerEl: HTMLElement, config: unknown) => void;
      createStyleResetSetting: (containerEl: HTMLElement, group: unknown) => void;
      createStyleGroupSection: (containerEl: HTMLElement, title: string, desc: string) => HTMLElement;
      registerStyleControlBinding: (group: unknown, callback: () => void) => void;
      createBackgroundStyleSection: () => typeof backgroundStyleSection;
    };

    jest.spyOn(privateSection, 'addThemePresetSection').mockImplementation(() => {});
    jest.spyOn(privateSection, 'addNumericStyleControl').mockImplementation(() => {});
    jest.spyOn(privateSection, 'addColorStyleControl').mockImplementation(() => {});
    jest.spyOn(privateSection, 'createStyleResetSetting').mockImplementation(() => {});
    jest.spyOn(privateSection, 'createStyleGroupSection').mockImplementation((parent) => parent.createDiv());
    jest.spyOn(privateSection, 'registerStyleControlBinding').mockImplementation(() => {});
    const renderInputStyleGroupSpy = jest
      .spyOn(privateSection, 'renderInputStyleGroup')
      .mockImplementation(() => {});
    jest.spyOn(privateSection, 'createBackgroundStyleSection').mockReturnValue(backgroundStyleSection);

    privateSection.attach(containerEl);
    renderInputStyleGroupSpy.mockClear();

    const changePromise = privateSection.applyInputPanelThemeChange('glass-refraction-card');
    privateSection.dispose();
    saveDeferred.resolve();
    await changePromise;

    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(renderInputStyleGroupSpy).not.toHaveBeenCalled();
    expect(backgroundStyleSection.dispose).toHaveBeenCalledTimes(1);
  });

  it('creates a plain-language help button config for shuding settings only', () => {
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        inputPanelTheme: 'liquid-glass-shuding',
        chatAppearance: getDefaultChatAppearanceSettings(),
      },
    } as unknown as ConstructorParameters<typeof SettingsStyleSection>[0]['plugin'];
    const styleSection = createStyleSection(plugin);
    const privateSection = styleSection as unknown as {
      getLiquidGlassSettingHelpButtonConfig: (
        adapterId: 'shuding' | 'nikdelvin',
        paramKey: string,
        title: string,
      ) => { tooltip: string; onClick: () => void } | undefined;
    };
    const openSpy = jest.spyOn(LiquidGlassSettingHelpModal.prototype, 'open').mockImplementation(() => {});

    const shudingHelp = privateSection.getLiquidGlassSettingHelpButtonConfig('shuding', 'displacementScale', '位移强度');
    const nikdelvinHelp = privateSection.getLiquidGlassSettingHelpButtonConfig('nikdelvin', 'depth', '景深');

    expect(shudingHelp?.tooltip).toBe('用大白话解释这项');
    expect(nikdelvinHelp).toBeUndefined();

    shudingHelp?.onClick();
    expect(openSpy).toHaveBeenCalledTimes(1);
  });
});

describe('OpenCodian style settings color and number controls', () => {
  it('commits color picker changes only after the picker confirms a value', () => {
    const chatAppearance = getDefaultChatAppearanceSettings();
    let createdSettingEl: HTMLElement | null = null;
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        chatAppearance,
      },
      updateChatAppearance: jest.fn((mutator: (appearance: typeof chatAppearance) => void) => {
        mutator(chatAppearance);
      }),
    } as unknown as ConstructorParameters<typeof SettingsStyleSection>[0]['plugin'];
    const styleSection = createStyleSection(plugin);
    const containerEl = document.createElement('div');
    const privateSection = styleSection as unknown as {
      addColorStyleControl: (containerEl: HTMLElement, config: {
        group: 'assistant';
        name: string;
        desc: string;
        value: () => string;
        resetValue: () => string;
        setValue: (appearance: typeof chatAppearance, value: string) => void;
      }) => void;
      applyAndScheduleStyleUpdate: () => void;
    };

    jest.spyOn(Setting.prototype, 'setClass').mockImplementation(function setClass(this: Setting) {
      createdSettingEl = (this as Setting & { settingEl: HTMLElement }).settingEl;
      return this;
    });
    const applySpy = jest.spyOn(privateSection, 'applyAndScheduleStyleUpdate').mockImplementation(() => {});

    privateSection.addColorStyleControl(containerEl, {
      group: 'assistant',
      name: 'Time color',
      desc: 'desc',
      value: () => plugin.settings.chatAppearance.assistant.timeColor,
      resetValue: () => 'var(--text-muted)',
      setValue: (appearance, value) => {
        appearance.assistant.timeColor = value;
      },
    });

    const colorInput = createdSettingEl?.querySelector<HTMLInputElement>('.opencodian-style-color-input') ?? null;
    expect(colorInput).not.toBeNull();

    colorInput!.value = '#336699';
    colorInput!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(plugin.updateChatAppearance).not.toHaveBeenCalled();
    expect(applySpy).not.toHaveBeenCalled();

    colorInput!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(plugin.updateChatAppearance).toHaveBeenCalledTimes(1);
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(plugin.settings.chatAppearance.assistant.timeColor).toBe('#336699');
  });

  it('allows free-form numeric input without snapping it back to the slider step', () => {
    let currentValue = 5;
    const committedValues: number[] = [];
    let createdSettingEl: HTMLElement | null = null;
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        chatAppearance: getDefaultChatAppearanceSettings(),
      },
    } as unknown as ConstructorParameters<typeof SettingsStyleSection>[0]['plugin'];
    const styleSection = createStyleSection(plugin);
    const containerEl = document.createElement('div');
    const privateSection = styleSection as unknown as {
      addNumericControl: (containerEl: HTMLElement, config: {
        name: string;
        desc: string;
        min: number;
        max: number;
        step: number;
        unit: string;
        value: () => number;
        resetValue: () => number;
        commitValue: (value: number) => void;
      }) => void;
    };

    jest.spyOn(Setting.prototype, 'setClass').mockImplementation(function setClass(this: Setting) {
      const settingWithElements = this as Setting & { settingEl: HTMLElement; controlEl?: HTMLElement };
      if (!(settingWithElements.controlEl instanceof HTMLElement)) {
        settingWithElements.controlEl = document.createElement('div');
        settingWithElements.settingEl.appendChild(settingWithElements.controlEl);
      }
      createdSettingEl = settingWithElements.settingEl;
      return this;
    });

    privateSection.addNumericControl(containerEl, {
      name: 'Blur',
      desc: 'desc',
      min: 0,
      max: 10,
      step: 1,
      unit: 'px',
      value: () => currentValue,
      resetValue: () => 5,
      commitValue: (value) => {
        currentValue = value;
        committedValues.push(value);
      },
    });

    const numberInput = createdSettingEl?.querySelector<HTMLInputElement>('.opencodian-style-number') ?? null;
    const sliderInput = createdSettingEl?.querySelector<HTMLInputElement>('.opencodian-style-slider') ?? null;

    expect(numberInput).not.toBeNull();
    expect(sliderInput).not.toBeNull();
    expect(numberInput?.step).toBe('any');

    numberInput!.dispatchEvent(new Event('focus'));
    numberInput!.value = '8.35';
    numberInput!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(currentValue).toBe(8.35);
    expect(committedValues).toEqual([8.35]);
    expect(numberInput!.value).toBe('8.35');
    expect(sliderInput!.value).toBe('8.35');

    numberInput!.dispatchEvent(new Event('blur'));

    expect(numberInput!.value).toBe('8.35');
  });
});

describe('OpenCodian style settings slider and draft controls', () => {
  it('preserves unfinished decimal drafts until the number input is complete', () => {
    let currentValue = 5;
    let createdSettingEl: HTMLElement | null = null;
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        chatAppearance: getDefaultChatAppearanceSettings(),
      },
    } as unknown as ConstructorParameters<typeof SettingsStyleSection>[0]['plugin'];
    const styleSection = createStyleSection(plugin);
    const containerEl = document.createElement('div');
    const privateSection = styleSection as unknown as {
      addNumericControl: (containerEl: HTMLElement, config: {
        name: string;
        desc: string;
        min: number;
        max: number;
        step: number;
        unit: string;
        value: () => number;
        resetValue: () => number;
        commitValue: (value: number) => void;
      }) => void;
    };

    jest.spyOn(Setting.prototype, 'setClass').mockImplementation(function setClass(this: Setting) {
      const settingWithElements = this as Setting & { settingEl: HTMLElement; controlEl?: HTMLElement };
      if (!(settingWithElements.controlEl instanceof HTMLElement)) {
        settingWithElements.controlEl = document.createElement('div');
        settingWithElements.settingEl.appendChild(settingWithElements.controlEl);
      }
      createdSettingEl = settingWithElements.settingEl;
      return this;
    });

    privateSection.addNumericControl(containerEl, {
      name: 'Blur',
      desc: 'desc',
      min: 0,
      max: 10,
      step: 1,
      unit: 'px',
      value: () => currentValue,
      resetValue: () => 5,
      commitValue: (value) => {
        currentValue = value;
      },
    });

    const numberInput = createdSettingEl?.querySelector<HTMLInputElement>('.opencodian-style-number') ?? null;

    expect(numberInput).not.toBeNull();

    numberInput!.dispatchEvent(new Event('focus'));
    numberInput!.value = '8.';
    numberInput!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(currentValue).toBe(5);
    expect(numberInput!.value).toBe('8.');

    numberInput!.value = '8.3';
    numberInput!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(currentValue).toBe(8.3);
    expect(numberInput!.value).toBe('8.3');
  });

  it('defers slider commits while pointer dragging and applies the final value on change', () => {
    let currentValue = 5;
    let createdSettingEl: HTMLElement | null = null;
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        chatAppearance: getDefaultChatAppearanceSettings(),
      },
    } as unknown as ConstructorParameters<typeof SettingsStyleSection>[0]['plugin'];
    const styleSection = createStyleSection(plugin);
    const containerEl = document.createElement('div');
    const privateSection = styleSection as unknown as {
      addNumericControl: (containerEl: HTMLElement, config: {
        name: string;
        desc: string;
        min: number;
        max: number;
        step: number;
        unit: string;
        value: () => number;
        resetValue: () => number;
        commitValue: (value: number) => void;
      }) => void;
    };

    jest.spyOn(Setting.prototype, 'setClass').mockImplementation(function setClass(this: Setting) {
      const settingWithElements = this as Setting & { settingEl: HTMLElement; controlEl?: HTMLElement };
      if (!(settingWithElements.controlEl instanceof HTMLElement)) {
        settingWithElements.controlEl = document.createElement('div');
        settingWithElements.settingEl.appendChild(settingWithElements.controlEl);
      }
      createdSettingEl = settingWithElements.settingEl;
      return this;
    });

    privateSection.addNumericControl(containerEl, {
      name: 'Blur',
      desc: 'desc',
      min: 0,
      max: 10,
      step: 1,
      unit: 'px',
      value: () => currentValue,
      resetValue: () => 5,
      commitValue: (value) => {
        currentValue = value;
      },
    });

    const sliderInput = createdSettingEl?.querySelector<HTMLInputElement>('.opencodian-style-slider') ?? null;
    const numberInput = createdSettingEl?.querySelector<HTMLInputElement>('.opencodian-style-number') ?? null;

    expect(sliderInput).not.toBeNull();
    expect(numberInput).not.toBeNull();

    sliderInput!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    sliderInput!.value = '8';
    sliderInput!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(currentValue).toBe(5);
    expect(numberInput!.value).toBe('8');

    sliderInput!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(currentValue).toBe(8);
  });
});
