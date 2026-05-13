/* eslint-disable max-lines, max-lines-per-function */
import { requestUrl, Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsAcpSection } from '../../../../src/features/settings/SettingsAcpSection';
import { SettingsSkillSection } from '../../../../src/features/settings/SettingsSkillSection';
import { SettingsToolSection } from '../../../../src/features/settings/SettingsToolSection';
import { setLocale } from '../../../../src/i18n';

const mockRequestUrl = requestUrl as jest.Mock;

interface MockDropdownControl {
  addOption: jest.MockedFunction<(value: string, label: string) => MockDropdownControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>;
  setValue: jest.MockedFunction<(value: string) => MockDropdownControl>;
}

interface DropdownRecord {
  control: MockDropdownControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}

interface MockButtonControl {
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
  setButtonText: jest.MockedFunction<(text: string) => MockButtonControl>;
}

interface ButtonRecord {
  control: MockButtonControl;
  text: string;
  onClick?: () => void | Promise<void>;
}

const buttonRecords: ButtonRecord[] = [];
const dropdownRecords: DropdownRecord[] = [];

function createPlugin(overrides: Record<string, unknown> = {}) {
  return {
    app: {
      vault: {
        adapter: {
          basePath: '/test-vault',
          exists: jest.fn().mockResolvedValue(true),
          mkdir: jest.fn().mockResolvedValue(undefined),
          remove: jest.fn().mockResolvedValue(undefined),
          write: jest.fn().mockResolvedValue(undefined),
        },
      },
    },
    settings: {
      ...DEFAULT_SETTINGS,
      server: DEFAULT_SETTINGS.server,
      acpAgents: [],
      ...overrides,
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    openCodeService: {
      checkHealth: jest.fn().mockResolvedValue(true),
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
    },
    opencodeConfigManager: {
      clearSkillPermissionPattern: jest.fn().mockResolvedValue(undefined),
      clearToolPermission: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue({ permission: 'allow' }),
      setToolPermission: jest.fn().mockResolvedValue(undefined),
      setSkillPermissionPattern: jest.fn().mockResolvedValue(undefined),
    },
    openCodeCatalogStateStore: {
      getToolCatalogSnapshot: jest.fn(() => ({ registryToolIds: ['custom.exec'] })),
      classifyToolIds: jest.fn(() => ({ builtin: [], custom: ['custom.exec'] })),
    },
  };
}

function createDropdownRecord(name: string): DropdownRecord {
  const record: DropdownRecord = {
    name,
    control: {
      addOption: jest.fn(),
      onChange: jest.fn(),
      setValue: jest.fn(),
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

function createButtonRecord(): ButtonRecord {
  const record: ButtonRecord = {
    text: '',
    control: {
      onClick: jest.fn(),
      setButtonText: jest.fn(),
    },
  };
  record.control.setButtonText.mockImplementation((text) => {
    record.text = text;
    return record.control;
  });
  record.control.onClick.mockImplementation((callback) => {
    record.onClick = callback;
    return record.control;
  });
  return record;
}

function createHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  return containerEl.createEl('h3', { text: title });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('settings Skills, Tools, and ACP layout surfaces', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    buttonRecords.length = 0;
    dropdownRecords.length = 0;
    mockRequestUrl.mockReset();
    jest.restoreAllMocks();
    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(
      this: Setting,
      name: string,
    ) {
      (this as Setting & { __settingName?: string }).__settingName = name;
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
    jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
      this: Setting,
      callback: (control: MockButtonControl) => unknown,
    ) {
      const record = createButtonRecord();
      buttonRecords.push(record);
      callback(record.control);
      return this;
    });
  });

  it('renders Skills as separate control and source sections', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        skills: [
          {
            name: 'reviewer',
            description: 'Reviews local changes',
            location: 'builtin',
            content: '# Reviewer\n- Inspect diffs',
          },
        ],
      },
      text: '',
    });
    const plugin = createPlugin();
    const containerEl = document.createElement('div');

    new SettingsSkillSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(containerEl, 'external');
    await flushPromises();

    expect(containerEl.querySelector('.opencodian-skill-settings-shell')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-skill-control-panel .opencodian-skill-toolbar')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-skill-source-section')?.getAttribute('data-skill-source')).toBe(
      'builtin',
    );
    const requestedUrl = new URL(mockRequestUrl.mock.calls[0]?.[0]?.url);
    expect(requestedUrl.pathname).toBe('/skill');
    expect(requestedUrl.searchParams.get('directory')).toBe('/test-vault');
    expect(containerEl.querySelector('.opencodian-skill-count')?.textContent).toBe('1 items');
    expect(containerEl.querySelector('.opencodian-skill-description')?.textContent).toBe('Reviews local changes');
  });

  it('uses inherited skill permissions and restarts the local service after permission writes', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        skills: [
          {
            name: 'reviewer',
            description: 'Reviews local changes',
            location: 'builtin',
            content: '# Reviewer',
          },
        ],
      },
      text: '',
    });
    const plugin = createPlugin();
    const containerEl = document.createElement('div');

    new SettingsSkillSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(containerEl, 'external');
    await flushPromises();

    const defaultPermissionSelect = containerEl.querySelector<HTMLSelectElement>('.opencodian-skill-permission-select');
    const skillPermissionSelect = containerEl.querySelector<HTMLSelectElement>('.opencodian-skill-row-permission-select');
    expect(defaultPermissionSelect?.value).toBe('inherit');
    expect(Array.from(defaultPermissionSelect?.options ?? []).map((option) => option.text)).toContain('Inherit global');
    expect(containerEl.querySelector('.opencodian-skill-permission-global-status')?.textContent).toBe(
      'Current global permission: Allow loading',
    );
    expect(Array.from(skillPermissionSelect?.options ?? []).map((option) => option.text)).toContain('Follow default');
    expect(skillPermissionSelect?.value).toBe('inherit');

    defaultPermissionSelect!.value = 'ask';
    defaultPermissionSelect!.dispatchEvent(new Event('change'));
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(plugin.opencodeConfigManager.setToolPermission).toHaveBeenCalledWith('skill', 'ask');
    expect(plugin.openCodeService.stop).toHaveBeenCalledTimes(1);
    expect(plugin.openCodeService.start).toHaveBeenCalledTimes(1);

    skillPermissionSelect!.value = 'deny';
    skillPermissionSelect!.dispatchEvent(new Event('change'));
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(plugin.opencodeConfigManager.setSkillPermissionPattern).toHaveBeenCalledWith('reviewer', 'deny');
    expect(plugin.openCodeService.stop).toHaveBeenCalledTimes(2);
    expect(plugin.openCodeService.start).toHaveBeenCalledTimes(2);
  });

  it('shows delete only for current-vault project skills', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        skills: [
          {
            name: 'project-skill',
            description: 'Project owned',
            location: '.opencode/skills/project-skill/SKILL.md',
            content: '# Project',
          },
          {
            name: 'builtin-skill',
            description: 'Runtime owned',
            location: 'builtin',
            content: '# Builtin',
          },
        ],
      },
      text: '',
    });
    const plugin = createPlugin();
    const containerEl = document.createElement('div');

    new SettingsSkillSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(containerEl, 'project');
    await flushPromises();

    expect(containerEl.querySelectorAll('.opencodian-skill-row-delete-action')).toHaveLength(1);
    expect(containerEl.querySelector('.opencodian-skill-row-delete-action')?.textContent).toBe('Delete');
  });

  it('renders project and external skill pages based on the settings secondary tab', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        skills: [
          {
            name: 'project-one',
            description: 'Project owned',
            location: '.opencode/skills/project-one/SKILL.md',
            content: '# Project one',
          },
          {
            name: 'project-two',
            description: 'Project owned',
            location: '/test-vault/.opencode/skills/project-two/SKILL.md',
            content: '# Project two',
          },
          {
            name: 'builtin-skill',
            description: 'Runtime owned',
            location: 'builtin',
            content: '# Builtin',
          },
        ],
      },
      text: '',
    });
    const plugin = createPlugin();
    const containerEl = document.createElement('div');

    new SettingsSkillSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(containerEl, 'project');
    await flushPromises();

    expect(containerEl.querySelectorAll('.opencodian-skill-tab')).toHaveLength(0);
    expect(containerEl.querySelectorAll('.opencodian-skill-card')).toHaveLength(2);
    expect(containerEl.querySelector('.opencodian-skill-bulk-delete-action')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-skill-bulk-bar .opencodian-skill-refresh-action')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-skill-toolbar .opencodian-skill-create-action')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-skill-toolbar .opencodian-skill-refresh-action')).toBeNull();

    containerEl.empty();
    new SettingsSkillSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(containerEl, 'external');
    await flushPromises();

    expect(containerEl.querySelectorAll('.opencodian-skill-card')).toHaveLength(1);
    expect(containerEl.querySelector('.opencodian-skill-card strong')?.textContent).toBe('builtin-skill');
    expect(containerEl.querySelector('.opencodian-skill-bulk-delete-action')).toBeNull();
    expect(containerEl.querySelector('.opencodian-skill-bulk-bar .opencodian-skill-refresh-action')).toBeNull();
    expect(containerEl.querySelector('.opencodian-skill-bulk-permission-select')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-skill-toolbar .opencodian-skill-create-action')).toBeNull();
    expect(containerEl.querySelector('.opencodian-skill-toolbar .opencodian-skill-refresh-action')).not.toBeNull();
  });

  it('places project bulk permission controls left of select refresh and delete actions', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        skills: [
          {
            name: 'project-one',
            description: 'Project owned',
            location: '.opencode/skills/project-one/SKILL.md',
            content: '# Project one',
          },
        ],
      },
      text: '',
    });
    const plugin = createPlugin();
    const containerEl = document.createElement('div');

    new SettingsSkillSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(containerEl, 'project');
    await flushPromises();

    const bulkBar = containerEl.querySelector('.opencodian-skill-bulk-bar');
    const permissionGroup = bulkBar?.querySelector('.opencodian-skill-bulk-permission-group');
    const actions = bulkBar?.querySelector('.opencodian-skill-bulk-actions');
    expect(bulkBar?.children[0]).toBe(permissionGroup);
    expect(bulkBar?.children[1]).toBe(actions);
    expect(bulkBar?.querySelector('.opencodian-skill-bulk-apply-action')).toBeNull();
    expect(permissionGroup?.querySelector('.opencodian-skill-bulk-permission-select')).not.toBeNull();
    expect(actions?.querySelector('.opencodian-skill-bulk-select-all')).not.toBeNull();
    expect(Array.from(actions?.querySelectorAll('button') ?? []).map((button) => button.textContent)).toEqual([
      'Refresh',
      'Delete 0',
    ]);

    actions?.querySelector<HTMLButtonElement>('.opencodian-skill-refresh-action')?.click();
    await flushPromises();
    expect(plugin.openCodeService.stop).toHaveBeenCalledTimes(1);
    expect(plugin.openCodeService.start).toHaveBeenCalledTimes(1);
  });

  it('lets users open the empty project skills tab when only external skills exist', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        skills: [
          {
            name: 'builtin-skill',
            description: 'Runtime owned',
            location: 'builtin',
            content: '# Builtin',
          },
        ],
      },
      text: '',
    });
    const plugin = createPlugin();
    const containerEl = document.createElement('div');

    new SettingsSkillSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(containerEl, 'project');
    await flushPromises();

    expect(containerEl.querySelector('.opencodian-settings-inline-empty')?.textContent).toContain(
      'No project skills',
    );
  });

  it('applies batch skill permissions and deletes only selected project skills', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        skills: [
          {
            name: 'project-one',
            description: 'Project owned',
            location: '.opencode/skills/project-one/SKILL.md',
            content: '# Project one',
          },
          {
            name: 'project-two',
            description: 'Project owned',
            location: '.opencode/skills/project-two/SKILL.md',
            content: '# Project two',
          },
        ],
      },
      text: '',
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const plugin = createPlugin();
    const containerEl = document.createElement('div');

    new SettingsSkillSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(containerEl, 'project');
    await flushPromises();

    const checkboxes = Array.from(containerEl.querySelectorAll<HTMLInputElement>('.opencodian-skill-select-checkbox'));
    for (const checkbox of checkboxes) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
    }

    expect(containerEl.querySelector('.opencodian-skill-bulk-apply-action')).toBeNull();
    const permissionSelect = containerEl.querySelector<HTMLSelectElement>('.opencodian-skill-bulk-permission-select');
    permissionSelect!.value = 'deny';
    permissionSelect!.dispatchEvent(new Event('change'));
    await flushPromises();

    expect(plugin.opencodeConfigManager.setSkillPermissionPattern).toHaveBeenCalledWith('project-one', 'deny');
    expect(plugin.opencodeConfigManager.setSkillPermissionPattern).toHaveBeenCalledWith('project-two', 'deny');

    containerEl.querySelector<HTMLButtonElement>('.opencodian-skill-bulk-delete-action')?.click();
    await flushPromises();

    expect(plugin.app.vault.adapter.remove).toHaveBeenCalledWith('.opencode/skills/project-one/SKILL.md');
    expect(plugin.app.vault.adapter.remove).toHaveBeenCalledWith('.opencode/skills/project-two/SKILL.md');
  });

  it('updates skill selection without rerendering the default permission panel', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        skills: [
          {
            name: 'project-one',
            description: 'Project owned',
            location: '.opencode/skills/project-one/SKILL.md',
            content: '# Project one',
          },
          {
            name: 'project-two',
            description: 'Project owned',
            location: '.opencode/skills/project-two/SKILL.md',
            content: '# Project two',
          },
        ],
      },
      text: '',
    });
    const plugin = createPlugin();
    const containerEl = document.createElement('div');

    new SettingsSkillSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(containerEl, 'project');
    await flushPromises();

    const controlPanel = containerEl.querySelector('.opencodian-skill-control-panel');
    const globalStatus = containerEl.querySelector('.opencodian-skill-permission-global-status');
    expect(controlPanel).not.toBeNull();
    expect(globalStatus).not.toBeNull();
    expect(globalStatus?.textContent).toBe('Current global permission: Allow loading');

    const checkbox = containerEl.querySelector<HTMLInputElement>('.opencodian-skill-select-checkbox');
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event('change'));
    await flushPromises();

    expect(containerEl.querySelector('.opencodian-skill-control-panel')).toBe(controlPanel);
    expect(controlPanel?.contains(globalStatus)).toBe(true);
    expect(globalStatus?.textContent).toBe('Current global permission: Allow loading');
    expect(containerEl.querySelector('.opencodian-skill-bulk-count')?.textContent).toBe('1 selected');
  });

  it('reuses resolved default permission status when the skills tab remounts', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        skills: [
          {
            name: 'project-one',
            description: 'Project owned',
            location: '.opencode/skills/project-one/SKILL.md',
            content: '# Project one',
          },
        ],
      },
      text: '',
    });
    const plugin = createPlugin();
    const firstContainerEl = document.createElement('div');

    new SettingsSkillSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(firstContainerEl, 'project');
    await flushPromises();

    expect(firstContainerEl.querySelector('.opencodian-skill-permission-global-status')?.textContent).toBe(
      'Current global permission: Allow loading',
    );

    plugin.opencodeConfigManager.read = jest.fn(() => new Promise(() => undefined));
    const secondContainerEl = document.createElement('div');
    new SettingsSkillSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(secondContainerEl, 'external');

    expect(secondContainerEl.querySelector('.opencodian-skill-permission-global-status')?.textContent).toBe(
      'Current global permission: Allow loading',
    );
  });

  it('restarts the local OpenCode service when refreshing the external skill catalog', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: { skills: [] },
      text: '',
    });
    const plugin = createPlugin();
    const containerEl = document.createElement('div');

    new SettingsSkillSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(containerEl, 'external');
    await flushPromises();

    containerEl.querySelector<HTMLButtonElement>('.opencodian-skill-refresh-action')?.click();
    await flushPromises();

    expect(plugin.openCodeService.stop).toHaveBeenCalledTimes(1);
    expect(plugin.openCodeService.start).toHaveBeenCalledTimes(1);
  });

  it('retries the skill catalog request when a restarted server is not ready yet', async () => {
    mockRequestUrl
      .mockRejectedValueOnce(new Error('net::ERR_EMPTY_RESPONSE'))
      .mockResolvedValueOnce({
        status: 200,
        json: {
          skills: [
            {
              name: 'project-skill',
              description: 'Project owned',
              location: '.opencode/skills/project-skill/SKILL.md',
              content: '# Project',
            },
          ],
        },
        text: '',
      });
    const plugin = createPlugin();
    const containerEl = document.createElement('div');

    new SettingsSkillSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(containerEl, 'project');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 900));

    expect(mockRequestUrl).toHaveBeenCalledTimes(2);
    expect(containerEl.querySelector('.opencodian-skill-card strong')?.textContent).toBe('project-skill');
  });

  it('groups OpenCode plugin package skills outside project skills', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        skills: [
          {
            name: 'using-superpowers',
            description: 'Plugin-provided workflow',
            location:
              '/Users/dht/.cache/opencode/packages/superpowers@git+https:/github.com/obra/superpowers.git/node_modules/superpowers/skills/using-superpowers/SKILL.md',
            content: '# Superpowers',
          },
        ],
      },
      text: '',
    });
    const plugin = createPlugin();
    const containerEl = document.createElement('div');

    new SettingsSkillSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(containerEl, 'external');
    await flushPromises();

    expect(containerEl.querySelector('.opencodian-skill-source-section')?.getAttribute('data-skill-source')).toBe(
      'plugin',
    );
    expect(containerEl.querySelector('.opencodian-skill-source-header h3')?.textContent).toBe('Plugin Packages');
    expect(containerEl.querySelectorAll('.opencodian-skill-row-delete-action')).toHaveLength(0);
  });

  it('renders built-in tools as grouped permission panels', async () => {
    const plugin = createPlugin();
    const containerEl = document.createElement('div');

    await new SettingsToolSection(containerEl, plugin as never, 'builtin').render();

    expect(containerEl.querySelectorAll('.opencodian-tool-group-panel').length).toBeGreaterThan(1);
    expect(containerEl.querySelector('.opencodian-tool-group-desc')?.textContent).toContain('Read, write');
    expect(containerEl.querySelector('.opencodian-tool-permission-row')?.getAttribute('data-tool-permission')).toBe(
      'allow',
    );
  });

  it('renders ACP presets and agent cards with structured headers', () => {
    const plugin = createPlugin({
      acpAgents: [
        {
          id: 'codex',
          name: 'Codex',
          command: 'codex',
          args: ['acp'],
          env: {},
          enabled: true,
        },
      ],
    });
    const containerEl = document.createElement('div');

    new SettingsAcpSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(containerEl, 'agents');

    expect(containerEl.querySelector('.opencodian-acp-preset-rail')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-acp-agent-card-header')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-acp-agent-command-summary')?.textContent).toBe('codex acp');
    expect(containerEl.querySelectorAll('.opencodian-acp-stacked-field')).toHaveLength(4);
  });
});
