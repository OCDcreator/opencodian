import { Setting } from 'obsidian';

import { SettingsFormatterSection } from '../../../../src/features/settings/SettingsFormatterSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

interface MockDropdownControl {
  addOption: jest.MockedFunction<(value: string, label: string) => MockDropdownControl>;
  setValue: jest.MockedFunction<(value: string) => MockDropdownControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>;
  selectEl: HTMLSelectElement;
}

interface DropdownRecord {
  control: MockDropdownControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}

interface SettingRecord {
  name?: string;
  desc?: string;
}

const dropdownRecords: DropdownRecord[] = [];
const settingRecords: SettingRecord[] = [];

function getSettingRecord(setting: Setting): SettingRecord {
  const existing = (setting as Setting & { __record?: SettingRecord }).__record;
  if (existing) {
    return existing;
  }

  const record: SettingRecord = {};
  (setting as Setting & { __record?: SettingRecord }).__record = record;
  settingRecords.push(record);
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

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function findDropdown(name: string): DropdownRecord | undefined {
  return dropdownRecords.find((record) => record.name === name);
}

function findSettingRecord(name: string): SettingRecord | undefined {
  return settingRecords.find((record) => record.name === name);
}

function findSettingRecordByDesc(desc: string): SettingRecord | undefined {
  return settingRecords.find((record) => record.desc === desc);
}

function createPlugin(overrides?: {
  formatterConfig?: unknown;
  runtimeStatus?: unknown;
  runtimeError?: Error;
  configPath?: string;
  hasConfigManager?: boolean;
}): {
  plugin: OpenCodianPlugin;
  updateFormatterConfig: jest.Mock;
  getFormatterConfig: jest.Mock;
} {
  const updateFormatterConfig = jest.fn().mockResolvedValue(undefined);
  const getFormatterConfig = jest.fn().mockResolvedValue(overrides?.formatterConfig ?? undefined);

  const configManager = overrides?.hasConfigManager === false
    ? null
    : {
        getFormatterConfig,
        updateFormatterConfig,
        getConfigPath: () => overrides?.configPath ?? '/vault/.opencode/opencode.json',
      };

  const getFormatterStatus = overrides?.runtimeError
    ? jest.fn().mockRejectedValue(overrides.runtimeError)
    : jest.fn().mockResolvedValue(overrides?.runtimeStatus ?? []);

  const plugin = {
    opencodeConfigManager: configManager,
    openCodeService: {
      getFormatterStatus,
    },
  } as unknown as OpenCodianPlugin;

  return { plugin, updateFormatterConfig, getFormatterConfig };
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

let displayRefresh: jest.Mock;

beforeEach(() => {
  setLocale('en');
  document.body.innerHTML = '';
  dropdownRecords.length = 0;
  settingRecords.length = 0;
  displayRefresh = jest.fn();

  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
    (this as Setting & { __settingName?: string }).__settingName = name;
    getSettingRecord(this).name = name;
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting, desc: string | DocumentFragment) {
    getSettingRecord(this).desc = typeof desc === 'string' ? desc : desc.textContent ?? '';
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
  document.body.innerHTML = '';
});

describe('SettingsFormatterSection attach (classic layout)', () => {
  it('renders the formatter section heading', () => {
    const { plugin } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    const headingEl = section.attach(containerEl);

    expect(headingEl.textContent).toBe(t('settings.formatter.title'));
  });

  it('shows the mode summary without adding a second dropdown in overview', async () => {
    const { plugin } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attach(containerEl);
    await flushPromises();

    expect(dropdownRecords.map((record) => record.name)).toEqual([
      t('settings.formatter.config.modeSwitch'),
    ]);
    expect(findSettingRecord(t('settings.formatter.overview.modeLabel'))?.desc).toContain(
      t('settings.formatter.mode.default'),
    );
  });
});

describe('SettingsFormatterSection attachTabbed (tabbed layout)', () => {
  it('renders overview block for overview tab', () => {
    const { plugin } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'overview');

    const headings = containerEl.querySelectorAll('.opencodian-settings-subsection-heading');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(headings[0]?.textContent).toBe(t('settings.formatter.tab.overview'));
  });

  it('renders config block for config tab', () => {
    const { plugin } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');

    const headings = containerEl.querySelectorAll('.opencodian-settings-subsection-heading');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(headings[0]?.textContent).toBe(t('settings.formatter.tab.config'));
  });
});

describe('SettingsFormatterSection mode switching', () => {
  it('switches to default mode by writing null config', async () => {
    const { plugin, updateFormatterConfig } = createPlugin({ formatterConfig: false });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.config.modeSwitch'));
    expect(modeDropdown).toBeDefined();

    await modeDropdown?.onChange?.('default');
    await flushPromises();

    expect(updateFormatterConfig).toHaveBeenCalledWith(null);
  });

  it('switches to disabled mode by writing false config', async () => {
    const { plugin, updateFormatterConfig } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.config.modeSwitch'));
    await modeDropdown?.onChange?.('disabled');
    await flushPromises();

    expect(updateFormatterConfig).toHaveBeenCalledWith(false);
  });

  it('switches to custom mode by writing object config', async () => {
    const { plugin, updateFormatterConfig, getFormatterConfig } = createPlugin();
    getFormatterConfig.mockResolvedValue({ prettier: { disabled: true } });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.config.modeSwitch'));
    await modeDropdown?.onChange?.('custom');
    await flushPromises();

    expect(updateFormatterConfig).toHaveBeenCalledWith({ prettier: { disabled: true } });
  });

  it('initializes empty object for custom mode when no existing object config', async () => {
    const { plugin, updateFormatterConfig, getFormatterConfig } = createPlugin();
    getFormatterConfig.mockResolvedValue(undefined);
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.config.modeSwitch'));
    await modeDropdown?.onChange?.('custom');
    await flushPromises();

    expect(updateFormatterConfig).toHaveBeenCalledWith({});
  });

  it('does not call updateFormatterConfig when config manager is unavailable', async () => {
    const { plugin, updateFormatterConfig } = createPlugin({ hasConfigManager: false });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.config.modeSwitch'));
    await modeDropdown?.onChange?.('default');
    await flushPromises();

    expect(updateFormatterConfig).not.toHaveBeenCalled();
  });

  it('refreshes display after successful mode switch', async () => {
    const { plugin } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.config.modeSwitch'));
    await modeDropdown?.onChange?.('disabled');
    await flushPromises();

    expect(displayRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsFormatterSection runtime status presentation', () => {
  it('treats an empty successful formatter status result as online', async () => {
    const { plugin } = createPlugin({ runtimeStatus: [] });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'overview');
    await flushPromises();

    expect(findSettingRecord(t('settings.formatter.overview.runtimeStatus'))?.desc).toBe(
      t('settings.formatter.overview.runtimeOnline'),
    );
    expect(findSettingRecordByDesc(t('settings.formatter.overview.noRuntime'))).toBeUndefined();
  });

  it('shows the runtime failure notice when formatter status fetch fails', async () => {
    const { plugin } = createPlugin({ runtimeError: new Error('offline') });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'overview');
    await flushPromises();

    expect(findSettingRecord(t('settings.formatter.overview.runtimeStatus'))?.desc).toBe(
      t('settings.formatter.overview.runtimeError'),
    );
    expect(findSettingRecordByDesc(t('settings.formatter.overview.noRuntime'))).toBeDefined();
  });
});

describe('SettingsFormatterSection dispose', () => {
  it('does not throw when called', () => {
    const { plugin } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });

    expect(() => section.dispose()).not.toThrow();
  });
});
