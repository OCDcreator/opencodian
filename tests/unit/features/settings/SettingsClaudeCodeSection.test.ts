import { Setting } from 'obsidian';

import {
  DEFAULT_SETTINGS,
  getDefaultClaudeCodeBackendSettings,
} from '../../../../src/core/types';
import { SettingsClaudeCodeSection } from '../../../../src/features/settings/SettingsClaudeCodeSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

interface MockTextControl {
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextControl>;
  setValue: jest.MockedFunction<(value: string) => MockTextControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextControl>;
}

type MockTextAreaControl = MockTextControl;

interface MockDropdownControl {
  addOption: jest.MockedFunction<(value: string, label: string) => MockDropdownControl>;
  setValue: jest.MockedFunction<(value: string) => MockDropdownControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>;
}

interface MockToggleControl {
  setValue: jest.MockedFunction<(value: boolean) => MockToggleControl>;
  onChange: jest.MockedFunction<(callback: (value: boolean) => void | Promise<void>) => MockToggleControl>;
}

interface MockButtonControl {
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
}

interface ControlRecord<TControl> {
  control: TControl;
  name: string;
  onChange?: (value: never) => void | Promise<void>;
  onClick?: () => void | Promise<void>;
}

type TestPlugin = Pick<OpenCodianPlugin, 'settings' | 'saveSettings'>;

const textRecords: Array<ControlRecord<MockTextControl>> = [];
const textAreaRecords: Array<ControlRecord<MockTextAreaControl>> = [];
const dropdownRecords: Array<ControlRecord<MockDropdownControl>> = [];
const toggleRecords: Array<ControlRecord<MockToggleControl>> = [];
const buttonRecords: Array<ControlRecord<MockButtonControl> & { label?: string }> = [];

function createPlugin(): TestPlugin {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      backendSettings: {
        ...DEFAULT_SETTINGS.backendSettings,
        claudeCode: {
          ...getDefaultClaudeCodeBackendSettings(),
          executablePath: '/opt/homebrew/bin/claude',
          settingSources: ['project', 'user'],
          permissionMode: 'default',
          effort: 'medium',
          additionalDirectories: ['/tmp/context-one'],
          model: 'claude-sonnet-4-5',
          fallbackModel: '',
        },
      },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  } as unknown as TestPlugin;
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function createTextControl(): MockTextControl {
  const control: MockTextControl = {
    setPlaceholder: jest.fn(),
    setValue: jest.fn(),
    onChange: jest.fn(),
  };
  control.setPlaceholder.mockReturnValue(control);
  control.setValue.mockReturnValue(control);
  control.onChange.mockReturnValue(control);
  return control;
}

function createDropdownControl(): MockDropdownControl {
  const control: MockDropdownControl = {
    addOption: jest.fn(),
    setValue: jest.fn(),
    onChange: jest.fn(),
  };
  control.addOption.mockReturnValue(control);
  control.setValue.mockReturnValue(control);
  control.onChange.mockReturnValue(control);
  return control;
}

function createToggleControl(): MockToggleControl {
  const control: MockToggleControl = {
    setValue: jest.fn(),
    onChange: jest.fn(),
  };
  control.setValue.mockReturnValue(control);
  control.onChange.mockReturnValue(control);
  return control;
}

function createButtonControl(): MockButtonControl {
  const control: MockButtonControl = {
    setButtonText: jest.fn(),
    onClick: jest.fn(),
  };
  control.setButtonText.mockReturnValue(control);
  control.onClick.mockReturnValue(control);
  return control;
}

