jest.mock('../../../src/core/opencode', () => ({
  OpenCodeService: class {},
  SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS: {},
}));

import type { StorageService } from '../../../src/core/storage';
import {
  getCurrentPlatformKey,
  getDefaultChatAppearanceSettings,
  getDefaultInputPanelGlassRefractionSettings,
} from '../../../src/core/types';
import OpenCodianPlugin from '../../../src/main';

function createPluginWithSavedSettings(savedSettings: Record<string, unknown>): OpenCodianPlugin & {
  storage: Pick<StorageService, 'loadPersistedSettings' | 'saveCoreSettings' | 'saveUiSettings'>;
} {
  const plugin = new OpenCodianPlugin() as OpenCodianPlugin & {
    storage: Pick<StorageService, 'loadPersistedSettings' | 'saveCoreSettings' | 'saveUiSettings'>;
  };

  plugin.storage = {
    loadPersistedSettings: jest.fn().mockResolvedValue({
      core: {
        data: savedSettings,
        filePath: '.opencodian/settings.core.json',
        source: 'primary',
        shouldPersist: false,
      },
      ui: {
        data: null,
        filePath: '.opencodian/settings.ui.json',
        source: 'missing',
        shouldPersist: false,
      },
      writable: true,
      shouldPersist: false,
    }),
    saveCoreSettings: jest.fn().mockResolvedValue(undefined),
    saveUiSettings: jest.fn().mockResolvedValue(undefined),
  } as Pick<StorageService, 'loadPersistedSettings' | 'saveCoreSettings' | 'saveUiSettings'>;

  return plugin;
}

  it('binds legacy default chat appearance to the built-in current style preset', async () => {
    const plugin = createPluginWithSavedSettings({
      chatAppearance: getDefaultChatAppearanceSettings(),
    });

    await plugin.loadSettings();

    expect(plugin.settings.theme).toEqual({
      activePresetId: 'glass-classic',
      customAppearanceOverrides: {},
    });
    expect(plugin.settings.chatAppearance).toEqual(getDefaultChatAppearanceSettings());
  });

  it('keeps a legacy customized appearance as custom with no preset binding', async () => {
    const customizedAppearance = getDefaultChatAppearanceSettings();
    customizedAppearance.user.blur = 6;

    const plugin = createPluginWithSavedSettings({
      chatAppearance: customizedAppearance,
    });

    await plugin.loadSettings();

    expect(plugin.settings.theme).toEqual({
      activePresetId: null,
      customAppearanceOverrides: {},
    });
    expect(plugin.settings.chatAppearance.user.blur).toBe(6);
  });

  it('rebuilds preset overrides from the stored effective appearance when theme data exists', async () => {
    const storedAppearance = getDefaultChatAppearanceSettings();
    storedAppearance.assistant.blur = 4;

    const plugin = createPluginWithSavedSettings({
      chatAppearance: storedAppearance,
      theme: {
        activePresetId: 'glass-classic',
        customAppearanceOverrides: {},
      },
    });

    await plugin.loadSettings();

    expect(plugin.settings.theme.activePresetId).toBe('glass-classic');
    expect(plugin.settings.theme.customAppearanceOverrides).toEqual({
      assistant: {
        blur: 4,
      },
    });
    expect(plugin.settings.chatAppearance.assistant.blur).toBe(4);
  });

  it('normalizes question card display settings together on load', async () => {
    const plugin = createPluginWithSavedSettings({
      questionDisplayMode: 'single',
      questionCardPosition: 'floating',
      showAnsweredQuestionCards: false,
    });

    await plugin.loadSettings();

    expect(plugin.settings.questionDisplayMode).toBe('single');
    expect(plugin.settings.questionCardPosition).toBe('inline');
    expect(plugin.settings.showAnsweredQuestionCards).toBe(false);
  });

  it('normalizes provider/model/plugin/debug residual settings together on load', async () => {
    const plugin = createPluginWithSavedSettings({
      aiTitleModel: '  openai/gpt-4o-mini  ',
      disabledModelRefs: [
        ' openai/gpt-4o ',
        'invalid',
        ' openai/gpt-4o ',
      ],
      renderUserMarkupAsCodeBlocks: false,
      pluginIsolationMode: 'pure',
      providerIconLibrary: {
        openai: [
          {
            id: 'builtin:lobehub:openai',
            type: 'builtin',
            source: 'lobehub:openai',
            variant: 'brand-color',
            resolvedVariant: 'brand-color',
            resolvedFormat: 'svg',
            addedAt: 1,
          },
        ],
      },
      providerIconColorMode: 'rainbow',
      providerIconDefaultVariant: 'brand-color',
      modelAvailabilitySectionOpen: false,
      modelToolsSectionOpen: 'collapsed',
      inlineSerializedDebugLogArgs: true,
      debugLogPath: '/tmp/legacy-debug',
    });

    await plugin.loadSettings();

    const expectedDebugLogPaths = { unix: '', windows: '' };
    expectedDebugLogPaths[getCurrentPlatformKey()] = '/tmp/legacy-debug';

    expect(plugin.settings.aiTitleModel).toBe('openai/gpt-4o-mini');
    expect(plugin.settings.disabledModelRefs).toEqual(['openai/gpt-4o']);
    expect(plugin.settings.renderUserMarkupAsCodeBlocks).toBe(false);
    expect(plugin.settings.pluginIsolationMode).toBe('pure');
    expect(plugin.settings.providerIconColorMode).toBe('system');
    expect(plugin.settings.providerIconDefaultVariant).toBe('brand-color');
    expect(plugin.settings.providerIconLibrary.openai?.[0]).toMatchObject({
      variant: 'brand-color',
      resolvedVariant: 'brand-color',
      resolvedFormat: 'svg',
    });
    expect(plugin.settings.modelAvailabilitySectionOpen).toBe(false);
    expect(plugin.settings.modelToolsSectionOpen).toBe(true);
    expect(plugin.settings.inlineSerializedDebugLogArgs).toBe(true);
    expect(plugin.settings.debugLogPaths).toEqual(expectedDebugLogPaths);
    expect((plugin.settings as unknown as Record<string, unknown>).debugLogPath).toBeUndefined();
  });

  it('preserves the saved background image when a preset-backed theme is restored', async () => {
    const storedAppearance = getDefaultChatAppearanceSettings();
    storedAppearance.background.imagePath = '.opencodian/theme-backgrounds/theme-bg-test.png';
    storedAppearance.background.imageMimeType = 'image/png';
    storedAppearance.background.imageDisplayName = 'theme-bg-test.png';
    storedAppearance.background.edgeFade = 36;

    const plugin = createPluginWithSavedSettings({
      chatAppearance: storedAppearance,
      theme: {
        activePresetId: 'glass-classic',
        customAppearanceOverrides: {},
      },
    });

    await plugin.loadSettings();

    expect(plugin.settings.theme.activePresetId).toBe('glass-classic');
    expect(plugin.settings.theme.customAppearanceOverrides).toEqual({});
    expect(plugin.settings.chatAppearance.background).toEqual({
      imagePath: '.opencodian/theme-backgrounds/theme-bg-test.png',
      imageMimeType: 'image/png',
      imageDisplayName: 'theme-bg-test.png',
      fitMode: 'cover',
      opacity: 92,
      blur: 2,
      depth: 8,
      dim: 28,
      edgeFade: 36,
      saturation: 108,
      brightness: 94,
      focusX: 50,
      focusY: 50,
    });
  });

  it('migrates legacy liquid glass input theme values back to preset on load', async () => {
    const plugin = createPluginWithSavedSettings({
      inputPanelTheme: 'liquid-glass',
    });

    await plugin.loadSettings();

    expect(plugin.settings.inputPanelTheme).toBe('preset');
  });

  it('migrates the removed rdev liquid glass input theme to shuding on load', async () => {
    const plugin = createPluginWithSavedSettings({
      inputPanelTheme: 'liquid-glass-rdev',
    });

    await plugin.loadSettings();

    expect(plugin.settings.inputPanelTheme).toBe('liquid-glass-shuding');
  });

  it.each([
    'preset',
    'glass-refraction-glass',
    'glass-refraction-card',
    'glass-refraction-pill',
    'liquid-glass-shuding',
    'liquid-glass-nikdelvin',
  ] as const)('preserves explicit input panel theme value %s', async (inputPanelTheme) => {
    const plugin = createPluginWithSavedSettings({
      inputPanelTheme,
    });

    await plugin.loadSettings();

    expect(plugin.settings.inputPanelTheme).toBe(inputPanelTheme);
  });

  it('migrates the removed diamond input panel theme back to preset on load', async () => {
    const plugin = createPluginWithSavedSettings({
      inputPanelTheme: 'liquid-diamond-shuding',
    });

    await plugin.loadSettings();

    expect(plugin.settings.inputPanelTheme).toBe('preset');
  });

  it('resets legacy glass-refraction tier tuning to reference defaults', async () => {
    const plugin = createPluginWithSavedSettings({
      chatAppearance: {
        input: {
          backgroundOpacity: 61,
        },
      },
      inputPanelGlassRefraction: {
        glass: {
          backgroundOpacity: 56,
          blur: 28,
          saturation: 180,
          brightness: 110,
        },
        card: {
          backgroundOpacity: 44,
          blur: 18,
          saturation: 145,
          brightness: 96,
        },
        pill: {
          backgroundOpacity: 12,
          blur: 10,
          saturation: 138,
          brightness: 104,
        },
      },
    });

    await plugin.loadSettings();

    expect(plugin.settings.chatAppearance.input.backgroundOpacity).toBe(61);
    expect(plugin.settings.inputPanelGlassRefraction).toEqual({
      glass: getDefaultInputPanelGlassRefractionSettings().glass,
      card: getDefaultInputPanelGlassRefractionSettings().card,
      pill: getDefaultInputPanelGlassRefractionSettings().pill,
    });
    expect(plugin.settings.inputPanelGlassRefractionGlassDefaultsVersion).toBe(2);
  });

  it('preserves glass tuning from v1 while resetting card and pill to reference defaults', async () => {
    const plugin = createPluginWithSavedSettings({
      inputPanelGlassRefractionGlassDefaultsVersion: 1,
      inputPanelGlassRefraction: {
        glass: {
          backgroundOpacity: 56,
          blur: 28,
          saturation: 180,
          brightness: 110,
        },
        card: {
          backgroundOpacity: 44,
          blur: 18,
          saturation: 145,
          brightness: 96,
        },
        pill: {
          backgroundOpacity: 12,
          blur: 10,
          saturation: 138,
          brightness: 104,
        },
      },
    });

    await plugin.loadSettings();

    expect(plugin.settings.inputPanelGlassRefraction).toEqual({
      glass: {
        backgroundOpacity: 56,
        blur: 28,
        saturation: 180,
        brightness: 110,
      },
      card: getDefaultInputPanelGlassRefractionSettings().card,
      pill: getDefaultInputPanelGlassRefractionSettings().pill,
    });
    expect(plugin.settings.inputPanelGlassRefractionGlassDefaultsVersion).toBe(2);
  });

  it('preserves user-adjusted glass-refraction tuning after the v2 reset has run', async () => {
    const plugin = createPluginWithSavedSettings({
      inputPanelGlassRefractionGlassDefaultsVersion: 2,
      inputPanelGlassRefraction: {
        glass: {
          backgroundOpacity: 56,
          blur: 28,
          saturation: 180,
          brightness: 110,
        },
        card: {
          backgroundOpacity: 44,
          blur: 18,
          saturation: 145,
          brightness: 96,
        },
        pill: {
          backgroundOpacity: 12,
          blur: 10,
          saturation: 138,
          brightness: 104,
        },
      },
    });

    await plugin.loadSettings();

    expect(plugin.settings.inputPanelGlassRefraction).toEqual({
      glass: {
        backgroundOpacity: 56,
        blur: 28,
        saturation: 180,
        brightness: 110,
      },
      card: {
        backgroundOpacity: 44,
        blur: 18,
        saturation: 145,
        brightness: 96,
      },
      pill: {
        backgroundOpacity: 12,
        blur: 10,
        saturation: 138,
        brightness: 104,
      },
    });
    expect(plugin.settings.inputPanelGlassRefractionGlassDefaultsVersion).toBe(2);
  });

  it('fills missing card and pill tiers with reference defaults after the v2 reset has run', async () => {
    const plugin = createPluginWithSavedSettings({
      inputPanelGlassRefractionGlassDefaultsVersion: 2,
      inputPanelGlassRefraction: {
        glass: {
          backgroundOpacity: 56,
          blur: 28,
          saturation: 180,
          brightness: 110,
        },
      },
    });

    await plugin.loadSettings();

    expect(plugin.settings.inputPanelGlassRefraction).toEqual({
      glass: {
        backgroundOpacity: 56,
        blur: 28,
        saturation: 180,
        brightness: 110,
      },
      card: getDefaultInputPanelGlassRefractionSettings().card,
      pill: getDefaultInputPanelGlassRefractionSettings().pill,
    });
    expect(plugin.settings.inputPanelGlassRefractionGlassDefaultsVersion).toBe(2);
  });

  it('ignores the removed experimental composer glass refraction toggle field', async () => {
    const plugin = createPluginWithSavedSettings({
      experimentalComposerGlassRefractionEnabled: true,
    });

    await plugin.loadSettings();

    expect(plugin.settings.inputPanelTheme).toBe('preset');
    expect(
      (plugin.settings as unknown as Record<string, unknown>).experimentalComposerGlassRefractionEnabled,
    ).toBeUndefined();
  });
