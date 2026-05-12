/* eslint-disable max-lines */
import type { Command as RuntimeCommand } from '@opencode-ai/sdk/v2/client';
import { Setting } from 'obsidian';

import { getCommandScopedAgentId } from '../../../../src/core/config/commandScopedAgent';
import type {
  OpencodeAgentConfigRecord,
  OpencodeCommandConfigRecord,
  SlashCommandSkillMode,
} from '../../../../src/core/types';
import { SettingsCommandsSection } from '../../../../src/features/settings/SettingsCommandsSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

interface MockToggleControl {
  setValue: jest.MockedFunction<(value: boolean) => MockToggleControl>;
  onChange: jest.MockedFunction<(callback: (value: boolean) => void | Promise<void>) => MockToggleControl>;
}

interface MockDropdownControl {
  addOption: jest.MockedFunction<(value: string, label: string) => MockDropdownControl>;
  setValue: jest.MockedFunction<(value: string) => MockDropdownControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>;
  selectEl: HTMLSelectElement;
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

interface ToggleRecord {
  control: MockToggleControl;
  description?: string;
  name: string;
  onChange?: (value: boolean) => void | Promise<void>;
}

interface DropdownRecord {
  control: MockDropdownControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
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

type CommandsSectionConfigManager = Pick<
  NonNullable<OpenCodianPlugin['opencodeConfigManager']>,
  'getAgentConfig' | 'getCommandConfig' | 'upsertCommandConfig' | 'removeCommandConfig'
>;

type CommandsSectionPlugin = Pick<
  OpenCodianPlugin,
  'openCodeService' | 'saveSettings' | 'settings'
> & {
  opencodeConfigManager: CommandsSectionConfigManager;
};

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

function createRuntimeCommand(
  overrides: Partial<RuntimeCommand> & Pick<RuntimeCommand, 'name'>,
): RuntimeCommand {
  return {
    name: overrides.name,
    description: overrides.description,
    agent: overrides.agent,
    model: overrides.model,
    source: overrides.source ?? 'command',
    template: overrides.template ?? `/${overrides.name}`,
    subtask: overrides.subtask,
    hints: overrides.hints ?? [],
  };
}

function createPlugin(options: {
  projectAgents?: OpencodeAgentConfigRecord;
  runtimeCommands?: RuntimeCommand[];
  projectCommands?: OpencodeCommandConfigRecord;
  hiddenSlashCommands?: string[];
  slashCommandSkillMode?: SlashCommandSkillMode;
} = {}): CommandsSectionPlugin {
  return {
    openCodeService: {
      sdk: {
        command: {
          list: jest.fn().mockResolvedValue(options.runtimeCommands ?? []),
        },
      },
    },
    opencodeConfigManager: {
      getCommandConfig: jest.fn().mockResolvedValue(options.projectCommands ?? {}),
      getAgentConfig: jest.fn().mockResolvedValue(options.projectAgents ?? {}),
      upsertCommandConfig: jest.fn().mockResolvedValue(undefined),
      removeCommandConfig: jest.fn().mockResolvedValue(undefined),
    },
    settings: {
      hiddenSlashCommands: [...(options.hiddenSlashCommands ?? [])],
      slashCommandSkillMode: options.slashCommandSkillMode ?? 'direct',
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  } as unknown as CommandsSectionPlugin;
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function createSection(plugin = createPlugin()) {
  const section = new SettingsCommandsSection({
    plugin: plugin as unknown as OpenCodianPlugin,
    createSectionHeading,
  });
  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);
  section.attach(containerEl);
  return {
    containerEl,
    plugin,
    section,
  };
}

function findToggle(name: string): ToggleRecord | undefined {
  return toggleRecords.find((record) => record.name === name);
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
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(
    this: Setting,
    desc: string | DocumentFragment | HTMLElement,
  ) {
    (this as Setting & { __settingDesc?: string }).__settingDesc =
      typeof desc === 'string' ? desc : desc.textContent ?? '';
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
    record.description = (this as Setting & { __settingDesc?: string }).__settingDesc;
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
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SettingsCommandsSection catalog shell', () => {
  it('loads runtime and project commands into slash visibility controls', async () => {
    const plugin = createPlugin({
      runtimeCommands: [
        createRuntimeCommand({
          name: 'init',
          description: 'Guided setup',
        }),
        createRuntimeCommand({
          name: 'review',
          description: 'Review changes',
          subtask: true,
        }),
        createRuntimeCommand({
          name: 'mcp-prompt',
          source: 'mcp',
          description: 'Should stay out of the command catalog shell',
        }),
      ],
      projectCommands: {
        review: {
          description: 'Project review override',
        },
        deploy: {
          description: 'Project-only deploy command',
          agent: 'ops',
        },
      },
      hiddenSlashCommands: ['review'],
    });

    createSection(plugin);
    await flushAsync();

    expect(plugin.openCodeService.sdk.command.list).toHaveBeenCalledTimes(1);
    expect(plugin.opencodeConfigManager?.getCommandConfig).toHaveBeenCalledTimes(1);
    expect(plugin.opencodeConfigManager?.getAgentConfig).toHaveBeenCalledTimes(1);
    expect(findToggle('/init')?.control.setValue).toHaveBeenCalledWith(true);
    expect(findToggle('/review')?.control.setValue).toHaveBeenCalledWith(false);
    expect(findToggle('/deploy')?.control.setValue).toHaveBeenCalledWith(true);
    expect(findToggle('/mcp-prompt')).toBeUndefined();
  });

  it('persists hidden slash command ids through plugin settings', async () => {
    const plugin = createPlugin({
      runtimeCommands: [
        createRuntimeCommand({ name: 'init' }),
        createRuntimeCommand({ name: 'review' }),
      ],
      hiddenSlashCommands: ['review', 'review'],
    });

    createSection(plugin);
    await flushAsync();

    await findToggle('/init')?.onChange?.(false);
    await flushAsync();

    expect(plugin.settings.hiddenSlashCommands).toEqual(['init', 'review']);
    expect(plugin.saveSettings).toHaveBeenCalledWith({
      syncConfig: false,
      reloadModels: false,
      applyUi: false,
    });

    await findToggle('/review')?.onChange?.(true);
    await flushAsync();

    expect(plugin.settings.hiddenSlashCommands).toEqual(['init']);
  });

  it('keeps the command catalog scroll position when visibility toggles refresh the list', async () => {
    const plugin = createPlugin({
      runtimeCommands: [
        createRuntimeCommand({ name: 'init' }),
        createRuntimeCommand({ name: 'review' }),
      ],
    });

    const { containerEl } = createSection(plugin);
    await flushAsync();

    const catalogScrollEl = containerEl.querySelector<HTMLElement>('.opencodian-command-catalog-scroll');
    expect(catalogScrollEl).not.toBeNull();
    catalogScrollEl!.scrollTop = 180;

    await findToggle('/init')?.onChange?.(false);
    await flushAsync();

    expect(catalogScrollEl?.scrollTop).toBe(180);
  });

  it('persists the slash command skill invocation mode from the commands settings', async () => {
    const plugin = createPlugin({
      slashCommandSkillMode: 'direct',
    });

    createSection(plugin);
    await flushAsync();

    const dropdown = dropdownRecords.find((record) =>
      record.name === t('settings.commands.skillMode.name')
    );

    expect(dropdown?.control.setValue).toHaveBeenCalledWith('direct');
    expect(dropdown?.control.addOption).toHaveBeenCalledWith(
      'direct',
      t('settings.commands.skillMode.option.direct'),
    );
    expect(dropdown?.control.addOption).toHaveBeenCalledWith(
      'skills-command',
      t('settings.commands.skillMode.option.skillsCommand'),
    );

    await dropdown?.onChange?.('skills-command');

    expect(plugin.settings.slashCommandSkillMode).toBe('skills-command');
    expect(plugin.saveSettings).toHaveBeenCalledWith({
      syncConfig: false,
      reloadModels: false,
      applyUi: false,
    });
  });

  it('prefills command-local sampling from generated hidden agents without exposing the agent id', async () => {
    const scopedAgentId = getCommandScopedAgentId('review');
    const plugin = createPlugin({
      projectCommands: {
        review: {
          template: 'Review changes',
          agent: scopedAgentId,
        },
      },
      projectAgents: {
        [scopedAgentId]: {
          hidden: true,
          mode: 'primary',
          temperature: 0.2,
          top_p: 0.85,
          options: {
            opencodianCommand: {
              kind: 'slash-command-sampling',
              commandId: 'review',
              baseAgent: 'reviewer',
            },
          },
        },
      },
    });

    createSection(plugin);
    await flushAsync();

    await dropdownRecords.find((record) => record.name === t('settings.commands.editor.select.name'))?.onChange?.('review');

    expect(textRecords.find((record) => record.name === t('settings.commands.editor.agent.name'))?.control.setValue)
      .toHaveBeenLastCalledWith('reviewer');
    expect(textRecords.find((record) => record.name === t('settings.commands.editor.temperature.name'))?.control.setValue)
      .toHaveBeenLastCalledWith('0.2');
    expect(textRecords.find((record) => record.name === t('settings.commands.editor.topP.name'))?.control.setValue)
      .toHaveBeenLastCalledWith('0.85');
  });

  it('describes project-only commands as saved config that is not available in the current runtime yet', async () => {
    const plugin = createPlugin({
      projectCommands: {
        deploy: {
          description: 'Project-only deploy command',
          agent: 'ops',
          template: 'Deploy the plugin.',
        },
      },
    });

    createSection(plugin);
    await flushAsync();

    expect(findToggle('/deploy')?.description).toContain(
      'Saved in project config only; not available in the current runtime yet.',
    );
  });

  it('renders skill entries with `/skills <skill>` semantics when skill mode uses the prefix flow', async () => {
    const plugin = createPlugin({
      runtimeCommands: [
        createRuntimeCommand({
          name: 'summarize-notes',
          source: 'skill',
          description: 'Summarize the current note',
        }),
      ],
      slashCommandSkillMode: 'skills-command',
    });

    createSection(plugin);
    await flushAsync();

    const skillToggle = findToggle('/skills summarize-notes');

    expect(skillToggle?.control.setValue).toHaveBeenCalledWith(true);
    expect(findToggle('/summarize-notes')).toBeUndefined();
    expect(skillToggle?.description).toContain('Visible in `/skills` browser');
    expect(skillToggle?.description).toContain('Run with `/skills summarize-notes`');
  });
});
