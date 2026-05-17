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

interface CatalogCard {
  card: HTMLElement;
  name: string;
  toggleCheckbox: HTMLInputElement;
  description: string;
  descriptionEl: HTMLElement | null;
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

/** Find a catalog card by command display name (e.g. `/init`, `/skills summarize-notes). */
function findCard(containerEl: HTMLElement, name: string): CatalogCard | undefined {
  const cards = containerEl.querySelectorAll<HTMLElement>('.opencodian-cmd-catalog-card');
  for (const card of cards) {
    const nameEl = card.querySelector<HTMLElement>('.opencodian-cmd-catalog-card-name');
    if (!nameEl) continue;
    // The name element has text "/cmdName" plus chip spans as children.
    // We need to match only the direct text content (first text node).
    const firstTextNode = Array.from(nameEl.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    const displayId = firstTextNode?.textContent?.trim();
    if (displayId === name) {
      const toggleCheckbox = card.querySelector<HTMLInputElement>('.opencodian-cmd-catalog-toggle-checkbox');
      const descEl = card.querySelector<HTMLElement>('.opencodian-cmd-catalog-card-desc');
      return {
        card,
        name,
        toggleCheckbox: toggleCheckbox ?? document.createElement('input'),
        description: descEl?.textContent ?? '',
        descriptionEl: descEl,
      };
    }
  }
  return undefined;
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function setupSettingSpies(): void {
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
}

beforeEach(() => {
  setLocale('en');
  document.body.innerHTML = '';
  dropdownRecords.length = 0;
  textRecords.length = 0;
  textAreaRecords.length = 0;
  buttonRecords.length = 0;
  setupSettingSpies();
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

// eslint-disable-next-line max-lines-per-function
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

    const { containerEl } = createSection(plugin);
    await flushAsync();

    expect(plugin.openCodeService.sdk.command.list).toHaveBeenCalledTimes(1);
    expect(plugin.opencodeConfigManager?.getCommandConfig).toHaveBeenCalledTimes(1);
    expect(plugin.opencodeConfigManager?.getAgentConfig).toHaveBeenCalledTimes(1);

    // init is visible (toggle checked)
    const initToggle = findCard(containerEl, '/init')?.toggleCheckbox;
    expect(initToggle?.checked).toBe(true);
    expect(initToggle?.getAttribute('role')).toBe('switch');
    expect(initToggle?.getAttribute('aria-checked')).toBe('true');
    expect(initToggle?.parentElement?.classList.contains('checkbox-container')).toBe(true);
    expect(initToggle?.parentElement?.classList.contains('is-enabled')).toBe(true);
    // review is hidden (toggle unchecked)
    const reviewToggle = findCard(containerEl, '/review')?.toggleCheckbox;
    expect(reviewToggle?.checked).toBe(false);
    expect(reviewToggle?.getAttribute('role')).toBe('switch');
    expect(reviewToggle?.getAttribute('aria-checked')).toBe('false');
    expect(reviewToggle?.parentElement?.classList.contains('is-enabled')).toBe(false);
    // deploy is visible (project-only, not hidden)
    expect(findCard(containerEl, '/deploy')?.toggleCheckbox.checked).toBe(true);
    // mcp-prompt should not appear
    expect(findCard(containerEl, '/mcp-prompt')).toBeUndefined();
  });

  it('persists hidden slash command ids through plugin settings', async () => {
    const plugin = createPlugin({
      runtimeCommands: [
        createRuntimeCommand({ name: 'init' }),
        createRuntimeCommand({ name: 'review' }),
      ],
      hiddenSlashCommands: ['review', 'review'],
    });

    const { containerEl } = createSection(plugin);
    await flushAsync();

    // Toggle init off (hide it)
    const initCard = findCard(containerEl, '/init');
    expect(initCard).toBeDefined();
    initCard!.toggleCheckbox.checked = false;
    initCard!.toggleCheckbox.dispatchEvent(new Event('change'));
    await flushAsync();

    expect(plugin.settings.hiddenSlashCommands).toEqual(['init', 'review']);
    expect(initCard!.toggleCheckbox.parentElement?.classList.contains('is-enabled')).toBe(false);
    expect(plugin.saveSettings).toHaveBeenCalledWith({
      syncConfig: false,
      reloadModels: false,
      applyUi: false,
    });

    // Toggle review on (unhide it)
    const reviewCard = findCard(containerEl, '/review');
    expect(reviewCard).toBeDefined();
    reviewCard!.toggleCheckbox.checked = true;
    reviewCard!.toggleCheckbox.dispatchEvent(new Event('change'));
    await flushAsync();

    expect(plugin.settings.hiddenSlashCommands).toEqual(['init']);
  });

  it('renders the command catalog scroll container', async () => {
    const plugin = createPlugin({
      runtimeCommands: [
        createRuntimeCommand({ name: 'init' }),
        createRuntimeCommand({ name: 'review' }),
      ],
    });

    const { containerEl } = createSection(plugin);
    await flushAsync();

    const catalogScrollEl = containerEl.querySelector<HTMLElement>('.opencodian-cmd-catalog-scroll');
    expect(catalogScrollEl).not.toBeNull();
    expect(
      catalogScrollEl?.closest('.opencodian-plugin-block')?.querySelector('.opencodian-settings-subsection-heading')?.textContent,
    ).toBe(t('settings.commands.catalog.title'));
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

  it('describes project-only commands with an unavailable chip', async () => {
    const plugin = createPlugin({
      projectCommands: {
        deploy: {
          description: 'Project-only deploy command',
          agent: 'ops',
          template: 'Deploy the plugin.',
        },
      },
    });

    const { containerEl } = createSection(plugin);
    await flushAsync();

    const card = findCard(containerEl, '/deploy');
    expect(card).toBeDefined();
    // Project-only commands should have an unavailable chip
    const unavailableChip = card?.card.querySelector('.opencodian-cmd-catalog-chip-unavailable');
    expect(unavailableChip).not.toBeNull();
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

    const { containerEl } = createSection(plugin);
    await flushAsync();

    const skillCard = findCard(containerEl, '/skills summarize-notes');
    expect(skillCard).toBeDefined();
    expect(skillCard?.toggleCheckbox.checked).toBe(true);
    expect(findCard(containerEl, '/summarize-notes')).toBeUndefined();

    // Skill source chip should be present
    const skillChip = skillCard?.card.querySelector('.opencodian-cmd-catalog-chip-source-skill');
    expect(skillChip).not.toBeNull();
  });

  it('filters commands by source type', async () => {
    const plugin = createPlugin({
      runtimeCommands: [
        createRuntimeCommand({ name: 'init', source: 'command' }),
        createRuntimeCommand({ name: 'build', source: 'skill' }),
      ],
    });

    const { containerEl } = createSection(plugin);
    await flushAsync();

    // Both should be visible initially
    expect(findCard(containerEl, '/init')).toBeDefined();
    expect(findCard(containerEl, '/build')).toBeDefined();

    // Find the Skills pill specifically
    const pills = containerEl.querySelectorAll<HTMLButtonElement>('.opencodian-cmd-catalog-filter-pill');
    const skillsPill = Array.from(pills).find((p) => p.textContent?.trim() === t('settings.commands.catalog.filterSkills'));
    expect(skillsPill).toBeDefined();
    skillsPill?.click();
    await flushAsync();

    // Only skill should be visible now
    expect(findCard(containerEl, '/init')).toBeUndefined();
    expect(findCard(containerEl, '/build')).toBeDefined();
  });

  it('shows empty state when no commands match filter', async () => {
    const plugin = createPlugin({
      runtimeCommands: [
        createRuntimeCommand({ name: 'init', source: 'command' }),
      ],
    });

    const { containerEl } = createSection(plugin);
    await flushAsync();

    // Click the Skills filter pill to filter to skills only
    const pills = containerEl.querySelectorAll<HTMLButtonElement>('.opencodian-cmd-catalog-filter-pill');
    const skillsPill = Array.from(pills).find((p) => p.textContent?.trim() === t('settings.commands.catalog.filterSkills'));
    skillsPill?.click();
    await flushAsync();

    const emptyEl = containerEl.querySelector('.opencodian-cmd-catalog-empty');
    expect(emptyEl).not.toBeNull();
    expect(emptyEl?.textContent).toBe(t('settings.commands.catalog.noResults'));
  });

  it('searches commands by id and description', async () => {
    const plugin = createPlugin({
      runtimeCommands: [
        createRuntimeCommand({ name: 'init', description: 'Guided setup' }),
        createRuntimeCommand({ name: 'review', description: 'Review changes' }),
      ],
    });

    const { containerEl } = createSection(plugin);
    await flushAsync();

    const searchInput = containerEl.querySelector<HTMLInputElement>('.opencodian-cmd-catalog-search-input');
    expect(searchInput).not.toBeNull();

    searchInput!.value = 'Guided';
    searchInput!.dispatchEvent(new Event('input'));
    await flushAsync();

    expect(findCard(containerEl, '/init')).toBeDefined();
    expect(findCard(containerEl, '/review')).toBeUndefined();
  });

  it('supports multi-select batch enable/disable', async () => {
    const plugin = createPlugin({
      runtimeCommands: [
        createRuntimeCommand({ name: 'init' }),
        createRuntimeCommand({ name: 'review' }),
      ],
      hiddenSlashCommands: ['init', 'review'],
    });

    const { containerEl } = createSection(plugin);
    await flushAsync();

    // Both toggles should be unchecked (hidden)
    expect(findCard(containerEl, '/init')?.toggleCheckbox.checked).toBe(false);
    expect(findCard(containerEl, '/review')?.toggleCheckbox.checked).toBe(false);

    // Check both checkboxes for multi-select
    const initCard = findCard(containerEl, '/init');
    const reviewCard = findCard(containerEl, '/review');

    const initCb = initCard?.card.querySelector<HTMLInputElement>('input[type="checkbox"]:not(.opencodian-cmd-catalog-toggle-checkbox)');
    const reviewCb = reviewCard?.card.querySelector<HTMLInputElement>('input[type="checkbox"]:not(.opencodian-cmd-catalog-toggle-checkbox)');

    initCb!.checked = true;
    initCb!.dispatchEvent(new Event('change'));
    await flushAsync();

    reviewCb!.checked = true;
    reviewCb!.dispatchEvent(new Event('change'));
    await flushAsync();

    // Batch enable button should appear
    const enableBtn = containerEl.querySelector<HTMLButtonElement>('.opencodian-cmd-catalog-batch-btn');
    expect(enableBtn).not.toBeNull();
    expect(enableBtn?.textContent).toBe(t('settings.commands.catalog.batchEnable'));

    enableBtn!.click();
    await flushAsync();

    expect(plugin.settings.hiddenSlashCommands).toEqual([]);
  });

  it('does not render an empty batch bar before commands are selected', async () => {
    const plugin = createPlugin({
      runtimeCommands: [
        createRuntimeCommand({ name: 'init' }),
      ],
    });

    const { containerEl } = createSection(plugin);
    await flushAsync();

    expect(containerEl.querySelector('.opencodian-cmd-catalog-batch-bar')).toBeNull();

    const initCard = findCard(containerEl, '/init');
    const initCb = initCard?.card.querySelector<HTMLInputElement>('.opencodian-cmd-catalog-select-checkbox');

    initCb!.checked = true;
    initCb!.dispatchEvent(new Event('change'));
    await flushAsync();

    expect(containerEl.querySelector('.opencodian-cmd-catalog-batch-bar')).not.toBeNull();
  });
});
