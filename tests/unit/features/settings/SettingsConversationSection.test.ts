/* eslint-disable max-lines -- Conversation settings tests cover title, compaction, display, question, rendering, and deep-link target contracts together. */
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
  const reapplyCompactionConfigFromProjectConfig = jest.fn().mockResolvedValue({
    status: 'applied',
  });

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
      updateCompactionConfig,
    } as never,
    openCodeService: {
      reapplyCompactionConfigFromProjectConfig,
    } as never,
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

  it('saves compaction settings through project config with full-object save', async () => {
    const plugin = createPlugin();
    createSection(plugin);
    const autoToggle = findToggle(t('settings.conversation.compaction.auto.name'));
    expect(autoToggle).toBeDefined();

    await autoToggle?.onChange?.(false);

    const updateCompactionConfig = (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig;
    expect(updateCompactionConfig).toHaveBeenCalledWith(
      expect.objectContaining({ auto: false, prune: true, tail_turns: 2 }),
    );
    const reapply = (plugin.openCodeService as { reapplyCompactionConfigFromProjectConfig: jest.Mock })
      .reapplyCompactionConfigFromProjectConfig;
    expect(reapply).toHaveBeenCalledWith(
      expect.objectContaining({ auto: false }),
    );
    expect(plugin.saveSettings).not.toHaveBeenCalled();
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

  it('saves prune toggle through project config with full-object save', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const pruneToggle = findToggle(t('settings.conversation.compaction.prune.name'));
    expect(pruneToggle).toBeDefined();
    await pruneToggle?.onChange?.(false);

    const updateCompactionConfig = (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig;
    expect(updateCompactionConfig).toHaveBeenCalledWith(
      expect.objectContaining({ prune: false, auto: true, tail_turns: 2 }),
    );
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.conversation.compaction.savedApplied'));
  });

  it('saves tail_turns number through project config with full-object save', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const tailTurnsText = findText(t('settings.conversation.compaction.tailTurns.name'));
    expect(tailTurnsText).toBeDefined();

    await tailTurnsText?.onChange?.('5');

    const updateCompactionConfig = (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig;
    expect(updateCompactionConfig).toHaveBeenCalledWith(
      expect.objectContaining({ tail_turns: 5, auto: true, prune: true }),
    );
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.conversation.compaction.savedApplied'));
  });

  it('rejects non-integer tail_turns values like 1.9', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const tailTurnsText = findText(t('settings.conversation.compaction.tailTurns.name'));

    await tailTurnsText?.onChange?.('1.9');

    expect(
      (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig,
    ).not.toHaveBeenCalled();
  });

  it('ignores invalid tail_turns values', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const tailTurnsText = findText(t('settings.conversation.compaction.tailTurns.name'));

    await tailTurnsText?.onChange?.('0');
    await tailTurnsText?.onChange?.('-1');
    await tailTurnsText?.onChange?.('abc');

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
    expect(updateCompactionConfig).toHaveBeenCalledWith(
      expect.objectContaining({ preserve_recent_tokens: 8000 }),
    );
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.conversation.compaction.savedApplied'));
  });

  it('saves preserve_recent_tokens as undefined when cleared', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const preserveText = findText(t('settings.conversation.compaction.preserveRecentTokens.name')); await preserveText?.onChange?.('');

    const updateCompactionConfig = (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig;
    expect(updateCompactionConfig).toHaveBeenCalledWith(
      expect.objectContaining({ preserve_recent_tokens: undefined }),
    );
  });

  it('saves reserved tokens number through project config', async () => {
    const plugin = createPlugin();
    createSection(plugin);

    const reservedText = findText(t('settings.conversation.compaction.reserved.name'));
    expect(reservedText).toBeDefined();

    await reservedText?.onChange?.('16000');

    const updateCompactionConfig = (plugin.opencodeConfigManager as { updateCompactionConfig: jest.Mock }).updateCompactionConfig;
    expect(updateCompactionConfig).toHaveBeenCalledWith(
      expect.objectContaining({ reserved: 16000 }),
    );
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
