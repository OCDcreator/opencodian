/* eslint-disable max-lines, max-lines-per-function -- Focused panel tests keep their own Obsidian Setting mock contract. */

import { Setting } from 'obsidian';

import { getDefaultOpenCodeSessionTraceSettings } from '../../../../src/core/types';
import { OpenCodeDebugPanel } from '../../../../src/features/settings/debug/OpenCodeDebugPanel';
import type {
  OpenCodeDebugPanelOptions,
  OpenCodeTraceDiagnosticsPort,
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

interface MockButtonControl {
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
}

interface ToggleRecord {
  name: string;
  control: MockToggleControl;
  onChange?: (value: boolean) => void | Promise<void>;
}

interface TextRecord {
  name: string;
  control: MockTextControl;
  onChange?: (value: string) => void | Promise<void>;
}

interface DropdownRecord {
  name: string;
  control: MockDropdownControl;
  onChange?: (value: string) => void | Promise<void>;
}

interface ActionButtonRecord {
  containerEl: HTMLElement;
  label: string;
  onClick: () => void | Promise<void>;
  buttonEl: HTMLButtonElement;
  cta: boolean;
}

const toggleRecords: ToggleRecord[] = [];
const textRecords: TextRecord[] = [];
const dropdownRecords: DropdownRecord[] = [];
const actionButtonRecords: ActionButtonRecord[] = [];

function createToggleRecord(name: string): ToggleRecord {
  const record = {
    name,
    control: {
      setValue: jest.fn(),
      onChange: jest.fn(),
    },
  } as unknown as ToggleRecord;
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
      addOption: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
    },
  } as unknown as DropdownRecord;
  record.control.addOption.mockReturnValue(record.control);
  record.control.setValue.mockReturnValue(record.control);
  record.control.onChange.mockImplementation((callback) => {
    record.onChange = callback;
    return record.control;
  });
  return record;
}

function createButtonControl(): MockButtonControl {
  const control = {
    setButtonText: jest.fn(),
    onClick: jest.fn(),
  } as unknown as MockButtonControl;
  control.setButtonText.mockReturnValue(control);
  control.onClick.mockReturnValue(control);
  return control;
}

