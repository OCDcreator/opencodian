import type { App } from 'obsidian';
import * as obsidian from 'obsidian';
import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianSettingTab } from '../../../../src/features/settings/OpenCodianSettings';
import { setLocale, t } from '../../../../src/i18n';

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

interface DropdownRecord {
  name: string;
  control: MockDropdownControl;
  onChange?: (value: string) => void | Promise<void>;
}

interface ToggleRecord {
  name: string;
  control: MockToggleControl;
  onChange?: (value: boolean) => void | Promise<void>;
}

interface MockButtonControl {
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  setCta: jest.MockedFunction<() => MockButtonControl>;
  setDisabled: jest.MockedFunction<(value: boolean) => MockButtonControl>;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
  buttonEl: HTMLButtonElement;
}

interface ButtonRecord {
  name: string;
  control: MockButtonControl;
  onClick?: () => void | Promise<void>;
}

interface MockExtraButtonControl {
  setIcon: jest.MockedFunction<(icon: string) => MockExtraButtonControl>;
  setTooltip: jest.MockedFunction<(tooltip: string) => MockExtraButtonControl>;
  setDisabled: jest.MockedFunction<(value: boolean) => MockExtraButtonControl>;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockExtraButtonControl>;
  extraSettingsEl: HTMLButtonElement;
}

interface ExtraButtonRecord {
  name: string;
  control: MockExtraButtonControl;
  onClick?: () => void | Promise<void>;
}

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

function createButtonRecord(name: string): ButtonRecord {
  const record: ButtonRecord = {
    name,
    control: {
      setButtonText: jest.fn(),
      setCta: jest.fn(),
      setDisabled: jest.fn(),
      onClick: jest.fn(),
      buttonEl: document.createElement('button'),
    },
  };

  record.control.setButtonText.mockReturnValue(record.control);
  record.control.setCta.mockReturnValue(record.control);
  record.control.setDisabled.mockReturnValue(record.control);
  record.control.onClick.mockImplementation((callback) => {
    record.onClick = callback;
    return record.control;
  });

  return record;
}

function createExtraButtonRecord(name: string): ExtraButtonRecord {
  const record: ExtraButtonRecord = {
    name,
    control: {
      setIcon: jest.fn(),
      setTooltip: jest.fn(),
      setDisabled: jest.fn(),
      onClick: jest.fn(),
      extraSettingsEl: document.createElement('button'),
    },
  };

  record.control.setIcon.mockReturnValue(record.control);
  record.control.setTooltip.mockReturnValue(record.control);
  record.control.setDisabled.mockReturnValue(record.control);
  record.control.onClick.mockImplementation((callback) => {
    record.onClick = callback;
    return record.control;
  });

  return record;
}

const dropdownRecords: DropdownRecord[] = [];
const toggleRecords: ToggleRecord[] = [];
const buttonRecords: ButtonRecord[] = [];
const extraButtonRecords: ExtraButtonRecord[] = [];

function renderConversationSettings() {
  const plugin = {
    settings: {
      ...DEFAULT_SETTINGS,
      titleMode: 'default',
      questionDisplayMode: 'all',
      questionCardPosition: 'inline',
      showAnsweredQuestionCards: true,
      aiTitleModel: '',
      renderUserMarkupAsCodeBlocks: true,
    },
    modelConfigService: null,
    saveSettings: jest.fn().mockResolvedValue(undefined),
    refreshConversationRendering: jest.fn(),
    refreshQuestionUi: jest.fn(),
  } as unknown as ConstructorParameters<typeof OpenCodianSettingTab>[1];
  const tab = new OpenCodianSettingTab({} as App, plugin);
  const containerEl = document.createElement('div');

  document.body.appendChild(containerEl);
  (tab as unknown as {
    addConversationSettings: (containerEl: HTMLElement) => HTMLHeadingElement;
  }).addConversationSettings(containerEl);

  return { plugin, tab };
}

