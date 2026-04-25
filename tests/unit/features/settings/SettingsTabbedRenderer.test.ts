import type { App } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsFormatterSection } from '../../../../src/features/settings/SettingsFormatterSection';
import { SettingsModelSection } from '../../../../src/features/settings/SettingsModelSection';
import { SettingsStyleSection } from '../../../../src/features/settings/SettingsStyleSection';
import { SettingsTabbedRenderer } from '../../../../src/features/settings/SettingsTabbedRenderer';
import { setLocale } from '../../../../src/i18n';

function createRendererState(options?: {
  primaryTabId?: string;
  secondaryTabs?: Record<string, string>;
}) {
  const plugin = {
    settings: {
      ...DEFAULT_SETTINGS,
      settingsLayoutMode: 'tabbed' as const,
      settingsTabbedPrimaryTab: options?.primaryTabId ?? 'general',
      settingsTabbedSecondaryTabByPrimary: options?.secondaryTabs ?? { general: 'basic' },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  };

  const requestDisplayRefresh = jest.fn();
  const renderLayoutModeSetting = jest.fn((containerEl: HTMLElement) => {
    containerEl.createDiv({ cls: 'layout-mode-marker', text: 'layout-mode-setting' });
  });
  const renderLanguageSetting = jest.fn((containerEl: HTMLElement) => {
    containerEl.createDiv({ cls: 'language-marker', text: 'language-setting' });
  });

  const renderer = new SettingsTabbedRenderer({
    app: {} as App,
    plugin: plugin as never,
    createHeading: (containerEl, title) => containerEl.createEl('h3', { text: title }),
    createSettingsBlock: (containerEl, options) => {
      const hostEl = containerEl.createDiv({ cls: 'settings-block' });
      hostEl.createEl('h4', { text: options.title });
      return hostEl;
    },
    setSettingDescWithFormatting: () => undefined,
    applyInlineCodeText: () => undefined,
    setSettingNameWithFormatting: () => undefined,
    addSettingHelpButton: () => undefined,
    notifyModelCatalogStatus: () => undefined,
    setModelCatalogStatusCallback: () => undefined,
    setServerSection: () => undefined,
    setMcpSection: () => undefined,
    setModelSection: () => undefined,
    setSecuritySection: () => undefined,
    getRefreshModelsCallback: () => undefined,
    getRefreshTitleModelsCallback: () => undefined,
    setRefreshModelsCallback: () => undefined,
    setRefreshTitleModelsCallback: () => undefined,
    getServerState: () => ({ healthy: false, status: 'stopped' as const }),
    setServerState: () => undefined,
    requestDisplayRefresh,
    renderUserProfileSetting: () => undefined,
    renderUserPromptSetting: () => undefined,
    renderUserExcludedTagsSetting: () => undefined,
    renderLayoutModeSetting,
    renderLanguageSetting,
  });

  return {
    plugin,
    renderer,
    requestDisplayRefresh,
    renderLayoutModeSetting,
    renderLanguageSetting,
  };
}

describe('SettingsTabbedRenderer', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the general primary tab as one merged panel without secondary tabs', () => {
    const { renderer, renderLayoutModeSetting, renderLanguageSetting } = createRendererState();
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    expect(
      Array.from(containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-primary')).map(
        (element) => element.textContent?.trim(),
      ),
    ).toContain('General');
    expect(
      Array.from(containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-secondary')).map(
        (element) => element.textContent?.trim(),
      ),
    ).toEqual([]);
    expect(renderLayoutModeSetting).toHaveBeenCalledTimes(1);
    expect(renderLanguageSetting).toHaveBeenCalledTimes(1);
    expect(containerEl.querySelector('.opencodian-settings-tab-panel')).toBeNull();
    expect(containerEl.querySelector('.layout-mode-marker')?.textContent).toBe('layout-mode-setting');
    expect(containerEl.querySelector('.language-marker')?.textContent).toBe('language-setting');
    expect(containerEl.querySelectorAll('.opencodian-settings-block')).toHaveLength(1);
    expect(containerEl.querySelector('.opencodian-settings-general-merged-block')).not.toBeNull();
  });

  it('does not expose general secondary tab switching anymore', () => {
    const { plugin, renderer, requestDisplayRefresh } = createRendererState();
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    const secondaryTabs = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-secondary'),
    );
    expect(secondaryTabs).toHaveLength(0);

    expect(plugin.settings.settingsTabbedSecondaryTabByPrimary).toEqual({
      general: 'basic',
    });
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(requestDisplayRefresh).not.toHaveBeenCalled();
  });

  it('does not wrap style tabs with the extra tab-panel shell', () => {
    jest.spyOn(SettingsStyleSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'style-tab-marker', text: 'style-tab-rendered' });
    });
    const { renderer } = createRendererState({
      primaryTabId: 'style',
      secondaryTabs: { style: 'presets' },
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    expect(containerEl.querySelector('.opencodian-settings-tab-panel')).toBeNull();
    expect(containerEl.querySelector('.style-tab-marker')?.textContent).toBe('style-tab-rendered');
  });

  it('does not wrap plugin tabs with the extra tab-panel shell', () => {
    const { SettingsPluginSection } = jest.requireActual('../../../../src/features/settings/SettingsPluginSection') as {
      SettingsPluginSection: typeof import('../../../../src/features/settings/SettingsPluginSection').SettingsPluginSection;
    };
    jest.spyOn(SettingsPluginSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'plugin-tab-marker', text: 'plugin-tab-rendered' });
    });
    const { renderer } = createRendererState({
      primaryTabId: 'plugins',
      secondaryTabs: { plugins: 'overview' },
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    expect(containerEl.querySelector('.opencodian-settings-tab-panel')).toBeNull();
    expect(containerEl.querySelector('.plugin-tab-marker')?.textContent).toBe('plugin-tab-rendered');
  });

  it('does not wrap model tabs with the extra tab-panel shell', () => {
    jest.spyOn(SettingsModelSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'model-tab-marker', text: 'model-tab-rendered' });
    });
    const { renderer } = createRendererState({
      primaryTabId: 'model',
      secondaryTabs: { model: 'common' },
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    expect(containerEl.querySelector('.opencodian-settings-tab-panel')).toBeNull();
    expect(containerEl.querySelector('.model-tab-marker')?.textContent).toBe('model-tab-rendered');
  });

  it('renders formatter tabs without the extra tab-panel shell', () => {
    jest.spyOn(SettingsFormatterSection.prototype, 'attachTabbed').mockImplementation((containerEl) => {
      containerEl.createDiv({ cls: 'formatter-tab-marker', text: 'formatter-tab-rendered' });
    });
    const { renderer } = createRendererState({
      primaryTabId: 'formatter',
      secondaryTabs: { formatter: 'overview' },
    });
    const containerEl = document.createElement('div');

    renderer.renderDisplay(containerEl);

    expect(containerEl.querySelector('.opencodian-settings-tab-panel')).toBeNull();
    expect(containerEl.querySelector('.formatter-tab-marker')?.textContent).toBe('formatter-tab-rendered');
    expect(
      Array.from(containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-tab-secondary')).map(
        (element) => element.textContent?.trim(),
      ),
    ).toEqual(['Overview', 'Config']);
  });
});

