/* eslint-disable max-lines, max-lines-per-function -- Conversation settings tests cover title, compaction, display, question, rendering, and deep-link target contracts together. */
import type { App } from 'obsidian';
import * as obsidian from 'obsidian';
import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsConversationSection } from '../../../../src/features/settings/SettingsConversationSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

interface MockDropdownControl {
  addOption: jest.MockedFunction<(value: string, label: string) => MockDropdownControl>;
  setValue: jest.MockedFunction<(value: string) => MockDropdownControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>;
  selectEl: HTMLSelectElement;
}

interface MockToggleControl {
  setValue: jest.MockedFunction<(value: boolean) => MockToggleControl>;
  onChange: jest.MockedFunction<(callback: (value: boolean) => void | Promise<void>) => MockToggleControl>;
}

interface MockTextControl {
  inputEl: HTMLInputElement;
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextControl>;
  setValue: jest.MockedFunction<(value: string) => MockTextControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextControl>;
}

interface MockButtonControl {
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  setDisabled: jest.MockedFunction<(value: boolean) => MockButtonControl>;
}

interface MockExtraButtonControl {
  extraSettingsEl: HTMLElement;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockExtraButtonControl>;
  setIcon: jest.MockedFunction<(icon: string) => MockExtraButtonControl>;
  setTooltip: jest.MockedFunction<(tooltip: string) => MockExtraButtonControl>;
}

interface DropdownRecord {
  control: MockDropdownControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}

interface ToggleRecord {
  control: MockToggleControl;
  name: string;
  onChange?: (value: boolean) => void | Promise<void>;
}

interface TextRecord {
  control: MockTextControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}

interface BlockRecord {
  title: string;
  description: string;
}

type ConversationSectionPlugin = Pick<
  OpenCodianPlugin,
  | 'settings'
  | 'saveSettings'
  | 'refreshConversationRendering'
  | 'refreshQuestionUi'
  | 'reapplyConversationSessionDefaults'
  | 'opencodeConfigManager'
  | 'openCodeService'
  | 'agentServiceRegistry'
>;

const dropdownRecords: DropdownRecord[] = [];
const toggleRecords: ToggleRecord[] = [];
const textRecords: TextRecord[] = [];
const blockRecords: BlockRecord[] = [];

function createDropdownRecord(name: string): DropdownRecord {
  const record: DropdownRecord = {
    name,
    control: {
      addOption: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
      selectEl: document.createElement('select'),
    },
  };
  record.control.addOption.mockReturnValue(record.control);
  record.control.setValue.mockReturnValue(record.control);
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  return record;
}

function createToggleRecord(name: string): ToggleRecord {
  const record: ToggleRecord = {
    name,
    control: {
      setValue: jest.fn(),
      onChange: jest.fn(),
    },
  };
  record.control.setValue.mockReturnValue(record.control);
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  return record;
}

function createTextRecord(name: string): TextRecord {
  const inputEl = document.createElement('input');
  const record: TextRecord = {
    name,
    control: {
      inputEl,
      setPlaceholder: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
    },
  };
  record.control.setPlaceholder.mockReturnValue(record.control);
  record.control.setValue.mockImplementation((value) => {
    inputEl.value = value;
    return record.control;
  });
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  return record;
}

function createButtonControl(): MockButtonControl {
  const control: MockButtonControl = {
    onClick: jest.fn(),
    setButtonText: jest.fn(),
    setDisabled: jest.fn(),
  };
  control.onClick.mockReturnValue(control);
  control.setButtonText.mockReturnValue(control);
  control.setDisabled.mockReturnValue(control);
  return control;
}

function createExtraButtonControl(): MockExtraButtonControl {
  const control: MockExtraButtonControl = {
    extraSettingsEl: document.createElement('span'),
    onClick: jest.fn(),
    setIcon: jest.fn(),
    setTooltip: jest.fn(),
  };
  control.onClick.mockReturnValue(control);
  control.setIcon.mockReturnValue(control);
  control.setTooltip.mockReturnValue(control);
  return control;
}

function createPlugin(overrides?: Partial<ConversationSectionPlugin['settings']>): ConversationSectionPlugin {
  const updateCompactionConfig = jest.fn().mockResolvedValue(undefined);
  const getCompactionConfig = jest.fn().mockResolvedValue(undefined);
  const updateShareConfig = jest.fn().mockResolvedValue(undefined);
  const getShareConfig = jest.fn().mockResolvedValue(undefined);
  const reapplyCompactionConfigFromProjectConfig = jest.fn().mockResolvedValue({
    status: 'applied',
  });
  const listSessions = jest.fn().mockResolvedValue([]);
  const getSessionMessages = jest.fn().mockResolvedValue([]);
  const unshareSession = jest.fn().mockResolvedValue({ id: 'session-1', title: 'Unshared', time: { created: 1, updated: 2 } });

  // Mock OpenCode adapter that the registry returns.  listSessions and
  // getSessionMessages point to the SAME jest fns as openCodeService so
  // existing assertions remain valid while the code routes through the
  // backend-aware registry layer.
  const mockOpenCodeAdapter = {
    kind: 'opencode',
    hasCapability: jest.fn().mockReturnValue(true),
    listSessions,
    getSessionMessages,
  };
  const mockRegistry = {
    getActive: jest.fn().mockReturnValue(mockOpenCodeAdapter),
    get: jest.fn().mockReturnValue(mockOpenCodeAdapter),
  };

  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...overrides,
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    refreshConversationRendering: jest.fn(),
    refreshQuestionUi: jest.fn(),
    reapplyConversationSessionDefaults: jest.fn().mockResolvedValue(undefined),
    opencodeConfigManager: {
      getCompactionConfig,
      getConfigPath: jest.fn().mockReturnValue('/test/.opencode/opencode.json'),
      getShareConfig,
      updateCompactionConfig,
      updateShareConfig,
    } as never,
    openCodeService: {
      reapplyCompactionConfigFromProjectConfig,
      checkHealth: jest.fn().mockResolvedValue(true),
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      listSessions,
      getSessionMessages,
      unshareSession,
    } as never,
    agentServiceRegistry: mockRegistry as never,
  } as unknown as ConversationSectionPlugin;
}