describe('OpenCodian conversation settings', () => {

  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    dropdownRecords.length = 0;
    toggleRecords.length = 0;
    buttonRecords.length = 0;
    extraButtonRecords.length = 0;

    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
      (this as Setting & { __settingName?: string }).__settingName = name;
      return this;
    });
    jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting) {
      return this;
    });
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
    jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
      this: Setting,
      callback: (control: MockButtonControl) => unknown,
    ) {
      const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
      const record = createButtonRecord(name);
      buttonRecords.push(record);
      callback(record.control);
      return this;
    });
    jest.spyOn(Setting.prototype, 'addExtraButton').mockImplementation(function addExtraButton(
      this: Setting,
      callback: (control: MockExtraButtonControl) => unknown,
    ) {
      const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
      const record = createExtraButtonRecord(name);
      extraButtonRecords.push(record);
      callback(record.control);
      return this;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('registers the question card position dropdown and answered-card toggle with current values', () => {
    renderConversationSettings();

    const questionDisplayMode = dropdownRecords.find(
      (record) => record.name === t('settings.conversation.questionDisplayMode.name'),
    );
    const questionCardPosition = dropdownRecords.find(
      (record) => record.name === t('settings.conversation.questionCardPosition.name'),
    );
    const showAnsweredCards = toggleRecords.find(
      (record) => record.name === t('settings.conversation.showAnsweredQuestionCards.name'),
    );
    const renderUserMarkup = toggleRecords.find(
      (record) => record.name === t('settings.conversation.userMarkupAsCodeBlocks.name'),
    );

    expect(questionDisplayMode).toBeDefined();
    expect(questionDisplayMode?.control.setValue).toHaveBeenCalledWith('all');
    expect(questionCardPosition).toBeDefined();
    expect(questionCardPosition?.control.setValue).toHaveBeenCalledWith('inline');
    expect(showAnsweredCards).toBeDefined();
    expect(showAnsweredCards?.control.setValue).toHaveBeenCalledWith(true);
    expect(renderUserMarkup).toBeDefined();
    expect(renderUserMarkup?.control.setValue).toHaveBeenCalledWith(true);
  });

  it('saves and refreshes the question UI when question display mode changes', async () => {
    const { plugin } = renderConversationSettings();
    const questionDisplayMode = dropdownRecords.find(
      (record) => record.name === t('settings.conversation.questionDisplayMode.name'),
    );

    await questionDisplayMode?.onChange?.('single');

    expect(plugin.settings.questionDisplayMode).toBe('single');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.refreshQuestionUi).toHaveBeenCalledTimes(1);
    expect(plugin.refreshConversationRendering).not.toHaveBeenCalled();
  });

  it('saves and refreshes the UI when question card position changes', async () => {
    const { plugin } = renderConversationSettings();
    const questionCardPosition = dropdownRecords.find(
      (record) => record.name === t('settings.conversation.questionCardPosition.name'),
    );

    await questionCardPosition?.onChange?.('above_input');

    expect(plugin.settings.questionCardPosition).toBe('above_input');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.refreshConversationRendering).toHaveBeenCalledTimes(1);
    expect(plugin.refreshQuestionUi).toHaveBeenCalledTimes(1);
  });

  it('saves and refreshes the UI when answered recap visibility changes', async () => {
    const { plugin } = renderConversationSettings();
    const showAnsweredCards = toggleRecords.find(
      (record) => record.name === t('settings.conversation.showAnsweredQuestionCards.name'),
    );

    await showAnsweredCards?.onChange?.(false);

    expect(plugin.settings.showAnsweredQuestionCards).toBe(false);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.refreshConversationRendering).toHaveBeenCalledTimes(1);
    expect(plugin.refreshQuestionUi).toHaveBeenCalledTimes(1);
  });

  it('saves and refreshes conversation rendering when user markup rendering changes', async () => {
    const { plugin } = renderConversationSettings();
    const renderUserMarkup = toggleRecords.find(
      (record) => record.name === t('settings.conversation.userMarkupAsCodeBlocks.name'),
    );

    await renderUserMarkup?.onChange?.(false);

    expect(plugin.settings.renderUserMarkupAsCodeBlocks).toBe(false);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.refreshConversationRendering).toHaveBeenCalledTimes(1);
    expect(plugin.refreshQuestionUi).not.toHaveBeenCalled();
  });

  it('keeps an unavailable AI title model selected and shows a warning action', async () => {
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const modelConfigService = {
      getCatalogs: jest.fn().mockResolvedValue({
        local: { providers: [], defaults: {} },
        server: { providers: [], defaults: {} },
        baseEffective: {
          providers: [
            {
              id: 'openai',
              name: 'OpenAI',
              source: 'server',
              existsInLocal: false,
              existsInServer: true,
              models: [
                {
                  id: 'gpt-4.1',
                  name: 'GPT-4.1',
                  source: 'server',
                  existsInLocal: false,
                  existsInServer: true,
                },
              ],
            },
          ],
          defaults: {},
        },
        effective: {
          providers: [],
          defaults: {},
        },
        currentEnabledProviderIds: [],
        serverConfig: {},
        effectiveProviderConfig: {},
      }),
    };
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        titleMode: 'ai',
        aiTitleModel: 'openai/gpt-4.1',
      },
      modelConfigService,
      saveSettings: jest.fn().mockResolvedValue(undefined),
      refreshConversationRendering: jest.fn(),
      refreshQuestionUi: jest.fn(),
    } as unknown as ConstructorParameters<typeof OpenCodianSettingTab>[1];
    const tab = new OpenCodianSettingTab({} as App, plugin);
    const containerEl = document.createElement('div');

    document.body.appendChild(containerEl);
    (tab as unknown as {
      addConversationSettings: (containerEl: HTMLElement) => HTMLHeadingElement;
    }).addConversationSettings(containerEl);

    await Promise.resolve();
    await Promise.resolve();

    const titleModelButton = buttonRecords.find(
      (record) => record.name === t('settings.titleGeneration.model.name'),
    );
    const titleModelWarningButton = extraButtonRecords.find(
      (record) => record.name === t('settings.titleGeneration.model.name'),
    );

    expect(plugin.settings.aiTitleModel).toBe('openai/gpt-4.1');
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(titleModelButton?.control.setButtonText).toHaveBeenLastCalledWith('OpenAI / GPT-4.1');
    expect(titleModelWarningButton?.control.extraSettingsEl.style.display).toBe('');

    await titleModelWarningButton?.onClick?.();

    expect(noticeSpy).toHaveBeenCalledWith(t('settings.titleGeneration.model.unavailableNotice'));
  });
});
