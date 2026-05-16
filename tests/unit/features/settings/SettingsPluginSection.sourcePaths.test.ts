import type { App } from 'obsidian';
import { Setting } from 'obsidian';

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
  setPlaceholder: jest.MockedFunction<(value: string) => MockTextAreaControl>;
}

interface MockButtonControl {
  buttonEl: HTMLButtonElement;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  setCta: jest.MockedFunction<() => MockButtonControl>;
}

function createSnapshot(): PluginEnvironmentSnapshot {
  return {
    serviceMode: 'local',
    isolationMode: 'default',
    vaultConfigDir: '/vault/.opencode',
    globalConfigPath: '/Users/test/.config/opencode/opencode.json',
    projectConfigPath: '/vault/.opencode/opencode.json',
    globalConfigSpecs: [],
    projectConfigSpecs: [],
    globalConfigPlugins: [],
    globalDirectoryPlugins: [
      {
        kind: 'local',
        scope: 'global',
        source: 'directory',
        specifier: '/Users/test/.config/opencode/plugins/opencode-mem.js',
        displayName: 'opencode-mem.js',
        fullPath: '/Users/test/.config/opencode/plugins/opencode-mem.js',
        disabled: false,
      },
    ],
    projectConfigPlugins: [],
    projectDirectoryPlugins: [],
    disabledProjectConfigPlugins: [],
    disabledProjectDirectoryPlugins: [],
    globalDirectories: [
      {
        scope: 'global',
        path: '/Users/test/.config/opencode/plugins',
        exists: true,
        files: ['/Users/test/.config/opencode/plugins/opencode-mem.js'],
        disabledFiles: [],
      },
    ],
    projectDirectories: [],
    globalInfluenceDetected: true,
    omoConfigPath: '/vault/.opencode/oh-my-opencode.jsonc',
    omoConfigExists: false,
  };
}

function createSection(): HTMLElement {
  const app = {
    vault: {
      adapter: {
        basePath: '/vault',
      },
    },
  };
  const plugin = {
    app,
    settings: DEFAULT_SETTINGS,
    saveSettings: jest.fn(),
  };
  const section = new SettingsPluginSection({
    app: app as unknown as App,
    plugin: plugin as unknown as OpenCodianPlugin,
    createSectionHeading: (containerEl, title) => {
      const headingEl = containerEl.createEl('h2', { text: title });
      return headingEl;
    },
    applyInlineCodeText: (targetEl, text) => {
      if (targetEl) targetEl.textContent = text;
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
  return containerEl;
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('SettingsPluginSection source path rendering', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    jest.spyOn(Setting.prototype, 'setName').mockReturnThis();
    jest.spyOn(Setting.prototype, 'setDesc').mockReturnThis();
    jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function addDropdown(
      this: Setting,
      callback: (control: MockDropdownControl) => unknown,
    ) {
      const control = {
        addOption: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn().mockReturnThis(),
        selectEl: document.createElement('select'),
      } as unknown as MockDropdownControl;
      callback(control);
      return this;
    });
    jest.spyOn(Setting.prototype, 'addTextArea').mockImplementation(function addTextArea(
      this: Setting,
      callback: (control: MockTextAreaControl) => unknown,
    ) {
      callback({
        inputEl: document.createElement('textarea'),
        setPlaceholder: jest.fn().mockReturnThis(),
      } as unknown as MockTextAreaControl);
      return this;
    });
    jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
      this: Setting,
      callback: (control: MockButtonControl) => unknown,
    ) {
      callback({
        buttonEl: document.createElement('button'),
        onClick: jest.fn().mockReturnThis(),
        setButtonText: jest.fn().mockReturnThis(),
        setCta: jest.fn().mockReturnThis(),
      } as unknown as MockButtonControl);
      return this;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps directory path status independent from detected plugins', async () => {
    jest
      .spyOn(PluginManagementService.prototype, 'inspect')
      .mockResolvedValue(createSnapshot());

    const containerEl = createSection();
    await flushAsync();

    const directoryGroups = Array.from(containerEl.querySelectorAll('.opencodian-plugin-source-group'));
    const directoryGroup = directoryGroups.find((group) =>
      group.textContent?.includes(t('settings.plugins.global.directoryTitle'))
    );

    expect(directoryGroup).toBeDefined();
    const pathRows = Array.from(directoryGroup!.querySelectorAll('.opencodian-plugin-source-path-row'));
    expect(pathRows.map((row) => row.getAttribute('data-path-status'))).toEqual(['available']);
    expect(directoryGroup!.querySelector('.opencodian-plugin-source-count')?.textContent).toBe('1');
    expect(directoryGroup!.textContent).toContain('opencode-mem.js');
  });
});
