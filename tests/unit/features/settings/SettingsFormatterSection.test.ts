/* eslint-disable max-lines, max-lines-per-function, no-useless-escape */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as obsidian from 'obsidian';
import { Setting } from 'obsidian';

import { SettingsFormatterSection } from '../../../../src/features/settings/SettingsFormatterSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

interface MockDropdownControl {
  addOption: jest.MockedFunction<(value: string, label: string) => MockDropdownControl>;
  setValue: jest.MockedFunction<(value: string) => MockDropdownControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>;
  selectEl: HTMLSelectElement;
}

interface DropdownRecord {
  control: MockDropdownControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}

interface MockButtonControl {
  setButtonText: jest.MockedFunction<(text: string) => MockButtonControl>;
  setCta: jest.MockedFunction<() => MockButtonControl>;
  setWarning: jest.MockedFunction<() => MockButtonControl>;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
}

interface MockTextControl {
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextControl>;
  setValue: jest.MockedFunction<(value: string) => MockTextControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextControl>;
  inputEl: HTMLInputElement;
}

interface ButtonRecord {
  text: string;
  onClick?: () => void | Promise<void>;
}

interface TextRecord {
  control: MockTextControl;
  name: string;
}

interface MockExtraButtonControl {
  setIcon: jest.MockedFunction<(icon: string) => MockExtraButtonControl>;
  setTooltip: jest.MockedFunction<(tooltip: string) => MockExtraButtonControl>;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockExtraButtonControl>;
}

interface ExtraButtonRecord {
  icon?: string;
  tooltip?: string;
  name: string;
  onClick?: () => void | Promise<void>;
}

interface SettingRecord {
  name?: string;
  desc?: string;
}

const dropdownRecords: DropdownRecord[] = [];
const buttonRecords: ButtonRecord[] = [];
const textRecords: TextRecord[] = [];
const extraButtonRecords: ExtraButtonRecord[] = [];
const settingRecords: SettingRecord[] = [];
const upstreamLspBuiltinIds = [
  'deno',
  'typescript',
  'vue',
  'eslint',
  'oxlint',
  'biome',
  'gopls',
  'ruby-lsp',
  'ty',
  'pyright',
  'elixir-ls',
  'zls',
  'csharp',
  'razor',
  'fsharp',
  'sourcekit-lsp',
  'rust',
  'clangd',
  'svelte',
  'astro',
  'jdtls',
  'kotlin-ls',
  'yaml-ls',
  'lua-ls',
  'php intelephense',
  'prisma',
  'dart',
  'ocaml-lsp',
  'bash',
  'terraform',
  'texlab',
  'dockerfile',
  'gleam',
  'clojure-lsp',
  'nixd',
  'tinymist',
  'haskell-language-server',
  'julials',
];

