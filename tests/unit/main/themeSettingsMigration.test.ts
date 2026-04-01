jest.mock('../../../src/core/opencode', () => ({
  OpenCodeService: class {},
  SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS: {},
}));

import {
  getDefaultChatAppearanceSettings,
  getDefaultInputPanelGlassRefractionSettings,
} from '../../../src/core/types';
import OpenCodianPlugin from '../../../src/main';

describe('OpenCodianPlugin.loadSettings theme migration', () => {
  it('binds legacy default chat appearance to the built-in current style preset', async () => {
    const plugin = {
      storage: {
        loadSettings: jest.fn().mockResolvedValue({
          chatAppearance: getDefaultChatAppearanceSettings(),
        }),
      },
    } as unknown as OpenCodianPlugin;

    await OpenCodianPlugin.prototype.loadSettings.call(plugin);

    expect(plugin.settings.theme).toEqual({
      activePresetId: 'glass-classic',
      customAppearanceOverrides: {},
    });
    expect(plugin.settings.chatAppearance).toEqual(getDefaultChatAppearanceSettings());
  });

  it('keeps a legacy customized appearance as custom with no preset binding', async () => {
    const customizedAppearance = getDefaultChatAppearanceSettings();
    customizedAppearance.user.blur = 6;

    const plugin = {
      storage: {
        loadSettings: jest.fn().mockResolvedValue({
          chatAppearance: customizedAppearance,
        }),
      },
    } as unknown as OpenCodianPlugin;

    await OpenCodianPlugin.prototype.loadSettings.call(plugin);

    expect(plugin.settings.theme).toEqual({
      activePresetId: null,
      customAppearanceOverrides: {},
    });
    expect(plugin.settings.chatAppearance.user.blur).toBe(6);
  });

  it('rebuilds preset overrides from the stored effective appearance when theme data exists', async () => {
    const storedAppearance = getDefaultChatAppearanceSettings();
    storedAppearance.assistant.blur = 4;

    const plugin = {
      storage: {
        loadSettings: jest.fn().mockResolvedValue({
          chatAppearance: storedAppearance,
          theme: {
            activePresetId: 'glass-classic',
            customAppearanceOverrides: {},
          },
        }),
      },
    } as unknown as OpenCodianPlugin;

    await OpenCodianPlugin.prototype.loadSettings.call(plugin);

    expect(plugin.settings.theme.activePresetId).toBe('glass-classic');
    expect(plugin.settings.theme.customAppearanceOverrides).toEqual({
      assistant: {
        blur: 4,
      },
    });
    expect(plugin.settings.chatAppearance.assistant.blur).toBe(4);
  });

  it('migrates legacy liquid glass input theme values back to preset on load', async () => {
    const plugin = {
      storage: {
        loadSettings: jest.fn().mockResolvedValue({
          inputPanelTheme: 'liquid-glass',
        }),
      },
    } as unknown as OpenCodianPlugin;

    await OpenCodianPlugin.prototype.loadSettings.call(plugin);

    expect(plugin.settings.inputPanelTheme).toBe('preset');
  });

  it.each([
    'preset',
    'glass-refraction-glass',
    'glass-refraction-card',
    'glass-refraction-pill',
  ] as const)('preserves explicit input panel theme value %s', async (inputPanelTheme) => {
    const plugin = {
      storage: {
        loadSettings: jest.fn().mockResolvedValue({
          inputPanelTheme,
        }),
      },
    } as unknown as OpenCodianPlugin;

    await OpenCodianPlugin.prototype.loadSettings.call(plugin);

    expect(plugin.settings.inputPanelTheme).toBe(inputPanelTheme);
  });

  it('preserves preset input transparency and per-tier glass refraction tuning on load', async () => {
    const plugin = {
      storage: {
        loadSettings: jest.fn().mockResolvedValue({
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
          },
        }),
      },
    } as unknown as OpenCodianPlugin;

    await OpenCodianPlugin.prototype.loadSettings.call(plugin);

    expect(plugin.settings.chatAppearance.input.backgroundOpacity).toBe(61);
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
      pill: getDefaultInputPanelGlassRefractionSettings().pill,
    });
  });

  it('ignores the removed experimental composer glass refraction toggle field', async () => {
    const plugin = {
      storage: {
        loadSettings: jest.fn().mockResolvedValue({
          experimentalComposerGlassRefractionEnabled: true,
        }),
      },
    } as unknown as OpenCodianPlugin;

    await OpenCodianPlugin.prototype.loadSettings.call(plugin);

    expect(plugin.settings.inputPanelTheme).toBe('preset');
    expect(
      (plugin.settings as unknown as Record<string, unknown>).experimentalComposerGlassRefractionEnabled,
    ).toBeUndefined();
  });
});
