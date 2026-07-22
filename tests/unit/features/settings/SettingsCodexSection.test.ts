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
    },
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

  it('renders only apiKey and model controls', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    expect(settingNames).toContain(t('settings.codex.apiKey.name'));
    expect(settingNames).toContain(t('settings.codex.model.name'));
  });

  it('renders sandboxMode control', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    expect(settingNames).toContain(t('settings.codex.sandbox.name'));
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
    section.attach(containerEl);

    expect(settingNames).toContain(t('settings.codex.additionalDirs.name'));
  });

  it('persists additionalDirectories on change', async () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

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
    section.attach(containerEl);

    expect(settingNames).toContain(t('settings.codex.network.name'));
  });

  it('persists networkAccess on change', async () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

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

    expect(settingNames).toEqual([
      t('settings.codex.apiKey.name'),
      t('settings.codex.model.name'),
      t('settings.codex.sandbox.name'),
      t('settings.codex.reasoning.name'),
      t('settings.codex.additionalDirs.name'),
      t('settings.codex.network.name'),
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
    section.attach(containerEl);

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
    section.attach(containerEl);

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
