/**
 * StorageService unit tests
 */

import { splitPersistedSettings, StorageService } from '../../../../src/core/storage/StorageService';

// Mock Obsidian
const mockAdapter = {
  basePath: '/test/vault',
  exists: jest.fn().mockResolvedValue(false),
  mkdir: jest.fn().mockResolvedValue(undefined),
  write: jest.fn().mockResolvedValue(undefined),
  writeBinary: jest.fn().mockResolvedValue(undefined),
  read: jest.fn().mockResolvedValue('{}'),
  readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
  remove: jest.fn().mockResolvedValue(undefined),
  list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
};

const mockApp = {
  vault: {
    adapter: mockAdapter,
  },
};

const mockPlugin = {
  app: mockApp,
};

let storage: StorageService;

beforeEach(() => {
  storage = new StorageService(mockPlugin as unknown as { app: { vault: { adapter: typeof mockAdapter } } });
  jest.clearAllMocks();
});

describe('StorageService initialization', () => {
  it('should create storage directories', async () => {
    await storage.initialize();

    expect(mockAdapter.mkdir).toHaveBeenCalledWith('.opencodian');
    expect(mockAdapter.mkdir).toHaveBeenCalledWith('.opencodian/sessions');
    expect(mockAdapter.mkdir).toHaveBeenCalledWith('.opencodian/session-metas');
    expect(mockAdapter.mkdir).toHaveBeenCalledWith('.opencodian/theme-backgrounds');
  });

  it('should handle existing directories', async () => {
    mockAdapter.exists.mockResolvedValue(true);

    await storage.initialize();

    expect(mockAdapter.mkdir).not.toHaveBeenCalled();
  });
});

describe('StorageService conversation persistence - saveConversation', () => {
  it('should save conversation metadata', async () => {
      const conversation = {
        id: 'conv-123',
        title: 'Test Conversation',
        createdAt: 1234567890,
        updatedAt: 1234567890,
        openCodeSessionId: 'session-456',
        messages: [],
      };

      await storage.saveConversation(conversation);

      expect(mockAdapter.write).toHaveBeenCalledWith(
        '.opencodian/sessions/conv-123.json',
        expect.stringContaining('Test Conversation')
      );
  });

  it('should include message count in saved data', async () => {
      const conversation = {
        id: 'conv-123',
        title: 'Test',
        createdAt: 1234567890,
        updatedAt: 1234567890,
        openCodeSessionId: 'session-456',
        messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
      };

      await storage.saveConversation(conversation as unknown as { id: string; title: string; createdAt: number; updatedAt: number; openCodeSessionId: string; messages: unknown[] });

      const savedData = JSON.parse(mockAdapter.write.mock.calls[0][1]);
      expect(savedData.messageCount).toBe(2);
  });

  it('writes a lightweight conversation metadata sidecar', async () => {
      const conversation = {
        id: 'conv-meta',
        title: 'Meta conversation',
        createdAt: 1234567890,
        updatedAt: 1234567999,
        openCodeSessionId: 'session-meta',
        messages: [{ id: 'msg-1' }],
      };

      await storage.saveConversation(conversation as unknown as {
        id: string;
        title: string;
        createdAt: number;
        updatedAt: number;
        openCodeSessionId: string;
        messages: unknown[];
      });

      expect(mockAdapter.write).toHaveBeenCalledWith(
        '.opencodian/session-metas/conv-meta.json',
        expect.stringContaining('"messageCount": 1'),
      );
      expect(mockAdapter.write).toHaveBeenCalledWith(
        '.opencodian/session-metas/conv-meta.json',
        expect.stringContaining('"openCodeSessionId": "session-meta"'),
      );
  });

  it('persists user context attachments inside full messages', async () => {
      const conversation = {
        id: 'conv-ctx',
        title: 'Context conversation',
        createdAt: 1234567890,
        updatedAt: 1234567890,
        openCodeSessionId: 'session-ctx',
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'Summarize this',
            timestamp: 1234567890,
            contextAttachments: [
              {
                kind: 'selection',
                path: 'notes/today.md',
                label: 'today.md:3-4',
                mime: 'text/markdown',
                lineRange: { startLine: 3, endLine: 4 },
                textSnapshot: 'Selected text',
              },
            ],
          },
        ],
      };

      await storage.saveConversation(conversation as unknown as {
        id: string;
        title: string;
        createdAt: number;
        updatedAt: number;
        openCodeSessionId: string;
        messages: unknown[];
      });

      const savedData = JSON.parse(mockAdapter.write.mock.calls[0][1]);
      expect(savedData.messages[0].contextAttachments).toEqual([
        {
          kind: 'selection',
          path: 'notes/today.md',
          label: 'today.md:3-4',
          mime: 'text/markdown',
          lineRange: { startLine: 3, endLine: 4 },
          textSnapshot: 'Selected text',
        },
      ]);
  });

  it('persists conversation external context paths', async () => {
      const conversation = {
        id: 'conv-paths',
        title: 'Context paths conversation',
        createdAt: 1234567890,
        updatedAt: 1234567890,
        openCodeSessionId: 'session-paths',
        externalContextPaths: ['notes/alpha.md', 'notes/beta.md'],
        messages: [],
      };

      await storage.saveConversation(conversation as unknown as {
        id: string;
        title: string;
        createdAt: number;
        updatedAt: number;
        openCodeSessionId: string;
        externalContextPaths: string[];
        messages: unknown[];
      });

      const savedData = JSON.parse(mockAdapter.write.mock.calls[0][1]);
      expect(savedData.externalContextPaths).toEqual(['notes/alpha.md', 'notes/beta.md']);
  });
});

