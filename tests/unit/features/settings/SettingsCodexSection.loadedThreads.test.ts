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

describe('SettingsCodexSection loaded threads readback', () => {
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

  it('renders loaded threads readback control', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'resume-inspect');

    expect(settingNames).toContain(t('settings.codex.loadedThreads.name'));
  });

  it('renders loaded threads inspect button', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    section.attachTabbed(containerEl, 'resume-inspect');

    const inspectButton = buttonRecords.find(
      (r) => r.label === t('settings.codex.loadedThreads.inspectButton'),
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
      (r) => r.label === t('settings.codex.loadedThreads.inspectButton'),
    );
    inspectButton!.onClick!();

    expect(CodexReadbackModal).toHaveBeenCalledTimes(1);
    const [optionsArg] = (CodexReadbackModal as unknown as jest.Mock).mock.calls[0];
    expect(optionsArg.title).toBe(t('settings.codex.loadedThreads.modalTitle'));
    expect(optionsArg.app).toBe(plugin.app);
    expect(optionsArg.fetchItems).toBeInstanceOf(Function);
    expect(optionsArg.renderItems).toBeInstanceOf(Function);

    const readbackEl = containerEl.querySelector('[data-codex-loaded-threads-readback]');
    expect(readbackEl).toBeFalsy();
  });

  it('modal fetchItems returns null when adapter does not have listLoadedThreads', async () => {
    const plugin = createPlugin({});
    openLoadedThreadsModal(plugin);

    const [optionsArg] = (CodexReadbackModal as unknown as jest.Mock).mock.calls[0];
    const result = await optionsArg.fetchItems();
    expect(result).toBeNull();
  });

  it('modal fetchItems returns data from listLoadedThreads', async () => {
    const mockThreads = [{ id: 'thread-1' }, { id: 'thread-2' }];
    const plugin = createPlugin({
      listLoadedThreads: jest.fn().mockResolvedValue(mockThreads),
    });
    openLoadedThreadsModal(plugin);

    const [optionsArg] = (CodexReadbackModal as unknown as jest.Mock).mock.calls[0];
    const result = await optionsArg.fetchItems();
    expect(result).toEqual(mockThreads);
  });

  it('modal fetchItems throws when listLoadedThreads throws', async () => {
    const plugin = createPlugin({
      listLoadedThreads: jest.fn().mockRejectedValue(new Error('App-server unavailable')),
    });
    openLoadedThreadsModal(plugin);

    const [optionsArg] = (CodexReadbackModal as unknown as jest.Mock).mock.calls[0];
    await expect(optionsArg.fetchItems()).rejects.toThrow();
  });

  it('modal renderItems renders thread rows with raw JSON detail', () => {
    const mockThreads = [{ id: 'thread-1' }, { id: 'thread-2' }];
    const plugin = createPlugin({
      listLoadedThreads: jest.fn().mockResolvedValue(mockThreads),
    });
    openLoadedThreadsModal(plugin);

    const [optionsArg] = (CodexReadbackModal as unknown as jest.Mock).mock.calls[0];
    const containerEl = document.createElement('div');
    optionsArg.renderItems(containerEl, mockThreads);

    const codeEls = containerEl.querySelectorAll('.opencodian-codex-readback-code');
    expect(codeEls.length).toBe(2);
    expect(codeEls[0].textContent).toContain('thread-1');
    expect(codeEls[1].textContent).toContain('thread-2');
  });
});

function openLoadedThreadsModal(plugin: TestPlugin): void {
  const section = new SettingsCodexSection({
    plugin: plugin as never,
    createSectionHeading,
  });
  const containerEl = document.createElement('div');
  section.attachTabbed(containerEl, 'resume-inspect');

  const inspectButton = buttonRecords.find(
    (r) => r.label === t('settings.codex.loadedThreads.inspectButton'),
  );
  inspectButton!.onClick!();
}
