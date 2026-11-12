/* eslint-disable max-lines, max-lines-per-function -- Claude Code settings coverage keeps tabbed/classic layout, diagnostics, thinking, and persistence fixtures together. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as obsidian from 'obsidian';
import { Setting } from 'obsidian';

import {
  DEFAULT_SETTINGS,
  getDefaultClaudeCodeBackendSettings,
} from '../../../../src/core/types';
import { SettingsClaudeCodeSection } from '../../../../src/features/settings/backends/claude/SettingsClaudeCodeSection';
import { SettingsClaudeConfigurationSection } from '../../../../src/features/settings/backends/claude/SettingsClaudeConfigurationSection';
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

interface MockExtraButtonControl {
  setIcon: jest.MockedFunction<(icon: string) => MockExtraButtonControl>;
  setTooltip: jest.MockedFunction<(tooltip: string) => MockExtraButtonControl>;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockExtraButtonControl>;
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
const extraButtonRecords: Array<ControlRecord<MockExtraButtonControl> & { tooltip?: string; icon?: string }> = [];

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

function createExtraButtonControl(): MockExtraButtonControl {
  const control: MockExtraButtonControl = {
    setIcon: jest.fn(),
    setTooltip: jest.fn(),
    onClick: jest.fn(),
  };
  control.setIcon.mockReturnValue(control);
  control.setTooltip.mockReturnValue(control);
  control.onClick.mockReturnValue(control);
  return control;
}

function mockSettingPrototype(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
    (this as Setting & { __settingName?: string }).__settingName = name;
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(
    this: Setting & { settingEl: HTMLElement },
    desc: string | DocumentFragment,
  ) {
    if (typeof desc === 'string') {
      let descEl = this.settingEl.querySelector('.setting-item-description');
      if (!descEl) {
        descEl = document.createElement('div');
        descEl.className = 'setting-item-description';
        this.settingEl.appendChild(descEl);
      }
      descEl.textContent = desc;
    }
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
  jest.spyOn(Setting.prototype, 'addExtraButton').mockImplementation(function addExtraButton(
    this: Setting,
    callback: (control: MockExtraButtonControl) => unknown,
  ) {
    const record: ControlRecord<MockExtraButtonControl> & { tooltip?: string; icon?: string } = {
      control: createExtraButtonControl(),
      name: (this as Setting & { __settingName?: string }).__settingName ?? '',
    };
    record.control.setIcon.mockImplementation((icon) => {
      record.icon = icon;
      return record.control;
    });
    record.control.setTooltip.mockImplementation((tooltip) => {
      record.tooltip = tooltip;
      return record.control;
    });
    record.control.onClick.mockImplementation((handler) => {
      record.onClick = handler;
      return record.control;
    });
    extraButtonRecords.push(record);
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

function expectGroupOrder(containerEl: HTMLElement, expectedGroups: string[]): void {
  const actualGroups = Array.from(containerEl.querySelectorAll('[data-claude-code-group]'))
    .map((groupEl) => groupEl.getAttribute('data-claude-code-group'));
  expect(actualGroups).toEqual(expectedGroups);
}

function findChoiceRadios(containerEl: HTMLElement, backendKey: string): HTMLInputElement[] {
  return Array.from(containerEl.querySelectorAll<HTMLInputElement>(
    `[role="radiogroup"][data-backend-key="${backendKey}"] input[type="radio"]`,
  ));
}

/** Clicks a backend choice radio and lets the async commit settle. */
async function chooseRadio(containerEl: HTMLElement, backendKey: string, value: string): Promise<void> {
  const input = findChoiceRadios(containerEl, backendKey).find((candidate) => candidate.value === value);
  expect(input).toBeDefined();
  // jsdom does not synthesize `change` from radio clicks; a real browser fires
  // it when the checked radio changes, so dispatch it explicitly.
  input!.checked = true;
  input!.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}

