/* eslint-disable max-lines, max-lines-per-function -- Claude Code settings coverage keeps tabbed/classic layout, diagnostics, thinking, and persistence fixtures together. */
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
  setDisabled: jest.MockedFunction<(value: boolean) => MockButtonControl>;
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

function createPlugin(options: {
  existingFiles?: string[];
  claudeAdapter?: unknown;
} = {}): TestPlugin {
  const existingFiles = new Set(options.existingFiles ?? []);
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
    app: {
      vault: {
        adapter: {
          exists: jest.fn(async (targetPath: string) => existingFiles.has(targetPath)),
        },
      },
    },
    agentServiceRegistry: {
      get: jest.fn((backend: string) => backend === 'claude-code' ? options.claudeAdapter : null),
    },
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
    setDisabled: jest.fn(),
    onClick: jest.fn(),
  };
  control.setButtonText.mockReturnValue(control);
  control.setDisabled.mockReturnValue(control);
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

function findButton(label: string): ControlRecord<MockButtonControl> & { label?: string } {
  const record = buttonRecords.find((candidate) => candidate.label === label);
  expect(record).toBeDefined();
  return record!;
}

function findDropdown(name: string): ControlRecord<MockDropdownControl> {
  const record = dropdownRecords.find((candidate) => candidate.name === name);
  expect(record).toBeDefined();
  return record!;
}

function findToggle(name: string): ControlRecord<MockToggleControl> {
  const record = toggleRecords.find((candidate) => candidate.name === name)
    ?? (name === t('settings.claudeCode.settingSources.project')
      ? toggleRecords.find((candidate) => candidate.name === t('settings.claudeCode.settingSources.name'))
      : undefined);
  expect(record).toBeDefined();
  return record!;
}

function findTextArea(name: string): ControlRecord<MockTextAreaControl> {
  const record = textAreaRecords.find((candidate) => candidate.name === name);
  expect(record).toBeDefined();
  return record!;
}

