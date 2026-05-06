import type { App } from 'obsidian';
import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsServerSection } from '../../../../src/features/settings/SettingsServerSection';
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
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextControl>;
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextControl>;
  setValue: jest.MockedFunction<(value: string) => MockTextControl>;
}

interface MockButtonControl {
  buttonEl: HTMLButtonElement;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  setCta: jest.MockedFunction<() => MockButtonControl>;
  setDisabled: jest.MockedFunction<(value: boolean) => MockButtonControl>;
}

interface MockExtraButtonControl {
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

interface ButtonRecord {
  control: MockButtonControl;
  name: string;
  onClick?: () => void | Promise<void>;
}

type ServerSectionPlugin = Pick<OpenCodianPlugin, 'settings' | 'saveSettings' | 'openCodeService'>;

const dropdownRecords: DropdownRecord[] = [];
const toggleRecords: ToggleRecord[] = [];
const textRecords: TextRecord[] = [];
const buttonRecords: ButtonRecord[] = [];

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
      onChange: jest.fn(),
      setValue: jest.fn(),
    },
  };
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  record.control.setValue.mockReturnValue(record.control);
  return record;
}

function createTextRecord(name: string): TextRecord {
  const inputEl = document.createElement('input');
  const record: TextRecord = {
    name,
    control: {
      inputEl,
      onChange: jest.fn(),
      setPlaceholder: jest.fn(),
      setValue: jest.fn(),
    },
  };
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  record.control.setPlaceholder.mockReturnValue(record.control);
  record.control.setValue.mockImplementation((value) => {
    inputEl.value = value;
    return record.control;
  });
  return record;
}

function createButtonRecord(name: string): ButtonRecord {
  const record: ButtonRecord = {
    name,
    control: {
      buttonEl: document.createElement('button'),
      onClick: jest.fn(),
      setButtonText: jest.fn(),
      setCta: jest.fn(),
      setDisabled: jest.fn(),
    },
  };
  record.control.onClick.mockImplementation((callback) => {
    record.onClick = callback;
    return record.control;
  });
  record.control.setButtonText.mockReturnValue(record.control);
  record.control.setCta.mockReturnValue(record.control);
  record.control.setDisabled.mockReturnValue(record.control);
  return record;
}

function createExtraButtonControl(): MockExtraButtonControl {
  const control: MockExtraButtonControl = {
    onClick: jest.fn(),
    setIcon: jest.fn(),
    setTooltip: jest.fn(),
  };
  control.onClick.mockReturnValue(control);
  control.setIcon.mockReturnValue(control);
  control.setTooltip.mockReturnValue(control);
  return control;
}

function createPlugin(overrides?: Partial<ServerSectionPlugin['settings']['server']>): ServerSectionPlugin {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      server: {
        ...DEFAULT_SETTINGS.server,
        ...overrides,
        auth: {
          ...DEFAULT_SETTINGS.server.auth,
          ...overrides?.auth,
        },
        local: {
          ...DEFAULT_SETTINGS.server.local,
          ...overrides?.local,
        },
        remote: {
          ...DEFAULT_SETTINGS.server.remote,
          ...overrides?.remote,
        },
      },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    openCodeService: {
      checkHealth: jest.fn().mockResolvedValue(true),
      getServerDiagnostics: jest.fn().mockReturnValue({ reason: 'none', message: '' }),
      getServerStatus: jest.fn().mockReturnValue('running'),
      isServerProcessRunning: jest.fn().mockReturnValue(true),
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
    },
  } as unknown as ServerSectionPlugin;
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

describe('SettingsServerSection', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    dropdownRecords.length = 0;
    toggleRecords.length = 0;
    textRecords.length = 0;
    buttonRecords.length = 0;

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
      const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
      const record = createButtonRecord(name);
      buttonRecords.push(record);
      callback(record.control);
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
  });

  it('renders the full local server subsection and updates status ownership', async () => {
    const plugin = createPlugin();
    const notifyModelCatalogStatus = jest.fn();
    const onServerStateChange = jest.fn();
    const section = new SettingsServerSection({
      app: {} as App,
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      notifyModelCatalogStatus,
      onServerStateChange,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attach(containerEl);
    await flushAsync();

    expect(dropdownRecords.map((record) => record.name)).toEqual([
      t('settings.server.mode.name'),
      t('settings.server.auth.name'),
    ]);
    expect(toggleRecords.map((record) => record.name)).toEqual([t('settings.server.autoStart.name')]);
    expect(textRecords.map((record) => record.name)).toEqual([
      t('settings.server.executablePath.name'),
      t('settings.server.host.name'),
      t('settings.server.port.name'),
    ]);
    expect(buttonRecords.filter((record) => record.name === t('settings.server.status.name'))).toHaveLength(3);
    expect(onServerStateChange).toHaveBeenCalledWith({
      healthy: true,
      status: 'running',
    });
    expect(notifyModelCatalogStatus).toHaveBeenCalledTimes(1);

    const [actionButtonRecord] = buttonRecords.filter(
      (record) => record.name === t('settings.server.status.name'),
    );
    expect(actionButtonRecord?.control.setDisabled).toHaveBeenLastCalledWith(true);
  });

  it('fills the remote base URL and requests a redisplay when mode changes', async () => {
    const plugin = createPlugin({
      auth: {
        ...DEFAULT_SETTINGS.server.auth,
        type: 'bearer',
      },
      remote: {
        ...DEFAULT_SETTINGS.server.remote,
        baseUrl: '',
      },
    });
    const requestDisplayRefresh = jest.fn();
    const section = new SettingsServerSection({
      app: {} as App,
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      notifyModelCatalogStatus: jest.fn(),
      onServerStateChange: jest.fn(),
      requestDisplayRefresh,
    });
    const containerEl = document.createElement('div');

    section.attach(containerEl);

    const modeRecord = dropdownRecords.find(
      (record) => record.name === t('settings.server.mode.name'),
    );
    await modeRecord?.onChange?.('remote');

    expect(plugin.settings.server.mode).toBe('remote');
    expect(plugin.settings.server.remote.baseUrl).toBe('http://127.0.0.1:4196');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(requestDisplayRefresh).toHaveBeenCalledTimes(1);
  });

  it('commits local host changes on native input events', async () => {
    const plugin = createPlugin();
    const section = new SettingsServerSection({
      app: {} as App,
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      notifyModelCatalogStatus: jest.fn(),
      onServerStateChange: jest.fn(),
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attach(containerEl);

    const hostRecord = textRecords.find(
      (record) => record.name === t('settings.server.host.name'),
    );
    hostRecord?.control.setValue('0.0.0.0');
    hostRecord?.control.inputEl.dispatchEvent(new Event('change'));
    await flushAsync();

    expect(plugin.settings.server.local.host).toBe('0.0.0.0');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it('commits custom OpenCode executable path changes on native input events', async () => {
    const plugin = createPlugin();
    const section = new SettingsServerSection({
      app: {} as App,
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      notifyModelCatalogStatus: jest.fn(),
      onServerStateChange: jest.fn(),
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attach(containerEl);

    const executableRecord = textRecords.find(
      (record) => record.name === t('settings.server.executablePath.name'),
    );
    executableRecord?.control.setValue('/Users/example/.opencode/bin/opencode');
    executableRecord?.control.inputEl.dispatchEvent(new Event('change'));
    await flushAsync();

    expect(plugin.settings.server.local.executablePath).toBe('/Users/example/.opencode/bin/opencode');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });
});
