import * as fs from 'fs';
import type { App } from 'obsidian';
import * as obsidian from 'obsidian';
import { Setting } from 'obsidian';
import * as os from 'os';
import * as path from 'path';

import type { PluginEnvironmentSnapshot } from '../../../../src/core/config/PluginManagementService';
import { PluginManagementService } from '../../../../src/core/config/PluginManagementService';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsPluginSection } from '../../../../src/features/settings/SettingsPluginSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

interface MockDropdownControl {
  addOption: jest.MockedFunction<(value: string, label: string) => MockDropdownControl>;
  setValue: jest.MockedFunction<(value: string) => MockDropdownControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>;
  selectEl: HTMLSelectElement;
}

interface MockTextAreaControl {
  inputEl: HTMLTextAreaElement;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockTextAreaControl>;
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextAreaControl>;
}

interface MockButtonControl {
  buttonEl: HTMLButtonElement;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  setCta: jest.MockedFunction<() => MockButtonControl>;
  setDisabled: jest.MockedFunction<(value: boolean) => MockButtonControl>;
}

interface DropdownRecord {
  control: MockDropdownControl;
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}

interface TextAreaRecord {
  control: MockTextAreaControl;
  name: string;
}

interface ButtonRecord {
  control: MockButtonControl;
  label?: string;
  name: string;
  onClick?: () => void | Promise<void>;
}

type PluginSectionPlugin = Pick<OpenCodianPlugin, 'app' | 'settings' | 'saveSettings'>;

const dropdownRecords: DropdownRecord[] = [];
const textAreaRecords: TextAreaRecord[] = [];
const buttonRecords: ButtonRecord[] = [];
const tempDirs: string[] = [];

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

function createTextAreaRecord(name: string): TextAreaRecord {
  const inputEl = document.createElement('textarea');
  const record: TextAreaRecord = {
    name,
    control: {
      inputEl,
      onChange: jest.fn(),
      setPlaceholder: jest.fn(),
    },
  };
  record.control.onChange.mockImplementation(() => record.control);
  record.control.setPlaceholder.mockReturnValue(record.control);
  return record;
}

function createButtonRecord(name: string): ButtonRecord {
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
    return record.control;
  });
  record.control.setCta.mockReturnValue(record.control);
  record.control.setDisabled.mockReturnValue(record.control);
  return record;
}