function mockSettingPrototype(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
    (this as Setting & { __settingName?: string }).__settingName = name;
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting) {
    return this;
  });
  jest.spyOn(Setting.prototype, 'setClass').mockImplementation(function setClass(this: Setting) {
    return this;
  });
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function addText(
    this: Setting,
    callback: (control: MockTextControl) => unknown,
  ) {
    const record: ControlRecord<MockTextControl> = {
      control: createTextControl(),
      name: (this as Setting & { __settingName?: string }).__settingName ?? '',
    };
    record.control.onChange.mockImplementation((handler) => {
      record.onChange = handler as (value: never) => void | Promise<void>;
      return record.control;
    });
    textRecords.push(record);
    callback(record.control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(function addTextArea(
    this: Setting,
    callback: (control: MockTextAreaControl) => unknown,
  ) {
    const record: ControlRecord<MockTextAreaControl> = {
      control: createTextControl(),
      name: (this as Setting & { __settingName?: string }).__settingName ?? '',
    };
    record.control.onChange.mockImplementation((handler) => {
      record.onChange = handler as (value: never) => void | Promise<void>;
      return record.control;
    });
    textAreaRecords.push(record);
    callback(record.control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function addDropdown(
    this: Setting,
    callback: (control: MockDropdownControl) => unknown,
  ) {
    const record: ControlRecord<MockDropdownControl> = {
      control: createDropdownControl(),
      name: (this as Setting & { __settingName?: string }).__settingName ?? '',
    };
    record.control.onChange.mockImplementation((handler) => {
      record.onChange = handler as (value: never) => void | Promise<void>;
      return record.control;
    });
    dropdownRecords.push(record);
    callback(record.control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function addToggle(
    this: Setting,
    callback: (control: MockToggleControl) => unknown,
  ) {
    const record: ControlRecord<MockToggleControl> = {
      control: createToggleControl(),
      name: (this as Setting & { __settingName?: string }).__settingName ?? '',
    };
    record.control.onChange.mockImplementation((handler) => {
      record.onChange = handler as (value: never) => void | Promise<void>;
      return record.control;
    });
    toggleRecords.push(record);
    callback(record.control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
    this: Setting,
    callback: (control: MockButtonControl) => unknown,
  ) {
    const record: ControlRecord<MockButtonControl> & { label?: string } = {
      control: createButtonControl(),
      name: (this as Setting & { __settingName?: string }).__settingName ?? '',
    };
    record.control.setButtonText.mockImplementation((value) => {
      record.label = value;
      return record.control;
    });
    record.control.onClick.mockImplementation((handler) => {
      record.onClick = handler;
      return record.control;
    });
    buttonRecords.push(record);
    callback(record.control);
    return this;
  });
}

function findText(name: string): ControlRecord<MockTextControl> {
  const record = textRecords.find((candidate) => candidate.name === name);
  expect(record).toBeDefined();
  return record!;
}

function findTextArea(name: string): ControlRecord<MockTextAreaControl> {
  const record = textAreaRecords.find((candidate) => candidate.name === name);
  expect(record).toBeDefined();
  return record!;
}

function findDropdown(name: string): ControlRecord<MockDropdownControl> {
  const record = dropdownRecords.find((candidate) => candidate.name === name);
  expect(record).toBeDefined();
  return record!;
}

function findToggle(name: string): ControlRecord<MockToggleControl> {
  const record = toggleRecords.find((candidate) => candidate.name === name);
  expect(record).toBeDefined();
  return record!;
}

function findButton(label: string): ControlRecord<MockButtonControl> & { label?: string } {
  const record = buttonRecords.find((candidate) => candidate.label === label);
  expect(record).toBeDefined();
  return record!;
}

describe('SettingsClaudeCodeSection', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    textRecords.length = 0;
    textAreaRecords.length = 0;
    dropdownRecords.length = 0;
    toggleRecords.length = 0;
    buttonRecords.length = 0;
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders the minimal Claude Code settings surface', () => {
    const plugin = createPlugin();
    const containerEl = document.createElement('div');
    const section = new SettingsClaudeCodeSection({
      plugin: plugin as OpenCodianPlugin,
      createSectionHeading,
    });

    section.attach(containerEl);

    expect(containerEl.textContent).toContain(t('settings.claudeCode.title'));
    expect(findText(t('settings.claudeCode.executablePath.name')).control.setValue)
      .toHaveBeenCalledWith('/opt/homebrew/bin/claude');
    expect(findText(t('settings.claudeCode.model.name')).control.setValue)
      .toHaveBeenCalledWith('claude-sonnet-4-5');
    expect(findDropdown(t('settings.claudeCode.permissionMode.name')).control.setValue)
      .toHaveBeenCalledWith('default');
    expect(findDropdown(t('settings.claudeCode.effort.name')).control.setValue)
      .toHaveBeenCalledWith('medium');
    expect(findTextArea(t('settings.claudeCode.additionalDirectories.name')).control.setValue)
      .toHaveBeenCalledWith('/tmp/context-one');
    expect(findButton(t('settings.claudeCode.diagnostics.button'))).toBeDefined();

    const renderedNames = [
      ...textRecords,
      ...textAreaRecords,
      ...dropdownRecords,
      ...toggleRecords,
      ...buttonRecords,
    ].map((record) => record.name.toLowerCase()).join('\n');
    expect(renderedNames).not.toContain('hooks');
    expect(renderedNames).not.toContain('skills authoring');
    expect(renderedNames).not.toContain('agent authoring');
    expect(renderedNames).not.toContain('sessionstore');
    expect(renderedNames).not.toContain('jsonl');
  });

  it('persists Claude Code settings without enabling the backend', async () => {
    const plugin = createPlugin();
    const containerEl = document.createElement('div');
    const section = new SettingsClaudeCodeSection({
      plugin: plugin as OpenCodianPlugin,
      createSectionHeading,
    });

    section.attach(containerEl);

    await findText(t('settings.claudeCode.executablePath.name')).onChange?.('/Users/test/bin/claude' as never);
    await findToggle(t('settings.claudeCode.settingSources.local')).onChange?.(true as never);
    await findToggle(t('settings.claudeCode.settingSources.project')).onChange?.(false as never);
    await findDropdown(t('settings.claudeCode.permissionMode.name')).onChange?.('plan' as never);
    await findDropdown(t('settings.claudeCode.thinking.name')).onChange?.('fixed' as never);
    await findText(t('settings.claudeCode.thinkingBudget.name')).onChange?.('8192' as never);
    await findDropdown(t('settings.claudeCode.effort.name')).onChange?.('high' as never);
    await findTextArea(t('settings.claudeCode.additionalDirectories.name')).onChange?.('/tmp/a\n\n/tmp/b\n/tmp/a' as never);

    expect(plugin.settings.backendSettings.claudeCode).toMatchObject({
      executablePath: '/Users/test/bin/claude',
      settingSources: ['user', 'local'],
      permissionMode: 'plan',
      thinking: { type: 'fixed', budgetTokens: 8192 },
      effort: 'high',
      additionalDirectories: ['/tmp/a', '/tmp/b'],
    });
    expect(plugin.settings.enabledBackends).toEqual(DEFAULT_SETTINGS.enabledBackends);
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  it('runs diagnostics through the injected process resolver', async () => {
    const plugin = createPlugin();
    const containerEl = document.createElement('div');
    const resolveProcess = jest.fn().mockReturnValue({
      mode: 'external',
      pathToClaudeCodeExecutable: '/Users/test/bin/claude',
      env: {},
      shell: false,
      diagnostics: {
        configuredPath: '/Users/test/bin/claude',
        resolvedExternalPath: '/Users/test/bin/claude',
        pathAugmented: true,
      },
    });
    const section = new SettingsClaudeCodeSection({
      plugin: plugin as OpenCodianPlugin,
      createSectionHeading,
      resolveProcess,
    });

    section.attach(containerEl);
    await findButton(t('settings.claudeCode.diagnostics.button')).onClick?.();

    expect(resolveProcess).toHaveBeenCalledWith(expect.objectContaining({
      settings: plugin.settings.backendSettings.claudeCode,
    }));
    expect(containerEl.textContent).toContain('/Users/test/bin/claude');
  });
});
