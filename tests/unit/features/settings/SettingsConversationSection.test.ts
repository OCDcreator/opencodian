import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsConversationSection } from '../../../../src/features/settings/SettingsConversationSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

interface MockDropdownControl {
  addOption: jest.MockedFunction<(value: string, label: string) => MockDropdownControl>;
  setValue: jest.MockedFunction<(value: string) => MockDropdownControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>;
  selectEl: HTMLSelectElement;
}

interface MockToggleControl {
  setValue: jest.MockedFunction<(value: boolean) => MockToggleControl>;
  onChange: jest.MockedFunction<(callback: (value: boolean) => void | Promise<void>) => MockToggleControl>;
}

interface MockTextControl {
  inputEl: HTMLInputElement;
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextControl>;
  setValue: jest.MockedFunction<(value: string) => MockTextControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextControl>;
}

interface MockButtonControl {
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  setDisabled: jest.MockedFunction<(value: boolean) => MockButtonControl>;
}

interface MockExtraButtonControl {
  extraSettingsEl: HTMLElement;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockExtraButtonControl>;
  setIcon: jest.MockedFunction<(icon: string) => MockExtraButtonControl>;
  setTooltip: jest.MockedFunction<(tooltip: string) => MockExtraButtonControl>;
}

interface DropdownRecord {
  control: MockDropdownControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}

interface ToggleRecord {
  control: MockToggleControl;
  name: string;
  onChange?: (value: boolean) => void | Promise<void>;
}

interface TextRecord {
  control: MockTextControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}

type ConversationSectionPlugin = Pick<
  OpenCodianPlugin,
  | 'settings'
  | 'saveSettings'
  | 'refreshConversationRendering'
  | 'refreshQuestionUi'
  | 'reapplyConversationSessionDefaults'
>;

const dropdownRecords: DropdownRecord[] = [];
const toggleRecords: ToggleRecord[] = [];
const textRecords: TextRecord[] = [];

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
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  return record;
}

function createToggleRecord(name: string): ToggleRecord {
  const record: ToggleRecord = {
    name,
    control: {
      setValue: jest.fn(),
      onChange: jest.fn(),
    },
  };
  record.control.setValue.mockReturnValue(record.control);
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  return record;
}

function createTextRecord(name: string): TextRecord {
  const inputEl = document.createElement('input');
  const record: TextRecord = {
    name,
    control: {
      inputEl,
      setPlaceholder: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
    },
  };
  record.control.setPlaceholder.mockReturnValue(record.control);
  record.control.setValue.mockImplementation((value) => {
    inputEl.value = value;
    return record.control;
  });
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  return record;
}

function createButtonControl(): MockButtonControl {
  const control: MockButtonControl = {
    onClick: jest.fn(),
    setButtonText: jest.fn(),
    setDisabled: jest.fn(),
  };
  control.onClick.mockReturnValue(control);
  control.setButtonText.mockReturnValue(control);
  control.setDisabled.mockReturnValue(control);
  return control;
}

function createExtraButtonControl(): MockExtraButtonControl {
  const control: MockExtraButtonControl = {
    extraSettingsEl: document.createElement('span'),
    onClick: jest.fn(),
    setIcon: jest.fn(),
    setTooltip: jest.fn(),
  };
  control.onClick.mockReturnValue(control);
  control.setIcon.mockReturnValue(control);
  control.setTooltip.mockReturnValue(control);
  return control;
}

function createPlugin(overrides?: Partial<ConversationSectionPlugin['settings']>): ConversationSectionPlugin {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...overrides,
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    refreshConversationRendering: jest.fn(),
    refreshQuestionUi: jest.fn(),
    reapplyConversationSessionDefaults: jest.fn().mockResolvedValue(undefined),
  } as unknown as ConversationSectionPlugin;
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function createSection(plugin = createPlugin()) {
  const section = new SettingsConversationSection({
    app: {} as never,
    plugin: plugin as unknown as OpenCodianPlugin,
    createSectionHeading,
    setRefreshTitleModelsCallback: jest.fn(),
  });
  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);
  const headingEl = section.attach(containerEl);
  return {
    containerEl,
    headingEl,
    plugin,
    section,
  };
}

