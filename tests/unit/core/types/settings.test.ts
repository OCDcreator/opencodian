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
  isValidChatAppearanceCustomCssDeclarations,
  normalizeBelowHeaderTabBarLayout,
  normalizeChatAppearanceSettings,
  normalizeTabBarPosition,
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
      expect(DEFAULT_SETTINGS.pluginIsolationMode).toBe('default');
      expect(DEFAULT_SETTINGS.maxTabs).toBe(3);
      expect(DEFAULT_SETTINGS.tabBarPosition).toBe('below-header');
      expect(DEFAULT_SETTINGS.belowHeaderTabBarLayout).toBe('grid');
      expect(DEFAULT_SETTINGS.enableAutoScroll).toBe(true);
      expect(DEFAULT_SETTINGS.chatAppearance.layout.messagesPaddingTop).toBe(12);
      expect(DEFAULT_SETTINGS.chatAppearance.sticky.maskBlur).toBe(24);
      expect(DEFAULT_SETTINGS.chatAppearance.user.radius).toBe(16);
      expect(DEFAULT_SETTINGS.chatAppearance.assistant.backgroundOpacity).toBe(72);
      expect(DEFAULT_SETTINGS.chatAppearance.input.shadowBlur).toBe(28);
      expect(DEFAULT_SETTINGS.chatAppearance.scrollbar.width).toBe(8);
      expect(DEFAULT_SETTINGS.chatAppearance.scrollbar.thumbHoverOpacity).toBe(82);
      expect(DEFAULT_SETTINGS.settingsPanelScrollTop).toBe(0);
      expect(DEFAULT_SETTINGS.debugLogPaths).toEqual({ unix: '', windows: '' });
      expect(DEFAULT_SETTINGS.openInMainTab).toBe(false);
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
      defaultsA.scrollbar.width = 12;

      expect(defaultsB.layout.messagesPaddingTop).toBe(12);
      expect(defaultsB.scrollbar.width).toBe(8);
    });

    it('should merge partial chat appearance settings with defaults', () => {
      const normalized = normalizeChatAppearanceSettings({
        layout: { messagesPaddingTop: 24 },
        assistant: { blur: 4 },
        scrollbar: { width: 10, thumbOpacity: 80 },
      });

      expect(normalized.layout.messagesPaddingTop).toBe(24);
      expect(normalized.layout.messagesPaddingX).toBe(16);
      expect(normalized.assistant.blur).toBe(4);
      expect(normalized.assistant.radius).toBe(14);
      expect(normalized.scrollbar.width).toBe(10);
      expect(normalized.scrollbar.thumbOpacity).toBe(80);
      expect(normalized.scrollbar.trackOpacity).toBe(22);
      expect(normalized.advanced.customCssDeclarations).toBe('');
    });

    it('should validate custom CSS declarations', () => {
      expect(isValidChatAppearanceCustomCssDeclarations('--foo: 1; backdrop-filter: blur(10px);')).toBe(true);
      expect(isValidChatAppearanceCustomCssDeclarations('.opencodian-container { color: red; }')).toBe(false);
      expect(isValidChatAppearanceCustomCssDeclarations('<style>color: red;</style>')).toBe(false);
    });
  });
});
