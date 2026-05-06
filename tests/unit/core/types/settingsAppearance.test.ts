/**
 * Settings type appearance tests
 */

import {
  getCurrentPlatformDebugLogPath,
  getDefaultChatAppearanceSettings,
  getDefaultDebugLogPaths,
  getDefaultInputPanelGlassRefractionSettings,
  getDefaultInputPanelGlassRefractionSvgFilterSettings,
  getDefaultThemeSettings,
  isValidChatAppearanceCustomCssDeclarations,
  normalizeChatAppearanceSettings,
  normalizeInputPanelGlassRefractionSettings,
  normalizeInputPanelGlassRefractionSvgFilterPresetId,
  normalizeInputPanelGlassRefractionSvgFilterSettings,
  normalizePartialChatAppearanceSettings,
  normalizeThemeSettings,
} from '../../../../src/core/types/settings';

describe('debug log paths', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  it('should return a copy of default debug log paths', () => {
    const paths1 = getDefaultDebugLogPaths();
    const paths2 = getDefaultDebugLogPaths();

    paths1.windows = 'C:\\Logs';

    expect(paths2.windows).toBe('');
  });

  it('should return Windows debug path on Windows', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
    });

    expect(
      getCurrentPlatformDebugLogPath({
        unix: '/Users/test/OpenCodianLogs',
        windows: 'C:\\OpenCodianLogs',
      }),
    ).toBe('C:\\OpenCodianLogs');
  });

  it('should return Unix debug path on macOS/Linux', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });

    expect(
      getCurrentPlatformDebugLogPath({
        unix: '/Users/test/OpenCodianLogs',
        windows: 'C:\\OpenCodianLogs',
      }),
    ).toBe('/Users/test/OpenCodianLogs');
  });
});

describe('chat appearance settings', () => {
  it('should return a copy of default chat appearance settings', () => {
    const defaultsA = getDefaultChatAppearanceSettings();
    const defaultsB = getDefaultChatAppearanceSettings();

    defaultsA.layout.messagesPaddingTop = 30;
    defaultsA.background.edgeFade = 44;
    defaultsA.scrollbar.width = 12;

    expect(defaultsB.layout.messagesPaddingTop).toBe(12);
    expect(defaultsB.background.edgeFade).toBe(28);
    expect(defaultsB.scrollbar.width).toBe(8);
  });

  it('should merge partial chat appearance settings with defaults', () => {
    const normalized = normalizeChatAppearanceSettings({
      layout: { messagesPaddingTop: 24 },
      background: {
        imagePath: '  .opencodian/theme-backgrounds/bg.png  ',
        imageDisplayName: '  sunset.png  ',
        fitMode: 'stretch' as never,
        opacity: 120,
        blur: -4,
        depth: 40,
        dim: 140,
        edgeFade: -1,
        saturation: 400,
        brightness: 20,
        focusX: -10,
        focusY: 120,
      },
      assistant: { blur: 4 },
      input: { backgroundOpacity: 64 },
      scrollbar: { width: 10, thumbOpacity: 80 },
    });

    expect(normalized.layout.messagesPaddingTop).toBe(24);
    expect(normalized.layout.messagesPaddingX).toBe(16);
    expect(normalized.background).toEqual({
      imagePath: '.opencodian/theme-backgrounds/bg.png',
      imageMimeType: '',
      imageDisplayName: 'sunset.png',
      fitMode: 'cover',
      opacity: 100,
      blur: 0,
      depth: 36,
      dim: 88,
      edgeFade: 0,
      saturation: 200,
      brightness: 40,
      focusX: 0,
      focusY: 100,
    });
    expect(normalized.assistant.blur).toBe(4);
    expect(normalized.assistant.radius).toBe(14);
    expect(normalized.user.timeFontSize).toBe(11);
    expect(normalized.user.timeFontWeight).toBe(400);
    expect(normalized.user.timeColor).toBe('var(--text-muted)');
    expect(normalized.assistant.metaFontSize).toBe(10);
    expect(normalized.assistant.timeFontSize).toBe(10);
    expect(normalized.assistant.timeFontWeight).toBe(400);
    expect(normalized.assistant.metaColor).toBe('var(--text-muted)');
    expect(normalized.assistant.modelIdFontSize).toBe(10);
    expect(normalized.assistant.modelIdFontWeight).toBe(400);
    expect(normalized.input.backgroundOpacity).toBe(64);
    expect(normalized.input.blur).toBe(18);
    expect(normalized.input.actionButtonStyle).toBe('default');
    expect(normalized.input.contextRingStyle).toBe('classic');
    expect(normalized.scrollbar.width).toBe(10);
    expect(normalized.scrollbar.thumbOpacity).toBe(80);
    expect(normalized.scrollbar.trackOpacity).toBe(22);
    expect(normalized.advanced.customCssDeclarations).toBe('');
  });

  it('normalizes an invalid input action button style back to default', () => {
    const normalized = normalizeChatAppearanceSettings({
      input: {
        actionButtonStyle: 'embedded' as never,
        contextRingStyle: 'dashed' as never,
      },
    });

    expect(normalized.input.actionButtonStyle).toBe('default');
    expect(normalized.input.contextRingStyle).toBe('classic');
  });

  it('normalizes assistant metadata appearance settings', () => {
    const normalized = normalizeChatAppearanceSettings({
      assistant: {
        metaFontSize: 99,
        timeFontSize: 5,
        timeFontWeight: 537,
        metaColor: 'not-a-color',
        timeColor: '#7f8c9f',
        modelIdFontSize: 16,
        modelIdFontWeight: 975,
        modelIdColor: 'var(--text-normal)',
      },
    });

    expect(normalized.assistant.metaFontSize).toBe(36);
    expect(normalized.assistant.timeFontSize).toBe(6);
    expect(normalized.assistant.timeFontWeight).toBe(537);
    expect(normalized.assistant.metaColor).toBe('var(--text-muted)');
    expect(normalized.assistant.timeColor).toBe('#7f8c9f');
    expect(normalized.assistant.modelIdFontSize).toBe(16);
    expect(normalized.assistant.modelIdFontWeight).toBe(900);
    expect(normalized.assistant.modelIdColor).toBe('var(--text-normal)');
  });

  it('normalizes user timestamp appearance settings', () => {
    const normalized = normalizeChatAppearanceSettings({
      user: {
        timeFontSize: 48,
        timeFontWeight: 975,
        timeColor: '#7f8c9f',
      },
    });

    expect(normalized.user.timeFontSize).toBe(36);
    expect(normalized.user.timeFontWeight).toBe(900);
    expect(normalized.user.timeColor).toBe('#7f8c9f');
  });

  it('uses the legacy shared metadata font size as a fallback for separate time/model sizes', () => {
    const normalized = normalizeChatAppearanceSettings({
      assistant: {
        metaFontSize: 14,
      },
    });

    expect(normalized.assistant.metaFontSize).toBe(14);
    expect(normalized.assistant.timeFontSize).toBe(14);
    expect(normalized.assistant.modelIdFontSize).toBe(14);
  });

  it('should validate custom CSS declarations', () => {
    expect(isValidChatAppearanceCustomCssDeclarations('--foo: 1; backdrop-filter: blur(10px);')).toBe(true);
    expect(isValidChatAppearanceCustomCssDeclarations('.opencodian-container { color: red; }')).toBe(false);
    expect(isValidChatAppearanceCustomCssDeclarations('<style>color: red;</style>')).toBe(false);
  });

  it('normalizes partial chat appearance overrides without filling defaults', () => {
    expect(normalizePartialChatAppearanceSettings({
      background: { dim: 36, edgeFade: 24 },
      user: { blur: 8 },
      advanced: { customCssDeclarations: '--foo: 1;' },
    })).toEqual({
      background: { dim: 36, edgeFade: 24 },
      user: { blur: 8 },
      advanced: { customCssDeclarations: '--foo: 1;' },
    });
    expect(normalizePartialChatAppearanceSettings(null)).toEqual({});
  });
});

