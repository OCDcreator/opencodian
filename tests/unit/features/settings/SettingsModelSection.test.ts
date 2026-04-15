import { Setting } from 'obsidian';

import { SettingsModelSection } from '../../../../src/features/settings/SettingsModelSection';
import { t } from '../../../../src/i18n';
import { ProviderIconService } from '../../../../src/utils/icons';

describe('SettingsModelSection', () => {
  const flushAsyncWork = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the unavailable state and clears refresh callbacks when no model config service exists', () => {
    let refreshModelsCallback: (() => void) | undefined = () => {};
    let refreshCatalogStatusCallback: (() => void) | undefined = () => {};
    const containerEl = document.createElement('div');
    const section = new SettingsModelSection({
      app: {} as never,
      plugin: {
        modelConfigService: null,
        settings: {},
        scheduleSettingsUiStateSave: jest.fn(),
      } as never,
      createSectionHeading: (hostEl, title) => {
        const headingEl = hostEl.createEl('h2');
        headingEl.setText(title);
        return headingEl;
      },
      createSettingsBlock: (hostEl, options) => {
        const blockEl = hostEl.createDiv();
        blockEl.dataset.title = options.title;
        return blockEl;
      },
      setSettingDescWithFormatting: (setting, text) => {
        setting.setDesc(text);
      },
      applyInlineCodeText: (targetEl, text) => {
        targetEl?.setText(text);
      },
      refreshTitleModels: jest.fn(),
      setRefreshModelsCallback: (callback) => {
        refreshModelsCallback = callback;
      },
      setRefreshModelCatalogStatusCallback: (callback) => {
        refreshCatalogStatusCallback = callback;
      },
      getServerState: () => ({
        healthy: false,
        status: 'stopped',
      }),
      setServerState: jest.fn(),
    });

    const headingEl = section.attach(containerEl);

    expect(containerEl.querySelectorAll('h2')).toHaveLength(1);
    expect(headingEl.textContent).toBe(t('settings.model.title'));
    expect(refreshModelsCallback).toBeUndefined();
    expect(refreshCatalogStatusCallback).toBeUndefined();
  });

  it('dispose clears any registered refresh callbacks', () => {
    let refreshModelsCallback: (() => void) | undefined = () => {};
    let refreshCatalogStatusCallback: (() => void) | undefined = () => {};
    const section = new SettingsModelSection({
      app: {} as never,
      plugin: {
        settings: {},
      } as never,
      createSectionHeading: () => document.createElement('h2'),
      createSettingsBlock: () => document.createElement('div'),
      setSettingDescWithFormatting: (setting: Setting, text: string) => {
        setting.setDesc(text);
      },
      applyInlineCodeText: () => {},
      refreshTitleModels: jest.fn(),
      setRefreshModelsCallback: (callback) => {
        refreshModelsCallback = callback;
      },
      setRefreshModelCatalogStatusCallback: (callback) => {
        refreshCatalogStatusCallback = callback;
      },
      getServerState: () => ({
        healthy: false,
        status: 'stopped',
      }),
      setServerState: jest.fn(),
    });

    section.dispose();

    expect(refreshModelsCallback).toBeUndefined();
    expect(refreshCatalogStatusCallback).toBeUndefined();
  });

  it('registers refresh callbacks for the attached runtime when model config service is available', async () => {
    let refreshModelsCallback: (() => void) | undefined;
    let refreshCatalogStatusCallback: (() => void) | undefined;
    let serverState = {
      healthy: false,
      status: 'stopped',
    };
    const readLocalModelConfig = jest.fn().mockResolvedValue({});
    const getCatalogs = jest.fn().mockResolvedValue({
      local: { providers: [], defaults: {} },
      server: { providers: [], defaults: {} },
      baseEffective: { providers: [], defaults: {} },
      effective: { providers: [], defaults: {} },
      currentEnabledProviderIds: [],
      serverConfig: {},
      effectiveProviderConfig: {},
    });
    jest.spyOn(ProviderIconService, 'getProviderCacheState').mockResolvedValue({
      providers: [],
      summary: {
        cachedProviders: 0,
        totalProviders: 0,
        cachedIcons: 0,
        totalIcons: 0,
        currentProviders: 0,
      },
    } as never);
    const containerEl = document.createElement('div');
    const section = new SettingsModelSection({
      app: {} as never,
      plugin: {
        modelConfigService: {
          getConfigPath: jest.fn().mockReturnValue('/vault/.opencode/models.json'),
          readLocalModelConfig,
          getCatalogs,
        },
        openCodeService: {
          checkHealth: jest.fn().mockResolvedValue(false),
          getServerStatus: jest.fn().mockReturnValue('stopped'),
        },
        settings: {
          modelSourceMode: 'merge',
          disabledModelRefs: [],
          defaultProvider: '',
          defaultModel: '',
          modelAvailabilitySectionOpen: true,
          modelToolsSectionOpen: true,
          providerIconLibrary: {},
          providerIconColorMode: 'system',
          providerIconDefaultVariant: 'auto',
        },
        saveSettings: jest.fn().mockResolvedValue(undefined),
        applyProviderIconColorMode: jest.fn(),
        scheduleSettingsUiStateSave: jest.fn(),
      } as never,
      createSectionHeading: (hostEl, title) => {
        const headingEl = hostEl.createEl('h2');
        headingEl.setText(title);
        return headingEl;
      },
      createSettingsBlock: (hostEl, options) => {
        const blockEl = hostEl.createDiv();
        blockEl.dataset.title = options.title;
        return blockEl;
      },
      setSettingDescWithFormatting: (setting, text) => {
        setting.setDesc(text);
      },
      applyInlineCodeText: (targetEl, text) => {
        targetEl?.setText(text);
      },
      refreshTitleModels: jest.fn(),
      setRefreshModelsCallback: (callback) => {
        refreshModelsCallback = callback;
      },
      setRefreshModelCatalogStatusCallback: (callback) => {
        refreshCatalogStatusCallback = callback;
      },
      getServerState: () => serverState,
      setServerState: jest.fn((state) => {
        serverState = state;
      }),
    });

    section.attach(containerEl);
    await flushAsyncWork();

    expect(refreshModelsCallback).toEqual(expect.any(Function));
    expect(refreshCatalogStatusCallback).toEqual(expect.any(Function));

    serverState = {
      healthy: true,
      status: 'stopped',
    };
    expect(() => refreshCatalogStatusCallback?.()).not.toThrow();

    const initialReadCalls = readLocalModelConfig.mock.calls.length;
    refreshModelsCallback?.();
    await flushAsyncWork();
    expect(readLocalModelConfig.mock.calls.length).toBeGreaterThan(initialReadCalls);
    expect(getCatalogs).toHaveBeenCalled();
  });
});
