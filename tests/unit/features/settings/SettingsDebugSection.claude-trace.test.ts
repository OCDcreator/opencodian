/* eslint-disable max-lines, max-lines-per-function -- Claude trace settings mirror the Codex workbench contract. */

import * as obsidian from 'obsidian';
import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { createClaudeTraceDiagnosticsPort } from '../../../../src/features/settings/debug/types';
import { SettingsDebugSection } from '../../../../src/features/settings/SettingsDebugSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';
import { clearRecentLogs, setDebugLoggingEnabled, setDebugModuleEnabled } from '../../../../src/shared';

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

interface MockDropdownControl {
  options: Record<string, string>;
  addOption: jest.MockedFunction<(value: string, label: string) => MockDropdownControl>;
  setValue: jest.MockedFunction<(value: string) => MockDropdownControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>;
}

interface ToggleRecord { control: MockToggleControl; name: string; onChange?: (value: boolean) => void | Promise<void>; }
interface TextRecord { control: MockTextControl; name: string; onChange?: (value: string) => void | Promise<void>; }
interface DropdownRecord { control: MockDropdownControl; name: string; onChange?: (value: string) => void | Promise<void>; }

interface ClaudeTraceServiceStub {
  getStorageStatus: jest.Mock;
  listRecentTraces: jest.Mock;
  buildSmartReport: jest.Mock;
  exportTrace: jest.Mock;
  clearAll: jest.Mock;
  reportBuilder: { buildSmartReport: jest.Mock };
  store: {
    getStatus: jest.Mock;
    listSummaries: jest.Mock;
    flush: jest.Mock;
    exportTraceBundle: jest.Mock;
    clear: jest.Mock;
    deleteTrace: jest.Mock;
  };
}

type DebugSectionPlugin = Pick<
  OpenCodianPlugin,
  'settings' | 'saveSettings' | 'logServerStatusSnapshot' | 'buildDiagnosticReport' | 'writeDiagnosticLogFile' | 'getDebugBuildIdentityText'
> & { claudeTraceService?: ClaudeTraceServiceStub };

const toggleRecords: ToggleRecord[] = [];
const textRecords: TextRecord[] = [];
const dropdownRecords: DropdownRecord[] = [];

function createToggleRecord(name: string): ToggleRecord {
  const record = { name, control: { setValue: jest.fn(), onChange: jest.fn() } } as unknown as ToggleRecord;
  record.control.setValue.mockReturnValue(record.control);
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  return record;
}

function createTextRecord(name: string): TextRecord {
  const record = {
    name,
    control: {
      inputEl: document.createElement('input'),
      setPlaceholder: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
    },
  } as unknown as TextRecord;
  record.control.setPlaceholder.mockReturnValue(record.control);
  record.control.setValue.mockReturnValue(record.control);
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  return record;
}

function createDropdownRecord(name: string): DropdownRecord {
  const record = {
    name,
    control: {
      options: {},
      addOption: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
    },
  } as unknown as DropdownRecord;
  record.control.addOption.mockImplementation((value, label) => {
    record.control.options[value] = label;
    return record.control;
  });
  record.control.setValue.mockReturnValue(record.control);
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  return record;
}

function createTraceService(summaries: unknown[] = []): ClaudeTraceServiceStub {
  const status = {
    mode: 'memory',
    rootDirectory: '/tmp/opencodian-claude-trace',
    queuedEvents: 3,
    approximateBytes: 4096,
    droppedEvents: 2,
    lastError: 'disk unavailable',
  };
  const service = {
    getStorageStatus: jest.fn().mockReturnValue(status),
    listRecentTraces: jest.fn((limit?: number) => summaries.slice(0, limit ?? summaries.length)),
    buildSmartReport: jest.fn().mockResolvedValue('# Claude trace report'),
    exportTrace: jest.fn().mockResolvedValue('/tmp/export/claude-trace'),
    clearAll: jest.fn().mockResolvedValue(undefined),
    reportBuilder: { buildSmartReport: jest.fn().mockResolvedValue('# Claude trace report') },
    store: {
      getStatus: jest.fn().mockReturnValue(status),
      listSummaries: jest.fn().mockReturnValue(summaries),
      flush: jest.fn().mockResolvedValue(undefined),
      exportTraceBundle: jest.fn().mockResolvedValue('/tmp/export/claude-trace'),
      clear: jest.fn().mockResolvedValue(undefined),
      deleteTrace: jest.fn().mockResolvedValue(undefined),
    },
  };
  return service;
}

