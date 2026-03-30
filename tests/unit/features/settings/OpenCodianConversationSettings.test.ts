import type { App } from 'obsidian';
import { Setting } from 'obsidian';

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

describe('OpenCodian conversation settings', () => {
  const dropdownRecords: DropdownRecord[] = [];
  const toggleRecords: ToggleRecord[] = [];

  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    dropdownRecords.length = 0;
    toggleRecords.length = 0;

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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function renderConversationSettings() {
    const plugin = {
      settings: {
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

  it('registers the question card position dropdown and answered-card toggle with current values', () => {
    renderConversationSettings();

    const questionCardPosition = dropdownRecords.find(
      (record) => record.name === t('settings.conversation.questionCardPosition.name'),
    );
    const showAnsweredCards = toggleRecords.find(
      (record) => record.name === t('settings.conversation.showAnsweredQuestionCards.name'),
    );

    expect(questionCardPosition).toBeDefined();
    expect(questionCardPosition?.control.setValue).toHaveBeenCalledWith('inline');
    expect(showAnsweredCards).toBeDefined();
    expect(showAnsweredCards?.control.setValue).toHaveBeenCalledWith(true);
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
});
