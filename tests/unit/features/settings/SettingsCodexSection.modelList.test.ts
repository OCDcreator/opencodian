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

describe('SettingsCodexSection model list readback', () => {
  beforeEach(() => {
    setLocale('en');
    settingNames.length = 0;
    buttonRecords.length = 0;
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders model list readback control', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    expect(settingNames).toContain(t('settings.codex.modelList.name'));
  });

  it('renders model list inspect button', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.modelList.inspectButton'),
    );
    expect(inspectButton).toBeDefined();
    expect(inspectButton!.onClick).toBeDefined();
  });

  it('shows unavailable when adapter does not have getModelList', async () => {
    const plugin = createPlugin({});
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.modelList.inspectButton'),
    );
    await inspectButton!.onClick!();

    const readbackEl = containerEl.querySelector('[data-codex-model-list-readback]');
    expect(readbackEl).toBeTruthy();
    expect(readbackEl!.textContent).toBe(t('settings.codex.modelList.unavailable'));
  });

  it('shows unavailable when getModelList returns null', async () => {
    const plugin = createPlugin({
      getModelList: jest.fn().mockResolvedValue(null),
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.modelList.inspectButton'),
    );
    await inspectButton!.onClick!();

    const readbackEl = containerEl.querySelector('[data-codex-model-list-readback]');
    expect(readbackEl).toBeTruthy();
    expect(readbackEl!.textContent).toBe(t('settings.codex.modelList.unavailable'));
  });

  it('shows model entries when getModelList returns data', async () => {
    const mockModels = [
      {
        slug: 'gpt-5.5',
        display_name: 'GPT-5.5',
        visibility: 'list',
        supported_in_api: true,
        default_reasoning_level: 'medium',
        description: 'Frontier model.',
      },
      {
        slug: 'gpt-5.4',
        display_name: 'gpt-5.4',
        visibility: 'list',
        supported_in_api: true,
        default_reasoning_level: null,
        description: null,
      },
    ];
    const plugin = createPlugin({
      getModelList: jest.fn().mockResolvedValue(mockModels),
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.modelList.inspectButton'),
    );
    await inspectButton!.onClick!();

    const readbackEl = containerEl.querySelector('[data-codex-model-list-readback]');
    expect(readbackEl).toBeTruthy();
    expect(readbackEl!.getAttribute('data-proof-state')).toBe('readback');

    const entries = readbackEl!.querySelectorAll('[data-model-slug]');
    expect(entries.length).toBe(2);
    expect(entries[0].getAttribute('data-model-slug')).toBe('gpt-5.5');
    expect(entries[1].getAttribute('data-model-slug')).toBe('gpt-5.4');
  });

  it('shows failed when getModelList throws', async () => {
    const plugin = createPlugin({
      getModelList: jest.fn().mockRejectedValue(new Error('CLI not found')),
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.modelList.inspectButton'),
    );
    await inspectButton!.onClick!();

    const readbackEl = containerEl.querySelector('[data-codex-model-list-readback]');
    expect(readbackEl).toBeTruthy();
    expect(readbackEl!.textContent).toBe(t('settings.codex.modelList.failed'));
  });

  it('shows reasoning level meta for models that have it', async () => {
    const mockModels = [
      {
        slug: 'gpt-5.5',
        display_name: 'GPT-5.5',
        visibility: 'list',
        supported_in_api: true,
        default_reasoning_level: 'medium',
        description: 'Frontier model.',
      },
    ];
    const plugin = createPlugin({
      getModelList: jest.fn().mockResolvedValue(mockModels),
    });
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attach(containerEl);

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.modelList.inspectButton'),
    );
    await inspectButton!.onClick!();

    const entryEl = containerEl.querySelector('[data-model-slug="gpt-5.5"]');
    expect(entryEl).toBeTruthy();
    expect(entryEl!.textContent).toContain('reasoning: medium');
  });
});