function createPlugin(overrides: Partial<DebugSectionPlugin['settings']> = {}): DebugSectionPlugin {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...overrides,
      debugLogPaths: { ...DEFAULT_SETTINGS.debugLogPaths, ...overrides.debugLogPaths },
      backendSettings: { ...DEFAULT_SETTINGS.backendSettings, ...overrides.backendSettings },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    logServerStatusSnapshot: jest.fn().mockResolvedValue(undefined),
    buildDiagnosticReport: jest.fn().mockResolvedValue('diagnostic report'),
    writeDiagnosticLogFile: jest.fn().mockResolvedValue('/tmp/opencodian-diagnostics.md'),
    getDebugBuildIdentityText: jest.fn().mockReturnValue('OpenCodian BUILD_ID=test-build'),
  } as unknown as DebugSectionPlugin;
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function mockSettingPrototype(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
    (this as Setting & { __settingName?: string }).__settingName = name;
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting) { return this; });
  jest.spyOn(Setting.prototype, 'setClass').mockImplementation(function setClass(this: Setting) { return this; });
  jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function addToggle(this: Setting, callback: (control: MockToggleControl) => unknown) {
    const record = createToggleRecord((this as Setting & { __settingName?: string }).__settingName ?? '');
    toggleRecords.push(record);
    callback(record.control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function addText(this: Setting, callback: (control: MockTextControl) => unknown) {
    const record = createTextRecord((this as Setting & { __settingName?: string }).__settingName ?? '');
    textRecords.push(record);
    callback(record.control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function addDropdown(this: Setting, callback: (control: MockDropdownControl) => unknown) {
    const record = createDropdownRecord((this as Setting & { __settingName?: string }).__settingName ?? '');
    dropdownRecords.push(record);
    callback(record.control);
    return this;
  });
}

function renderTabbed(secondaryTabId: string, plugin = createPlugin()): { containerEl: HTMLElement; plugin: DebugSectionPlugin; section: SettingsDebugSection } {
  const section = new SettingsDebugSection({
    plugin: plugin as unknown as OpenCodianPlugin,
    getClaudeDiagnostics: () => createClaudeTraceDiagnosticsPort(
      plugin.claudeTraceService as unknown as Parameters<typeof createClaudeTraceDiagnosticsPort>[0],
    ),
    createSectionHeading,
  });
  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);
  section.attachTabbed(containerEl, secondaryTabId);
  return { containerEl, plugin, section };
}

function findToggle(name: string): ToggleRecord | undefined { return [...toggleRecords].reverse().find((record) => record.name === name); }
function findText(name: string): TextRecord | undefined { return [...textRecords].reverse().find((record) => record.name === name); }
function findDropdown(name: string): DropdownRecord | undefined { return [...dropdownRecords].reverse().find((record) => record.name === name); }
function findButton(containerEl: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(containerEl.querySelectorAll('button')).find((button) => button.textContent === label) as HTMLButtonElement | undefined;
}

function mockClipboard(): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
}

function summary(index: number): Record<string, unknown> {
  return {
    traceId: `trace-${index}`,
    sessionId: `session-${index}`,
    lastUpdatedAt: '2026-07-30T00:00:00.000Z',
    eventCount: 3,
    runCount: 1,
    highestSeverity: 'info',
    unreadAnomalyCount: 0,
    deepCaptureCount: 0,
  };
}