describe('theme settings', () => {
  it('returns the built-in current style preset as default theme settings', () => {
    expect(getDefaultThemeSettings()).toEqual({
      activePresetId: 'glass-classic',
      customAppearanceOverrides: {},
    });
  });

  it('normalizes a null active preset without forcing a preset back in', () => {
    expect(normalizeThemeSettings({
      activePresetId: null,
      customAppearanceOverrides: {
        user: { blur: 4 },
      },
    })).toEqual({
      activePresetId: null,
      customAppearanceOverrides: {
        user: { blur: 4 },
      },
    });
  });
});

describe('input panel glass refraction settings', () => {
  it('returns the expected defaults', () => {
    expect(getDefaultInputPanelGlassRefractionSettings()).toEqual({
      glass: {
        backgroundOpacity: 48,
        blur: 26,
        saturation: 170,
        brightness: 108,
      },
      card: {
        backgroundOpacity: 52,
        blur: 20,
        saturation: 150,
        brightness: 100,
      },
      pill: {
        backgroundOpacity: 5,
        blur: 8,
        saturation: 130,
        brightness: 100,
      },
    });
  });

  it('normalizes invalid glass refraction values back to defaults and clamps ranges', () => {
    expect(normalizeInputPanelGlassRefractionSettings({
      glass: {
        backgroundOpacity: 140,
        blur: -1,
        saturation: 999,
        brightness: 10,
      },
      card: {
        blur: 24,
      },
      pill: {} as never,
    })).toEqual({
      glass: {
        backgroundOpacity: 100,
        blur: 0,
        saturation: 250,
        brightness: 50,
      },
      card: {
        backgroundOpacity: 52,
        blur: 24,
        saturation: 150,
        brightness: 100,
      },
      pill: {
        backgroundOpacity: 5,
        blur: 8,
        saturation: 130,
        brightness: 100,
      },
    });
  });
});

describe('input panel glass refraction svg filters', () => {
  it('returns the expected defaults', () => {
    expect(getDefaultInputPanelGlassRefractionSvgFilterSettings()).toEqual({
      preset: 'none',
      subtleScale: 8,
      strongScale: 16,
    });
  });

  it('normalizes svg filter preset values', () => {
    expect(normalizeInputPanelGlassRefractionSvgFilterPresetId('none')).toBe('none');
    expect(normalizeInputPanelGlassRefractionSvgFilterPresetId('subtle')).toBe('subtle');
    expect(normalizeInputPanelGlassRefractionSvgFilterPresetId('strong')).toBe('strong');
    expect(normalizeInputPanelGlassRefractionSvgFilterPresetId('hero')).toBe('none');
    expect(normalizeInputPanelGlassRefractionSvgFilterPresetId(undefined)).toBe('none');
  });

  it('normalizes svg filter settings back to defaults and clamps scales', () => {
    expect(normalizeInputPanelGlassRefractionSvgFilterSettings({
      preset: 'strong',
      subtleScale: -5,
      strongScale: 99,
    })).toEqual({
      preset: 'strong',
      subtleScale: 0,
      strongScale: 32,
    });

    expect(normalizeInputPanelGlassRefractionSvgFilterSettings({
      preset: 'legacy' as never,
    })).toEqual({
      preset: 'none',
      subtleScale: 8,
      strongScale: 16,
    });
  });
});
