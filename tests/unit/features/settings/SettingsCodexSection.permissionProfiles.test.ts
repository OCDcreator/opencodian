import { Setting } from 'obsidian';

import {
  DEFAULT_SETTINGS,
  getDefaultCodexBackendSettings,
} from '../../../../src/core/types';
import { CodexReadbackModal } from '../../../../src/features/settings/CodexReadbackModal';
import { SettingsCodexSection } from '../../../../src/features/settings/SettingsCodexSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

jest.mock('../../../../src/features/settings/CodexReadbackModal', () => ({
  CodexReadbackModal: jest.fn().mockImplementation(() => ({ open: jest.fn() })),
}));

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

describe('SettingsCodexSection permission profile readback', () => {
  beforeEach(() => {
    setLocale('en');
    settingNames.length = 0;
    buttonRecords.length = 0;
    mockSettingPrototype();
    (CodexReadbackModal as unknown as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders permission profile readback control', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'resume-inspect');

    expect(settingNames).toContain(t('settings.codex.permissionProfiles.name'));
  });

  it('renders permission profile inspect button', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'resume-inspect');

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.permissionProfiles.inspectButton'),
    );
    expect(inspectButton).toBeDefined();
    expect(inspectButton!.onClick).toBeDefined();
  });

  it('opens a modal instead of appending an inline readback card', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'resume-inspect');

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.permissionProfiles.inspectButton'),
    );
    inspectButton!.onClick!();

    expect(CodexReadbackModal).toHaveBeenCalledTimes(1);
    const [optionsArg] = (CodexReadbackModal as unknown as jest.Mock).mock.calls[0];
    expect(optionsArg.title).toBe(t('settings.codex.permissionProfiles.modalTitle'));
    expect(optionsArg.app).toBe(plugin.app);
    expect(optionsArg.fetchItems).toBeInstanceOf(Function);
    expect(optionsArg.renderItems).toBeInstanceOf(Function);

    const readbackEl = containerEl.querySelector('[data-codex-permission-profiles-readback]');
    expect(readbackEl).toBeFalsy();
  });

  it('modal fetchItems returns null when adapter does not have getPermissionProfiles', async () => {
    const plugin = createPlugin({});
    openPermissionProfilesModal(plugin);

    const [optionsArg] = (CodexReadbackModal as unknown as jest.Mock).mock.calls[0];
    const result = await optionsArg.fetchItems();
    expect(result).toBeNull();
  });

  it('modal fetchItems returns data from getPermissionProfiles', async () => {
    const mockProfiles = [{ id: 'default', description: 'Default profile' }];
    const plugin = createPlugin({
      getPermissionProfiles: jest.fn().mockResolvedValue(mockProfiles),
    });
    openPermissionProfilesModal(plugin);

    const [optionsArg] = (CodexReadbackModal as unknown as jest.Mock).mock.calls[0];
    const result = await optionsArg.fetchItems();
    expect(result).toEqual(mockProfiles);
  });

  it('modal fetchItems throws when getPermissionProfiles throws', async () => {
    const plugin = createPlugin({
      getPermissionProfiles: jest.fn().mockRejectedValue(new Error('App-server unavailable')),
    });
    openPermissionProfilesModal(plugin);

    const [optionsArg] = (CodexReadbackModal as unknown as jest.Mock).mock.calls[0];
    await expect(optionsArg.fetchItems()).rejects.toThrow();
  });

  it('modal renderItems renders profile entries with proof markers', () => {
    const mockProfiles = [
      { id: 'default', description: 'Default profile with standard permissions' },
      { id: 'strict', description: 'Strict profile with elevated restrictions' },
      { id: 'permissive' },
    ];
    const plugin = createPlugin({
      getPermissionProfiles: jest.fn().mockResolvedValue(mockProfiles),
    });
    openPermissionProfilesModal(plugin);

    const [optionsArg] = (CodexReadbackModal as unknown as jest.Mock).mock.calls[0];
    const containerEl = document.createElement('div');
    optionsArg.renderItems(containerEl, mockProfiles);

    const entries = containerEl.querySelectorAll('[data-profile-id]');
    expect(entries.length).toBe(3);
    expect(entries[0].getAttribute('data-profile-id')).toBe('default');
    expect(entries[1].getAttribute('data-profile-id')).toBe('strict');
    expect(entries[2].getAttribute('data-profile-id')).toBe('permissive');
    expect(entries[0].getAttribute('data-proof-state')).toBe('readback');
  });

  it('modal renderItems shows description for profiles that have it', () => {
    const mockProfiles = [{ id: 'default', description: 'Default profile with standard permissions' }];
    const plugin = createPlugin({
      getPermissionProfiles: jest.fn().mockResolvedValue(mockProfiles),
    });
    openPermissionProfilesModal(plugin);

    const [optionsArg] = (CodexReadbackModal as unknown as jest.Mock).mock.calls[0];
    const containerEl = document.createElement('div');
    optionsArg.renderItems(containerEl, mockProfiles);

    const entryEl = containerEl.querySelector('[data-profile-id="default"]');
    expect(entryEl).toBeTruthy();
    expect(entryEl!.textContent).toContain('Default profile with standard permissions');
  });
});

function openPermissionProfilesModal(plugin: TestPlugin): void {
  const section = new SettingsCodexSection({
    plugin: plugin as never,
    createSectionHeading,
  });
  const containerEl = document.createElement('div');
  section.attachTabbed(containerEl, 'resume-inspect');

  const inspectButton = buttonRecords.find(
    (r) => r.label === t('settings.codex.permissionProfiles.inspectButton'),
  );
  inspectButton!.onClick!();
}
