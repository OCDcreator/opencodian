import { Setting } from 'obsidian';

import {
  DEFAULT_SETTINGS,
  getDefaultCodexBackendSettings,
} from '../../../../src/core/types';
import { SettingsCodexSection } from '../../../../src/features/settings/SettingsCodexSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

type TestPlugin = {
  settings: OpenCodianPlugin['settings'];
  saveSettings: jest.Mock;
  app: { workspace: Record<string, unknown> };
  agentServiceRegistry: { get: jest.Mock };
  activateView: jest.Mock;
  createConversationFromBackendSession: jest.Mock;
  loadBackendSessionConversation: jest.Mock;
};

const settingNames: string[] = [];
const buttonRecords: Array<{ name: string; label?: string; onClick?: () => void }> = [];

function createPlugin(adapterOverrides: Record<string, unknown> = {}): TestPlugin {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      backendSettings: {
        ...DEFAULT_SETTINGS.backendSettings,
        codex: {
          ...getDefaultCodexBackendSettings(),
          apiKey: 'test-key',
          model: 'codex-mini-latest',
        },
      },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    app: { workspace: {} },
    agentServiceRegistry: {
      get: jest.fn((backend: string) => backend === 'codex' ? adapterOverrides : null),
    },
    activateView: jest.fn().mockResolvedValue(undefined),
    createConversationFromBackendSession: jest.fn().mockResolvedValue('conv-resumed-123'),
    loadBackendSessionConversation: jest.fn().mockResolvedValue(undefined),
  };
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function mockSettingPrototype(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
    (this as Setting & { __settingName?: string }).__settingName = name;
    settingNames.push(name);
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockReturnThis();
  jest.spyOn(Setting.prototype, 'setClass').mockReturnThis();
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function addText(
    this: Setting,
    callback: (control: { setPlaceholder: jest.Mock; setValue: jest.Mock; onChange: jest.Mock }) => unknown,
  ) {
    callback({
      setPlaceholder: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    });
    return this;
  });
  jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function addDropdown(
    this: Setting,
    callback: (control: { addOption: jest.Mock; setValue: jest.Mock; onChange: jest.Mock }) => unknown,
  ) {
    callback({
      addOption: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    });
    return this;
  });
  jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function addToggle(
    this: Setting,
    callback: (control: { setValue: jest.Mock; onChange: jest.Mock }) => unknown,
  ) {
    callback({
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    });
    return this;
  });
  jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(function addTextArea(
    this: Setting,
    callback: (control: { setPlaceholder: jest.Mock; setValue: jest.Mock; onChange: jest.Mock }) => unknown,
  ) {
    callback({
      setPlaceholder: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    });
    return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
    this: Setting,
    callback: (control: { setButtonText: jest.Mock; setDisabled: jest.Mock; onClick: jest.Mock }) => unknown,
  ) {
    const record: { name: string; label?: string; onClick?: () => void } = {
      name: (this as Setting & { __settingName?: string }).__settingName ?? '',
    };
    const control = {
      setButtonText: jest.fn().mockImplementation((value: string) => {
        record.label = value;
        return control;
      }),
      setDisabled: jest.fn().mockReturnThis(),
      onClick: jest.fn().mockImplementation((handler: () => void) => {
        record.onClick = handler;
        return control;
      }),
    };
    buttonRecords.push(record);
    callback(control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'then').mockReturnThis();
}

describe('SettingsCodexSection MCP server status readback', () => {
  beforeEach(() => {
    setLocale('en');
    settingNames.length = 0;
    buttonRecords.length = 0;
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders MCP server status readback control', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'resume-inspect');

    expect(settingNames).toContain(t('settings.codex.mcpServers.name'));
  });

  it('renders inspect and reload buttons', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'resume-inspect');

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.mcpServers.inspectButton'),
    );
    const reloadButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.mcpServers.reloadButton'),
    );
    expect(inspectButton).toBeDefined();
    expect(inspectButton!.onClick).toBeDefined();
    expect(reloadButton).toBeDefined();
    expect(reloadButton!.onClick).toBeDefined();
  });

  it('shows unavailable notice when adapter does not have getMcpServerStatus', async () => {
    const plugin = createPlugin({});
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'resume-inspect');

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.mcpServers.inspectButton'),
    );
    expect(inspectButton).toBeDefined();
    expect(inspectButton!.onClick).toBeDefined();
  });

  it('shows unavailable notice when getMcpServerStatus returns null', async () => {
    const plugin = createPlugin({
      getMcpServerStatus: jest.fn().mockResolvedValue(null),
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'resume-inspect');

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.mcpServers.inspectButton'),
    );
    expect(inspectButton).toBeDefined();
    expect(inspectButton!.onClick).toBeDefined();
  });

  it('renders inspect button when adapter returns data', async () => {
    const mockStatuses = [
      {
        name: 'codex_apps',
        serverInfo: { name: 'codex-connectors-mcp', version: '0.1.0' },
        tools: {},
        resources: [],
        resourceTemplates: [],
        authStatus: 'bearerToken',
      },
      {
        name: 'computer-use',
        serverInfo: { name: 'Computer Use', version: 'd10a' },
        tools: {
          click: { name: 'click', description: 'Click an element' },
          press_key: { name: 'press_key', description: 'Press a key' },
        },
        authStatus: 'none',
      },
    ];
    const plugin = createPlugin({
      getMcpServerStatus: jest.fn().mockResolvedValue(mockStatuses),
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'resume-inspect');

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.mcpServers.inspectButton'),
    );
    expect(inspectButton).toBeDefined();
    expect(inspectButton!.onClick).toBeDefined();
  });

  it('shows failed notice when getMcpServerStatus throws', async () => {
    const plugin = createPlugin({
      getMcpServerStatus: jest.fn().mockRejectedValue(new Error('App-server unavailable')),
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'resume-inspect');

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.mcpServers.inspectButton'),
    );
    expect(inspectButton).toBeDefined();
  });

  it('calls reloadMcpServers on reload button click', async () => {
    const mockStatuses = [
      {
        name: 'codex_apps',
        serverInfo: { name: 'codex-connectors-mcp', version: '0.1.0' },
        tools: {},
        authStatus: 'bearerToken',
      },
    ];
    const getMcpServerStatus = jest.fn().mockResolvedValue(mockStatuses);
    const reloadMcpServers = jest.fn().mockResolvedValue(true);
    const plugin = createPlugin({ getMcpServerStatus, reloadMcpServers });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'resume-inspect');

    const reloadButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.mcpServers.reloadButton'),
    );
    await reloadButton!.onClick!();

    expect(reloadMcpServers).toHaveBeenCalledTimes(1);
  });

  it('shows notice on reload failure', async () => {
    const getMcpServerStatus = jest.fn().mockResolvedValue([]);
    const reloadMcpServers = jest.fn().mockResolvedValue(false);
    const plugin = createPlugin({ getMcpServerStatus, reloadMcpServers });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'resume-inspect');

    const reloadButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.mcpServers.reloadButton'),
    );
    await reloadButton!.onClick!();

    expect(reloadMcpServers).toHaveBeenCalledTimes(1);
  });
});