describe('SettingsDebugSection Claude session trace block', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    toggleRecords.length = 0;
    textRecords.length = 0;
    dropdownRecords.length = 0;
    clearRecentLogs();
    setDebugLoggingEnabled(true);
    setDebugModuleEnabled('settings', true);
    mockClipboard();
    jest.spyOn(window, 'prompt').mockReturnValue(null);
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setDebugLoggingEnabled(false);
    setDebugModuleEnabled('settings', false);
    clearRecentLogs();
    document.body.innerHTML = '';
  });

  it('places the Claude trace subsection between logger channels and the existing log preview', async () => {
    const plugin = createPlugin();
    plugin.claudeTraceService = createTraceService();
    const { containerEl } = renderTabbed('claude-code', plugin);
    const block = containerEl.querySelector('[data-debug-workbench="claude-code"]');
    expect(block).not.toBeNull();
    const status = block?.querySelector('[data-claude-trace-status="true"]');
    const catalog = block?.querySelector('[data-claude-trace-catalog="true"]');
    const loggerChannels = Array.from(block?.querySelectorAll('h4') ?? []).find((heading) => heading.textContent === t('settings.debug.claude.channels.title'));
    const logPreview = block?.querySelector('[data-claude-code-log-preview="true"]');
    expect(status).not.toBeNull();
    expect(catalog).not.toBeNull();
    expect(loggerChannels).not.toBeUndefined();
    expect(logPreview).not.toBeNull();
    expect(loggerChannels!.compareDocumentPosition(status!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(status!.compareDocumentPosition(logPreview!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(block?.textContent).toContain(t('settings.debug.claude.logs.title'));

    const existingLoggerToggle = findToggle(t('settings.debug.claude.channel.runtime.name'));
    await existingLoggerToggle?.onChange?.(false);
    expect(plugin.settings.backendSettings.claudeCode.debugChannels.runtime).toBe(false);
    expect(block?.querySelector('[data-claude-code-log-preview="true"]')).not.toBeNull();
  });

  it('binds enabled, off/standard/full presets, storage directory, and all five trace channels', async () => {
    const plugin = createPlugin();
    plugin.claudeTraceService = createTraceService();
    renderTabbed('claude-code', plugin);

    const enabled = findToggle(t('settings.debug.claude.enabled.name'));
    expect(enabled).toBeDefined();
    await enabled?.onChange?.(false);
    expect(plugin.settings.backendSettings.claudeCode.sessionTrace.enabled).toBe(false);

    const preset = findDropdown(t('settings.debug.claude.preset.name'));
    expect(preset).toBeDefined();
    expect(preset?.control.options).toEqual(expect.objectContaining({
      off: t('settings.debug.claude.preset.off'),
      standard: t('settings.debug.claude.preset.standard'),
      full: t('settings.debug.claude.preset.full'),
    }));
    await preset?.onChange?.('full');
    expect(plugin.settings.backendSettings.claudeCode.sessionTrace.consolePreset).toBe('full');
    await preset?.onChange?.('off');
    expect(plugin.settings.backendSettings.claudeCode.sessionTrace.consolePreset).toBe('off');

    const storage = findText(t('settings.debug.claude.storage.name'));
    await storage?.onChange?.('  /tmp/claude-traces  ');
    expect(plugin.settings.backendSettings.claudeCode.sessionTrace.storageDirectory).toBe('/tmp/claude-traces');

    const channelIds = ['lifecycle', 'stream-sync', 'tool-interaction', 'persistence-recovery', 'service-output'] as const;
    for (const channelId of channelIds) {
      const channel = findToggle(t(`settings.debug.claude.channel.${channelId}.name` as never));
      expect(channel).toBeDefined();
      await channel?.onChange?.(false);
      expect(plugin.settings.backendSettings.claudeCode.sessionTrace.consoleChannels[channelId]).toBe(false);
    }
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  it('renders storage status and keeps degraded details visible', () => {
    const plugin = createPlugin();
    plugin.claudeTraceService = createTraceService();
    const { containerEl } = renderTabbed('claude-code', plugin);
    const status = containerEl.querySelector('[data-claude-trace-status="true"]');
    expect(status?.textContent).toContain('memory');
    expect(status?.textContent).toContain('/tmp/opencodian-claude-trace');
    expect(status?.textContent).toContain('3');
    expect(status?.textContent).toContain('4 KiB');
    expect(status?.textContent).toContain('2');
    expect(status?.textContent).toContain('disk unavailable');
  });

  it('supports smart report copy, latest export, clear-all, and row copy/delete actions', async () => {
    const summaries = Array.from({ length: 25 }, (_, index) => summary(index));
    const plugin = createPlugin({ debugLogPaths: { unix: '/tmp' } });
    const service = createTraceService(summaries);
    plugin.claudeTraceService = service;
    const { containerEl } = renderTabbed('claude-code', plugin);
    const block = containerEl.querySelector('[data-debug-workbench="claude-code"]') as HTMLElement;
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    const copyReport = findButton(block, t('settings.debug.claude.actions.copyReport'));
    expect(copyReport).toBeDefined();
    copyReport?.click();
    await Promise.resolve();
    expect(service.buildSmartReport).toHaveBeenCalled();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('# Claude trace report');

    const exportButton = findButton(block, t('settings.debug.claude.actions.export'));
    exportButton?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(service.exportTrace).toHaveBeenCalledWith('trace-0', '/tmp');

    const catalog = containerEl.querySelector('[data-claude-trace-catalog="true"]') as HTMLElement;
    const rows = catalog.querySelectorAll('.opencodian-debug-trace-row');
    expect(rows).toHaveLength(20);
    const firstRow = rows[0] as HTMLElement;
    findButton(firstRow, t('settings.debug.claude.recent.copy'))?.click();
    await Promise.resolve();
    expect(service.buildSmartReport).toHaveBeenCalledWith('trace-0');
    findButton(firstRow, t('settings.debug.claude.recent.delete'))?.click();
    await Promise.resolve();
    expect(service.clearAll).not.toHaveBeenCalled();
    expect(service.store.deleteTrace).toHaveBeenCalledWith('trace-0');
    expect(firstRow.isConnected).toBe(false);

    const clear = findButton(block, t('settings.debug.claude.actions.clear'));
    clear?.click();
    await Promise.resolve();
    expect(service.clearAll).toHaveBeenCalled();
  });
});

void obsidian;
