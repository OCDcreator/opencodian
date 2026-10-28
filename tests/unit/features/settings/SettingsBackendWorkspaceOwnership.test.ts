import { type DropdownComponent, Setting, type TextComponent } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import type { AgentBackendKind } from '../../../../src/core/types/chat';
import { SettingsDshSection } from '../../../../src/features/settings/backends/dsh/SettingsDshSection';
import { SettingsBackendSection, SettingsOpenCode2Section } from '../../../../src/features/settings/backends/opencode/SettingsBackendSection';
import { SettingsInlineEditSection } from '../../../../src/features/settings/general/SettingsInlineEditSection';
import { setLocale, t } from '../../../../src/i18n';

interface CapturedChange {
  value: string;
  change(value: string): Promise<unknown>;
}

function captureSettingControls() {
  const text = new Map<string, CapturedChange>();
  let dropdown: CapturedChange | undefined;
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (this: Setting, name: string) {
    (this.settingEl as HTMLElement).dataset.settingName = name;
    return this;
  });
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (this: Setting, configure) {
    const control: CapturedChange = { value: '', change: async () => undefined };
    const component = {
      inputEl: document.createElement('input'),
      setPlaceholder: () => component,
      setValue: (value: string) => { control.value = value; return component; },
      onChange: (change: (value: string) => Promise<unknown>) => { control.change = change; return component; },
    };
    configure(component as unknown as TextComponent);
    text.set((this.settingEl as HTMLElement).dataset.settingName ?? '', control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function (this: Setting, configure) {
    const control: CapturedChange = { value: '', change: async () => undefined };
    const component = {
      selectEl: document.createElement('select'),
      addOption: () => component,
      setValue: (value: string) => { control.value = value; return component; },
      onChange: (change: (value: string) => Promise<unknown>) => { control.change = change; return component; },
    };
    dropdown = control;
    configure(component as unknown as DropdownComponent);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function (this: Setting) {
    return this;
  });
  return { text, getDropdown: () => dropdown };
}

function createPlugin() {
  const adapter = {
    validateConfigContent: jest.fn().mockResolvedValue(undefined),
    readConfigurationSummary: jest.fn().mockResolvedValue({
      version: '2.0.0', providers: 1, models: 2, agents: 3, skills: 4, commands: 5, mcp: 1,
    }),
    readManagementCatalog: jest.fn().mockResolvedValue({
      mcp: [{ name: 'local', status: { status: 'disconnected' } }],
      integrations: [],
      agents: [{ name: 'build' }],
      commands: [],
      skills: [],
      plugins: [],
    }),
    setMcpConnection: jest.fn().mockResolvedValue(undefined),
  };
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      enabledBackends: ['opencode2', 'claude-code', 'dsh'] as AgentBackendKind[],
      activeBackend: 'opencode2' as AgentBackendKind,
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    agentServiceRegistry: { get: jest.fn(() => adapter) },
    adapter,
  };
}

describe('OpenCode 2 workspace ownership', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });
  afterEach(() => { jest.restoreAllMocks(); });

  it('writes connection mode into OpenCode 2 settings, never the retired OpenCode 1 server settings', async () => {
    const plugin = createPlugin();
    const controls = captureSettingControls();
    const container = document.createElement('div');
    new SettingsOpenCode2Section({
      plugin: plugin as never,
      requestDisplayRefresh: jest.fn(),
      renderTitleSettings: jest.fn(),
    }).attachTabbed(container, 'connection');

    expect(plugin.settings.backendSettings.opencode2.mode).toBe('local');
    await controls.getDropdown()?.change('remote');
    expect(plugin.settings.backendSettings.opencode2.mode).toBe('remote');
    expect(plugin.settings.backendSettings.opencode.mode).toBeUndefined();
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it('renders title controls and only OpenCode 2 inline overrides in the model tab', () => {
    const plugin = createPlugin();
    const renderTitleSettings = jest.fn();
    const overrides = jest.spyOn(SettingsInlineEditSection, 'renderBackendModelOverrides').mockImplementation(() => {});
    const container = document.createElement('div');
    new SettingsOpenCode2Section({
      plugin: plugin as never,
      requestDisplayRefresh: jest.fn(),
      renderTitleSettings,
    }).attachTabbed(container, 'model');

    expect(renderTitleSettings).toHaveBeenCalledTimes(1);
    expect(overrides).toHaveBeenCalledWith(expect.any(HTMLElement), 'opencode2', plugin);
    expect(container.textContent).toContain(t('settings.opencode2.model.title'));
  });

  it('automatically reads MCP in the OpenCode 2 workspace', async () => {
    const plugin = createPlugin();
    captureSettingControls();
    const container = document.createElement('div');
    new SettingsOpenCode2Section({
      plugin: plugin as never,
      requestDisplayRefresh: jest.fn(),
      renderTitleSettings: jest.fn(),
    }).attachTabbed(container, 'mcp');

    expect(plugin.adapter.readManagementCatalog).toHaveBeenCalledTimes(1);
  });
});

describe('general agent management ownership', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });
  afterEach(() => { jest.restoreAllMocks(); });

  it('does not mount OpenCode 2 or DSH connection/MCP blocks inside general agent management', () => {
    const plugin = createPlugin();
    const dshAttach = jest.spyOn(SettingsDshSection.prototype, 'attach');
    const container = document.createElement('div');
    new SettingsBackendSection({
      plugin: plugin as never,
      requestDisplayRefresh: jest.fn(),
    }).attach(container);

    expect(dshAttach).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain(t('settings.agent.opencode2.connection'));
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).toContain(t('settings.agent.enabled'));
  });
});
