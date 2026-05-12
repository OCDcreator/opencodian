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

interface SettingRecord {
  name?: string;
  desc?: string;
}

const dropdownRecords: DropdownRecord[] = [];
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

function createPlugin(overrides?: {
  formatterConfig?: unknown;
  runtimeStatus?: unknown;
  runtimeError?: Error;
  configPath?: string;
  hasConfigManager?: boolean;
}): {
  plugin: OpenCodianPlugin;
  updateFormatterConfig: jest.Mock;
  getFormatterConfig: jest.Mock;
} {
  const updateFormatterConfig = jest.fn().mockResolvedValue(undefined);
  const getFormatterConfig = jest.fn().mockResolvedValue(overrides?.formatterConfig ?? undefined);

  const configManager = overrides?.hasConfigManager === false
    ? null
    : {
        getFormatterConfig,
        updateFormatterConfig,
        getConfigPath: () => overrides?.configPath ?? '/vault/.opencode/opencode.json',
      };

  const getFormatterStatus = overrides?.runtimeError
    ? jest.fn().mockRejectedValue(overrides.runtimeError)
    : jest.fn().mockResolvedValue(overrides?.runtimeStatus ?? []);

  const plugin = {
    opencodeConfigManager: configManager,
    openCodeService: {
      getFormatterStatus,
    },
  } as unknown as OpenCodianPlugin;

  return { plugin, updateFormatterConfig, getFormatterConfig };
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
    ]);
    expect(findSettingRecord(t('settings.formatter.overview.modeLabel'))?.desc).toContain(
      t('settings.formatter.mode.default'),
    );
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

  it('renders config block for config tab', () => {
    const { plugin } = createPlugin();
    const section = new SettingsFormatterSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: displayRefresh,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    section.attachTabbed(containerEl, 'config');

    const headings = containerEl.querySelectorAll('.opencodian-settings-subsection-heading');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(headings[0]?.textContent).toBe(t('settings.formatter.tab.config'));
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

    expect(findSettingRecord(t('settings.formatter.overview.runtimeStatus'))?.desc).toBe(
      t('settings.formatter.overview.runtimeOnline'),
    );
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

    expect(findSettingRecord(t('settings.formatter.overview.runtimeStatus'))?.desc).toBe(
      t('settings.formatter.overview.runtimeError'),
    );
    expect(findSettingRecordByDesc(t('settings.formatter.overview.noRuntime'))).toBeDefined();
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
    const runtimeListRule = findRule('\\.opencodian-formatter-runtime-list', 'background:');
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
    expect(runtimeListRule).toContain('var(--opencodian-settings-object-bg');
    expect(tableRule).toContain('var(--opencodian-settings-row-bg');
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