describe('StorageService conversation persistence - loadConversation', () => {
  it('should load conversation metadata', async () => {
      const mockData = JSON.stringify({
        id: 'conv-123',
        title: 'Test Conversation',
        createdAt: 1234567890,
        updatedAt: 1234567890,
        messageCount: 5,
      });
      mockAdapter.read.mockResolvedValue(mockData);

      const result = await storage.loadConversation('conv-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('conv-123');
      expect(result?.title).toBe('Test Conversation');
  });

  it('should return null for non-existent conversation', async () => {
      mockAdapter.read.mockRejectedValue(new Error('File not found'));

      const result = await storage.loadConversation('non-existent');

      expect(result).toBeNull();
  });
});

describe('StorageService conversation persistence - loadFullConversation', () => {
  it('should preserve persisted assistant notice messages', async () => {
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        id: 'conv-123',
        title: 'Test Conversation',
        createdAt: 1234567890,
        updatedAt: 1234567999,
        openCodeSessionId: 'session-456',
        messages: [
          {
            id: 'assistant-notice-1',
            role: 'assistant',
            content: 'No local models configured yet.',
            timestamp: 1234567999,
            displayStyle: 'notice',
            noticeTitle: 'No local models available',
            noticeTone: 'warning',
            noticeActions: [{ type: 'open_model_settings' }],
          },
        ],
      }));

      const result = await storage.loadFullConversation('conv-123');

      expect(result).not.toBeNull();
      expect(result?.messages).toHaveLength(1);
      expect(result?.messages[0]).toMatchObject({
        displayStyle: 'notice',
        noticeTitle: 'No local models available',
        noticeTone: 'warning',
        noticeActions: [{ type: 'open_model_settings' }],
      });
  });

  it('restores persisted context attachments after reload', async () => {
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        id: 'conv-ctx',
        title: 'Context Conversation',
        createdAt: 1234567890,
        updatedAt: 1234567999,
        openCodeSessionId: 'session-ctx',
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'Summarize this',
            timestamp: 1234567890,
            contextAttachments: [
              {
                kind: 'file',
                path: 'notes/today.md',
                label: 'today.md',
                mime: 'text/markdown',
              },
            ],
          },
        ],
      }));

      const result = await storage.loadFullConversation('conv-ctx');

      expect(result?.messages[0].contextAttachments).toEqual([
        {
          kind: 'file',
          path: 'notes/today.md',
          label: 'today.md',
          mime: 'text/markdown',
        },
      ]);
  });

  it('restores persisted external context paths after reload', async () => {
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        id: 'conv-paths',
        title: 'Context paths conversation',
        createdAt: 1234567890,
        updatedAt: 1234567999,
        openCodeSessionId: 'session-paths',
        externalContextPaths: ['notes/alpha.md', 'notes/beta.md'],
        messages: [],
      }));

      const result = await storage.loadFullConversation('conv-paths');

      expect(result?.externalContextPaths).toEqual(['notes/alpha.md', 'notes/beta.md']);
  });
});