function expectClaudeCodeGroupChrome(containerEl: HTMLElement): void {
  for (const groupEl of Array.from(containerEl.querySelectorAll<HTMLElement>('[data-claude-code-group]'))) {
    if (groupEl.dataset.claudeCodeGroup === 'runtime-ecosystem') {
      expect(groupEl.tagName).toBe('DETAILS');
      expect(groupEl.querySelector(':scope > summary')?.textContent).toBe(t('settings.claudeCode.groups.runtimeEcosystem.title'));
    } else {
      expect(groupEl.querySelector(':scope > .opencodian-claude-code-group-header')).toBeTruthy();
      expect(groupEl.querySelector(':scope > .opencodian-claude-code-group-header .opencodian-claude-code-group-title')).toBeTruthy();
    }
    expect(groupEl.querySelector(':scope > .opencodian-claude-code-stack')).toBeTruthy();
  }
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
    extraButtonRecords.length = 0;
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

    // Model rows are choice-first: inherit-first dropdowns with the saved
    // value preserved (marked option) instead of bare text inputs.
    const modelDropdown = findDropdown(t('settings.claudeCode.model.name'));
    expect(modelDropdown.control.setValue).toHaveBeenCalledWith('claude-sonnet-4-5');
    expect(modelDropdown.control.addOption).toHaveBeenCalledWith('', t('settings.backendRefresh.default.empty'));
    expect(modelDropdown.control.addOption).toHaveBeenCalledWith(
      'claude-sonnet-4-5',
      t('settings.claudeCode.modelId.unlistedOption', { value: 'claude-sonnet-4-5' }),
    );
    expect(findDropdown(t('settings.claudeCode.fallbackModel.name')).control.setValue).toHaveBeenCalledWith('');
    // Verified CLI aliases are real choices; no unverified alias (haiku) is
    // invented, and inherit/custom stay unaffected.
    const modelOptionValues = modelDropdown.control.addOption.mock.calls.map(([value]) => value);
    expect(modelOptionValues).toEqual(
      expect.arrayContaining(['', 'fable', 'opus', 'sonnet', '__custom__', 'claude-sonnet-4-5']),
    );
    expect(modelOptionValues).not.toContain('haiku');
    expect(findChoiceRadios(containerEl, 'claude.thinking')).toHaveLength(3);
    expect(findChoiceRadios(containerEl, 'claude.permissionMode')).toHaveLength(4);
    expect(findToggle(t('settings.claudeCode.settingSources.project'))).toBeDefined();
    expect(findTextArea(t('settings.claudeCode.additionalDirectories.name'))).toBeDefined();
    expect(containerEl.querySelector('[data-settings-surface="tab-body"][data-claude-code-section="connection"]')).toBeDefined();
    expect(containerEl.querySelector('[data-claude-code-group="models"]')).toBeDefined();
    expect(containerEl.querySelector('[data-claude-code-group="connection-runtime"]')).toBeDefined();
    expect(containerEl.querySelector('[data-claude-code-group="runtime-ecosystem"]')).toBeDefined();
    expect(containerEl.querySelector('[data-claude-code-group="project-files"]')).toBeDefined();
    expect(containerEl.querySelector('[data-claude-code-group="runtime-inspection"]')).toBeDefined();
    expect(containerEl.querySelector('[data-claude-code-group="diagnostics-logs"]')).toBeDefined();
    expect(containerEl.querySelector('[data-claude-code-section="conversation"]')).toBeDefined();
    expect(containerEl.querySelector('[data-claude-code-section="permissions-safety"]')).toBeDefined();
    expect(containerEl.querySelector('[data-claude-code-section="tools-context"]')).toBeDefined();
    expect(containerEl.querySelector('[data-claude-code-section="providers"]')).toBeDefined();
    expect(containerEl.querySelector('[data-claude-code-section="resources"]')).toBeDefined();
    expectClaudeCodeGroupChrome(containerEl);

    const runtimeReadback = containerEl.querySelector('[data-claude-code-runtime-ecosystem="true"]');
    expect(runtimeReadback).toBeTruthy();
    expect(runtimeReadback?.getAttribute('data-proof-state')).toBe('readback');
    expect(runtimeReadback?.classList.contains('opencodian-claude-code-readback')).toBe(true);

    expect(containerEl.querySelector('[data-claude-code-group="connection-runtime"] > .opencodian-claude-code-stack .setting-item')).toBeTruthy();

    const renderedNamesLower = [
      ...textRecords,
      ...textAreaRecords,
      ...dropdownRecords,
      ...toggleRecords,
      ...buttonRecords,
    ].map((record) => record.name).join('\n').toLowerCase();
    expect(renderedNamesLower).not.toContain('hook editor');
    expect(renderedNamesLower).not.toContain('hooks authoring');
    expect(renderedNamesLower).not.toContain('skills authoring');
    expect(renderedNamesLower).not.toContain('agent authoring');
    expect(renderedNamesLower).not.toContain('sessionstore');
    expect(renderedNamesLower).not.toContain('jsonl');
  });

  it('distinguishes the main-model field and leads its proof chip only in a task workspace', () => {
    for (const taskWorkspace of [false, true]) {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      containerEl.classList.toggle('opencodian-backend-task-workspace', taskWorkspace);
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'conversation');

      expect(containerEl.querySelector('[data-claude-code-group="models"] .opencodian-claude-code-group-title')?.textContent)
        .not.toBe(t('settings.claudeCode.model.name'));
      const chip = containerEl.querySelector<HTMLElement>('[data-claude-code-proof-status="main-model"]')!;
      expect(chip.dataset.proofState).toBe('pass');
      expect(chip.parentElement?.classList.contains('setting-item-control')).toBe(true);
      expect(chip.parentElement?.firstElementChild === chip).toBe(taskWorkspace);
      expect(containerEl.querySelector(`#${chip.getAttribute('aria-labelledby')}`)?.textContent)
        .toBe(t('settings.claudeCode.proofStatus.mainModel'));
    }
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

  it('shows install/configure guidance when runtime diagnostics cannot find an external Claude CLI', async () => {
    const plugin = createPlugin();
    const containerEl = document.createElement('div');
    const resolveProcess = jest.fn().mockReturnValue({
      mode: 'missing',
      env: {},
      shell: false,
      diagnostics: {
        configuredPath: '/missing/claude',
        resolvedExternalPath: null,
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

    expect(containerEl.textContent).toContain(t('settings.claudeCode.diagnostics.missingWithPath', {
      path: '/missing/claude',
    }));
    expect(containerEl.textContent).toContain('/missing/claude');
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
    extraButtonRecords.length = 0;
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe('Model & Thinking tab', () => {
    it('renders semantic groups in the approved order', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      expectGroupOrder(containerEl, [
        'models',
        'thinking-effort',
        'prompt-behavior',
        'title-inline-overrides',
        'question-ux',
      ]);
      expectClaudeCodeGroupChrome(containerEl);
      expect(containerEl.querySelectorAll('[data-claude-code-group]')).toHaveLength(5);
    });

    it('renders conversation defaults with restored model fields and choice controls', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      // Choice-first: thinking (3 shapes) and effort (5 levels) are radios.
      expect(findChoiceRadios(containerEl, 'claude.thinking')).toHaveLength(3);
      expect(findChoiceRadios(containerEl, 'claude.effort')).toHaveLength(5);
      // Restored capability: main/fallback model are inherit-first dropdowns
      // with the verified CLI alias choices.
      const mainModelDropdown = findDropdown(t('settings.claudeCode.model.name'));
      const mainModelOptions = mainModelDropdown.control.addOption.mock.calls.map(([value]) => value);
      expect(mainModelOptions.slice(0, 5)).toEqual(['', 'fable', 'opus', 'sonnet', '__custom__']);
      const fallbackModelOptions = findDropdown(t('settings.claudeCode.fallbackModel.name')).control.addOption.mock.calls.map(([value]) => value);
      expect(fallbackModelOptions.slice(0, 5)).toEqual(['', 'fable', 'opus', 'sonnet', '__custom__']);
      // Guardrails stay on the permissions-safety page.
      expect(textRecords.some((record) => record.name === t('settings.claudeCode.maxTurns.name'))).toBe(false);
      expect(toggleRecords.some((record) => record.name === t('settings.claudeCode.promptSuggestions.name'))).toBe(true);
    });

    it('persists model choice changes and preserves unknown saved ids', async () => {
      const plugin = createPlugin();
      plugin.settings.backendSettings.claudeCode.model = 'claude-opus-4-6';
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      // Unknown saved id stays selectable (marked), not replaced by default.
      const modelDropdown = findDropdown(t('settings.claudeCode.model.name'));
      expect(modelDropdown.control.addOption).toHaveBeenCalledWith(
        'claude-opus-4-6',
        t('settings.claudeCode.modelId.unlistedOption', { value: 'claude-opus-4-6' }),
      );

      await modelDropdown.onChange?.('' as never);
      expect(plugin.settings.backendSettings.claudeCode.model).toBe('');
      expect(plugin.saveSettings).toHaveBeenCalled();

      // An official CLI alias is a first-class choice.
      await modelDropdown.onChange?.('sonnet' as never);
      expect(plugin.settings.backendSettings.claudeCode.model).toBe('sonnet');
    });

    it('shows the custom input on the explicit custom choice without saving', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      const modelDropdown = findDropdown(t('settings.claudeCode.model.name'));
      await modelDropdown.onChange?.('__custom__' as never);

      const customInput = containerEl.querySelector<HTMLInputElement>('[data-setting="claude-model-custom"]');
      expect(customInput).toBeTruthy();
      expect(customInput!.style.display).toBe('block');
      // Custom choice only reveals the input; nothing is persisted until the
      // user commits a value from it.
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it('reveals and hides the budget row on native thinking radio changes without remounting the page', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      // Canary: a node rendered before the change must survive it (no remount).
      const canaryBefore = containerEl.querySelector('[data-claude-code-group="models"]');
      const effortRadiosBefore = findChoiceRadios(containerEl, 'claude.effort');
      expect(containerEl.querySelector('[data-setting="claude-thinking-budget-custom"]')).toBeNull();

      await chooseRadio(containerEl, 'claude.thinking', 'fixed');

      // The dropdown's data-setting attr lives on the mocked select (absent in
      // tests); the revealed row's real marker is its custom input.
      expect(containerEl.querySelector('[data-setting="claude-thinking-budget-custom"]')).toBeTruthy();
      expect(containerEl.querySelector('[data-claude-budget-holder="true"]')).toBeTruthy();
      expect(containerEl.querySelector('[data-claude-code-group="models"]')).toBe(canaryBefore);
      expect(findChoiceRadios(containerEl, 'claude.effort')).toEqual(effortRadiosBefore);

      await chooseRadio(containerEl, 'claude.thinking', 'adaptive');

      expect(containerEl.querySelector('[data-setting="claude-thinking-budget-custom"]')).toBeNull();
      expect(containerEl.querySelector('[data-claude-code-group="models"]')).toBe(canaryBefore);
      expect(plugin.settings.backendSettings.claudeCode.thinking).toEqual({ type: 'adaptive' });
    });

    it('keeps thinking and budget holder unchanged when saving the type fails', async () => {
      const plugin = createPlugin();
      plugin.saveSettings.mockRejectedValueOnce(new Error('disk full'));
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      await chooseRadio(containerEl, 'claude.thinking', 'fixed');

      // Settings stay on the committed value AND the radios repaint it.
      expect(plugin.settings.backendSettings.claudeCode.thinking).toEqual({ type: 'adaptive' });
      expect(findChoiceRadios(containerEl, 'claude.thinking').find((input) => input.checked)?.value).toBe('adaptive');
      expect(containerEl.querySelector('[data-setting="claude-thinking-budget"]')).toBeNull();
    });

    it('restores the previous effort and repaints the committed radio on save failure', async () => {
      const plugin = createPlugin();
      plugin.saveSettings.mockRejectedValueOnce(new Error('disk full'));
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      await chooseRadio(containerEl, 'claude.effort', 'high');

      expect(plugin.settings.backendSettings.claudeCode.effort).toBe('medium');
      expect(findChoiceRadios(containerEl, 'claude.effort').find((input) => input.checked)?.value).toBe('medium');
    });

    it('restores jsRuntime on save failure', async () => {
      const plugin = createPlugin();
      plugin.saveSettings.mockRejectedValueOnce(new Error('disk full'));
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'connection');

      await chooseRadio(containerEl, 'claude.jsRuntime', 'bun');

      expect(plugin.settings.backendSettings.claudeCode.jsRuntime).toBe('');
      expect(findChoiceRadios(containerEl, 'claude.jsRuntime').find((input) => input.checked)?.value).toBe('');
    });

    it('restores askUserQuestionPreviewFormat on save failure', async () => {
      const plugin = createPlugin();
      plugin.saveSettings.mockRejectedValueOnce(new Error('disk full'));
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      await chooseRadio(containerEl, 'claude.askUserQuestionPreviewFormat', 'markdown');

      expect(plugin.settings.backendSettings.claudeCode.askUserQuestionPreviewFormat).toBe('');
      expect(findChoiceRadios(containerEl, 'claude.askUserQuestionPreviewFormat').find((input) => input.checked)?.value).toBe('');
    });

    it('permission mode: failed persistence rolls back and never calls the adapter', async () => {
      const claudeAdapter = { setPermissionMode: jest.fn().mockResolvedValue(undefined) };
      const plugin = createPlugin({ claudeAdapter });
      plugin.saveSettings.mockRejectedValueOnce(new Error('disk full'));
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions-safety');

      await chooseRadio(containerEl, 'claude.permissionMode', 'plan');

      expect(plugin.settings.backendSettings.claudeCode.permissionMode).toBe('default');
      expect(claudeAdapter.setPermissionMode).not.toHaveBeenCalled();
      expect(findChoiceRadios(containerEl, 'claude.permissionMode').find((input) => input.checked)?.value).toBe('default');
    });

    it('permission mode: failed runtime apply after a successful save keeps the persisted value', async () => {
      const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
      const claudeAdapter = { setPermissionMode: jest.fn().mockRejectedValue(new Error('sdk busy')) };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions-safety');

      await chooseRadio(containerEl, 'claude.permissionMode', 'plan');

      // Persisted value stays; the shared control must NOT repaint the old one.
      expect(plugin.settings.backendSettings.claudeCode.permissionMode).toBe('plan');
      expect(findChoiceRadios(containerEl, 'claude.permissionMode').find((input) => input.checked)?.value).toBe('plan');
      expect(claudeAdapter.setPermissionMode).toHaveBeenCalledWith('plan');
      expect(plugin.saveSettings).toHaveBeenCalled();
      expect(noticeSpy).toHaveBeenCalled();
      noticeSpy.mockRestore();
    });

    it('gives every Claude Code custom-tooltip trigger one accessible non-native label source', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      const triggers = Array.from(containerEl.querySelectorAll<HTMLElement>('[data-settings-tooltip]'));
      expect(triggers.length).toBeGreaterThan(0);

      for (const trigger of triggers) {
        expect(trigger.hasAttribute('title')).toBe(false);
        expect(trigger.hasAttribute('aria-label')).toBe(false);
        const labelId = trigger.getAttribute('aria-labelledby');
        expect(labelId).toBeTruthy();
        expect(containerEl.querySelector<HTMLElement>(`#${labelId}`)?.textContent)
          .toBe(trigger.dataset.settingsTooltip);
      }
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

      const budgetDropdown = findDropdown(t('settings.claudeCode.thinkingBudget.name'));
      // Saved 8192 is a preset: selected directly, never rewritten on render.
      expect(budgetDropdown.control.setValue).toHaveBeenCalledWith('8192');
      const optionValues = budgetDropdown.control.addOption.mock.calls.map(([value]) => value);
      expect(optionValues).toEqual(['1024', '4096', '8192', '16384', '__custom__']);

      await chooseRadio(containerEl, 'claude.thinking', 'fixed');
      expect(plugin.settings.backendSettings.claudeCode.thinking).toEqual({ type: 'fixed', budgetTokens: 8192 });
    });

    it('keeps an out-of-preset thinking budget as the selected custom value', () => {
      const plugin = createPlugin();
      plugin.settings.backendSettings.claudeCode.thinking = { type: 'fixed', budgetTokens: 30000 };
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      const budgetDropdown = findDropdown(t('settings.claudeCode.thinkingBudget.name'));
      expect(budgetDropdown.control.setValue).toHaveBeenCalledWith('__custom__');
      const customInput = containerEl.querySelector<HTMLInputElement>('[data-setting="claude-thinking-budget-custom"]');
      expect(customInput).toBeTruthy();
      expect(customInput!.style.display).toBe('block');
      expect(customInput!.value).toBe('30000');
    });

    it('rejects malformed thinking budget input instead of partial parsing', async () => {
      const plugin = createPlugin();
      plugin.settings.backendSettings.claudeCode.thinking = { type: 'fixed', budgetTokens: 8192 };
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      const customInput = containerEl.querySelector<HTMLInputElement>('[data-setting="claude-thinking-budget-custom"]');
      expect(customInput).toBeTruthy();
      customInput!.value = '4096abc';
      customInput!.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });

      // "4096abc" must NOT become 4096: whole-string parse or reject.
      expect(plugin.settings.backendSettings.claudeCode.thinking).toEqual({ type: 'fixed', budgetTokens: 8192 });
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it('persists effort changes from Model & Thinking tab', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      await chooseRadio(containerEl, 'claude.effort', 'high');
      expect(plugin.settings.backendSettings.claudeCode.effort).toBe('high');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('renders and persists Claude auto-title only in the Claude workspace', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      expect(findToggle(t('settings.titleGeneration.claudeAutoTitle.name')).control.setValue)
        .toHaveBeenCalledWith(plugin.settings.backendSettings.claudeCode.autoTitle);
      await findToggle(t('settings.titleGeneration.claudeAutoTitle.name')).onChange?.(false as never);
      expect(plugin.settings.backendSettings.claudeCode.autoTitle).toBe(false);
      expect(plugin.saveSettings).toHaveBeenCalled();
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
      await chooseRadio(containerEl, 'claude.thinking', 'fixed');
      expect(plugin.settings.backendSettings.claudeCode.thinking).toEqual({ type: 'fixed', budgetTokens: 4096 });

      // Switch to disabled
      await chooseRadio(containerEl, 'claude.thinking', 'disabled');
      expect(plugin.settings.backendSettings.claudeCode.thinking).toEqual({ type: 'disabled' });
    });

    it('renders permission mode as a high-risk radio choice with honest metadata', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions-safety');

      expect(findChoiceRadios(containerEl, 'claude.permissionMode')).toHaveLength(4);
      const settingEl = containerEl.querySelector<HTMLElement>('[data-backend-key="claude.permissionMode"]');
      expect(settingEl?.dataset.backendScope).toBe('vault');
      expect(settingEl?.dataset.backendEffect).toBe('next-turn');
      expect(settingEl?.dataset.backendRisk).toBe('high');
      expect(settingEl?.getAttribute('data-claude-code-high-risk')).toBe('permission-mode');
    });

    it('persists permission mode changes from Permissions tab', async () => {
      const claudeAdapter = { setPermissionMode: jest.fn().mockResolvedValue(undefined) };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions-safety');

      await chooseRadio(containerEl, 'claude.permissionMode', 'plan');
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
      section.attachTabbed(containerEl, 'permissions-safety');

      await chooseRadio(containerEl, 'claude.permissionMode', 'plan');

      expect(plugin.settings.backendSettings.claudeCode.permissionMode).toBe('plan');
      expect(claudeAdapter.setPermissionMode).toHaveBeenCalledWith('plan');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });
  });

  describe('context-sources tab', () => {
    it('renders semantic groups in the approved order', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'context-sources');

      expectGroupOrder(containerEl, [
        'source-activation',
        'project-source-files',
        'claude-configuration',
        'additional-context',
        'tool-policy',
        'mcp-runtime',
      ]);
      expect(containerEl.querySelectorAll('[data-claude-code-group]')).toHaveLength(6);
    });

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
      const statusEl = containerEl.querySelector('[data-claude-code-project-sources="true"]');
      expect(statusEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(statusEl?.classList.contains('opencodian-claude-code-readback')).toBe(true);
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

    it('reloads active Claude skills after a skill resource mutation', async () => {
      const claudeAdapter = {
        reloadSkills: jest.fn().mockResolvedValue(undefined),
        restartPersistentQueries: jest.fn().mockResolvedValue(undefined),
      };
      const plugin = createPlugin({ claudeAdapter }) as OpenCodianPlugin;
      plugin.invalidateSlashCommandCatalog = jest.fn();
      const section = new SettingsClaudeCodeSection({
        plugin,
        createSectionHeading,
      });
      const refresh = section as unknown as {
        refreshClaudeResourcesAfterMutation(kinds: readonly ('skill' | 'command' | 'agent')[]): Promise<void>;
      };

      await refresh.refreshClaudeResourcesAfterMutation(['skill']);

      expect(claudeAdapter.reloadSkills).toHaveBeenCalledTimes(1);
      expect(claudeAdapter.restartPersistentQueries).not.toHaveBeenCalled();
      expect(plugin.invalidateSlashCommandCatalog).toHaveBeenCalledTimes(1);
    });

    it('restarts persistent Claude queries when the external CLI rejects reloadSkills', async () => {
      const claudeAdapter = {
        reloadSkills: jest.fn().mockRejectedValue(new Error('unsupported control request')),
        restartPersistentQueries: jest.fn().mockResolvedValue(undefined),
      };
      const plugin = createPlugin({ claudeAdapter }) as OpenCodianPlugin;
      const section = new SettingsClaudeCodeSection({
        plugin,
        createSectionHeading,
      });
      const refresh = section as unknown as {
        refreshClaudeResourcesAfterMutation(kinds: readonly ('skill' | 'command' | 'agent')[]): Promise<void>;
      };

      await refresh.refreshClaudeResourcesAfterMutation(['skill']);

      expect(claudeAdapter.restartPersistentQueries).toHaveBeenCalledWith('skill-resource-change');
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
    it('keeps project settings configuration out of Runtime when Context & Sources owns the workbench', () => {
      const plugin = createPlugin();
      const runtimeContainerEl = document.createElement('div');
      const runtimeSection = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      runtimeSection.attachTabbed(runtimeContainerEl, 'runtime');

      expect(runtimeContainerEl.querySelector('[data-claude-code-project-settings="true"]')).toBeNull();
      expect(buttonRecords.some((record) => record.label === t('settings.claudeCode.projectSettings.scanButton'))).toBe(false);
      expect(buttonRecords.some((record) => record.label === t('settings.claudeCode.projectSettings.createLocalButton'))).toBe(false);
      expect(buttonRecords.some((record) => record.label === t('settings.claudeCode.projectSettings.createSharedButton'))).toBe(false);

      const contextContainerEl = document.createElement('div');
      (plugin as unknown as { app: { vault: { adapter: { basePath: string } } } }).app.vault.adapter.basePath = '/tmp/opencodian-test-vault';
      jest.spyOn(SettingsClaudeConfigurationSection.prototype, 'render').mockImplementation((bodyEl) => {
        bodyEl.setAttribute('data-test-configuration-workbench', 'true');
      });
      const contextSection = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      contextSection.attachTabbed(contextContainerEl, 'context-sources');

      expect(contextContainerEl.querySelector('[data-claude-code-group="claude-configuration"]')).toBeTruthy();
      expect(contextContainerEl.querySelector('[data-test-configuration-workbench="true"]')).toBeTruthy();
    });

    it('puts primary connection tasks before one native runtime readback disclosure', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'connection');

      expectGroupOrder(containerEl, [
        'connection-runtime',
        'diagnostics-logs',
        'runtime-ecosystem',
        'project-files',
        'runtime-inspection',
      ]);
      const body = containerEl.querySelector<HTMLElement>('[data-settings-surface="tab-body"]')!;
      expect(Array.from(body.children).map(child => (child as HTMLElement).dataset.claudeCodeGroup)).toEqual([
        'connection-runtime',
        'diagnostics-logs',
        'runtime-ecosystem',
      ]);
      expectClaudeCodeGroupChrome(containerEl);
      expect(containerEl.querySelectorAll('[data-claude-code-group]')).toHaveLength(5);

      const disclosure = containerEl.querySelector<HTMLDetailsElement>('[data-claude-code-group="runtime-ecosystem"]')!;
      expect(disclosure.open).toBe(false);
      expect(disclosure.querySelector(':scope > .opencodian-claude-code-stack > .opencodian-claude-code-group-desc')?.textContent)
        .toBe(t('settings.claudeCode.groups.runtimeEcosystem.desc'));
      for (const id of ['project-files', 'runtime-inspection']) {
        expect(disclosure.querySelector(`:scope > .opencodian-claude-code-stack > [data-claude-code-group="${id}"]`)).toBeTruthy();
      }
      expect(disclosure.querySelector('[data-claude-code-runtime-ecosystem="true"]')).toBeTruthy();
      expect(body.querySelector(':scope > [data-claude-code-group="connection-runtime"] [data-claude-code-runtime-boundary]')).toBeNull();
      expect(body.querySelector(':scope > [data-claude-code-group="diagnostics-logs"] [data-claude-code-runtime-boundary]')).toBeTruthy();
      expect(body.querySelector(':scope > [data-claude-code-group="diagnostics-logs"] [data-backend-key="claude.debug"]')).toBeTruthy();
      expect(body.querySelector(':scope > [data-claude-code-group="diagnostics-logs"] [data-backend-key="claude.debugFile"]')).toBeTruthy();
      disclosure.querySelector('summary')!.click();
      expect(disclosure.open).toBe(true);
      disclosure.querySelector('summary')!.click();
      expect(disclosure.open).toBe(false);
    });

    it('marks lifecycle notices with the Claude Code lifecycle class', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      expect(
        containerEl.querySelector('[data-claude-code-js-runtime-lifecycle="true"].opencodian-claude-code-notice--lifecycle'),
      ).toBeTruthy();
      expect(
        containerEl.querySelector('[data-claude-code-load-timeout-ms-lifecycle="true"].opencodian-claude-code-notice--lifecycle'),
      ).toBeTruthy();
    });

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

    it('renders runtime ecosystem lists as a read-only runtime summary', () => {
      const claudeAdapter = {
        getPluginCount: jest.fn().mockReturnValue(2),
        getPluginsList: jest.fn().mockReturnValue(['plugin-alpha', 'plugin-beta']),
        getSkillCount: jest.fn().mockReturnValue(2),
        getSkillsList: jest.fn().mockReturnValue(['skill-alpha', 'skill-beta']),
        getAgentDefinitionCount: jest.fn().mockReturnValue(2),
        getAgentDefinitionsList: jest.fn().mockReturnValue(['proof-agent', 'audit-agent']),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });

      section.attachTabbed(containerEl, 'runtime');

      const summaryEl = containerEl.querySelector('[data-claude-code-runtime-ecosystem="true"]');
      expect(summaryEl).toBeTruthy();
      expect(summaryEl?.getAttribute('data-runtime-only')).toBe('true');
      expect(summaryEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(containerEl.textContent).toContain(t('settings.claudeCode.runtimeEcosystem.name'));
      expect(containerEl.textContent).toContain(t('settings.claudeCode.runtimeEcosystem.desc'));
      expect(containerEl.textContent).toContain(t('settings.claudeCode.runtimeEcosystem.plugins.loaded', {
        count: 2,
        names: 'plugin-alpha, plugin-beta',
      }));
      expect(containerEl.textContent).toContain(t('settings.claudeCode.runtimeEcosystem.skills.loaded', {
        count: 2,
        names: 'skill-alpha, skill-beta',
      }));
      expect(containerEl.textContent).toContain(t('settings.claudeCode.runtimeEcosystem.agentDefinitions.loaded', {
        count: 2,
        names: 'proof-agent, audit-agent',
      }));
      expect(buttonRecords.some((record) => record.name === t('settings.claudeCode.runtimeEcosystem.name')))
        .toBe(false);
    });

    it('renders runtime ecosystem all-skills sentinel without authoring controls', () => {
      const claudeAdapter = {
        getPluginCount: jest.fn().mockReturnValue(0),
        getPluginsList: jest.fn().mockReturnValue([]),
        getSkillCount: jest.fn().mockReturnValue(-1),
        getSkillsList: jest.fn().mockReturnValue('all'),
        getAgentDefinitionCount: jest.fn().mockReturnValue(0),
        getAgentDefinitionsList: jest.fn().mockReturnValue([]),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });

      section.attachTabbed(containerEl, 'runtime');

      expect(containerEl.textContent).toContain(t('settings.claudeCode.runtimeEcosystem.plugins.empty'));
      expect(containerEl.textContent).toContain(t('settings.claudeCode.runtimeEcosystem.skills.all'));
      expect(containerEl.textContent).toContain(t('settings.claudeCode.runtimeEcosystem.agentDefinitions.empty'));
      const renderedControlNames = [
        ...textRecords,
        ...textAreaRecords,
        ...dropdownRecords,
        ...toggleRecords,
        ...buttonRecords,
      ].map((record) => record.name).join('\n').toLowerCase();
      expect(renderedControlNames).not.toContain('skill authoring');
      expect(renderedControlNames).not.toContain('agent definition authoring');
      expect(renderedControlNames).not.toContain('plugin authoring');
    });

    it('renders runtime ecosystem empty states when the adapter has no runtime items', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });

      section.attachTabbed(containerEl, 'runtime');

      const rows = Array.from(containerEl.querySelectorAll('[data-runtime-ecosystem-kind]'));
      expect(rows.map((row) => row.getAttribute('data-runtime-ecosystem-state'))).toEqual([
        'empty',
        'empty',
        'empty',
      ]);
      expect(containerEl.textContent).toContain(t('settings.claudeCode.runtimeEcosystem.plugins.empty'));
      expect(containerEl.textContent).toContain(t('settings.claudeCode.runtimeEcosystem.skills.empty'));
      expect(containerEl.textContent).toContain(t('settings.claudeCode.runtimeEcosystem.agentDefinitions.empty'));
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

    it('reports an invalid restart without rejecting the settings click', async () => {
      const claudeAdapter = { restartPersistentQueries: jest.fn().mockRejectedValue(new Error('invalid CLI selection')) };
      const plugin = createPlugin({ claudeAdapter });
      const section = new SettingsClaudeCodeSection({ plugin: plugin as OpenCodianPlugin, createSectionHeading });
      section.attachTabbed(document.createElement('div'), 'runtime');
      await expect(findButton(t('settings.claudeCode.runtimeBoundary.restartButton')).onClick?.()).resolves.toBeUndefined();
      expect(claudeAdapter.restartPersistentQueries).toHaveBeenCalledWith('settings-change');
    });

    it('renders sanitized context usage readback on demand without saving settings', async () => {
      const claudeAdapter = {
        getContextUsage: jest.fn().mockResolvedValue({
          contextWindow: 200000,
          usedCount: 42000,
          tokenEstimate: 42000,
          apiKey: 'sk-live-secret',
          nested: {
            authorization: 'Bearer private-token',
            accessToken: 'access-token-secret',
            source: 'runtime',
          },
        }),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findButton(t('settings.claudeCode.contextUsage.inspectButton')).onClick?.();

      expect(claudeAdapter.getContextUsage).toHaveBeenCalledTimes(1);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const readbackEl = containerEl.querySelector('[data-claude-code-context-usage-readback="true"]');
      expect(readbackEl).toBeTruthy();
      expect(readbackEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(readbackEl?.textContent).toContain('"contextWindow": 200000');
      expect(readbackEl?.textContent).toContain('"usedCount": 42000');
      expect(readbackEl?.textContent).toContain('"tokenEstimate": 42000');
      expect(readbackEl?.textContent).toContain('"source": "runtime"');
      expect(readbackEl?.textContent).toContain('"apiKey": "[redacted]"');
      expect(readbackEl?.textContent).toContain('"authorization": "[redacted]"');
      expect(readbackEl?.textContent).toContain('"accessToken": "[redacted]"');
      expect(readbackEl?.textContent).not.toContain('sk-live-secret');
      expect(readbackEl?.textContent).not.toContain('private-token');
      expect(readbackEl?.textContent).not.toContain('access-token-secret');
    });

    it('shows context usage readback unavailable when the adapter method is missing', async () => {
      const plugin = createPlugin({ claudeAdapter: {} });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findButton(t('settings.claudeCode.contextUsage.inspectButton')).onClick?.();

      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const readbackEl = containerEl.querySelector('[data-claude-code-context-usage-readback="true"]');
      expect(readbackEl).toBeTruthy();
      expect(readbackEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(readbackEl?.textContent).toContain(t('settings.claudeCode.contextUsage.unavailable'));
    });

    it('shows context usage readback failure when the adapter rejects', async () => {
      const claudeAdapter = {
        getContextUsage: jest.fn().mockRejectedValue(new Error('boom')),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findButton(t('settings.claudeCode.contextUsage.inspectButton')).onClick?.();

      expect(claudeAdapter.getContextUsage).toHaveBeenCalledTimes(1);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const readbackEl = containerEl.querySelector('[data-claude-code-context-usage-readback="true"]');
      expect(readbackEl).toBeTruthy();
      expect(readbackEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(readbackEl?.textContent).toContain(t('settings.claudeCode.contextUsage.failed'));
    });

    it('renders sanitized account info readback on demand without saving settings', async () => {
      const claudeAdapter = {
        getAccountInfo: jest.fn().mockResolvedValue({
          email: 'user@example.com',
          organization: 'Example Org',
          subscriptionType: 'max',
          apiProvider: 'firstParty',
          apiKeySource: 'ANTHROPIC_API_KEY',
          tokenSource: 'oauth-token-cache',
        }),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findButton(t('settings.claudeCode.accountInfo.inspectButton')).onClick?.();

      expect(claudeAdapter.getAccountInfo).toHaveBeenCalledTimes(1);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const readbackEl = containerEl.querySelector('[data-claude-code-account-info-readback="true"]');
      expect(readbackEl).toBeTruthy();
      expect(readbackEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(readbackEl?.textContent).toContain('"email": "u***@example.com"');
      expect(readbackEl?.textContent).toContain('"organization": "Example Org"');
      expect(readbackEl?.textContent).toContain('"subscriptionType": "max"');
      expect(readbackEl?.textContent).toContain('"apiProvider": "firstParty"');
      expect(readbackEl?.textContent).toContain('"apiKeySource": "[redacted]"');
      expect(readbackEl?.textContent).toContain('"tokenSource": "[redacted]"');
      expect(readbackEl?.textContent).not.toContain('user@example.com');
      expect(readbackEl?.textContent).not.toContain('ANTHROPIC_API_KEY');
      expect(readbackEl?.textContent).not.toContain('oauth-token-cache');
    });

    it('shows account info readback unavailable when the adapter method is missing', async () => {
      const plugin = createPlugin({ claudeAdapter: {} });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findButton(t('settings.claudeCode.accountInfo.inspectButton')).onClick?.();

      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const readbackEl = containerEl.querySelector('[data-claude-code-account-info-readback="true"]');
      expect(readbackEl).toBeTruthy();
      expect(readbackEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(readbackEl?.textContent).toContain(t('settings.claudeCode.accountInfo.unavailable'));
    });

    it('shows account info readback failure when the adapter rejects', async () => {
      const claudeAdapter = {
        getAccountInfo: jest.fn().mockRejectedValue(new Error('boom')),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findButton(t('settings.claudeCode.accountInfo.inspectButton')).onClick?.();

      expect(claudeAdapter.getAccountInfo).toHaveBeenCalledTimes(1);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const readbackEl = containerEl.querySelector('[data-claude-code-account-info-readback="true"]');
      expect(readbackEl).toBeTruthy();
      expect(readbackEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(readbackEl?.textContent).toContain(t('settings.claudeCode.accountInfo.failed'));
    });

    it('renders runtime command and agent catalog readback on demand without saving settings', async () => {
      const claudeAdapter = {
        getRuntimeCatalog: jest.fn().mockResolvedValue({
          commands: [{
            name: 'review',
            description: 'Review selected files',
            argumentHint: '<path>',
            aliases: ['audit', 'inspect'],
          }],
          agents: [{
            name: 'explore',
            description: 'Explore the codebase',
            model: 'sonnet',
          }],
        }),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findButton(t('settings.claudeCode.runtimeCatalog.inspectButton')).onClick?.();

      expect(claudeAdapter.getRuntimeCatalog).toHaveBeenCalledTimes(1);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const catalogEl = containerEl.querySelector('[data-claude-code-runtime-catalog="true"]');
      expect(catalogEl).toBeTruthy();
      expect(catalogEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(catalogEl?.textContent).toContain(t('settings.claudeCode.runtimeCatalog.summary', {
        commands: 1,
        agents: 1,
      }));
      expect(catalogEl?.textContent).toContain('/review');
      expect(catalogEl?.textContent).toContain('Review selected files');
      expect(catalogEl?.textContent).toContain(t('settings.claudeCode.runtimeCatalog.argumentHint', {
        hint: '<path>',
      }));
      expect(catalogEl?.textContent).toContain(t('settings.claudeCode.runtimeCatalog.aliases', {
        aliases: 'audit, inspect',
      }));
      expect(catalogEl?.textContent).toContain('explore');
      expect(catalogEl?.textContent).toContain('Explore the codebase');
      expect(catalogEl?.textContent).toContain(t('settings.claudeCode.runtimeCatalog.model', {
        model: 'sonnet',
      }));

      const renderedControlNames = [
        ...textRecords,
        ...textAreaRecords,
        ...dropdownRecords,
        ...toggleRecords,
        ...buttonRecords,
      ].map((record) => record.name).join('\n').toLowerCase();
      expect(renderedControlNames).not.toContain('execute command');
      expect(renderedControlNames).not.toContain('agent authoring');
      expect(renderedControlNames).not.toContain('create agent');
    });

    it('shows runtime catalog empty states when no commands or agents are returned', async () => {
      const claudeAdapter = {
        getRuntimeCatalog: jest.fn().mockResolvedValue({
          commands: [],
          agents: [],
        }),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findButton(t('settings.claudeCode.runtimeCatalog.inspectButton')).onClick?.();

      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const catalogEl = containerEl.querySelector('[data-claude-code-runtime-catalog="true"]');
      expect(catalogEl).toBeTruthy();
      expect(catalogEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(catalogEl?.textContent).toContain(t('settings.claudeCode.runtimeCatalog.emptyCommands'));
      expect(catalogEl?.textContent).toContain(t('settings.claudeCode.runtimeCatalog.emptyAgents'));
    });

    it('shows runtime catalog unavailable when the adapter method is missing', async () => {
      const plugin = createPlugin({ claudeAdapter: {} });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findButton(t('settings.claudeCode.runtimeCatalog.inspectButton')).onClick?.();

      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const catalogEl = containerEl.querySelector('[data-claude-code-runtime-catalog="true"]');
      expect(catalogEl).toBeTruthy();
      expect(catalogEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(catalogEl?.textContent).toContain(t('settings.claudeCode.runtimeCatalog.unavailable'));
    });

    it('shows runtime catalog readback failure when the adapter rejects', async () => {
      const claudeAdapter = {
        getRuntimeCatalog: jest.fn().mockRejectedValue(new Error('boom')),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findButton(t('settings.claudeCode.runtimeCatalog.inspectButton')).onClick?.();

      expect(claudeAdapter.getRuntimeCatalog).toHaveBeenCalledTimes(1);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const catalogEl = containerEl.querySelector('[data-claude-code-runtime-catalog="true"]');
      expect(catalogEl).toBeTruthy();
      expect(catalogEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(catalogEl?.textContent).toContain(t('settings.claudeCode.runtimeCatalog.failed'));
    });

    it('renders runtime file readback on demand without saving settings', async () => {
      const claudeAdapter = {
        readRuntimeFile: jest.fn().mockResolvedValue({
          contents: '# Runtime note\nHello from Claude.',
          absPath: '/vault/notes/runtime.md',
          truncated: false,
        }),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findText(t('settings.claudeCode.fileReadback.pathName')).onChange?.(' notes/runtime.md ' as never);
      await findButton(t('settings.claudeCode.fileReadback.inspectButton')).onClick?.();

      expect(claudeAdapter.readRuntimeFile).toHaveBeenCalledWith('notes/runtime.md', {
        maxBytes: 4096,
        encoding: 'utf-8',
      });
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const readbackEl = containerEl.querySelector('[data-claude-code-file-readback="true"]');
      expect(readbackEl).toBeTruthy();
      expect(readbackEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(readbackEl?.textContent).toContain('/vault/notes/runtime.md');
      expect(readbackEl?.textContent).toContain('# Runtime note');
      expect(readbackEl?.textContent).not.toContain(t('settings.claudeCode.fileReadback.truncated'));
    });

    it('renders runtime file readback truncated notice when the adapter truncates contents', async () => {
      const claudeAdapter = {
        readRuntimeFile: jest.fn().mockResolvedValue({
          contents: 'partial file contents',
          absPath: '/vault/notes/large.md',
          truncated: true,
        }),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findText(t('settings.claudeCode.fileReadback.pathName')).onChange?.('notes/large.md' as never);
      await findButton(t('settings.claudeCode.fileReadback.inspectButton')).onClick?.();

      const readbackEl = containerEl.querySelector('[data-claude-code-file-readback="true"]');
      expect(readbackEl).toBeTruthy();
      expect(readbackEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(readbackEl?.textContent).toContain('/vault/notes/large.md');
      expect(readbackEl?.textContent).toContain('partial file contents');
      expect(readbackEl?.textContent).toContain(t('settings.claudeCode.fileReadback.truncated'));
    });

    it('shows runtime file readback empty path without calling adapter', async () => {
      const claudeAdapter = {
        readRuntimeFile: jest.fn(),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findButton(t('settings.claudeCode.fileReadback.inspectButton')).onClick?.();

      expect(claudeAdapter.readRuntimeFile).not.toHaveBeenCalled();
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const readbackEl = containerEl.querySelector('[data-claude-code-file-readback="true"]');
      expect(readbackEl).toBeTruthy();
      expect(readbackEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(readbackEl?.textContent).toContain(t('settings.claudeCode.fileReadback.emptyPath'));
    });

    it('shows runtime file readback unavailable when the adapter method is missing', async () => {
      const plugin = createPlugin({ claudeAdapter: {} });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findText(t('settings.claudeCode.fileReadback.pathName')).onChange?.('notes/runtime.md' as never);
      await findButton(t('settings.claudeCode.fileReadback.inspectButton')).onClick?.();

      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const readbackEl = containerEl.querySelector('[data-claude-code-file-readback="true"]');
      expect(readbackEl).toBeTruthy();
      expect(readbackEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(readbackEl?.textContent).toContain(t('settings.claudeCode.fileReadback.unavailable'));
    });

    it('shows runtime file readback not found when the adapter returns null', async () => {
      const claudeAdapter = {
        readRuntimeFile: jest.fn().mockResolvedValue(null),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findText(t('settings.claudeCode.fileReadback.pathName')).onChange?.('notes/missing.md' as never);
      await findButton(t('settings.claudeCode.fileReadback.inspectButton')).onClick?.();

      expect(claudeAdapter.readRuntimeFile).toHaveBeenCalledWith('notes/missing.md', {
        maxBytes: 4096,
        encoding: 'utf-8',
      });
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const readbackEl = containerEl.querySelector('[data-claude-code-file-readback="true"]');
      expect(readbackEl).toBeTruthy();
      expect(readbackEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(readbackEl?.textContent).toContain(t('settings.claudeCode.fileReadback.notFound'));
    });

    it('shows runtime file readback failure when the adapter rejects', async () => {
      const claudeAdapter = {
        readRuntimeFile: jest.fn().mockRejectedValue(new Error('boom')),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      await findText(t('settings.claudeCode.fileReadback.pathName')).onChange?.('notes/runtime.md' as never);
      await findButton(t('settings.claudeCode.fileReadback.inspectButton')).onClick?.();

      expect(claudeAdapter.readRuntimeFile).toHaveBeenCalledTimes(1);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const readbackEl = containerEl.querySelector('[data-claude-code-file-readback="true"]');
      expect(readbackEl).toBeTruthy();
      expect(readbackEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(readbackEl?.textContent).toContain(t('settings.claudeCode.fileReadback.failed'));
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
    it('renders semantic groups in the approved order', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'tools');

      expectGroupOrder(containerEl, [
        'source-activation',
        'project-source-files',
        'claude-configuration',
        'additional-context',
        'tool-policy',
        'mcp-runtime',
      ]);
      expectClaudeCodeGroupChrome(containerEl);
      expect(containerEl.querySelectorAll('[data-claude-code-group]')).toHaveLength(6);
    });

    it('groups MCP runtime controls with the tool policy on the tools-context page', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'tools');

      expect(containerEl.querySelector('[data-claude-code-mcp-runtime="true"]')).toBeTruthy();
      expect(toggleRecords.some((record) => record.name === t('settings.claudeCode.strictMcpConfig.name'))).toBe(true);
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
      const toolsText = t('settings.claudeCode.proofStatus.tools');
      expect(containerEl.textContent).toContain(toolsText);
      // Honesty boundary: locale must NOT use the old "can only detect enforcement failure"
      // framing. The current truth is that allowedTools is a pre-allow/auto-approve shortcut
      // with zero enforcement — it is not a restrictor. Use Restricted Built-in Tools for
      // deterministic built-in filtering.
      expect(toolsText).not.toContain('can only detect enforcement failure');
      expect(toolsText).not.toContain('只能检测 enforcement 失败');
    });

    it('renders allowed tools boundary notice clarifying readback-only and redirecting users to Restricted Built-in Tools', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'tools');

      const boundaryEl = containerEl.querySelector('[data-claude-code-allowed-tools-boundary="true"]');
      expect(boundaryEl).toBeTruthy();
      expect(boundaryEl!.textContent).toContain(t('settings.claudeCode.allowedTools.boundaryNotice'));
      expect(boundaryEl!.textContent).toContain('Readback only');
      expect(boundaryEl!.textContent).toContain('Restricted Built-in Tools');
      expect(boundaryEl!.textContent).toContain('NOT a tool availability restrictor');
    });

    it('renders restricted-builtin-tools proof status notice with pass state in tools tab', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'tools');

      const noticeEl = containerEl.querySelector('[data-claude-code-proof-status="restricted-builtin-tools"]');
      expect(noticeEl).toBeTruthy();
      expect(noticeEl?.getAttribute('data-proof-state')).toBe('pass');
      expect(containerEl.textContent).toContain(t('settings.claudeCode.proofStatus.restrictedBuiltinTools'));
    });

    it('renders file-checkpoint boundary notice with readback state in runtime tab', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      // Boundary notice exists with readback proof state
      const noticeEl = containerEl.querySelector('[data-claude-code-proof-status="file-checkpointing"]');
      expect(noticeEl).toBeTruthy();
      expect(noticeEl?.getAttribute('data-proof-state')).toBe('readback');
      const noticeText = t('settings.claudeCode.proofStatus.fileCheckpointing');
      expect(containerEl.textContent).toContain(noticeText);
      // Honesty: notice must mention experimental / diagnostic-only, not stable rewind
      expect(noticeText).toContain('experimental');
      // Must NOT contain optimistic "verified rewind" language
      expect(noticeText).not.toContain('verified rewind');
      expect(noticeText).not.toContain('已验证的 rewind');
    });

    it('does not render file-checkpoint rewind/restore button in stable settings', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      // No rewind/restore action buttons in stable settings
      const rewindButtons = Array.from(containerEl.querySelectorAll('button')).filter(
        (btn) => btn.textContent?.toLowerCase().includes('rewind') || btn.textContent?.toLowerCase().includes('restore'),
      );
      expect(rewindButtons).toHaveLength(0);
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

    it('renders and persists tool aliases', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'tools');

      expect(findTextArea(t('settings.claudeCode.toolAliases.name'))).toBeDefined();

      await findTextArea(t('settings.claudeCode.toolAliases.name')).onChange?.(
        'Fetch=Read\nSearch=Grep\nFetch=Write' as never,
      );
      expect(plugin.settings.backendSettings.claudeCode.toolAliases).toEqual({ Fetch: 'Write', Search: 'Grep' });
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('ignores malformed tool alias lines', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'tools');

      await findTextArea(t('settings.claudeCode.toolAliases.name')).onChange?.(
        'Fetch=Read\nnoequals\n=Value\nKey=\n\nValid=Tool' as never,
      );
      expect(plugin.settings.backendSettings.claudeCode.toolAliases).toEqual({ Fetch: 'Read', Valid: 'Tool' });
    });

    it('renders tool aliases boundary and lifecycle notices', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'tools');

      const boundaryEl = containerEl.querySelector('[data-claude-code-tool-aliases-boundary="true"]');
      expect(boundaryEl).toBeTruthy();
      expect(boundaryEl!.textContent).toContain(t('settings.claudeCode.toolAliases.boundaryNotice'));

      const lifecycleEl = containerEl.querySelector('[data-claude-code-tool-aliases-lifecycle="true"]');
      expect(lifecycleEl).toBeTruthy();
      expect(lifecycleEl!.textContent).toContain(t('settings.claudeCode.toolAliases.lifecycleNotice'));
    });

    it('renders AskUserQuestion preview format choices and persists changes', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      expect(findChoiceRadios(containerEl, 'claude.askUserQuestionPreviewFormat')).toHaveLength(3);

      await chooseRadio(containerEl, 'claude.askUserQuestionPreviewFormat', 'markdown');
      expect(plugin.settings.backendSettings.claudeCode.askUserQuestionPreviewFormat).toBe('markdown');
      expect(plugin.saveSettings).toHaveBeenCalled();

      await chooseRadio(containerEl, 'claude.askUserQuestionPreviewFormat', 'html');
      expect(plugin.settings.backendSettings.claudeCode.askUserQuestionPreviewFormat).toBe('html');
    });

    it('renders AskUserQuestion preview format boundary and lifecycle notices', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'model-thinking');

      const boundaryEl = containerEl.querySelector('[data-claude-code-ask-user-question-preview-format-boundary="true"]');
      expect(boundaryEl).toBeTruthy();
      expect(boundaryEl!.textContent).toContain(t('settings.claudeCode.askUserQuestionPreviewFormat.boundaryNotice'));

      const lifecycleEl = containerEl.querySelector('[data-claude-code-ask-user-question-preview-format-lifecycle="true"]');
      expect(lifecycleEl).toBeTruthy();
      expect(lifecycleEl!.textContent).toContain(t('settings.claudeCode.askUserQuestionPreviewFormat.lifecycleNotice'));
    });

    it('renders strictMcpConfig boundary and lifecycle notices in the MCP tab', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'mcp');

      const boundaryEl = containerEl.querySelector('[data-claude-code-strict-mcp-config-boundary="true"]');
      expect(boundaryEl).toBeTruthy();
      expect(boundaryEl!.textContent).toContain(t('settings.claudeCode.strictMcpConfig.boundaryNotice'));

      const lifecycleEl = containerEl.querySelector('[data-claude-code-strict-mcp-config-lifecycle="true"]');
      expect(lifecycleEl).toBeTruthy();
      expect(lifecycleEl!.textContent).toContain(t('settings.claudeCode.strictMcpConfig.lifecycleNotice'));
    });

    it('persists strictMcpConfig changes in the MCP tab', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'mcp');

      const toggle = findToggle(t('settings.claudeCode.strictMcpConfig.name'));
      expect(toggle).toBeDefined();
      expect(toggle.control.setValue).toHaveBeenCalledWith(false);

      await toggle.onChange?.(true as never);

      expect(plugin.settings.backendSettings.claudeCode.strictMcpConfig).toBe(true);
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('shows MCP runtime status and refreshes the active Claude adapter config in the MCP tab', async () => {
      const claudeAdapter = {
        getMcpServerCount: jest.fn()
          .mockReturnValueOnce(2)
          .mockReturnValueOnce(3),
        getMcpServerNames: jest.fn()
          .mockReturnValueOnce(['alpha-mcp', 'beta-mcp'])
          .mockReturnValueOnce(['alpha-mcp', 'beta-mcp', 'gamma-mcp']),
        reloadMcpServers: jest.fn().mockResolvedValue(undefined),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'mcp');

      const statusEl = containerEl.querySelector('[data-claude-code-mcp-runtime="true"]');
      expect(statusEl).toBeTruthy();
      expect(statusEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(containerEl.querySelector('[data-claude-code-mcp-runtime-status="true"]')).toBeNull();
      expect(buttonRecords.some((record) => record.label === t('settings.claudeCode.mcpRuntime.inspectButton'))).toBe(true);
      // Authoring UI (text, textarea, dropdown) must not contain MCP config editors;
      // toggle-based readback surfaces (e.g. strictMcpConfig) are allowed.
      expect([
        ...textRecords,
        ...textAreaRecords,
        ...dropdownRecords,
      ].filter(record => record.name !== t('settings.claudeCode.sessionControls.server')).some((record) => record.name.toLowerCase().includes('mcp'))).toBe(false);
      expect(containerEl.textContent).toContain(
        t('settings.claudeCode.mcpRuntime.loadedWithNames', {
          count: 2,
          names: 'alpha-mcp, beta-mcp',
        }),
      );

      await findButton(t('settings.claudeCode.mcpRuntime.refreshButton')).onClick?.();

      expect(claudeAdapter.reloadMcpServers).toHaveBeenCalledTimes(1);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      expect(containerEl.textContent).toContain(
        t('settings.claudeCode.mcpRuntime.loadedWithNames', {
          count: 3,
          names: 'alpha-mcp, beta-mcp, gamma-mcp',
        }),
      );
    });

    it('renders SDK MCP runtime status readback on demand without authoring config in the MCP tab', async () => {
      const claudeAdapter = {
        getMcpServerCount: jest.fn().mockReturnValue(2),
        getMcpServerNames: jest.fn().mockReturnValue(['alpha-mcp', 'beta-mcp']),
        getMcpServerRuntimeStatuses: jest.fn().mockResolvedValue([
          {
            name: 'alpha-mcp',
            status: 'connected',
            scope: 'project',
            toolCount: 2,
            toolNames: ['alpha_read', 'alpha_write'],
            hasError: false,
          },
          {
            name: 'beta-mcp',
            status: 'failed',
            toolCount: 0,
            toolNames: [],
            hasError: true,
            errorSummary: 'McpServerError(category=auth, messageLength=42)',
          },
        ]),
        reloadMcpServers: jest.fn().mockResolvedValue(undefined),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'mcp');

      await findButton(t('settings.claudeCode.mcpRuntime.inspectButton')).onClick?.();

      expect(claudeAdapter.getMcpServerRuntimeStatuses).toHaveBeenCalledTimes(1);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
      const statusReadbackEl = containerEl.querySelector('[data-claude-code-mcp-runtime-status="true"]');
      expect(statusReadbackEl).toBeTruthy();
      expect(statusReadbackEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(containerEl.textContent).toContain(t('settings.claudeCode.mcpRuntime.statusSummary', {
        count: 2,
        connected: 1,
        failed: 1,
      }));
      expect(containerEl.textContent).toContain('alpha-mcp: connected');
      expect(containerEl.textContent).toContain(t('settings.claudeCode.mcpRuntime.statusTools', {
        names: 'alpha_read, alpha_write',
      }));
      expect(containerEl.textContent).toContain('beta-mcp: failed');
      expect(containerEl.textContent).toContain('McpServerError(category=auth, messageLength=42)');
      // Authoring UI must not contain MCP config editors; toggle readback surfaces are allowed.
      expect([
        ...textRecords,
        ...textAreaRecords,
        ...dropdownRecords,
      ].filter(record => record.name !== t('settings.claudeCode.sessionControls.server')).some((record) => record.name.toLowerCase().includes('mcp'))).toBe(false);
    });

    it.each([
      {
        label: 'null',
        statuses: null,
        statusKey: 'settings.claudeCode.mcpRuntime.statusUnavailable' as const,
      },
      {
        label: 'an authoritative empty array',
        statuses: [],
        statusKey: 'settings.claudeCode.mcpRuntime.statusEmpty' as const,
      },
    ])('renders SDK MCP runtime status $label readback distinctly', async ({ statuses, statusKey }) => {
      const claudeAdapter = {
        getMcpServerCount: jest.fn().mockReturnValue(1),
        getMcpServerNames: jest.fn().mockReturnValue(['alpha-mcp']),
        getMcpServerRuntimeStatuses: jest.fn().mockResolvedValue(statuses),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'mcp');

      const inspection = findButton(t('settings.claudeCode.mcpRuntime.inspectButton')).onClick?.();
      const statusReadbackEl = containerEl.querySelector('[data-claude-code-mcp-runtime-status="true"]');
      expect(statusReadbackEl?.textContent).toBe(t('settings.claudeCode.mcpRuntime.statusLoading'));
      await inspection;

      expect(claudeAdapter.getMcpServerRuntimeStatuses).toHaveBeenCalledTimes(1);
      expect(statusReadbackEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(statusReadbackEl?.textContent).toBe(t(statusKey));
      expect(statusReadbackEl?.querySelector('.opencodian-claude-code-mcp-runtime-status-row')).toBeNull();
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it('renders SDK MCP runtime status failure when the adapter throws', async () => {
      const claudeAdapter = {
        getMcpServerCount: jest.fn().mockReturnValue(1),
        getMcpServerNames: jest.fn().mockReturnValue(['alpha-mcp']),
        getMcpServerRuntimeStatuses: jest.fn().mockRejectedValue(new Error('runtime status failed')),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'mcp');

      await findButton(t('settings.claudeCode.mcpRuntime.inspectButton')).onClick?.();

      const statusReadbackEl = containerEl.querySelector('[data-claude-code-mcp-runtime-status="true"]');
      expect(claudeAdapter.getMcpServerRuntimeStatuses).toHaveBeenCalledTimes(1);
      expect(statusReadbackEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(statusReadbackEl?.textContent).toBe(t('settings.claudeCode.mcpRuntime.statusFailed'));
      expect(statusReadbackEl?.querySelector('.opencodian-claude-code-mcp-runtime-status-row')).toBeNull();
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it('renders the MCP runtime empty state as read-only discovery in the MCP tab', () => {
      const claudeAdapter = {
        getMcpServerCount: jest.fn().mockReturnValue(0),
        getMcpServerNames: jest.fn().mockReturnValue([]),
        reloadMcpServers: jest.fn().mockResolvedValue(undefined),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'mcp');

      const statusEl = containerEl.querySelector('[data-claude-code-mcp-runtime="true"]');
      expect(statusEl).toBeTruthy();
      expect(statusEl?.getAttribute('data-proof-state')).toBe('readback');
      expect(containerEl.textContent).toContain(t('settings.claudeCode.mcpRuntime.empty'));
      expect(containerEl.textContent).not.toContain(t('settings.claudeCode.mcpRuntime.loaded', { count: 0 }));
      expect(buttonRecords.some((record) => record.label === t('settings.claudeCode.mcpRuntime.inspectButton'))).toBe(true);
    });

    it('keeps the MCP runtime refresh failure visible in the MCP tab', async () => {
      const claudeAdapter = {
        getMcpServerCount: jest.fn().mockReturnValue(2),
        getMcpServerNames: jest.fn().mockReturnValue(['alpha-mcp', 'beta-mcp']),
        reloadMcpServers: jest.fn().mockRejectedValue(new Error('reload failed')),
      };
      const plugin = createPlugin({ claudeAdapter });
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'mcp');

      await findButton(t('settings.claudeCode.mcpRuntime.refreshButton')).onClick?.();

      expect(claudeAdapter.reloadMcpServers).toHaveBeenCalledTimes(1);
      expect(containerEl.textContent).toContain(t('settings.claudeCode.mcpRuntime.refreshFailed'));
      expect(containerEl.textContent).not.toContain(
        t('settings.claudeCode.mcpRuntime.loadedWithNames', {
          count: 2,
          names: 'alpha-mcp, beta-mcp',
        }),
      );
    });

    it('renders debug toggle in runtime tab and persists changes', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      const toggle = findToggle(t('settings.claudeCode.debug.name'));
      expect(toggle).toBeDefined();
      expect(toggle.control.setValue).toHaveBeenCalledWith(false);

      await toggle.onChange?.(true as never);
      expect(plugin.settings.backendSettings.claudeCode.debug).toBe(true);
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('renders debug boundary and lifecycle notices in runtime tab', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      const boundaryEl = containerEl.querySelector('[data-claude-code-debug-boundary="true"]');
      expect(boundaryEl).toBeTruthy();
      expect(boundaryEl!.textContent).toContain(t('settings.claudeCode.debug.boundaryNotice'));

      const lifecycleEl = containerEl.querySelector('[data-claude-code-debug-lifecycle="true"]');
      expect(lifecycleEl).toBeTruthy();
      expect(lifecycleEl!.textContent).toContain(t('settings.claudeCode.debug.lifecycleNotice'));
    });

    it('renders debugFile boundary, implicit-debug, and lifecycle notices in runtime tab', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      const boundaryEl = containerEl.querySelector('[data-claude-code-debug-file-boundary="true"]');
      expect(boundaryEl).toBeTruthy();
      expect(boundaryEl!.textContent).toContain(t('settings.claudeCode.debugFile.boundaryNotice'));

      const implicitEl = containerEl.querySelector('[data-claude-code-debug-file-implicit="true"]');
      expect(implicitEl).toBeTruthy();
      expect(implicitEl!.textContent).toContain(t('settings.claudeCode.debugFile.implicitDebugNotice'));

      const lifecycleEl = containerEl.querySelector('[data-claude-code-debug-file-lifecycle="true"]');
      expect(lifecycleEl).toBeTruthy();
      expect(lifecycleEl!.textContent).toContain(t('settings.claudeCode.debugFile.lifecycleNotice'));
    });

    it('trims and persists debugFile changes in runtime tab', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      const text = findText(t('settings.claudeCode.debugFile.name'));
      expect(text).toBeDefined();
      expect(text.control.setValue).toHaveBeenCalledWith('');

      await text.onChange?.('  /tmp/claude-debug.log  ' as never);

      expect(plugin.settings.backendSettings.claudeCode.debugFile).toBe('/tmp/claude-debug.log');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });
  });

  describe('runtime query limits', () => {
    /** Change a numeric-preset custom input and let the commit settle. */
    async function changeNumericInput(
      containerEl: HTMLElement,
      dataSetting: string,
      value: string,
    ): Promise<void> {
      const input = containerEl.querySelector<HTMLInputElement>(`[data-setting="${dataSetting}"]`);
      expect(input).toBeDefined();
      input!.value = value;
      input!.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    }

    function numericDropdown(name: string): ControlRecord<MockDropdownControl> {
      return findDropdown(name);
    }

    it('renders limit preset dropdowns with inherit first in the permissions-safety tab', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions-safety');

      // Defaults are null (unlimited): inherit selected, never fabricated.
      expect(numericDropdown(t('settings.claudeCode.maxTurns.name')).control.setValue).toHaveBeenCalledWith('');
      expect(numericDropdown(t('settings.claudeCode.maxBudgetUsd.name')).control.setValue).toHaveBeenCalledWith('');
      expect(numericDropdown(t('settings.claudeCode.taskBudget.name')).control.setValue).toHaveBeenCalledWith('');
      const turnOptions = numericDropdown(t('settings.claudeCode.maxTurns.name')).control.addOption.mock.calls.map(([value]) => value);
      expect(turnOptions).toEqual(['', '10', '25', '50', '100', '__custom__']);
      const budgetOptions = numericDropdown(t('settings.claudeCode.maxBudgetUsd.name')).control.addOption.mock.calls.map(([value]) => value);
      expect(budgetOptions).toEqual(['', '1', '5', '20', '100', '__custom__']);
      const taskOptions = numericDropdown(t('settings.claudeCode.taskBudget.name')).control.addOption.mock.calls.map(([value]) => value);
      expect(taskOptions).toEqual(['', '50000', '100000', '500000', '1000000', '__custom__']);
      // Metadata stays on the numeric rows.
      const turnSettingEl = containerEl.querySelector<HTMLElement>('[data-backend-key="claude.maxTurns"]');
      expect(turnSettingEl?.dataset.backendEffect).toBe('next-turn');
    });

    it('persists preset and custom values through the guided dropdowns', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions-safety');

      await numericDropdown(t('settings.claudeCode.maxTurns.name')).onChange?.('25' as never);
      expect(plugin.settings.backendSettings.claudeCode.maxTurns).toBe(25);
      expect(plugin.saveSettings).toHaveBeenCalled();

      await changeNumericInput(containerEl, 'claude-task-budget-custom', '50000');
      expect(plugin.settings.backendSettings.claudeCode.taskBudget).toBe(50000);
      expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
    });

    it('rejects malformed numeric input instead of partial parsing', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions-safety');

      await numericDropdown(t('settings.claudeCode.maxTurns.name')).onChange?.('25' as never);
      const turnsBefore = plugin.settings.backendSettings.claudeCode.maxTurns;

      await changeNumericInput(containerEl, 'claude-max-turns-custom', '12abc');
      await changeNumericInput(containerEl, 'claude-max-budget-custom', '5usd');
      await changeNumericInput(containerEl, 'claude-task-budget-custom', '50k');

      expect(plugin.settings.backendSettings.claudeCode.maxTurns).toBe(turnsBefore);
      expect(plugin.settings.backendSettings.claudeCode.maxBudgetUsd).toBeNull();
      expect(plugin.settings.backendSettings.claudeCode.taskBudget).toBeNull();
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it('rejects negative and zero numeric input', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions-safety');

      await numericDropdown(t('settings.claudeCode.maxTurns.name')).onChange?.('25' as never);
      await numericDropdown(t('settings.claudeCode.maxBudgetUsd.name')).onChange?.('5' as never);

      await changeNumericInput(containerEl, 'claude-max-turns-custom', '-5');
      await changeNumericInput(containerEl, 'claude-max-budget-custom', '0');
      await changeNumericInput(containerEl, 'claude-task-budget-custom', '0');

      expect(plugin.settings.backendSettings.claudeCode.maxTurns).toBe(25);
      expect(plugin.settings.backendSettings.claudeCode.maxBudgetUsd).toBe(5);
      expect(plugin.settings.backendSettings.claudeCode.taskBudget).toBeNull();
    });

    it('accepts decimal budgets but rejects decimal turns', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions-safety');

      await changeNumericInput(containerEl, 'claude-max-turns-custom', '12.5');
      await changeNumericInput(containerEl, 'claude-max-budget-custom', '12.5');
      await changeNumericInput(containerEl, 'claude-task-budget-custom', '12.5');

      expect(plugin.settings.backendSettings.claudeCode.maxTurns).toBeNull();
      expect(plugin.settings.backendSettings.claudeCode.maxBudgetUsd).toBe(12.5);
      expect(plugin.settings.backendSettings.claudeCode.taskBudget).toBeNull();
    });

    it('clears limits through the inherit option and restores on save failure', async () => {
      const plugin = createPlugin();
      plugin.settings.backendSettings.claudeCode.maxTurns = 7;
      plugin.settings.backendSettings.claudeCode.maxBudgetUsd = 5;
      plugin.settings.backendSettings.claudeCode.taskBudget = 100;
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions-safety');

      // A saved non-preset value renders as selected custom with the same
      // value — never clamped or rewritten on render.
      const turnsDropdown = numericDropdown(t('settings.claudeCode.maxTurns.name'));
      expect(turnsDropdown.control.setValue).toHaveBeenCalledWith('__custom__');
      const turnsInput = containerEl.querySelector<HTMLInputElement>('[data-setting="claude-max-turns-custom"]');
      expect(turnsInput!.value).toBe('7');
      expect(turnsInput!.style.display).toBe('block');

      await turnsDropdown.onChange?.('' as never);
      await numericDropdown(t('settings.claudeCode.maxBudgetUsd.name')).onChange?.('' as never);
      await numericDropdown(t('settings.claudeCode.taskBudget.name')).onChange?.('' as never);

      expect(plugin.settings.backendSettings.claudeCode.maxTurns).toBeNull();
      expect(plugin.settings.backendSettings.claudeCode.maxBudgetUsd).toBeNull();
      expect(plugin.settings.backendSettings.claudeCode.taskBudget).toBeNull();

      // Save failure restores the previous setting and reverts the control.
      plugin.saveSettings.mockRejectedValueOnce(new Error('disk full'));
      const budgetDropdown = numericDropdown(t('settings.claudeCode.maxBudgetUsd.name'));
      await budgetDropdown.onChange?.('20' as never).catch(() => undefined);
      expect(plugin.settings.backendSettings.claudeCode.maxBudgetUsd).toBeNull();
      expect(budgetDropdown.control.setValue).toHaveBeenLastCalledWith('');
    });
  });

  describe('runtime prompt behavior', () => {
    it('renders systemPrompt text area on the conversation page', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'conversation');

      const record = textAreaRecords.find((r) => r.name === t('settings.claudeCode.systemPrompt.name'));
      expect(record).toBeDefined();
      expect(record!.control.setValue).toHaveBeenCalledWith('');
      expect(record!.control.setPlaceholder).toHaveBeenCalledWith(t('settings.claudeCode.systemPrompt.placeholder'));
    });

    it('persists systemPrompt changes trimmed to settings', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'conversation');

      const record = textAreaRecords.find((r) => r.name === t('settings.claudeCode.systemPrompt.name'));
      expect(record).toBeDefined();
      expect(record!.onChange).toBeDefined();
      await record!.onChange!('  Always use TypeScript.  ' as never);
      expect(plugin.settings.backendSettings.claudeCode.systemPrompt).toBe('Always use TypeScript.');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('trims empty/whitespace systemPrompt to empty string', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'conversation');

      const record = textAreaRecords.find((r) => r.name === t('settings.claudeCode.systemPrompt.name'));
      expect(record).toBeDefined();
      await record!.onChange!('   ' as never);
      expect(plugin.settings.backendSettings.claudeCode.systemPrompt).toBe('');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('renders systemPrompt boundary notice with correct data attr', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'conversation');

      const boundaryEl = containerEl.querySelector('[data-claude-code-system-prompt-boundary="true"]');
      expect(boundaryEl).toBeTruthy();
      expect(containerEl.textContent).toContain(t('settings.claudeCode.systemPrompt.boundaryNotice'));
    });

    it('renders systemPrompt lifecycle notice with correct data attr', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'conversation');

      const lifecycleEl = containerEl.querySelector('[data-claude-code-system-prompt-lifecycle="true"]');
      expect(lifecycleEl).toBeTruthy();
      expect(containerEl.textContent).toContain(t('settings.claudeCode.systemPrompt.lifecycleNotice'));
    });

    it('renders outputStyle text input on the conversation page', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'conversation');

      const record = textRecords.find((r) => r.name === t('settings.claudeCode.outputStyle.name'));
      expect(record).toBeDefined();
      expect(record!.control.setValue).toHaveBeenCalledWith('');
      expect(record!.control.setPlaceholder).toHaveBeenCalledWith(t('settings.claudeCode.outputStyle.placeholder'));
    });

    it('persists outputStyle changes trimmed to settings', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'conversation');

      const record = textRecords.find((r) => r.name === t('settings.claudeCode.outputStyle.name'));
      expect(record).toBeDefined();
      expect(record!.onChange).toBeDefined();
      await record!.onChange!('  Explanatory  ' as never);
      expect(plugin.settings.backendSettings.claudeCode.outputStyle).toBe('Explanatory');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('trims empty/whitespace outputStyle to empty string', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'conversation');

      const record = textRecords.find((r) => r.name === t('settings.claudeCode.outputStyle.name'));
      expect(record).toBeDefined();
      await record!.onChange!('   ' as never);
      expect(plugin.settings.backendSettings.claudeCode.outputStyle).toBe('');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('renders outputStyle boundary notice with correct data attr', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'conversation');

      const boundaryEl = containerEl.querySelector('[data-claude-code-output-style-boundary="true"]');
      expect(boundaryEl).toBeTruthy();
      expect(containerEl.textContent).toContain(t('settings.claudeCode.outputStyle.boundaryNotice'));
    });

    it('renders outputStyle lifecycle notice with correct data attr', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'conversation');

      const lifecycleEl = containerEl.querySelector('[data-claude-code-output-style-lifecycle="true"]');
      expect(lifecycleEl).toBeTruthy();
      expect(containerEl.textContent).toContain(t('settings.claudeCode.outputStyle.lifecycleNotice'));
    });

    it('renders taskBudget boundary notice with correct data attr', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions-safety');

      const boundaryEl = containerEl.querySelector('[data-claude-code-task-budget-boundary="true"]');
      expect(boundaryEl).toBeTruthy();
      expect(containerEl.textContent).toContain(t('settings.claudeCode.taskBudget.boundaryNotice'));
    });

    it('renders taskBudget lifecycle notice with correct data attr', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions-safety');

      const lifecycleEl = containerEl.querySelector('[data-claude-code-task-budget-lifecycle="true"]');
      expect(lifecycleEl).toBeTruthy();
      expect(containerEl.textContent).toContain(t('settings.claudeCode.taskBudget.lifecycleNotice'));
    });
  });

  describe('sandbox settings in Permissions tab', () => {
    it('renders semantic groups in the approved order', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions');

      expectGroupOrder(containerEl, [
        'permission-mode',
        'plan-mode',
        'sandbox-core',
        'sandbox-advanced',
        'limits-budget',
      ]);
      expect(containerEl.querySelectorAll('[data-claude-code-group]')).toHaveLength(5);
    });

    it('renders sandbox boundary notice explaining this is not a permission editor', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions');

      const boundaryEl = containerEl.querySelector('[data-claude-code-sandbox-boundary="true"]');
      expect(boundaryEl).toBeTruthy();
      expect(boundaryEl!.textContent).toContain(t('settings.claudeCode.sandbox.boundaryNotice'));
    });

    it('renders stable sandbox toggles and advanced text controls with expected locale labels', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions');

      expect(findToggle(t('settings.claudeCode.sandbox.enabled.name'))).toBeDefined();
      expect(findToggle(t('settings.claudeCode.sandbox.failIfUnavailable.name'))).toBeDefined();
      expect(findToggle(t('settings.claudeCode.sandbox.autoAllowBashIfSandboxed.name'))).toBeDefined();
      expect(findToggle(t('settings.claudeCode.sandbox.allowUnsandboxedCommands.name'))).toBeDefined();
      expect(findToggle(t('settings.claudeCode.sandbox.enableWeakerNestedSandbox.name'))).toBeDefined();
      expect(findToggle(t('settings.claudeCode.sandbox.enableWeakerNetworkIsolation.name'))).toBeDefined();
      expect(containerEl.querySelector('[data-claude-code-advanced-sandbox="true"]')).toBeTruthy();
      expect(containerEl.querySelector('.opencodian-claude-code-advanced-summary')).toBeTruthy();

      expect(findTextArea(t('settings.claudeCode.sandbox.excludedCommands.name'))).toBeDefined();
      expect(findTextArea(t('settings.claudeCode.sandbox.filesystem.allowWrite.name'))).toBeDefined();
      expect(findTextArea(t('settings.claudeCode.sandbox.filesystem.denyWrite.name'))).toBeDefined();
      expect(findTextArea(t('settings.claudeCode.sandbox.filesystem.denyRead.name'))).toBeDefined();
      expect(findTextArea(t('settings.claudeCode.sandbox.network.allowedDomains.name'))).toBeDefined();
      expect(findTextArea(t('settings.claudeCode.sandbox.network.deniedDomains.name'))).toBeDefined();
      expect(findText(t('settings.claudeCode.sandbox.ripgrep.command.name'))).toBeDefined();
      expect(findTextArea(t('settings.claudeCode.sandbox.ripgrep.args.name'))).toBeDefined();
    });

    it('changing each sandbox toggle updates settings and calls saveSettings', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions');

      // Toggle sandbox.enabled on
      await findToggle(t('settings.claudeCode.sandbox.enabled.name')).onChange?.(true as never);
      expect(plugin.settings.backendSettings.claudeCode.sandbox.enabled).toBe(true);
      expect(plugin.saveSettings).toHaveBeenCalled();

      // Toggle failIfUnavailable on
      (plugin.saveSettings as jest.Mock).mockClear();
      await findToggle(t('settings.claudeCode.sandbox.failIfUnavailable.name')).onChange?.(true as never);
      expect(plugin.settings.backendSettings.claudeCode.sandbox.failIfUnavailable).toBe(true);
      expect(plugin.saveSettings).toHaveBeenCalled();

      // Toggle autoAllowBashIfSandboxed on
      (plugin.saveSettings as jest.Mock).mockClear();
      await findToggle(t('settings.claudeCode.sandbox.autoAllowBashIfSandboxed.name')).onChange?.(true as never);
      expect(plugin.settings.backendSettings.claudeCode.sandbox.autoAllowBashIfSandboxed).toBe(true);
      expect(plugin.saveSettings).toHaveBeenCalled();

      // Toggle allowUnsandboxedCommands off
      (plugin.saveSettings as jest.Mock).mockClear();
      await findToggle(t('settings.claudeCode.sandbox.allowUnsandboxedCommands.name')).onChange?.(false as never);
      expect(plugin.settings.backendSettings.claudeCode.sandbox.allowUnsandboxedCommands).toBe(false);
      expect(plugin.saveSettings).toHaveBeenCalled();

      // Toggle weaker sandbox options on
      (plugin.saveSettings as jest.Mock).mockClear();
      await findToggle(t('settings.claudeCode.sandbox.enableWeakerNestedSandbox.name')).onChange?.(true as never);
      expect(plugin.settings.backendSettings.claudeCode.sandbox.enableWeakerNestedSandbox).toBe(true);
      expect(plugin.saveSettings).toHaveBeenCalled();

      (plugin.saveSettings as jest.Mock).mockClear();
      await findToggle(t('settings.claudeCode.sandbox.enableWeakerNetworkIsolation.name')).onChange?.(true as never);
      expect(plugin.settings.backendSettings.claudeCode.sandbox.enableWeakerNetworkIsolation).toBe(true);
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('does not render managed-only sandbox authoring UI fields', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions');

      const renderedNames = [
        ...textRecords,
        ...textAreaRecords,
        ...dropdownRecords,
        ...toggleRecords,
        ...buttonRecords,
      ].map((r) => r.name.toLowerCase()).join('\n');

      expect(renderedNames).toContain(t('settings.claudeCode.sandbox.filesystem.allowWrite.name').toLowerCase());
      expect(renderedNames).toContain(t('settings.claudeCode.sandbox.network.allowedDomains.name').toLowerCase());

      // Managed-only SDK fields must NOT appear in stable settings.
      expect(renderedNames).not.toContain('allow managed domains only');
      expect(renderedNames).not.toContain('bwrap path');
      expect(renderedNames).not.toContain('socat path');
      expect(renderedNames).not.toContain('mach lookup');
      expect(renderedNames).not.toContain('unix sockets');
      expect(renderedNames).not.toContain('all unix sockets');
      expect(renderedNames).not.toContain('local binding');
      expect(renderedNames).not.toContain('http proxy port');
      expect(renderedNames).not.toContain('socks proxy port');
      expect(renderedNames).not.toContain('ignore violations');
    });

    it('renders sandbox next-query lifecycle notice without a live-apply restart button', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions');

      // Sandbox lifecycle notice must exist
      const lifecycleEl = containerEl.querySelector('[data-claude-code-sandbox-lifecycle]');
      expect(lifecycleEl).toBeTruthy();
      // The notice should mention "next query" scope
      expect(lifecycleEl!.textContent).toContain(t('settings.claudeCode.sandbox.lifecycleNotice'));
      // It must NOT contain a restart button — sandbox cannot be live-applied
      const restartButtons = containerEl.querySelectorAll('[data-claude-code-sandbox-lifecycle] button');
      expect(restartButtons.length).toBe(0);
    });
  });

  describe('planModeInstructions in Permissions tab', () => {
    it('renders planModeInstructions text area with expected locale label', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions');

      const textAreaRecord = findTextArea(t('settings.claudeCode.planModeInstructions.name'));
      expect(textAreaRecord).toBeDefined();
      expect(textAreaRecord.control.setValue).toHaveBeenCalledWith('');
    });

    it('changing planModeInstructions updates settings and calls saveSettings', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions');

      const textAreaRecord = findTextArea(t('settings.claudeCode.planModeInstructions.name'));
      await textAreaRecord.onChange?.('Use TDD.' as never);
      expect(plugin.settings.backendSettings.claudeCode.planModeInstructions).toBe('Use TDD.');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    it('trims planModeInstructions on change', async () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions');

      const textAreaRecord = findTextArea(t('settings.claudeCode.planModeInstructions.name'));
      await textAreaRecord.onChange?.('  Use TDD.  ' as never);
      expect(plugin.settings.backendSettings.claudeCode.planModeInstructions).toBe('Use TDD.');
    });

    it('renders planModeInstructions boundary notice', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions');

      const boundaryEl = containerEl.querySelector('[data-claude-code-plan-mode-instructions-boundary]');
      expect(boundaryEl).toBeTruthy();
      expect(boundaryEl!.textContent).toContain(t('settings.claudeCode.planModeInstructions.boundaryNotice'));
    });

    it('renders planModeInstructions lifecycle notice', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions');

      const lifecycleEl = containerEl.querySelector('[data-claude-code-plan-mode-instructions-lifecycle]');
      expect(lifecycleEl).toBeTruthy();
      expect(lifecycleEl!.textContent).toContain(t('settings.claudeCode.planModeInstructions.lifecycleNotice'));
      expect(lifecycleEl!.textContent).toContain('already-running session');
    });

    it('renders planModeInstructions lifecycle notice with explicit active-session boundary in Chinese', () => {
      setLocale('zh');
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'permissions');

      const lifecycleEl = containerEl.querySelector('[data-claude-code-plan-mode-instructions-lifecycle]');
      expect(lifecycleEl).toBeTruthy();
      expect(lifecycleEl!.textContent).toContain(t('settings.claudeCode.planModeInstructions.lifecycleNotice'));
      expect(lifecycleEl!.textContent).toContain('正在运行中的会话');
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
        expect(renderedNames).not.toContain('skills authoring');
        expect(renderedNames).not.toContain('agents authoring');
        expect(renderedNames).not.toContain('subagent browser');
        expect(renderedNames).not.toContain('sessionstore');
        expect(renderedNames).not.toContain('jsonl');
      }
    });
  });

  describe('backend session browser launcher', () => {
    it('renders session browser launcher button in runtime tab', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      const launchButton = findButton(t('settings.claudeCode.sessionBrowser.launchButton'));
      expect(launchButton).toBeDefined();
      expect(launchButton.onClick).toBeDefined();
    });

    it('renders session browser info notice in runtime tab', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      const infoEl = containerEl.querySelector('[data-claude-code-session-browser-info="true"]');
      expect(infoEl).toBeTruthy();
    });

    it('renders browse-only notice explaining resume requires chat view', () => {
      const plugin = createPlugin();
      const containerEl = document.createElement('div');
      const section = new SettingsClaudeCodeSection({
        plugin: plugin as OpenCodianPlugin,
        createSectionHeading,
      });
      section.attachTabbed(containerEl, 'runtime');

      const browseOnlyEl = containerEl.querySelector('[data-claude-code-session-browser-browse-only="true"]');
      expect(browseOnlyEl).toBeTruthy();
      expect(browseOnlyEl?.textContent).toContain(t('settings.claudeCode.sessionBrowser.browseOnlyNotice'));
    });
  });
});

