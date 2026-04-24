import * as fs from 'fs';
import type { App } from 'obsidian';
import { Setting } from 'obsidian';
import * as os from 'os';
import * as path from 'path';

import { OpencodeConfigManager } from '../../../../src/core/config';
import { DEFAULT_SETTINGS, getCurrentPlatformKey } from '../../../../src/core/types';
import { SettingsSecuritySection } from '../../../../src/features/settings/SettingsSecuritySection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

interface SettingRecord {
  instance: Setting;
  name: string;
  desc: string;
}

interface MockDropdownControl {
  addOption: jest.MockedFunction<(value: string, label: string) => MockDropdownControl>;
  setValue: jest.MockedFunction<(value: string) => MockDropdownControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>;
}

interface MockToggleControl {
  setValue: jest.MockedFunction<(value: boolean) => MockToggleControl>;
  onChange: jest.MockedFunction<(callback: (value: boolean) => void | Promise<void>) => MockToggleControl>;
}

interface MockTextAreaControl {
  inputEl: HTMLTextAreaElement;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextAreaControl>;
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextAreaControl>;
  setValue: jest.MockedFunction<(value: string) => MockTextAreaControl>;
}

interface MockButtonControl {
  buttonEl: HTMLButtonElement;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  setCta: jest.MockedFunction<() => MockButtonControl>;
  setDisabled: jest.MockedFunction<(value: boolean) => MockButtonControl>;
  setTooltip: jest.MockedFunction<(value: string) => MockButtonControl>;
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

interface TextAreaRecord {
  control: MockTextAreaControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}

interface ButtonRecord {
  control: MockButtonControl;
  name: string;
  onClick?: () => void | Promise<void>;
}

type SecuritySectionPlugin = Pick<OpenCodianPlugin, 'app' | 'settings' | 'saveSettings' | 'openCodeService'>;

const dropdownRecords: DropdownRecord[] = [];
const toggleRecords: ToggleRecord[] = [];
const textAreaRecords: TextAreaRecord[] = [];
const buttonRecords: ButtonRecord[] = [];
const settingRecordMap = new WeakMap<Setting, SettingRecord>();
const settingRecords: SettingRecord[] = [];
const tempDirs: string[] = [];
const currentPlatformKey = getCurrentPlatformKey();
const currentPlatformLabel = currentPlatformKey === 'windows' ? 'Windows' : 'Unix';

function ensureSettingRecord(instance: Setting): SettingRecord {
  const existing = settingRecordMap.get(instance);
  if (existing) {
    return existing;
  }

  const record: SettingRecord = {
    instance,
    name: '',
    desc: '',
  };
  settingRecordMap.set(instance, record);
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

function createTextAreaRecord(name: string): TextAreaRecord {
  const inputEl = document.createElement('textarea');
  const record: TextAreaRecord = {
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
      setTooltip: jest.fn(),
    },
  };
  record.control.onClick.mockImplementation((callback) => {
    record.onClick = callback;
    return record.control;
  });
  record.control.setButtonText.mockReturnValue(record.control);
  record.control.setCta.mockReturnValue(record.control);
  record.control.setDisabled.mockReturnValue(record.control);
  record.control.setTooltip.mockReturnValue(record.control);
  return record;
}

function cloneSettings() {
  return {
    ...DEFAULT_SETTINGS,
    server: {
      ...DEFAULT_SETTINGS.server,
      auth: {
        ...DEFAULT_SETTINGS.server.auth,
      },
      local: {
        ...DEFAULT_SETTINGS.server.local,
      },
      remote: {
        ...DEFAULT_SETTINGS.server.remote,
      },
    },
    blockedCommands: {
      unix: [...DEFAULT_SETTINGS.blockedCommands.unix],
      windows: [...DEFAULT_SETTINGS.blockedCommands.windows],
    },
    allowedExportPaths: [...DEFAULT_SETTINGS.allowedExportPaths],
  };
}

function permissionForMode(mode: SecuritySectionPlugin['settings']['permissionMode']) {
  switch (mode) {
    case 'plan':
      return {
        '*': 'ask',
        edit: 'deny',
        write: 'deny',
        bash: 'ask',
      } as const;
    case 'normal':
      return {
        '*': 'ask',
        read: 'ask',
        edit: 'ask',
        write: 'ask',
        bash: 'ask',
        websearch: 'ask',
        webfetch: 'ask',
        glob: 'ask',
        grep: 'ask',
        list: 'ask',
        task: 'ask',
        skill: 'ask',
      } as const;
    case 'yolo':
    default:
      return 'allow' as const;
  }
}

function createPlugin(options?: {
  basePath?: string | null;
  settings?: Partial<SecuritySectionPlugin['settings']>;
}) {
  const basePath = options?.basePath ?? fs.mkdtempSync(path.join(os.tmpdir(), 'security-section-'));
  if (basePath) {
    tempDirs.push(basePath);
  }

  const settings = cloneSettings();
  Object.assign(settings, options?.settings);
  if (options?.settings?.server) {
    settings.server = {
      ...settings.server,
      ...options.settings.server,
      auth: {
        ...settings.server.auth,
        ...options.settings.server.auth,
      },
      local: {
        ...settings.server.local,
        ...options.settings.server.local,
      },
      remote: {
        ...settings.server.remote,
        ...options.settings.server.remote,
      },
    };
  }

  const app = {
    vault: {
      adapter: {
        basePath,
      },
    },
  } as App;

  const configManager = basePath ? new OpencodeConfigManager(basePath) : null;
  const plugin: SecuritySectionPlugin = {
    app,
    settings,
    saveSettings: jest.fn(),
    openCodeService: {
      checkHealth: jest.fn().mockResolvedValue(true),
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
    },
  } as unknown as SecuritySectionPlugin;

  plugin.saveSettings = jest.fn().mockImplementation(async () => {
    if (!configManager) {
      return;
    }

    const config = await configManager.read();
    config.permission = permissionForMode(plugin.settings.permissionMode);
    await configManager.write(config);
  });

  return { app, basePath, configManager, plugin };
}

async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

async function waitForSettingRecord(
  name: string,
  predicate: (record: SettingRecord) => boolean,
): Promise<SettingRecord> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const record = settingRecords.find((entry) => entry.name === name);
    if (record && predicate(record)) {
      return record;
    }
    await flushAsync();
  }

  throw new Error(`Timed out waiting for setting record: ${name}`);
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