describe('StorageService conversation session settings', () => {
  it('persists conversation session settings overrides', async () => {
    const conversation = {
      id: 'conv-session-settings',
      title: 'Session settings conversation',
      createdAt: 1234567890,
      updatedAt: 1234567890,
      openCodeSessionId: 'session-settings',
      sessionSettings: {
        chatFontSizePx: 15,
      },
      messages: [],
    };

    await storage.saveConversation(conversation as unknown as {
      id: string;
      title: string;
      createdAt: number;
      updatedAt: number;
      openCodeSessionId: string;
      sessionSettings: unknown;
      messages: unknown[];
    });

    const savedData = JSON.parse(mockAdapter.write.mock.calls[0][1]);
    expect(savedData.sessionSettings).toEqual({
      chatFontSizePx: 15,
    });
  });

  it('restores normalized session settings overrides after reload, dropping legacy compaction fields', async () => {
    mockAdapter.read.mockResolvedValue(JSON.stringify({
      id: 'conv-session-settings',
      title: 'Session settings conversation',
      createdAt: 1234567890,
      updatedAt: 1234567999,
      openCodeSessionId: 'session-settings',
      sessionSettings: {
        autoCompactionEnabled: null,
        compactionReservedTokens: 12000.8,
        chatFontSizePx: 15.2,
      },
      messages: [],
    }));

    const result = await storage.loadFullConversation('conv-session-settings');

    expect(result?.sessionSettings).toEqual({
      chatFontSizePx: 15,
    });
  });
});

describe('StorageService conversation indexes', () => {
  describe('listConversations', () => {
    it('should return sorted conversations', async () => {
      mockAdapter.list.mockImplementation(async (dirPath: string) => {
        if (dirPath === '.opencodian/sessions') {
          return {
            files: ['.opencodian/sessions/conv-1.json', '.opencodian/sessions/conv-2.json'],
            folders: [],
          };
        }

        return { files: [], folders: [] };
      });

      mockAdapter.read.mockImplementation(async (filePath: string) => {
        if (filePath === '.opencodian/session-metas/conv-1.json') {
          throw new Error('meta missing');
        }
        if (filePath === '.opencodian/session-metas/conv-2.json') {
          throw new Error('meta missing');
        }
        if (filePath === '.opencodian/sessions/conv-1.json') {
          return JSON.stringify({
            id: 'conv-1',
            title: 'First',
            createdAt: 1000,
            updatedAt: 3000,
            messageCount: 1,
          });
        }
        if (filePath === '.opencodian/sessions/conv-2.json') {
          return JSON.stringify({
            id: 'conv-2',
            title: 'Second',
            createdAt: 2000,
            updatedAt: 4000,
            messageCount: 2,
          });
        }

        throw new Error(`Unexpected path: ${filePath}`);
      });

      const result = await storage.listConversations();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('conv-2'); // Sorted by updatedAt desc
      expect(result[1].id).toBe('conv-1');
      expect(storage.getConversationListDiagnosticsSnapshot()).toEqual(expect.objectContaining({
        sessionFileCount: 2,
        metadataHitCount: 0,
        fullSessionFallbackCount: 2,
      }));
    });

    it('should handle empty directory', async () => {
      mockAdapter.list.mockResolvedValue({ files: [], folders: [] });

      const result = await storage.listConversations();

      expect(result).toEqual([]);
    });

    it('prefers metadata sidecars over full session reads when available', async () => {
      mockAdapter.list.mockImplementation(async (dirPath: string) => {
        if (dirPath === '.opencodian/sessions') {
          return {
            files: ['.opencodian/sessions/conv-1.json'],
            folders: [],
          };
        }

        return {
          files: ['.opencodian/session-metas/conv-1.json'],
          folders: [],
        };
      });

      mockAdapter.read.mockImplementation(async (filePath: string) => {
        if (filePath === '.opencodian/session-metas/conv-1.json') {
          return JSON.stringify({
            schemaVersion: 1,
            updatedAt: 1,
            data: {
              id: 'conv-1',
              title: 'From meta',
              createdAt: 1000,
              updatedAt: 3000,
              messageCount: 4,
            },
          });
        }

        throw new Error(`Unexpected read: ${filePath}`);
      });

      const result = await storage.listConversations();

      expect(result).toEqual([
        expect.objectContaining({
          id: 'conv-1',
          title: 'From meta',
          messageCount: 4,
        }),
      ]);
      expect(storage.getConversationListDiagnosticsSnapshot()).toEqual(expect.objectContaining({
        sessionFileCount: 1,
        metadataFileCount: 1,
        metadataHitCount: 1,
        fullSessionFallbackCount: 0,
      }));
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation file', async () => {
      await storage.deleteConversation('conv-123');

      expect(mockAdapter.remove).toHaveBeenCalledWith('.opencodian/sessions/conv-123.json');
    });

    it('should not throw for non-existent file', async () => {
      mockAdapter.remove.mockRejectedValue(new Error('File not found'));

      await expect(storage.deleteConversation('non-existent')).resolves.not.toThrow();
    });
  });

});

