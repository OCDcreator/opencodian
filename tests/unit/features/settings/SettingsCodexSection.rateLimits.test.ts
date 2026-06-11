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

describe('SettingsCodexSection rate limits readback', () => {
  beforeEach(() => {
    setLocale('en');
    settingNames.length = 0;
    buttonRecords.length = 0;
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders rate limits readback control', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    expect(settingNames).toContain(t('settings.codex.rateLimits.name'));
  });

  it('renders rate limits inspect button', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.rateLimits.inspectButton'),
    );
    expect(inspectButton).toBeDefined();
    expect(inspectButton!.onClick).toBeDefined();
  });

  it('shows unavailable when adapter does not have getAccountRateLimits', async () => {
    const plugin = createPlugin({});
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.rateLimits.inspectButton'),
    );
    await inspectButton!.onClick!();

    const readbackEl = containerEl.querySelector('[data-codex-rate-limits-readback]');
    expect(readbackEl).toBeTruthy();
    expect(readbackEl!.textContent).toBe(t('settings.codex.rateLimits.unavailable'));
  });

  it('shows unavailable when getAccountRateLimits returns null', async () => {
    const plugin = createPlugin({
      getAccountRateLimits: jest.fn().mockResolvedValue(null),
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.rateLimits.inspectButton'),
    );
    await inspectButton!.onClick!();

    const readbackEl = containerEl.querySelector('[data-codex-rate-limits-readback]');
    expect(readbackEl).toBeTruthy();
    expect(readbackEl!.textContent).toBe(t('settings.codex.rateLimits.unavailable'));
  });

  it('shows rate limits data when getAccountRateLimits returns data', async () => {
    const mockRateLimits = {
      rateLimits: {
        requests_per_minute: 60,
        tokens_per_minute: 100000,
      },
      rateLimitsByLimitId: {
        default: {
          requests_per_minute: 60,
          tokens_per_minute: 100000,
        },
      },
    };
    const plugin = createPlugin({
      getAccountRateLimits: jest.fn().mockResolvedValue(mockRateLimits),
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.rateLimits.inspectButton'),
    );
    await inspectButton!.onClick!();

    const readbackEl = containerEl.querySelector('[data-codex-rate-limits-readback]');
    expect(readbackEl).toBeTruthy();
    expect(readbackEl!.getAttribute('data-proof-state')).toBe('readback');
    expect(readbackEl!.textContent).toContain(t('settings.codex.rateLimits.summary'));
    expect(readbackEl!.textContent).toContain('requests_per_minute');
  });

  it('shows failed when getAccountRateLimits throws', async () => {
    const plugin = createPlugin({
      getAccountRateLimits: jest.fn().mockRejectedValue(new Error('App-server unavailable')),
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.rateLimits.inspectButton'),
    );
    await inspectButton!.onClick!();

    const readbackEl = containerEl.querySelector('[data-codex-rate-limits-readback]');
    expect(readbackEl).toBeTruthy();
    expect(readbackEl!.textContent).toBe(t('settings.codex.rateLimits.failed'));
  });

  it('shows unavailable when adapter registry returns null', async () => {
    const plugin = createPlugin();
    plugin.agentServiceRegistry.get = jest.fn(() => null);
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.rateLimits.inspectButton'),
    );
    await inspectButton!.onClick!();

    const readbackEl = containerEl.querySelector('[data-codex-rate-limits-readback]');
    expect(readbackEl).toBeTruthy();
    expect(readbackEl!.textContent).toBe(t('settings.codex.rateLimits.unavailable'));
  });
});