describe('SettingsModelSection tabbed block visibility', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hides the whole inactive model blocks instead of leaving empty block shells', () => {
    const createSectionHeading = jest.fn((containerEl: HTMLElement, title: string) => containerEl.createEl('h3', { text: title }));
    const createSettingsBlock = jest.fn((containerEl: HTMLElement, options: { title: string; description: string; collapsible?: boolean }) => {
      const hostEl = containerEl.createDiv({ cls: 'opencodian-settings-block' });
      if (!options.collapsible) {
        hostEl.createEl('h4', { text: options.title });
        hostEl.createDiv({ cls: 'opencodian-settings-block-desc', text: options.description });
        return hostEl.createDiv({ cls: 'opencodian-settings-block-body' });
      }

      const detailsEl = hostEl.createEl('details', { cls: 'opencodian-settings-block-details' });
      detailsEl.createEl('summary', { cls: 'opencodian-settings-block-summary', text: options.title });
      return detailsEl.createDiv({ cls: 'opencodian-settings-block-body' });
    });
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        modelAvailabilitySectionOpen: true,
        modelToolsSectionOpen: true,
      },
      scheduleSettingsUiStateSave: jest.fn(),
      modelConfigService: {},
    };
    const section = new SettingsModelSection({
      app: {} as App,
      plugin: plugin as never,
      createSectionHeading,
      createSettingsBlock,
      setSettingDescWithFormatting: () => undefined,
      applyInlineCodeText: () => undefined,
      refreshTitleModels: () => undefined,
      setRefreshModelsCallback: () => undefined,
      setRefreshModelCatalogStatusCallback: () => undefined,
      getServerState: () => ({ healthy: false, status: 'stopped' as const }),
      setServerState: () => undefined,
    });
    const containerEl = document.createElement('div');

    jest.spyOn(section as never, 'attachCommonSettings').mockImplementation(() => undefined);
    jest.spyOn(section as never, 'bootstrapModelSection').mockResolvedValue(undefined);
    jest.spyOn(
      (section as never).iconCacheManager,
      'attachTools',
    ).mockImplementation(() => undefined);
    jest.spyOn(
      (section as never).iconCacheManager,
      'refreshIconCacheOverview',
    ).mockResolvedValue(undefined);
    jest.spyOn(
      (section as never).catalogCoordinator,
      'updateCommonSummary',
    ).mockImplementation(() => undefined);
    jest.spyOn(
      (section as never).catalogCoordinator,
      'updateDefaultModelButton',
    ).mockImplementation(() => undefined);

    section.attachTabbed(containerEl, 'common');

    const blockEls = Array.from(containerEl.querySelectorAll<HTMLElement>('.opencodian-settings-block'));
    expect(blockEls).toHaveLength(4);
    expect(blockEls[0]?.style.display).toBe('');
    expect(blockEls[1]?.style.display).toBe('none');
    expect(blockEls[2]?.style.display).toBe('none');
    expect(blockEls[3]?.style.display).toBe('none');
  });
});
