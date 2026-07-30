/* eslint-disable max-lines, max-lines-per-function -- Nav-seam test mocks Obsidian Setting prototype to assert registry↔render contract for the debug group. */

import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsDebugSection } from '../../../../src/features/settings/SettingsDebugSection';
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

// capability-lab is rendered by SettingsCapabilityLabSection (SettingsTabbedRenderer.ts:521 dispatch),
// NOT by SettingsDebugSection.attachTabbed, so it is excluded from this registry↔render seam check.
const EXCLUDED_DEBUG_TABS = new Set(['capability-lab']);

function mockSettingPrototype(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
    (this as Setting & { __settingName?: string }).__settingName = name;
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

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
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

  it('renders a visible block for every debug secondary tab the registry declares (except capability-lab)', () => {
    const debugTab = getPrimaryTabDefinition('debug');
    expect(debugTab).toBeDefined();
    const section = new SettingsDebugSection({
      plugin: createPlugin() as unknown as OpenCodianPlugin,
      createSectionHeading,
    });

    for (const secondary of debugTab!.secondaryTabs) {
      if (EXCLUDED_DEBUG_TABS.has(secondary.id)) continue;
      const containerEl = document.createElement('div');
      document.body.appendChild(containerEl);
      section.attachTabbed(containerEl, secondary.id);

      const blockEl = containerEl.querySelector<HTMLElement>(`[data-section-block="${secondary.id}"]`);
      expect(blockEl).not.toBeNull();
      expect(blockEl!.style.display).not.toBe('none');
    }
  });

  it('hides all sibling blocks when a given debug tab is active', () => {
    const debugTab = getPrimaryTabDefinition('debug');
    expect(debugTab).toBeDefined();
    const registeredTabIds = debugTab!.secondaryTabs
      .filter((tab) => !EXCLUDED_DEBUG_TABS.has(tab.id))
      .map((tab) => tab.id);
    const section = new SettingsDebugSection({
      plugin: createPlugin() as unknown as OpenCodianPlugin,
      createSectionHeading,
    });

    for (const activeTabId of registeredTabIds) {
      const containerEl = document.createElement('div');
      document.body.appendChild(containerEl);
      section.attachTabbed(containerEl, activeTabId);

      // Collect display states first, then assert outside the per-block conditional
      // to satisfy jest/no-conditional-expect.
      const blockStates = Array.from(containerEl.querySelectorAll<HTMLElement>('[data-section-block]')).map(
        (blockEl) => ({ id: blockEl.dataset.sectionBlock as string, display: blockEl.style.display }),
      );
      const activeBlock = blockStates.find((state) => state.id === activeTabId);
      const hiddenBlocks = blockStates.filter((state) => state.id !== activeTabId);

      expect(activeBlock).toBeDefined();
      expect(activeBlock!.display).not.toBe('none');
      expect(hiddenBlocks.every((state) => state.display === 'none')).toBe(true);
      expect(hiddenBlocks.map((state) => state.id).sort()).toEqual(
        registeredTabIds.filter((id) => id !== activeTabId).sort(),
      );
    }
  });

  it('renders exactly the registry-declared debug blocks with no orphans (seam guard)', () => {
    // If SettingsDebugSection.attachTabbed renders a block whose id is absent from the
    // registry (or vice-versa), this assertion fails — which is exactly the leak this
    // test exists to catch. Removing the codex entry from the registry makes codex an
    // orphan block and turns this red.
    const debugTab = getPrimaryTabDefinition('debug');
    expect(debugTab).toBeDefined();
    const expectedBlockIds = debugTab!.secondaryTabs
      .filter((tab) => !EXCLUDED_DEBUG_TABS.has(tab.id))
      .map((tab) => tab.id)
      .sort();

    const section = new SettingsDebugSection({
      plugin: createPlugin() as unknown as OpenCodianPlugin,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    section.attachTabbed(containerEl, 'plugin');

    const renderedBlockIds = Array.from(containerEl.querySelectorAll<HTMLElement>('[data-section-block]'))
      .map((blockEl) => blockEl.dataset.sectionBlock as string)
      .sort();

    expect(renderedBlockIds).toEqual(expectedBlockIds);
  });
});