describe('StorageService persisted core settings', () => {
  describe('persisted settings', () => {
    it('writes core settings as a versioned envelope', async () => {
      const { core } = splitPersistedSettings({
        userName: 'Test User',
        server: {
          mode: 'local',
          local: { host: '127.0.0.1', port: 4096, autoStart: true },
          remote: { baseUrl: 'http://127.0.0.1:4096' },
          auth: { type: 'none', username: 'opencode', password: '', token: '' },
        },
        enableBlocklist: true,
        allowExternalAccess: false,
        blockedCommands: { unix: [], windows: [] },
        permissionMode: 'yolo',
        autoRestartOnPermissionChange: false,
        modelSourceMode: 'merge',
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o',
        titleMode: 'default',
        questionDisplayMode: 'all',
        questionCardPosition: 'inline',
        showAnsweredQuestionCards: true,
        aiTitleModel: '',
        disabledModelRefs: [],
        renderUserMarkupAsCodeBlocks: true,
        pluginIsolationMode: 'default',
        providers: [],
        providerIconLibrary: {
          openai: [
            {
              id: 'builtin:opencode:openai',
              type: 'builtin',
              source: 'opencode:openai',
              mimeType: 'image/svg+xml',
              addedAt: 1,
            },
          ],
        },
        effortLevel: 'high',
        thinkingBudget: 4096,
        excludedTags: [],
        mediaFolder: '',
        systemPrompt: '',
        allowedExportPaths: [],
        maxTabs: 3,
        tabBarPosition: 'below-header',
        belowHeaderTabBarLayout: 'grid',
        enableAutoScroll: true,
        chatFontSizePx: 13,
        chatScrollMode: 'sticky-mask',
        inputPanelTheme: 'preset',
        inputPanelGlassRefraction: { glass: { backgroundOpacity: 1, blur: 1, saturation: 1, brightness: 1 }, card: { backgroundOpacity: 1, blur: 1, saturation: 1, brightness: 1 }, pill: { backgroundOpacity: 1, blur: 1, saturation: 1, brightness: 1 } },
        inputPanelGlassRefractionSvgFilter: { preset: 'none', subtleScale: 8, strongScale: 16 },
        inputPanelGlassRefractionGlassDefaultsVersion: 2,
        inputPanelLiquidGlass: {
          shuding: {
            displacementScale: 10,
            blurAmount: 0.25,
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
            topHighlightOpacity: 0.6,
            innerBorder: false,
            innerBorderOpacity: 0.2,
            bottomShadow: false,
            bottomShadowOpacity: 0.08,
            insetDepthShadow: false,
            insetDepthShadowOpacity: 0.12,
            insetShadowBlur: 10,
            contrastBoost: 1.2,
            brightnessBoost: 1.05,
            saturateBoost: 1.1,
          },
          nikdelvin: {
            depth: 10,
            strength: 100,
            chromaticAberration: 0,
            blur: 0,
            backgroundPreset: 'none',
            color: 'transparent',
            background: '',
            freeze: false,
            noMorph: false,
            button: false,
            inline: false,
            customEffects: false,
          },
          shudingDiamond: {
            displacementScale: 10,
            bloomOpacity: 1,
            rimOpacity: 0.45,
            faceOverlayOpacity: 1,
            sparkleOpacity: 0.35,
            edgeAlpha: 0.9,
            faceAlpha: 0.82,
            rotationSpeed: 1,
            wobbleAmount: 0.4,
            pointerTilt: 0.8,
          },
        },
        chatAppearance: {
          layout: { messagesPaddingTop: 12, messagesPaddingX: 12 },
          sticky: { maskBlur: 24, edgeFade: 24, opacity: 94 },
          background: { imagePath: '', fitMode: 'cover', opacity: 92, edgeFade: 28 },
          user: { radius: 16, timeFontSize: 11, timeFontWeight: 400, timeColor: 'var(--text-muted)' },
          assistant: {
            backgroundOpacity: 72,
            metaFontSize: 10,
            timeFontSize: 10,
            timeFontWeight: 400,
            metaColor: 'var(--text-muted)',
            timeColor: 'var(--text-muted)',
            modelIdFontSize: 10,
            modelIdFontWeight: 400,
            modelIdColor: 'var(--text-faint, var(--text-muted))',
          },
          input: { backgroundOpacity: 72, shadowBlur: 28, actionButtonStyle: 'default' },
          scrollbar: { width: 8, thumbOpacity: 58, thumbHoverOpacity: 82 },
          customCss: '',
        },
        settingsPanelScrollTop: 42,
        modelAvailabilitySectionOpen: true,
        modelToolsSectionOpen: true,
        enableDebugLogging: false,
        inlineSerializedDebugLogArgs: false,
        debugLogPaths: { unix: '', windows: '' },
        openInMainTab: false,
        tabState: { tabs: [], activeTabIndex: 0 },
        theme: { activePresetId: null, customAppearanceOverrides: {} },
        locale: 'en',
        hiddenSlashCommands: [],
      } as never);

      await storage.saveCoreSettings(core);

      expect(mockAdapter.write).toHaveBeenCalledWith(
        '.opencodian/settings.core.json',
        expect.stringContaining('"schemaVersion": 1'),
      );
      expect(mockAdapter.write).toHaveBeenCalledWith(
        '.opencodian/settings.core.json',
        expect.stringContaining('"source": "settings.core"'),
      );
      expect(mockAdapter.write).toHaveBeenCalledWith(
        '.opencodian/settings.core.json',
        expect.stringContaining('"userName": "Test User"'),
      );
    });
  });
});

