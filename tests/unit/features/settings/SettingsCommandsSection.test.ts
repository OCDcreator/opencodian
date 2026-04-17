import type { Command as RuntimeCommand } from '@opencode-ai/sdk/v2/client';
import { Setting } from 'obsidian';

import type { OpencodeCommandConfigRecord } from '../../../../src/core/types';
import { SettingsCommandsSection } from '../../../../src/features/settings/SettingsCommandsSection';
import { setLocale } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

interface MockToggleControl {
  setValue: jest.MockedFunction<(value: boolean) => MockToggleControl>;
  onChange: jest.MockedFunction<(callback: (value: boolean) => void | Promise<void>) => MockToggleControl>;
}

interface ToggleRecord {
  control: MockToggleControl;
  name: string;
  onChange?: (value: boolean) => void | Promise<void>;
}

type CommandsSectionPlugin = Pick<
  OpenCodianPlugin,
  'openCodeService' | 'opencodeConfigManager' | 'saveSettings' | 'settings'
>;

const toggleRecords: ToggleRecord[] = [];

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
  runtimeCommands?: RuntimeCommand[];
  projectCommands?: OpencodeCommandConfigRecord;
  hiddenSlashCommands?: string[];
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
    },
    settings: {
      hiddenSlashCommands: [...(options.hiddenSlashCommands ?? [])],
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
  toggleRecords.length = 0;

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
});