async function flushProjectSourceStatus(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
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

  it('renders all Claude Code capability groups in the classic settings surface', () => {
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
    expect(findButton(t('settings.claudeCode.environment.status')).control.setDisabled)
      .toHaveBeenCalledWith(true);
    expect(findButton(t('settings.claudeCode.diagnostics.button'))).toBeDefined();

    expect(findText(t('settings.claudeCode.model.name'))).toBeDefined();
    expect(findDropdown(t('settings.claudeCode.thinking.name'))).toBeDefined();
    expect(findDropdown(t('settings.claudeCode.permissionMode.name'))).toBeDefined();
    expect(findToggle(t('settings.claudeCode.settingSources.project'))).toBeDefined();
    expect(findTextArea(t('settings.claudeCode.additionalDirectories.name'))).toBeDefined();
    expect(containerEl.querySelector('[data-settings-target="claude-code-runtime"]')).toBeDefined();
    expect(containerEl.querySelector('[data-claude-code-section="model-thinking"]')).toBeDefined();
    expect(containerEl.querySelector('[data-claude-code-section="permissions"]')).toBeDefined();
    expect(containerEl.querySelector('[data-claude-code-section="context-sources"]')).toBeDefined();
    expect(containerEl.querySelector('[data-claude-code-section="tools"]')).toBeDefined();

    const renderedNamesLower = [
      ...textRecords,
      ...textAreaRecords,
      ...dropdownRecords,
      ...toggleRecords,
      ...buttonRecords,
    ].map((record) => record.name).join('\n').toLowerCase();
    expect(renderedNamesLower).not.toContain('hooks');
    expect(renderedNamesLower).not.toContain('skills authoring');
    expect(renderedNamesLower).not.toContain('agent authoring');
    expect(renderedNamesLower).not.toContain('sessionstore');
    expect(renderedNamesLower).not.toContain('jsonl');
  });

  it('persists Claude Code runtime settings without changing backend enablement', async () => {
    const plugin = createPlugin();
    const containerEl = document.createElement('div');
    const section = new SettingsClaudeCodeSection({
      plugin: plugin as OpenCodianPlugin,
      createSectionHeading,
    });

    section.attach(containerEl);

    await findText(t('settings.claudeCode.executablePath.name')).onChange?.('/Users/test/bin/claude' as never);

    expect(plugin.settings.backendSettings.claudeCode).toMatchObject({
      executablePath: '/Users/test/bin/claude',
      settingSources: ['project', 'user'],
      permissionMode: 'default',
      thinking: { type: 'adaptive' },
      effort: 'medium',
      additionalDirectories: ['/tmp/context-one'],
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

describe('SettingsClaudeCodeSection multi-tab', () => {
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

  describe('Model & Thinking tab', () => {
    it('renders with editable controls', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      expect(findText(t('settings.claudeCode.model.name')).control.setValue)
        .toHaveBeenCalledWith('claude-sonnet-4-5');
      expect(findText(t('settings.claudeCode.fallbackModel.name')).control.setValue)
        .toHaveBeenCalledWith('');
      expect(findDropdown(t('settings.claudeCode.thinking.name'))).toBeDefined();
      expect(findDropdown(t('settings.claudeCode.effort.name'))).toBeDefined();
    });

    it('renders max turns and budget limits alongside the next-query boundary notice', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      expect(findText(t('settings.claudeCode.maxTurns.name'))).toBeDefined();
      expect(findText(t('settings.claudeCode.maxBudgetUsd.name'))).toBeDefined();
      expect(containerEl.querySelector('[data-claude-code-limits-boundary="true"]')).toBeTruthy();
      expect(containerEl.textContent).toContain(t('settings.claudeCode.runtimeBoundary.nextQuery'));
      expect(findButton(t('settings.claudeCode.runtimeBoundary.restartButton'))).toBeDefined();
    });

    it('regression: limits boundary notice is present whenever max turns and budget controls render', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      const hasLimitsBoundary = containerEl.querySelector('[data-claude-code-limits-boundary="true"]');
      const hasMaxTurns = textRecords.some((r) => r.name === t('settings.claudeCode.maxTurns.name'));
      const hasMaxBudget = textRecords.some((r) => r.name === t('settings.claudeCode.maxBudgetUsd.name'));
      expect(hasMaxTurns).toBe(true);
      expect(hasMaxBudget).toBe(true);
      expect(hasLimitsBoundary).toBeTruthy();
    });

    it('renders fallback model boundary notice in model-thinking tab', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      const boundaryEl = containerEl.querySelector('[data-claude-code-fallback-model-boundary="true"]');
      expect(boundaryEl).toBeTruthy();
      expect(containerEl.textContent).toContain(t('settings.claudeCode.fallbackModel.boundaryNotice'));
    });

    it('renders fallback model proof status notice with wiring state in model-thinking tab', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      const noticeEl = containerEl.querySelector('[data-claude-code-proof-status="fallback-model"]');
      expect(noticeEl).toBeTruthy();
      expect(noticeEl?.getAttribute('data-proof-state')).toBe('wiring');
      expect(containerEl.textContent).toContain(t('settings.claudeCode.proofStatus.fallbackModel'));
    });

    it('renders limits proof status notice with readback state in model-thinking tab', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      const noticeEl = containerEl.querySelector('[data-claude-code-proof-status="limits"]');
      expect(noticeEl).toBeTruthy();
      expect(noticeEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(containerEl.textContent).toContain(t('settings.claudeCode.proofStatus.limits'));
    });

    it('does not render an inert thinking budget input for adaptive thinking', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      expect(textRecords.some((record) => record.name === t('settings.claudeCode.thinkingBudget.name')))
        .toBe(false);
    });

    it('renders and preserves a fixed thinking budget', async () => {
      const plugin = createPlugin();
      plugin.settings.backendSettings.claudeCode.thinking = { type: 'fixed', budgetTokens: 8192 };
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      expect(findText(t('settings.claudeCode.thinkingBudget.name')).control.setValue)
        .toHaveBeenCalledWith('8192');
      await findDropdown(t('settings.claudeCode.thinking.name')).onChange?.('fixed' as never);
      expect(plugin.settings.backendSettings.claudeCode.thinking).toEqual({ type: 'fixed', budgetTokens: 8192 });
    });

    it('persists model changes from Model & Thinking tab', async () => {
      const claudeAdapter = { setModel: jest.fn().mockResolvedValue(undefined) };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      await findText(t('settings.claudeCode.model.name')).onChange?.('claude-opus-4-5' as never);
      expect(plugin.settings.backendSettings.claudeCode.model).toBe('claude-opus-4-5');
      expect(claudeAdapter.setModel).toHaveBeenCalledWith('claude-opus-4-5');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('still persists model changes when live adapter model update fails', async () => {
      const claudeAdapter = { setModel: jest.fn().mockRejectedValue(new Error('sdk busy')) };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      await findText(t('settings.claudeCode.model.name')).onChange?.('claude-opus-4-5' as never);

      expect(plugin.settings.backendSettings.claudeCode.model).toBe('claude-opus-4-5');
      expect(claudeAdapter.setModel).toHaveBeenCalledWith('claude-opus-4-5');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('persists effort changes from Model & Thinking tab', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      await findDropdown(t('settings.claudeCode.effort.name')).onChange?.('high' as never);
      expect(plugin.settings.backendSettings.claudeCode.effort).toBe('high');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('renders model quick-select dropdowns in model-thinking tab', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      expect(findDropdown(t('settings.claudeCode.model.quickSelectName'))).toBeDefined();
      expect(findDropdown(t('settings.claudeCode.fallbackModel.quickSelectName'))).toBeDefined();
    });

    it('selects a model from the quick-select dropdown and updates the model field', async () => {
      const claudeAdapter = {
        supportedModels: jest.fn().mockResolvedValue([
          { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
          { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'anthropic' },
        ]),
        setModel: jest.fn().mockResolvedValue(undefined),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      // Wait for async catalog load
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });

      expect(claudeAdapter.supportedModels).toHaveBeenCalled();

      await findDropdown(t('settings.claudeCode.model.quickSelectName')).onChange?.('claude-opus-4-5' as never);

      expect(plugin.settings.backendSettings.claudeCode.model).toBe('claude-opus-4-5');
      expect(claudeAdapter.setModel).toHaveBeenCalledWith('claude-opus-4-5');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('selects a fallback model from the quick-select dropdown', async () => {
      const claudeAdapter = {
        supportedModels: jest.fn().mockResolvedValue([
          { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
          { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'anthropic' },
        ]),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      // Wait for async catalog load
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });

      await findDropdown(t('settings.claudeCode.fallbackModel.quickSelectName')).onChange?.('claude-opus-4-5' as never);

      expect(plugin.settings.backendSettings.claudeCode.fallbackModel).toBe('claude-opus-4-5');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('ignores empty selection in quick-select dropdowns', async () => {
      const claudeAdapter = {
        supportedModels: jest.fn().mockResolvedValue([
          { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
        ]),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      // Wait for async catalog load
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });

      const originalModel = plugin.settings.backendSettings.claudeCode.model;
      await findDropdown(t('settings.claudeCode.model.quickSelectName')).onChange?.('' as never);

      expect(plugin.settings.backendSettings.claudeCode.model).toBe(originalModel);
    });

    it('persists thinking type changes from Model & Thinking tab', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      // Switch to fixed — should set default budgetTokens
      await findDropdown(t('settings.claudeCode.thinking.name')).onChange?.('fixed' as never);
      expect(plugin.settings.backendSettings.claudeCode.thinking).toEqual({ type: 'fixed', budgetTokens: 4096 });

      // Switch to disabled
      await findDropdown(t('settings.claudeCode.thinking.name')).onChange?.('disabled' as never);
      expect(plugin.settings.backendSettings.claudeCode.thinking).toEqual({ type: 'disabled' });
    });

    it('renders Permissions tab with permission mode dropdown', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions');

      expect(findDropdown(t('settings.claudeCode.permissionMode.name'))).toBeDefined();
    });

    it('persists permission mode changes from Permissions tab', async () => {
      const claudeAdapter = { setPermissionMode: jest.fn().mockResolvedValue(undefined) };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions');

      await findDropdown(t('settings.claudeCode.permissionMode.name')).onChange?.('plan' as never);
      expect(plugin.settings.backendSettings.claudeCode.permissionMode).toBe('plan');
      expect(claudeAdapter.setPermissionMode).toHaveBeenCalledWith('plan');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('still persists permission mode when live adapter permission update fails', async () => {
      const claudeAdapter = { setPermissionMode: jest.fn().mockRejectedValue(new Error('sdk busy')) };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions');

      await findDropdown(t('settings.claudeCode.permissionMode.name')).onChange?.('plan' as never);

      expect(plugin.settings.backendSettings.claudeCode.permissionMode).toBe('plan');
      expect(claudeAdapter.setPermissionMode).toHaveBeenCalledWith('plan');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });
  });

  describe('context-sources tab', () => {
    it('renders Context & Sources tab with setting source toggles and directories textarea', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'context-sources');

      expect(findToggle(t('settings.claudeCode.settingSources.project'))).toBeDefined();
      expect(findToggle(t('settings.claudeCode.settingSources.user'))).toBeDefined();
      expect(findToggle(t('settings.claudeCode.settingSources.local'))).toBeDefined();
      expect(findTextArea(t('settings.claudeCode.additionalDirectories.name'))).toBeDefined();
    });

    it('surfaces project source file visibility for Claude Code project settings', async () => {
      const plugin = createPlugin({
        existingFiles: ['CLAUDE.md', '.claude/settings.local.json'],
      });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'context-sources');

      await flushProjectSourceStatus();

      const adapter = (plugin as unknown as {
        app: { vault: { adapter: { exists: jest.Mock } } };
      }).app.vault.adapter;
      expect(adapter.exists).toHaveBeenCalledWith('CLAUDE.md');
      expect(adapter.exists).toHaveBeenCalledWith('.claude/settings.json');
      expect(adapter.exists).toHaveBeenCalledWith('.claude/settings.local.json');
      expect(containerEl.textContent).toContain(t('settings.claudeCode.projectSources.title'));
      expect(containerEl.textContent).toContain(t('settings.claudeCode.projectSources.present', { file: 'CLAUDE.md' }));
      expect(containerEl.textContent).toContain(t('settings.claudeCode.projectSources.missing', { file: '.claude/settings.json' }));
      expect(containerEl.textContent).toContain(
        t('settings.claudeCode.projectSources.present', { file: '.claude/settings.local.json' }),
      );
    });

    it('shows the next-query boundary for source and directory settings', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'context-sources');

      expect(containerEl.textContent).toContain(t('settings.claudeCode.runtimeBoundary.nextQuery'));
      expect(findButton(t('settings.claudeCode.runtimeBoundary.restartButton'))).toBeDefined();
    });

    it('can manually restart active Claude Code persistent sessions after restart-sensitive changes', async () => {
      const claudeAdapter = { restartPersistentQueries: jest.fn().mockResolvedValue(undefined) };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'context-sources');

      await findButton(t('settings.claudeCode.runtimeBoundary.restartButton')).onClick?.();

      expect(claudeAdapter.restartPersistentQueries).toHaveBeenCalledWith('settings-change');
    });

    it('persists setting source changes from Context & Sources tab', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'context-sources');

      await findToggle(t('settings.claudeCode.settingSources.local')).onChange?.(true as never);
      expect(plugin.settings.backendSettings.claudeCode.settingSources).toContain('local');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });
  });

  describe('runtime tab', () => {
    it('shows the next-query boundary for environment variables', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      expect(containerEl.textContent).toContain(t('settings.claudeCode.runtimeBoundary.nextQuery'));
      expect(findButton(t('settings.claudeCode.runtimeBoundary.restartButton'))).toBeDefined();
    });

    it('can manually restart active Claude Code sessions from Runtime tab changes', async () => {
      const claudeAdapter = { restartPersistentQueries: jest.fn().mockResolvedValue(undefined) };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findButton(t('settings.claudeCode.runtimeBoundary.restartButton')).onClick?.();

      expect(claudeAdapter.restartPersistentQueries).toHaveBeenCalledWith('settings-change');
    });

    it('renders environment variables with runtime process settings', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      expect(findTextArea(t('settings.claudeCode.env.name'))).toBeDefined();
      await findTextArea(t('settings.claudeCode.env.name')).onChange?.('CLAUDE_AGENT_SDK_CLIENT_APP=opencodian' as never);

      expect(plugin.settings.backendSettings.claudeCode.env).toEqual({
        CLAUDE_AGENT_SDK_CLIENT_APP: 'opencodian',
      });
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('renders env proof status notice with readback state in runtime tab', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      const noticeEl = containerEl.querySelector('[data-claude-code-proof-status="env"]');
      expect(noticeEl).toBeTruthy();
      expect(noticeEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(containerEl.textContent).toContain(t('settings.claudeCode.proofStatus.env'));
    });

    it('rejects env keys with spaces or invalid characters', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findTextArea(t('settings.claudeCode.env.name')).onChange?.(
        'VALID_KEY=value\nINVALID KEY=space\n123_START=digit\nSPECIAL-KEY=hyphen' as never,
      );

      expect(plugin.settings.backendSettings.claudeCode.env).toEqual({
        VALID_KEY: 'value',
      });
    });

    it('accepts env keys with underscores and trailing digits', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findTextArea(t('settings.claudeCode.env.name')).onChange?.(
        '_PRIVATE=secret\nAPI_KEY_2=token\nCLAUDE_V1=enabled' as never,
      );

      expect(plugin.settings.backendSettings.claudeCode.env).toEqual({
        _PRIVATE: 'secret',
        API_KEY_2: 'token',
        CLAUDE_V1: 'enabled',
      });
    });
  });

  describe('tools tab', () => {
    it('shows the next-query boundary for tool and MCP settings', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'tools');

      expect(containerEl.textContent).toContain(t('settings.claudeCode.runtimeBoundary.nextQuery'));
      expect(findButton(t('settings.claudeCode.runtimeBoundary.restartButton'))).toBeDefined();
    });

    it('renders and persists tool allow/block lists', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'tools');

      expect(findTextArea(t('settings.claudeCode.allowedTools.name'))).toBeDefined();
      expect(findTextArea(t('settings.claudeCode.disallowedTools.name'))).toBeDefined();

      await findTextArea(t('settings.claudeCode.allowedTools.name')).onChange?.('Read\nGrep\nRead' as never);
      expect(plugin.settings.backendSettings.claudeCode.allowedTools).toEqual(['Read', 'Grep']);
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('renders tools proof status notice with readback state in tools tab', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'tools');

      const noticeEl = containerEl.querySelector('[data-claude-code-proof-status="tools"]');
      expect(noticeEl).toBeTruthy();
      expect(noticeEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(containerEl.textContent).toContain(t('settings.claudeCode.proofStatus.tools'));
    });

    it('rejects invalid tool names and keeps only valid PascalCase alphanumeric names', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'tools');

      await findTextArea(t('settings.claudeCode.allowedTools.name')).onChange?.(
        'Read\nGrep Tool\nBash\n123Tool\nEdit\nspecial-tool' as never,
      );
      // Only valid PascalCase alphanumeric names should be kept.
      expect(plugin.settings.backendSettings.claudeCode.allowedTools).toEqual(['Read', 'Bash', 'Edit']);

      await findTextArea(t('settings.claudeCode.disallowedTools.name')).onChange?.(
        'Bash\ninvalid name\nGlob\n' as never,
      );
      expect(plugin.settings.backendSettings.claudeCode.disallowedTools).toEqual(['Bash', 'Glob']);
    });

    it('shows MCP runtime status and refreshes the active Claude adapter config', async () => {
      const claudeAdapter = {
        getMcpServerCount: jest.fn()
          .mockReturnValueOnce(2)
          .mockReturnValueOnce(3),
        reloadMcpServers: jest.fn().mockResolvedValue(undefined),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'tools');

      expect(containerEl.textContent).toContain(
        t('settings.claudeCode.mcpRuntime.loaded', { count: 2 }),
      );

      await findButton(t('settings.claudeCode.mcpRuntime.refreshButton')).onClick?.();

      expect(claudeAdapter.reloadMcpServers).toHaveBeenCalledTimes(1);
      expect(containerEl.textContent).toContain(
        t('settings.claudeCode.mcpRuntime.loaded', { count: 3 }),
      );
    });

    it('keeps the MCP runtime refresh failure visible', async () => {
      const claudeAdapter = {
        getMcpServerCount: jest.fn().mockReturnValue(2),
        reloadMcpServers: jest.fn().mockRejectedValue(new Error('reload failed')),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'tools');

      await findButton(t('settings.claudeCode.mcpRuntime.refreshButton')).onClick?.();

      expect(claudeAdapter.reloadMcpServers).toHaveBeenCalledTimes(1);
      expect(containerEl.textContent).toContain(t('settings.claudeCode.mcpRuntime.refreshFailed'));
      expect(containerEl.textContent).not.toContain(
        t('settings.claudeCode.mcpRuntime.loaded', { count: 2 }),
      );
    });
  });

  describe('limits (now in model-thinking tab)', () => {
    it('renders turn and budget limit controls in model-thinking tab', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      expect(findText(t('settings.claudeCode.maxTurns.name'))).toBeDefined();
      expect(findText(t('settings.claudeCode.maxBudgetUsd.name'))).toBeDefined();

      await findText(t('settings.claudeCode.maxTurns.name')).onChange?.('12' as never);
      expect(plugin.settings.backendSettings.claudeCode.maxTurns).toBe(12);
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('rejects partially numeric turn and budget limit input', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      await findText(t('settings.claudeCode.maxTurns.name')).onChange?.('12abc' as never);
      await findText(t('settings.claudeCode.maxBudgetUsd.name')).onChange?.('5usd' as never);

      expect(plugin.settings.backendSettings.claudeCode.maxTurns).toBeNull();
      expect(plugin.settings.backendSettings.claudeCode.maxBudgetUsd).toBeNull();
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('rejects negative and zero turn and budget limits', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      await findText(t('settings.claudeCode.maxTurns.name')).onChange?.('-5' as never);
      await findText(t('settings.claudeCode.maxBudgetUsd.name')).onChange?.('0' as never);

      expect(plugin.settings.backendSettings.claudeCode.maxTurns).toBeNull();
      expect(plugin.settings.backendSettings.claudeCode.maxBudgetUsd).toBeNull();
    });

    it('accepts decimal budget but rejects decimal turns', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      await findText(t('settings.claudeCode.maxTurns.name')).onChange?.('12.5' as never);
      await findText(t('settings.claudeCode.maxBudgetUsd.name')).onChange?.('12.5' as never);

      expect(plugin.settings.backendSettings.claudeCode.maxTurns).toBeNull();
      expect(plugin.settings.backendSettings.claudeCode.maxBudgetUsd).toBe(12.5);
    });

    it('clears limits when empty string is provided', async () => {
      const plugin = createPlugin();
      plugin.settings.backendSettings.claudeCode.maxTurns = 50;
      plugin.settings.backendSettings.claudeCode.maxBudgetUsd = 5;
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      await findText(t('settings.claudeCode.maxTurns.name')).onChange?.('' as never);
      await findText(t('settings.claudeCode.maxBudgetUsd.name')).onChange?.('' as never);

      expect(plugin.settings.backendSettings.claudeCode.maxTurns).toBeNull();
      expect(plugin.settings.backendSettings.claudeCode.maxBudgetUsd).toBeNull();
    });
  });

  describe('advanced capability gating', () => {
    it('does not render advanced Claude capabilities that lack runtime proof', () => {
      const plugin = createPlugin();
      const allTabs = ['runtime', 'model-thinking', 'permissions', 'context-sources', 'tools'] as const;

      for (const tab of allTabs) {
        const containerEl = document.createElement('div');
        const section = new SettingsClaudeCodeSection({
          plugin: plugin as OpenCodianPlugin,
          createSectionHeading,
        });
        section.attachTabbed(containerEl, tab);

        const renderedNames = [
          ...textRecords,
          ...textAreaRecords,
          ...dropdownRecords,
          ...toggleRecords,
          ...buttonRecords,
        ].map((r) => r.name.toLowerCase()).join('\n');
        expect(renderedNames).not.toContain('hook authoring');
        expect(renderedNames).not.toContain('skills');
        expect(renderedNames).not.toContain('agents');
        expect(renderedNames).not.toContain('sessionstore');
        expect(renderedNames).not.toContain('jsonl');
      }
    });
  });
});
