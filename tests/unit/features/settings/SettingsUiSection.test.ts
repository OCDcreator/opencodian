import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsUiSection } from '../../../../src/features/settings/SettingsUiSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

interface MockSliderControl {
  setLimits: jest.MockedFunction<(min: number, max: number, step: number) => MockSliderControl>;
  setValue: jest.MockedFunction<(value: number) => MockSliderControl>;
  setDynamicTooltip: jest.MockedFunction<() => MockSliderControl>;
  onChange: jest.MockedFunction<(callback: (value: number) => void | Promise<void>) => MockSliderControl>;
}

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

interface SliderRecord {
  control: MockSliderControl;
  name: string;
  onChange?: (value: number) => void | Promise<void>;
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

type UiSectionPlugin = Pick<OpenCodianPlugin, 'settings' | 'saveSettings'>;

const sliderRecords: SliderRecord[] = [];
const dropdownRecords: DropdownRecord[] = [];
const toggleRecords: ToggleRecord[] = [];

function createSliderRecord(name: string): SliderRecord {
  const record: SliderRecord = {
    name,
    control: {
      setLimits: jest.fn(),
      setValue: jest.fn(),
      setDynamicTooltip: jest.fn(),
      onChange: jest.fn(),
    },
  };
  record.control.setLimits.mockReturnValue(record.control);
  record.control.setValue.mockReturnValue(record.control);
  record.control.setDynamicTooltip.mockReturnValue(record.control);
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  return record;
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

function createPlugin(overrides?: Partial<UiSectionPlugin['settings']>): UiSectionPlugin {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...overrides,
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  } as unknown as UiSectionPlugin;
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function createSection(plugin = createPlugin()) {
  const section = new SettingsUiSection({
    plugin: plugin as unknown as OpenCodianPlugin,
    createSectionHeading,
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

function findSlider(name: string): SliderRecord | undefined {
  return sliderRecords.find((record) => record.name === name);
}

function findDropdown(name: string): DropdownRecord | undefined {
  return dropdownRecords.find((record) => record.name === name);
}

function findToggle(name: string): ToggleRecord | undefined {
  return toggleRecords.find((record) => record.name === name);
}

describe('SettingsUiSection', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    sliderRecords.length = 0;
    dropdownRecords.length = 0;
    toggleRecords.length = 0;

    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
      (this as Setting & { __settingName?: string }).__settingName = name;
      return this;
    });
    jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting) {
      return this;
    });
    jest.spyOn(Setting.prototype, 'addSlider').mockImplementation(function addSlider(
      this: Setting,
      callback: (control: MockSliderControl) => unknown,
    ) {
      const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
      const record = createSliderRecord(name);
      sliderRecords.push(record);
      callback(record.control);
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders the UI section heading and saves max tab changes', async () => {
    const plugin = createPlugin();
    const { headingEl } = createSection(plugin);
    const maxTabsSlider = findSlider(t('settings.ui.maxTabs.name'));

    expect(headingEl.textContent).toBe(t('settings.ui.title'));
    expect(maxTabsSlider?.control.setLimits).toHaveBeenCalledWith(3, 10, 1);
    expect(maxTabsSlider?.control.setValue).toHaveBeenCalledWith(DEFAULT_SETTINGS.maxTabs);

    await maxTabsSlider?.onChange?.(7);

    expect(plugin.settings.maxTabs).toBe(7);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it('saves tab layout and scroll mode dropdown changes', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const tabPositionDropdown = findDropdown(t('settings.ui.tabPosition.name'));
    const belowHeaderLayoutDropdown = findDropdown(t('settings.ui.belowHeaderTabLayout.name'));
    const chatScrollModeDropdown = findDropdown(t('settings.ui.chatScrollMode.name'));

    expect(tabPositionDropdown?.control.setValue).toHaveBeenCalledWith(DEFAULT_SETTINGS.tabBarPosition);
    expect(belowHeaderLayoutDropdown?.control.setValue).toHaveBeenCalledWith(
      DEFAULT_SETTINGS.belowHeaderTabBarLayout,
    );
    expect(chatScrollModeDropdown?.control.setValue).toHaveBeenCalledWith(DEFAULT_SETTINGS.chatScrollMode);

    await tabPositionDropdown?.onChange?.('header');
    await belowHeaderLayoutDropdown?.onChange?.('vertical');
    await chatScrollModeDropdown?.onChange?.('natural');

    expect(plugin.settings.tabBarPosition).toBe('header');
    expect(plugin.settings.belowHeaderTabBarLayout).toBe('vertical');
    expect(plugin.settings.chatScrollMode).toBe('natural');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(3);
  });

  it('saves auto-scroll and open-in-main-tab toggles', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const autoScrollToggle = findToggle(t('settings.ui.autoScroll.name'));
    const openInMainTabToggle = findToggle(t('settings.ui.openInMainTab.name'));

    expect(autoScrollToggle?.control.setValue).toHaveBeenCalledWith(DEFAULT_SETTINGS.enableAutoScroll);
    expect(openInMainTabToggle?.control.setValue).toHaveBeenCalledWith(DEFAULT_SETTINGS.openInMainTab);

    await autoScrollToggle?.onChange?.(false);
    await openInMainTabToggle?.onChange?.(true);

    expect(plugin.settings.enableAutoScroll).toBe(false);
    expect(plugin.settings.openInMainTab).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
  });
});
