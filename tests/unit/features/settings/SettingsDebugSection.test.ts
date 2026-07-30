/* eslint-disable max-lines, max-lines-per-function -- Debug settings tests share Obsidian Setting mocks and tab/classic grouping regressions. */

import * as obsidian from 'obsidian';
import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS, getCurrentPlatformKey } from '../../../../src/core/types';
import { SettingsDebugSection } from '../../../../src/features/settings/SettingsDebugSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';
import { clearRecentLogs, createLogger, setDebugLoggingEnabled, setDebugModuleEnabled } from '../../../../src/shared';
import { CLAUDE_CODE_DEBUG_CHANNEL_IDS, DEBUG_MODULE_REGISTRY } from '../../../../src/shared/debugModules';

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
  buttonEl: HTMLButtonElement;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  setCta: jest.MockedFunction<() => MockButtonControl>;
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

interface ButtonRecord {
  control: MockButtonControl;
  label?: string;
  name: string;
  onClick?: () => void | Promise<void>;
}

type DebugSectionPlugin = Pick<
  OpenCodianPlugin,
  | 'settings'
  | 'saveSettings'
  | 'logServerStatusSnapshot'
  | 'buildDiagnosticReport'
  | 'writeDiagnosticLogFile'
  | 'getDebugBuildIdentityText'
>;

const toggleRecords: ToggleRecord[] = [];
const textRecords: TextRecord[] = [];
const buttonRecords: ButtonRecord[] = [];

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
  const record: TextRecord = {
    name,
    control: {
      inputEl: document.createElement('input'),
      setPlaceholder: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
    },
  };
  record.control.setPlaceholder.mockReturnValue(record.control);
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
      buttonEl: document.createElement('button'),
      onClick: jest.fn(),
      setButtonText: jest.fn(),
      setCta: jest.fn(),
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
  return record;
}

function createPlugin(overrides: Partial<DebugSectionPlugin['settings']> = {}): DebugSectionPlugin {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...overrides,
      debugLogPaths: {
        ...DEFAULT_SETTINGS.debugLogPaths,
        ...overrides.debugLogPaths,
      },
      backendSettings: {
        ...DEFAULT_SETTINGS.backendSettings,
        ...overrides.backendSettings,
        claudeCode: {
          ...DEFAULT_SETTINGS.backendSettings.claudeCode,
          ...overrides.backendSettings?.claudeCode,
          debugChannels: {
            ...DEFAULT_SETTINGS.backendSettings.claudeCode.debugChannels,
            ...overrides.backendSettings?.claudeCode?.debugChannels,
          },
        },
      },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    logServerStatusSnapshot: jest.fn().mockResolvedValue(undefined),
    buildDiagnosticReport: jest.fn().mockResolvedValue('diagnostic report'),
    writeDiagnosticLogFile: jest.fn().mockResolvedValue('/Users/test/Exports/opencodian-diagnostics.md'),
    getDebugBuildIdentityText: jest.fn().mockReturnValue('OpenCodian 1.0.0 BUILD_ID=test-build'),
  } as unknown as DebugSectionPlugin;
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function createSection(plugin = createPlugin()) {
  const section = new SettingsDebugSection({
    plugin: plugin as unknown as OpenCodianPlugin,
    createSectionHeading,
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

function createTabbedSection(secondaryTabId: string, plugin = createPlugin()) {
  const section = new SettingsDebugSection({
    plugin: plugin as unknown as OpenCodianPlugin,
    createSectionHeading,
  });
  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);
  section.attachTabbed(containerEl, secondaryTabId);
  return {
    containerEl,
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

function findButton(label: string): ButtonRecord | undefined {
  return buttonRecords.find((record) => record.label === label);
}

function countTextMatches(rootEl: Element, expectedText: string): number {
  return Array.from(rootEl.querySelectorAll('h4, .opencodian-settings-block-desc'))
    .filter((el) => el.textContent === expectedText)
    .length;
}

function mockClipboard(): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: jest.fn().mockResolvedValue(undefined),
    },
  });
}

function mockSettingPrototype(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
    (this as Setting & { __settingName?: string }).__settingName = name;
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting) {
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
    const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
    const record = createButtonRecord(name);
    buttonRecords.push(record);
    callback(record.control);
    return this;
  });
}

