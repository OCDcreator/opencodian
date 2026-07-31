/* eslint-disable max-lines, max-lines-per-function -- Focused Claude workbench contract uses a local Obsidian Setting harness. */

import { Setting } from 'obsidian';

import { getDefaultBackendSettings } from '../../../../src/core/types';
import { ClaudeCodeDebugPanel } from '../../../../src/features/settings/debug/ClaudeCodeDebugPanel';
import type {
  ClaudeCodeDebugPanelOptions,
  ClaudeTraceDiagnosticsPort,
} from '../../../../src/features/settings/debug/types';
import { setLocale, t } from '../../../../src/i18n';

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
  addOption: jest.MockedFunction<(value: string, label: string) => MockDropdownControl>;
  setValue: jest.MockedFunction<(value: string) => MockDropdownControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>;
}

interface ToggleRecord { name: string; onChange?: (value: boolean) => void | Promise<void>; }
interface TextRecord { name: string; onChange?: (value: string) => void | Promise<void>; }
interface DropdownRecord { name: string; onChange?: (value: string) => void | Promise<void>; }
interface ActionRecord {
  containerEl: HTMLElement;
  label: string;
  onClick: () => void | Promise<void>;
  buttonEl: HTMLButtonElement;
}

const toggleRecords: ToggleRecord[] = [];
const textRecords: TextRecord[] = [];
const dropdownRecords: DropdownRecord[] = [];
const actionRecords: ActionRecord[] = [];