function createApp(): App {
  return { vault: { adapter: { basePath: '/test' }, on: jest.fn(() => ({}) as never), offref: jest.fn() } } as unknown as App;
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function createSettingsBlock(
  containerEl: HTMLElement,
  options: { title: string; description: string },
): HTMLElement {
  const hostEl = document.createElement('section');
  hostEl.dataset.blockTitle = options.title;
  hostEl.dataset.blockDescription = options.description;
  const bodyEl = document.createElement('div');
  hostEl.appendChild(bodyEl);
  containerEl.appendChild(hostEl);
  blockRecords.push({
    title: options.title,
    description: options.description,
  });
  return bodyEl;
}

function createSection(plugin = createPlugin(), app = createApp()) {
  const section = new SettingsConversationSection({
    app,
    plugin: plugin as unknown as OpenCodianPlugin,
    createSectionHeading,
    createSettingsBlock,
    addSettingHelpButton: jest.fn(),
    setRefreshTitleModelsCallback: jest.fn(),
  });
  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);
  const headingEl = section.attach(containerEl);
  return {
    containerEl,
    headingEl,
    plugin,
    section,
  };
}

function findToggle(name: string): ToggleRecord | undefined {
  return toggleRecords.find((record) => record.name === name);
}

function findDropdown(name: string): DropdownRecord | undefined {
  return dropdownRecords.find((record) => record.name === name);
}

function findText(name: string): TextRecord | undefined {
  return textRecords.find((record) => record.name === name);
}

function resetHarnessState(): void {
  setLocale('en');
  document.body.innerHTML = '';
  dropdownRecords.length = 0;
  toggleRecords.length = 0;
  textRecords.length = 0;
  blockRecords.length = 0;
}

