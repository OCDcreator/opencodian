jest.mock('../../../src/core/opencode', () => ({
  OpenCodeService: class {},
  SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS: {},
}));

import OpenCodianPlugin from '../../../src/main';
import { getDefaultChatAppearanceSettings } from '../../../src/core/types';

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
});
