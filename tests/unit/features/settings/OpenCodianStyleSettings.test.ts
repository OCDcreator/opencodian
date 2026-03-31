import type { App } from 'obsidian';
import { Setting } from 'obsidian';

import { OpenCodianSettingTab } from '../../../../src/features/settings/OpenCodianSettings';
import { setLocale, t } from '../../../../src/i18n';

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

  it('adds a disabled preset-only theme control for the input panel', () => {
    const plugin = {} as ConstructorParameters<typeof OpenCodianSettingTab>[1];
    const tab = new OpenCodianSettingTab({} as App, plugin);
    const containerEl = document.createElement('div');

    (tab as unknown as {
      addInputPanelThemeSetting: (containerEl: HTMLElement) => void;
    }).addInputPanelThemeSetting(containerEl);

    const themeSetting = dropdownRecords.find(
      (record) => record.name === t('settings.style.input.theme.name'),
    );

    expect(themeSetting).toBeDefined();
    expect(themeSetting?.control.addOption).toHaveBeenCalledWith(
      'preset',
      t('settings.style.input.theme.options.preset'),
    );
    expect(themeSetting?.control.setValue).toHaveBeenCalledWith('preset');
    expect(themeSetting?.control.selectEl.disabled).toBe(true);
    expect(themeSetting?.control.selectEl.getAttribute('aria-disabled')).toBe('true');
  });
});
