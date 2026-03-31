import type { App } from 'obsidian';
import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS, getDefaultChatAppearanceSettings } from '../../../../src/core/types';
import { OpenCodianSettingTab } from '../../../../src/features/settings/OpenCodianSettings';
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

describe('OpenCodian style settings', () => {
  const dropdownRecords: DropdownRecord[] = [];

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

  it('does not add a separate input theme dropdown anymore', () => {
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        chatAppearance: getDefaultChatAppearanceSettings(),
      },
      saveSettings: jest.fn(),
    } as unknown as ConstructorParameters<typeof OpenCodianSettingTab>[1];
    const tab = new OpenCodianSettingTab({} as App, plugin);
    const containerEl = document.createElement('div');
    const privateTab = tab as unknown as {
      addStyleSettings: (containerEl: HTMLElement) => void;
      addThemePresetSection: (containerEl: HTMLElement) => void;
      addNumericStyleControl: (containerEl: HTMLElement, config: unknown) => void;
      createStyleResetSetting: (containerEl: HTMLElement, group: unknown) => void;
      createSectionHeading: (containerEl: HTMLElement, title: string) => HTMLHeadingElement;
      createStyleGroupSection: (containerEl: HTMLElement, title: string, desc: string) => HTMLElement;
      setSettingDescWithFormatting: (setting: Setting, desc: string) => void;
      registerStyleControlBinding: (group: unknown, callback: () => void) => void;
    };

    jest.spyOn(privateTab, 'addThemePresetSection').mockImplementation(() => {});
    jest.spyOn(privateTab, 'addNumericStyleControl').mockImplementation(() => {});
    jest.spyOn(privateTab, 'createStyleResetSetting').mockImplementation(() => {});
    jest.spyOn(privateTab, 'createSectionHeading').mockImplementation((parent, title) =>
      parent.createEl('h3', { text: title }),
    );
    jest.spyOn(privateTab, 'createStyleGroupSection').mockImplementation((parent) =>
      parent.createDiv(),
    );
    jest.spyOn(privateTab, 'setSettingDescWithFormatting').mockImplementation(() => {});
    jest.spyOn(privateTab, 'registerStyleControlBinding').mockImplementation(() => {});

    privateTab.addStyleSettings(containerEl);

    expect(
      dropdownRecords.some((record) => record.name === 'Panel style theme' || record.name === '面板样式主题'),
    ).toBe(false);
  });
});