function findToggle(name: string): ToggleRecord | undefined {
  return toggleRecords.find((record) => record.name === name);
}

function findText(name: string): TextRecord | undefined {
  return textRecords.find((record) => record.name === name);
}

describe('SettingsConversationSection', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    dropdownRecords.length = 0;
    toggleRecords.length = 0;
    textRecords.length = 0;

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
    jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function addToggle(
      this: Setting,
      callback: (control: MockToggleControl) => unknown,
    ) {
      const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
      const record = createToggleRecord(name);
      toggleRecords.push(record);
      callback(record.control);
      return this;
    });
    jest.spyOn(Setting.prototype, 'addText').mockImplementation(function addText(
      this: Setting,
      callback: (control: MockTextControl) => unknown,
    ) {
      const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
      const record = createTextRecord(name);
      textRecords.push(record);
      callback(record.control);
      return this;
    });
    jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
      this: Setting,
      callback: (control: MockButtonControl) => unknown,
    ) {
      callback(createButtonControl());
      return this;
    });
    jest.spyOn(Setting.prototype, 'addExtraButton').mockImplementation(function addExtraButton(
      this: Setting,
      callback: (control: MockExtraButtonControl) => unknown,
    ) {
      callback(createExtraButtonControl());
      return this;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('dispose clears any registered title-model refresh callback', () => {
    let refreshTitleModelsCallback: (() => void) | undefined = () => {};
    const section = new SettingsConversationSection({
      app: {} as never,
      plugin: {
        settings: {},
      } as never,
      createSectionHeading: () => document.createElement('h2'),
      setRefreshTitleModelsCallback: (callback) => {
        refreshTitleModelsCallback = callback;
      },
    });

    section.dispose();

    expect(refreshTitleModelsCallback).toBeUndefined();
  });

  it('saves global session defaults and reapplies active conversation runtime state', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const autoCompactionToggle = findToggle(t('settings.conversation.autoCompactionEnabled.name'));
    const reservedTokensText = findText(t('settings.conversation.compactionReservedTokens.name'));
    const chatFontSizeText = findText(t('settings.conversation.chatFontSizePx.name'));

    expect(autoCompactionToggle?.control.setValue).toHaveBeenCalledWith(DEFAULT_SETTINGS.autoCompactionEnabled);
    expect(reservedTokensText?.control.setValue).toHaveBeenCalledWith(
      String(DEFAULT_SETTINGS.compactionReservedTokens),
    );
    expect(chatFontSizeText?.control.setValue).toHaveBeenCalledWith(
      String(DEFAULT_SETTINGS.chatFontSizePx),
    );

    await autoCompactionToggle?.onChange?.(false);
    await reservedTokensText?.onChange?.('16000');
    await chatFontSizeText?.onChange?.('15');

    expect(plugin.settings.autoCompactionEnabled).toBe(false);
    expect(plugin.settings.compactionReservedTokens).toBe(16000);
    expect(plugin.settings.chatFontSizePx).toBe(15);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(3);
    expect(plugin.saveSettings).toHaveBeenNthCalledWith(1, { reloadModels: false });
    expect(plugin.reapplyConversationSessionDefaults).toHaveBeenCalledTimes(3);
  });

  it('rejects invalid numeric session defaults without saving or runtime reapply', async () => {
    const plugin = createPlugin({
      compactionReservedTokens: 12_000,
      chatFontSizePx: 14,
    });
    createSection(plugin);

    const reservedTokensText = findText(t('settings.conversation.compactionReservedTokens.name'));
    const chatFontSizeText = findText(t('settings.conversation.chatFontSizePx.name'));

    await reservedTokensText?.onChange?.('0');
    await chatFontSizeText?.onChange?.('99');

    expect(plugin.settings.compactionReservedTokens).toBe(12_000);
    expect(plugin.settings.chatFontSizePx).toBe(14);
    expect(reservedTokensText?.control.inputEl.value).toBe('12000');
    expect(chatFontSizeText?.control.inputEl.value).toBe('14');
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(plugin.reapplyConversationSessionDefaults).not.toHaveBeenCalled();
  });
});
