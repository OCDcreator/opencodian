import type { Agent as RuntimeAgent } from '@opencode-ai/sdk/v2/client';
import { Setting } from 'obsidian';

import type { OpencodeAgentConfigRecord } from '../../../../src/core/types';
import { SettingsAgentsSection } from '../../../../src/features/settings/SettingsAgentsSection';
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

type AgentsSectionPlugin = Pick<OpenCodianPlugin, 'openCodeService' | 'opencodeConfigManager'>;

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

function createRuntimeAgent(overrides: Partial<RuntimeAgent> & Pick<RuntimeAgent, 'name'>): RuntimeAgent {
  return {
    name: overrides.name,
    mode: overrides.mode ?? 'primary',
    native: overrides.native ?? true,
    hidden: overrides.hidden,
    description: overrides.description,
    permission: overrides.permission ?? [],
    options: overrides.options ?? {},
    color: overrides.color,
    model: overrides.model,
    prompt: overrides.prompt,
    variant: overrides.variant,
    topP: overrides.topP,
    temperature: overrides.temperature,
    steps: overrides.steps,
  };
}

function createPlugin(options: {
  runtimeAgents?: RuntimeAgent[];
  projectAgents?: OpencodeAgentConfigRecord;
  defaultAgent?: string | undefined;
} = {}): AgentsSectionPlugin {
  return {
    openCodeService: {
      sdk: {
        app: {
          agents: jest.fn().mockResolvedValue(options.runtimeAgents ?? []),
        },
      },
    },
    opencodeConfigManager: {
      getAgentConfig: jest.fn().mockResolvedValue(options.projectAgents ?? {}),
      getDefaultAgent: jest.fn().mockResolvedValue(options.defaultAgent),
      updateDefaultAgent: jest.fn().mockResolvedValue(undefined),
      upsertAgentConfig: jest.fn().mockResolvedValue(undefined),
      removeAgentConfig: jest.fn().mockResolvedValue(undefined),
    },
  } as unknown as AgentsSectionPlugin;
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function createSection(plugin = createPlugin()) {
  const section = new SettingsAgentsSection({
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

function findDropdown(name: string): DropdownRecord | undefined {
  return dropdownRecords.find((record) => record.name === name);
}

function findToggle(name: string): ToggleRecord | undefined {
  return toggleRecords.find((record) => record.name === name);
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

describe('SettingsAgentsSection catalog shell', () => {
  it('loads built-in and project agents into the default selection and subagent visibility controls', async () => {
    const plugin = createPlugin({
      runtimeAgents: [
        createRuntimeAgent({
          name: 'build',
          mode: 'primary',
          native: true,
          description: 'Builds things',
        }),
        createRuntimeAgent({
          name: 'plan',
          mode: 'subagent',
          native: true,
          description: 'Plans work',
        }),
        createRuntimeAgent({
          name: 'review',
          mode: 'all',
          native: false,
          description: 'Reviews changes',
        }),
      ],
      projectAgents: {
        plan: {
          hidden: true,
          description: 'Project planner',
        },
        design: {
          mode: 'primary',
          description: 'Project-only design agent',
        },
      },
      defaultAgent: 'design',
    });

    createSection(plugin);
    await flushAsync();

    const defaultDropdown = findDropdown(t('settings.agents.default.name'));
    expect(plugin.openCodeService.sdk.app.agents).toHaveBeenCalledTimes(1);
    expect(plugin.opencodeConfigManager?.getAgentConfig).toHaveBeenCalledTimes(1);
    expect(plugin.opencodeConfigManager?.getDefaultAgent).toHaveBeenCalledTimes(1);
    expect(defaultDropdown?.control.addOption).toHaveBeenCalledWith(
      '',
      t('settings.agents.default.followOpenCode'),
    );
    expect(defaultDropdown?.control.addOption).toHaveBeenCalledWith('build', 'build');
    expect(defaultDropdown?.control.addOption).toHaveBeenCalledWith('review', 'review');
    expect(defaultDropdown?.control.addOption).toHaveBeenCalledWith('design', 'design');
    expect(defaultDropdown?.control.addOption).not.toHaveBeenCalledWith('plan', 'plan');
    expect(defaultDropdown?.control.setValue).toHaveBeenLastCalledWith('design');
    expect(findToggle('plan')?.control.setValue).toHaveBeenCalledWith(false);
    expect(findToggle('build')).toBeUndefined();
    expect(findToggle('design')).toBeUndefined();
  });

  it('persists default-agent changes through the project config manager', async () => {
    const plugin = createPlugin({
      runtimeAgents: [
        createRuntimeAgent({
          name: 'build',
          mode: 'primary',
        }),
      ],
    });

    createSection(plugin);
    await flushAsync();

    const defaultDropdown = findDropdown(t('settings.agents.default.name'));

    await defaultDropdown?.onChange?.('build');
    await defaultDropdown?.onChange?.('');

    expect(plugin.opencodeConfigManager?.updateDefaultAgent).toHaveBeenNthCalledWith(1, 'build');
    expect(plugin.opencodeConfigManager?.updateDefaultAgent).toHaveBeenNthCalledWith(2, undefined);
  });

  it('writes and cleans up project hidden overrides for subagents through a positive visible toggle', async () => {
    const hiddenPlugin = createPlugin({
      runtimeAgents: [
        createRuntimeAgent({
          name: 'plan',
          mode: 'subagent',
        }),
      ],
    });

    createSection(hiddenPlugin);
    await flushAsync();

    await findToggle('plan')?.onChange?.(false);
    await flushAsync();

    expect(hiddenPlugin.opencodeConfigManager?.upsertAgentConfig).toHaveBeenCalledWith('plan', {
      hidden: true,
    });
    expect(hiddenPlugin.opencodeConfigManager?.removeAgentConfig).not.toHaveBeenCalled();

    dropdownRecords.length = 0;
    toggleRecords.length = 0;

    const restoredPlugin = createPlugin({
      runtimeAgents: [
        createRuntimeAgent({
          name: 'plan',
          mode: 'subagent',
        }),
      ],
      projectAgents: {
        plan: {
          hidden: true,
        },
      },
    });

    createSection(restoredPlugin);
    await flushAsync();

    await findToggle('plan')?.onChange?.(true);
    await flushAsync();

    expect(restoredPlugin.opencodeConfigManager?.removeAgentConfig).toHaveBeenCalledWith('plan');
  });

  it('wraps the catalog list in an internal scroll container', async () => {
    const plugin = createPlugin({
      runtimeAgents: [
        createRuntimeAgent({
          name: 'plan',
          mode: 'subagent',
        }),
      ],
    });

    const { containerEl } = createSection(plugin);
    await flushAsync();

    const scrollEl = containerEl.querySelector('.opencodian-agent-catalog-scroll');
    expect(scrollEl).not.toBeNull();
  });
});

describe('SettingsAgentsSection project agent editor', () => {
  it('edits the project disable flag without making disabled agents default-eligible', async () => {
    const plugin = createPlugin({
      runtimeAgents: [
        createRuntimeAgent({
          name: 'reviewer',
          mode: 'primary',
        }),
      ],
      projectAgents: {
        reviewer: {
          mode: 'primary',
          disable: true,
          hidden: true,
        },
      },
      defaultAgent: 'reviewer',
    });

    createSection(plugin);
    await flushAsync();

    const defaultDropdown = findDropdown(t('settings.agents.default.name'));
    expect(defaultDropdown?.control.addOption).not.toHaveBeenCalledWith('reviewer', 'reviewer');
    expect(defaultDropdown?.control.addOption).toHaveBeenCalledWith(
      'reviewer',
      t('settings.agents.default.unavailable', { id: 'reviewer' }),
    );

    await findDropdown(t('settings.agents.editor.select.name'))?.onChange?.('reviewer');

    const disableToggle = findToggle(t('settings.agents.editor.disable.name'));
    expect(disableToggle).toBeDefined();
    expect(disableToggle?.control.setValue).toHaveBeenLastCalledWith(true);

    await disableToggle?.onChange?.(false);
    await findButton(t('settings.agents.editor.actions.save'))?.onClick?.();
    await flushAsync();

    expect(plugin.opencodeConfigManager?.upsertAgentConfig).toHaveBeenCalledWith('reviewer', {
      mode: 'primary',
      description: undefined,
      prompt: undefined,
      model: undefined,
      temperature: undefined,
      top_p: undefined,
      steps: undefined,
      color: undefined,
      disable: undefined,
    });
  });
});