function getSettingRecord(setting: Setting): SettingRecord {
  const existing = (setting as Setting & { __record?: SettingRecord }).__record;
  if (existing) {
    return existing;
  }

  const record: SettingRecord = {};
  (setting as Setting & { __record?: SettingRecord }).__record = record;
  settingRecords.push(record);
  return record;
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

function createTextRecord(name: string): TextRecord {
  const record: TextRecord = {
    name,
    control: {
      setPlaceholder: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
      inputEl: document.createElement('input'),
    },
  };
  record.control.setPlaceholder.mockReturnValue(record.control);
  record.control.setValue.mockImplementation((value) => {
    record.control.inputEl.value = value;
    return record.control;
  });
  record.control.onChange.mockReturnValue(record.control);
  return record;
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function findDropdown(name: string): DropdownRecord | undefined {
  return dropdownRecords.find((record) => record.name === name);
}

function findText(name: string): TextRecord | undefined {
  return textRecords.find((record) => record.name === name);
}

function findSettingRecord(name: string): SettingRecord | undefined {
  return settingRecords.find((record) => record.name === name);
}

function findSettingRecordByDesc(desc: string): SettingRecord | undefined {
  return settingRecords.find((record) => record.desc === desc);
}

function findOverviewMetaCard(containerEl: HTMLElement, label: string): HTMLElement | undefined {
  return Array.from(containerEl.querySelectorAll<HTMLElement>('.opencodian-formatter-overview-meta-card'))
    .find((card) => card.querySelector('.opencodian-formatter-overview-meta-label')?.textContent === label);
}

function getFormatterRuntimeRowNames(containerEl: HTMLElement): string[] {
  return Array.from(containerEl.querySelectorAll<HTMLTableRowElement>('.opencodian-formatter-table tbody tr'))
    .map((row) => row.querySelector('td')?.textContent ?? '')
    .filter(Boolean);
}

function getBuiltinSearchInput(containerEl: HTMLElement, scope: 'formatter' | 'lsp'): HTMLInputElement {
  const inputEl = containerEl.querySelector<HTMLInputElement>(
    `.opencodian-builtin-list-search-input[data-search-scope="${scope}"]`,
  );
  if (!inputEl) {
    throw new Error(`Missing ${scope} builtin search input`);
  }
  return inputEl;
}

function getBuiltinStatusFilter(containerEl: HTMLElement, scope: 'formatter' | 'lsp'): HTMLSelectElement {
  const selectEl = containerEl.querySelector<HTMLSelectElement>(
    `.opencodian-builtin-list-status-filter[data-search-scope="${scope}"]`,
  );
  if (!selectEl) {
    throw new Error(`Missing ${scope} builtin status filter`);
  }
  return selectEl;
}

function getBuiltinRow(containerEl: HTMLElement, id: string): HTMLElement {
  const rowEl = containerEl.querySelector<HTMLElement>(`.opencodian-formatter-builtin-row[data-builtin-id="${id}"]`);
  if (!rowEl) {
    throw new Error(`Missing builtin row ${id}`);
  }
  return rowEl;
}

function getBuiltinStatusChip(containerEl: HTMLElement, id: string): HTMLElement {
  const chipEl = getBuiltinRow(containerEl, id)
    .querySelector<HTMLElement>('.opencodian-builtin-row-status-chip');
  if (!chipEl) {
    throw new Error(`Missing builtin status chip for ${id}`);
  }
  return chipEl;
}

function createPlugin(overrides?: {
  formatterConfig?: unknown;
  lspConfig?: unknown;
  runtimeStatus?: unknown;
  lspRuntimeStatus?: unknown;
  runtimeError?: Error;
  lspRuntimeError?: Error;
  configPath?: string;
  hasConfigManager?: boolean;
  serverMode?: 'local' | 'remote';
}): {
  plugin: OpenCodianPlugin;
  updateFormatterConfig: jest.Mock;
  getFormatterConfig: jest.Mock;
  updateLspConfig: jest.Mock;
  getLspConfig: jest.Mock;
} {
  const updateFormatterConfig = jest.fn().mockResolvedValue(undefined);
  const getFormatterConfig = jest.fn().mockResolvedValue(overrides?.formatterConfig ?? undefined);
  const updateLspConfig = jest.fn().mockResolvedValue(undefined);
  const getLspConfig = jest.fn().mockResolvedValue(overrides?.lspConfig ?? undefined);

  const configManager = overrides?.hasConfigManager === false
    ? null
    : {
        getFormatterConfig,
        updateFormatterConfig,
        getLspConfig,
        updateLspConfig,
        getConfigPath: () => overrides?.configPath ?? '/vault/.opencode/opencode.json',
      };

  const getFormatterStatus = overrides?.runtimeError
    ? jest.fn().mockRejectedValue(overrides.runtimeError)
    : jest.fn().mockResolvedValue(overrides?.runtimeStatus ?? []);
  const getLspStatus = overrides?.lspRuntimeError
    ? jest.fn().mockRejectedValue(overrides.lspRuntimeError)
    : jest.fn().mockResolvedValue(overrides?.lspRuntimeStatus ?? []);

  const plugin = {
    opencodeConfigManager: configManager,
    settings: {
      activeBackend: 'opencode',
      enabledBackends: ['opencode', 'claude-code'],
      server: {
        mode: overrides?.serverMode ?? 'local',
      },
    },
    openCodeService: {
      checkHealth: jest.fn().mockResolvedValue(true),
      stop: jest.fn().mockResolvedValue(undefined),
      start: jest.fn().mockResolvedValue(undefined),
      getFormatterStatus,
      getLspStatus,
    },
  } as unknown as OpenCodianPlugin;

  return { plugin, updateFormatterConfig, getFormatterConfig, updateLspConfig, getLspConfig };
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

let displayRefresh: jest.Mock;

beforeEach(() => {
  setLocale('en');
  document.body.innerHTML = '';
  dropdownRecords.length = 0;
  buttonRecords.length = 0;
  textRecords.length = 0;
  extraButtonRecords.length = 0;
  settingRecords.length = 0;
  displayRefresh = jest.fn();

  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
    (this as Setting & { __settingName?: string }).__settingName = name;
    getSettingRecord(this).name = name;
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting, desc: string | DocumentFragment) {
    getSettingRecord(this).desc = typeof desc === 'string' ? desc : desc.textContent ?? '';
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
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
    this: Setting,
    callback: (control: MockButtonControl) => unknown,
  ) {
    const record: ButtonRecord = { text: '' };
    const control: MockButtonControl = {
      setButtonText: jest.fn().mockImplementation((text: string) => {
        record.text = text;
        return control;
      }),
      setCta: jest.fn().mockReturnValue(undefined as never),
      setWarning: jest.fn().mockReturnValue(undefined as never),
      onClick: jest.fn().mockImplementation((handler: () => void | Promise<void>) => {
        record.onClick = handler;
        return control;
      }),
    };
    control.setCta.mockReturnValue(control);
    control.setWarning.mockReturnValue(control);
    buttonRecords.push(record);
    callback(control);
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
  jest.spyOn(Setting.prototype, 'addExtraButton').mockImplementation(function addExtraButton(
    this: Setting,
    callback: (control: MockExtraButtonControl) => unknown,
  ) {
    const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
    const record: ExtraButtonRecord = { name };
    const control: MockExtraButtonControl = {
      setIcon: jest.fn().mockImplementation((icon: string) => {
        record.icon = icon;
        return control;
      }),
      setTooltip: jest.fn().mockImplementation((tooltip: string) => {
        record.tooltip = tooltip;
        return control;
      }),
      onClick: jest.fn().mockImplementation((handler: () => void | Promise<void>) => {
        record.onClick = handler;
        return control;
      }),
    };
    extraButtonRecords.push(record);
    callback(control);
    return this;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SettingsFormatterSection attach (classic layout)', () => {
  it('renders the formatter section heading', () => {
    const { plugin } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    const headingEl = section.attach(containerEl);

    expect(headingEl.textContent).toBe(t('settings.formatter.title'));
  });

  it('shows the mode summary without adding a second dropdown in overview', async () => {
    const { plugin } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attach(containerEl);
    await flushPromises();

    expect(dropdownRecords.map((record) => record.name)).toEqual([
      t('settings.formatter.config.modeSwitch'),
      t('settings.formatter.lsp.modeSwitch'),
    ]);
    expect(containerEl.textContent).toContain(t('settings.formatter.overview.modeLabel'));
    expect(containerEl.textContent).toContain(t('settings.formatter.mode.default'));
  });
});

describe('SettingsFormatterSection attachTabbed (tabbed layout)', () => {
  it('renders overview block for overview tab', () => {
    const { plugin } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'overview');

    const headings = containerEl.querySelectorAll('.opencodian-settings-subsection-heading');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(headings[0]?.textContent).toBe(t('settings.formatter.tab.overview'));
  });

  it('renders formatter block for formatter tab', () => {
    const { plugin } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'formatter');

    const headings = containerEl.querySelectorAll('.opencodian-settings-subsection-heading');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(headings[0]?.textContent).toBe(t('settings.formatter.tab.formatter'));
  });

  it('renders lsp block for lsp tab', () => {
    const { plugin } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'lsp');

    const headings = containerEl.querySelectorAll('.opencodian-settings-subsection-heading');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(headings[0]?.textContent).toBe(t('settings.formatter.tab.lsp'));
  });
});

describe('SettingsFormatterSection LSP builtin catalog', () => {
  it('renders the full upstream builtin LSP catalog without runtime status', async () => {
    const { plugin } = createPlugin({
      lspConfig: {},
      lspRuntimeStatus: [],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'lsp');
    await flushPromises();

    const renderedBuiltinIds = dropdownRecords
      .map((record) => record.name)
      .filter((name) => upstreamLspBuiltinIds.includes(name));
    expect(renderedBuiltinIds).toEqual(upstreamLspBuiltinIds);
  });
});

describe('SettingsFormatterSection builtin list search', () => {
  it('filters builtin formatter rows and supports mouse selection from fuzzy suggestions', async () => {
    const { plugin } = createPlugin({
      formatterConfig: {},
      runtimeStatus: [],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const inputEl = getBuiltinSearchInput(containerEl, 'formatter');
    inputEl.value = 'pre';
    inputEl.dispatchEvent(new Event('input'));

    const options = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.opencodian-builtin-list-search-option'));
    expect(options.map((option) => option.dataset.value)).toContain('prettier');
    expect(getBuiltinRow(containerEl, 'prettier').hidden).toBe(false);
    expect(getBuiltinRow(containerEl, 'gofmt').hidden).toBe(true);

    options.find((option) => option.dataset.value === 'prettier')?.click();

    expect(inputEl.value).toBe('prettier');
    expect(getBuiltinRow(containerEl, 'prettier').hidden).toBe(false);
    expect(getBuiltinRow(containerEl, 'gofmt').hidden).toBe(true);
  });

  it('filters builtin language server rows and supports keyboard selection from fuzzy suggestions', async () => {
    const { plugin } = createPlugin({
      lspConfig: {},
      lspRuntimeStatus: [],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'lsp');
    await flushPromises();

    const inputEl = getBuiltinSearchInput(containerEl, 'lsp');
    expect(getBuiltinRow(containerEl, 'deno').hasClass('is-first-visible')).toBe(true);

    inputEl.value = 'type';
    inputEl.dispatchEvent(new Event('input'));

    expect(getBuiltinRow(containerEl, 'typescript').hidden).toBe(false);
    expect(getBuiltinRow(containerEl, 'gopls').hidden).toBe(true);
    expect(getBuiltinRow(containerEl, 'typescript').hasClass('is-first-visible')).toBe(true);
    expect(getBuiltinRow(containerEl, 'typescript').hasClass('is-last-visible')).toBe(true);

    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(document.body.querySelector('.opencodian-builtin-list-search-option[aria-selected="true"]')?.getAttribute('data-value'))
      .toBe('typescript');
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(inputEl.value).toBe('typescript');
    expect(getBuiltinRow(containerEl, 'typescript').hidden).toBe(false);
    expect(getBuiltinRow(containerEl, 'gopls').hidden).toBe(true);

    inputEl.value = 'go';
    inputEl.dispatchEvent(new Event('input'));
    const popoverEl = document.body.querySelector<HTMLElement>('.opencodian-builtin-list-search-popover');
    expect(popoverEl?.hidden).toBe(false);

    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(popoverEl?.hidden).toBe(true);
  });

  it('keeps bottom spacing when builtin language server search has no matches', async () => {
    const { plugin } = createPlugin({
      lspConfig: {},
      lspRuntimeStatus: [],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'lsp');
    await flushPromises();

    const inputEl = getBuiltinSearchInput(containerEl, 'lsp');
    inputEl.value = 'ddddd';
    inputEl.dispatchEvent(new Event('input'));

    const emptyEl = containerEl.querySelector<HTMLElement>('.opencodian-builtin-list-search-empty');
    expect(emptyEl?.hidden).toBe(false);
    expect(emptyEl?.textContent).toBe(t('settings.formatter.builtinSearch.noMatches'));
  });

  it('filters builtin formatter rows by project status', async () => {
    const { plugin } = createPlugin({
      formatterConfig: {
        gofmt: { command: ['gofmt'] },
        prettier: { disabled: true },
      },
      runtimeStatus: [],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'formatter');
    await flushPromises();

    const filterEl = getBuiltinStatusFilter(containerEl, 'formatter');
    filterEl.value = 'disable';
    filterEl.dispatchEvent(new Event('change'));

    expect(getBuiltinRow(containerEl, 'prettier').hidden).toBe(false);
    expect(getBuiltinRow(containerEl, 'gofmt').hidden).toBe(true);

    filterEl.value = 'override';
    filterEl.dispatchEvent(new Event('change'));

    expect(getBuiltinRow(containerEl, 'prettier').hidden).toBe(true);
    expect(getBuiltinRow(containerEl, 'gofmt').hidden).toBe(false);
  });

  it('combines builtin language server search and status filters', async () => {
    const { plugin } = createPlugin({
      lspConfig: {
        typescript: { command: ['typescript-language-server', '--stdio'] },
        deno: { disabled: true },
      },
      lspRuntimeStatus: [],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'lsp');
    await flushPromises();

    const inputEl = getBuiltinSearchInput(containerEl, 'lsp');
    const filterEl = getBuiltinStatusFilter(containerEl, 'lsp');
    inputEl.value = 'type';
    inputEl.dispatchEvent(new Event('input'));
    filterEl.value = 'override';
    filterEl.dispatchEvent(new Event('change'));

    expect(getBuiltinRow(containerEl, 'typescript').hidden).toBe(false);
    expect(getBuiltinRow(containerEl, 'deno').hidden).toBe(true);
    expect(getBuiltinRow(containerEl, 'gopls').hidden).toBe(true);
  });

  it('renders builtin formatter project status as chips', async () => {
    const { plugin } = createPlugin({
      formatterConfig: {
        gofmt: { command: ['gofmt'] },
        prettier: { disabled: true },
      },
      runtimeStatus: [],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'formatter');
    await flushPromises();

    expect(getBuiltinStatusChip(containerEl, 'gofmt').textContent).toBe(t('settings.formatter.builtinSearch.status.override'));
    expect(getBuiltinStatusChip(containerEl, 'gofmt').dataset.status).toBe('override');
    expect(getBuiltinStatusChip(containerEl, 'prettier').textContent).toBe(t('settings.formatter.builtinSearch.status.disable'));
    expect(getBuiltinStatusChip(containerEl, 'prettier').dataset.status).toBe('disable');
    expect(getBuiltinStatusChip(containerEl, 'biome').textContent).toBe(t('settings.formatter.builtinSearch.status.default'));
    expect(getBuiltinStatusChip(containerEl, 'biome').dataset.status).toBe('default');
    expect(
      getBuiltinRow(containerEl, 'gofmt')
        .querySelector('.setting-item-name .opencodian-builtin-row-status-chip'),
    ).toBe(getBuiltinStatusChip(containerEl, 'gofmt'));
    expect(
      getBuiltinRow(containerEl, 'gofmt')
        .querySelector('.opencodian-builtin-row-meta .opencodian-builtin-row-status-chip'),
    ).toBeNull();
    expect(findSettingRecord('gofmt')?.desc).toBeUndefined();
    expect(getBuiltinRow(containerEl, 'gofmt').querySelectorAll('.opencodian-builtin-row-extensions')).toHaveLength(1);
  });

  it('collapses builtin formatter override fields by clicking the card', async () => {
    const { plugin } = createPlugin({
      formatterConfig: {
        gofmt: { command: ['gofmt'], extensions: ['.go'] },
      },
      runtimeStatus: [],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'formatter');
    await flushPromises();

    const rowEl = getBuiltinRow(containerEl, 'gofmt');
    const fieldsEl = rowEl.querySelector<HTMLElement>('.opencodian-formatter-override-fields');
    expect(rowEl.querySelector('.opencodian-builtin-row-collapse')).toBeNull();
    expect(rowEl.getAttribute('aria-expanded')).toBe('true');
    expect(fieldsEl?.hidden).toBe(false);

    rowEl.click();

    expect(rowEl.getAttribute('aria-expanded')).toBe('false');
    expect(fieldsEl?.hidden).toBe(true);
    expect(getBuiltinStatusChip(containerEl, 'gofmt').hidden).toBe(false);
  });

  it('collapses builtin formatter override fields from non-control card body clicks', async () => {
    const { plugin } = createPlugin({
      formatterConfig: {
        prettier: {
          command: ['npx', 'prettier', '--write', '$FILE'],
          environment: { PRETTIER_CACHE: 'true' },
          extensions: ['.js', '.ts', '.md'],
        },
      },
      runtimeStatus: [],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'formatter');
    await flushPromises();

    const rowEl = getBuiltinRow(containerEl, 'prettier');
    const fieldsEl = rowEl.querySelector<HTMLElement>('.opencodian-formatter-override-fields');
    const envInputEl = fieldsEl?.querySelector<HTMLInputElement>('.opencodian-formatter-env-row input');
    expect(rowEl.getAttribute('aria-expanded')).toBe('true');
    expect(fieldsEl?.hidden).toBe(false);

    envInputEl?.click();

    expect(rowEl.getAttribute('aria-expanded')).toBe('true');
    expect(fieldsEl?.hidden).toBe(false);

    fieldsEl?.click();

    expect(rowEl.getAttribute('aria-expanded')).toBe('false');
    expect(fieldsEl?.hidden).toBe(true);
  });

  it('collapses builtin formatter rows when nested body elements stop propagation', async () => {
    const { plugin } = createPlugin({
      formatterConfig: {
        prettier: {
          command: ['npx', 'prettier', '--write', '$FILE'],
          extensions: ['.js', '.ts', '.md'],
        },
      },
      runtimeStatus: [],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'formatter');
    await flushPromises();

    const rowEl = getBuiltinRow(containerEl, 'prettier');
    const fieldsEl = rowEl.querySelector<HTMLElement>('.opencodian-formatter-override-fields');
    const bodyTargetEl = fieldsEl?.createSpan({ cls: 'opencodian-test-body-target' });
    expect(rowEl.getAttribute('aria-expanded')).toBe('true');
    expect(fieldsEl?.hidden).toBe(false);
    expect(bodyTargetEl).not.toBeNull();

    bodyTargetEl?.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    bodyTargetEl?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(rowEl.getAttribute('aria-expanded')).toBe('false');
    expect(fieldsEl?.hidden).toBe(true);
  });

  it('collapses builtin language server override fields by clicking the card', async () => {
    const { plugin } = createPlugin({
      lspConfig: {
        typescript: { command: ['typescript-language-server', '--stdio'] },
      },
      lspRuntimeStatus: [],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'lsp');
    await flushPromises();

    const rowEl = getBuiltinRow(containerEl, 'typescript');
    const fieldsEl = rowEl.querySelector<HTMLElement>('.opencodian-formatter-custom-fields');
    expect(rowEl.querySelector('.opencodian-builtin-row-collapse')).toBeNull();
    expect(rowEl.getAttribute('aria-expanded')).toBe('true');
    expect(fieldsEl?.hidden).toBe(false);

    rowEl.click();

    expect(rowEl.getAttribute('aria-expanded')).toBe('false');
    expect(fieldsEl?.hidden).toBe(true);
  });
});

describe('SettingsFormatterSection LSP settings', () => {
  it('shows lsp runtime summary in overview without requiring formatter runtime entries', async () => {
    const { plugin } = createPlugin({
      runtimeStatus: [],
      lspRuntimeStatus: [{ id: 'tsserver', root: '/vault', status: 'running' }],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'overview');
    await flushPromises();

    expect(findSettingRecord('tsserver')?.desc).toContain('running');
  });

  it('renders detected formatter runtime list as an open collapsible panel', async () => {
    const { plugin } = createPlugin({
      runtimeStatus: [{ name: 'prettier', extensions: ['.js'], enabled: true }],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'overview');
    await flushPromises();

    const panelEl = containerEl.querySelector('.opencodian-formatter-runtime-panel-collapsible') as HTMLElement | null;
    expect(panelEl).not.toBeNull();
    expect(panelEl?.dataset.collapsed).toBe('false');
    expect(panelEl?.querySelector('.opencodian-formatter-runtime-panel-title')?.textContent)
      .toBe(t('settings.formatter.overview.formatterList.title'));
  });

  it('collapses detected formatter runtime list when clicking the title row', async () => {
    const { plugin } = createPlugin({
      runtimeStatus: [{ name: 'prettier', extensions: ['.js'], enabled: true }],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'overview');
    await flushPromises();

    const panelEl = containerEl.querySelector('.opencodian-formatter-runtime-panel-collapsible') as HTMLElement | null;
    const buttonEl = panelEl?.querySelector('.opencodian-formatter-runtime-panel-summary') as HTMLButtonElement | null;
    const listEl = panelEl?.querySelector('.opencodian-formatter-runtime-list') as HTMLElement | null;
    expect(buttonEl).not.toBeNull();
    expect(listEl?.hidden).toBe(false);

    buttonEl?.click();

    expect(panelEl?.dataset.collapsed).toBe('true');
    expect(buttonEl?.getAttribute('aria-expanded')).toBe('false');
    expect(listEl?.hidden).toBe(true);
  });

  it('filters detected formatter runtime rows by fuzzy name or extension search', async () => {
    const { plugin } = createPlugin({
      runtimeStatus: [
        { name: 'prettier', extensions: ['.js', '.ts'], enabled: true },
        { name: 'shfmt', extensions: ['.sh', '.bash'], enabled: false },
        { name: 'terraform', extensions: ['.tf', '.tfvars'], enabled: false },
      ],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'overview');
    await flushPromises();

    const searchInput = containerEl.querySelector('.opencodian-formatter-runtime-search-input') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();
    expect(searchInput?.hasClass('opencodian-builtin-list-search-input')).toBe(true);

    searchInput!.value = 'bash';
    searchInput!.dispatchEvent(new Event('input'));

    const optionEls = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.opencodian-builtin-list-search-option'));
    expect(optionEls.map((option) => option.dataset.value)).toContain('shfmt');
    expect(getFormatterRuntimeRowNames(containerEl)).toEqual(['shfmt']);
    expect(containerEl.querySelector('.opencodian-formatter-runtime-panel-meta')?.textContent).toBe('1 / 3');

    searchInput!.value = 'pre';
    searchInput!.dispatchEvent(new Event('input'));
    searchInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(document.body.querySelector('.opencodian-builtin-list-search-option[aria-selected="true"]')?.getAttribute('data-value'))
      .toBe('prettier');
    searchInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(searchInput!.value).toBe('prettier');
    expect(getFormatterRuntimeRowNames(containerEl)).toEqual(['prettier']);
  });

  it('marks formatter runtime table columns for compact responsive styling', async () => {
    const { plugin } = createPlugin({
      runtimeStatus: [
        { name: 'prettier', extensions: ['.js', '.ts'], enabled: true },
      ],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'overview');
    await flushPromises();

    expect(containerEl.querySelector('.opencodian-formatter-table-col-status')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-formatter-table-name')?.textContent).toBe('prettier');
    expect(containerEl.querySelector('.opencodian-formatter-table-extensions')?.textContent).toBe('.js, .ts');
    expect(containerEl.querySelector('.opencodian-formatter-table-status .opencodian-formatter-status-badge')?.textContent)
      .toBe(t('settings.formatter.overview.formatterList.enabled'));
  });

  it('shows an empty runtime table row when formatter search has no matches', async () => {
    const { plugin } = createPlugin({
      runtimeStatus: [
        { name: 'prettier', extensions: ['.js', '.ts'], enabled: true },
        { name: 'shfmt', extensions: ['.sh', '.bash'], enabled: false },
      ],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'overview');
    await flushPromises();

    const searchInput = containerEl.querySelector('.opencodian-formatter-runtime-search-input') as HTMLInputElement | null;
    searchInput!.value = 'nope';
    searchInput!.dispatchEvent(new Event('input'));

    expect(getFormatterRuntimeRowNames(containerEl)).toEqual([
      t('settings.formatter.overview.formatterList.noMatches'),
    ]);
    expect(containerEl.querySelector('.opencodian-formatter-table-empty')).not.toBeNull();
  });

  it('sorts detected formatter runtime rows by status from the status header', async () => {
    const { plugin } = createPlugin({
      runtimeStatus: [
        { name: 'shfmt', extensions: ['.sh'], enabled: false },
        { name: 'prettier', extensions: ['.js'], enabled: true },
        { name: 'terraform', extensions: ['.tf'], enabled: false },
      ],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'overview');
    await flushPromises();

    const statusSortHeader = Array.from(containerEl.querySelectorAll<HTMLTableCellElement>('.opencodian-formatter-sort-header'))
      .find((header) => header.textContent?.includes(t('settings.formatter.overview.formatterList.status')));
    expect(statusSortHeader).toBeDefined();
    expect(statusSortHeader?.getAttribute('aria-sort')).toBe('none');

    statusSortHeader!.click();

    expect(getFormatterRuntimeRowNames(containerEl)).toEqual(['prettier', 'shfmt', 'terraform']);
    expect(statusSortHeader?.getAttribute('aria-sort')).toBe('descending');

    statusSortHeader!.click();

    expect(getFormatterRuntimeRowNames(containerEl)).toEqual(['shfmt', 'terraform', 'prettier']);
    expect(statusSortHeader?.getAttribute('aria-sort')).toBe('ascending');
  });

  it('switches lsp mode to disabled by writing false config', async () => {
    const { plugin, updateLspConfig } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'lsp');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.lsp.modeSwitch'));
    await modeDropdown?.onChange?.('disabled');
    await flushPromises();

    expect(updateLspConfig).toHaveBeenCalledWith(false);
  });

  it('blocks saving a custom lsp entry without extensions', async () => {
    const { plugin, updateLspConfig } = createPlugin({
      lspConfig: {
        'custom-server': {
          command: ['custom-lsp', '--stdio'],
        },
      },
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'lsp');
    await flushPromises();

    const saveButton = buttonRecords.find((record) => record.text === t('settings.formatter.lsp.custom.save'));
    expect(saveButton).toBeDefined();

    await saveButton?.onClick?.();
    await flushPromises();

    expect(updateLspConfig).not.toHaveBeenCalled();
  });

  it('blocks stale LSP mode callbacks after switching to Claude Code', async () => {
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const { plugin, updateLspConfig } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'lsp');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.lsp.modeSwitch'));
    (plugin.settings as unknown as { activeBackend: string }).activeBackend = 'claude-code';
    await modeDropdown?.onChange?.('disabled');
    await flushPromises();

    expect(updateLspConfig).not.toHaveBeenCalled();
    expect(plugin.openCodeService.checkHealth).not.toHaveBeenCalled();
    expect(plugin.openCodeService.stop).not.toHaveBeenCalled();
    expect(plugin.openCodeService.start).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenLastCalledWith(t('settings.formatter.notice.openCodeOnly'));
  });

});

describe('SettingsFormatterSection help buttons', () => {
  it('adds formatter and language server help buttons to mode settings', async () => {
    const { plugin } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attach(containerEl);
    await flushPromises();

    expect(
      extraButtonRecords.filter((record) => record.tooltip === t('settings.formatter.help.tooltip'))
        .map((record) => record.name),
    ).toEqual([
      t('settings.formatter.config.modeSwitch'),
      t('settings.formatter.lsp.modeSwitch'),
    ]);
  });
});

describe('SettingsFormatterSection mode switching', () => {
  it('switches to default mode by writing null config', async () => {
    const { plugin, updateFormatterConfig } = createPlugin({ formatterConfig: false });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.config.modeSwitch'));
    expect(modeDropdown).toBeDefined();

    await modeDropdown?.onChange?.('default');
    await flushPromises();

    expect(updateFormatterConfig).toHaveBeenCalledWith(null);
  });

  it('switches to disabled mode by writing false config', async () => {
    const { plugin, updateFormatterConfig } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.config.modeSwitch'));
    await modeDropdown?.onChange?.('disabled');
    await flushPromises();

    expect(updateFormatterConfig).toHaveBeenCalledWith(false);
  });

  it('restarts the local OpenCode service after formatter mode changes', async () => {
    const { plugin } = createPlugin();
    const openCodeService = plugin.openCodeService as unknown as {
      checkHealth: jest.Mock;
      stop: jest.Mock;
      start: jest.Mock;
    };
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.config.modeSwitch'));
    await modeDropdown?.onChange?.('disabled');
    await flushPromises();

    expect(openCodeService.checkHealth).toHaveBeenCalledTimes(1);
    expect(openCodeService.stop).toHaveBeenCalledTimes(1);
    expect(openCodeService.start).toHaveBeenCalledTimes(1);
  });

  it('switches to custom mode by writing object config', async () => {
    const { plugin, updateFormatterConfig, getFormatterConfig } = createPlugin();
    getFormatterConfig.mockResolvedValue({ prettier: { disabled: true } });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.config.modeSwitch'));
    await modeDropdown?.onChange?.('custom');
    await flushPromises();

    expect(updateFormatterConfig).toHaveBeenCalledWith({ prettier: { disabled: true } });
  });

  it('initializes empty object for custom mode when no existing object config', async () => {
    const { plugin, updateFormatterConfig, getFormatterConfig } = createPlugin();
    getFormatterConfig.mockResolvedValue(undefined);
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.config.modeSwitch'));
    await modeDropdown?.onChange?.('custom');
    await flushPromises();

    expect(updateFormatterConfig).toHaveBeenCalledWith({});
  });

  it('does not call updateFormatterConfig when config manager is unavailable', async () => {
    const { plugin, updateFormatterConfig } = createPlugin({ hasConfigManager: false });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.config.modeSwitch'));
    await modeDropdown?.onChange?.('default');
    await flushPromises();

    expect(updateFormatterConfig).not.toHaveBeenCalled();
  });

  it('refreshes formatter content locally after successful mode switch', async () => {
    const { plugin } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.config.modeSwitch'));
    await modeDropdown?.onChange?.('disabled');
    await flushPromises();

    expect(displayRefresh).not.toHaveBeenCalled();
    expect(findDropdown(t('settings.formatter.config.modeSwitch'))).toBeDefined();
  });

  it('blocks stale formatter mode callbacks after switching to Claude Code', async () => {
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const { plugin, updateFormatterConfig } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const modeDropdown = findDropdown(t('settings.formatter.config.modeSwitch'));
    (plugin.settings as unknown as { activeBackend: string }).activeBackend = 'claude-code';
    await modeDropdown?.onChange?.('disabled');
    await flushPromises();

    expect(updateFormatterConfig).not.toHaveBeenCalled();
    expect(plugin.openCodeService.checkHealth).not.toHaveBeenCalled();
    expect(plugin.openCodeService.stop).not.toHaveBeenCalled();
    expect(plugin.openCodeService.start).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenLastCalledWith(t('settings.formatter.notice.openCodeOnly'));
  });
});

describe('SettingsFormatterSection runtime status presentation', () => {
  it('treats an empty successful formatter status result as online', async () => {
    const { plugin } = createPlugin({ runtimeStatus: [] });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'overview');
    await flushPromises();

    const runtimeCard = findOverviewMetaCard(containerEl, t('settings.formatter.overview.runtimeStatus'));
    expect(runtimeCard).toBeDefined();
    expect(runtimeCard?.textContent).toContain(t('settings.formatter.overview.runtimeOnline'));
    expect(runtimeCard?.querySelectorAll('.opencodian-formatter-overview-meta-pill')).toHaveLength(2);
    expect(findSettingRecordByDesc(t('settings.formatter.overview.noRuntime'))).toBeUndefined();
  });

  it('shows the runtime failure notice when formatter status fetch fails', async () => {
    const { plugin } = createPlugin({ runtimeError: new Error('offline') });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'overview');
    await flushPromises();

    const runtimeCard = findOverviewMetaCard(containerEl, t('settings.formatter.overview.runtimeStatus'));
    expect(runtimeCard).toBeDefined();
    expect(runtimeCard?.textContent).toContain(t('settings.formatter.overview.runtimeError'));
    expect(runtimeCard?.querySelectorAll('.opencodian-formatter-overview-meta-pill')).toHaveLength(2);
    expect(findSettingRecordByDesc(t('settings.formatter.overview.noRuntime'))).toBeDefined();
  });

  it('renders mode cards with separated primary value and description', async () => {
    const { plugin } = createPlugin({
      formatterConfig: { prettier: { disabled: true } },
      lspConfig: false,
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'overview');
    await flushPromises();

    const formatterModeCard = findOverviewMetaCard(containerEl, t('settings.formatter.overview.modeLabel'));
    const lspModeCard = findOverviewMetaCard(containerEl, t('settings.formatter.lsp.overview.modeLabel'));

    expect(formatterModeCard?.querySelector('.opencodian-formatter-overview-meta-value-pill')?.textContent)
      .toBe(t('settings.formatter.mode.custom'));
    expect(formatterModeCard?.querySelector('.opencodian-formatter-overview-meta-description')?.textContent)
      .toBe(t('settings.formatter.mode.customDesc'));
    expect(lspModeCard?.querySelector('.opencodian-formatter-overview-meta-value-pill')?.textContent)
      .toBe(t('settings.formatter.mode.disabled'));
  });

  it('does not render raw translation keys in Chinese formatter overview', async () => {
    setLocale('zh');
    const { plugin } = createPlugin({
      runtimeStatus: [{ name: 'prettier', extensions: ['.js'], enabled: true }],
      lspRuntimeStatus: [{ id: 'tsserver', root: '/vault', status: 'running' }],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'overview');
    await flushPromises();

    expect(containerEl.textContent).not.toContain('settings.');
    expect(containerEl.textContent).toContain('语言服务');
  });
});

describe('SettingsFormatterSection dispose', () => {
  it('does not throw when called', () => {
    const { plugin } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });

    expect(() => section.dispose()).not.toThrow();
  });
});

describe('SettingsFormatterSection body-level popover lifecycle', () => {
  it('does not leak body-level popovers after repeated content refresh cycles', async () => {
    const { plugin, getFormatterConfig } = createPlugin({
      formatterConfig: { custom: { command: ['echo'] } },
      runtimeStatus: [],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    // First render — tabbed config tab (renders builtin formatter search popover).
    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    // Simulate user opening the search popover so it gets appended to body.
    const searchInput = containerEl.querySelector<HTMLInputElement>('[data-search-scope="formatter"]');
    if (searchInput) {
      searchInput.value = 'x';
      searchInput.dispatchEvent(new Event('input'));
    }

    const popoversAfterFirst = document.body.querySelectorAll('.opencodian-builtin-list-search-popover');
    const firstRenderCount = popoversAfterFirst.length;

    // Dispose and re-attach to simulate a full refresh cycle.
    getFormatterConfig.mockResolvedValue({ custom: { command: ['echo', 'hello'] } });
    section.dispose();
    expect(document.body.querySelectorAll('.opencodian-builtin-list-search-popover').length).toBe(0);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    // Open the search popover again.
    const searchInput2 = containerEl.querySelector<HTMLInputElement>('[data-search-scope="formatter"]');
    if (searchInput2) {
      searchInput2.value = 'x';
      searchInput2.dispatchEvent(new Event('input'));
    }

    const popoversAfterSecond = document.body.querySelectorAll('.opencodian-builtin-list-search-popover');

    // There should be the same number of popovers, not doubled.
    expect(popoversAfterSecond.length).toBe(firstRenderCount);

    // Final dispose must clean up everything.
    section.dispose();
    expect(document.body.querySelectorAll('.opencodian-builtin-list-search-popover').length).toBe(0);

    containerEl.remove();
  });
});

describe('SettingsFormatterSection config tab — custom mode rendering', () => {
  it('does not render builtin/custom/advanced sections in default mode', async () => {
    const { plugin } = createPlugin({
      formatterConfig: undefined,
      runtimeStatus: [{ name: 'prettier', extensions: ['.js'], enabled: true }],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const headings = containerEl.querySelectorAll('.opencodian-settings-subsection-heading');
    const headingTexts = Array.from(headings).map((h) => h.textContent);
    expect(headingTexts).not.toContain(t('settings.formatter.config.builtinList.title'));
    expect(headingTexts).not.toContain(t('settings.formatter.config.customList.title'));
    expect(headingTexts).not.toContain(t('settings.formatter.config.advanced.title'));
  });

  it('renders builtin list, custom list, and advanced JSON when in custom mode', async () => {
    const { plugin } = createPlugin({
      formatterConfig: {},
      runtimeStatus: [{ name: 'prettier', extensions: ['.js'], enabled: true }],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const headings = containerEl.querySelectorAll('.opencodian-settings-subsection-heading');
    const headingTexts = Array.from(headings).map((h) => h.textContent);
    expect(headingTexts).toContain(t('settings.formatter.config.builtinList.title'));
    expect(headingTexts).toContain(t('settings.formatter.config.customList.title'));
    expect(headingTexts).toContain(t('settings.formatter.config.advanced.title'));
  });

  it('renders builtin formatter rows with action dropdowns', async () => {
    const { plugin } = createPlugin({
      formatterConfig: {},
      runtimeStatus: [
        { name: 'prettier', extensions: ['.js', '.ts'], enabled: true },
        { name: 'gofmt', extensions: ['.go'], enabled: false },
      ],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    expect(findDropdown('prettier')).toBeDefined();
    expect(findDropdown('gofmt')).toBeDefined();
  });

  it('shows disabled status for a builtin formatter with disabled:true', async () => {
    const { plugin } = createPlugin({
      formatterConfig: { prettier: { disabled: true } },
      runtimeStatus: [{ name: 'prettier', extensions: ['.js'], enabled: true }],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const prettierDropdown = findDropdown('prettier');
    expect(prettierDropdown).toBeDefined();
    expect(prettierDropdown?.control.setValue).toHaveBeenCalledWith('disable');
  });

  it('shows override status for a builtin formatter with command override', async () => {
    const { plugin } = createPlugin({
      formatterConfig: { prettier: { command: ['npx', 'prettier', '--write', '$FILE'] } },
      runtimeStatus: [{ name: 'prettier', extensions: ['.js'], enabled: true }],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const prettierDropdown = findDropdown('prettier');
    expect(prettierDropdown).toBeDefined();
    expect(prettierDropdown?.control.setValue).toHaveBeenCalledWith('override');
  });
});

describe('SettingsFormatterSection builtin formatter action changes', () => {
  it('disables a builtin formatter via action dropdown', async () => {
    const { plugin, updateFormatterConfig } = createPlugin({
      formatterConfig: {},
      runtimeStatus: [{ name: 'prettier', extensions: ['.js'], enabled: true }],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const prettierDropdown = findDropdown('prettier');
    await prettierDropdown?.onChange?.('disable');
    await flushPromises();

    expect(updateFormatterConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        prettier: expect.objectContaining({ disabled: true }),
      }),
    );
  });

  it('reverts a disabled builtin to default via action dropdown', async () => {
    const { plugin, updateFormatterConfig } = createPlugin({
      formatterConfig: { prettier: { disabled: true } },
      runtimeStatus: [{ name: 'prettier', extensions: ['.js'], enabled: true }],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const prettierDropdown = findDropdown('prettier');
    await prettierDropdown?.onChange?.('default');
    await flushPromises();

    expect(updateFormatterConfig).toHaveBeenCalledWith({});
  });
});

describe('SettingsFormatterSection custom formatter list', () => {
  it('still renders builtin formatter editors when runtime status fetch fails', async () => {
    const { plugin } = createPlugin({
      formatterConfig: {},
      runtimeError: new Error('offline'),
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    expect(findDropdown('prettier')).toBeDefined();
    expect(findDropdown('gofmt')).toBeDefined();
  });

  it('shows empty message when no custom formatters', async () => {
    const { plugin } = createPlugin({
      formatterConfig: { prettier: { disabled: true } },
      runtimeStatus: [{ name: 'prettier', extensions: ['.js'], enabled: true }],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    expect(findSettingRecordByDesc(t('settings.formatter.config.customList.empty'))).toBeDefined();
  });

  it('renders custom formatter entries that are not in the builtin list', async () => {
    const { plugin } = createPlugin({
      formatterConfig: {
        prettier: { disabled: true },
        'my-custom': { command: ['deno', 'fmt', '$FILE'], extensions: ['.md'] },
      },
      runtimeStatus: [{ name: 'prettier', extensions: ['.js'], enabled: true }],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    expect(findSettingRecord('my-custom')).toBeDefined();
  });

  it('adds custom formatter without clearing the visible settings content', async () => {
    const { plugin, getFormatterConfig, updateFormatterConfig } = createPlugin({
      formatterConfig: {},
      runtimeStatus: [],
    });
    const requestDisplayRefresh = jest.fn(() => {
      throw new Error('full settings refresh should not run');
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();
    const visibleBeforeSave = containerEl.textContent ?? '';

    getFormatterConfig.mockResolvedValueOnce({});
    getFormatterConfig.mockResolvedValueOnce({
      'my-custom': { command: [] },
    });
    const nameText = findText(t('settings.formatter.config.custom.addName'));
    nameText!.control.inputEl.value = 'my-custom';
    const addButton = buttonRecords.find((record) => record.text === t('settings.formatter.config.custom.addButton'));

    await addButton?.onClick?.();
    expect(containerEl.textContent).toBe(visibleBeforeSave);
    await flushPromises();

    expect(updateFormatterConfig).toHaveBeenCalledWith({
      'my-custom': { command: [] },
    });
    expect(requestDisplayRefresh).not.toHaveBeenCalled();
    expect(findSettingRecord('my-custom')).toBeDefined();
  });

  it('renders environment editing for custom formatters', async () => {
    const { plugin } = createPlugin({
      formatterConfig: {
        'my-custom': {
          command: ['deno', 'fmt', '$FILE'],
          environment: { FMT_MODE: 'strict' },
          extensions: ['.md'],
        },
      },
      runtimeStatus: [],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    expect(settingRecords.filter((record) => record.name === t('settings.formatter.config.builtin.environment')).length)
      .toBeGreaterThan(0);
  });
});

describe('SettingsFormatterSection advanced JSON editor', () => {
  it('renders the JSON textarea with current config', async () => {
    const { plugin } = createPlugin({
      formatterConfig: { prettier: { disabled: true } },
      runtimeStatus: [{ name: 'prettier', extensions: ['.js'], enabled: true }],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const textarea = containerEl.querySelector('.opencodian-formatter-json-textarea') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();

    const parsed = JSON.parse(textarea!.value);
    expect(parsed).toEqual({ prettier: { disabled: true } });
  });

  it('renders the JSON textarea with empty object when formatter is absent', async () => {
    const { plugin } = createPlugin({
      formatterConfig: {},
      runtimeStatus: [{ name: 'prettier', extensions: ['.js'], enabled: true }],
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    const textarea = containerEl.querySelector('.opencodian-formatter-json-textarea') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    expect(JSON.parse(textarea!.value)).toEqual({});
  });
});

describe('SettingsFormatterSection runtime failure does not block config editing', () => {
  it('renders config tab with all editing sections even when runtime fails in custom mode', async () => {
    const { plugin } = createPlugin({
      formatterConfig: {},
      runtimeError: new Error('server offline'),
    });
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');
    await flushPromises();

    expect(findSettingRecordByDesc(t('settings.formatter.config.runtimeOfflineNote'))).toBeDefined();

    const headings = containerEl.querySelectorAll('.opencodian-settings-subsection-heading');
    const headingTexts = Array.from(headings).map((h) => h.textContent);
    expect(headingTexts).toContain(t('settings.formatter.config.advanced.title'));
  });
});

describe('SettingsFormatterSection CSS contract', () => {
  it('keeps formatter settings surfaces aligned with the shared settings hierarchy contract', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    const findRule = (selector: string, required: string): string => (
      Array.from(css.matchAll(new RegExp(`${selector}\\s*\\{[^}]*\\}`, 'g')))
        .map((match) => match[0])
        .find((rule) => rule.includes(required)) ?? ''
    );

    const summaryCardRule = findRule('\\.opencodian-formatter-summary-card', 'background:');
    const summaryCardLabelRule = findRule('\\.opencodian-formatter-summary-card-label', 'text-transform:');
    const summaryCardValueRule = findRule('\\.opencodian-formatter-summary-card-value', 'font-size:');
    const overviewCardRule = findRule('\\.opencodian-formatter-overview-meta-card', 'background:');
    const overviewAccentRule = findRule('\\.opencodian-formatter-overview-meta-card\\[data-tone=\"accent\"\\]', 'background:');
    const overviewBodyRule = findRule('\\.opencodian-formatter-overview-meta-body', 'display:');
    const overviewMonoRule = findRule('\\.opencodian-formatter-overview-meta-value\\.is-mono', 'font-family:');
    const overviewValuePillRule = findRule('\\.opencodian-formatter-overview-meta-value-pill', 'border-radius:');
    const overviewValuePillAccentRule = findRule('\\.opencodian-formatter-overview-meta-value-pill\\[data-tone=\"accent\"\\]', 'background:');
    const overviewPillsRule = findRule('\\.opencodian-formatter-overview-meta-pills', 'display:');
    const overviewPillRule = findRule('\\.opencodian-formatter-overview-meta-pill', 'border-radius:');
    const overviewPillSuccessRule = findRule('\\.opencodian-formatter-overview-meta-pill\\[data-tone=\"success\"\\]', 'background:');
    const runtimePanelRule = findRule('\\.opencodian-formatter-runtime-panel', 'background:');
    const runtimePanelHeaderRule = findRule('\\.opencodian-formatter-runtime-panel-header', 'border-bottom:');
    const runtimePanelMetaRule = findRule('\\.opencodian-formatter-runtime-panel-meta', 'border-radius:');
    const runtimePanelStaticRule = findRule('\\.opencodian-formatter-runtime-panel-summary\\.is-static \\.opencodian-formatter-runtime-panel-header', 'border-bottom-color:');
    const runtimeListRule = findRule('\\.opencodian-formatter-runtime-list', 'padding:');
    const runtimeListHiddenRule = findRule('\\.opencodian-formatter-runtime-list\\[hidden\\]', 'display:');
    const runtimeToolbarRule = findRule('\\.opencodian-formatter-runtime-toolbar', 'display:');
    const runtimeSearchInputRule = findRule('\\.opencodian-formatter-runtime-search-input', 'background:');
    const builtinSearchRule = findRule('\\.opencodian-builtin-list-search', 'grid-template-columns:');
    const builtinSearchStickyRule = findRule(
      '\\.opencodian-settings-block > \\.opencodian-builtin-list-search',
      'position:',
    );
    const builtinScrollRule = findRule('\\.opencodian-formatter-builtin-scroll', 'max-height:');
    const builtinScrollWebkitRule = findRule(
      '\\.opencodian-formatter-builtin-scroll::-webkit-scrollbar',
      'display:',
    );
    const builtinSearchInputRule = findRule('\\.opencodian-builtin-list-search-input', 'background:');
    const builtinSearchInputFocusRule = findRule('\\.opencodian-builtin-list-search-input:focus-visible', 'outline:');
    const builtinSearchCountRule = findRule('\\.opencodian-builtin-list-search-count', 'border-radius:');
    const builtinSearchClearRule = findRule('\\.opencodian-builtin-list-search-clear', 'background:');
    const builtinSearchPopoverRule = findRule('\\.opencodian-builtin-list-search-popover', 'position:');
    const builtinSearchOptionRule = findRule('\\.opencodian-builtin-list-search-option', 'grid-template-columns:');
    const builtinSearchOptionActiveRule = findRule(
      '\\.opencodian-builtin-list-search-option:hover,\\s*\\.opencodian-builtin-list-search-option\\[aria-selected="true"\\]',
      'background:',
    );
    const builtinSearchOptionDetailRule = findRule('\\.opencodian-builtin-list-search-option-detail', 'font-family:');
    const formatterSortHeaderRule = findRule('\\.opencodian-formatter-sort-header', 'cursor:');
    const formatterSortHeaderActiveRule = findRule(
      '\\.opencodian-formatter-sort-header\\[data-sort-direction="asc"\\],\\s*\\.opencodian-formatter-sort-header\\[data-sort-direction="desc"\\]',
      'var(--text-accent)',
    );
    const runtimeTableShellRule = findRule('\\.opencodian-formatter-runtime-table-shell', 'border:');
    const tableRule = findRule('\\.opencodian-formatter-table', 'background:');
    const tableTheadRule = findRule('\\.opencodian-formatter-table thead', 'position:');
    const tableHeaderRule = findRule('\\.opencodian-formatter-table th', 'position:');
    const formatterSortHeaderAscRule = findRule('\\.opencodian-formatter-sort-header\\[data-sort-direction="asc"\\]::after', 'border-top:');
    const formatterSortHeaderDescRule = findRule('\\.opencodian-formatter-sort-header\\[data-sort-direction="desc"\\]::after', 'border-right:');
    const tableStatusRule = findRule('\\.opencodian-formatter-table-status', 'text-align:');
    const tableExtensionsRule = findRule('\\.opencodian-formatter-table-extensions', 'font-family:');
    const builtinRowRule = findRule(
      '\\.opencodian-formatter-builtin-row,\\s*\\.opencodian-formatter-custom-row',
      'background:',
    );
    const fieldsRule = findRule(
      '\\.opencodian-formatter-override-fields,\\s*\\.opencodian-formatter-custom-fields',
      'background:',
    );
    const envRowRule = findRule('\\.opencodian-formatter-env-row', 'background:');
    const fieldSettingRule = findRule(
      '\\.opencodian-formatter-override-fields \\.setting-item,\\s*\\.opencodian-formatter-custom-fields \\.setting-item,\\s*\\.opencodian-formatter-env-editor \\.setting-item',
      'grid-template-columns:',
    );
    const fieldControlRule = findRule(
      '\\.opencodian-formatter-override-fields \\.setting-item-control,\\s*\\.opencodian-formatter-custom-fields \\.setting-item-control,\\s*\\.opencodian-formatter-env-editor \\.setting-item-control',
      'width:',
    );
    const fieldInputRule = findRule(
      '\\.opencodian-formatter-override-fields input\\[type="text"\\],\\s*\\.opencodian-formatter-custom-fields input\\[type="text"\\],\\s*\\.opencodian-formatter-override-fields textarea,\\s*\\.opencodian-formatter-custom-fields textarea',
      'width:',
    );
    const responsiveFieldRule = findRule(
      '\\.opencodian-formatter-override-fields \\.setting-item,\\s*\\.opencodian-formatter-custom-fields \\.setting-item,\\s*\\.opencodian-formatter-env-editor \\.setting-item',
      'grid-template-columns: 1fr',
    );
    const jsonEditorRule = findRule('\\.opencodian-formatter-json-editor', 'background:');
    const buttonBarRule = findRule('\\.opencodian-formatter-json-buttons', 'background:');
    const classicSummaryGridRule = findRule(
      '\\.opencodian-settings\\[data-settings-layout-mode="classic"\\] \\.opencodian-formatter-summary-cards',
      'border-top:',
    );
    const formatterSiblingRule = findRule(
      '\\.opencodian-formatter-builtin-row \\+ \\.opencodian-formatter-builtin-row,\\s*\\.opencodian-formatter-custom-row \\+ \\.opencodian-formatter-custom-row',
      'margin-top:',
    );
    const formatterRowRule = findRule(
      '\\.opencodian-settings-block > \\.opencodian-formatter-builtin-row,\\s*\\.opencodian-formatter-builtin-scroll > \\.opencodian-formatter-builtin-row,\\s*\\.opencodian-settings-block > \\.opencodian-formatter-custom-row',
      'margin-left:',
    );
    const formatterFirstRowRule = findRule(
      '\\.opencodian-settings-block > \\.opencodian-formatter-builtin-row:first-of-type,\\s*\\.opencodian-settings-block > \\.opencodian-formatter-custom-row:first-of-type',
      'margin-top:',
    );
    const formatterSettingRule = findRule(
      '\\.opencodian-formatter-builtin-row > \\.setting-item,\\s*\\.opencodian-formatter-custom-row > \\.setting-item',
      'grid-template-columns:',
    );
    const formatterBuiltinNameRule = findRule(
      '\\.opencodian-formatter-builtin-row > \\.setting-item \\.setting-item-name',
      'display:',
    );
    const formatterControlRule = findRule(
      '\\.opencodian-formatter-builtin-row > \\.setting-item \\.setting-item-control,\\s*\\.opencodian-formatter-custom-row > \\.setting-item \\.setting-item-control',
      'width:',
    );
    const formatterCss = css.slice(
      css.indexOf('.opencodian-formatter-summary-cards'),
      css.indexOf('.opencodian-plugin-summary-list'),
    );

    expect(summaryCardRule).toContain('var(--opencodian-settings-object-bg');
    expect(summaryCardRule).toContain('var(--opencodian-settings-radius-row');
    expect(summaryCardRule).toContain('box-shadow: none');
    expect(summaryCardLabelRule).toContain('text-transform: uppercase');
    expect(summaryCardValueRule).toContain('font-size: 22px');
    expect(overviewCardRule).toContain('var(--opencodian-settings-object-bg');
    expect(overviewCardRule).toContain('var(--opencodian-settings-radius-row');
    expect(overviewAccentRule).toContain('var(--interactive-accent)');
    expect(overviewBodyRule).toContain('display: flex');
    expect(overviewMonoRule).toContain('var(--font-monospace)');
    expect(overviewValuePillRule).toContain('border-radius: 999px');
    expect(overviewValuePillAccentRule).toContain('var(--interactive-accent)');
    expect(overviewPillsRule).toContain('flex-wrap: wrap');
    expect(overviewPillRule).toContain('border-radius: 999px');
    expect(overviewPillSuccessRule).toContain('var(--color-green)');
    expect(runtimePanelRule).toContain('var(--opencodian-settings-object-bg');
    expect(runtimePanelHeaderRule).toContain('border-bottom: 1px solid transparent');
    expect(runtimePanelMetaRule).toContain('border-radius: 999px');
    expect(runtimePanelStaticRule).toContain('border-bottom-color: var(--opencodian-settings-row-border)');
    expect(runtimeListRule).toContain('padding: 12px 14px 14px');
    expect(runtimeListHiddenRule).toContain('display: none');
    expect(runtimeToolbarRule).toContain('grid-template-columns: minmax(220px, 360px) minmax(0, 1fr)');
    expect(runtimeSearchInputRule).toContain('var(--opencodian-settings-inline-bg');
    expect(runtimeSearchInputRule).toContain('padding: 0 12px');
    expect(builtinSearchRule).toContain('minmax(220px, 420px)');
    expect(builtinSearchRule).toContain('var(--opencodian-settings-row-bg');
    expect(builtinSearchStickyRule).toContain('position: sticky');
    expect(builtinSearchStickyRule).toContain('top: 0');
    expect(builtinSearchStickyRule).toContain('margin-right: calc(var(--opencodian-settings-space-lg) + 12px)');
    expect(builtinScrollRule).toContain('max-height: min(520px, 58vh)');
    expect(builtinScrollRule).toContain('overflow-y: auto');
    expect(builtinScrollRule).toContain('padding-top: var(--opencodian-settings-space-lg)');
    expect(builtinScrollRule).toContain('padding-right: 12px');
    expect(builtinScrollRule).toContain('scroll-padding-top: var(--opencodian-settings-space-lg)');
    expect(builtinScrollRule).toContain('scrollbar-width: none');
    expect(builtinScrollWebkitRule).toContain('display: none');
    expect(builtinSearchInputRule).toContain('var(--opencodian-settings-inline-bg');
    expect(builtinSearchInputRule).toContain('min-height: 32px');
    expect(builtinSearchInputFocusRule).toContain('var(--opencodian-settings-focus-ring)');
    expect(builtinSearchCountRule).toContain('border-radius: 999px');
    expect(builtinSearchClearRule).toContain('background: transparent');
    expect(builtinSearchPopoverRule).toContain('position: fixed');
    expect(builtinSearchPopoverRule).toContain('z-index: 2280');
    expect(builtinSearchPopoverRule).toContain('max-height: min(260px, calc(100vh - 24px))');
    expect(builtinSearchOptionRule).toContain('minmax(120px, 180px)');
    expect(builtinSearchOptionRule).toContain('border-radius: var(--opencodian-settings-radius-inline)');
    expect(builtinSearchOptionActiveRule).toContain('var(--interactive-accent)');
    expect(builtinSearchOptionDetailRule).toContain('var(--font-monospace)');
    expect(formatterSortHeaderRule).toContain('cursor: pointer');
    expect(formatterSortHeaderRule).toContain('user-select: none');
    expect(formatterSortHeaderActiveRule).toContain('var(--text-accent)');
    expect(runtimeTableShellRule).toContain('border: 1px solid var(--opencodian-settings-row-border)');
    expect(runtimeTableShellRule).toContain('max-height: min(480px, 52vh)');
    expect(runtimeTableShellRule).toContain('position: relative');
    expect(runtimeTableShellRule).toContain('var(--opencodian-settings-radius-inline)');
    expect(tableRule).toContain('background: transparent');
    expect(tableRule).toContain('border: 0');
    expect(tableRule).toContain('overflow: visible');
    expect(tableRule).toContain('table-layout: fixed');
    expect(tableTheadRule).toContain('position: sticky');
    expect(tableTheadRule).toContain('z-index: 3');
    expect(tableHeaderRule).toContain('position: sticky');
    expect(tableHeaderRule).toContain('z-index: 4');
    expect(formatterSortHeaderAscRule).toContain('border-top: 1.5px solid currentColor');
    expect(formatterSortHeaderAscRule).toContain('rotate(45deg)');
    expect(formatterSortHeaderDescRule).toContain('border-right: 1.5px solid currentColor');
    expect(formatterSortHeaderDescRule).toContain('rotate(45deg)');
    expect(tableStatusRule).toContain('text-align: right');
    expect(tableExtensionsRule).toContain('var(--font-monospace)');
    expect(builtinRowRule).toContain('var(--opencodian-settings-object-bg');
    expect(builtinRowRule).toContain('box-shadow: none');
    expect(fieldsRule).toContain('var(--opencodian-settings-row-bg');
    expect(envRowRule).toContain('var(--opencodian-settings-inline-bg');
    expect(fieldSettingRule).toContain('minmax(168px, 0.34fr)');
    expect(fieldSettingRule).toContain('minmax(280px, 1fr)');
    expect(fieldControlRule).toContain('width: 100%');
    expect(fieldControlRule).toContain('min-width: 0');
    expect(fieldInputRule).toContain('box-sizing: border-box');
    expect(fieldInputRule).toContain('max-width: 100%');
    expect(responsiveFieldRule).toContain('grid-template-columns: 1fr');
    expect(jsonEditorRule).toContain('var(--opencodian-settings-row-bg');
    expect(buttonBarRule).toContain('background: transparent');
    expect(classicSummaryGridRule).toContain('var(--opencodian-settings-object-border');
    expect(classicSummaryGridRule).toContain('var(--opencodian-settings-space-lg');
    expect(formatterSiblingRule).toContain('var(--opencodian-settings-space-md');
    expect(formatterRowRule).toContain('var(--opencodian-settings-space-lg');
    expect(formatterFirstRowRule).toContain('var(--opencodian-settings-space-lg');
    expect(formatterSettingRule).toContain('minmax(180px, 260px)');
    expect(formatterSettingRule).toContain('background: transparent');
    expect(formatterBuiltinNameRule).toContain('inline-flex');
    expect(formatterBuiltinNameRule).toContain('flex-wrap: wrap');
    expect(formatterControlRule).toContain('260px');
    expect(formatterCss).not.toContain('linear-gradient');
    expect(formatterCss).not.toContain('backdrop-filter');
    expect(formatterCss).not.toContain('transform: translateY');
    expect(formatterCss).not.toMatch(/border-left:\s*[2-9]px/);
    expect(formatterCss).not.toMatch(/opencodian-settings-radius-(md|lg)/);
  });
});
