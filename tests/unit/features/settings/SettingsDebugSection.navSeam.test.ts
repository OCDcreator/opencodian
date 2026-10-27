/* eslint-disable max-lines, max-lines-per-function -- Nav-seam test mocks Obsidian Setting prototype to assert registry↔render contract for the debug group. */

import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsDebugSection } from '../../../../src/features/settings/debug/SettingsDebugSection';
import { getPrimaryTabDefinition } from '../../../../src/features/settings/settingsLayoutRegistry';
import { setLocale } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';
import { clearRecentLogs, setDebugLoggingEnabled, setDebugModuleEnabled } from '../../../../src/shared';

interface MockToggleControl {
  setValue: (value: boolean) => MockToggleControl;
  onChange: (callback: (value: boolean) => void | Promise<void>) => MockToggleControl;
}

interface MockTextControl {
  inputEl: HTMLInputElement;
  setPlaceholder: (value: string) => MockTextControl;
  setValue: (value: string) => MockTextControl;
  onChange: (callback: (value: string) => void | Promise<void>) => MockTextControl;
}

interface MockButtonControl {
  buttonEl: HTMLButtonElement;
  onClick: (callback: () => void | Promise<void>) => MockButtonControl;
  setButtonText: (value: string) => MockButtonControl;
  setCta: () => MockButtonControl;
}

type DebugSectionPlugin = Pick<
  OpenCodianPlugin,
  'settings' | 'saveSettings' | 'logServerStatusSnapshot' | 'buildDiagnosticReport' | 'writeDiagnosticLogFile' | 'getDebugBuildIdentityText'
>;

// capability-lab is rendered by SettingsCapabilityLabSection, and backend
// trace panels are rendered through attachBackendTabbed inside the owning
// backend workspace.
const EXCLUDED_DEBUG_TABS = new Set(['capability-lab']);
const BACKEND_DEBUG_TABS = new Set(['opencode', 'codex', 'claude-code']);

function mockSettingPrototype(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting) {
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting) {
    return this;
  });
  jest.spyOn(Setting.prototype, 'setClass').mockImplementation(function setClass(this: Setting) {
    return this;
  });
  jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function addToggle(
    this: Setting,
    callback: (control: MockToggleControl) => unknown,
  ) {
    const control: MockToggleControl = {
      setValue() { return control; },
      onChange() { return control; },
    };
    callback(control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function addText(
    this: Setting,
    callback: (control: MockTextControl) => unknown,
  ) {
    const control: MockTextControl = {
      inputEl: document.createElement('input'),
      setPlaceholder() { return control; },
      setValue() { return control; },
      onChange() { return control; },
    };
    callback(control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
    this: Setting,
    callback: (control: MockButtonControl) => unknown,
  ) {
    const control: MockButtonControl = {
      buttonEl: document.createElement('button'),
      onClick() { return control; },
      setButtonText() { return control; },
      setCta() { return control; },
    };
    callback(control);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function addDropdown(this: Setting) {
    return this;
  });
}

function createPlugin(): DebugSectionPlugin {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      debugLogPaths: { ...DEFAULT_SETTINGS.debugLogPaths },
      backendSettings: {
        ...DEFAULT_SETTINGS.backendSettings,
        claudeCode: {
          ...DEFAULT_SETTINGS.backendSettings.claudeCode,
          debugChannels: { ...DEFAULT_SETTINGS.backendSettings.claudeCode.debugChannels },
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

function createSection(plugin: DebugSectionPlugin): SettingsDebugSection {
  return new SettingsDebugSection({
    plugin: plugin as unknown as OpenCodianPlugin,
  });
}

describe('SettingsDebugSection debug nav seam (registry ↔ render)', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    clearRecentLogs();
    setDebugLoggingEnabled(true);
    setDebugModuleEnabled('settings', true);
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setDebugLoggingEnabled(false);
    setDebugModuleEnabled('settings', false);
    clearRecentLogs();
    document.body.innerHTML = '';
  });

  it('renders a visible block for every generic debug secondary tab the registry declares', () => {
    const debugTab = getPrimaryTabDefinition('debug');
    expect(debugTab).toBeDefined();
    const expectedIds = debugTab!.secondaryTabs
      .map((tab) => tab.id)
      .filter((id) => !EXCLUDED_DEBUG_TABS.has(id) && !BACKEND_DEBUG_TABS.has(id));
    expect(expectedIds).toEqual(['plugin', 'export']);

    const section = createSection(createPlugin());
    for (const id of expectedIds) {
      const containerEl = document.createElement('div');
      document.body.appendChild(containerEl);
      section.attachTabbed(containerEl, id);
      const blocks = Array.from(containerEl.querySelectorAll<HTMLElement>('[data-section-block]'));
      expect(blocks.map((block) => block.dataset.sectionBlock)).toEqual([id]);
      expect(blocks[0]!.style.display).not.toBe('none');
    }
  });

  it('never renders another backend trace block in the generic debug tabs', () => {
    const section = createSection(createPlugin());
    for (const id of ['plugin', 'export'] as const) {
      const containerEl = document.createElement('div');
      document.body.appendChild(containerEl);
      section.attachTabbed(containerEl, id);
      const renderedIds = Array.from(containerEl.querySelectorAll<HTMLElement>('[data-section-block]'))
        .map((block) => block.dataset.sectionBlock);
      expect(renderedIds.some((rendered) => BACKEND_DEBUG_TABS.has(rendered ?? ''))).toBe(false);
    }
  });

  it('renders exactly the selected backend trace panel through attachBackendTabbed', () => {
    const section = createSection(createPlugin());
    for (const id of ['opencode', 'codex', 'claude-code'] as const) {
      const containerEl = document.createElement('div');
      document.body.appendChild(containerEl);
      section.attachBackendTabbed(containerEl, id);
      const renderedIds = Array.from(containerEl.querySelectorAll<HTMLElement>('[data-section-block]'))
        .map((block) => block.dataset.sectionBlock);
      expect(renderedIds).toEqual([id]);
    }
  });
});