function mockSettingPrototype(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
    (this as Setting & { testName?: string }).testName = name;
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting) { return this; });
  jest.spyOn(Setting.prototype, 'setClass').mockImplementation(function setClass(this: Setting) { return this; });
  jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function addToggle(
    this: Setting,
    callback: (control: MockToggleControl) => unknown,
  ) {
    const record: ToggleRecord = { name: (this as Setting & { testName?: string }).testName ?? '' };
    const control = {
      setValue: jest.fn(),
      onChange: jest.fn((onChange) => {
        record.onChange = onChange;
        return control;
      }),
    } as unknown as MockToggleControl;
    control.setValue.mockReturnValue(control);
    toggleRecords.push(record);
    callback(control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function addText(
    this: Setting,
    callback: (control: MockTextControl) => unknown,
  ) {
    const record: TextRecord = { name: (this as Setting & { testName?: string }).testName ?? '' };
    const control = {
      inputEl: document.createElement('input'),
      setPlaceholder: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn((onChange) => {
        record.onChange = onChange;
        return control;
      }),
    } as unknown as MockTextControl;
    control.setPlaceholder.mockReturnValue(control);
    control.setValue.mockReturnValue(control);
    textRecords.push(record);
    callback(control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function addDropdown(
    this: Setting,
    callback: (control: MockDropdownControl) => unknown,
  ) {
    const record: DropdownRecord = { name: (this as Setting & { testName?: string }).testName ?? '' };
    const control = {
      addOption: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn((onChange) => {
        record.onChange = onChange;
        return control;
      }),
    } as unknown as MockDropdownControl;
    control.addOption.mockReturnValue(control);
    control.setValue.mockReturnValue(control);
    dropdownRecords.push(record);
    callback(control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(this: Setting) { return this; });
}

function createDiagnostics(summaries: object[] = []) {
  const operationOrder: string[] = [];
  const port = {
    getStorageStatus: jest.fn(() => {
      operationOrder.push('getStorageStatus');
      return {
        mode: 'memory',
        rootDirectory: '/tmp/claude-traces',
        queuedEvents: 2,
        approximateBytes: 2048,
        droppedEvents: 1,
        lastError: 'disk unavailable',
      };
    }),
    listRecentTraces: jest.fn((limit?: number) => {
      operationOrder.push(`listRecentTraces:${limit ?? 'default'}`);
      return summaries.slice(0, limit ?? summaries.length);
    }),
    buildSmartReport: jest.fn(async (traceId?: string) => {
      operationOrder.push(`buildSmartReport:${traceId ?? 'latest'}`);
      return '# Claude trace report';
    }),
    exportTrace: jest.fn(async () => {
      operationOrder.push('exportTrace');
      return '/tmp/exported-claude-trace';
    }),
    clearAll: jest.fn(async () => { operationOrder.push('clearAll'); }),
    deleteTrace: jest.fn(async () => { operationOrder.push('deleteTrace'); }),
  } as unknown as ClaudeTraceDiagnosticsPort;
  return { port, operationOrder };
}

function createPanel(
  diagnostics: ClaudeTraceDiagnosticsPort | undefined,
  options: Partial<ClaudeCodeDebugPanelOptions> = {},
) {
  const defaults = getDefaultBackendSettings().claudeCode;
  const settings = options.settings ?? {
    activeBackend: 'claude-code',
    enableDebugLogging: true,
    debugModuleSettings: { claudeCode: true },
    backendSettings: {
      claudeCode: {
        ...defaults,
        debugChannels: { ...defaults.debugChannels },
        sessionTrace: {
          ...defaults.sessionTrace,
          consoleChannels: { ...defaults.sessionTrace.consoleChannels },
        },
      },
    },
  };
  const saveSettings = options.saveSettings ?? jest.fn().mockResolvedValue(undefined);
  const pickDirectory = options.pickDirectory ?? jest.fn().mockResolvedValue('/tmp/chosen-claude-traces');
  const getValidatedExportDirectory = options.getValidatedExportDirectory ?? jest.fn(() => '/tmp');
  const renderDebugModules = options.renderDebugModules ?? jest.fn((containerEl: HTMLElement) => {
    containerEl.createDiv({ attr: { 'data-injected-claude-modules': 'true' } });
  });
  const getVisibleLogEntryCount = options.getVisibleLogEntryCount ?? jest.fn(() => 2);
  const getVisibleLogText = options.getVisibleLogText ?? jest.fn(() => 'visible Claude log');
  const buildDiagnosticReport = options.buildDiagnosticReport ?? jest.fn(() => '# Claude diagnostic report');
  const clearVisibleLogs = options.clearVisibleLogs ?? jest.fn();
  const reportVisibleLogCopyFailure = options.reportVisibleLogCopyFailure ?? jest.fn();
  const reportDiagnosticCopyFailure = options.reportDiagnosticCopyFailure ?? jest.fn();
  const addActionButton = options.addActionButton ?? jest.fn((
    containerEl: HTMLElement,
    label: string,
    onClick: () => void | Promise<void>,
  ) => {
    const buttonEl = containerEl.createEl('button', { text: label });
    actionRecords.push({ containerEl, label, onClick, buttonEl });
    return buttonEl;
  });
  const panel = new ClaudeCodeDebugPanel({
    settings,
    getDiagnostics: options.getDiagnostics ?? (() => diagnostics),
    saveSettings,
    pickDirectory,
    getValidatedExportDirectory,
    addActionButton,
    renderDebugModules,
    getVisibleLogEntryCount,
    getVisibleLogText,
    buildDiagnosticReport,
    clearVisibleLogs,
    reportVisibleLogCopyFailure,
    reportDiagnosticCopyFailure,
  });
  return {
    panel,
    settings,
    saveSettings,
    pickDirectory,
    getValidatedExportDirectory,
    renderDebugModules,
    getVisibleLogEntryCount,
    getVisibleLogText,
    clearVisibleLogs,
    addActionButton,
  };
}

function findRecord<T extends { name: string }>(records: T[], name: string): T | undefined {
  return records.find((record) => record.name === name);
}

function findAction(containerEl: HTMLElement, label: string): ActionRecord | undefined {
  return actionRecords.find((record) => record.label === label && containerEl.contains(record.buttonEl));
}

const traceSummary = {
  traceId: 'trace-1',
  sessionId: 'session-1',
  lastUpdatedAt: '2026-07-31T00:00:00.000Z',
  eventCount: 3,
  runCount: 1,
  highestSeverity: 'critical',
  unreadAnomalyCount: 0,
  deepCaptureCount: 0,
};

describe('ClaudeCodeDebugPanel', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    toggleRecords.length = 0;
    textRecords.length = 0;
    dropdownRecords.length = 0;
    actionRecords.length = 0;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('owns the exact Claude workbench DOM order for classic and tabbed mounting', () => {
    const { port } = createDiagnostics([traceSummary]);
    const { panel, renderDebugModules } = createPanel(port);
    const classicEl = document.createElement('div');
    const tabbedEl = document.createElement('div');

    panel.render(classicEl);
    panel.render(tabbedEl, { includeIntro: false });

    const classicWorkbench = classicEl.querySelector('[data-debug-workbench="claude-code"]') as HTMLElement;
    const tabbedWorkbench = tabbedEl.querySelector('[data-debug-workbench="claude-code"]') as HTMLElement;
    expect(classicWorkbench.querySelector('.opencodian-debug-workbench-header')).not.toBeNull();
    expect(tabbedWorkbench.querySelector('.opencodian-debug-workbench-header')).toBeNull();
    expect(classicWorkbench.querySelector('[data-claude-code-status-strip="true"]')).not.toBeNull();
    expect(classicWorkbench.querySelector('.opencodian-debug-privacy-note')).not.toBeNull();
    expect(classicWorkbench.querySelector('[data-injected-claude-modules="true"]')).not.toBeNull();
    expect(classicWorkbench.querySelector('[data-claude-trace-status="true"]')).not.toBeNull();
    expect(classicWorkbench.querySelector('[data-claude-trace-catalog="true"]')).not.toBeNull();
    expect(classicWorkbench.querySelector('[data-claude-code-log-preview="true"]')).not.toBeNull();
    expect(renderDebugModules).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      moduleKeys: ['claudeCode'],
      includeIntro: true,
    }));
    const status = classicWorkbench.querySelector('[data-claude-code-status-strip="true"]') as HTMLElement;
    const privacy = classicWorkbench.querySelector('.opencodian-debug-privacy-note') as HTMLElement;
    const traceStatus = classicWorkbench.querySelector('[data-claude-trace-status="true"]') as HTMLElement;
    const preview = classicWorkbench.querySelector('[data-claude-code-log-preview="true"]') as HTMLElement;
    expect(status.compareDocumentPosition(privacy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(traceStatus.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps console debug channels separate from independent trace settings and persists both', async () => {
    const { port } = createDiagnostics();
    const { panel, settings, saveSettings } = createPanel(port);
    panel.render(document.createElement('div'));

    await findRecord(toggleRecords, t('settings.debug.claude.channel.runtime.name'))?.onChange?.(false);
    await findRecord(toggleRecords, t('settings.debug.claude.channel.lifecycle.name' as never))?.onChange?.(false);
    await findRecord(dropdownRecords, t('settings.debug.claude.preset.name'))?.onChange?.('full');
    await findRecord(textRecords, t('settings.debug.claude.storage.name'))?.onChange?.('  /tmp/claude-traces  ');

    expect(settings.backendSettings.claudeCode.debugChannels.runtime).toBe(false);
    expect(settings.backendSettings.claudeCode.sessionTrace?.consoleChannels.lifecycle).toBe(false);
    expect(settings.backendSettings.claudeCode.sessionTrace).toEqual(expect.objectContaining({
      consolePreset: 'full',
      storageDirectory: '/tmp/claude-traces',
    }));
    expect(saveSettings).toHaveBeenCalledTimes(4);
  });

  it('preserves the trace actions, catalog operations, and log-preview refresh lifecycle', async () => {
    const { port, operationOrder } = createDiagnostics([
      traceSummary,
      { ...traceSummary, traceId: 'trace-2', sessionId: 'session-2', highestSeverity: 'info' },
    ]);
    let logText = 'visible Claude log';
    const getVisibleLogText = jest.fn(() => logText);
    const getVisibleLogEntryCount = jest.fn(() => logText ? 1 : 0);
    const clearVisibleLogs = jest.fn(() => { logText = ''; });
    const { panel, getValidatedExportDirectory } = createPanel(port, {
      getVisibleLogText,
      getVisibleLogEntryCount,
      clearVisibleLogs,
    });
    const containerEl = document.createElement('div');
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    panel.render(containerEl);

    expect(actionRecords.map((record) => record.label)).toEqual([
      t('settings.debug.claude.actions.copyReport'),
      t('settings.debug.claude.actions.export'),
      t('settings.debug.claude.actions.clear'),
      t('settings.debug.claude.recent.copy'),
      t('settings.debug.claude.recent.delete'),
      t('settings.debug.claude.recent.copy'),
      t('settings.debug.claude.recent.delete'),
      t('settings.debug.claude.logs.copyVisible'),
      t('settings.debug.claude.logs.copyDiagnostics'),
      t('settings.debug.actions.clearLogs'),
    ]);
    await findRecord(toggleRecords, t('settings.debug.claude.recent.anomaliesOnly'))?.onChange?.(true);
    expect(containerEl.querySelectorAll('.opencodian-debug-trace-row')[1]?.classList).toContain('is-hidden');
    await findAction(containerEl, t('settings.debug.claude.actions.copyReport'))?.onClick();
    await findAction(containerEl, t('settings.debug.claude.actions.export'))?.onClick();
    const rowEl = containerEl.querySelector('.opencodian-debug-trace-row') as HTMLElement;
    await findAction(rowEl, t('settings.debug.claude.recent.copy'))?.onClick();
    await findAction(rowEl, t('settings.debug.claude.recent.delete'))?.onClick();
    await findAction(containerEl, t('settings.debug.claude.actions.clear'))?.onClick();
    await findAction(containerEl, t('settings.debug.actions.clearLogs'))?.onClick();

    expect(getValidatedExportDirectory).toHaveBeenCalledTimes(1);
    expect(clearVisibleLogs).toHaveBeenCalledTimes(1);
    expect(containerEl.querySelector('[data-claude-code-log-preview="true"]')?.textContent).toBe('');
    expect(operationOrder).toEqual([
      'getStorageStatus',
      'listRecentTraces:20',
      'buildSmartReport:latest',
      'listRecentTraces:1',
      'exportTrace',
      'buildSmartReport:trace-1',
      'deleteTrace',
      'clearAll',
      'listRecentTraces:20',
    ]);
  });

  it('renders all Claude surfaces and keeps diagnostics actions safe when unavailable', async () => {
    const { panel } = createPanel(undefined);
    const containerEl = document.createElement('div');

    expect(() => panel.render(containerEl)).not.toThrow();
    expect(containerEl.querySelector('[data-claude-trace-status="true"]')?.textContent).toContain('0');
    expect(containerEl.querySelector('[data-claude-trace-catalog="true"]')?.textContent)
      .toContain(t('settings.debug.claude.recent.empty'));
    expect(containerEl.querySelector('[data-claude-code-log-preview="true"]')?.textContent).toBe('visible Claude log');
    const copyReport = findAction(containerEl, t('settings.debug.claude.actions.copyReport'));
    expect(copyReport).toBeDefined();
    await expect(copyReport!.onClick()).resolves.toBeUndefined();
  });

  it('keeps plugin, trace service, store, report builder, and path validation outside the panel', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const panelSource = fs.readFileSync(
      path.resolve(__dirname, '../../../../src/features/settings/debug/ClaudeCodeDebugPanel.ts'),
      'utf8',
    );
    const sectionSource = fs.readFileSync(
      path.resolve(__dirname, '../../../../src/features/settings/SettingsDebugSection.ts'),
      'utf8',
    );
    const typesSource = fs.readFileSync(
      path.resolve(__dirname, '../../../../src/features/settings/debug/types.ts'),
      'utf8',
    );
    const compositionSources = [
      'OpenCodianSettings.ts',
      'OpenCodianSettingsView.ts',
      'SettingsTabbedRenderer.ts',
    ].map((fileName) => fs.readFileSync(
      path.resolve(__dirname, `../../../../src/features/settings/${fileName}`),
      'utf8',
    ));

    expect(sectionSource).toContain('this.claudeCodeDebugPanel.render(containerEl);');
    expect(sectionSource).toContain('this.claudeCodeDebugPanel.render(claudeCodeBlockEl, { includeIntro: false });');
    expect(sectionSource).not.toMatch(/claudeTraceService|reportBuilder/);
    expect(panelSource).not.toMatch(/OpenCodianPlugin|claudeTraceService|reportBuilder|\.store|getCurrentPlatformDebugLogPath|fs\.existsSync/);
    expect(typesSource).toContain('export function createClaudeTraceDiagnosticsPort(');
    expect(typesSource).toContain('deleteTrace: (traceId) => service.store.deleteTrace(traceId)');
    expect(compositionSources.every((source) => source.includes(
      'getClaudeDiagnostics: () => createClaudeTraceDiagnosticsPort(',
    ))).toBe(true);
  });
});
