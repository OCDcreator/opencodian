import { Setting } from 'obsidian';
import * as obsidian from 'obsidian';

import type { OpencodeCommandConfigRecord } from '../../../../src/core/types';
import {
  type ProjectCommandEditorSource,
  SettingsProjectCommandEditor,
} from '../../../../src/features/settings/SettingsProjectCommandEditor';
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
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextControl>;
  setValue: jest.MockedFunction<(value: string) => MockTextControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextControl>;
}

interface MockTextAreaControl {
  inputEl: HTMLTextAreaElement;
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextAreaControl>;
  setValue: jest.MockedFunction<(value: string) => MockTextAreaControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextAreaControl>;
}

interface MockButtonControl {
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  setDisabled: jest.MockedFunction<(value: boolean) => MockButtonControl>;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
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

interface TextAreaRecord {
  control: MockTextAreaControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}

interface ButtonRecord {
  control: MockButtonControl;
  label?: string;
  name: string;
  onClick?: () => void | Promise<void>;
}

type ProjectCommandConfigManager = Pick<
  NonNullable<OpenCodianPlugin['opencodeConfigManager']>,
  'upsertCommandConfig' | 'removeCommandConfig'
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

function createConfigManager(): ProjectCommandConfigManager {
  return {
    upsertCommandConfig: jest.fn().mockResolvedValue(undefined),
    removeCommandConfig: jest.fn().mockResolvedValue(undefined),
  } as unknown as ProjectCommandConfigManager;
}

function createCommandSource(
  overrides: Partial<ProjectCommandEditorSource> & Pick<ProjectCommandEditorSource, 'id'>,
): ProjectCommandEditorSource {
  return {
    id: overrides.id,
    template: overrides.template ?? `Run /${overrides.id}`,
    description: overrides.description ?? '',
    agent: overrides.agent ?? '',
    model: overrides.model ?? '',
    subtask: overrides.subtask ?? false,
    hasProjectOverride: overrides.hasProjectOverride ?? false,
    runtimeAvailable: overrides.runtimeAvailable ?? true,
  };
}

function renderEditor(options: {
  commands?: ProjectCommandEditorSource[];
  projectCommands?: OpencodeCommandConfigRecord;
} = {}) {
  const configManager = createConfigManager();
  const onConfigChanged = jest.fn().mockResolvedValue(undefined);
  const editor = new SettingsProjectCommandEditor(
    configManager as NonNullable<OpenCodianPlugin['opencodeConfigManager']>,
  );
  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);
  editor.render({
    containerEl,
    commands: options.commands ?? [],
    onConfigChanged,
    projectCommands: options.projectCommands ?? {},
  });
  return {
    containerEl,
    configManager,
    onConfigChanged,
  };
}

function findDropdown(name: string): DropdownRecord | undefined {
  return dropdownRecords.find((record) => record.name === name);
}

