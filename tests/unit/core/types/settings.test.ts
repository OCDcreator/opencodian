/**
 * Settings type definitions tests
 */

import {
  DEFAULT_SETTINGS,
  getCurrentPlatformBlockedCommands,
  getCurrentPlatformKey,
  getDefaultBlockedCommands,
  getDefaultInputPanelGlassRefractionSettings,
  getDefaultInputPanelGlassRefractionSvgFilterSettings,
  getDefaultInputPanelLiquidGlassSettings,
  getDefaultThemeSettings,
  getInputPanelGlassRefractionVariantId,
  getInputPanelThemeFamily,
  getInputPanelThemeIdForLiquidGlassAdapter,
  getLiquidGlassAdapterIdForInputPanelTheme,
  normalizeBelowHeaderTabBarLayout,
  normalizeChatFontSizePx,
  normalizeCompactionReservedTokens,
  normalizeDisabledModelRefs,
  normalizeGlassRefractionInputPanelThemeId,
  normalizeInputPanelActionButtonStyleId,
  normalizeInputPanelLiquidGlassSettings,
  normalizeInputPanelThemeId,
  normalizeLiquidGlassInputPanelThemeId,
  normalizeLobehubIconVariant,
  normalizeModelProviderPluginDebugSettings,
  normalizeProviderIconLibrary,
  normalizeProviderIconResolvedFormat,
  normalizeQuestionCardPosition,
  normalizeQuestionCardSettings,
  normalizeQuestionDisplayMode,
  normalizeSlashCommandSkillMode,
  normalizeTabBarPosition,
} from '../../../../src/core/types/settings';
import {
  DEBUG_MODULE_REGISTRY,
  DEFAULT_DEBUG_REFRESH_INTERVAL_MS,
} from '../../../../src/shared/debugModules';

  describe('provider icon variants', () => {
    it('defaults provider icon variant to auto', () => {
      expect(DEFAULT_SETTINGS.providerIconDefaultVariant).toBe('auto');
    });

    it('normalizes LobeHub icon variants and resolved formats', () => {
      expect(normalizeLobehubIconVariant('brand-color')).toBe('brand-color');
      expect(normalizeLobehubIconVariant('invalid')).toBe('auto');
      expect(normalizeProviderIconResolvedFormat('avatar')).toBe('avatar');
      expect(normalizeProviderIconResolvedFormat('jpeg')).toBeUndefined();
    });

    it('preserves provider icon entry variant metadata', () => {
      const normalized = normalizeProviderIconLibrary({
        adobe: [
          {
            id: 'builtin:lobehub:adobe',
            type: 'builtin',
            source: 'lobehub:adobe',
            variant: 'color',
            resolvedVariant: 'color',
            resolvedFormat: 'svg',
            addedAt: 1,
          },
        ],
      });

      expect(normalized.adobe?.[0]).toMatchObject({
        variant: 'color',
        resolvedVariant: 'color',
        resolvedFormat: 'svg',
      });
    });

    it('filters invalid provider icon entries while trimming persisted fields', () => {
      const normalized = normalizeProviderIconLibrary({
        ' openai ': [
          {
            id: ' builtin:lobehub:openai ',
            type: 'builtin',
            source: ' lobehub:openai ',
            mimeType: ' image/svg+xml ',
            cacheFileName: ' openai.svg ',
            resolvedVariant: 'auto',
            addedAt: 1,
          },
          {
            id: 'builtin:bad:openai',
            type: 'builtin',
            source: 'bad:openai',
            addedAt: 2,
          },
          {
            id: 'mapped:openai',
            type: 'invalid',
            source: 'openai',
            addedAt: 3,
          },
        ],
      });

      expect(normalized).toEqual({
        openai: [
          expect.objectContaining({
            id: 'builtin:lobehub:openai',
            type: 'builtin',
            source: 'lobehub:openai',
            mimeType: 'image/svg+xml',
            cacheFileName: 'openai.svg',
            resolvedVariant: undefined,
            addedAt: 1,
          }),
        ],
      });
    });
  });

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
      expect(DEFAULT_SETTINGS.server.local.port).toBe(4196);
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
      expect(DEFAULT_SETTINGS.disabledModelRefs).toEqual([]);
      expect(DEFAULT_SETTINGS.renderUserMarkupAsCodeBlocks).toBe(true);
      expect(DEFAULT_SETTINGS.pluginIsolationMode).toBe('default');
      expect(DEFAULT_SETTINGS.maxTabs).toBe(3);
      expect(DEFAULT_SETTINGS.tabBarPosition).toBe('below-header');
      expect(DEFAULT_SETTINGS.belowHeaderTabBarLayout).toBe('grid');
      expect(DEFAULT_SETTINGS.enableAutoScroll).toBe(true);
      expect(DEFAULT_SETTINGS.chatFontSizePx).toBe(13);
      expect(DEFAULT_SETTINGS.chatAppearance.layout.messagesPaddingTop).toBe(12);
      expect(DEFAULT_SETTINGS.inputPanelTheme).toBe('preset');
      expect(DEFAULT_SETTINGS.chatAppearance.sticky.maskBlur).toBe(24);
      expect(DEFAULT_SETTINGS.chatAppearance.background.imagePath).toBe('');
      expect(DEFAULT_SETTINGS.chatAppearance.background.fitMode).toBe('cover');
      expect(DEFAULT_SETTINGS.chatAppearance.background.opacity).toBe(92);
      expect(DEFAULT_SETTINGS.chatAppearance.background.edgeFade).toBe(28);
      expect(DEFAULT_SETTINGS.chatAppearance.user.radius).toBe(16);
      expect(DEFAULT_SETTINGS.chatAppearance.user.timeFontSize).toBe(11);
      expect(DEFAULT_SETTINGS.chatAppearance.user.timeFontWeight).toBe(400);
      expect(DEFAULT_SETTINGS.chatAppearance.user.timeColor).toBe('var(--text-muted)');
      expect(DEFAULT_SETTINGS.chatAppearance.assistant.backgroundOpacity).toBe(72);
      expect(DEFAULT_SETTINGS.chatAppearance.assistant.metaFontSize).toBe(10);
      expect(DEFAULT_SETTINGS.chatAppearance.assistant.timeFontSize).toBe(10);
      expect(DEFAULT_SETTINGS.chatAppearance.assistant.timeFontWeight).toBe(400);
      expect(DEFAULT_SETTINGS.chatAppearance.assistant.metaColor).toBe('var(--text-muted)');
      expect(DEFAULT_SETTINGS.chatAppearance.assistant.timeColor).toBe('var(--text-muted)');
      expect(DEFAULT_SETTINGS.chatAppearance.assistant.modelIdFontSize).toBe(10);
      expect(DEFAULT_SETTINGS.chatAppearance.assistant.modelIdFontWeight).toBe(400);
      expect(DEFAULT_SETTINGS.chatAppearance.assistant.modelIdColor).toBe('var(--text-faint, var(--text-muted))');
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
      expect(DEFAULT_SETTINGS.inlineSerializedDebugLogArgs).toBe(false);
      expect(DEFAULT_SETTINGS.debugModuleSettings).toEqual(
        Object.fromEntries(DEBUG_MODULE_REGISTRY.map((debugModule) => [debugModule.key, debugModule.defaultEnabled])),
      );
      expect(DEFAULT_SETTINGS.debugRefreshIntervalMs).toBe(DEFAULT_DEBUG_REFRESH_INTERVAL_MS);
      expect(DEFAULT_SETTINGS.debugLogPaths).toEqual({ unix: '', windows: '' });
      expect(DEFAULT_SETTINGS.openInMainTab).toBe(false);
      expect(DEFAULT_SETTINGS.theme).toEqual(getDefaultThemeSettings());
      expect(DEFAULT_SETTINGS.locale).toBe('en');
      expect(DEFAULT_SETTINGS.slashCommandSkillMode).toBe('direct');
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

    it('normalizes slash command skill invocation mode', () => {
      expect(normalizeSlashCommandSkillMode('direct')).toBe('direct');
      expect(normalizeSlashCommandSkillMode('skills-command')).toBe('skills-command');
      expect(normalizeSlashCommandSkillMode('invalid')).toBe('direct');
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

  describe('disabled model ref normalization', () => {
    it('keeps only trimmed provider/model references', () => {
      expect(normalizeDisabledModelRefs([
        ' openai/gpt-4o ',
        'anthropic/claude-3-5-sonnet',
        'openai/gpt-4o',
        'invalid',
        '',
      ])).toEqual([
        'openai/gpt-4o',
        'anthropic/claude-3-5-sonnet',
      ]);
    });

    it('returns an empty list for invalid inputs', () => {
      expect(normalizeDisabledModelRefs(undefined)).toEqual([]);
      expect(normalizeDisabledModelRefs('openai/gpt-4o')).toEqual([]);
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

  describe('question card settings normalization', () => {
    it('normalizes the question card display cluster together', () => {
      expect(normalizeQuestionCardSettings({
        questionDisplayMode: 'single',
        questionCardPosition: 'above_input',
        showAnsweredQuestionCards: false,
      })).toEqual({
        questionDisplayMode: 'single',
        questionCardPosition: 'above_input',
        showAnsweredQuestionCards: false,
      });

      expect(normalizeQuestionCardSettings({
        questionDisplayMode: 'grouped' as never,
        questionCardPosition: 'floating' as never,
        showAnsweredQuestionCards: 'yes' as never,
      })).toEqual({
        questionDisplayMode: 'all',
        questionCardPosition: 'inline',
        showAnsweredQuestionCards: true,
      });
    });
  });

  describe('session defaults normalization', () => {
    it('does not keep plugin-level compaction defaults anymore', () => {
      const settingsRecord = DEFAULT_SETTINGS as Record<string, unknown>;
      expect(settingsRecord.autoCompactionEnabled).toBeUndefined();
      expect(settingsRecord.compactionReservedTokens).toBeUndefined();
    });

    it('normalizes reserved compaction tokens to a positive integer fallback', () => {
      expect(normalizeCompactionReservedTokens(12000.7)).toBe(12001);
      expect(normalizeCompactionReservedTokens(0)).toBe(10000);
      expect(normalizeCompactionReservedTokens('12000')).toBe(10000);
    });

    it('normalizes chat font size to the supported integer range', () => {
      expect(normalizeChatFontSizePx(15.2)).toBe(15);
      expect(normalizeChatFontSizePx(9)).toBe(DEFAULT_SETTINGS.chatFontSizePx);
      expect(normalizeChatFontSizePx('15')).toBe(DEFAULT_SETTINGS.chatFontSizePx);
    });
  });

  describe('model/provider/plugin/debug settings normalization', () => {
    it('normalizes the residual model/provider/plugin/debug cluster together', () => {
      const normalized = normalizeModelProviderPluginDebugSettings({
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
        providerIconColorMode: 'color',
        providerIconDefaultVariant: 'brand-color',
        modelAvailabilitySectionOpen: false,
        modelToolsSectionOpen: 'collapsed' as never,
        inlineSerializedDebugLogArgs: true,
        debugModuleSettings: {
          contextUsage: false,
          streaming: false,
        },
        debugRefreshIntervalMs: 2500,
        debugLogPaths: { unix: '', windows: '' },
        debugLogPath: '/tmp/legacy-debug',
      });

      const expectedDebugLogPaths = { unix: '', windows: '' };
      expectedDebugLogPaths[getCurrentPlatformKey()] = '/tmp/legacy-debug';

      expect(normalized).toMatchObject({
        aiTitleModel: 'openai/gpt-4o-mini',
        disabledModelRefs: ['openai/gpt-4o'],
        renderUserMarkupAsCodeBlocks: false,
        pluginIsolationMode: 'pure',
        providerIconColorMode: 'color',
        providerIconDefaultVariant: 'brand-color',
        modelAvailabilitySectionOpen: false,
        modelToolsSectionOpen: true,
        inlineSerializedDebugLogArgs: true,
        debugModuleSettings: {
          ...DEFAULT_SETTINGS.debugModuleSettings,
          contextUsage: false,
          streaming: false,
        },
        debugRefreshIntervalMs: 2500,
        debugLogPaths: expectedDebugLogPaths,
      });
      expect(normalized.providerIconLibrary.openai?.[0]).toMatchObject({
        variant: 'brand-color',
        resolvedVariant: 'brand-color',
        resolvedFormat: 'svg',
      });
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
      expect(normalizeInputPanelThemeId('liquid-diamond-shuding')).toBe('preset');
      expect(normalizeInputPanelThemeId('liquid-glass-rdev')).toBe('liquid-glass-shuding');
      expect(normalizeInputPanelThemeId('liquid-glass')).toBe('preset');
      expect(normalizeInputPanelThemeId('glass')).toBe('preset');
      expect(normalizeInputPanelThemeId(undefined)).toBe('preset');
    });
  });

  describe('input panel theme helpers', () => {
    it('derives theme families and theme-specific fallbacks', () => {
      expect(getInputPanelThemeFamily('preset')).toBe('preset');
      expect(getInputPanelThemeFamily('glass-refraction-card')).toBe('glass-refraction');
      expect(getInputPanelThemeFamily('liquid-glass-nikdelvin')).toBe('liquid-glass');

      expect(normalizeGlassRefractionInputPanelThemeId('glass-refraction-pill')).toBe('glass-refraction-pill');
      expect(normalizeGlassRefractionInputPanelThemeId('preset')).toBe('glass-refraction-glass');
      expect(normalizeLiquidGlassInputPanelThemeId('liquid-glass-nikdelvin')).toBe('liquid-glass-nikdelvin');
      expect(normalizeLiquidGlassInputPanelThemeId('preset')).toBe('liquid-glass-shuding');
      expect(getInputPanelGlassRefractionVariantId('glass-refraction-card')).toBe('card');
      expect(getInputPanelGlassRefractionVariantId('preset')).toBe('glass');
    });

    it('maps supported liquid glass adapters to and from theme ids', () => {
      expect(getLiquidGlassAdapterIdForInputPanelTheme('liquid-glass-shuding')).toBe('shuding');
      expect(getLiquidGlassAdapterIdForInputPanelTheme('liquid-glass-nikdelvin')).toBe('nikdelvin');
      expect(getLiquidGlassAdapterIdForInputPanelTheme('preset')).toBeNull();

      expect(getInputPanelThemeIdForLiquidGlassAdapter('shuding')).toBe('liquid-glass-shuding');
      expect(getInputPanelThemeIdForLiquidGlassAdapter('nikdelvin')).toBe('liquid-glass-nikdelvin');
      expect(getInputPanelThemeIdForLiquidGlassAdapter('shudingDiamond')).toBe('preset');
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

    it('restores only the supported liquid adapter defaults', () => {
      const normalized = normalizeInputPanelLiquidGlassSettings({});

      expect(normalized).toEqual({
        shuding: getDefaultInputPanelLiquidGlassSettings().shuding,
        nikdelvin: getDefaultInputPanelLiquidGlassSettings().nikdelvin,
        shudingDiamond: getDefaultInputPanelLiquidGlassSettings().shudingDiamond,
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