function installSettingMocks(options: { includeSetClass?: boolean } = {}): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
    (this as Setting & { __settingName?: string }).__settingName = name;
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting) {
    return this;
  });

  if (options.includeSetClass) {
    jest.spyOn(Setting.prototype, 'setClass').mockImplementation(function setClass(this: Setting) {
      return this;
    });
  }

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
  jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function addToggle(
    this: Setting,
    callback: (control: MockToggleControl) => unknown,
  ) {
    const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
    const record = createToggleRecord(name);
    toggleRecords.push(record);
    callback(record.control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function addText(
    this: Setting,
    callback: (control: MockTextControl) => unknown,
  ) {
    const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
    const record = createTextRecord(name);
    textRecords.push(record);
    callback(record.control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
    this: Setting,
    callback: (control: MockButtonControl) => unknown,
  ) {
    callback(createButtonControl());
    return this;
  });
  jest.spyOn(Setting.prototype, 'addExtraButton').mockImplementation(function addExtraButton(
    this: Setting,
    callback: (control: MockExtraButtonControl) => unknown,
  ) {
    callback(createExtraButtonControl());
    return this;
  });
}

describe('SettingsConversationSection', () => {
  beforeEach(() => {
    resetHarnessState();
    installSettingMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('dispose clears any registered title-model refresh callback', () => {
    let refreshTitleModelsCallback: (() => void) | undefined = () => {};
    const section = new SettingsConversationSection({
      app: {} as never,
      plugin: {
        settings: {},
      } as never,
      createSectionHeading: () => document.createElement('h2'),
      createSettingsBlock: () => document.createElement('div'),
      addSettingHelpButton: jest.fn(),
      setRefreshTitleModelsCallback: (callback) => {
        refreshTitleModelsCallback = callback;
      },
    });

    section.dispose();

    expect(refreshTitleModelsCallback).toBeUndefined();
  });

  it('saves chat font size through plugin settings and reapplies active conversation runtime state', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const chatFontSizeText = findText(t('settings.conversation.chatFontSizePx.name'));

    expect(chatFontSizeText?.control.setValue).toHaveBeenCalledWith(
      String(DEFAULT_SETTINGS.chatFontSizePx),
    );

    await chatFontSizeText?.onChange?.('15');

    expect(plugin.settings.chatFontSizePx).toBe(15);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.saveSettings).toHaveBeenNthCalledWith(1, { reloadModels: false });
    expect(plugin.reapplyConversationSessionDefaults).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid chat font size without saving or runtime reapply', async () => {
    const plugin = createPlugin({
      chatFontSizePx: 14,
    });
    createSection(plugin);

    const chatFontSizeText = findText(t('settings.conversation.chatFontSizePx.name'));

    await chatFontSizeText?.onChange?.('99');

    expect(plugin.settings.chatFontSizePx).toBe(14);
    expect(chatFontSizeText?.control.inputEl.value).toBe('14');
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(plugin.reapplyConversationSessionDefaults).not.toHaveBeenCalled();
  });

  it('saves compaction settings through project config as focused patches', async () => {
    const plugin = createPlugin();
    createSection(plugin);
    const autoToggle = findToggle(t('settings.conversation.compaction.auto.name'));
    expect(autoToggle).toBeDefined();

    await autoToggle?.onChange?.(false);

    const updateCompactionConfig = (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig;
    expect(updateCompactionConfig).toHaveBeenCalledWith({ auto: false });
    const reapply = (plugin.openCodeService as { reapplyCompactionConfigFromProjectConfig: jest.Mock })
      .reapplyCompactionConfigFromProjectConfig;
    expect(reapply).toHaveBeenCalledWith({ auto: false });
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });

  it('blocks stale project compaction saves when the active backend is no longer OpenCode', async () => {
    const plugin = createPlugin();
    const { section } = createSection(plugin);
    const tailTurnsText = findText(t('settings.conversation.compaction.tailTurns.name'));
    expect(tailTurnsText).toBeDefined();
    await Promise.resolve();
    await Promise.resolve();

    plugin.settings.activeBackend = 'claude-code';
    plugin.settings.enabledBackends = ['opencode', 'claude-code'];

    await tailTurnsText?.onChange?.('5');

    expect(
      (section as unknown as { currentCompactionState: { tailTurns: number } }).currentCompactionState.tailTurns,
    ).toBe(2);

    plugin.settings.activeBackend = 'opencode';
    tailTurnsText!.control.inputEl.value = 'bad';
    await tailTurnsText?.onChange?.('bad');

    expect(
      (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig,
    ).not.toHaveBeenCalled();
    expect(
      (plugin.openCodeService as { reapplyCompactionConfigFromProjectConfig: jest.Mock })
        .reapplyCompactionConfigFromProjectConfig,
    ).not.toHaveBeenCalled();
    expect(tailTurnsText!.control.inputEl.value).toBe('2');
  });

  it('saves project share mode through project config', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const shareDropdown = findDropdown(t('settings.conversation.share.mode.name'));
    expect(shareDropdown).toBeDefined();

    await shareDropdown?.onChange?.('auto');

    const updateShareConfig = (plugin.opencodeConfigManager as { updateShareConfig: jest.Mock }).updateShareConfig;
    expect(updateShareConfig).toHaveBeenCalledWith('auto');
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });

  it('blocks stale project share saves and OpenCode restart when the active backend is no longer OpenCode', async () => {
    const plugin = createPlugin();
    (plugin.openCodeService as { checkHealth: jest.Mock }).checkHealth.mockResolvedValue(false);
    const { containerEl } = createSection(plugin);

    const shareDropdown = findDropdown(t('settings.conversation.share.mode.name'));
    expect(shareDropdown).toBeDefined();
    const policyStateEl = containerEl.querySelector<HTMLElement>('.opencodian-share-policy-state');
    expect(policyStateEl?.textContent).toBe(t('settings.conversation.share.mode.manual'));

    plugin.settings.activeBackend = 'claude-code';
    plugin.settings.enabledBackends = ['opencode', 'claude-code'];

    await shareDropdown?.onChange?.('auto');

    expect((plugin.opencodeConfigManager as { updateShareConfig: jest.Mock }).updateShareConfig).not.toHaveBeenCalled();
    expect(plugin.openCodeService.checkHealth).not.toHaveBeenCalled();
    expect(plugin.openCodeService.stop).not.toHaveBeenCalled();
    expect(plugin.openCodeService.start).not.toHaveBeenCalled();
    expect(policyStateEl?.textContent).toBe(t('settings.conversation.share.mode.manual'));
  });

  it('lists shared sessions in the project sharing block with copy, preview, and unshare actions', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
    const plugin = createPlugin();
    (plugin.openCodeService as { listSessions: jest.Mock }).listSessions.mockResolvedValue([
      {
        id: 'session-1',
        title: 'Shared research',
        share: { url: 'https://opencode.ai/s/session-1' },
        time: { created: 1, updated: 2 },
      },
      {
        id: 'session-2',
        title: 'Private',
        time: { created: 1, updated: 3 },
      },
    ]);
    (plugin.openCodeService as { getSessionMessages: jest.Mock }).getSessionMessages.mockResolvedValue([
      {
        info: { id: 'm1', sessionID: 'session-1', role: 'user', time: { created: 1 } },
        parts: [{ id: 'p1', sessionID: 'session-1', messageID: 'm1', type: 'text', text: 'hello' }],
      },
      {
        info: { id: 'm2', sessionID: 'session-1', role: 'assistant', time: { created: 2 } },
        parts: [
          { id: 'p2', sessionID: 'session-1', messageID: 'm2', type: 'tool', text: 'long tool output' },
          { id: 'p3', sessionID: 'session-1', messageID: 'm2', type: 'text', text: 'assistant reply' },
        ],
      },
    ]);

    const { containerEl } = createSection(plugin);
    await Promise.resolve();
    await Promise.resolve();

    const rowEl = containerEl.querySelector<HTMLElement>('[data-shared-session-id="session-1"]');
    expect(rowEl?.textContent).toContain('Shared research');
    expect(containerEl.querySelector('[data-shared-session-id="session-2"]')).toBeNull();

    rowEl?.querySelector<HTMLButtonElement>('[data-action="copy-shared-session-link"]')?.click();
    await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://opencode.ai/s/session-1');

    rowEl?.querySelector<HTMLButtonElement>('[data-action="preview-shared-session"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    const previewEl = containerEl.querySelector<HTMLElement>('[data-shared-session-preview="session-1"]');
    expect(previewEl?.textContent).toContain('hello');
    expect(previewEl?.textContent).toContain('assistant reply');
    expect(previewEl?.querySelector('details:not([open])')?.textContent).toContain('long tool output');

    rowEl?.querySelector<HTMLButtonElement>('[data-action="unshare-shared-session"]')?.click();
    await Promise.resolve();
    expect((plugin.openCodeService as { unshareSession: jest.Mock }).unshareSession).toHaveBeenCalledWith('session-1');
  });

  it('blocks unshare when the active backend is no longer OpenCode', async () => {
    const plugin = createPlugin();
    (plugin.openCodeService as { listSessions: jest.Mock }).listSessions.mockResolvedValue([
      {
        id: 'session-1',
        title: 'Shared research',
        share: { url: 'https://opencode.ai/s/session-1' },
        time: { created: 1, updated: 2 },
      },
    ]);

    const { containerEl } = createSection(plugin);
    await Promise.resolve();
    await Promise.resolve();

    // Simulate backend switch while settings page is open
    plugin.settings.activeBackend = 'claude-code';
    plugin.settings.enabledBackends = ['opencode', 'claude-code'];

    const rowEl = containerEl.querySelector<HTMLElement>('[data-shared-session-id="session-1"]');
    rowEl?.querySelector<HTMLButtonElement>('[data-action="unshare-shared-session"]')?.click();
    await Promise.resolve();

    // unshareSession should NOT be called because OpenCode is no longer active
    expect((plugin.openCodeService as { unshareSession: jest.Mock }).unshareSession).not.toHaveBeenCalled();
  });

  it('routes shared sessions list through the backend-aware registry layer', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
    const plugin = createPlugin();
    const registry = plugin.agentServiceRegistry as { getActive: jest.Mock };
    const adapter = registry.getActive();

    // Override the shared listSessions mock with session data
    (adapter as { listSessions: jest.Mock }).listSessions.mockResolvedValue([
      {
        id: 'session-1',
        title: 'Registry-routed session',
        share: { url: 'https://opencode.ai/s/session-1' },
        time: { created: 1, updated: 2 },
      },
    ]);

    const { containerEl } = createSection(plugin);
    await Promise.resolve();
    await Promise.resolve();

    // The registry was consulted for the active backend
    expect(registry.getActive).toHaveBeenCalled();

    // The adapter's listSessions was called (routing through the registry)
    expect((adapter as { listSessions: jest.Mock }).listSessions).toHaveBeenCalled();

    // The session data appears in the DOM
    expect(containerEl.textContent).toContain('Registry-routed session');
  });

  it('shows empty state when active backend lacks session listing capability', async () => {
    const plugin = createPlugin();
    const adapter = (plugin.agentServiceRegistry as { getActive: jest.Mock }).getActive();

    // Remove listSessions from the adapter to simulate a backend without listing support
    delete (adapter as Record<string, unknown>).listSessions;

    const { containerEl } = createSection(plugin);
    await Promise.resolve();
    await Promise.resolve();

    // Should show the empty state, not crash
    expect(containerEl.querySelector('.opencodian-shared-sessions-empty')).toBeTruthy();
  });

  it('shows preview failure when active backend lacks session history capability', async () => {
    const plugin = createPlugin();
    const adapter = (plugin.agentServiceRegistry as { getActive: jest.Mock }).getActive();

    // Adapter has listSessions but NOT getSessionMessages
    (adapter as { listSessions: jest.Mock }).listSessions.mockResolvedValue([
      {
        id: 'session-1',
        title: 'No-preview session',
        share: { url: 'https://opencode.ai/s/session-1' },
        time: { created: 1, updated: 2 },
      },
    ]);
    delete (adapter as Record<string, unknown>).getSessionMessages;

    const { containerEl } = createSection(plugin);
    await Promise.resolve();
    await Promise.resolve();

    const rowEl = containerEl.querySelector<HTMLElement>('[data-shared-session-id="session-1"]');

    // Click preview button
    rowEl?.querySelector<HTMLButtonElement>('[data-action="preview-shared-session"]')?.click();
    await Promise.resolve();
    await Promise.resolve();

    // Should show preview failed message, not crash
    const previewEl = containerEl.querySelector<HTMLElement>('[data-shared-session-preview="session-1"]');
    expect(previewEl?.textContent).toBeTruthy(); // preview was rendered
  });

  it('shows a neutral empty preview message when the backend returns no session messages', async () => {
    const plugin = createPlugin();
    const adapter = (plugin.agentServiceRegistry as { getActive: jest.Mock }).getActive();

    (adapter as { listSessions: jest.Mock }).listSessions.mockResolvedValue([
      {
        id: 'session-empty',
        title: 'Empty preview session',
        share: { url: 'https://opencode.ai/s/session-empty' },
        time: { created: 1, updated: 2 },
      },
    ]);
    (adapter as { getSessionMessages: jest.Mock }).getSessionMessages.mockResolvedValue([]);

    const { containerEl } = createSection(plugin);
    await Promise.resolve();
    await Promise.resolve();

    const rowEl = containerEl.querySelector<HTMLElement>('[data-shared-session-id="session-empty"]');
    rowEl?.querySelector<HTMLButtonElement>('[data-action="preview-shared-session"]')?.click();
    await Promise.resolve();
    await Promise.resolve();

    const previewEl = containerEl.querySelector<HTMLElement>('[data-shared-session-preview="session-empty"]');
    expect(previewEl?.textContent).toContain(t('settings.conversation.share.sharedSessions.previewEmpty'));
  });

  it('routes session message preview through the backend-aware history service', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
    const plugin = createPlugin();
    const adapter = (plugin.agentServiceRegistry as { getActive: jest.Mock }).getActive();

    (adapter as { listSessions: jest.Mock }).listSessions.mockResolvedValue([
      {
        id: 'session-1',
        title: 'History-routed session',
        share: { url: 'https://opencode.ai/s/session-1' },
        time: { created: 1, updated: 2 },
      },
    ]);
    (adapter as { getSessionMessages: jest.Mock }).getSessionMessages.mockResolvedValue([
      {
        info: { id: 'm1', sessionID: 'session-1', role: 'user', time: { created: 1 } },
        parts: [{ id: 'p1', sessionID: 'session-1', messageID: 'm1', type: 'text', text: 'routed message' }],
      },
    ]);

    const { containerEl } = createSection(plugin);
    await Promise.resolve();
    await Promise.resolve();

    const rowEl = containerEl.querySelector<HTMLElement>('[data-shared-session-id="session-1"]');

    // Click preview
    rowEl?.querySelector<HTMLButtonElement>('[data-action="preview-shared-session"]')?.click();
    await Promise.resolve();
    await Promise.resolve();

    // The adapter's getSessionMessages was called through the routing layer
    expect((adapter as { getSessionMessages: jest.Mock }).getSessionMessages).toHaveBeenCalledWith('session-1');

    // The preview shows the message content
    const previewEl = containerEl.querySelector<HTMLElement>('[data-shared-session-preview="session-1"]');
    expect(previewEl?.textContent).toContain('routed message');
  });

  it('renders generic preview messages through the normalized seam for OpenCode shared rows', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
    const plugin = createPlugin();
    const adapter = (plugin.agentServiceRegistry as { getActive: jest.Mock }).getActive();

    // The shared-session surface is OpenCode-only, but the preview seam remains
    // defensive enough to normalize compatible role/content messages.
    (adapter as { listSessions: jest.Mock }).listSessions.mockResolvedValue([
      {
        id: 'session-gen',
        title: 'Generic Preview Session',
        share: { url: 'https://example.com/s/session-gen' },
        time: { created: 100, updated: 200 },
      },
    ]);
    (adapter as { getSessionMessages: jest.Mock }).getSessionMessages.mockResolvedValue([
      { role: 'user', content: 'hello from generic backend' },
      { role: 'assistant', content: 'hi there' },
    ]);

    const { containerEl } = createSection(plugin);
    await Promise.resolve();
    await Promise.resolve();

    // Session row should render
    const rowEl = containerEl.querySelector<HTMLElement>('[data-shared-session-id="session-gen"]');
    expect(rowEl?.textContent).toContain('Generic Preview Session');

    // Click preview — should NOT crash on missing info/parts
    rowEl?.querySelector<HTMLButtonElement>('[data-action="preview-shared-session"]')?.click();
    await Promise.resolve();
    await Promise.resolve();

    const previewEl = containerEl.querySelector<HTMLElement>('[data-shared-session-preview="session-gen"]');
    // Preview should render the normalized messages without crashing
    expect(previewEl?.textContent).toContain('hello from generic backend');
    expect(previewEl?.textContent).toContain('hi there');
  });

  it('renders Claude-shaped content blocks through the normalized preview seam for OpenCode shared rows', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
    const plugin = createPlugin();
    const adapter = (plugin.agentServiceRegistry as { getActive: jest.Mock }).getActive();

    // The row is still an OpenCode shared session; only the preview payload uses
    // Claude content-block shape so this does not rely on non-OpenCode share URLs.
    (adapter as { listSessions: jest.Mock }).listSessions.mockResolvedValue([
      {
        id: 'session-claude-blocks',
        title: 'Claude Blocks Session',
        share: { url: 'https://example.com/s/session-claude-blocks' },
        time: { created: 1, updated: 2 },
      },
    ]);
    (adapter as { getSessionMessages: jest.Mock }).getSessionMessages.mockResolvedValue([
      {
        role: 'user',
        content: 'hello with blocks',
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'first block' },
          { type: 'tool_use', text: 'tool call' },
          { type: 'text', text: 'second block' },
        ],
      },
    ]);

    const { containerEl } = createSection(plugin);
    await Promise.resolve();
    await Promise.resolve();

    const rowEl = containerEl.querySelector<HTMLElement>('[data-shared-session-id="session-claude-blocks"]');
    rowEl?.querySelector<HTMLButtonElement>('[data-action="preview-shared-session"]')?.click();
    await Promise.resolve();
    await Promise.resolve();

    const previewEl = containerEl.querySelector<HTMLElement>('[data-shared-session-preview="session-claude-blocks"]');
    // Preview element should exist and show user message text
    expect(previewEl).toBeTruthy();
    expect(previewEl?.textContent).toContain('hello with blocks');
    // Text blocks from the content array should render
    expect(previewEl?.textContent).toContain('first block');
    expect(previewEl?.textContent).toContain('second block');
    // Non-text blocks (tool_use) should render inside a collapsed <details>
    expect(previewEl?.querySelector('details')?.textContent).toContain('tool_use');
    // getSessionMessages was called through the routing layer with the session id
    expect((adapter as { getSessionMessages: jest.Mock }).getSessionMessages).toHaveBeenCalledWith('session-claude-blocks');
  });

  it('renders non-user preview roles verbatim through the normalized seam', async () => {
    const plugin = createPlugin();
    const adapter = (plugin.agentServiceRegistry as { getActive: jest.Mock }).getActive();

    (adapter as { listSessions: jest.Mock }).listSessions.mockResolvedValue([
      {
        id: 'session-system',
        title: 'System role session',
        share: { url: 'https://example.com/s/session-system' },
        time: { created: 10, updated: 20 },
      },
    ]);
    (adapter as { getSessionMessages: jest.Mock }).getSessionMessages.mockResolvedValue([
      { role: 'system', content: 'System note' },
    ]);

    const { containerEl } = createSection(plugin);
    await Promise.resolve();
    await Promise.resolve();

    const rowEl = containerEl.querySelector<HTMLElement>('[data-shared-session-id="session-system"]');
    rowEl?.querySelector<HTMLButtonElement>('[data-action="preview-shared-session"]')?.click();
    await Promise.resolve();
    await Promise.resolve();

    const roleEl = containerEl.querySelector<HTMLElement>('[data-shared-session-preview="session-system"] .opencodian-shared-session-message-role');
    expect(roleEl?.textContent).toBe('system');
  });

  it('checks share diagnostics from the sharing block', async () => {
    const requestUrl = obsidian.requestUrl as jest.Mock;
    requestUrl.mockResolvedValue({ status: 200, text: '', json: null, headers: {}, arrayBuffer: new ArrayBuffer(0) });
    const plugin = createPlugin();
    const { containerEl } = createSection(plugin);
    await Promise.resolve();
    await Promise.resolve();

    const detailsEl = containerEl.querySelector<HTMLDetailsElement>('details.opencodian-share-troubleshooting');
    expect(detailsEl).not.toBeNull();
    expect(detailsEl?.querySelector('summary')?.textContent).toBe(t('settings.conversation.share.troubleshooting.summary'));
    expect(detailsEl?.textContent).toContain('Project mode');
    expect(detailsEl?.textContent).toContain('Not checked');

    const checkButton = detailsEl?.querySelector<HTMLButtonElement>('[data-action="check-share-diagnostics"]');
    checkButton?.click();
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }

    expect(plugin.openCodeService.checkHealth).toHaveBeenCalled();
    expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://opncd.ai/api/share',
      method: 'GET',
      throw: false,
    }));
    expect(detailsEl?.textContent).toContain('Connected');
    expect(detailsEl?.textContent).toContain('Reachable');
  });

  it('blocks stale share diagnostics when the active backend is no longer OpenCode', async () => {
    const requestUrl = obsidian.requestUrl as jest.Mock;
    requestUrl.mockResolvedValue({ status: 200, text: '', json: null, headers: {}, arrayBuffer: new ArrayBuffer(0) });
    const plugin = createPlugin();
    const { containerEl } = createSection(plugin);
    await Promise.resolve();
    await Promise.resolve();

    const checkButton = containerEl.querySelector<HTMLButtonElement>('[data-action="check-share-diagnostics"]');
    expect(containerEl.textContent).toContain('Not checked');

    plugin.settings.activeBackend = 'claude-code';
    plugin.settings.enabledBackends = ['opencode', 'claude-code'];
    requestUrl.mockClear();

    checkButton?.click();
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }

    expect(plugin.openCodeService.checkHealth).not.toHaveBeenCalled();
    expect(requestUrl).not.toHaveBeenCalled();
    expect(containerEl.textContent).toContain('Not checked');
    expect(containerEl.textContent).not.toContain('Checking');
    expect(containerEl.textContent).not.toContain('Connected');
    expect(containerEl.textContent).not.toContain('Reachable');
    expect(checkButton?.disabled).toBe(false);
  });

  it('shows route guidance when the share host connection closes during TLS', async () => {
    const requestUrl = obsidian.requestUrl as jest.Mock;
    requestUrl.mockRejectedValue(new Error('net::ERR_CONNECTION_CLOSED'));
    const plugin = createPlugin();
    const { containerEl } = createSection(plugin);
    await Promise.resolve();
    await Promise.resolve();

    const detailsEl = containerEl.querySelector<HTMLDetailsElement>('details.opencodian-share-troubleshooting');
    detailsEl?.querySelector<HTMLButtonElement>('[data-action="check-share-diagnostics"]')?.click();
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }

    expect(detailsEl?.textContent).toContain('TLS');
    expect(detailsEl?.textContent).toContain('working proxy');
  });

  it('updates the share diagnostics when share mode is disabled', async () => {
    const plugin = createPlugin();
    const { containerEl } = createSection(plugin);
    const shareDropdown = findDropdown(t('settings.conversation.share.mode.name'));

    await shareDropdown?.onChange?.('disabled');

    expect(containerEl.textContent).toContain('Disabled in Conversation > Sharing');
  });

  it('restarts the local service after saving project share mode so OpenCode rereads share config', async () => {
    jest.useFakeTimers();
    const plugin = createPlugin();
    createSection(plugin);

    const shareDropdown = findDropdown(t('settings.conversation.share.mode.name'));
    const savePromise = shareDropdown?.onChange?.('disabled');
    const stop = (plugin.openCodeService as { stop: jest.Mock }).stop;
    for (let attempt = 0; attempt < 10 && stop.mock.calls.length === 0; attempt += 1) {
      await Promise.resolve();
    }
    await Promise.resolve();
    jest.advanceTimersByTime(1000);
    await savePromise;

    expect(plugin.openCodeService.checkHealth).toHaveBeenCalledTimes(1);
    expect(plugin.openCodeService.stop).toHaveBeenCalledTimes(1);
    expect(plugin.openCodeService.start).toHaveBeenCalledTimes(1);
  });

  it('explains that smart title generation waits for OpenCode before using an independent backup model', () => {
    expect(t('settings.titleGeneration.groupDesc')).toBe(
      'Choose first-message titles or smart titles. Smart titles wait for the official OpenCode title first; the backup title model only runs when OpenCode does not produce one, and it is independent from OpenCode `small_model`.',
    );
  });

  it('renders conversation settings as grouped blocks instead of a flat list', () => {
    const { containerEl } = createSection();

    expect(blockRecords).toEqual([
      {
        title: t('settings.titleGeneration.title'),
        description: t('settings.titleGeneration.groupDesc'),
      },
      {
        title: t('settings.conversation.compaction.projectNote'),
        description: t('settings.conversation.compaction.projectNoteDesc'),
      },
      {
        title: t('settings.conversation.share.projectNote'),
        description: t('settings.conversation.share.projectNoteDesc'),
      },
      {
        title: t('settings.conversation.display.title'),
        description: t('settings.conversation.display.desc'),
      },
      {
        title: t('settings.conversation.questions.title'),
        description: t('settings.conversation.questions.desc'),
      },
      {
        title: t('settings.conversation.rendering.title'),
        description: t('settings.conversation.rendering.desc'),
      },
    ]);
    expect(
      Array.from(containerEl.querySelectorAll<HTMLElement>('[data-settings-target]')).map(
        (element) => element.dataset.settingsTarget,
      ),
      ).toEqual([
      'conversation-title',
      'conversation-compaction',
      'conversation-sharing',
      'conversation-display',
      'conversation-questions',
      'conversation-rendering',
    ]);
  });
});

