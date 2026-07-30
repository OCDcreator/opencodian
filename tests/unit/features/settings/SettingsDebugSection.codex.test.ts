/* eslint-disable max-lines, max-lines-per-function -- Codex debug block tests share Obsidian Setting mocks with the existing debug settings suite. */

import * as obsidian from 'obsidian';
import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
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
  'settings' | 'saveSettings' | 'logServerStatusSnapshot' | 'buildDiagnosticReport' | 'writeDiagnosticLogFile' | 'getDebugBuildIdentityText'
>;

interface CodexTraceServiceStub {
  store: {
    getStatus: () => unknown;
    listSummaries: (limit?: number) => unknown[];
  };
  reportBuilder?: { buildSmartReport: jest.Mock };
}

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

function attachCodexTraceService(plugin: DebugSectionPlugin, service: CodexTraceServiceStub): void {
  (plugin as unknown as { codexTraceService: CodexTraceServiceStub }).codexTraceService = service;
}

function renderTabbed(secondaryTabId: string, plugin = createPlugin()) {
  const section = new SettingsDebugSection({
    plugin: plugin as unknown as OpenCodianPlugin,
    createSectionHeading,
  });
  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);
  section.attachTabbed(containerEl, secondaryTabId);
  return { containerEl, plugin, section };
}

function findToggle(name: string): ToggleRecord | undefined {
  return toggleRecords.find((record) => record.name === name);
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

describe('SettingsDebugSection codex block', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    toggleRecords.length = 0;
    textRecords.length = 0;
    buttonRecords.length = 0;
    clearRecentLogs();
    setDebugLoggingEnabled(true);
    setDebugModuleEnabled('settings', true);
    mockClipboard();
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setDebugLoggingEnabled(false);
    setDebugModuleEnabled('settings', false);
    clearRecentLogs();
    document.body.innerHTML = '';
  });

  it('renders codex trace toggles bound to backendSettings.codex.sessionTrace', async () => {
    const plugin = createPlugin();
    renderTabbed('codex', plugin);

    const enabledToggle = findToggle(t('settings.debug.codex.enabled.name'));
    expect(enabledToggle).toBeDefined();
    expect(enabledToggle?.control.setValue).toHaveBeenCalledWith(true);

    await enabledToggle?.onChange?.(false);

    expect(plugin.settings.backendSettings.codex.sessionTrace.enabled).toBe(false);
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  it('renders a captureContent toggle defaulting to true', async () => {
    const plugin = createPlugin();
    renderTabbed('codex', plugin);

    const toggle = findToggle(t('settings.debug.codex.captureContent.name'));
    expect(toggle).toBeDefined();
    expect(toggle?.control.setValue).toHaveBeenCalledWith(true);

    await toggle?.onChange?.(false);

    expect(plugin.settings.backendSettings.codex.sessionTrace.captureContent).toBe(false);
  });

  it('shows codex trace storage status from the shared store', () => {
    const plugin = createPlugin();
    attachCodexTraceService(plugin, {
      store: {
        getStatus: () => ({
          mode: 'disk',
          rootDirectory: '/tmp/x',
          queuedEvents: 0,
          approximateBytes: 2048,
          droppedEvents: 0,
        }),
        listSummaries: () => [],
      },
    });
    const { containerEl } = renderTabbed('codex', plugin);

    const codexBlock = containerEl.querySelector('[data-debug-workbench="codex"]');
    expect(codexBlock).not.toBeNull();
    expect(codexBlock?.textContent).toContain('disk');
    expect(codexBlock?.textContent).toContain(t('settings.debug.codex.status.traces'));
  });

  it('keeps codex tab visible and other tabs hidden when codex is active', () => {
    const { containerEl } = renderTabbed('codex');
    const blockDisplays = Array.from(containerEl.querySelectorAll('[data-section-block]')).map(
      (blockEl) => [
        (blockEl as HTMLElement).dataset.sectionBlock,
        (blockEl as HTMLElement).style.display,
      ],
    );

    expect(containerEl.querySelector('[data-section-block="codex"]')?.classList.contains(
      'opencodian-debug-tab-shell-codex',
    )).toBe(true);

    expect(blockDisplays).toEqual([
      ['plugin', 'none'],
      ['opencode', 'none'],
      ['codex', ''],
      ['claude-code', 'none'],
      ['export', 'none'],
    ]);
  });

  it('renders without crashing when codexTraceService is undefined', () => {
    const plugin = createPlugin();
    const { containerEl } = renderTabbed('codex', plugin);
    const codexBlock = containerEl.querySelector('[data-debug-workbench="codex"]');
    expect(codexBlock).not.toBeNull();
    // Catalog empty placeholder is rendered.
    expect(codexBlock?.textContent).toContain(t('settings.debug.codex.recent.empty'));
  });
});

// Touch obsidian import so eslint does not flag it as unused when test shapes change.
void obsidian;
