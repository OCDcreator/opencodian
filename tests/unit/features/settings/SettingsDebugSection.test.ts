import * as obsidian from 'obsidian';
import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS, getCurrentPlatformKey } from '../../../../src/core/types';
import { SettingsDebugSection } from '../../../../src/features/settings/SettingsDebugSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

interface MockToggleControl {
  setValue: jest.MockedFunction<(value: boolean) => MockToggleControl>;
  onChange: jest.MockedFunction<(callback: (value: boolean) => void | Promise<void>) => MockToggleControl>;
}

interface MockTextControl {
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextControl>;
  setValue: jest.MockedFunction<(value: string) => MockTextControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextControl>;
}

interface MockButtonControl {
  buttonEl: HTMLButtonElement;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  setCta: jest.MockedFunction<() => MockButtonControl>;
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
  label?: string;
  name: string;
  onClick?: () => void | Promise<void>;
}

type DebugSectionPlugin = Pick<
  OpenCodianPlugin,
  'settings' | 'saveSettings' | 'logServerStatusSnapshot' | 'buildDiagnosticReport' | 'writeDiagnosticLogFile'
>;

const toggleRecords: ToggleRecord[] = [];
const textRecords: TextRecord[] = [];
const buttonRecords: ButtonRecord[] = [];

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
  const record: TextRecord = {
    name,
    control: {
      setPlaceholder: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
    },
  };
  record.control.setPlaceholder.mockReturnValue(record.control);
  record.control.setValue.mockReturnValue(record.control);
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
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
    },
  };
  record.control.onClick.mockImplementation((callback) => {
    record.onClick = callback;
    return record.control;
  });
  record.control.setButtonText.mockImplementation((value) => {
    record.label = value;
    return record.control;
  });
  record.control.setCta.mockReturnValue(record.control);
  return record;
}

