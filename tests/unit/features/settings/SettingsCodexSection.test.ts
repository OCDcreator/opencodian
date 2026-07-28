/* eslint-disable max-lines, max-lines-per-function -- Covers the full Codex settings surface across connection/permissions/resume-inspect/account tabs; splitting would fragment the per-tab routing and control-persistence coverage. */
import * as obsidian from 'obsidian';
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
  app: {
    workspace: Record<string, unknown>;
    plugins?: { reloadPlugin?: jest.Mock };
  };
  manifest: { id: string };
  agentServiceRegistry: { get: jest.Mock };
  activateView: jest.Mock;
  createConversationFromBackendSession: jest.Mock;
  loadBackendSessionConversation: jest.Mock;
};

const settingNames: string[] = [];
const buttonRecords: Array<{ name: string; label?: string; onClick?: () => void | Promise<void> }> = [];
function createPlugin(): TestPlugin {
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
    app: {
      workspace: {},
      plugins: { reloadPlugin: jest.fn().mockResolvedValue(undefined) },
    },
    manifest: { id: 'opencodian' },
    agentServiceRegistry: {
      get: jest.fn((backend: string) => backend === 'codex' ? {} : null),
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
    const control = {
      setPlaceholder: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockImplementation((_handler: (value: string) => void) => {
        return control;
      }),
    };
    callback(control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function addDropdown(
    this: Setting,
    callback: (control: { addOption: jest.Mock; setValue: jest.Mock; onChange: jest.Mock }) => unknown,
  ) {
    const control = {
      selectEl: document.createElement('select'),
      addOption: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    };
    callback(control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function addToggle(
    this: Setting,
    callback: (control: { setValue: jest.Mock; onChange: jest.Mock }) => unknown,
  ) {
    const control = {
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    };
    callback(control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(function addTextArea(
    this: Setting,
    callback: (control: { setPlaceholder: jest.Mock; setValue: jest.Mock; onChange: jest.Mock }) => unknown,
  ) {
    const control = {
      setPlaceholder: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    };
    callback(control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
    this: Setting,
    callback: (control: { setButtonText: jest.Mock; setDisabled: jest.Mock; onClick: jest.Mock }) => unknown,
  ) {
    const record: { name: string; label?: string; onClick?: () => void | Promise<void> } = {
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

type DropdownControlCapture = {
  addOption: jest.Mock;
  setValue: jest.Mock;
  onChange: jest.Mock;
};

function createDropdownControlCapture(): DropdownControlCapture {
  return {
    addOption: jest.fn().mockReturnThis(),
    setValue: jest.fn().mockReturnThis(),
    onChange: jest.fn().mockReturnThis(),
  };
}

/**
 * Find the onChange handler of the SettingsCodexSection dropdown that offers
 * `optionValue` as one of its options, mirroring a real user dropdown selection.
 * Throws when no matching dropdown was registered (i.e. the control vanished).
 */
function findCodexDropdownHandler(optionValue: string): (value: string) => Promise<void> {
  const calls = (Setting.prototype.addDropdown as jest.Mock).mock.calls as Array<
    [(control: DropdownControlCapture) => unknown]
  >;
  const match = calls.find(([cb]) => {
    const probe = createDropdownControlCapture();
    cb(probe);
    return probe.addOption.mock.calls.some(([value]) => value === optionValue);
  });
  if (!match) {
    throw new Error(`No codex dropdown offering "${optionValue}" was registered`);
  }
  const captured = createDropdownControlCapture();
  match[0](captured);
  return captured.onChange.mock.calls[0][0] as (value: string) => Promise<void>;
}

describe('SettingsCodexSection stable surface', () => {
  beforeEach(() => {
    setLocale('en');
    settingNames.length = 0;
    buttonRecords.length = 0;
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the executable path alongside the existing connection controls', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    expect(settingNames).toContain(t('settings.codex.apiKey.name'));
    expect(settingNames).toContain(t('settings.codex.executablePath.name'));
    expect(settingNames).toContain(t('settings.codex.model.name'));
  });

  it('saves the executable path without live-applying it or reloading the plugin', async () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    section.attach(document.createElement('div'));

    const textControl = (Setting.prototype.addText as jest.Mock).mock.calls
      .find(([callback]) => {
        const captured = {
          setPlaceholder: jest.fn().mockReturnThis(),
          setValue: jest.fn().mockReturnThis(),
          onChange: jest.fn().mockReturnThis(),
        };
        callback(captured);
        return captured.setPlaceholder.mock.calls.some(([value]) => value === t('settings.codex.executablePath.placeholder'));
      });
    expect(textControl).toBeTruthy();

    const captured = {
      setPlaceholder: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    };
    (textControl as [jest.Mock])[0](captured);
    const handler = captured.onChange.mock.calls[0][0] as (value: string) => Promise<void>;

    await handler('  C:\\Tools\\codex.exe  ');

    expect(plugin.settings.backendSettings.codex.executablePath).toBe('C:\\Tools\\codex.exe');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.app.plugins?.reloadPlugin).not.toHaveBeenCalled();
  });

  it('reloads OpenCodian on explicit user request', async () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    section.attach(document.createElement('div'));

    const reload = buttonRecords.find((record) => record.name === t('settings.codex.reload.name'));
    expect(reload?.label).toBe(t('settings.codex.reload.button'));
    await reload?.onClick?.();

    expect(plugin.app.plugins?.reloadPlugin).toHaveBeenCalledWith('opencodian');
  });

  it('shows a manual reload instruction when Obsidian cannot reload the plugin', async () => {
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const plugin = createPlugin();
    plugin.app.plugins = undefined;
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    section.attach(document.createElement('div'));

    const reload = buttonRecords.find((record) => record.name === t('settings.codex.reload.name'));
    await reload?.onClick?.();

    expect(noticeSpy).toHaveBeenLastCalledWith(t('settings.codex.reload.manual'));
  });

  it('shows a manual recovery instruction when plugin reload rejects', async () => {
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const plugin = createPlugin();
    plugin.app.plugins?.reloadPlugin?.mockRejectedValueOnce(new Error('reload failed'));
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    section.attach(document.createElement('div'));

    const reload = buttonRecords.find((record) => record.name === t('settings.codex.reload.name'));
    await reload?.onClick?.();

    expect(noticeSpy).toHaveBeenLastCalledWith(t('settings.codex.reload.failed'));
  });

  it('renders sandboxMode control', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'permissions');

    expect(settingNames).toContain(t('settings.codex.sandbox.name'));
  });

  it('assigns accessible names to the real Approval Policy and Sandbox Mode selects', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'permissions');

    const dropdownCalls = (Setting.prototype.addDropdown as jest.Mock).mock.calls as Array<[(control: {
      addOption: jest.Mock;
      setValue: jest.Mock;
      onChange: jest.Mock;
      selectEl: HTMLSelectElement;
    }) => unknown]>;
    const selectFor = (optionValue: string): HTMLSelectElement => {
      const match = dropdownCalls.find(([callback]) => {
        const control = {
          selectEl: document.createElement('select'),
          addOption: jest.fn().mockReturnThis(),
          setValue: jest.fn().mockReturnThis(),
          onChange: jest.fn().mockReturnThis(),
        };
        callback(control);
        return control.addOption.mock.calls.some(([value]) => value === optionValue);
      });
      if (!match) throw new Error(`Dropdown ${optionValue} was not registered`);
      const control = {
        selectEl: document.createElement('select'),
        addOption: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
      };
      match[0](control);
      return control.selectEl;
    };

    expect(selectFor('inherit').getAttribute('aria-label')).toBe(t('settings.codex.approvalPolicy.name'));
    expect(selectFor('danger-full-access').getAttribute('aria-label')).toBe(t('settings.codex.sandbox.name'));
  });

  it('renders modelReasoningEffort control', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    expect(settingNames).toContain(t('settings.codex.reasoning.name'));
  });

  it('renders additionalDirectories control', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'permissions');

    expect(settingNames).toContain(t('settings.codex.additionalDirs.name'));
  });

  it('persists additionalDirectories on change', async () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'permissions');

    const textAreaControl = (Setting.prototype.addTextArea as jest.Mock).mock.calls
      .find(([cb]) => {
        const captured: { setPlaceholder: jest.Mock; setValue: jest.Mock; onChange: jest.Mock } = {
          setPlaceholder: jest.fn().mockReturnThis(),
          setValue: jest.fn().mockReturnThis(),
          onChange: jest.fn().mockReturnThis(),
        };
        cb(captured);
        return captured.setPlaceholder.mock.calls.some(([p]) => p === t('settings.codex.additionalDirs.placeholder'));
      });
    expect(textAreaControl).toBeTruthy();

    const captured: { setPlaceholder: jest.Mock; setValue: jest.Mock; onChange: jest.Mock } = {
      setPlaceholder: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    };
    (textAreaControl as [jest.Mock])[0](captured);
    const handler = captured.onChange.mock.calls[0][0] as (value: string) => Promise<void>;

    await handler('/tmp/extra\n/another/dir');

    expect(plugin.settings.backendSettings.codex.additionalDirectories).toBe('/tmp/extra\n/another/dir');
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  it('renders networkAccess control', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'permissions');

    expect(settingNames).toContain(t('settings.codex.network.name'));
  });

  it('persists networkAccess on change', async () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'permissions');

    const toggleControl = (Setting.prototype.addToggle as jest.Mock).mock.calls
      .find(([cb]) => {
        const captured: { setValue: jest.Mock; onChange: jest.Mock } = {
          setValue: jest.fn().mockReturnThis(),
          onChange: jest.fn().mockReturnThis(),
        };
        cb(captured);
        return true;
      });
    expect(toggleControl).toBeTruthy();

    const captured: { setValue: jest.Mock; onChange: jest.Mock } = {
      setValue: jest.fn().mockReturnThis(),
      onChange: jest.fn().mockReturnThis(),
    };
    (toggleControl as [jest.Mock])[0](captured);
    const handler = captured.onChange.mock.calls[0][0] as (value: boolean) => Promise<void>;

    await handler(true);

    expect(plugin.settings.backendSettings.codex.networkAccessEnabled).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  it('renders webSearchMode control', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    expect(settingNames).toContain(t('settings.codex.webSearch.name'));
  });

  it('renders the connection tab with writable runtime-default controls', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    // Connection owns apiKey, model, reasoning and web search. Sandbox,
    // network, and additional directories moved to the Permissions tab.
    expect(settingNames).toEqual([
      t('settings.codex.executablePath.name'),
      t('settings.codex.reload.name'),
      t('settings.codex.apiKey.name'),
      t('settings.codex.model.name'),
      t('settings.codex.reasoning.name'),
      t('settings.codex.webSearch.name'),
    ]);
    // The connection tab does not render resume/inspect or account surfaces.
    expect(containerEl.querySelector('[data-codex-account-card]')).toBeNull();
    expect(containerEl.querySelector('[data-codex-session-browser-info]')).toBeNull();
  });

  it('renders the resume & inspect tab with readback controls', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'resume-inspect');

    expect(settingNames).toEqual([
      t('settings.codex.sessionBrowser.launchName'),
      t('settings.codex.contextUsage.name'),
      t('settings.codex.modelList.name'),
      t('settings.codex.permissionProfiles.name'),
      t('settings.codex.mcpServers.name'),
      t('settings.codex.loadedThreads.name'),
    ]);
    expect(containerEl.querySelector('[data-codex-session-browser-info]')).toBeTruthy();
  });

  it('renders the account tab with four account/capability cards', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'account');

    // The account surface mounts four product cards.
    expect(containerEl.querySelectorAll('[data-codex-account-card]')).toHaveLength(4);
    expect(containerEl.querySelector('[data-codex-account-card="identity"]')).toBeTruthy();
    expect(containerEl.querySelector('[data-codex-account-card="usage"]')).toBeTruthy();
    expect(containerEl.querySelector('[data-codex-account-card="rate-limits"]')).toBeTruthy();
    expect(containerEl.querySelector('[data-codex-account-card="capabilities"]')).toBeTruthy();
  });

  it('renders connection source summary instead of a disabled setting', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const summaryEl = containerEl.querySelector('[data-codex-connection-summary]');
    expect(summaryEl).toBeTruthy();
    expect(summaryEl?.textContent).toContain(t('settings.codex.connection.name'));
    expect(summaryEl?.textContent).toContain(t('settings.codex.connection.sourceApiKey'));
  });

  it('does not expose a legacy Codex credential value or native provider controls', () => {
    const secret = 'legacy-codex-secret-do-not-render';
    const plugin = createPlugin();
    plugin.settings.backendSettings.codex.apiKey = secret;
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const credentialEl = containerEl.querySelector('[data-codex-legacy-credential]');
    expect(credentialEl).toBeTruthy();
    expect(credentialEl?.getAttribute('data-credential-state')).toBe('configured');
    expect(credentialEl?.textContent).toContain(t('settings.codex.apiKey.statusConfigured'));
    expect(credentialEl?.querySelectorAll('input')).toHaveLength(0);
    expect(credentialEl?.innerHTML).not.toContain(secret);
    expect(containerEl.innerHTML).not.toContain(secret);
    expect(containerEl.querySelector('input[type="password"]')).toBeNull();
    expect(buttonRecords.map((record) => record.label ?? '').some((label) => /save|edit|delete/i.test(label))).toBe(false);
  });

  it('guides empty legacy credential state toward Codex login or environment auth without a secret input', () => {
    const plugin = createPlugin();
    plugin.settings.backendSettings.codex.apiKey = '';
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const credentialEl = containerEl.querySelector('[data-codex-legacy-credential]');
    expect(credentialEl).toBeTruthy();
    expect(credentialEl?.getAttribute('data-credential-state')).toBe('empty');
    expect(credentialEl?.textContent).toContain(t('settings.codex.apiKey.statusMissing'));
    expect(credentialEl?.querySelectorAll('input')).toHaveLength(0);
    expect(credentialEl?.querySelectorAll('button')).toHaveLength(0);
  });

  it('requires confirmation before clearing a legacy credential and refreshes the masked status', async () => {
    const secret = 'legacy-codex-secret-clear-test';
    const plugin = createPlugin();
    plugin.settings.backendSettings.codex.apiKey = secret;
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const clearRecord = buttonRecords.find((record) => record.label === t('settings.codex.apiKey.clearButton'));
    expect(clearRecord?.onClick).toBeDefined();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    await clearRecord!.onClick!();
    expect(plugin.settings.backendSettings.codex.apiKey).toBe(secret);
    expect(plugin.saveSettings).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await clearRecord!.onClick!();
    expect(plugin.settings.backendSettings.codex.apiKey).toBe('');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    const credentialEl = containerEl.querySelector('[data-codex-legacy-credential]');
    expect(credentialEl?.getAttribute('data-credential-state')).toBe('empty');
    expect(containerEl.innerHTML).not.toContain(secret);
    confirmSpy.mockRestore();
  });

  it('rolls back a rejected credential clear without changing auth summary or invoking runtime updates', async () => {
    const secret = 'legacy-codex-secret-persistence-failure';
    const adapter = {
      updateModel: jest.fn(),
    };
    const plugin = createPlugin();
    plugin.settings.backendSettings.codex.apiKey = secret;
    plugin.agentServiceRegistry.get.mockReturnValue(adapter);
    plugin.saveSettings.mockRejectedValueOnce(new Error('persistence failure must stay hidden'));
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const clearRecord = buttonRecords.find((record) => record.label === t('settings.codex.apiKey.clearButton'));
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    await clearRecord!.onClick!();

    expect(plugin.settings.backendSettings.codex.apiKey).toBe(secret);
    expect(containerEl.querySelector('[data-codex-connection-summary]')?.textContent)
      .toContain(t('settings.codex.connection.sourceApiKey'));
    expect(containerEl.querySelector('[data-codex-legacy-credential]')?.textContent)
      .toContain(t('settings.codex.apiKey.clearFailed'));
    expect(containerEl.innerHTML).not.toContain(secret);
    expect(adapter.updateModel).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('updates the Codex runtime only after a credential clear persists successfully', async () => {
    const adapter = {
      updateModel: jest.fn(),
    };
    const plugin = createPlugin();
    plugin.agentServiceRegistry.get.mockReturnValue(adapter);
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const clearRecord = buttonRecords.find((record) => record.label === t('settings.codex.apiKey.clearButton'));
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    await clearRecord!.onClick!();

    expect(plugin.settings.backendSettings.codex.apiKey).toBe('');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(adapter.updateModel).toHaveBeenCalledWith(plugin.settings.backendSettings.codex.model);
    expect(containerEl.querySelector('[data-codex-connection-summary]')?.textContent)
      .toContain(t('settings.codex.connection.sourceEnvOrChatgpt'));
    confirmSpy.mockRestore();
  });

  it.each(['en', 'zh'] as const)('keeps the legacy credential status keyboard-safe and localised (%s)', (locale) => {
    setLocale(locale);
    const plugin = createPlugin();
    plugin.settings.backendSettings.codex.apiKey = '';
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const credentialEl = containerEl.querySelector('[data-codex-legacy-credential]');
    expect(credentialEl?.getAttribute('role')).toBe('status');
    expect(credentialEl?.getAttribute('aria-live')).toBe('polite');
    expect(credentialEl?.getAttribute('aria-label')).toBe(t('settings.codex.apiKey.name'));
    expect(credentialEl?.textContent).toContain(t('settings.codex.apiKey.statusMissing'));
  });
});

