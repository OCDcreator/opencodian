import { Setting } from 'obsidian';

import { CodexDebugPanel } from '../../../../src/features/settings/debug/CodexDebugPanel';
import type {
  CodexDebugPanelOptions,
  CodexTraceDiagnosticsPort,
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

interface ToggleRecord {
  name: string;
  onChange?: (value: boolean) => void | Promise<void>;
}

interface TextRecord {
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}

interface DropdownRecord {
  name: string;
  onChange?: (value: string) => void | Promise<void>;
}

interface ActionButtonRecord {
  containerEl: HTMLElement;
  label: string;
  onClick: () => void | Promise<void>;
  buttonEl: HTMLButtonElement;
}

const toggleRecords: ToggleRecord[] = [];
const textRecords: TextRecord[] = [];
const dropdownRecords: DropdownRecord[] = [];
const actionButtonRecords: ActionButtonRecord[] = [];

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

function findRecord<T extends { name: string }>(records: T[], name: string): T | undefined {
  return records.find((record) => record.name === name);
}

function findActionButton(containerEl: HTMLElement, label: string): ActionButtonRecord | undefined {
  return actionButtonRecords.find((record) => record.label === label && containerEl.contains(record.buttonEl));
}

function createDiagnostics(summaries: object[] = []) {
  const operationOrder: string[] = [];
  const port = {
    getStatus: jest.fn(() => {
      operationOrder.push('getStatus');
      return {
        mode: 'memory',
        rootDirectory: '/tmp/codex-traces',
        queuedEvents: 2,
        approximateBytes: 2048,
        droppedEvents: 1,
        lastError: 'disk unavailable',
      };
    }),
    listSummaries: jest.fn((limit?: number) => {
      operationOrder.push(`listSummaries:${limit ?? 'default'}`);
      return summaries.slice(0, limit ?? summaries.length);
    }),
    buildSmartReport: jest.fn(async (traceId?: string) => {
      operationOrder.push(`buildSmartReport:${traceId ?? 'latest'}`);
      return '# Codex trace report';
    }),
    flush: jest.fn(async () => { operationOrder.push('flush'); }),
    exportTraceBundle: jest.fn(async () => {
      operationOrder.push('exportTraceBundle');
      return '/tmp/exported-trace';
    }),
    clear: jest.fn(async () => { operationOrder.push('clear'); }),
    deleteTrace: jest.fn(async () => { operationOrder.push('deleteTrace'); }),
  } as unknown as CodexTraceDiagnosticsPort;
  return { port, operationOrder };
}

function createPanel(
  diagnostics: CodexTraceDiagnosticsPort | undefined,
  options: Partial<CodexDebugPanelOptions> = {},
) {
  const settings = options.settings ?? { backendSettings: {} };
  const saveSettings = options.saveSettings ?? jest.fn().mockResolvedValue(undefined);
  const pickDirectory = options.pickDirectory ?? jest.fn().mockResolvedValue('/tmp/chosen-traces');
  const addActionButton = options.addActionButton ?? jest.fn((
    containerEl: HTMLElement,
    label: string,
    onClick: () => void | Promise<void>,
  ) => {
    const buttonEl = containerEl.createEl('button', { text: label });
    actionButtonRecords.push({ containerEl, label, onClick, buttonEl });
    return buttonEl;
  });
  const panel = new CodexDebugPanel({
    settings,
    getDiagnostics: options.getDiagnostics ?? (() => diagnostics),
    saveSettings,
    pickDirectory,
    addActionButton,
  });
  return { panel, settings, saveSettings, pickDirectory, addActionButton };
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

describe('CodexDebugPanel', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    toggleRecords.length = 0;
    textRecords.length = 0;
    dropdownRecords.length = 0;
    actionButtonRecords.length = 0;
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

  it('owns its DOM/data markers and delegates action buttons through the injected helper', () => {
    const { port } = createDiagnostics([traceSummary]);
    const { panel, addActionButton } = createPanel(port);
    const containerEl = document.createElement('div');

    panel.render(containerEl, { includeIntro: false });

    expect(containerEl.querySelector('[data-debug-workbench="codex"]')).not.toBeNull();
    expect(containerEl.querySelector('[data-codex-trace-status="true"]')?.textContent)
      .toContain('disk unavailable');
    expect(containerEl.querySelector('[data-codex-trace-catalog="true"] [data-has-anomaly="true"]')?.textContent)
      .toContain('session-1');
    expect(addActionButton).toHaveBeenCalledTimes(6);
  });

  it('initializes and persists all Codex trace controls including captureContent', async () => {
    const { port } = createDiagnostics();
    const { panel, settings, saveSettings } = createPanel(port);
    panel.render(document.createElement('div'));

    await findRecord(toggleRecords, t('settings.debug.codex.enabled.name'))?.onChange?.(false);
    await findRecord(dropdownRecords, t('settings.debug.codex.preset.name'))?.onChange?.('full');
    await findRecord(textRecords, t('settings.debug.codex.storage.name'))?.onChange?.('  /tmp/codex-traces  ');
    await findRecord(toggleRecords, t('settings.debug.codex.channel.lifecycle.name' as never))?.onChange?.(false);
    await findRecord(toggleRecords, t('settings.debug.codex.captureContent.name'))?.onChange?.(false);

    expect(settings.backendSettings.codex?.sessionTrace).toEqual(expect.objectContaining({
      enabled: false,
      consolePreset: 'full',
      storageDirectory: '/tmp/codex-traces',
      captureContent: false,
      consoleChannels: expect.objectContaining({ lifecycle: false }),
    }));
    expect(saveSettings).toHaveBeenCalledTimes(5);
  });

  it('preserves the complete Codex action and catalog operation order', async () => {
    const { port, operationOrder } = createDiagnostics([traceSummary]);
    const { panel, pickDirectory } = createPanel(port);
    const containerEl = document.createElement('div');
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    panel.render(containerEl);

    expect(actionButtonRecords.map((record) => record.label)).toEqual([
      t('settings.debug.codex.actions.copyReport'),
      t('settings.debug.codex.actions.flush'),
      t('settings.debug.codex.actions.export'),
      t('settings.debug.codex.actions.clear'),
      t('settings.debug.codex.recent.copy'),
      t('settings.debug.codex.recent.delete'),
    ]);
    await findActionButton(containerEl, t('settings.debug.codex.actions.copyReport'))?.onClick();
    await findActionButton(containerEl, t('settings.debug.codex.actions.flush'))?.onClick();
    await findActionButton(containerEl, t('settings.debug.codex.actions.export'))?.onClick();
    const rowEl = containerEl.querySelector('.opencodian-debug-trace-row') as HTMLElement;
    await findActionButton(rowEl, t('settings.debug.codex.recent.copy'))?.onClick();
    await findActionButton(rowEl, t('settings.debug.codex.recent.delete'))?.onClick();
    await findActionButton(containerEl, t('settings.debug.codex.actions.clear'))?.onClick();

    expect(pickDirectory).toHaveBeenCalledWith('');
    expect(operationOrder).toEqual([
      'getStatus',
      'listSummaries:100',
      'listSummaries:20',
      'buildSmartReport:latest',
      'flush',
      'listSummaries:1',
      'exportTraceBundle',
      'buildSmartReport:trace-1',
      'deleteTrace',
      'clear',
    ]);
    expect(containerEl.querySelector('[data-codex-trace-catalog="true"]')?.childElementCount).toBe(0);
  });

  it('renders status, controls, actions, and an empty catalog when diagnostics are unavailable', () => {
    const { panel } = createPanel(undefined);
    const containerEl = document.createElement('div');

    expect(() => panel.render(containerEl)).not.toThrow();
    expect(containerEl.querySelector('[data-codex-trace-status="true"]')?.textContent).toContain('0');
    expect(containerEl.querySelector('[data-codex-trace-catalog="true"]')?.textContent)
      .toContain(t('settings.debug.codex.recent.empty'));
  });

  it('keeps the panel tabbed-only and free of plugin, store, and report-builder access', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const sectionSource = fs.readFileSync(
      path.resolve(__dirname, '../../../../src/features/settings/SettingsDebugSection.ts'),
      'utf8',
    );
    const panelSource = fs.readFileSync(
      path.resolve(__dirname, '../../../../src/features/settings/debug/CodexDebugPanel.ts'),
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
    const attachStart = sectionSource.indexOf('  attach(containerEl: HTMLElement): HTMLHeadingElement {');
    const attachBody = sectionSource.slice(attachStart, attachStart + 500);

    expect(sectionSource).toContain('this.codexDebugPanel.render(codexBlockEl, { includeIntro: false });');
    expect(attachBody).not.toContain('codexDebugPanel.render');
    expect(panelSource).not.toMatch(/OpenCodianPlugin|codexTraceService|reportBuilder|\.store/);
    expect(typesSource).toContain('export function createCodexTraceDiagnosticsPort(');
    expect(typesSource).toContain('getStatus: () =>');
    expect(typesSource).toContain('listSummaries: (limit) =>');
    expect(typesSource).toContain('buildSmartReport: (traceId, userContext) =>');
    expect(typesSource).toContain('exportTraceBundle: (traceId, targetDirectory) =>');
    expect(compositionSources.every((source) => source.includes(
      'getCodexDiagnostics: () => createCodexTraceDiagnosticsPort(',
    ))).toBe(true);
  });
});