describe('StorageService persisted ui settings', () => {
  describe('persisted settings', () => {
    it('writes ui settings as a versioned envelope', async () => {
      const { ui } = splitPersistedSettings({
        userName: 'Test User',
        server: {
          mode: 'local',
          local: { host: '127.0.0.1', port: 4096, autoStart: true },
          remote: { baseUrl: 'http://127.0.0.1:4096' },
          auth: { type: 'none', username: 'opencode', password: '', token: '' },
        },
        enableBlocklist: true,
        allowExternalAccess: false,
        blockedCommands: { unix: [], windows: [] },
        permissionMode: 'yolo',
        autoRestartOnPermissionChange: false,
        modelSourceMode: 'merge',
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o',
        titleMode: 'default',
        questionDisplayMode: 'all',
        questionCardPosition: 'inline',
        showAnsweredQuestionCards: true,
        aiTitleModel: '',
        disabledModelRefs: [],
        renderUserMarkupAsCodeBlocks: true,
        pluginIsolationMode: 'default',
        providers: [],
        providerIconLibrary: {},
        effortLevel: 'high',
        thinkingBudget: 4096,
        excludedTags: [],
        mediaFolder: '',
        systemPrompt: '',
        allowedExportPaths: [],
        maxTabs: 3,
        tabBarPosition: 'below-header',
        belowHeaderTabBarLayout: 'grid',
        enableAutoScroll: true,
        chatFontSizePx: 13,
        chatScrollMode: 'sticky-mask',
        inputPanelTheme: 'preset',
        inputPanelGlassRefraction: { glass: { backgroundOpacity: 1, blur: 1, saturation: 1, brightness: 1 }, card: { backgroundOpacity: 1, blur: 1, saturation: 1, brightness: 1 }, pill: { backgroundOpacity: 1, blur: 1, saturation: 1, brightness: 1 } },
        inputPanelGlassRefractionSvgFilter: { preset: 'none', subtleScale: 8, strongScale: 16 },
        inputPanelGlassRefractionGlassDefaultsVersion: 2,
        inputPanelLiquidGlass: {
          shuding: {
            displacementScale: 10,
            blurAmount: 0.25,
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
            topHighlightOpacity: 0.6,
            innerBorder: false,
            innerBorderOpacity: 0.2,
            bottomShadow: false,
            bottomShadowOpacity: 0.08,
            insetDepthShadow: false,
            insetDepthShadowOpacity: 0.12,
            insetShadowBlur: 10,
            contrastBoost: 1.2,
            brightnessBoost: 1.05,
            saturateBoost: 1.1,
          },
          nikdelvin: {
            depth: 10,
            strength: 100,
            chromaticAberration: 0,
            blur: 0,
            backgroundPreset: 'none',
            color: 'transparent',
            background: '',
            freeze: false,
            noMorph: false,
            button: false,
            inline: false,
            customEffects: false,
          },
          shudingDiamond: {
            displacementScale: 10,
            bloomOpacity: 1,
            rimOpacity: 0.45,
            faceOverlayOpacity: 1,
            sparkleOpacity: 0.35,
            edgeAlpha: 0.9,
            faceAlpha: 0.82,
            rotationSpeed: 1,
            wobbleAmount: 0.4,
            pointerTilt: 0.8,
          },
        },
        chatAppearance: {
          layout: { messagesPaddingTop: 12, messagesPaddingX: 12 },
          sticky: { maskBlur: 24, edgeFade: 24, opacity: 94 },
          background: { imagePath: '', fitMode: 'cover', opacity: 92, edgeFade: 28 },
          user: { radius: 16, timeFontSize: 11, timeFontWeight: 400, timeColor: 'var(--text-muted)' },
          assistant: {
            backgroundOpacity: 72,
            metaFontSize: 10,
            timeFontSize: 10,
            timeFontWeight: 400,
            metaColor: 'var(--text-muted)',
            timeColor: 'var(--text-muted)',
            modelIdFontSize: 10,
            modelIdFontWeight: 400,
            modelIdColor: 'var(--text-faint, var(--text-muted))',
          },
          input: { backgroundOpacity: 72, shadowBlur: 28, actionButtonStyle: 'default' },
          scrollbar: { width: 8, thumbOpacity: 58, thumbHoverOpacity: 82 },
          customCss: '',
        },
        settingsPanelScrollTop: 42,
        modelAvailabilitySectionOpen: true,
        modelToolsSectionOpen: false,
        enableDebugLogging: false,
        inlineSerializedDebugLogArgs: false,
        debugLogPaths: { unix: '', windows: '' },
        openInMainTab: false,
        tabState: {
          tabs: [{ conversationId: 'conv-1', title: 'Conversation', modelOverride: null }],
          activeTabIndex: 0,
        },
        theme: { activePresetId: null, customAppearanceOverrides: {} },
        locale: 'en',
        hiddenSlashCommands: [],
      } as never);

      await storage.saveUiSettings(ui);

      expect(mockAdapter.write).toHaveBeenCalledWith(
        '.opencodian/settings.ui.json',
        expect.stringContaining('"schemaVersion": 1'),
      );
      expect(mockAdapter.write).toHaveBeenCalledWith(
        '.opencodian/settings.ui.json',
        expect.stringContaining('"source": "settings.ui"'),
      );
      expect(mockAdapter.write).toHaveBeenCalledWith(
        '.opencodian/settings.ui.json',
        expect.stringContaining('"settingsPanelScrollTop": 42'),
      );
    });
  });
});

