import { Setting } from 'obsidian';

import {
  DEFAULT_SETTINGS,
  getDefaultCodexBackendSettings,
} from '../../../../src/core/types';
import { BackendSessionBrowserModal } from '../../../../src/features/chat/ui/BackendSessionBrowserModal';
import { SettingsCodexSection } from '../../../../src/features/settings/SettingsCodexSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

jest.mock('../../../../src/features/chat/ui/BackendSessionBrowserModal', () => ({
  BackendSessionBrowserModal: jest.fn().mockImplementation(() => ({ open: jest.fn() })),
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
      onChange: jest.fn().mockReturnThis(),
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

function findButton(label: string): { name: string; label?: string; onClick?: () => void } {
  const record = buttonRecords.find((candidate) => candidate.label === label);
  expect(record).toBeDefined();
  return record!;
}

describe('SettingsCodexSection session browser launcher', () => {
  beforeEach(() => {
    setLocale('en');
    buttonRecords.length = 0;
    mockSettingPrototype();
    (BackendSessionBrowserModal as unknown as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders session browser launcher button in connection tab', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const launchButton = findButton(t('settings.codex.sessionBrowser.launchButton'));
    expect(launchButton).toBeDefined();
    expect(launchButton.onClick).toBeDefined();
  });

  it('renders session browser info notice in connection tab', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const infoEl = containerEl.querySelector('[data-codex-session-browser-info="true"]');
    expect(infoEl).toBeTruthy();
  });

  it('opens modal with forcedBackendKind codex and supportsResume true', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const launchButton = findButton(t('settings.codex.sessionBrowser.launchButton'));
    launchButton.onClick!();

    expect(BackendSessionBrowserModal).toHaveBeenCalledTimes(1);
    const [, hostArg] = (BackendSessionBrowserModal as unknown as jest.Mock).mock.calls[0];
    expect(hostArg.forcedBackendKind).toBe('codex');
    expect(hostArg.supportsResume()).toBe(true);
  });

  it('host createConversationFromBackendSession delegates to plugin bridge and returns conversation id', async () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const launchButton = findButton(t('settings.codex.sessionBrowser.launchButton'));
    launchButton.onClick!();

    const [, hostArg] = (BackendSessionBrowserModal as unknown as jest.Mock).mock.calls[0];
    const id = await hostArg.createConversationFromBackendSession('sess-123', 'Test Session', [
      { id: 'm1', role: 'user', content: 'hi', timestamp: 1 },
    ], 'codex');

    expect(plugin.createConversationFromBackendSession).toHaveBeenCalledWith(
      'sess-123',
      'Test Session',
      [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }],
      'codex',
    );
    expect(id).toBe('conv-resumed-123');
  });

  it('host loadConversation delegates to plugin bridge', async () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const launchButton = findButton(t('settings.codex.sessionBrowser.launchButton'));
    launchButton.onClick!();

    const [, hostArg] = (BackendSessionBrowserModal as unknown as jest.Mock).mock.calls[0];
    await hostArg.loadConversation('conv-resumed-123');

    expect(plugin.loadBackendSessionConversation).toHaveBeenCalledWith('conv-resumed-123');
  });

  it('renders session browser availability notice', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const inMemoryEl = containerEl.querySelector('[data-codex-session-browser-in-memory="true"]');
    expect(inMemoryEl).toBeTruthy();
    expect(inMemoryEl?.textContent).toContain(t('settings.codex.sessionBrowser.inMemoryNotice'));
  });
});
