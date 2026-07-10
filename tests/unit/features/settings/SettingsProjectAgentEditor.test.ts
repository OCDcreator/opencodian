/* eslint-disable max-lines -- Project agent editor tests keep grouped creation, editing, and regression coverage together. */
import { Setting } from 'obsidian';
import * as obsidian from 'obsidian';

import type { OpencodeAgentConfigRecord } from '../../../../src/core/types';
import { SettingsProjectAgentEditor } from '../../../../src/features/settings/SettingsProjectAgentEditor';
import { TextareaSizeMemory } from '../../../../src/features/settings/TextareaSizeMemory';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

interface MockDropdownControl { addOption: jest.MockedFunction<(value: string, label: string) => MockDropdownControl>; setValue: jest.MockedFunction<(value: string) => MockDropdownControl>; onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>; selectEl: HTMLSelectElement; }
interface MockToggleControl { setValue: jest.MockedFunction<(value: boolean) => MockToggleControl>; onChange: jest.MockedFunction<(callback: (value: boolean) => void | Promise<void>) => MockToggleControl>; }
interface MockTextControl { inputEl: HTMLInputElement; setPlaceholder: jest.MockedFunction<(value: string) => MockTextControl>; setValue: jest.MockedFunction<(value: string) => MockTextControl>; onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextControl>; }
interface MockTextAreaControl { inputEl: HTMLTextAreaElement; setPlaceholder: jest.MockedFunction<(value: string) => MockTextAreaControl>; setValue: jest.MockedFunction<(value: string) => MockTextAreaControl>; onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextAreaControl>; }
interface MockButtonControl { setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>; setDisabled: jest.MockedFunction<(value: boolean) => MockButtonControl>; onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>; }
interface DropdownRecord { control: MockDropdownControl; name: string; onChange?: (value: string) => void | Promise<void>; }
interface ToggleRecord { control: MockToggleControl; name: string; onChange?: (value: boolean) => void | Promise<void>; }
interface TextRecord { control: MockTextControl; name: string; onChange?: (value: string) => void | Promise<void>; }
interface TextAreaRecord { control: MockTextAreaControl; name: string; onChange?: (value: string) => void | Promise<void>; }
interface ButtonRecord { control: MockButtonControl; label?: string; name: string; onClick?: () => void | Promise<void>; }

type ProjectAgentConfigManager = Pick<
  NonNullable<OpenCodianPlugin['opencodeConfigManager']>,
  'upsertAgentConfig' | 'removeAgentConfig'
>;

const dropdownRecords: DropdownRecord[] = [];
const toggleRecords: ToggleRecord[] = [];
const textRecords: TextRecord[] = [];
const textAreaRecords: TextAreaRecord[] = [];
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
  const inputEl = document.createElement('input');
  const record: TextRecord = {
    name,
    control: {
      inputEl,
      setPlaceholder: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
    },
  };
  record.control.setPlaceholder.mockReturnValue(record.control);
  record.control.setValue.mockImplementation((value) => {
    inputEl.value = value;
    return record.control;
  });
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  return record;
}

function createTextAreaRecord(name: string): TextAreaRecord {
  const inputEl = document.createElement('textarea');
  const record: TextAreaRecord = {
    name,
    control: {
      inputEl,
      setPlaceholder: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
    },
  };
  record.control.setPlaceholder.mockReturnValue(record.control);
  record.control.setValue.mockImplementation((value) => {
    inputEl.value = value;
    return record.control;
  });
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
      setButtonText: jest.fn(),
      setDisabled: jest.fn(),
      onClick: jest.fn(),
    },
  };
  record.control.setButtonText.mockImplementation((value) => {
    record.label = value;
    return record.control;
  });
  record.control.setDisabled.mockReturnValue(record.control);
  record.control.onClick.mockImplementation((callback) => {
    record.onClick = callback;
    return record.control;
  });
  return record;
}

function createConfigManager(): ProjectAgentConfigManager {
  return {
    upsertAgentConfig: jest.fn().mockResolvedValue(undefined),
    removeAgentConfig: jest.fn().mockResolvedValue(undefined),
  } as unknown as ProjectAgentConfigManager;
}

function renderEditor(options: { projectAgents?: OpencodeAgentConfigRecord } = {}) {
  const configManager = createConfigManager();
  const onConfigChanged = jest.fn().mockResolvedValue(undefined);
  const editor = new SettingsProjectAgentEditor(
    configManager as NonNullable<OpenCodianPlugin['opencodeConfigManager']>,
  );
  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);
  editor.render({
    containerEl,
    onConfigChanged,
    projectAgents: options.projectAgents ?? {},
  });
  return {
    containerEl,
    configManager,
    editor,
    onConfigChanged,
  };
}