describe('StorageService persisted settings recovery', () => {
  describe('persisted settings', () => {
    it('loads split settings from primary files', async () => {
      mockAdapter.exists.mockImplementation(async (filePath: string) => (
        filePath === '.opencodian/settings.core.json' || filePath === '.opencodian/settings.ui.json'
      ));
      mockAdapter.read.mockImplementation(async (filePath: string) => {
        if (filePath === '.opencodian/settings.core.json') {
          return JSON.stringify({
            schemaVersion: 1,
            updatedAt: 1,
            source: 'settings.core',
            data: {
              defaultProvider: 'openai',
              providerIconLibrary: {
                openai: [
                  {
                    id: 'builtin:opencode:openai',
                    type: 'builtin',
                    source: 'opencode:openai',
                    mimeType: 'image/svg+xml',
                    addedAt: 1,
                  },
                ],
              },
            },
          });
        }

        return JSON.stringify({
          schemaVersion: 1,
          updatedAt: 1,
          source: 'settings.ui',
          data: {
            settingsPanelScrollTop: 55,
            modelAvailabilitySectionOpen: false,
          },
        });
      });

      const result = await storage.loadPersistedSettings();

      expect(result.writable).toBe(true);
      expect(result.core.source).toBe('primary');
      expect(result.ui.source).toBe('primary');
      expect(result.core.data).toEqual(expect.objectContaining({
        defaultProvider: 'openai',
        providerIconLibrary: expect.objectContaining({
          openai: [
            expect.objectContaining({
              type: 'builtin',
              source: 'opencode:openai',
            }),
          ],
        }),
      }));
      expect(result.ui.data).toEqual(expect.objectContaining({
        settingsPanelScrollTop: 55,
        modelAvailabilitySectionOpen: false,
      }));
    });

    it('recovers from backup when the primary file is invalid', async () => {
      mockAdapter.exists.mockImplementation(async (filePath: string) => (
        filePath === '.opencodian/settings.core.json'
        || filePath === '.opencodian/settings.core.json.bak'
      ));
      mockAdapter.read.mockImplementation(async (filePath: string) => {
        if (filePath === '.opencodian/settings.core.json') {
          return '{invalid json';
        }

        return JSON.stringify({
          schemaVersion: 1,
          updatedAt: 1,
          source: 'settings.core',
          data: {
            defaultModel: 'gpt-4o',
            disabledModelRefs: ['openai/gpt-4o-mini'],
          },
        });
      });

      const result = await storage.loadPersistedSettings();

      expect(result.writable).toBe(true);
      expect(result.core.source).toBe('backup');
      expect(result.core.shouldPersist).toBe(true);
      expect(result.core.message).toContain('Recovered .opencodian/settings.core.json from backup');
      expect(result.core.data).toEqual(expect.objectContaining({
        defaultModel: 'gpt-4o',
        disabledModelRefs: ['openai/gpt-4o-mini'],
      }));
    });
  });
});

