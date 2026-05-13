import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsToolSection } from '../../../../src/features/settings/SettingsToolSection';
import { setLocale } from '../../../../src/i18n';

interface MockButtonControl {
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
  setButtonText: jest.MockedFunction<(text: string) => MockButtonControl>;
}

interface MockDropdownControl {
  addOption: jest.MockedFunction<(value: string, label: string) => MockDropdownControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>;
  setValue: jest.MockedFunction<(value: string) => MockDropdownControl>;
}

const buttonRecords: Array<{ control: MockButtonControl; text: string; onClick?: () => void | Promise<void> }> = [];
const dropdownRecords: Array<{
  control: MockDropdownControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}> = [];

function createPlugin(options: { permission?: unknown; serverMode?: 'local' | 'remote' } = {}) {
  const adapter = {
    basePath: '/test-vault',
    exists: jest.fn().mockResolvedValue(true),
    list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
    mkdir: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue(''),
    remove: jest.fn().mockResolvedValue(undefined),
    write: jest.fn().mockResolvedValue(undefined),
  };
  return {
    app: {
      vault: {
        adapter,
      },
    },
    settings: {
      ...DEFAULT_SETTINGS,
      server: {
        ...DEFAULT_SETTINGS.server,
        mode: options.serverMode ?? 'local',
      },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    openCodeService: {
      checkHealth: jest.fn().mockResolvedValue(true),
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
    },
    opencodeConfigManager: {
      clearToolPermission: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue({ permission: options.permission ?? { '*': 'ask' } }),
      setToolPermission: jest.fn().mockResolvedValue(undefined),
    },
    openCodeCatalogStateStore: {
      getToolCatalogSnapshot: jest.fn(() => ({ registryToolIds: ['custom.exec'] })),
      classifyToolIds: jest.fn(() => ({ builtin: [], custom: ['custom.exec'] })),
    },
  };
}

function createButtonRecord(): { control: MockButtonControl; text: string; onClick?: () => void | Promise<void> } {
  const record: { control: MockButtonControl; text: string; onClick?: () => void | Promise<void> } = {
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

function createDropdownRecord(name: string): {
  control: MockDropdownControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
} {
  const record = {
    name,
    control: {
      addOption: jest.fn(),
      onChange: jest.fn(),
      setValue: jest.fn(),
    },
  };
  record.control.addOption.mockReturnValue(record.control);
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  record.control.setValue.mockReturnValue(record.control);
  return record;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('SettingsToolSection custom tool authoring', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    buttonRecords.length = 0;
    dropdownRecords.length = 0;
    jest.restoreAllMocks();
    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
      (this as Setting & { __settingName?: string }).__settingName = name;
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

  it('renders project custom tool files with create, edit, delete, and permission controls', async () => {
    const plugin = createPlugin();
    const adapter = plugin.app.vault.adapter;
    adapter.list.mockResolvedValue({
      files: ['.opencode/tools/database.ts'],
      folders: [],
    });
    adapter.read.mockResolvedValue(
      'import { tool } from "@opencode-ai/plugin";\n\nexport default tool({ description: "Query database", args: {}, async execute() { return "ok"; } });\n',
    );
    const containerEl = document.createElement('div');

    await new SettingsToolSection(containerEl, plugin as never, 'custom').render();

    expect(containerEl.querySelector('.opencodian-tool-control-panel .opencodian-tool-authoring-actions')).not.toBeNull();
    expect(buttonRecords.some((record) => record.text === 'New tool')).toBe(true);
    expect(containerEl.querySelector('.opencodian-tool-file-card')?.textContent).toContain('database');
    expect(containerEl.querySelector('.opencodian-tool-source-chip')?.textContent).toBe('Project');
    expect(containerEl.querySelector('.opencodian-tool-file-path')?.textContent).toBe('.opencode/tools/database.ts');
    expect(containerEl.querySelector('.opencodian-tool-row-delete-action')?.textContent).toBe('Delete');
    expect(dropdownRecords.some((record) => record.name === 'Permission')).toBe(true);
  });

  it('renders global default permission separately from inherited tool overrides', async () => {
    const plugin = createPlugin({ permission: { '*': 'ask', bash: 'deny' } });
    const containerEl = document.createElement('div');

    await new SettingsToolSection(containerEl, plugin as never, 'builtin').render();

    const readDropdown = dropdownRecords.find((record) => record.name === 'Read');
    const bashDropdown = dropdownRecords.find((record) => record.name === 'Bash');
    const defaultDropdown = containerEl.querySelector<HTMLSelectElement>('.opencodian-tool-default-select');
    expect(containerEl.querySelector('.opencodian-tool-control-panel.opencodian-skill-control-panel')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-tool-default-cluster.opencodian-skill-permission-cluster')).not.toBeNull();
    expect(defaultDropdown?.value).toBe('ask');
    expect(readDropdown?.control.setValue).toHaveBeenCalledWith('inherit');
    expect(bashDropdown?.control.setValue).toHaveBeenCalledWith('deny');
    expect(containerEl.querySelector('[data-tool-id="read"]')?.getAttribute('data-tool-permission-source')).toBe(
      'inherit',
    );
    expect(containerEl.querySelector('[data-tool-id="bash"]')?.getAttribute('data-tool-permission-source')).toBe(
      'override',
    );
  });

  it('writes and clears permission overrides, then restarts the local service', async () => {
    const plugin = createPlugin({ permission: { '*': 'ask', bash: 'deny' } });
    const containerEl = document.createElement('div');

    await new SettingsToolSection(containerEl, plugin as never, 'builtin').render();
    const defaultDropdown = containerEl.querySelector<HTMLSelectElement>('.opencodian-tool-default-select');
    const bashDropdown = dropdownRecords.find((record) => record.name === 'Bash');

    defaultDropdown!.value = 'allow';
    defaultDropdown!.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(plugin.opencodeConfigManager.setToolPermission).toHaveBeenCalledWith('*', 'allow');
    expect(plugin.openCodeService.stop).toHaveBeenCalledTimes(1);
    expect(plugin.openCodeService.start).toHaveBeenCalledTimes(1);

    await bashDropdown?.onChange?.('inherit');
    expect(plugin.opencodeConfigManager.clearToolPermission).toHaveBeenCalledWith('bash');
    expect(plugin.openCodeService.stop).toHaveBeenCalledTimes(2);
    expect(plugin.openCodeService.start).toHaveBeenCalledTimes(2);
  });

  it('creates a default project tool file from the custom tools page', async () => {
    const plugin = createPlugin();
    const adapter = plugin.app.vault.adapter;
    adapter.exists.mockResolvedValue(false);
    adapter.list.mockResolvedValue({ files: [], folders: [] });
    const containerEl = document.createElement('div');

    await new SettingsToolSection(containerEl, plugin as never, 'custom').render();
    const newToolButton = buttonRecords.find((record) => record.text === 'New tool');
    await newToolButton?.onClick?.();

    expect(adapter.mkdir).toHaveBeenCalledWith('.opencode');
    expect(adapter.mkdir).toHaveBeenCalledWith('.opencode/tools');
    expect(adapter.write).toHaveBeenCalledWith(
      '.opencode/tools/new-tool.ts',
      expect.stringContaining('export default tool({'),
    );
    expect(plugin.openCodeService.stop).toHaveBeenCalledTimes(1);
    expect(plugin.openCodeService.start).toHaveBeenCalledTimes(1);
  });
});