function findDropdown(name: string): DropdownRecord | undefined {
  return dropdownRecords.find((record) => record.name === name);
}

function findText(name: string): TextRecord | undefined {
  return textRecords.find((record) => record.name === name);
}

function findTextArea(name: string): TextAreaRecord | undefined {
  return textAreaRecords.find((record) => record.name === name);
}

function findButton(label: string): ButtonRecord | undefined {
  return buttonRecords.find((record) => record.label === label);
}

async function flushAsync(): Promise<void> { await Promise.resolve(); await Promise.resolve(); }

beforeEach(() => {
  setLocale('en');
  document.body.innerHTML = '';
  dropdownRecords.length = 0;
  toggleRecords.length = 0;
  textRecords.length = 0;
  textAreaRecords.length = 0;
  buttonRecords.length = 0;
  jest.spyOn(TextareaSizeMemory, 'attach').mockReturnValue({
    destroy: jest.fn(),
  } as unknown as TextareaSizeMemory);

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
  jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(function addTextArea(
    this: Setting,
    callback: (control: MockTextAreaControl) => unknown,
  ) {
    const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
    const record = createTextAreaRecord(name);
    textAreaRecords.push(record);
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

afterEach(() => { jest.restoreAllMocks(); document.body.innerHTML = ''; });

describe('SettingsProjectAgentEditor layout and creation', () => {
  it('keeps the editor height and scroll stable when re-rendering after config changes', () => {
    const requestFrameSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 1);
    const { containerEl, editor, onConfigChanged } = renderEditor();
    Object.defineProperty(containerEl, 'offsetHeight', {
      configurable: true,
      value: 480,
    });
    let scrollTop = 144;
    Object.defineProperty(containerEl, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });

    editor.render({
      containerEl,
      onConfigChanged,
      projectAgents: {},
    });

    expect(containerEl.style.minHeight).toBe('480px');
    expect(containerEl.scrollTop).toBe(144);
    expect(requestFrameSpy).toHaveBeenCalled();
  });

  it('renders grouped editor sections and keeps advanced settings collapsed by default', () => {
    const { containerEl } = renderEditor();

    expect(containerEl.querySelector('.opencodian-agent-editor-card')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-agent-editor-card-content')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-agent-editor-footer')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-agent-editor-row')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-agent-editor-field')).not.toBeNull();

    const groups = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.opencodian-agent-editor-group'),
    );

    expect(groups.map((group) => group.dataset.group)).toEqual([
      'identity',
      'behavior',
      'model',
      'advanced',
    ]);
    expect(groups.every((group) => group.classList.contains('opencodian-agent-editor-field-group'))).toBe(true);

    const advancedGroup = containerEl.querySelector<HTMLDetailsElement>(
      '.opencodian-agent-editor-group[data-group="advanced"]',
    );
    expect(advancedGroup).not.toBeNull();
    expect(advancedGroup?.open).toBe(false);
  });

  it('attaches textarea size memory to prompt, task allowlist, and options editors', () => {
    renderEditor();

    const promptRecord = findTextArea(t('settings.agents.editor.prompt.name'));
    const taskAllowlistRecord = findTextArea(t('settings.agents.editor.taskAllowlist.name'));
    const optionsRecord = findTextArea(t('settings.agents.editor.options.name'));

    expect(promptRecord).toBeDefined();
    expect(taskAllowlistRecord).toBeDefined();
    expect(optionsRecord).toBeDefined();
    expect(TextareaSizeMemory.attach).toHaveBeenCalledWith(
      promptRecord!.control.inputEl,
      'project-agent-prompt',
    );
    expect(TextareaSizeMemory.attach).toHaveBeenCalledWith(
      taskAllowlistRecord!.control.inputEl,
      'project-agent-task-allowlist',
    );
    expect(TextareaSizeMemory.attach).toHaveBeenCalledWith(
      optionsRecord!.control.inputEl,
      'project-agent-options',
    );
  });

  it('creates a project agent with editable core fields', async () => {
    const { configManager } = renderEditor();

    await findText(t('settings.agents.editor.id.name'))?.onChange?.('architect');
    await findDropdown(t('settings.agents.editor.mode.name'))?.onChange?.('subagent');
    await findText(t('settings.agents.editor.description.name'))?.onChange?.('Plans implementation slices');
    await findTextArea(t('settings.agents.editor.prompt.name'))?.onChange?.('You plan focused implementation work.');
    await findText(t('settings.agents.editor.model.name'))?.onChange?.('anthropic/claude-sonnet-4');
    await findText(t('settings.agents.editor.temperature.name'))?.onChange?.('0.2');
    await findText(t('settings.agents.editor.topP.name'))?.onChange?.('0.85');
    await findText(t('settings.agents.editor.steps.name'))?.onChange?.('6');
    await findText(t('settings.agents.editor.color.name'))?.onChange?.('#8b5cf6');

    await findButton(t('settings.agents.editor.actions.save'))?.onClick?.();
    await flushAsync();

    expect(configManager.upsertAgentConfig).toHaveBeenCalledWith('architect', {
      mode: 'subagent',
      description: 'Plans implementation slices',
      prompt: 'You plan focused implementation work.',
      model: 'anthropic/claude-sonnet-4',
      temperature: 0.2,
      top_p: 0.85,
      steps: 6,
      color: '#8b5cf6',
      disable: undefined,
    });
  });

  it('writes a task allowlist as project-scoped permission.task rules', async () => {
    const { configManager } = renderEditor();

    await findText(t('settings.agents.editor.id.name'))?.onChange?.('planner');
    await findTextArea(t('settings.agents.editor.taskAllowlist.name'))?.onChange?.('  explore  \n\nreview-*\nexplore');

    await findButton(t('settings.agents.editor.actions.save'))?.onClick?.();
    await flushAsync();

    expect(configManager.upsertAgentConfig).toHaveBeenCalledWith('planner', {
      mode: 'primary',
      description: undefined,
      prompt: undefined,
      model: undefined,
      temperature: undefined,
      top_p: undefined,
      steps: undefined,
      color: undefined,
      disable: undefined,
      permission: {
        task: {
          '*': 'deny',
          explore: 'allow',
          'review-*': 'allow',
        },
      },
    });
  });

  it('writes agent skill tool and permission overrides', async () => {
    const { configManager } = renderEditor();

    await findText(t('settings.agents.editor.id.name'))?.onChange?.('researcher');
    await findDropdown(t('settings.agents.editor.skillTool.name'))?.onChange?.('disabled');
    await findDropdown(t('settings.agents.editor.skillPermission.name'))?.onChange?.('deny');

    await findButton(t('settings.agents.editor.actions.save'))?.onClick?.();
    await flushAsync();

    expect(configManager.upsertAgentConfig).toHaveBeenCalledWith('researcher', {
      mode: 'primary',
      description: undefined,
      prompt: undefined,
      model: undefined,
      temperature: undefined,
      top_p: undefined,
      steps: undefined,
      color: undefined,
      disable: undefined,
      permission: {
        skill: 'deny',
      },
      tools: {
        skill: false,
      },
    });
  });

  it('writes project agent options from a JSON object field', async () => {
    const { configManager } = renderEditor();

    await findText(t('settings.agents.editor.id.name'))?.onChange?.('planner');
    await findTextArea(t('settings.agents.editor.options.name'))?.onChange?.('{\n  "reasoningSummary": "auto",\n  "nested": {\n    "maxTokens": 300\n  },\n  "tags": ["focus"]\n}');

    await findButton(t('settings.agents.editor.actions.save'))?.onClick?.();
    await flushAsync();

    expect(configManager.upsertAgentConfig).toHaveBeenCalledWith('planner', {
      mode: 'primary',
      description: undefined,
      prompt: undefined,
      model: undefined,
      temperature: undefined,
      top_p: undefined,
      steps: undefined,
      color: undefined,
      disable: undefined,
      options: {
        reasoningSummary: 'auto',
        nested: {
          maxTokens: 300,
        },
        tags: ['focus'],
      },
    });
  });

  it('merges task allowlists onto shorthand permissions when editing a project agent', async () => {
    const { configManager } = renderEditor({
      projectAgents: {
        reviewer: {
          mode: 'primary',
          permission: 'ask',
        },
      },
    });

    await findDropdown(t('settings.agents.editor.select.name'))?.onChange?.('reviewer');
    await findTextArea(t('settings.agents.editor.taskAllowlist.name'))?.onChange?.('plan\nreview-*');

    await findButton(t('settings.agents.editor.actions.save'))?.onClick?.();
    await flushAsync();

    expect(configManager.upsertAgentConfig).toHaveBeenCalledWith('reviewer', {
      mode: 'primary',
      description: undefined,
      prompt: undefined,
      model: undefined,
      temperature: undefined,
      top_p: undefined,
      steps: undefined,
      color: undefined,
      disable: undefined,
      permission: {
        '*': 'ask',
        task: {
          '*': 'deny',
          plan: 'allow',
          'review-*': 'allow',
        },
      },
    });
  });

});