describe('StorageService persisted settings migration', () => {
  describe('persisted settings', () => {
    it('migrates settings from the legacy single-file store', async () => {
      mockAdapter.exists.mockImplementation(async (filePath: string) => filePath === '.opencodian/settings.json');
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        defaultProvider: 'deepseek',
        defaultModel: 'deepseek-chat',
        providerIconLibrary: {
          deepseek: [
            {
              id: 'mapped:deepseek',
              type: 'mapped',
              source: 'deepseek',
              mimeType: 'image/svg+xml',
              addedAt: 0,
            },
          ],
        },
        chatAppearance: {
          background: { imagePath: 'wallpaper.png', fitMode: 'contain', opacity: 88, edgeFade: 10 },
        },
        disabledModelRefs: ['deepseek/deepseek-coder'],
        tabState: {
          tabs: [{ conversationId: 'conv-1', title: 'A', modelOverride: null }],
          activeTabIndex: 0,
        },
        settingsPanelScrollTop: 91,
        modelAvailabilitySectionOpen: false,
      }));

      const result = await storage.loadPersistedSettings();

      expect(result.writable).toBe(true);
      expect(result.shouldPersist).toBe(true);
      expect(result.core.source).toBe('legacy');
      expect(result.ui.source).toBe('legacy');
      expect(result.core.message).toBe('Migrated .opencodian/settings.core.json from legacy settings.json.');
      expect(result.ui.message).toBe('Migrated .opencodian/settings.ui.json from legacy settings.json.');
      expect(result.core.data).toEqual(expect.objectContaining({
        defaultProvider: 'deepseek',
        defaultModel: 'deepseek-chat',
        providerIconLibrary: expect.objectContaining({
          deepseek: [
            expect.objectContaining({
              type: 'mapped',
              source: 'deepseek',
            }),
          ],
        }),
        disabledModelRefs: ['deepseek/deepseek-coder'],
      }));
      expect(result.ui.data).toEqual(expect.objectContaining({
        settingsPanelScrollTop: 91,
        modelAvailabilitySectionOpen: false,
      }));
    });

    it('blocks writes when no valid settings copy can be recovered', async () => {
      mockAdapter.exists.mockImplementation(async (filePath: string) => filePath === '.opencodian/settings.core.json');
      mockAdapter.read.mockImplementation(async () => '{broken');

      const result = await storage.loadPersistedSettings();

      expect(result.writable).toBe(false);
      expect(result.core.source).toBe('blocked');
      expect(result.core.data).toBeNull();
    });
  });
});

