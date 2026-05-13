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

const dropdownRecords: DropdownRecord[] = [];

function createPlugin(overrides: Record<string, unknown> = {}) {
  return {
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
    }).attachTabbed(containerEl, 'catalog');
    await flushPromises();

    expect(containerEl.querySelector('.opencodian-skill-settings-shell')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-skill-control-panel .opencodian-skill-toolbar')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-skill-source-section')?.getAttribute('data-skill-source')).toBe(
      'builtin',
    );
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
    }).attachTabbed(containerEl, 'catalog');
    await flushPromises();

    const defaultPermissionSelect = containerEl.querySelector<HTMLSelectElement>('.opencodian-skill-permission-select');
    const skillPermission = dropdownRecords.find((record) => record.name === 'This skill override');
    expect(defaultPermissionSelect?.value).toBe('inherit');
    expect(Array.from(defaultPermissionSelect?.options ?? []).map((option) => option.text)).toContain('Inherit global');
    expect(containerEl.querySelector('.opencodian-skill-permission-global-status')?.textContent).toBe(
      'Current global permission: Allow loading',
    );
    expect(skillPermission?.control.addOption).toHaveBeenCalledWith('inherit', 'Follow default');
    expect(skillPermission?.control.setValue).toHaveBeenCalledWith('inherit');

    defaultPermissionSelect!.value = 'ask';
    defaultPermissionSelect!.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(plugin.opencodeConfigManager.setToolPermission).toHaveBeenCalledWith('skill', 'ask');
    expect(plugin.openCodeService.stop).toHaveBeenCalledTimes(1);
    expect(plugin.openCodeService.start).toHaveBeenCalledTimes(1);

    await skillPermission?.onChange?.('deny');
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
    }).attachTabbed(containerEl, 'catalog');
    await flushPromises();

    expect(containerEl.querySelectorAll('.opencodian-skill-row-delete-action')).toHaveLength(1);
    expect(containerEl.querySelector('.opencodian-skill-row-delete-action')?.textContent).toBe('Delete');
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
    }).attachTabbed(containerEl, 'catalog');
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
