import {
  areChatAppearanceSettingsEqual,
  getThemeAppearanceOverridesFromBase,
  getThemePresetDefinition,
  hasThemeAppearanceOverrides,
  mergePartialChatAppearanceSettings,
  resolveThemeChatAppearance,
} from '../../../../src/core/theme';
import { getDefaultChatAppearanceSettings, type ThemeSettings } from '../../../../src/core/types';

describe('theme presets', () => {
  it('exposes the built-in current style preset as glass-classic', () => {
    const preset = getThemePresetDefinition('glass-classic');

    expect(preset).not.toBeNull();
    expect(preset?.name).toBe('OpenCodian Classic');
    expect(preset?.containerClass).toBe('opencodian-theme-glass');
    expect(areChatAppearanceSettingsEqual(
      preset!.appearance,
      getDefaultChatAppearanceSettings(),
    )).toBe(true);
  });

  it('resolves a preset appearance merged with overrides', () => {
    const theme: ThemeSettings = {
      activePresetId: 'flat-ocean',
      customAppearanceOverrides: {
        input: {
          radius: 18,
        },
        advanced: {
          customCssDeclarations: '--foo: 1;',
        },
      },
    };

    const resolved = resolveThemeChatAppearance(theme);

    expect(resolved.input.radius).toBe(18);
    expect(resolved.advanced.customCssDeclarations).toBe('--foo: 1;');
    expect(resolved.user.blur).toBe(0);
  });

  it('computes only the changed appearance overrides relative to a preset base', () => {
    const preset = getThemePresetDefinition('soft-neutral');
    const current = mergePartialChatAppearanceSettings(preset!.appearance, {
      assistant: {
        blur: 3,
      },
      scrollbar: {
        width: 10,
      },
    });

    expect(getThemeAppearanceOverridesFromBase(preset!.appearance, current)).toEqual({
      assistant: {
        blur: 3,
      },
      scrollbar: {
        width: 10,
      },
    });
  });

  it('detects whether a preset-backed theme has user overrides', () => {
    expect(hasThemeAppearanceOverrides({
      activePresetId: 'sharp-neon',
      customAppearanceOverrides: {},
    })).toBe(false);

    expect(hasThemeAppearanceOverrides({
      activePresetId: 'sharp-neon',
      customAppearanceOverrides: {
        user: {
          radius: 10,
        },
      },
    })).toBe(true);
  });
});
