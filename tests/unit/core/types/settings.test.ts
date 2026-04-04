/**
 * Settings type definitions tests
 */

import {
  DEFAULT_SETTINGS,
  getCurrentPlatformBlockedCommands,
  getCurrentPlatformDebugLogPath,
  getDefaultBlockedCommands,
  getDefaultChatAppearanceSettings,
  getDefaultDebugLogPaths,
  getDefaultInputPanelGlassRefractionSettings,
  getDefaultInputPanelGlassRefractionSvgFilterSettings,
  getDefaultInputPanelLiquidGlassSettings,
  getDefaultThemeSettings,
  isValidChatAppearanceCustomCssDeclarations,
  normalizeBelowHeaderTabBarLayout,
  normalizeChatAppearanceSettings,
  normalizeInputPanelActionButtonStyleId,
  normalizeInputPanelGlassRefractionSettings,
  normalizeInputPanelGlassRefractionSvgFilterPresetId,
  normalizeInputPanelGlassRefractionSvgFilterSettings,
  normalizeInputPanelLiquidGlassSettings,
  normalizeInputPanelThemeId,
  normalizePartialChatAppearanceSettings,
  normalizeQuestionCardPosition,
  normalizeQuestionDisplayMode,
  normalizeTabBarPosition,
  normalizeThemeSettings,
} from '../../../../src/core/types/settings';

