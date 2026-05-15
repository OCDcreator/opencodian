/* eslint-disable max-lines */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

interface ButtonRecord {
  text: string;
  onClick?: () => void | Promise<void>;
}

interface SettingRecord {
  name?: string;
  desc?: string;
}

const dropdownRecords: DropdownRecord[] = [];
const buttonRecords: ButtonRecord[] = [];
const settingRecords: SettingRecord[] = [];

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

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function findDropdown(name: string): DropdownRecord | undefined {
  return dropdownRecords.find((record) => record.name === name);
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

function createPlugin(overrides?: {
  formatterConfig?: unknown;
  lspConfig?: unknown;
  runtimeStatus?: unknown;
  lspRuntimeStatus?: unknown;
  runtimeError?: Error;
  lspRuntimeError?: Error;
  configPath?: string;
  hasConfigManager?: boolean;
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
    openCodeService: {
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

  it('refreshes display after successful mode switch', async () => {
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

    expect(displayRefresh).toHaveBeenCalledTimes(1);
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
    const runtimeTableShellRule = findRule('\\.opencodian-formatter-runtime-table-shell', 'border:');
    const tableRule = findRule('\\.opencodian-formatter-table', 'background:');
    const builtinRowRule = findRule(
      '\\.opencodian-formatter-builtin-row,\\s*\\.opencodian-formatter-custom-row',
      'background:',
    );
    const fieldsRule = findRule(
      '\\.opencodian-formatter-override-fields,\\s*\\.opencodian-formatter-custom-fields',
      'background:',
    );
    const envRowRule = findRule('\\.opencodian-formatter-env-row', 'background:');
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
      '\\.opencodian-settings-block > \\.opencodian-formatter-builtin-row,\\s*\\.opencodian-settings-block > \\.opencodian-formatter-custom-row',
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
    expect(runtimeListRule).toContain('padding: 12px');
    expect(runtimeListHiddenRule).toContain('display: none');
    expect(runtimeTableShellRule).toContain('border: 1px solid var(--opencodian-settings-row-border)');
    expect(runtimeTableShellRule).toContain('var(--opencodian-settings-radius-inline)');
    expect(tableRule).toContain('background: transparent');
    expect(tableRule).toContain('border: 0');
    expect(builtinRowRule).toContain('var(--opencodian-settings-object-bg');
    expect(builtinRowRule).toContain('box-shadow: none');
    expect(fieldsRule).toContain('var(--opencodian-settings-row-bg');
    expect(envRowRule).toContain('var(--opencodian-settings-inline-bg');
    expect(jsonEditorRule).toContain('var(--opencodian-settings-row-bg');
    expect(buttonBarRule).toContain('background: transparent');
    expect(classicSummaryGridRule).toContain('var(--opencodian-settings-object-border');
    expect(classicSummaryGridRule).toContain('var(--opencodian-settings-space-lg');
    expect(formatterSiblingRule).toContain('var(--opencodian-settings-space-md');
    expect(formatterRowRule).toContain('var(--opencodian-settings-space-lg');
    expect(formatterFirstRowRule).toContain('var(--opencodian-settings-space-lg');
    expect(formatterSettingRule).toContain('minmax(180px, 260px)');
    expect(formatterSettingRule).toContain('background: transparent');
    expect(formatterControlRule).toContain('260px');
    expect(formatterCss).not.toContain('linear-gradient');
    expect(formatterCss).not.toContain('backdrop-filter');
    expect(formatterCss).not.toContain('transform: translateY');
    expect(formatterCss).not.toMatch(/border-left:\s*[2-9]px/);
    expect(formatterCss).not.toMatch(/opencodian-settings-radius-(md|lg)/);
  });
});
