import type { Agent as RuntimeAgent } from '@opencode-ai/sdk/v2/client';
import { Setting } from 'obsidian';

import type { OpencodeAgentConfigRecord } from '../../../../src/core/types';
import { SettingsAgentsSection } from '../../../../src/features/settings/SettingsAgentsSection';
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

type AgentsSectionPlugin = Pick<OpenCodianPlugin, 'openCodeService' | 'opencodeConfigManager'>;

const dropdownRecords: DropdownRecord[] = [];
const toggleRecords: ToggleRecord[] = [];

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

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('SettingsAgentsSection', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    dropdownRecords.length = 0;
    toggleRecords.length = 0;

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
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

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
    expect(findToggle('plan')?.control.setValue).toHaveBeenCalledWith(true);
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

  it('writes and cleans up project hidden overrides for subagents', async () => {
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

    await findToggle('plan')?.onChange?.(true);
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

    await findToggle('plan')?.onChange?.(false);
    await flushAsync();

    expect(restoredPlugin.opencodeConfigManager?.removeAgentConfig).toHaveBeenCalledWith('plan');
  });
});