describe('StorageService runtime assets', () => {
  describe('managed server state', () => {
    it('should persist managed server state to runtime file', async () => {
      await storage.saveManagedServerState({
        pid: 12345,
        host: '127.0.0.1',
        port: 5090,
      });

      expect(mockAdapter.write).toHaveBeenCalledWith(
        '.opencodian/runtime.json',
        expect.stringContaining('"pid": 12345'),
      );
    });

    it('should load managed server state from runtime file', async () => {
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        managedServer: {
          pid: 54321,
          host: '127.0.0.1',
          port: 4096,
        },
      }));

      const result = await storage.loadManagedServerState();

      expect(result).toEqual({
        pid: 54321,
        host: '127.0.0.1',
        port: 4096,
      });
    });
  });

  describe('theme background assets', () => {
    it('writes uploaded background images to the dedicated cache directory', async () => {
      const pngData = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]).buffer;

      const asset = await storage.saveThemeBackgroundAsset(pngData, 'sunset.png', 'image/png');

      expect(asset.mimeType).toBe('image/png');
      expect(asset.displayName).toBe('sunset.png');
      expect(asset.path).toMatch(/^\.opencodian\/theme-backgrounds\/theme-bg-/);
      expect(mockAdapter.writeBinary).toHaveBeenCalledWith(asset.path, pngData);
    });

    it('reads a stored background image back as a data URL', async () => {
      const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]).buffer;
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.readBinary.mockResolvedValue(pngBytes);

      const dataUrl = await storage.readThemeBackgroundDataUrl(
        '.opencodian/theme-backgrounds/theme-bg-test.png',
        'image/png',
      );

      expect(dataUrl).toBe('data:image/png;base64,iVBORw==');
    });

    it('rejects uploaded background images larger than 64 MB', async () => {
      const oversizedBuffer = {
        byteLength: (64 * 1024 * 1024) + 1,
      } as ArrayBuffer;

      await expect(
        storage.saveThemeBackgroundAsset(oversizedBuffer, 'too-large.jpg', 'image/jpeg'),
      ).rejects.toThrow('The background image is too large. Maximum size is 64 MB.');
    });
  });
});
