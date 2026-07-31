/* eslint-disable max-lines, max-lines-per-function -- Diagnostics characterization for SettingsDebugSection captures the tabbed-block inventory, the legacy attach Codex omission, and backend-specific control surfaces before Task 13 panel extraction. */
/**
 * Phase 3 Task 10 — SettingsDebugSection diagnostics characterization.
 *
 * Captures the CURRENT settings-debug behavior that Task 13 (split backend
 * debug panels) must preserve:
 *
 *   1. attachTabbed renders FIVE debug blocks: plugin, opencode, codex,
 *      claude-code, export.
 *   2. Legacy non-tabbed attach() renders FOUR blocks and OMITS Codex — the
 *      documented inconsistency Task 10 must record (and Task 13 must not
 *      silently "fix" inside a pure-refactor commit).
 *   3. Each backend block owns a complete render/settings/status/actions
 *      lifecycle; the section retains the tab router + plugin/export block.
 *
 * This suite does NOT move production code. It reuses the Setting/menu mock
 * scaffold pattern from the existing SettingsDebugSection test files.
 */
import * as obsidian from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsDebugSection } from '../../../../src/features/settings/SettingsDebugSection';
import { setLocale } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';
import { clearRecentLogs, setDebugLoggingEnabled } from '../../../../src/shared';

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
interface MockDropdownControl {
  selectEl: HTMLSelectElement;
  addOption: jest.MockedFunction<(value: string, display: string) => MockDropdownControl>;
  addOptions: jest.MockedFunction<(options: { value: string; label: string }[]) => MockDropdownControl>;
  setValue: jest.MockedFunction<(value: string) => MockDropdownControl>;
  onChange: jest.MockedFunction<(callback: (value: string) => void | Promise<void>) => MockDropdownControl>;
}
interface ToggleRecord { control: MockToggleControl; name: string; onChange?: (value: boolean) => void | Promise<void>; }
interface TextRecord { control: MockTextControl; name: string; onChange?: (value: string) => void | Promise<void>; }
interface ButtonRecord { control: MockButtonControl; name: string; label?: string; onClick?: () => void | Promise<void>; }
interface DropdownRecord { control: MockDropdownControl; name: string; onChange?: (value: string) => void | Promise<void>; }

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
const dropdownRecords: DropdownRecord[] = [];

function createToggleRecord(name: string): ToggleRecord {
  const record: ToggleRecord = { name, control: { setValue: jest.fn(), onChange: jest.fn() } };
  record.control.setValue.mockReturnValue(record.control);
  record.control.onChange.mockImplementation((cb) => { record.onChange = cb; return record.control; });
  return record;
}
function createTextRecord(name: string): TextRecord {
  const record: TextRecord = {
    name,
    control: { inputEl: document.createElement('input'), setPlaceholder: jest.fn(), setValue: jest.fn(), onChange: jest.fn() },
  };
  record.control.setPlaceholder.mockReturnValue(record.control);
  record.control.setValue.mockReturnValue(record.control);
  record.control.onChange.mockImplementation((cb) => { record.onChange = cb; return record.control; });
  return record;
}
function createButtonRecord(name: string): ButtonRecord {
  const record: ButtonRecord = {
    name,
    control: { buttonEl: document.createElement('button'), onClick: jest.fn(), setButtonText: jest.fn(), setCta: jest.fn() },
  };
  record.control.onClick.mockImplementation((cb) => { record.onClick = cb; return record.control; });
  record.control.setButtonText.mockImplementation((v) => { record.label = v; return record.control; });
  record.control.setCta.mockReturnValue(record.control);
  return record;
}
function createDropdownRecord(name: string): DropdownRecord {
  const record: DropdownRecord = {
    name,
    control: {
      selectEl: document.createElement('select'),
      addOption: jest.fn(),
      addOptions: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
    },
  };
  record.control.addOption.mockReturnValue(record.control);
  record.control.addOptions.mockReturnValue(record.control);
  record.control.setValue.mockReturnValue(record.control);
  record.control.onChange.mockImplementation((cb) => { record.onChange = cb; return record.control; });
  return record;
}