function createSnapshot(
  overrides: Partial<PluginEnvironmentSnapshot> = {},
): PluginEnvironmentSnapshot {
  return {
    serviceMode: 'local',
    isolationMode: 'default',
    vaultConfigDir: '/vault/.opencode',
    globalConfigPath: '/Users/test/.config/opencode/opencode.json',
    projectConfigPath: '/vault/.opencode/opencode.json',
    globalConfigSpecs: [],
    projectConfigSpecs: ['demo-plugin'],
    globalConfigPlugins: [],
    globalDirectoryPlugins: [],
    projectConfigPlugins: [
      {
        kind: 'npm',
        scope: 'project',
        source: 'config',
        specifier: 'demo-plugin',
        displayName: 'demo-plugin',
      },
    ],
    projectDirectoryPlugins: [],
    globalDirectories: [],
    projectDirectories: [],
    globalInfluenceDetected: false,
    omoConfigPath: '/vault/.opencode/oh-my-opencode.jsonc',
    omoConfigExists: false,
    ...overrides,
  };
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function createApp(basePath?: string) {
  const adapter = {
    basePath: basePath ?? '/vault',
    exists: jest.fn().mockResolvedValue(true),
    mkdir: jest.fn().mockResolvedValue(undefined),
    write: jest.fn().mockResolvedValue(undefined),
  };

  return {
    vault: {
      adapter,
    },
    workspace: {
      openLinkText: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function createPlugin(app: ReturnType<typeof createApp>, overrides?: Partial<PluginSectionPlugin['settings']>): PluginSectionPlugin {
  return {
    app: app as unknown as PluginSectionPlugin['app'],
    settings: {
      ...DEFAULT_SETTINGS,
      ...overrides,
      server: {
        ...DEFAULT_SETTINGS.server,
        ...overrides?.server,
        auth: {
          ...DEFAULT_SETTINGS.server.auth,
          ...overrides?.server?.auth,
        },
        local: {
          ...DEFAULT_SETTINGS.server.local,
          ...overrides?.server?.local,
        },
        remote: {
          ...DEFAULT_SETTINGS.server.remote,
          ...overrides?.server?.remote,
        },
      },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  } as unknown as PluginSectionPlugin;
}

function createSection(options: {
  app?: ReturnType<typeof createApp>;
  plugin?: PluginSectionPlugin;
} = {}) {
  const app = options.app ?? createApp();
  const plugin = options.plugin ?? createPlugin(app);
  const section = new SettingsPluginSection({
    app: app as unknown as App,
    plugin: plugin as unknown as OpenCodianPlugin,
    createSectionHeading,
    applyInlineCodeText: (targetEl, text) => {
      if (targetEl) {
        targetEl.textContent = text;
      }
    },
    setSettingNameWithFormatting: (setting, text) => {
      setting.setName(text);
    },
    setSettingDescWithFormatting: (setting, text) => {
      setting.setDesc(text);
    },
  });
  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);
  section.attach(containerEl);
  return { app, containerEl, plugin, section };
}

function findButton(label: string): ButtonRecord | undefined {
  return buttonRecords.find((record) => record.label === label);
}

function findDropdown(name: string): DropdownRecord | undefined {
  return dropdownRecords.find((record) => record.name === name);
}

function findTextArea(name: string): TextAreaRecord | undefined {
  return textAreaRecords.find((record) => record.name === name);
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('SettingsPluginSection', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    dropdownRecords.length = 0;
    textAreaRecords.length = 0;
    buttonRecords.length = 0;

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
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('refreshes the snapshot and repopulates the project config editor', async () => {
    const inspectSpy = jest
      .spyOn(PluginManagementService.prototype, 'inspect')
      .mockResolvedValueOnce(createSnapshot({ projectConfigSpecs: ['demo-plugin'] }))
      .mockResolvedValueOnce(createSnapshot({ projectConfigSpecs: ['updated-plugin'] }));
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);

    createSection();
    await flushAsync();

    const editor = findTextArea(t('settings.plugins.projectConfig.name'));
    const refreshButton = findButton(t('settings.plugins.actions.refresh'));

    expect(editor?.control.inputEl.value).toBe('demo-plugin');
    expect(inspectSpy).toHaveBeenNthCalledWith(1, 'local', 'default');

    await refreshButton?.onClick?.();
    await flushAsync();

    expect(editor?.control.inputEl.value).toBe('updated-plugin');
    expect(refreshButton?.control.setDisabled).toHaveBeenNthCalledWith(1, true);
    expect(refreshButton?.control.setDisabled).toHaveBeenNthCalledWith(2, false);
    expect(inspectSpy).toHaveBeenNthCalledWith(2, 'local', 'default');
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.plugins.refresh.success'));
  });

  it('saves project plugin specs and shows the restart notice', async () => {
    jest
      .spyOn(PluginManagementService.prototype, 'inspect')
      .mockResolvedValueOnce(createSnapshot({ projectConfigSpecs: ['demo-plugin'] }))
      .mockResolvedValueOnce(createSnapshot({ projectConfigSpecs: ['saved-plugin'] }));
    const parseSpy = jest
      .spyOn(PluginManagementService.prototype, 'parsePluginSpecLines')
      .mockReturnValue(['saved-plugin']);
    const updateSpy = jest
      .spyOn(PluginManagementService.prototype, 'updateProjectConfigPlugins')
      .mockResolvedValue(undefined);
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);

    createSection();
    await flushAsync();

    const editor = findTextArea(t('settings.plugins.projectConfig.name'));
    const saveButton = findButton(t('settings.plugins.projectConfig.save'));
    expect(editor).toBeDefined();
    editor!.control.inputEl.value = 'saved-plugin';

    await saveButton?.onClick?.();
    await flushAsync();

    expect(parseSpy).toHaveBeenCalledWith('saved-plugin');
    expect(updateSpy).toHaveBeenCalledWith(['saved-plugin']);
    expect(editor?.control.inputEl.value).toBe('saved-plugin');
    expect(noticeSpy).toHaveBeenNthCalledWith(1, t('settings.plugins.projectConfig.saved'));
    expect(noticeSpy).toHaveBeenNthCalledWith(2, t('settings.plugins.restart.local'));
  });

  it('updates isolation mode, saves settings, and refreshes the snapshot', async () => {
    const inspectSpy = jest
      .spyOn(PluginManagementService.prototype, 'inspect')
      .mockResolvedValueOnce(createSnapshot())
      .mockResolvedValueOnce(createSnapshot({ isolationMode: 'pure' }));
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const app = createApp();
    const plugin = createPlugin(app);

    createSection({ app, plugin });
    await flushAsync();

    const isolationDropdown = findDropdown(t('settings.plugins.isolation.name'));
    expect(isolationDropdown).toBeDefined();

    await isolationDropdown?.onChange?.('pure');
    await flushAsync();

    expect(plugin.settings.pluginIsolationMode).toBe('pure');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(inspectSpy).toHaveBeenNthCalledWith(2, 'local', 'pure');
    expect(noticeSpy).toHaveBeenNthCalledWith(1, t('settings.plugins.isolation.updated'));
    expect(noticeSpy).toHaveBeenNthCalledWith(2, t('settings.plugins.restart.local'));
  });

  it('creates the project plugin directory and refreshes the snapshot', async () => {
    const inspectSpy = jest
      .spyOn(PluginManagementService.prototype, 'inspect')
      .mockResolvedValue(createSnapshot());
    const ensureDirectorySpy = jest
      .spyOn(PluginManagementService.prototype, 'ensureProjectPluginDirectory')
      .mockResolvedValue('/vault/.opencode/plugins');
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);

    createSection();
    await flushAsync();

    const createButton = findButton(t('settings.plugins.projectDirectory.create'));
    await createButton?.onClick?.();
    await flushAsync();

    expect(ensureDirectorySpy).toHaveBeenCalledTimes(1);
    expect(inspectSpy).toHaveBeenCalledTimes(2);
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.plugins.projectDirectory.created'));
  });

  it('ensures and opens the project OMO config before refreshing the snapshot', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-plugin-settings-'));
    tempDirs.push(tempDir);
    const omoPath = path.join(tempDir, '.opencode', 'oh-my-opencode.jsonc');
    fs.mkdirSync(path.dirname(omoPath), { recursive: true });
    fs.writeFileSync(omoPath, '{\n  // test\n}\n', 'utf-8');

    jest
      .spyOn(PluginManagementService.prototype, 'inspect')
      .mockResolvedValue(createSnapshot({ omoConfigPath: omoPath }));
    const ensureOmoSpy = jest
      .spyOn(PluginManagementService.prototype, 'ensureProjectOmoConfig')
      .mockResolvedValue(omoPath);
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const app = createApp(tempDir);
    app.vault.adapter.exists
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    const plugin = createPlugin(app);

    createSection({ app, plugin });
    await flushAsync();

    const openButton = findButton(t('settings.plugins.omo.open'));
    await openButton?.onClick?.();
    await flushAsync();

    expect(ensureOmoSpy).toHaveBeenCalledTimes(1);
    expect(app.vault.adapter.exists).toHaveBeenNthCalledWith(1, '.opencode/oh-my-opencode.jsonc');
    expect(app.vault.adapter.exists).toHaveBeenNthCalledWith(2, '.opencode');
    expect(app.vault.adapter.mkdir).toHaveBeenCalledWith('.opencode');
    expect(app.vault.adapter.write).toHaveBeenCalledWith('.opencode/oh-my-opencode.jsonc', '{\n  // test\n}\n');
    expect(app.workspace.openLinkText).toHaveBeenCalledWith('.opencode/oh-my-opencode.jsonc', '', 'tab');
    expect(noticeSpy).not.toHaveBeenCalledWith(t('settings.plugins.omo.openFailed'));
  });
});