describe('SettingsClaudeCodeSection CSS contract', () => {
  it('keeps Claude Code groups and readback styling semantically distinct from success proof', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/components/settings-claude-code.css'),
      'utf8',
    );
    const readbackRule = css.match(/\.opencodian-settings\s+\.opencodian-settings-proof-status\[data-proof-state="readback"\]\s*\{[\s\S]*?\}/)?.[0] ?? '';
    const readbackSurfaceRule = css.match(/\.opencodian-settings\s+\.opencodian-claude-code-readback,[\s\S]*?\}\n/)?.[0] ?? '';

    expect(css).toContain('.opencodian-claude-code-group-header');
    expect(css).toContain('.opencodian-claude-code-group-title');
    expect(css).toContain('.opencodian-claude-code-group-desc');
    expect(css).toContain('.opencodian-claude-code-stack');
    expect(css).toContain('.opencodian-claude-code-advanced');
    expect(css).toContain('.opencodian-claude-code-advanced-summary');
    expect(css).toContain('.opencodian-claude-code-readback');
    expect(css).toContain('.opencodian-claude-code-notice--boundary');
    expect(css).toContain('.opencodian-claude-code-notice--lifecycle');
    expect(readbackRule).toContain('data-proof-state="readback"');
    expect(readbackRule).not.toContain('var(--text-success');
    expect(readbackSurfaceRule).not.toContain('var(--text-success');
  });
});
