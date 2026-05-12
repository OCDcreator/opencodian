/* eslint-disable max-lines */
import type { Agent as RuntimeAgent } from '@opencode-ai/sdk/v2/client';
import * as obsidian from 'obsidian';
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
interface SettingDescriptionRecord { desc: string; name: string; }

type AgentsSectionPlugin = Pick<OpenCodianPlugin, 'app' | 'openCodeService' | 'opencodeConfigManager' | 'saveSettings'>;

interface MockVaultAdapter {
  exists: jest.MockedFunction<(path: string) => Promise<boolean>>;
  list: jest.MockedFunction<(path: string) => Promise<{ files: string[]; folders: string[] }>>;
  mkdir: jest.MockedFunction<(path: string) => Promise<void>>;
  read: jest.MockedFunction<(path: string) => Promise<string>>;
  remove: jest.MockedFunction<(path: string) => Promise<void>>;
  stat: jest.MockedFunction<(path: string) => Promise<{ mtime: number } | null>>;
  write: jest.MockedFunction<(path: string, content: string) => Promise<void>>;
}

const dropdownRecords: DropdownRecord[] = [];
const toggleRecords: ToggleRecord[] = [];
const textRecords: TextRecord[] = [];
const textAreaRecords: TextAreaRecord[] = [];
const buttonRecords: ButtonRecord[] = [];
const settingDescriptionRecords: SettingDescriptionRecord[] = [];

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
  fileContents?: Record<string, string>;
  fileMtims?: Record<string, number>;
  listResults?: Record<string, { files: string[]; folders: string[] }>;
} = {}): AgentsSectionPlugin {
  const listResults = options.listResults ?? {};
  const fileContents = options.fileContents ?? {};
  const fileMtims = options.fileMtims ?? {};
  const adapter: MockVaultAdapter = {
    exists: jest.fn().mockResolvedValue(true),
    list: jest.fn().mockImplementation(async (path: string) => listResults[path] ?? { files: [], folders: [] }),
    mkdir: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockImplementation(async (path: string) => fileContents[path] ?? ''),
    remove: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockImplementation(async (path: string) => {
      const mtime = fileMtims[path];
      return typeof mtime === 'number' ? { mtime } : null;
    }),
    write: jest.fn().mockResolvedValue(undefined),
  };

  return {
    app: {
      vault: {
        adapter,
      },
    },
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
    saveSettings: jest.fn().mockResolvedValue(undefined),
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

function createTabbedSection(
  secondaryTabId: string,
  plugin = createPlugin(),
) {
  const section = new SettingsAgentsSection({
    plugin: plugin as unknown as OpenCodianPlugin,
    createSectionHeading,
  });
  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);
  section.attachTabbed(containerEl, secondaryTabId);
  return {
    containerEl,
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

function findSettingDescriptions(name: string): string[] {
  return settingDescriptionRecords
    .filter((record) => record.name === name)
    .map((record) => record.desc);
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  setLocale('en');
  document.body.innerHTML = '';
  dropdownRecords.length = 0;
  toggleRecords.length = 0;
  textRecords.length = 0;
  textAreaRecords.length = 0;
  buttonRecords.length = 0;
  settingDescriptionRecords.length = 0;

  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
    (this as Setting & { __settingName?: string }).__settingName = name;
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(
    this: Setting,
    desc: string | DocumentFragment | HTMLElement,
  ) {
    const text = typeof desc === 'string' ? desc : desc.textContent ?? '';
    const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
    const existing = settingDescriptionRecords.find((record) => record.name === name && record.desc === text);
    if (!existing) {
      settingDescriptionRecords.push({ name, desc: text });
    }
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

  it('invalidates chat agent autocomplete after subagent visibility changes through the settings runtime', async () => {
    const plugin = createPlugin({
      runtimeAgents: [
        createRuntimeAgent({
          name: 'plan',
          mode: 'subagent',
        }),
      ],
    });

    createSection(plugin);
    await flushAsync();

    await findToggle('plan')?.onChange?.(false);
    await flushAsync();

    expect(plugin.saveSettings).toHaveBeenCalledWith({
      syncService: false,
      reloadModels: false,
      syncConfig: false,
      applyUi: false,
    });
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

  it('shows system-agent and markdown source labels in the catalog', async () => {
    const plugin = createPlugin({
      runtimeAgents: [
        createRuntimeAgent({
          name: 'title',
          mode: 'primary',
          hidden: true,
          native: true,
        }),
      ],
      projectAgents: {
        researcher: {
          description: 'Workspace override',
        },
      },
      fileContents: {
        '.opencode/agents/researcher.md': 'Research the repo.',
      },
      listResults: {
        '.opencode/agents': { files: ['.opencode/agents/researcher.md'], folders: [] },
      },
    });

    createSection(plugin);
    await flushAsync();

    expect(findSettingDescriptions('title').some((desc) =>
      desc.includes(t('settings.agents.guard.readOnly'))
    )).toBe(true);
    expect(findSettingDescriptions('researcher').some((desc) =>
      desc.includes(t('settings.agents.catalog.source.markdownOverride'))
    )).toBe(true);
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

  it('blocks saving system-agent overrides until expert mode is enabled', async () => {
    const plugin = createPlugin();
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);

    createSection(plugin);
    await flushAsync();

    await findDropdown(t('settings.agents.editor.select.name'))?.onChange?.('');
    const idInput = textRecords.find((record) => record.name === t('settings.agents.editor.id.name'));
    await idInput?.onChange?.('title');
    await findButton(t('settings.agents.editor.actions.save'))?.onClick?.();
    await flushAsync();

    expect(plugin.opencodeConfigManager?.upsertAgentConfig).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(
      t('settings.agents.expert.blocked'),
    );
  });

  it('blocks deleting system-agent overrides until expert mode is enabled', async () => {
    const plugin = createPlugin({
      projectAgents: {
        title: {
          description: 'Override title agent',
          mode: 'primary',
        },
      },
    });
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);

    createSection(plugin);
    await flushAsync();

    await findDropdown(t('settings.agents.editor.select.name'))?.onChange?.('title');
    await findButton(t('settings.agents.editor.actions.delete'))?.onClick?.();
    await flushAsync();

    expect(plugin.opencodeConfigManager?.removeAgentConfig).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.agents.expert.blocked'));
  });
});

describe('SettingsAgentsSection tabbed workspace', () => {
  it('renders expert mode and workspace blocks in classic layout too', async () => {
    const plugin = createPlugin();

    const { containerEl } = createSection(plugin);
    await flushAsync();

    expect(findToggle(t('settings.agents.expert.name'))).toBeDefined();
    expect(containerEl.textContent).toContain(t('settings.agents.workspace.title'));
  });

  it('renders the expert toggle in the default tab and refreshes when toggled', async () => {
    const plugin = createPlugin({
      runtimeAgents: [createRuntimeAgent({ name: 'title', mode: 'primary', hidden: true })],
    });

    createTabbedSection('default', plugin);
    await flushAsync();

    const expertToggle = findToggle(t('settings.agents.expert.name'));
    expect(expertToggle?.control.setValue).toHaveBeenCalledWith(false);

    await expertToggle?.onChange?.(true);
    await flushAsync();

    expect(plugin.openCodeService.sdk.app.agents).toHaveBeenCalledTimes(2);
  });

  it('renders markdown workspace rows and supports create/delete actions', async () => {
    const plugin = createPlugin({
      runtimeAgents: [createRuntimeAgent({ name: 'researcher', mode: 'all' })],
      fileContents: {
        '.opencode/agents/researcher.md': '---\nmode: all\n---\nResearch the repo.',
      },
      fileMtims: {
        '.opencode/agents/researcher.md': 123,
      },
      listResults: {
        '.opencode/agents': { files: ['.opencode/agents/researcher.md'], folders: [] },
      },
    });

    const { containerEl } = createTabbedSection('workspace', plugin);
    await flushAsync();

    expect(containerEl.textContent).toContain(t('settings.agents.workspace.title'));
    expect(findSettingDescriptions('researcher').some((desc) =>
      desc.includes(t('settings.agents.workspace.scope.project'))
      && desc.includes(t('settings.agents.workspace.status.ok'))
      && desc.includes(t('settings.agents.workspace.status.runtimeSeen'))
    )).toBe(true);

    await findButton(t('settings.agents.workspace.actions.create'))?.onClick?.();
    await flushAsync();
    expect(plugin.app.vault.adapter.write).toHaveBeenCalled();

    await findButton(t('settings.agents.workspace.actions.delete'))?.onClick?.();
    await flushAsync();
    expect(plugin.app.vault.adapter.remove).toHaveBeenCalledWith('.opencode/agents/researcher.md');
  });
});
