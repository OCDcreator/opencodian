import { Notice, Setting } from 'obsidian';

import type { McpServerSnapshot } from '../../../../../src/core/opencode/types';
import type OpenCodianPlugin from '../../../../../src/main';

export interface MockButtonControl {
  buttonEl: HTMLButtonElement;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  setCta: jest.MockedFunction<() => MockButtonControl>;
  setDisabled: jest.MockedFunction<(value: boolean) => MockButtonControl>;
}

export interface MockDropdownControl {
  addOption: jest.MockedFunction<(value: string, label: string) => MockDropdownControl>;
  setValue: jest.MockedFunction<(value: string) => MockDropdownControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>;
  selectEl: HTMLSelectElement;
}

export interface MockToggleControl {
  setValue: jest.MockedFunction<(value: boolean) => MockToggleControl>;
  onChange: jest.MockedFunction<(callback: (value: boolean) => void | Promise<void>) => MockToggleControl>;
  toggleEl: HTMLInputElement;
}

export interface MockTextControl {
  inputEl: HTMLInputElement;
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextControl>;
  setValue: jest.MockedFunction<(value: string) => MockTextControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextControl>;
}

export interface MockTextAreaControl {
  inputEl: HTMLTextAreaElement;
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextAreaControl>;
  setValue: jest.MockedFunction<(value: string) => MockTextAreaControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextAreaControl>;
}

export interface ButtonRecord {
  control: MockButtonControl;
  label?: string;
  name: string;
  onClick?: () => void | Promise<void>;
}

export interface DropdownRecord {
  control: MockDropdownControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}

export interface ToggleRecord {
  control: MockToggleControl;
  name: string;
  onChange?: (value: boolean) => void | Promise<void>;
}

export interface TextRecord {
  control: MockTextControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}

export interface TextAreaRecord {
  control: MockTextAreaControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}

export type McpSectionPlugin = Pick<OpenCodianPlugin, 'openCodeService'>;

export const buttonRecords: ButtonRecord[] = [];
export const dropdownRecords: DropdownRecord[] = [];
export const toggleRecords: ToggleRecord[] = [];
export const textRecords: TextRecord[] = [];
export const textAreaRecords: TextAreaRecord[] = [];

export function createDropdownRecord(name: string): DropdownRecord {
  const selectEl = document.createElement('select');
  const record: DropdownRecord = {
    name,
    control: {
      addOption: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
      selectEl,
    },
  };
  record.control.addOption.mockImplementation((value, label) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    selectEl.appendChild(option);
    return record.control;
  });
  record.control.setValue.mockImplementation((value) => {
    selectEl.value = value;
    return record.control;
  });
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  return record;
}

export function createToggleRecord(name: string): ToggleRecord {
  const toggleEl = document.createElement('input');
  toggleEl.type = 'checkbox';
  const record: ToggleRecord = {
    name,
    control: {
      setValue: jest.fn(),
      onChange: jest.fn(),
      toggleEl,
    },
  };
  record.control.setValue.mockImplementation((value) => {
    toggleEl.checked = value;
    return record.control;
  });
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  return record;
}

