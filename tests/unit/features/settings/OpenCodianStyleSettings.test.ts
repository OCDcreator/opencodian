/* eslint-disable max-lines -- Style settings tests keep wiring, helpers, and preset coverage together in one file. */
import type { App } from 'obsidian';
import { Setting } from 'obsidian';

import { getBuiltinThemePresets, getThemePresetDefinition } from '../../../../src/core/theme';
import { DEFAULT_SETTINGS, getDefaultChatAppearanceSettings } from '../../../../src/core/types';
import { SettingsStylePresetSection } from '../../../../src/features/settings/SettingsStylePresetSection';
import { SettingsStyleSection } from '../../../../src/features/settings/SettingsStyleSection';
import { TextareaSizeMemory } from '../../../../src/features/settings/TextareaSizeMemory';
import { setLocale } from '../../../../src/i18n';

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

function createPresetSection(
  plugin: ConstructorParameters<typeof SettingsStylePresetSection>[0]['plugin'],
  onThemeAppearanceChanged = jest.fn(),
): SettingsStylePresetSection {
  return new SettingsStylePresetSection({
    plugin,
    createStyleGroupSection: (containerEl, title, desc) => {
      const sectionEl = containerEl.createDiv();
      sectionEl.createEl('h4', { text: title });
      sectionEl.createEl('p', { text: desc });
      return sectionEl.createDiv();
    },
    onThemeAppearanceChanged,
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
      getActiveThemePresetDefinition: jest.fn(() => null),
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
      getActiveThemePresetDefinition: jest.fn(() => null),
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

  it('attaches textarea size memory to advanced custom CSS textarea', () => {
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        chatAppearance: getDefaultChatAppearanceSettings(),
      },
      getChatAppearanceBaseline: jest.fn(() => getDefaultChatAppearanceSettings()),
      updateChatAppearance: jest.fn(),
    } as unknown as ConstructorParameters<typeof SettingsStyleSection>[0]['plugin'];
    const styleSection = createStyleSection(plugin);
    const containerEl = document.createElement('div');
    const attachSpy = jest.spyOn(TextareaSizeMemory, 'attach').mockReturnValue({
      destroy: jest.fn(),
    } as unknown as TextareaSizeMemory);
    const addTextAreaSpy = jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(function addTextArea(
      this: Setting,
      callback: (control: {
        inputEl: HTMLTextAreaElement;
        setPlaceholder: (value: string) => unknown;
        setValue: (value: string) => unknown;
        onChange: (handler: (value: string) => void | Promise<void>) => unknown;
      }) => unknown,
    ) {
      const inputEl = document.createElement('textarea');
      callback({
        inputEl,
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      });
      return this;
    });
    const privateSection = styleSection as unknown as {
      addAdvancedStyleGroup: (containerEl: HTMLElement) => void;
      createStyleGroupSection: (containerEl: HTMLElement, title: string, desc: string) => HTMLElement;
      registerStyleControlBinding: (group: unknown, callback: () => void) => void;
    };

    jest.spyOn(privateSection, 'createStyleGroupSection').mockImplementation((parent) => parent.createDiv());
    jest.spyOn(privateSection, 'registerStyleControlBinding').mockImplementation(() => {});

    privateSection.addAdvancedStyleGroup(containerEl);

    expect(addTextAreaSpy).toHaveBeenCalled();
    expect(attachSpy).toHaveBeenCalledWith(expect.any(HTMLTextAreaElement), 'style-custom-css-declarations');
  });
});

describe('OpenCodian style preset section', () => {
  beforeEach(() => {
    setLocale('zh');
    document.body.innerHTML = '';
  });

  it('renders override state and resets the active preset appearance', async () => {
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        theme: {
          ...DEFAULT_SETTINGS.theme,
          activePresetId: 'glass-classic',
          customAppearanceOverrides: {
            assistant: {
              blur: 14,
            },
          },
        },
      },
      getActiveThemePresetDefinition: jest.fn(() => getThemePresetDefinition(plugin.settings.theme.activePresetId)),
      selectThemePresetAndSave: jest.fn(),
      resetThemePresetAppearanceAndSave: jest.fn(async () => {
        plugin.settings.theme.customAppearanceOverrides = {};
      }),
    } as unknown as ConstructorParameters<typeof SettingsStylePresetSection>[0]['plugin'];
    const onThemeAppearanceChanged = jest.fn();
    const presetSection = createPresetSection(plugin, onThemeAppearanceChanged);
    const containerEl = document.createElement('div');

    presetSection.attach(containerEl);

    const statusRowEl = containerEl.querySelector('.opencodian-theme-status-row');
    const resetBtn = containerEl.querySelector<HTMLButtonElement>('.opencodian-theme-reset-btn');

    expect(statusRowEl?.classList.contains('is-customized')).toBe(true);
    expect(resetBtn?.disabled).toBe(false);

    resetBtn?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(plugin.resetThemePresetAppearanceAndSave).toHaveBeenCalledTimes(1);
    expect(onThemeAppearanceChanged).toHaveBeenCalledTimes(1);
  });

  it('selects the first preset in a style family when its card is clicked', async () => {
    const flatPresetId = getBuiltinThemePresets().find((preset) => preset.styleId === 'flat')?.id;
    expect(flatPresetId).toBeDefined();

    let activePresetId: typeof DEFAULT_SETTINGS.theme.activePresetId = 'glass-classic';
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        theme: {
          ...DEFAULT_SETTINGS.theme,
          activePresetId,
          customAppearanceOverrides: {},
        },
      },
      getActiveThemePresetDefinition: jest.fn(() => getThemePresetDefinition(activePresetId)),
      selectThemePresetAndSave: jest.fn(async (presetId: NonNullable<typeof activePresetId>) => {
        activePresetId = presetId;
        plugin.settings.theme.activePresetId = presetId;
      }),
      resetThemePresetAppearanceAndSave: jest.fn(),
    } as unknown as ConstructorParameters<typeof SettingsStylePresetSection>[0]['plugin'];
    const onThemeAppearanceChanged = jest.fn();
    const presetSection = createPresetSection(plugin, onThemeAppearanceChanged);
    const containerEl = document.createElement('div');

    presetSection.attach(containerEl);

    const flatCardEl = containerEl.querySelectorAll<HTMLButtonElement>('.opencodian-theme-style-card').item(1);
    expect(flatCardEl).not.toBeNull();

    flatCardEl?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(plugin.selectThemePresetAndSave).toHaveBeenCalledWith(flatPresetId);
    expect(onThemeAppearanceChanged).toHaveBeenCalledTimes(1);
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