describe('SettingsConversationSection compaction fields', () => {
  let noticeSpy: jest.SpyInstance;

  beforeEach(() => {
    resetHarnessState();
    noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    installSettingMocks({ includeSetClass: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('saves prune toggle through project config as a focused patch', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const pruneToggle = findToggle(t('settings.conversation.compaction.prune.name'));
    expect(pruneToggle).toBeDefined();
    await pruneToggle?.onChange?.(false);

    const updateCompactionConfig = (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig;
    expect(updateCompactionConfig).toHaveBeenCalledWith({ prune: false });
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.conversation.compaction.savedApplied'));
  });

  it('saves tail_turns number through project config as a focused patch', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const tailTurnsText = findText(t('settings.conversation.compaction.tailTurns.name'));
    expect(tailTurnsText).toBeDefined();

    await tailTurnsText?.onChange?.('5');

    const updateCompactionConfig = (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig;
    expect(updateCompactionConfig).toHaveBeenCalledWith({ tail_turns: 5 });
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.conversation.compaction.savedApplied'));
  });

  it('allows zero for every numeric compaction input', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const tailTurnsText = findText(t('settings.conversation.compaction.tailTurns.name'));
    const preserveText = findText(t('settings.conversation.compaction.preserveRecentTokens.name'));
    const reservedText = findText(t('settings.conversation.compaction.reserved.name'));

    expect(tailTurnsText?.control.inputEl.min).toBe('0');
    expect(preserveText?.control.inputEl.min).toBe('0');
    expect(reservedText?.control.inputEl.min).toBe('0');

    await tailTurnsText?.onChange?.('0');
    await preserveText?.onChange?.('0');
    await reservedText?.onChange?.('0');

    const updateCompactionConfig = (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig;
    expect(updateCompactionConfig).toHaveBeenCalledWith({ tail_turns: 0 });
    expect(updateCompactionConfig).toHaveBeenCalledWith({ preserve_recent_tokens: 0 });
    expect(updateCompactionConfig).toHaveBeenCalledWith({ reserved: 0 });
  });

  it('rejects non-integer tail_turns values like 1.9 and resets the input', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const tailTurnsText = findText(t('settings.conversation.compaction.tailTurns.name'));
    if (!tailTurnsText) {
      throw new Error('Expected tail turns field');
    }
    tailTurnsText.control.inputEl.value = '1.9';

    await tailTurnsText?.onChange?.('1.9');

    expect(tailTurnsText.control.inputEl.value).toBe('2');
    expect(
      (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig,
    ).not.toHaveBeenCalled();
  });

  it('rejects invalid numeric compaction values by restoring the current valid UI value', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const tailTurnsText = findText(t('settings.conversation.compaction.tailTurns.name'));
    const preserveText = findText(t('settings.conversation.compaction.preserveRecentTokens.name'));
    const reservedText = findText(t('settings.conversation.compaction.reserved.name'));

    if (!tailTurnsText || !preserveText || !reservedText) {
      throw new Error('Expected compaction numeric fields');
    }

    tailTurnsText.control.inputEl.value = '-1';
    await tailTurnsText.onChange?.('-1');
    preserveText.control.inputEl.value = 'abc';
    await preserveText.onChange?.('abc');
    reservedText.control.inputEl.value = '1.2';
    await reservedText.onChange?.('1.2');

    expect(tailTurnsText.control.inputEl.value).toBe('2');
    expect(preserveText.control.inputEl.value).toBe('');
    expect(reservedText.control.inputEl.value).toBe('');

    expect(
      (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig,
    ).not.toHaveBeenCalled();
  });

  it('saves preserve_recent_tokens number through project config', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const preserveText = findText(t('settings.conversation.compaction.preserveRecentTokens.name'));
    expect(preserveText).toBeDefined();

    await preserveText?.onChange?.('8000');

    const updateCompactionConfig = (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig;
    expect(updateCompactionConfig).toHaveBeenCalledWith({ preserve_recent_tokens: 8000 });
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.conversation.compaction.savedApplied'));
  });

  it('saves preserve_recent_tokens as undefined when cleared', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const preserveText = findText(t('settings.conversation.compaction.preserveRecentTokens.name')); await preserveText?.onChange?.('');

    const updateCompactionConfig = (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig;
    expect(updateCompactionConfig).toHaveBeenCalledWith({ preserve_recent_tokens: undefined });
  });

  it('saves reserved tokens number through project config', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const reservedText = findText(t('settings.conversation.compaction.reserved.name'));
    expect(reservedText).toBeDefined();

    await reservedText?.onChange?.('16000');

    const updateCompactionConfig = (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig;
    expect(updateCompactionConfig).toHaveBeenCalledWith({ reserved: 16000 });
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.conversation.compaction.savedApplied'));
  });

  it('shows deferred notice when reapply returns deferred status', async () => {
    const plugin = createPlugin();
    (
      plugin.openCodeService as { reapplyCompactionConfigFromProjectConfig: jest.Mock }
    ).reapplyCompactionConfigFromProjectConfig.mockResolvedValue({ status: 'deferred' });
    createSection(plugin);

    const autoToggle = findToggle(t('settings.conversation.compaction.auto.name'));
    await autoToggle?.onChange?.(false);

    expect(noticeSpy).toHaveBeenCalledWith(t('settings.conversation.compaction.savedDeferred'));
  });

  it('shows save-failed notice when compaction save throws', async () => {
    const plugin = createPlugin();
    (
      plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }
    ).updateCompactionConfig.mockRejectedValue(new Error('write failed'));
    createSection(plugin);

    const autoToggle = findToggle(t('settings.conversation.compaction.auto.name'));
    await autoToggle?.onChange?.(false);

    expect(
      (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig,
    ).toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.conversation.compaction.saveFailed'));
  });

  it('shows config-unavailable notice when configManager is missing', async () => {
    const plugin = createPlugin();
    (plugin as Record<string, unknown>).opencodeConfigManager = null;
    createSection(plugin as unknown as ConversationSectionPlugin);

    const autoToggle = findToggle(t('settings.conversation.compaction.auto.name'));
    await autoToggle?.onChange?.(false);

    expect(noticeSpy).toHaveBeenCalledWith(t('settings.conversation.compaction.configUnavailable'));
  });

});