describe('SettingsDebugSection', () => {
  const originalRequire = (globalThis as typeof globalThis & { require?: (module: string) => unknown }).require;

  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    toggleRecords.length = 0;
    textRecords.length = 0;
    buttonRecords.length = 0;
    clearRecentLogs();
    setDebugLoggingEnabled(true);
    setDebugModuleEnabled('claudeCode', true);
    setDebugModuleEnabled('settings', true);
    mockClipboard();
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setDebugLoggingEnabled(false);
    setDebugModuleEnabled('claudeCode', false);
    setDebugModuleEnabled('settings', false);
    clearRecentLogs();
    document.body.innerHTML = '';

    const globalWithRequire = globalThis as typeof globalThis & {
      require?: (module: string) => unknown;
    };
    globalWithRequire.require = originalRequire;
  });

  it('keeps Obsidian Setting mock usable after jsdom document teardown', () => {
    jest.restoreAllMocks();
    obsidian.__setMockDocumentProvider(() => undefined);

    try {
      const setting = new Setting();
      expect(setting.settingEl).toBeDefined();
      expect(setting.controlEl).toBeDefined();
      expect(() => setting.setName('Late async setting')).not.toThrow();
    } finally {
      obsidian.__resetMockDocumentProvider();
      mockSettingPrototype();
    }
  });

  it('renders debug help and saves debug toggles with existing semantics', async () => {
    const plugin = createPlugin();
    const { headingEl, containerEl } = createSection(plugin);
    const debugToggle = findToggle(t('settings.debug.logging.name'));
    const inlineArgsToggle = findToggle(t('settings.debug.inlineSerializedArgs.name'));

    expect(headingEl.textContent).toBe(t('settings.debug.title'));
    expect(containerEl.querySelector('.opencodian-debug-help-title')?.textContent).toBe(
      t('settings.debug.console.howToOpen'),
    );
    expect(containerEl.querySelectorAll('.opencodian-debug-help-item')).toHaveLength(2);
    expect(debugToggle?.control.setValue).toHaveBeenCalledWith(DEFAULT_SETTINGS.enableDebugLogging);
    expect(inlineArgsToggle?.control.setValue).toHaveBeenCalledWith(
      DEFAULT_SETTINGS.inlineSerializedDebugLogArgs,
    );

    await debugToggle?.onChange?.(true);
    await inlineArgsToggle?.onChange?.(true);

    expect(plugin.settings.enableDebugLogging).toBe(true);
    expect(plugin.settings.inlineSerializedDebugLogArgs).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
    expect(plugin.logServerStatusSnapshot).toHaveBeenCalledWith('settings-toggle');
  });

  it('renders module logging controls and persists module toggles independently', async () => {
    const plugin = createPlugin({
      enableDebugLogging: true,
      debugModuleSettings: {
        ...DEFAULT_SETTINGS.debugModuleSettings,
        contextUsage: false,
      },
    });

    createSection(plugin);

    for (const debugModule of DEBUG_MODULE_REGISTRY) {
      expect(findToggle(t(debugModule.labelKey as never))).toBeDefined();
    }

    const contextUsageToggle = findToggle(t('settings.debug.modules.contextUsage.name'));
    expect(contextUsageToggle?.control.setValue).toHaveBeenCalledWith(false);

    await contextUsageToggle?.onChange?.(true);

    expect(plugin.settings.debugModuleSettings.contextUsage).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it('renders tabbed debug groups by diagnostic source', () => {
    const { containerEl } = createTabbedSection('opencode');
    const blockDisplays = Array.from(containerEl.querySelectorAll('[data-section-block]'))
      .map((blockEl) => [
        (blockEl as HTMLElement).dataset.sectionBlock,
        (blockEl as HTMLElement).style.display,
      ]);

    expect(blockDisplays).toEqual([
      ['plugin', 'none'],
      ['opencode', ''],
      ['codex', 'none'],
      ['claude-code', 'none'],
      ['export', 'none'],
    ]);
    expect(containerEl.querySelector('[data-section-block="plugin"] h4')?.textContent).toBe(
      t('settings.debug.modules.plugin.title'),
    );
    expect(containerEl.querySelector('[data-section-block="opencode"] h4')?.textContent).toBe(
      t('settings.debug.modules.opencode.title'),
    );
    expect(containerEl.querySelector('[data-section-block="claude-code"] h4')?.textContent).toBe(
      t('settings.debug.modules.claudeCode.title'),
    );
    expect(containerEl.querySelector('[data-section-block="export"] h4')?.textContent).toBe(
      t('settings.debug.export.title'),
    );
  });

  it('keeps historically anomalous OpenCode traces marked after they are read', () => {
    const plugin = createPlugin();
    (plugin as unknown as {
      openCodeTraceService: {
        store: { getStatus: () => unknown; listSummaries: () => unknown[] };
      };
    }).openCodeTraceService = {
      store: {
        getStatus: () => ({
          mode: 'disk',
          rootDirectory: '/tmp/opencode-trace',
          queuedEvents: 0,
          approximateBytes: 100,
          droppedEvents: 0,
        }),
        listSummaries: () => [{
          traceId: 'trace-read-critical',
          sessionId: 'ses-read-critical',
          lastUpdatedAt: '2026-07-29T00:00:00.000Z',
          eventCount: 4,
          runCount: 1,
          highestSeverity: 'critical',
          highestUnreadSeverity: undefined,
          unreadAnomalyCount: 0,
          deepCaptureCount: 0,
        }],
      },
    };

    const { containerEl } = createTabbedSection('opencode', plugin);
    expect(containerEl.querySelector('[data-has-anomaly="true"]')?.textContent)
      .toContain('ses-read-critical');
  });

  it('renders every tabbed debug source inside the shared settings shell', () => {
    const { containerEl } = createTabbedSection('plugin');
    const shellEls = Array.from(containerEl.querySelectorAll('[data-debug-tab-shell="true"]'));

    expect(shellEls.map((el) => (el as HTMLElement).dataset.sectionBlock)).toEqual([
      'plugin',
      'opencode',
      'codex',
      'claude-code',
      'export',
    ]);
    for (const shellEl of shellEls) {
      expect(shellEl.classList.contains('opencodian-debug-tab-shell')).toBe(true);
      expect(shellEl.querySelector('.opencodian-debug-tab-header')).not.toBeNull();
      expect(shellEl.querySelector('.opencodian-debug-tab-body')).not.toBeNull();
      expect(shellEl.querySelector('.opencodian-debug-tab-badge')).not.toBeNull();
    }
    expect(containerEl.querySelector('[data-section-block="plugin"]')?.textContent).toContain(
      t('settings.debug.modules.plugin.desc'),
    );
  });

  it('renders each tabbed debug shell title and description only once', () => {
    const { containerEl } = createTabbedSection('plugin');
    const tabCopy = [
      {
        id: 'plugin',
        title: t('settings.debug.modules.plugin.title'),
        description: t('settings.debug.modules.plugin.desc'),
      },
      {
        id: 'opencode',
        title: t('settings.debug.modules.opencode.title'),
        description: t('settings.debug.modules.opencode.desc'),
      },
      {
        id: 'codex',
        title: t('settings.debug.modules.codex.title'),
        description: t('settings.debug.modules.codex.desc'),
      },
      {
        id: 'claude-code',
        title: t('settings.debug.modules.claudeCode.title'),
        description: t('settings.debug.modules.claudeCode.groupDesc'),
      },
      {
        id: 'export',
        title: t('settings.debug.export.title'),
        description: t('settings.debug.export.desc'),
      },
    ] as const;

    for (const copy of tabCopy) {
      const shellEl = containerEl.querySelector(`[data-section-block="${copy.id}"]`);
      expect(shellEl).not.toBeNull();
      expect(countTextMatches(shellEl!, copy.title)).toBe(1);
      expect(countTextMatches(shellEl!, copy.description)).toBe(1);
    }
  });

  it('keeps ordinary debug setting rows neutral instead of badge or diagnostic card rows', () => {
    const { containerEl } = createTabbedSection('claude-code');
    const ordinaryRows = Array.from(
      containerEl.querySelectorAll<HTMLElement>(
        '.opencodian-debug-global-panel > .setting-item, '
          + '.opencodian-debug-modules > .setting-item, '
          + '.opencodian-debug-export > .setting-item, '
          + '.opencodian-debug-channel-list .setting-item',
      ),
    );
    const statusItems = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.opencodian-debug-status-item'),
    );

    expect(ordinaryRows.length).toBeGreaterThan(0);
    for (const rowEl of ordinaryRows) {
      expect(rowEl.classList.contains('opencodian-debug-tab-badge')).toBe(false);
      expect(rowEl.classList.contains('opencodian-debug-status-item')).toBe(false);
      expect(rowEl.className).not.toContain('object');
      expect(rowEl.className).not.toContain('accent');
      expect(rowEl.className).not.toContain('purple');
      expect(rowEl.className).not.toContain('violet');
    }
    for (const statusEl of statusItems) {
      expect(statusEl.classList.contains('opencodian-debug-tab-badge')).toBe(false);
    }
  });

  it('renders a Claude Code debug workbench with channel controls and filtered logs', async () => {
    const runtimeLogger = createLogger('ClaudeCodeAdapter', { moduleKey: 'claudeCode', channel: 'runtime' });
    const streamLogger = createLogger('ClaudeCodeStreamNormalizer', { moduleKey: 'claudeCode', channel: 'stream' });
    const appLogger = createLogger('SettingsDebugSection', { moduleKey: 'settings' });
    runtimeLogger.debug('runtime visible');
    streamLogger.debug('stream hidden');
    appLogger.debug('settings hidden');
    const plugin = createPlugin({
      activeBackend: 'claude-code',
      enableDebugLogging: true,
      backendSettings: {
        ...DEFAULT_SETTINGS.backendSettings,
        claudeCode: {
          ...DEFAULT_SETTINGS.backendSettings.claudeCode,
          debugChannels: {
            ...DEFAULT_SETTINGS.backendSettings.claudeCode.debugChannels,
            stream: false,
          },
        },
      },
    });

    const { containerEl } = createTabbedSection('claude-code', plugin);

    expect(containerEl.querySelector('.opencodian-debug-status-strip')?.textContent).toContain(
      t('settings.debug.claude.status.backendActive'),
    );
    expect(containerEl.querySelector('.opencodian-debug-privacy-note')?.textContent).toContain(
      t('settings.debug.claude.privacy.title'),
    );
    expect(containerEl.querySelector('[data-claude-code-log-preview="true"]')?.textContent).toContain('runtime visible');
    expect(containerEl.querySelector('[data-claude-code-log-preview="true"]')?.textContent).not.toContain('stream hidden');
    expect(containerEl.querySelector('[data-claude-code-log-preview="true"]')?.textContent).not.toContain('settings hidden');
    for (const channelId of CLAUDE_CODE_DEBUG_CHANNEL_IDS) {
      expect(findToggle(t(`settings.debug.claude.channel.${channelId}.name` as never))).toBeDefined();
    }

    const streamToggle = findToggle(t('settings.debug.claude.channel.stream.name' as never));
    expect(streamToggle?.control.setValue).toHaveBeenCalledWith(false);
    await streamToggle?.onChange?.(true);

    expect(plugin.settings.backendSettings.claudeCode.debugChannels.stream).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(containerEl.querySelector('[data-claude-code-log-preview="true"]')?.textContent).toContain('stream hidden');
  });

  it('copies visible Claude Code logs and diagnostic reports from the workbench', async () => {
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const clipboardSpy = jest
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    createLogger('ClaudeCodeAdapter', { moduleKey: 'claudeCode', channel: 'runtime' }).debug('copy me');
    const plugin = createPlugin();

    createTabbedSection('claude-code', plugin);

    const copyVisibleButton = Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === t('settings.debug.claude.logs.copyVisible'));
    const copyDiagnosticsButton = Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === t('settings.debug.claude.logs.copyDiagnostics'));

    copyVisibleButton?.click();
    await Promise.resolve();
    copyDiagnosticsButton?.click();
    await Promise.resolve();

    expect(clipboardSpy).toHaveBeenCalledWith(expect.stringContaining('copy me'));
    expect(plugin.buildDiagnosticReport).not.toHaveBeenCalled();
    expect(clipboardSpy).toHaveBeenCalledWith(expect.stringContaining('# OpenCodian Claude Code Diagnostic Report'));
    expect(clipboardSpy).toHaveBeenCalledWith(expect.stringContaining('Enabled debug channels:'));
    expect(clipboardSpy).toHaveBeenCalledWith(expect.stringContaining('copy me'));
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.debug.claude.logs.copyVisibleSuccess'));
  });

  it('persists the debug refresh interval from the settings panel', async () => {
    const plugin = createPlugin({
      debugRefreshIntervalMs: 4000,
    });

    createSection(plugin);
    const refreshIntervalField = findText(t('settings.debug.refreshInterval.name'));

    expect(refreshIntervalField?.control.setValue).toHaveBeenCalledWith('4000');

    await refreshIntervalField?.onChange?.('2500');

    expect(plugin.settings.debugRefreshIntervalMs).toBe(2500);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it('uses the directory picker button to update the current platform log path', async () => {
    const platformKey = getCurrentPlatformKey();
    const currentPath = '/tmp/current-debug';
    const dialog = {
      showOpenDialog: jest.fn().mockResolvedValue({
        canceled: false,
        filePaths: ['/tmp/picked-debug'],
      }),
    };
    const globalWithRequire = globalThis as typeof globalThis & {
      require?: (module: string) => unknown;
    };
    globalWithRequire.require = jest.fn().mockImplementation((module: string) => {
      if (module === '@electron/remote') {
        return { dialog };
      }
      throw new Error(`Unexpected module: ${module}`);
    });
    const plugin = createPlugin({
      debugLogPaths: {
        ...DEFAULT_SETTINGS.debugLogPaths,
        [platformKey]: currentPath,
      },
    });

    createSection(plugin);
    const logPathField = findText(t('settings.debug.logPath.name'));
    const chooseButton = findButton(t('settings.debug.logPath.choose'));

    await chooseButton?.onClick?.();

    expect(dialog.showOpenDialog).toHaveBeenCalledWith({
      title: t('settings.debug.logPath.dialogTitle'),
      buttonLabel: t('settings.debug.logPath.dialogButton'),
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: currentPath,
    });
    expect(plugin.settings.debugLogPaths[platformKey]).toBe('/tmp/picked-debug');
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(logPathField?.control.setValue).toHaveBeenLastCalledWith('/tmp/picked-debug');
  });

  it('copies diagnostics and persists a generated export directory after confirmation', async () => {
    const platformKey = getCurrentPlatformKey();
    const exportDirectory = '/tmp';
    const dialog = {
      showOpenDialog: jest.fn().mockResolvedValue({
        canceled: false,
        filePaths: [exportDirectory],
      }),
    };
    const globalWithRequire = globalThis as typeof globalThis & {
      require?: (module: string) => unknown;
    };
    globalWithRequire.require = jest.fn().mockImplementation((module: string) => {
      if (module === '@electron/remote') {
        return { dialog };
      }
      throw new Error(`Unexpected module: ${module}`);
    });

    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const clipboardSpy = jest
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    const plugin = createPlugin({
      allowedExportPaths: [exportDirectory],
      debugLogPaths: {
        ...DEFAULT_SETTINGS.debugLogPaths,
        [platformKey]: '',
      },
    });
    plugin.writeDiagnosticLogFile = jest
      .fn()
      .mockResolvedValue(`${exportDirectory}/opencodian-diagnostics.md`);

    createSection(plugin);
    const logPathField = findText(t('settings.debug.logPath.name'));
    const copyButton = findButton(t('settings.debug.actions.copy'));
    const generateButton = findButton(t('settings.debug.actions.generate'));

    await copyButton?.onClick?.();
    await generateButton?.onClick?.();

    expect(plugin.buildDiagnosticReport).toHaveBeenCalledWith('copy-diagnostics');
    expect(clipboardSpy).toHaveBeenCalledWith('diagnostic report');
    expect(dialog.showOpenDialog).toHaveBeenCalledWith({
      title: t('settings.debug.logPath.dialogTitle'),
      buttonLabel: t('settings.debug.logPath.dialogButton'),
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: exportDirectory,
    });
    expect(plugin.writeDiagnosticLogFile).toHaveBeenCalledWith(exportDirectory, 'settings-export');
    expect(confirmSpy).toHaveBeenCalledWith(
      t('settings.debug.logPath.confirmUseDefault', { path: exportDirectory }),
    );
    expect(plugin.settings.debugLogPaths[platformKey]).toBe(exportDirectory);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(logPathField?.control.setValue).toHaveBeenLastCalledWith(exportDirectory);
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.debug.actions.copySuccess'));
    expect(noticeSpy).toHaveBeenCalledWith(
      t('settings.debug.actions.generateSuccess', {
        path: `${exportDirectory}/opencodian-diagnostics.md`,
      }),
    );
  });

  it('can clear recent logs and copy version/build identity from the debug panel', async () => {
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const clipboardSpy = jest
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    const plugin = createPlugin();

    createSection(plugin);
    const clearButton = findButton(t('settings.debug.actions.clearLogs'));
    const copyVersionButton = findButton(t('settings.debug.actions.copyVersion'));

    await clearButton?.onClick?.();
    await copyVersionButton?.onClick?.();

    expect(clipboardSpy).toHaveBeenCalledWith(expect.stringContaining('OpenCodian'));
    expect(clipboardSpy).toHaveBeenCalledWith(expect.stringContaining('BUILD_ID='));
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.debug.actions.clearLogsSuccess'));
    expect(noticeSpy).toHaveBeenCalledWith(t('settings.debug.actions.copyVersionSuccess'));
  });
});