describe('Settings plugin/catalog CSS contract', () => {
  it('keeps agents, commands, and plugin rows aligned with the shared settings hierarchy contract', () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    const findRule = (selector: string, required: string): string => (
      Array.from(css.matchAll(new RegExp(`${selector}\\s*\\{[^}]*\\}`, 'g')))
        .map((match) => match[0])
        .find((rule) => rule.includes(required)) ?? ''
    );

    const blockRule = findRule('\\.opencodian-plugin-block', 'background:');
    const bodyRule = findRule('\\.opencodian-plugin-block-body', 'padding:');
    const catalogRowRule = findRule(
      '\\.opencodian-settings-catalog-scroll > \\.setting-item',
      'background:',
    );
    const classicBlockRule = findRule(
      '\\.opencodian-settings\\[data-settings-layout-mode="classic"\\] \\.opencodian-plugin-block',
      'background:',
    );
    const agentGroupRule = findRule('\\.opencodian-agent-editor-group', 'background:');
    const summaryRule = findRule('\\.opencodian-plugin-summary-row', 'background:');
    const sourcePathRule = findRule('\\.opencodian-plugin-source-path', 'background:');
    const sourceItemRule = findRule(
      '\\.opencodian-plugin-source-item,\\s*\\.opencodian-plugin-source-empty',
      'background:',
    );
    const pluginCatalogCss = css.slice(
      css.indexOf('.opencodian-plugin-block'),
      css.indexOf('.opencodian-mcp-overview-shell'),
    );

    expect(blockRule).toContain('background: transparent');
    expect(blockRule).toContain('border: 0');
    expect(blockRule).toContain('box-shadow: none');
    expect(classicBlockRule).toContain('var(--opencodian-settings-object-bg');
    expect(classicBlockRule).toContain('var(--opencodian-settings-object-border');
    expect(classicBlockRule).toContain('var(--opencodian-settings-radius-row');
    expect(classicBlockRule).toContain('box-shadow: none');
    expect(bodyRule).toContain('var(--opencodian-settings-space-md');
    expect(catalogRowRule).toContain('var(--opencodian-settings-row-bg');
    expect(catalogRowRule).toContain('box-shadow: none');
    expect(agentGroupRule).toContain('var(--opencodian-settings-object-bg');
    expect(agentGroupRule).toContain('box-shadow: none');
    expect(summaryRule).toContain('var(--opencodian-settings-row-bg');
    expect(sourcePathRule).toContain('var(--opencodian-settings-inline-bg');
    expect(sourceItemRule).toContain('var(--opencodian-settings-object-bg');
    expect(pluginCatalogCss).not.toContain('linear-gradient');
    expect(pluginCatalogCss).not.toContain('backdrop-filter');
    expect(pluginCatalogCss).not.toContain('transform: translateY');
    expect(pluginCatalogCss).not.toMatch(/border-left:\s*[2-9]px/);
    expect(pluginCatalogCss).not.toMatch(/opencodian-settings-radius-(md|lg)/);
  });
});