function createPlugin(overrides: Partial<DebugSectionPlugin['settings']> = {}): DebugSectionPlugin {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...overrides,
      debugLogPaths: { ...DEFAULT_SETTINGS.debugLogPaths, ...overrides.debugLogPaths },
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

// Trace-service stubs attached to the plugin mock so the backend blocks can
// read status/listSummaries without a real TraceStore. NOTE the access asymmetry
// captured by this suite: OpenCode/Codex blocks read via `.store.getStatus()`
// and `.store.listSummaries()`, while the Claude block reads
// `getStorageStatus()` and `listRecentTraces()` directly on the service
// (per ClaudeTracePort). The stubs must expose both surfaces.
interface TraceStoreStub {
  getStatus: jest.Mock;
  listSummaries: jest.Mock;
  flush: jest.Mock;
  clear: jest.Mock;
  deleteTrace: jest.Mock;
  exportTraceBundle: jest.Mock;
}
function createTraceStoreStub(): TraceStoreStub {
  return {
    getStatus: jest.fn().mockReturnValue({ mode: 'disk', rootDirectory: '/tmp/d', queuedEvents: 0, approximateBytes: 0, droppedEvents: 0, lastError: undefined }),
    listSummaries: jest.fn().mockReturnValue([]),
    flush: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    deleteTrace: jest.fn().mockResolvedValue(undefined),
    exportTraceBundle: jest.fn().mockResolvedValue('/tmp/export'),
  };
}
interface TraceServiceStub {
  store: TraceStoreStub;
  reportBuilder: { buildSmartReport: jest.Mock };
  // Claude-only direct service methods (ClaudeTracePort surface).
  getStorageStatus?: jest.Mock;
  listRecentTraces?: jest.Mock;
}
function createTraceServiceStub(claudeDirect = false): TraceServiceStub {
  const base: TraceServiceStub = { store: createTraceStoreStub(), reportBuilder: { buildSmartReport: jest.fn().mockResolvedValue('report') } };
  if (claudeDirect) {
    base.getStorageStatus = jest.fn().mockReturnValue({ mode: 'disk', rootDirectory: '/tmp/d', queuedEvents: 0, approximateBytes: 0, droppedEvents: 0, lastError: undefined });
    base.listRecentTraces = jest.fn().mockReturnValue([]);
  }
  return base;
}

function attachTraceServices(plugin: DebugSectionPlugin): {
  openCode: TraceServiceStub;
  codex: TraceServiceStub;
  claude: TraceServiceStub;
} {
  const openCode = createTraceServiceStub();
  const codex = createTraceServiceStub();
  const claude = createTraceServiceStub(true);
  (plugin as unknown as { openCodeTraceService: TraceServiceStub }).openCodeTraceService = openCode;
  (plugin as unknown as { codexTraceService: TraceServiceStub }).codexTraceService = codex;
  (plugin as unknown as { claudeTraceService: TraceServiceStub }).claudeTraceService = claude;
  return { openCode, codex, claude };
}

describe('Phase 3 Task 10 — SettingsDebugSection diagnostics characterization', () => {
  beforeEach(() => {
    setLocale('en');
    setDebugLoggingEnabled(false);
    toggleRecords.length = 0;
    textRecords.length = 0;
    buttonRecords.length = 0;
    dropdownRecords.length = 0;
    jest.spyOn(obsidian.Setting.prototype, 'addToggle').mockImplementation(function (
      this: unknown,
      cb: (toggle: MockToggleControl) => void,
    ) {
      const record = createToggleRecord((this as { nameEl?: { textContent?: string } }).nameEl?.textContent ?? 'unknown');
      cb(record.control);
      return this as obsidian.Setting;
    });
    jest.spyOn(obsidian.Setting.prototype, 'addText').mockImplementation(function (
      this: unknown,
      cb: (text: MockTextControl) => void,
    ) {
      const record = createTextRecord((this as { nameEl?: { textContent?: string } }).nameEl?.textContent ?? 'unknown');
      cb(record.control);
      return this as obsidian.Setting;
    });
    jest.spyOn(obsidian.Setting.prototype, 'addButton').mockImplementation(function (
      this: unknown,
      cb: (button: MockButtonControl) => void,
    ) {
      const record = createButtonRecord((this as { nameEl?: { textContent?: string } }).nameEl?.textContent ?? 'unknown');
      cb(record.control);
      return this as obsidian.Setting;
    });
    jest.spyOn(obsidian.Setting.prototype, 'addDropdown').mockImplementation(function (
      this: unknown,
      cb: (dropdown: MockDropdownControl) => void,
    ) {
      const record = createDropdownRecord((this as { nameEl?: { textContent?: string } }).nameEl?.textContent ?? 'unknown');
      cb(record.control);
      return this as obsidian.Setting;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    clearRecentLogs();
    setDebugLoggingEnabled(false);
    for (const el of Array.from(document.body.querySelectorAll('div'))) {
      if (el.parentElement === document.body) el.remove();
    }
  });

  // -------------------------------------------------------------------------
  // Step 5: six tabbed debug subtabs (5 backend/export blocks + parent tab).
  // attachTabbed renders exactly 5 debug-block shells: plugin, opencode, codex,
  // claude-code, export. Task 13 must preserve the shell/router + export block
  // in SettingsDebugSection while moving the three backend blocks into panels.
  // The authoritative block inventory is the source contract (createDebugTabShell
  // calls), confirmed behaviorally by shell count.
  // -------------------------------------------------------------------------

  describe('attachTabbed renders the five-block debug inventory', () => {
    it('attachTabbed source invokes createDebugTabShell exactly five times (catches any added/removed shell)', () => {
      // Count createDebugTabShell CALLS (not literal ids) so a sixth shell with
      // any id — literal or variable — is caught.
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/SettingsDebugSection.ts'),
        'utf8',
      );
      const tabbedStart = source.indexOf('  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {');
      const tabbedEnd = source.indexOf('  private createDebugTabShell(');
      expect(tabbedStart).toBeGreaterThan(-1);
      const tabbedBody = source.slice(tabbedStart, tabbedEnd);
      // Exactly five createDebugTabShell( invocations in attachTabbed.
      const shellCalls = tabbedBody.match(/this\.createDebugTabShell\(/g);
      expect(shellCalls).toHaveLength(5);
      // And the five canonical ids appear (in case of id typos).
      expect(tabbedBody.match(/id: 'plugin'/g)).toHaveLength(1);
      expect(tabbedBody.match(/id: 'opencode'/g)).toHaveLength(1);
      expect(tabbedBody.match(/id: 'codex'/g)).toHaveLength(1);
      expect(tabbedBody.match(/id: 'claude-code'/g)).toHaveLength(1);
      expect(tabbedBody.match(/id: 'export'/g)).toHaveLength(1);
    });

    it('attachTabbed renders without throwing', () => {
      const plugin = createPlugin();
      attachTraceServices(plugin);
      const section = new SettingsDebugSection({ plugin: plugin as unknown as OpenCodianPlugin, createSectionHeading });
      const containerEl = document.createElement('div');
      document.body.appendChild(containerEl);
      expect(() => section.attachTabbed(containerEl, 'plugin')).not.toThrow();
    });

    it('attachTabbed for the codex block does not throw (Codex is present, unlike legacy attach)', () => {
      const plugin = createPlugin();
      attachTraceServices(plugin);
      const section = new SettingsDebugSection({ plugin: plugin as unknown as OpenCodianPlugin, createSectionHeading });
      const containerEl = document.createElement('div');
      document.body.appendChild(containerEl);
      expect(() => section.attachTabbed(containerEl, 'codex')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Step 5 (cont.): the SIX debug secondary tabs in settingsLayoutRegistry.
  //
  // The debug section declares SIX secondary tabs: plugin, opencode, codex,
  // claude-code, export, capability-lab. attachTabbed renders the first FIVE
  // as block shells; capability-lab is rendered by a separate component.
  // Task 13 must not drop or merge any of the six.
  // -------------------------------------------------------------------------

  describe('settingsLayoutRegistry declares six debug secondary tabs', () => {
    it('the debug section registry declares exactly six secondary tabs including capability-lab', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/settingsLayoutRegistry.ts'),
        'utf8',
      );
      const debugStart = source.indexOf("id: 'debug'");
      expect(debugStart).toBeGreaterThan(-1);
      // Slice to the next top-level section (next "id: '...'," at column 4).
      const afterDebug = source.slice(debugStart + 1);
      const nextSectionRel = afterDebug.search(/\n[/ ]{4}id: '/);
      const debugBody = nextSectionRel > 0
        ? source.slice(debugStart, debugStart + 1 + nextSectionRel)
        : source.slice(debugStart, debugStart + 1200);
      expect(debugBody).toContain("id: 'plugin'");
      expect(debugBody).toContain("id: 'opencode'");
      expect(debugBody).toContain("id: 'codex'");
      expect(debugBody).toContain("id: 'claude-code'");
      expect(debugBody).toContain("id: 'export'");
      expect(debugBody).toContain("id: 'capability-lab'");
      // Exactly six secondary tab entries in the debug section.
      const tabIdMatches = debugBody.match(/\{\s*id:\s*'[^']+',\s*labelKey:/g);
      expect(tabIdMatches?.length).toBe(6);
    });

    it('attachTabbed renders FIVE block shells; capability-lab is NOT a SettingsDebugSection block', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/SettingsDebugSection.ts'),
        'utf8',
      );
      // SettingsDebugSection must not reference capability-lab (it is a separate owner).
      expect(source).not.toMatch(/capability-lab|capabilityLab/);
    });
  });

  // -------------------------------------------------------------------------
  // Step 5 (THE plan requirement): legacy non-tabbed attach OMITS Codex.
  //
  // The plan (Task 10 step 5 + Task 13) requires: "separately prove whether
  // legacy non-tabbed attach is reachable and record its current Codex
  // omission." attach() calls addPluginDebugSettings, openCodeDebugPanel.render,
  // claudeCodeDebugPanel.render, addExportDebugSettings — it does NOT render
  // the Codex panel. This is the documented inconsistency. Task 13 must
  // NOT silently fix or permanently entrench it inside a pure-refactor commit;
  // it must be handled as a separately-approved bugfix/cleanup.
  // -------------------------------------------------------------------------

  describe('legacy non-tabbed attach() omits Codex (documented inconsistency)', () => {
    it('attach() renders plugin + opencode + claude-code + export but NOT codex', () => {
      // Source-level contract: attach() does not render the Codex panel.
      // A behavioral render would require the full Obsidian mock; the source
      // contract is the authoritative proof of the omission.
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/SettingsDebugSection.ts'),
        'utf8',
      );
      const attachStart = source.indexOf('  attach(containerEl: HTMLElement): HTMLHeadingElement {');
      expect(attachStart).toBeGreaterThan(-1);
      const attachBody = source.slice(attachStart, attachStart + 500);
      // attach() invokes the plugin, OpenCode panel, Claude, and export render paths...
      expect(attachBody).toContain('this.addPluginDebugSettings(');
      expect(attachBody).toContain('this.openCodeDebugPanel.render(');
      expect(attachBody).toContain('this.claudeCodeDebugPanel.render(');
      expect(attachBody).toContain('this.addExportDebugSettings(');
      // ...but does NOT render the Codex panel.
      expect(attachBody).not.toContain('this.codexDebugPanel.render(');
    });

    it('attach() is reachable from the legacy non-tabbed settings view (OpenCodianSettingsView + OpenCodianSettings)', () => {
      // Prove reachability: two call sites invoke debugSection.attach().
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');
      const viewSrc = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/OpenCodianSettingsView.ts'),
        'utf8',
      );
      const settingsSrc = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/OpenCodianSettings.ts'),
        'utf8',
      );
      expect(viewSrc).toMatch(/debugSection\.attach\(containerEl\)/);
      expect(settingsSrc).toMatch(/debugSection\.attach\(containerEl\)/);
    });
  });

  // -------------------------------------------------------------------------
  // Step 5 (cont.): backend-specific control/catalog behavior.
  //
  // Each backend block owns a complete render/settings/status/actions/catalog
  // lifecycle. The Claude block additionally keeps console debug channels
  // alongside independent session-trace controls (a plan invariant for Task 13).
  // Capture that the Claude block surfaces BOTH the debug-channel controls and
  // the session-trace controls.
  // -------------------------------------------------------------------------

  describe('backend block control surfaces', () => {
    it('the Claude block keeps console debug-channel controls alongside session-trace controls (source contract)', () => {
      // Plan invariant for Task 13: the Claude panel must preserve console
      // debug channels AND independent session-trace controls. Prove both
      // control paths are wired in the complete Claude panel.
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');
      const panelSource = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/debug/ClaudeCodeDebugPanel.ts'),
        'utf8',
      );
      // Console debug-channel controls.
      expect(panelSource).toContain('this.addCodeChannelSettings(');
      // Independent session-trace controls.
      expect(panelSource).toContain('this.addTraceControls(');
      expect(panelSource).toContain('this.addTraceStatus(');
      expect(panelSource).toContain('this.addTraceActions(');
      expect(panelSource).toContain('this.addTraceCatalog(');
    });

    it('the three backend blocks each own a status + actions lifecycle (source contract)', () => {
      // Every backend now has its own complete panel.
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/SettingsDebugSection.ts'),
        'utf8',
      );
      const openCodeSource = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/debug/OpenCodeDebugPanel.ts'),
        'utf8',
      );
      const codexSource = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/debug/CodexDebugPanel.ts'),
        'utf8',
      );
      const claudeSource = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/debug/ClaudeCodeDebugPanel.ts'),
        'utf8',
      );
      expect(openCodeSource).toContain('this.addTraceStatus(');
      expect(openCodeSource).toContain('this.addTraceActions(');
      expect(openCodeSource).toContain('this.addTraceCatalog(');
      expect(codexSource).toContain('this.addTraceStatus(');
      expect(codexSource).toContain('this.addTraceActions(');
      expect(codexSource).toContain('this.addTraceCatalog(');
      expect(claudeSource).toContain('this.addTraceStatus(');
      expect(claudeSource).toContain('this.addTraceActions(');
      expect(claudeSource).toContain('this.addTraceCatalog(');
      expect(source).not.toContain('openCodeTraceService');
      expect(source).not.toContain('codexTraceService');
      expect(source).not.toContain('claudeTraceService');
      expect(source).toContain('getDiagnostics: options.getOpenCodeDiagnostics');
      expect(source).toContain('getDiagnostics: options.getCodexDiagnostics');
      expect(source).toContain('getDiagnostics: options.getClaudeDiagnostics');
      // Each reads storage state through its narrow port.
      expect(openCodeSource).toMatch(/diagnostics\?\.getStatus/);
      expect(codexSource).toMatch(/diagnostics\?\.getStatus/);
      expect(claudeSource).toMatch(/getDiagnostics\(\)\?\.getStorageStatus/);
    });

    it('the plugin block registers the global enableDebugLogging toggle (source contract)', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/SettingsDebugSection.ts'),
        'utf8',
      );
      const start = source.indexOf('  private addPluginDebugSettings(');
      const body = source.slice(start, start + 1500);
      // The plugin block delegates to addDebugLoggingSetting (owns the toggle).
      expect(body).toContain('this.addDebugLoggingSetting(');
      // The underlying setting reads/writes enableDebugLogging.
      const loggingStart = source.indexOf('  private addDebugLoggingSetting(');
      const loggingBody = source.slice(loggingStart, loggingStart + 1500);
      expect(loggingBody).toMatch(/enableDebugLogging/);
    });

    it('debug-module groups retain their section and OpenCode-panel ownership keys (source contract)', () => {
      // The module GROUPS (not the flat registry) map each owner to its module
      // keys. The OpenCode panel owns its group after this extraction slice.
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/SettingsDebugSection.ts'),
        'utf8',
      );
      const groupsStart = source.indexOf('const DEBUG_MODULE_GROUPS:');
      expect(groupsStart).toBeGreaterThan(-1);
      const groupsBody = source.slice(groupsStart, groupsStart + 600);
      // The section owns only the plugin group; each backend panel owns its
      // own exact debug-module group where needed.
      expect(groupsBody).toMatch(/plugin:\s*\[/);
      expect(groupsBody).not.toMatch(/'claude-code':\s*\[/);
      expect(groupsBody).not.toMatch(/opencode:\s*\[/);
      expect(groupsBody).not.toMatch(/codex:\s*\[/);
      const openCodeSource = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/debug/OpenCodeDebugPanel.ts'),
        'utf8',
      );
      const claudeSource = fs.readFileSync(
        path.resolve(__dirname, '../../../../src/features/settings/debug/ClaudeCodeDebugPanel.ts'),
        'utf8',
      );
      // OpenCode owns its exact module-key grouping after extraction.
      expect(openCodeSource).toContain("['server', 'models', 'streaming']");
      // Claude owns its exact console debug-module group.
      expect(claudeSource).toContain("moduleKeys: ['claudeCode']");
      // plugin is exactly the 8-key list — pin the FULL ordered array so
      // removing/adding/reordering any key is caught.
      expect(groupsBody).toContain("plugin: [");
      expect(groupsBody).toContain("'app',");
      expect(groupsBody).toContain("'settings',");
      expect(groupsBody).toContain("'chat',");
      expect(groupsBody).toContain("'contextUsage',");
      expect(groupsBody).toContain("'tasks',");
      expect(groupsBody).toContain("'storage',");
      expect(groupsBody).toContain("'providerIcons',");
      expect(groupsBody).toContain("'visuals',");
    });
  });
});