describe('SettingsCodexSection permissions tab', () => {
  beforeEach(() => {
    setLocale('en');
    settingNames.length = 0;
    buttonRecords.length = 0;
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the permissions tab with approval/sandbox/network/additional-dirs', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'permissions');

    expect(settingNames).toEqual([
      t('settings.codex.approvalPolicy.name'),
      t('settings.codex.sandbox.name'),
      t('settings.codex.network.name'),
      t('settings.codex.additionalDirs.name'),
    ]);
  });

  it('persists approvalPolicy on change', async () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'permissions');

    const handler = findCodexDropdownHandler('inherit');
    await handler('never');

    expect(plugin.settings.backendSettings.codex.approvalPolicy).toBe('never');
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  it('calls updateApprovalPolicy on live adapter when approvalPolicy changes', async () => {
    const updateApprovalPolicy = jest.fn();
    const plugin = createPlugin();
    plugin.agentServiceRegistry.get = jest.fn((backend: string) =>
      backend === 'codex' ? { updateApprovalPolicy } : null,
    );
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'permissions');

    const handler = findCodexDropdownHandler('inherit');
    await handler('untrusted');

    expect(updateApprovalPolicy).toHaveBeenCalledWith('untrusted');
  });
});

describe('SettingsCodexSection sandbox mode', () => {
  beforeEach(() => {
    setLocale('en');
    settingNames.length = 0;
    buttonRecords.length = 0;
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists sandboxMode on change', async () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'permissions');

    const handler = findCodexDropdownHandler('read-only');

    await handler('danger-full-access');

    expect(plugin.settings.backendSettings.codex.sandboxMode).toBe('danger-full-access');
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  it('calls updateSandboxMode on live adapter when sandboxMode changes', async () => {
    const updateSandboxMode = jest.fn();
    const plugin = createPlugin();
    plugin.agentServiceRegistry.get = jest.fn((backend: string) =>
      backend === 'codex' ? { updateSandboxMode } : null,
    );
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'permissions');

    const handler = findCodexDropdownHandler('read-only');

    await handler('read-only');

    expect(updateSandboxMode).toHaveBeenCalledWith('read-only');
  });
});

describe('SettingsCodexSection model reasoning effort', () => {
  beforeEach(() => {
    setLocale('en');
    settingNames.length = 0;
    buttonRecords.length = 0;
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists modelReasoningEffort on change', async () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const handler = findCodexDropdownHandler('minimal');

    await handler('high');

    expect(plugin.settings.backendSettings.codex.modelReasoningEffort).toBe('high');
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  it('calls updateModelReasoningEffort on live adapter when modelReasoningEffort changes', async () => {
    const updateModelReasoningEffort = jest.fn();
    const plugin = createPlugin();
    plugin.agentServiceRegistry.get = jest.fn((backend: string) =>
      backend === 'codex' ? { updateModelReasoningEffort } : null,
    );
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const handler = findCodexDropdownHandler('minimal');

    await handler('xhigh');

    expect(updateModelReasoningEffort).toHaveBeenCalledWith('xhigh');
  });
});

describe('SettingsCodexSection web search mode', () => {
  beforeEach(() => {
    setLocale('en');
    settingNames.length = 0;
    buttonRecords.length = 0;
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists webSearchMode on change', async () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const handler = findCodexDropdownHandler('cached');

    await handler('live');

    expect(plugin.settings.backendSettings.codex.webSearchMode).toBe('live');
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  it('calls updateWebSearchMode on live adapter when webSearchMode changes', async () => {
    const updateWebSearchMode = jest.fn();
    const plugin = createPlugin();
    plugin.agentServiceRegistry.get = jest.fn((backend: string) =>
      backend === 'codex' ? { updateWebSearchMode } : null,
    );
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const handler = findCodexDropdownHandler('cached');

    await handler('live');

    expect(updateWebSearchMode).toHaveBeenCalledWith('live');
  });
});
