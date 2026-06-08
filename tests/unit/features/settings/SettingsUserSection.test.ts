import { Setting } from 'obsidian';

import { SettingsUserSection } from '../../../../src/features/settings/SettingsUserSection';
import { TextareaSizeMemory } from '../../../../src/features/settings/TextareaSizeMemory';
import { setLocale, t } from '../../../../src/i18n';

interface MockTextControl {
  inputEl: HTMLInputElement;
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextControl>;
  setValue: jest.MockedFunction<(value: string) => MockTextControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextControl>;
}

interface MockTextAreaControl {
  inputEl: HTMLTextAreaElement;
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextAreaControl>;
  setValue: jest.MockedFunction<(value: string) => MockTextAreaControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextAreaControl>;
}

interface TextAreaRecord {
  control: MockTextAreaControl;
  name: string;
}

const textAreaRecords: TextAreaRecord[] = [];

function createTextControl(): MockTextControl {
  const inputEl = document.createElement('input');
  const control: MockTextControl = {
    inputEl,
    setPlaceholder: jest.fn(),
    setValue: jest.fn(),
    onChange: jest.fn(),
  };
  control.setPlaceholder.mockReturnValue(control);
  control.setValue.mockImplementation((value) => {
    inputEl.value = value;
    return control;
  });
  control.onChange.mockReturnValue(control);
  return control;
}

function createTextAreaRecord(name: string): TextAreaRecord {
  const inputEl = document.createElement('textarea');
  const control: MockTextAreaControl = {
    inputEl,
    setPlaceholder: jest.fn(),
    setValue: jest.fn(),
    onChange: jest.fn(),
  };
  control.setPlaceholder.mockReturnValue(control);
  control.setValue.mockImplementation((value) => {
    inputEl.value = value;
    return control;
  });
  control.onChange.mockReturnValue(control);
  return { control, name };
}

describe('SettingsUserSection', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    textAreaRecords.length = 0;
    jest.spyOn(TextareaSizeMemory, 'attach').mockReturnValue({
      destroy: jest.fn(),
    } as unknown as TextareaSizeMemory);

    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
      (this as Setting & { __settingName?: string }).__settingName = name;
      return this;
    });
    jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting) {
      return this;
    });
    jest.spyOn(Setting.prototype, 'addText').mockImplementation(function addText(
      this: Setting,
      callback: (control: MockTextControl) => unknown,
    ) {
      callback(createTextControl());
      return this;
    });
    jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(function addTextArea(
      this: Setting,
      callback: (control: MockTextAreaControl) => unknown,
    ) {
      const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
      const record = createTextAreaRecord(name);
      textAreaRecords.push(record);
      callback(record.control);
      return this;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('attaches textarea size memory to the system prompt and excluded tags textareas', () => {
    const plugin = {
      settings: {
        userName: 'User',
        systemPrompt: 'You are a helpful assistant.',
        excludedTags: ['system'],
      },
      saveSettings: jest.fn().mockResolvedValue(undefined),
    };
    const section = new SettingsUserSection(plugin as never, {
      createSectionHeading: (containerEl, title) => containerEl.createEl('h3', { text: title }),
    });
    const containerEl = document.createElement('div');

    section.attach(containerEl);

    const promptRecord = textAreaRecords.find(
      (record) => record.name === t('settings.user.systemPrompt.name'),
    );
    const excludedTagsRecord = textAreaRecords.find(
      (record) => record.name === t('settings.user.excludedTags.name'),
    );

    expect(promptRecord).toBeDefined();
    expect(excludedTagsRecord).toBeDefined();
    expect(TextareaSizeMemory.attach).toHaveBeenCalledWith(
      promptRecord!.control.inputEl,
      'user-system-prompt',
    );
    expect(TextareaSizeMemory.attach).toHaveBeenCalledWith(
      excludedTagsRecord!.control.inputEl,
      'user-excluded-tags',
    );
  });
});