describe('Settings', () => {
  describe('getDefaultBlockedCommands', () => {
    it('should return default blocked commands for both platforms', () => {
      const commands = getDefaultBlockedCommands();

      expect(commands.unix).toContain('rm -rf');
      expect(commands.unix).toContain('chmod 777');
      expect(commands.windows).toContain('del /s /q');
      expect(commands.windows).toContain('format');
    });

    it('should return a copy (not reference)', () => {
      const commands1 = getDefaultBlockedCommands();
      const commands2 = getDefaultBlockedCommands();

      commands1.unix.push('new-command');

      expect(commands2.unix).not.toContain('new-command');
    });
  });

  describe('getCurrentPlatformBlockedCommands', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      });
    });

    it('should return Windows commands on Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      const commands = getCurrentPlatformBlockedCommands(getDefaultBlockedCommands());

      expect(commands).toContain('del /s /q');
      expect(commands).toContain('format');
    });

    it('should return Unix commands on non-Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      const commands = getCurrentPlatformBlockedCommands(getDefaultBlockedCommands());

      expect(commands).toContain('rm -rf');
      expect(commands).toContain('chmod 777');
    });
  });

  describe('DEFAULT_SETTINGS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_SETTINGS.userName).toBe('');
      expect(DEFAULT_SETTINGS.server.mode).toBe('local');
      expect(DEFAULT_SETTINGS.server.local.host).toBe('127.0.0.1');
      expect(DEFAULT_SETTINGS.server.local.port).toBe(4096);
      expect(DEFAULT_SETTINGS.server.local.autoStart).toBe(true);
      expect(DEFAULT_SETTINGS.server.remote.baseUrl).toBe('http://127.0.0.1:4096');
      expect(DEFAULT_SETTINGS.server.auth.type).toBe('none');
      expect(DEFAULT_SETTINGS.enableBlocklist).toBe(true);
      expect(DEFAULT_SETTINGS.allowExternalAccess).toBe(false);
      expect(DEFAULT_SETTINGS.permissionMode).toBe('yolo');
      expect(DEFAULT_SETTINGS.modelSourceMode).toBe('merge');
      expect(DEFAULT_SETTINGS.defaultProvider).toBe('anthropic');
      expect(DEFAULT_SETTINGS.defaultModel).toBe('claude-3-5-sonnet-20241022');
      expect(DEFAULT_SETTINGS.questionDisplayMode).toBe('all');
      expect(DEFAULT_SETTINGS.questionCardPosition).toBe('inline');
      expect(DEFAULT_SETTINGS.showAnsweredQuestionCards).toBe(true);
      expect(DEFAULT_SETTINGS.renderUserMarkupAsCodeBlocks).toBe(true);
      expect(DEFAULT_SETTINGS.pluginIsolationMode).toBe('default');
      expect(DEFAULT_SETTINGS.maxTabs).toBe(3);
      expect(DEFAULT_SETTINGS.tabBarPosition).toBe('below-header');
      expect(DEFAULT_SETTINGS.belowHeaderTabBarLayout).toBe('grid');
      expect(DEFAULT_SETTINGS.enableAutoScroll).toBe(true);
      expect(DEFAULT_SETTINGS.chatAppearance.layout.messagesPaddingTop).toBe(12);
      expect(DEFAULT_SETTINGS.inputPanelTheme).toBe('preset');
      expect(DEFAULT_SETTINGS.chatAppearance.sticky.maskBlur).toBe(24);
      expect(DEFAULT_SETTINGS.chatAppearance.background.imagePath).toBe('');
      expect(DEFAULT_SETTINGS.chatAppearance.background.fitMode).toBe('cover');
      expect(DEFAULT_SETTINGS.chatAppearance.background.opacity).toBe(92);
      expect(DEFAULT_SETTINGS.chatAppearance.background.edgeFade).toBe(28);
      expect(DEFAULT_SETTINGS.chatAppearance.user.radius).toBe(16);
      expect(DEFAULT_SETTINGS.chatAppearance.assistant.backgroundOpacity).toBe(72);
      expect(DEFAULT_SETTINGS.chatAppearance.input.backgroundOpacity).toBe(72);
      expect(DEFAULT_SETTINGS.chatAppearance.input.shadowBlur).toBe(28);
      expect(DEFAULT_SETTINGS.chatAppearance.input.actionButtonStyle).toBe('default');
      expect(DEFAULT_SETTINGS.inputPanelGlassRefraction).toEqual(getDefaultInputPanelGlassRefractionSettings());
      expect(DEFAULT_SETTINGS.inputPanelGlassRefractionSvgFilter).toEqual(
        getDefaultInputPanelGlassRefractionSvgFilterSettings(),
      );
      expect(DEFAULT_SETTINGS.inputPanelLiquidGlass).toEqual(getDefaultInputPanelLiquidGlassSettings());
      expect(DEFAULT_SETTINGS.chatAppearance.scrollbar.width).toBe(8);
      expect(DEFAULT_SETTINGS.chatAppearance.scrollbar.thumbHoverOpacity).toBe(82);
      expect(DEFAULT_SETTINGS.settingsPanelScrollTop).toBe(0);
      expect(DEFAULT_SETTINGS.debugLogPaths).toEqual({ unix: '', windows: '' });
      expect(DEFAULT_SETTINGS.openInMainTab).toBe(false);
      expect(DEFAULT_SETTINGS.theme).toEqual(getDefaultThemeSettings());
      expect(DEFAULT_SETTINGS.locale).toBe('en');
    });

    it('should have providers array with anthropic', () => {
      expect(DEFAULT_SETTINGS.providers).toHaveLength(1);
      expect(DEFAULT_SETTINGS.providers[0].id).toBe('anthropic');
      expect(DEFAULT_SETTINGS.providers[0].enabled).toBe(true);
    });

    it('should have blocked commands', () => {
      expect(DEFAULT_SETTINGS.blockedCommands.unix.length).toBeGreaterThan(0);
      expect(DEFAULT_SETTINGS.blockedCommands.windows.length).toBeGreaterThan(0);
    });

    it('should have empty arrays for optional settings', () => {
      expect(DEFAULT_SETTINGS.excludedTags).toEqual([]);
      expect(DEFAULT_SETTINGS.hiddenSlashCommands).toEqual([]);
    });

    it('should have allowed export paths', () => {
      expect(DEFAULT_SETTINGS.allowedExportPaths).toContain('~/Desktop');
      expect(DEFAULT_SETTINGS.allowedExportPaths).toContain('~/Downloads');
    });
  });

  describe('tab bar setting normalization', () => {
    it('normalizes invalid tab bar positions to below-header', () => {
      expect(normalizeTabBarPosition('header')).toBe('header');
      expect(normalizeTabBarPosition('input')).toBe('input');
      expect(normalizeTabBarPosition('below-header')).toBe('below-header');
      expect(normalizeTabBarPosition('legacy')).toBe('below-header');
    });

    it('normalizes invalid below-header layouts to grid', () => {
      expect(normalizeBelowHeaderTabBarLayout('grid')).toBe('grid');
      expect(normalizeBelowHeaderTabBarLayout('vertical')).toBe('vertical');
      expect(normalizeBelowHeaderTabBarLayout('stacked')).toBe('grid');
    });
  });

  describe('question display mode normalization', () => {
    it('normalizes invalid question display modes to all', () => {
      expect(normalizeQuestionDisplayMode('all')).toBe('all');
      expect(normalizeQuestionDisplayMode('single')).toBe('single');
      expect(normalizeQuestionDisplayMode('grouped')).toBe('all');
      expect(normalizeQuestionDisplayMode(undefined)).toBe('all');
    });
  });

  describe('question card position normalization', () => {
    it('normalizes invalid question card positions to inline', () => {
      expect(normalizeQuestionCardPosition('inline')).toBe('inline');
      expect(normalizeQuestionCardPosition('above_input')).toBe('above_input');
      expect(normalizeQuestionCardPosition('floating')).toBe('inline');
      expect(normalizeQuestionCardPosition(undefined)).toBe('inline');
    });
  });

  describe('input panel theme normalization', () => {
    it('accepts supported input panel themes and normalizes invalid values to preset', () => {
      expect(normalizeInputPanelThemeId('preset')).toBe('preset');
      expect(normalizeInputPanelThemeId('glass-refraction-glass')).toBe('glass-refraction-glass');
      expect(normalizeInputPanelThemeId('glass-refraction-card')).toBe('glass-refraction-card');
      expect(normalizeInputPanelThemeId('glass-refraction-pill')).toBe('glass-refraction-pill');
      expect(normalizeInputPanelThemeId('liquid-glass-shuding')).toBe('liquid-glass-shuding');
      expect(normalizeInputPanelThemeId('liquid-glass-nikdelvin')).toBe('liquid-glass-nikdelvin');
      expect(normalizeInputPanelThemeId('liquid-glass-rdev')).toBe('liquid-glass-shuding');
      expect(normalizeInputPanelThemeId('liquid-glass')).toBe('preset');
      expect(normalizeInputPanelThemeId('glass')).toBe('preset');
      expect(normalizeInputPanelThemeId(undefined)).toBe('preset');
    });
  });

  describe('input action button style normalization', () => {
    it('accepts supported styles and normalizes invalid values to default', () => {
      expect(normalizeInputPanelActionButtonStyleId('default')).toBe('default');
      expect(normalizeInputPanelActionButtonStyleId('etched')).toBe('etched');
      expect(normalizeInputPanelActionButtonStyleId('embedded')).toBe('default');
      expect(normalizeInputPanelActionButtonStyleId(undefined)).toBe('default');
    });
  });

  describe('liquid glass settings normalization', () => {
    it('uses upstream-aligned shuding defaults while keeping enhancements off by default', () => {
      expect(getDefaultInputPanelLiquidGlassSettings().shuding).toMatchObject({
        displacementScale: 10,
        blurAmount: 0.25,
        contrastBoost: 1.2,
        brightnessBoost: 1.05,
        saturateBoost: 1.1,
        adaptiveSdf: false,
        adaptiveSdfMix: 0,
        rectEdgeRefraction: false,
        rectEdgeRefractionStrength: 0,
        cornerEnhancement: false,
        cornerEnhancementStrength: 0,
        edgeBandWidth: 0,
        barrelDistortion: false,
        barrelStrength: 0,
        topHighlight: false,
        innerBorder: false,
        bottomShadow: false,
        insetDepthShadow: false,
      });
    });

    it('restores only the supported shuding and nikdelvin defaults', () => {
      const normalized = normalizeInputPanelLiquidGlassSettings({});

      expect(normalized).toEqual({
        shuding: getDefaultInputPanelLiquidGlassSettings().shuding,
        nikdelvin: getDefaultInputPanelLiquidGlassSettings().nikdelvin,
      });
    });

    it('preserves zero-valued shuding enhancement settings instead of clamping them back on', () => {
      expect(normalizeInputPanelLiquidGlassSettings({
        shuding: {
          adaptiveSdfMix: 0,
          rectEdgeRefractionStrength: 0,
          cornerEnhancementStrength: 0,
          edgeBandWidth: 0,
          barrelStrength: 0,
        },
      }).shuding).toMatchObject({
        adaptiveSdfMix: 0,
        rectEdgeRefractionStrength: 0,
        cornerEnhancementStrength: 0,
        edgeBandWidth: 0,
        barrelStrength: 0,
      });
    });
  });

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
        })
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
        })
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
      expect(normalized.input.backgroundOpacity).toBe(64);
      expect(normalized.input.blur).toBe(18);
      expect(normalized.input.actionButtonStyle).toBe('default');
      expect(normalized.scrollbar.width).toBe(10);
      expect(normalized.scrollbar.thumbOpacity).toBe(80);
      expect(normalized.scrollbar.trackOpacity).toBe(22);
      expect(normalized.advanced.customCssDeclarations).toBe('');
    });

    it('normalizes an invalid input action button style back to default', () => {
      const normalized = normalizeChatAppearanceSettings({
        input: {
          actionButtonStyle: 'embedded' as never,
        },
      });

      expect(normalized.input.actionButtonStyle).toBe('default');
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
});