function mockSettingPrototype(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
    (this as Setting & { __settingName?: string }).__settingName = name;
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting) { return this; });
  jest.spyOn(Setting.prototype, 'setClass').mockImplementation(function setClass(this: Setting) { return this; });
  jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function addToggle(
    this: Setting,
    callback: (control: MockToggleControl) => unknown,
  ) {
    const record = createToggleRecord((this as Setting & { __settingName?: string }).__settingName ?? '');
    toggleRecords.push(record);
    callback(record.control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function addText(
    this: Setting,
    callback: (control: MockTextControl) => unknown,
  ) {
    const record = createTextRecord((this as Setting & { __settingName?: string }).__settingName ?? '');
    textRecords.push(record);
    callback(record.control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function addDropdown(
    this: Setting,
    callback: (control: MockDropdownControl) => unknown,
  ) {
    const record = createDropdownRecord((this as Setting & { __settingName?: string }).__settingName ?? '');
    dropdownRecords.push(record);
    callback(record.control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
    this: Setting,
    callback: (control: MockButtonControl) => unknown,
  ) {
    callback(createButtonControl());
    return this;
  });
}

function createDiagnostics(summaries: object[] = []) {
  const operationOrder: string[] = [];
  const store = {
    getStatus: jest.fn().mockImplementation(() => {
      operationOrder.push('getStatus');
      return {
        mode: 'memory',
        rootDirectory: '/tmp/opencode-traces',
        queuedEvents: 2,
        approximateBytes: 2048,
        droppedEvents: 1,
        lastError: 'disk unavailable',
      };
    }),
    listSummaries: jest.fn().mockImplementation((limit?: number) => {
      operationOrder.push(`listSummaries:${limit ?? 'default'}`);
      return summaries.slice(0, limit ?? summaries.length);
    }),
    flush: jest.fn().mockImplementation(async () => { operationOrder.push('flush'); }),
    exportTraceBundle: jest.fn().mockImplementation(async () => {
      operationOrder.push('exportTraceBundle');
      return '/tmp/exported-trace';
    }),
    clear: jest.fn().mockImplementation(async () => { operationOrder.push('clear'); }),
    deleteTrace: jest.fn().mockImplementation(async () => { operationOrder.push('deleteTrace'); }),
  };
  const reportBuilder = {
    buildSmartReport: jest.fn().mockImplementation(async (traceId?: string) => {
      operationOrder.push(`buildSmartReport:${traceId ?? 'latest'}`);
      return '# OpenCode trace report';
    }),
  };
  const diagnostics = {
    getStatus: store.getStatus,
    listSummaries: store.listSummaries,
    buildSmartReport: reportBuilder.buildSmartReport,
    flush: store.flush,
    exportTraceBundle: store.exportTraceBundle,
    clear: store.clear,
    deleteTrace: store.deleteTrace,
  } as unknown as OpenCodeTraceDiagnosticsPort;
  return { diagnostics, store, reportBuilder, operationOrder };
}

function createPanel(
  diagnostics: OpenCodeTraceDiagnosticsPort | undefined,
  options: Partial<OpenCodeDebugPanelOptions> = {},
) {
  const settings = options.settings ?? {
    backendSettings: { opencode: { sessionTrace: getDefaultOpenCodeSessionTraceSettings() } },
  };
  const saveSettings = options.saveSettings ?? jest.fn().mockResolvedValue(undefined);
  const pickDirectory = options.pickDirectory ?? jest.fn().mockResolvedValue('/tmp/chosen-traces');
  const renderDebugModules = options.renderDebugModules ?? jest.fn((containerEl: HTMLElement) => {
    containerEl.createDiv({ attr: { 'data-injected-opencode-modules': 'true' } });
  });
  const addActionButton = options.addActionButton ?? jest.fn((
    containerEl: HTMLElement,
    label: string,
    onClick: () => void | Promise<void>,
    cta = true,
  ) => {
    const buttonEl = containerEl.createEl('button', {
      cls: cta ? 'mod-cta opencodian-debug-action-button' : 'opencodian-debug-action-button',
      text: label,
      attr: { type: 'button' },
    });
    actionButtonRecords.push({ containerEl, label, onClick, buttonEl, cta });
    return buttonEl;
  });
  const panel = new OpenCodeDebugPanel({
    settings,
    getDiagnostics: options.getDiagnostics ?? (() => diagnostics),
    saveSettings,
    pickDirectory,
    renderDebugModules,
    addActionButton,
  });
  return { panel, settings, saveSettings, pickDirectory, renderDebugModules, addActionButton };
}

function findToggle(name: string): ToggleRecord | undefined {
  return toggleRecords.find((record) => record.name === name);
}

function findText(name: string): TextRecord | undefined {
  return textRecords.find((record) => record.name === name);
}

function findDropdown(name: string): DropdownRecord | undefined {
  return dropdownRecords.find((record) => record.name === name);
}

function findActionButton(containerEl: HTMLElement, label: string): ActionButtonRecord | undefined {
  return actionButtonRecords.find((record) => record.label === label && containerEl.contains(record.buttonEl));
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

describe('OpenCodeDebugPanel', () => {
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

  it('owns status, catalog, and the injected module/action helper boundaries', () => {
    const { diagnostics } = createDiagnostics([traceSummary]);
    const { panel, renderDebugModules, addActionButton } = createPanel(diagnostics);
    const containerEl = document.createElement('div');

    panel.render(containerEl);

    const statusEl = containerEl.querySelector('[data-opencode-trace-status="true"]');
    expect(statusEl?.textContent).toContain('memory');
    expect(statusEl?.textContent).toContain('1');
    expect(statusEl?.textContent).toContain('2 KiB');
    expect(statusEl?.textContent).toContain('disk unavailable');
    expect(containerEl.querySelector('[data-opencode-trace-catalog="true"] [data-has-anomaly="true"]')?.textContent)
      .toContain('session-1');
    expect(containerEl.querySelector('[data-injected-opencode-modules="true"]')).not.toBeNull();
    expect(renderDebugModules).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      moduleKeys: ['server', 'models', 'streaming'],
      includeIntro: false,
    }));
    expect(addActionButton).toHaveBeenCalledTimes(6);
  });

  it('initializes and persists trace controls through its narrow settings and save ports', async () => {
    const { diagnostics } = createDiagnostics();
    const settings = { backendSettings: {} };
    const saveSettings = jest.fn().mockResolvedValue(undefined);
    const { panel } = createPanel(diagnostics, { settings, saveSettings });
    const containerEl = document.createElement('div');

    panel.render(containerEl);

    const traceSettings = settings.backendSettings.opencode?.sessionTrace;
    expect(traceSettings).toBeDefined();
    const enabled = findToggle(t('settings.debug.opencode.enabled.name'));
    const preset = findDropdown(t('settings.debug.opencode.preset.name'));
    const storage = findText(t('settings.debug.opencode.storage.name'));
    const channel = findToggle(t('settings.debug.opencode.channel.lifecycle.name' as never));
    await enabled?.onChange?.(false);
    await preset?.onChange?.('full');
    await storage?.onChange?.('  /tmp/opencode-traces  ');
    await channel?.onChange?.(false);

    expect(traceSettings).toEqual(expect.objectContaining({
      enabled: false,
      consolePreset: 'full',
      storageDirectory: '/tmp/opencode-traces',
      consoleChannels: expect.objectContaining({ lifecycle: false }),
    }));
    expect(saveSettings).toHaveBeenCalledTimes(4);
  });

  it('preserves the smart-copy prompt order and trace action/catalog operation order', async () => {
    const { diagnostics, store, reportBuilder, operationOrder } = createDiagnostics([traceSummary]);
    const { panel, pickDirectory } = createPanel(diagnostics);
    const containerEl = document.createElement('div');
    jest.spyOn(window, 'prompt')
      .mockReturnValueOnce('actual')
      .mockReturnValueOnce('expected')
      .mockReturnValueOnce('reproduction');
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    panel.render(containerEl);

    expect(actionButtonRecords.map((record) => record.label)).toEqual([
      t('settings.debug.opencode.actions.copySmart'),
      t('settings.debug.opencode.actions.flush'),
      t('settings.debug.opencode.actions.export'),
      t('settings.debug.opencode.actions.clear'),
      t('settings.debug.opencode.recent.copy'),
      t('settings.debug.opencode.recent.delete'),
    ]);
    expect(operationOrder).toEqual(['getStatus', 'listSummaries:100', 'listSummaries:20']);

    const copySmart = findActionButton(containerEl, t('settings.debug.opencode.actions.copySmart'));
    expect(copySmart).toBeDefined();
    await copySmart!.onClick();
    expect(window.prompt).toHaveBeenNthCalledWith(1, t('chat.opencodeDiagnostics.actualPrompt'));
    expect(window.prompt).toHaveBeenNthCalledWith(2, t('chat.opencodeDiagnostics.expectedPrompt'));
    expect(window.prompt).toHaveBeenNthCalledWith(3, t('chat.opencodeDiagnostics.reproductionPrompt'));
    expect(reportBuilder.buildSmartReport).toHaveBeenCalledWith(undefined, {
      actual: 'actual',
      expected: 'expected',
      reproduction: 'reproduction',
    });
    expect(operationOrder).toEqual([
      'getStatus',
      'listSummaries:100',
      'listSummaries:20',
      'buildSmartReport:latest',
    ]);

    const flush = findActionButton(containerEl, t('settings.debug.opencode.actions.flush'));
    expect(flush).toBeDefined();
    await flush!.onClick();
    expect(store.flush).toHaveBeenCalledTimes(1);

    const exportTrace = findActionButton(containerEl, t('settings.debug.opencode.actions.export'));
    expect(exportTrace).toBeDefined();
    await exportTrace!.onClick();
    expect(pickDirectory).toHaveBeenCalledWith('');
    expect(store.exportTraceBundle).toHaveBeenCalledWith('trace-1', '/tmp/chosen-traces');

    const rowEl = containerEl.querySelector('.opencodian-debug-trace-row') as HTMLElement;
    const copyRecent = findActionButton(rowEl, t('settings.debug.opencode.recent.copy'));
    expect(copyRecent).toBeDefined();
    await copyRecent!.onClick();
    expect(reportBuilder.buildSmartReport).toHaveBeenCalledWith('trace-1');
    const deleteRecent = findActionButton(rowEl, t('settings.debug.opencode.recent.delete'));
    expect(deleteRecent).toBeDefined();
    await deleteRecent!.onClick();
    expect(store.deleteTrace).toHaveBeenCalledWith('trace-1');
    expect(rowEl.isConnected).toBe(false);

    const clear = findActionButton(containerEl, t('settings.debug.opencode.actions.clear'));
    expect(clear).toBeDefined();
    await clear!.onClick();
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(containerEl.querySelector('[data-opencode-trace-catalog="true"]')?.childElementCount).toBe(0);
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
  });

  it('renders status, controls, actions, and an empty catalog when diagnostics are unavailable', () => {
    const { panel } = createPanel(undefined);
    const containerEl = document.createElement('div');

    expect(() => panel.render(containerEl)).not.toThrow();
    expect(containerEl.querySelector('[data-opencode-trace-status="true"]')?.textContent).toContain('0');
    expect(containerEl.querySelector('[data-opencode-trace-catalog="true"]')?.textContent)
      .toContain(t('settings.debug.opencode.recent.empty'));
  });
});