function createPlugin(overrides: Partial<DebugSectionPlugin['settings']> = {}): DebugSectionPlugin {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...overrides,
      debugLogPaths: {
        ...DEFAULT_SETTINGS.debugLogPaths,
        ...overrides.debugLogPaths,
      },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    logServerStatusSnapshot: jest.fn().mockResolvedValue(undefined),
    buildDiagnosticReport: jest.fn().mockResolvedValue('diagnostic report'),
    writeDiagnosticLogFile: jest.fn().mockResolvedValue('/Users/test/Exports/opencodian-diagnostics.md'),
  } as unknown as DebugSectionPlugin;
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function createSection(plugin = createPlugin()) {
  const section = new SettingsDebugSection({
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

function findToggle(name: string): ToggleRecord | undefined {
  return toggleRecords.find((record) => record.name === name);
}

function findText(name: string): TextRecord | undefined {
  return textRecords.find((record) => record.name === name);
}

function findButton(label: string): ButtonRecord | undefined {
  return buttonRecords.find((record) => record.label === label);
}

describe('SettingsDebugSection', () => {
  const originalRequire = (globalThis as typeof globalThis & { require?: (module: string) => unknown }).require;

  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    toggleRecords.length = 0;
    textRecords.length = 0;
    buttonRecords.length = 0;

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });

    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
      (this as Setting & { __settingName?: string }).__settingName = name;
      return this;
    });
    jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting) {
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';

    const globalWithRequire = globalThis as typeof globalThis & {
      require?: (module: string) => unknown;
    };
    globalWithRequire.require = originalRequire;
  });

  it('renders debug help and saves debug toggles with existing semantics', async () => {
    const plugin = createPlugin();
    const { headingEl, containerEl } = createSection(plugin);
    const debugToggle = findToggle(t('settings.debug.logging.name'));
    const inlineArgsToggle = findToggle(t('settings.debug.inlineSerializedArgs.name'));

    expect(headingEl.textContent).toBe(t('settings.debug.title'));
    expect(containerEl.querySelector('.opencodian-debug-help-title')?.textContent).toBe(
      t('settings.debug.console.howToOpen'),
    );
    expect(containerEl.querySelectorAll('.opencodian-debug-help-item')).toHaveLength(2);
    expect(debugToggle?.control.setValue).toHaveBeenCalledWith(DEFAULT_SETTINGS.enableDebugLogging);
    expect(inlineArgsToggle?.control.setValue).toHaveBeenCalledWith(
      DEFAULT_SETTINGS.inlineSerializedDebugLogArgs,
    );

    await debugToggle?.onChange?.(true);
    await inlineArgsToggle?.onChange?.(true);

    expect(plugin.settings.enableDebugLogging).toBe(true);
    expect(plugin.settings.inlineSerializedDebugLogArgs).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
    expect(plugin.logServerStatusSnapshot).toHaveBeenCalledWith('settings-toggle');
  });

  it('uses the directory picker button to update the current platform log path', async () => {
    const platformKey = getCurrentPlatformKey();
    const currentPath = '/tmp/current-debug';
    const dialog = {
      showOpenDialog: jest.fn().mockResolvedValue({
        canceled: false,
        filePaths: ['/tmp/picked-debug'],
      }),
    };
    const globalWithRequire = globalThis as typeof globalThis & {
      require?: (module: string) => unknown;
    };
    globalWithRequire.require = jest.fn().mockImplementation((module: string) => {
      if (module === '@electron/remote') {
        return { dialog };
      }
      throw new Error(`Unexpected module: ${module}`);
    });
    const plugin = createPlugin({
      debugLogPaths: {
        ...DEFAULT_SETTINGS.debugLogPaths,
        [platformKey]: currentPath,
      },
    });

    createSection(plugin);
    const logPathField = findText(t('settings.debug.logPath.name'));
    const chooseButton = findButton(t('settings.debug.logPath.choose'));

    await chooseButton?.onClick?.();

    expect(dialog.showOpenDialog).toHaveBeenCalledWith({
      title: t('settings.debug.logPath.dialogTitle'),
      buttonLabel: t('settings.debug.logPath.dialogButton'),
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: currentPath,
    });
    expect(plugin.settings.debugLogPaths[platformKey]).toBe('/tmp/picked-debug');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(logPathField?.control.setValue).toHaveBeenLastCalledWith('/tmp/picked-debug');
  });

  it('copies diagnostics and persists a generated export directory after confirmation', async () => {
    const platformKey = getCurrentPlatformKey();
    const exportDirectory = '/tmp';
    const dialog = {
      showOpenDialog: jest.fn().mockResolvedValue({
        canceled: false,
        filePaths: [exportDirectory],
      }),
    };
    const globalWithRequire = globalThis as typeof globalThis & {
      require?: (module: string) => unknown;
    };
    globalWithRequire.require = jest.fn().mockImplementation((module: string) => {
      if (module === '@electron/remote') {
        return { dialog };
      }
      throw new Error(`Unexpected module: ${module}`);
    });

    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const clipboardSpy = jest
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    const plugin = createPlugin({
      allowedExportPaths: [exportDirectory],
      debugLogPaths: {
        ...DEFAULT_SETTINGS.debugLogPaths,
        [platformKey]: '',
      },
    });
    plugin.writeDiagnosticLogFile = jest
      .fn()
      .mockResolvedValue(`${exportDirectory}/opencodian-diagnostics.md`);

    createSection(plugin);
    const logPathField = findText(t('settings.debug.logPath.name'));
    const copyButton = findButton(t('settings.debug.actions.copy'));
    const generateButton = findButton(t('settings.debug.actions.generate'));

    await copyButton?.onClick?.();
    await generateButton?.onClick?.();

    expect(plugin.buildDiagnosticReport).toHaveBeenCalledWith('copy-diagnostics');
    expect(clipboardSpy).toHaveBeenCalledWith('diagnostic report');
    expect(dialog.showOpenDialog).toHaveBeenCalledWith({
      title: t('settings.debug.logPath.dialogTitle'),
      buttonLabel: t('settings.debug.logPath.dialogButton'),
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: exportDirectory,
    });
    expect(plugin.writeDiagnosticLogFile).toHaveBeenCalledWith(exportDirectory, 'settings-export');
    expect(confirmSpy).toHaveBeenCalledWith(
      t('settings.debug.logPath.confirmUseDefault', { path: exportDirectory }),
    );
    expect(plugin.settings.debugLogPaths[platformKey]).toBe(exportDirectory);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(logPathField?.control.setValue).toHaveBeenLastCalledWith(exportDirectory);
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.debug.actions.copySuccess'));
    expect(noticeSpy).toHaveBeenCalledWith(
      t('settings.debug.actions.generateSuccess', {
        path: `${exportDirectory}/opencodian-diagnostics.md`,
      }),
    );
  });
});
