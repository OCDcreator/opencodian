/* eslint-disable @typescript-eslint/no-require-imports -- intentional isolated-module reload to prove <1.13 fresh-load safety. */
// Spec-med (REVISE round 2): the earlier <1.13 test nulled SettingPage AFTER the
// module was already loaded, which cannot prove a true 1.12.x fresh load. This
// suite does an ISOLATED module reload with SettingPage absent from the start:
// reset module registry -> make the obsidian mock drop SettingPage -> re-require
// the source -> assert the reloaded module still constructs and returns [].
import type { OpenCodianSettingTab } from '../../../../src/features/settings/OpenCodianSettings';
import { setLocale } from '../../../../src/i18n';

describe('OpenCodianSettingTab declarative fresh-load on Obsidian <1.13', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    document.body.innerHTML = '';
  });

  it('module loads and getSettingDefinitions() returns [] when SettingPage never existed', () => {
    // 1. Drop SettingPage from the obsidian mock BEFORE the isolated reload.
    const obsidianModule = require('obsidian') as { SettingPage?: unknown };
    const savedSettingPage = obsidianModule.SettingPage;

    // 2. Isolated reload: reset the registry so the source re-evaluates against a
    //    SettingPage-less obsidian from the very first line. If the source had a
    //    module-level `extends SettingPage`, the re-require below would throw
    //    "Class extends value undefined is not a constructor".
    jest.resetModules();
    const freshObsidian = require('obsidian') as { SettingPage?: unknown };
    freshObsidian.SettingPage = undefined;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const reloaded = require('../../../../src/features/settings/OpenCodianSettings') as {
      OpenCodianSettingTab: new (app: unknown, plugin: unknown) => OpenCodianSettingTab;
    };

    // 3. Construct + call getSettingDefinitions on a fresh tab built from the
    //    reloaded (SettingPage-less) module.
    const app = { keymap: { pushScope: jest.fn(), popScope: jest.fn() }, vault: {}, workspace: {}, manifest: { version: '1.4.5' } };
    const plugin = {
      settings: { settingsLayoutMode: 'classic', settingsPanelScrollTop: 0 },
      saveSettings: jest.fn().mockResolvedValue(undefined),
      scheduleSettingsUiStateSave: jest.fn(),
      openCodeService: { getServerStatus: () => 'stopped', on: jest.fn(), off: jest.fn() },
    };
    const tab = new reloaded.OpenCodianSettingTab(app, plugin);
    document.body.appendChild(tab.containerEl);

    // The fresh-loaded module must NOT crash and must return [] (host falls back
    // to display()).
    expect(() => tab.getSettingDefinitions()).not.toThrow();
    expect(tab.getSettingDefinitions()).toEqual([]);

    // Restore for other suites.
    freshObsidian.SettingPage = savedSettingPage;
    obsidianModule.SettingPage = savedSettingPage;
  });
});