function findToggle(name: string): ToggleRecord | undefined {
  return toggleRecords.find((record) => record.name === name);
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

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  setLocale('en');
  document.body.innerHTML = '';
  dropdownRecords.length = 0;
  toggleRecords.length = 0;
  textRecords.length = 0;
  textAreaRecords.length = 0;
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

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SettingsProjectCommandEditor', () => {
  it('renders the supported OpenCodian command placeholder reference', () => {
    const { containerEl } = renderEditor();

    expect(containerEl.textContent).toContain(t('settings.commands.editor.placeholders.title'));
    expect(containerEl.textContent).toContain('{{vault_path}}');
    expect(containerEl.textContent).toContain('{{current_note_path}}');
    expect(containerEl.textContent).toContain('{{current_selection}}');
    expect(containerEl.textContent).toContain('{{external_context_paths}}');
    expect(containerEl.textContent).toContain('{{conversation_title}}');
  });

  it('creates a project command with editable core fields', async () => {
    const { configManager } = renderEditor();

    await findText(t('settings.commands.editor.id.name'))?.onChange?.('review-tests');
    await findTextArea(t('settings.commands.editor.template.name'))?.onChange?.('Review the focused test files and suggest improvements.');
    await findText(t('settings.commands.editor.description.name'))?.onChange?.('Review focused tests');
    await findText(t('settings.commands.editor.agent.name'))?.onChange?.('reviewer');
    await findText(t('settings.commands.editor.model.name'))?.onChange?.('anthropic/claude-sonnet-4');
    await findToggle(t('settings.commands.editor.subtask.name'))?.onChange?.(true);

    await findButton(t('settings.commands.editor.actions.save'))?.onClick?.();
    await flushAsync();

    expect(configManager.upsertCommandConfig).toHaveBeenCalledWith('review-tests', {
      template: 'Review the focused test files and suggest improvements.',
      description: 'Review focused tests',
      agent: 'reviewer',
      model: 'anthropic/claude-sonnet-4',
      subtask: true,
    });
  });

  it('prefills runtime command defaults when saving a built-in override', async () => {
    const { configManager } = renderEditor({
      commands: [
        createCommandSource({
          id: 'review',
          template: 'Review the current changeset.',
          description: 'Review changes',
          agent: 'code-review',
          model: 'anthropic/claude-sonnet-4',
          subtask: true,
        }),
      ],
    });

    await findDropdown(t('settings.commands.editor.select.name'))?.onChange?.('review');

    expect(findText(t('settings.commands.editor.id.name'))?.control.setValue).toHaveBeenLastCalledWith('review');
    expect(findTextArea(t('settings.commands.editor.template.name'))?.control.setValue).toHaveBeenLastCalledWith('Review the current changeset.');
    expect(findText(t('settings.commands.editor.description.name'))?.control.setValue).toHaveBeenLastCalledWith('Review changes');
    expect(findText(t('settings.commands.editor.agent.name'))?.control.setValue).toHaveBeenLastCalledWith('code-review');
    expect(findText(t('settings.commands.editor.model.name'))?.control.setValue).toHaveBeenLastCalledWith('anthropic/claude-sonnet-4');
    expect(findToggle(t('settings.commands.editor.subtask.name'))?.control.setValue).toHaveBeenLastCalledWith(true);

    await findText(t('settings.commands.editor.description.name'))?.onChange?.('Review the staged changes');
    await findToggle(t('settings.commands.editor.subtask.name'))?.onChange?.(false);

    await findButton(t('settings.commands.editor.actions.save'))?.onClick?.();
    await flushAsync();

    expect(configManager.upsertCommandConfig).toHaveBeenCalledWith('review', {
      template: 'Review the current changeset.',
      description: 'Review the staged changes',
      agent: 'code-review',
      model: 'anthropic/claude-sonnet-4',
      subtask: false,
    });
  });

  it('edits and deletes a selected project command', async () => {
    const { configManager } = renderEditor({
      commands: [
        createCommandSource({
          id: 'deploy',
          template: 'Deploy the plugin.',
          description: 'Project deploy command',
          agent: 'ops',
          model: 'openai/gpt-4.1',
          subtask: false,
          hasProjectOverride: true,
          runtimeAvailable: false,
        }),
      ],
      projectCommands: {
        deploy: {
          template: 'Deploy the plugin.',
          description: 'Project deploy command',
          agent: 'ops',
          model: 'openai/gpt-4.1',
          subtask: false,
          custom: true,
        },
      },
    });

    await findDropdown(t('settings.commands.editor.select.name'))?.onChange?.('deploy');

    await findTextArea(t('settings.commands.editor.template.name'))?.onChange?.('Deploy the plugin after a clean build.');
    await findText(t('settings.commands.editor.description.name'))?.onChange?.('');
    await findText(t('settings.commands.editor.agent.name'))?.onChange?.('release-manager');
    await findText(t('settings.commands.editor.model.name'))?.onChange?.('');
    await findToggle(t('settings.commands.editor.subtask.name'))?.onChange?.(true);

    await findButton(t('settings.commands.editor.actions.save'))?.onClick?.();
    await flushAsync();

    expect(configManager.upsertCommandConfig).toHaveBeenCalledWith('deploy', {
      template: 'Deploy the plugin after a clean build.',
      description: undefined,
      agent: 'release-manager',
      model: undefined,
      subtask: true,
    });

    await findButton(t('settings.commands.editor.actions.delete'))?.onClick?.();

    expect(configManager.removeCommandConfig).toHaveBeenCalledWith('deploy');
  });

  it('rejects saves without a command template', async () => {
    const { configManager, onConfigChanged } = renderEditor();
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);

    await findText(t('settings.commands.editor.id.name'))?.onChange?.('review-tests');
    await findTextArea(t('settings.commands.editor.template.name'))?.onChange?.('   ');

    await findButton(t('settings.commands.editor.actions.save'))?.onClick?.();
    await flushAsync();

    expect(configManager.upsertCommandConfig).not.toHaveBeenCalled();
    expect(onConfigChanged).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.commands.editor.notice.templateRequired'));
  });
});