describe('SettingsSecuritySection', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    dropdownRecords.length = 0;
    toggleRecords.length = 0;
    textAreaRecords.length = 0;
    buttonRecords.length = 0;
    settingRecords.length = 0;
    tempDirs.length = 0;
    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
      ensureSettingRecord(this).name = name;
      return this;
    });
    jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting, desc: unknown) {
      ensureSettingRecord(this).desc = String(desc ?? '');
      return this;
    });
    jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function addDropdown(
      this: Setting,
      callback: (control: MockDropdownControl) => unknown,
    ) {
      const record = createDropdownRecord(ensureSettingRecord(this).name);
      dropdownRecords.push(record);
      callback(record.control);
      return this;
    });
    jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function addToggle(
      this: Setting,
      callback: (control: MockToggleControl) => unknown,
    ) {
      const record = createToggleRecord(ensureSettingRecord(this).name);
      toggleRecords.push(record);
      callback(record.control);
      return this;
    });
    jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(function addTextArea(
      this: Setting,
      callback: (control: MockTextAreaControl) => unknown,
    ) {
      const record = createTextAreaRecord(ensureSettingRecord(this).name);
      textAreaRecords.push(record);
      callback(record.control);
      return this;
    });
    jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
      this: Setting,
      callback: (control: MockButtonControl) => unknown,
    ) {
      const record = createButtonRecord(ensureSettingRecord(this).name);
      buttonRecords.push(record);
      callback(record.control);
      return this;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    document.body.innerHTML = '';
    tempDirs.forEach((dir) => {
      fs.rmSync(dir, { force: true, recursive: true });
    });
  });
  it('renders config status, permission controls, and blocklist text areas', async () => {
    const { app, plugin } = createPlugin();
    const section = new SettingsSecuritySection({
      app,
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);
    await flushAsync();
    expect(dropdownRecords.map((record) => record.name)).toEqual([t('settings.security.permissionMode.name')]);
    expect(toggleRecords.map((record) => record.name)).toEqual([
      t('settings.security.autoRestart.name'),
      t('settings.security.blocklist.name'),
      t('settings.security.externalAccess.name'),
    ]);
    const expectedTextAreaNames = [
      t('settings.security.exportPaths.name'),
      t('settings.security.blockedCommands.name', { platform: currentPlatformLabel }),
    ];
    if (currentPlatformKey === 'windows') {
      expectedTextAreaNames.push(t('settings.security.blockedCommands.unixName'));
    }
    expect(textAreaRecords.map((record) => record.name)).toEqual(expectedTextAreaNames);
    expect(buttonRecords.filter((record) => record.name === t('settings.security.configFile.name'))).toHaveLength(2);
    const configStatusRecord = await waitForSettingRecord(
      t('settings.security.configStatus.name'),
      (record) => record.desc === t('settings.security.configStatus.notCreated'),
    );
    expect(configStatusRecord?.desc).toBe(t('settings.security.configStatus.notCreated'));
    expect(configStatusRecord?.instance.settingEl.hasClass('opencodian-status-warning')).toBe(true);
  });

  it('updates permission mode, refreshes config status, and keeps remote restart blocked', async () => {
    const { app, plugin } = createPlugin({
      settings: {
        autoRestartOnPermissionChange: true,
        server: { ...DEFAULT_SETTINGS.server, mode: 'remote' },
      },
    });
    const section = new SettingsSecuritySection({
      app,
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);
    await flushAsync();
    const permissionModeRecord = dropdownRecords.find(
      (record) => record.name === t('settings.security.permissionMode.name'),
    );
    await permissionModeRecord?.onChange?.('plan');
    await flushAsync();
    const configStatusRecord = await waitForSettingRecord(
      t('settings.security.configStatus.name'),
      (record) => record.desc === t('settings.security.configStatus.plan'),
    );
    expect(plugin.settings.permissionMode).toBe('plan');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.openCodeService.checkHealth).not.toHaveBeenCalled();
    expect(configStatusRecord?.desc).toBe(t('settings.security.configStatus.plan'));
    expect(configStatusRecord?.instance.settingEl.hasClass('opencodian-status-plan')).toBe(true);
  });

  it('reports task allowlists and external-directory rules as custom config status', async () => {
    const { app, configManager, plugin } = createPlugin();
    await configManager?.write({
      permission: {
        '*': 'ask',
        task: { '*': 'deny', 'review-*': 'allow' },
        external_directory: { '*': 'ask', '/shared/libs/*': 'allow' },
      },
    });
    const section = new SettingsSecuritySection({
      app,
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);
    await flushAsync();
    const configStatusRecord = await waitForSettingRecord(
      t('settings.security.configStatus.name'),
      (record) => record.desc.includes(t('settings.security.configStatus.custom')),
    );
    const details = [t('settings.security.configStatus.detail.externalDirectory'), t('settings.security.configStatus.detail.taskAllowlist')].join(', ');
    expect(configStatusRecord.desc).toBe(t('settings.security.configStatus.customWithDetails', { details }));
    expect(configStatusRecord.instance.settingEl.hasClass('opencodian-status-custom')).toBe(true);
  });

  it('restarts the local service from the config action button', async () => {
    jest.useFakeTimers();
    const { app, plugin } = createPlugin();
    const section = new SettingsSecuritySection({
      app,
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);
    const applyButtonRecord = buttonRecords.filter(
      (record) => record.name === t('settings.security.configFile.name'),
    )[1];
    const restartPromise = applyButtonRecord?.onClick?.();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(1000);
    await restartPromise;

    expect(plugin.openCodeService.checkHealth).toHaveBeenCalledTimes(1);
    expect(plugin.openCodeService.stop).toHaveBeenCalledTimes(1);
    expect(plugin.openCodeService.start).toHaveBeenCalledTimes(1);
    expect(applyButtonRecord?.control.setDisabled).toHaveBeenNthCalledWith(1, true);
    expect(applyButtonRecord?.control.setDisabled).toHaveBeenLastCalledWith(false);
    expect(applyButtonRecord?.control.setButtonText).toHaveBeenCalledWith(t('settings.security.configFile.restarting'));
    expect(applyButtonRecord?.control.setButtonText).toHaveBeenLastCalledWith(t('settings.security.configFile.applyBtn'));
  });

  it('parses export paths and blocked commands before saving', async () => {
    const { app, plugin } = createPlugin();
    const section = new SettingsSecuritySection({
      app,
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);
    const exportPathsRecord = textAreaRecords.find(
      (record) => record.name === t('settings.security.exportPaths.name'),
    );
    await exportPathsRecord?.onChange?.(' ~/Desktop \n\n /tmp/export ');
    const blockedCommandsRecord = textAreaRecords.find(
      (record) => record.name === t('settings.security.blockedCommands.name', { platform: currentPlatformLabel }),
    );
    await blockedCommandsRecord?.onChange?.('rm -rf\n\n chmod 777 ');
    expect(plugin.settings.allowedExportPaths).toEqual(['~/Desktop', '/tmp/export']);
    expect(plugin.settings.blockedCommands[currentPlatformKey]).toEqual(['rm -rf', 'chmod 777']);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
  });
});