describe('SettingsProjectAgentEditor existing agent workflows', () => {
  it('edits and deletes a selected project agent without overwriting unrelated fields', async () => {
    const { configManager } = renderEditor({
      projectAgents: {
        reviewer: {
          mode: 'primary',
          description: 'Old description',
          prompt: 'Old prompt',
          model: 'old/model',
          temperature: 0.7,
          top_p: 0.9,
          steps: 12,
          color: 'blue',
          hidden: true,
          permission: {
            bash: 'ask',
            task: {
              '*': 'deny',
              planner: 'allow',
              'review-*': 'allow',
              audit: 'ask',
            },
          },
          options: {
            custom: true,
            nested: {
              keep: true,
              remove: 'stale',
            },
          },
        },
      },
    });

    await findDropdown(t('settings.agents.editor.select.name'))?.onChange?.('reviewer');

    expect(findText(t('settings.agents.editor.id.name'))?.control.setValue).toHaveBeenLastCalledWith('reviewer');
    expect(findDropdown(t('settings.agents.editor.mode.name'))?.control.setValue).toHaveBeenLastCalledWith('primary');
    expect(findText(t('settings.agents.editor.description.name'))?.control.setValue).toHaveBeenLastCalledWith('Old description');
    expect(findTextArea(t('settings.agents.editor.prompt.name'))?.control.setValue).toHaveBeenLastCalledWith('Old prompt');
    expect(findTextArea(t('settings.agents.editor.taskAllowlist.name'))?.control.setValue).toHaveBeenLastCalledWith('planner\nreview-*');
    expect(findTextArea(t('settings.agents.editor.options.name'))?.control.setValue).toHaveBeenLastCalledWith('{\n  "custom": true,\n  "nested": {\n    "keep": true,\n    "remove": "stale"\n  }\n}');

    await findDropdown(t('settings.agents.editor.mode.name'))?.onChange?.('all');
    await findText(t('settings.agents.editor.description.name'))?.onChange?.('New description');
    await findTextArea(t('settings.agents.editor.prompt.name'))?.onChange?.('New prompt');
    await findText(t('settings.agents.editor.model.name'))?.onChange?.('');
    await findText(t('settings.agents.editor.temperature.name'))?.onChange?.('');
    await findText(t('settings.agents.editor.topP.name'))?.onChange?.('');
    await findText(t('settings.agents.editor.steps.name'))?.onChange?.('');
    await findText(t('settings.agents.editor.color.name'))?.onChange?.('#22c55e');
    await findTextArea(t('settings.agents.editor.taskAllowlist.name'))?.onChange?.('');
    await findTextArea(t('settings.agents.editor.options.name'))?.onChange?.('{\n  "nested": {\n    "keep": false\n  },\n  "mode": "careful"\n}');

    await findButton(t('settings.agents.editor.actions.save'))?.onClick?.();
    await flushAsync();

    expect(configManager.upsertAgentConfig).toHaveBeenCalledWith('reviewer', {
      mode: 'all',
      description: 'New description',
      prompt: 'New prompt',
      model: undefined,
      temperature: undefined,
      top_p: undefined,
      steps: undefined,
      color: '#22c55e',
      disable: undefined,
      permission: {
        task: undefined,
      },
      options: {
        custom: undefined,
        nested: {
          keep: false,
          remove: undefined,
        },
        mode: 'careful',
      },
    });

    await findButton(t('settings.agents.editor.actions.delete'))?.onClick?.();

    expect(configManager.removeAgentConfig).toHaveBeenCalledWith('reviewer');
  });

  it('rejects invalid project agent options JSON', async () => {
    const { configManager, onConfigChanged } = renderEditor();
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);

    await findText(t('settings.agents.editor.id.name'))?.onChange?.('planner');
    await findTextArea(t('settings.agents.editor.options.name'))?.onChange?.('{"reasoningSummary": }');

    await findButton(t('settings.agents.editor.actions.save'))?.onClick?.();
    await flushAsync();

    expect(configManager.upsertAgentConfig).not.toHaveBeenCalled();
    expect(onConfigChanged).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(expect.stringContaining(t('settings.agents.editor.notice.invalidJson', {
      field: t('settings.agents.editor.options.name'),
      message: '',
    }).split(':')[0]));
  });
});