export function createTextRecord(name: string): TextRecord {
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
  record.control.setPlaceholder.mockImplementation((value) => {
    inputEl.placeholder = value;
    return record.control;
  });
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

export function createTextAreaRecord(name: string): TextAreaRecord {
  const inputEl = document.createElement('textarea');
  const record: TextAreaRecord = {
    name,
    control: {
      inputEl,
      setPlaceholder: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
    },
  };
  record.control.setPlaceholder.mockImplementation((value) => {
    inputEl.placeholder = value;
    return record.control;
  });
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

export function createButtonRecord(name: string): ButtonRecord {
  const record: ButtonRecord = {
    name,
    control: {
      buttonEl: document.createElement('button'),
      onClick: jest.fn(),
      setButtonText: jest.fn(),
      setCta: jest.fn(),
      setDisabled: jest.fn(),
    },
  };
  record.control.onClick.mockImplementation((callback) => {
    record.onClick = callback;
    return record.control;
  });
  record.control.setButtonText.mockImplementation((value) => {
    record.label = value;
    record.control.buttonEl.textContent = value;
    return record.control;
  });
  record.control.setCta.mockReturnValue(record.control);
  record.control.setDisabled.mockImplementation((value) => {
    record.control.buttonEl.disabled = value;
    return record.control;
  });
  return record;
}

export function createPlugin(snapshot?: Partial<McpServerSnapshot>): McpSectionPlugin {
  const currentSnapshot: McpServerSnapshot = {
    servers: {},
    updatedAt: null,
    ...snapshot,
  };

  return {
    openCodeService: {
      getMcpServerSnapshot: jest.fn().mockReturnValue(currentSnapshot),
      refreshMcpServerStatus: jest.fn().mockResolvedValue(currentSnapshot.servers),
      addMcpServer: jest.fn().mockResolvedValue({}),
      connectMcpServer: jest.fn().mockResolvedValue(true),
      disconnectMcpServer: jest.fn().mockResolvedValue(true),
      authenticateMcp: jest.fn().mockResolvedValue({ status: 'connected' }),
      removeMcpAuth: jest.fn().mockResolvedValue({ success: true }),
      subscribeToCatalogUpdates: jest.fn().mockReturnValue(jest.fn()),
    } as unknown as McpSectionPlugin['openCodeService'],
  };
}

export function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h3');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

export async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

export function getButtonRecord(label: string, index = -1): ButtonRecord | undefined {
  const matches = buttonRecords.filter((record) => record.label === label);
  return index >= 0 ? matches[index] : matches.at(index);
}

export function getTextRecord(name: string, index = -1): TextRecord | undefined {
  const matches = textRecords.filter((record) => record.name === name);
  return index >= 0 ? matches[index] : matches.at(index);
}

export function getTextAreaRecord(name: string, index = -1): TextAreaRecord | undefined {
  const matches = textAreaRecords.filter((record) => record.name === name);
  return index >= 0 ? matches[index] : matches.at(index);
}

export function getDropdownRecord(name: string, index = -1): DropdownRecord | undefined {
  const matches = dropdownRecords.filter((record) => record.name === name);
  return index >= 0 ? matches[index] : matches.at(index);
}

export function getToggleRecord(name: string, index = -1): ToggleRecord | undefined {
  const matches = toggleRecords.filter((record) => record.name === name);
  return index >= 0 ? matches[index] : matches.at(index);
}

export async function changeText(name: string, value: string, index = -1): Promise<void> {
  const record = getTextRecord(name, index);
  expect(record).toBeDefined();
  record!.control.inputEl.value = value;
  await record!.onChange?.(value);
}

export async function changeTextArea(name: string, value: string, index = -1): Promise<void> {
  const record = getTextAreaRecord(name, index);
  expect(record).toBeDefined();
  record!.control.inputEl.value = value;
  await record!.onChange?.(value);
}

export async function changeDropdown(name: string, value: string, index = -1): Promise<void> {
  const record = getDropdownRecord(name, index);
  expect(record).toBeDefined();
  record!.control.selectEl.value = value;
  await record!.onChange?.(value);
}

export async function changeToggle(name: string, value: boolean, index = -1): Promise<void> {
  const record = getToggleRecord(name, index);
  expect(record).toBeDefined();
  record!.control.toggleEl.checked = value;
  await record!.onChange?.(value);
}

export function expectLastNotice(message: string): void {
  const noticeMock = Notice as unknown as jest.Mock;
  expect(noticeMock).toHaveBeenLastCalledWith(message);
}

export function clearRecordArrays(): void {
  buttonRecords.length = 0;
  dropdownRecords.length = 0;
  toggleRecords.length = 0;
  textRecords.length = 0;
  textAreaRecords.length = 0;
}

export function mockSettingPrototype(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
    (this as Setting & { __settingName?: string }).__settingName = name;
    this.settingEl.setAttribute('data-setting-name', name);
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
    this.settingEl.appendChild(record.control.selectEl);
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
    this.settingEl.appendChild(record.control.toggleEl);
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
    this.settingEl.appendChild(record.control.inputEl);
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
    this.settingEl.appendChild(record.control.inputEl);
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
    this.settingEl.appendChild(record.control.buttonEl);
    return this;
  });
}
