/**
 * OpenCodian - Obsidian plugin entry point
 * 
 * Registers the sidebar chat view, settings tab, and commands.
 * Manages conversation persistence and server lifecycle.
 */

import * as fs from 'fs';
import type { Editor, MarkdownView } from 'obsidian';
import { addIcon, Notice, Plugin } from 'obsidian';
import * as path from 'path';

import { ModelConfigService, OpencodeConfigManager } from './core/config';
import { OpenCodeService, SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from './core/opencode';
import { splitPersistedSettings, StorageService } from './core/storage';
import {
  areChatAppearanceSettingsEqual,
  getThemeAppearanceOverridesFromBase,
  getThemePresetDefinition,
  resolveThemeChatAppearance,
} from './core/theme';
import type {
  ChatAppearanceSettings,
  Conversation,
  OpenCodianSettings,
  PlatformDebugLogPaths,
  ThemePresetDefinition,
  ThemePresetId,
} from './core/types';
import {
  DEFAULT_SETTINGS,
  getCurrentPlatformDebugLogPath,
  getCurrentPlatformKey,
  getDefaultChatAppearanceSettings,
  getDefaultInputPanelGlassRefractionSettings,
  getDefaultInputPanelGlassRefractionSvgFilterSettings,
  getDefaultInputPanelLiquidGlassSettings,
  getDefaultPersistedTabState,
  getDefaultThemeSettings,
  getServerBaseUrl,
  isLocalServerMode,
  OPENCODE_LEGACY_LOCAL_DEFAULT_PORT,
  OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST,
  OPENCODIAN_LOCAL_SIDECAR_DEFAULT_PORT,
  normalizeBelowHeaderTabBarLayout,
  normalizeChatAppearanceSettings,
  normalizeDisabledModelRefs,
  normalizeEffortLevel,
  normalizeInputPanelGlassRefractionSettings,
  normalizeInputPanelGlassRefractionSvgFilterSettings,
  normalizeInputPanelLiquidGlassSettings,
  normalizeInputPanelThemeId,
  normalizePersistedTabState,
  normalizePluginIsolationMode,
  normalizeProviderIconColorMode,
  normalizeProviderIconLibrary,
  normalizeQuestionCardPosition,
  normalizeQuestionDisplayMode,
  normalizeTabBarPosition,
  normalizeThemeSettings,
  normalizeThinkingBudget,
  normalizeTitleMode,
  VIEW_TYPE_OPENCODIAN,
} from './core/types';
import { OpenCodianView } from './features/chat/OpenCodianView';
import { OpenCodianSettingTab } from './features/settings/OpenCodianSettings';
import { setLocale, t } from './i18n';
import {
  createLogger,
  getRecentLogText,
  getVaultBasePath,
  setDebugLoggingEnabled,
  setInlineSerializedDebugLogArgsEnabled,
} from './shared';
import { registerBuiltinGlassAdapters } from './utils/glass';

const logger = createLogger('OpenCodian');
const INPUT_PANEL_GLASS_REFRACTION_GLASS_DEFAULTS_VERSION = 2;
const OPENCODIAN_APP_ICON = 'opencodian-app-icon';
const OPENCODIAN_APP_ICON_SVG = `
  <g class="opencodian-app-icon-layer opencodian-app-icon-layer--light">
    <rect x="10" y="0" width="80" height="100" fill="#211E1E"/>
    <rect x="30" y="40" width="40" height="40" fill="#CFCECD"/>
  </g>
  <g class="opencodian-app-icon-layer opencodian-app-icon-layer--dark">
    <rect x="10" y="0" width="80" height="100" fill="#F1ECEC"/>
    <rect x="30" y="40" width="40" height="40" fill="#4B4646"/>
  </g>
`;

function isLegacyNikdelvinDefaultProfile(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const legacyKeys = ['depth', 'strength', 'chromaticAberration', 'blur'];
  const hasOnlyLegacyKeys = keys.every((key) => legacyKeys.includes(key));
  const transitionalKeys = [
    'depth',
    'strength',
    'chromaticAberration',
    'blur',
    'backgroundPreset',
    'color',
    'background',
    'freeze',
    'noMorph',
    'button',
    'inline',
    'customEffects',
  ];
  const hasOnlyTransitionalKeys = keys.every((key) => transitionalKeys.includes(key));

  const matchesLegacyProfile = hasOnlyLegacyKeys
    && candidate.depth === 10
    && candidate.strength === 100
    && candidate.chromaticAberration === 2
    && candidate.blur === 0;

  const matchesTransitionalProfile = hasOnlyTransitionalKeys
    && candidate.depth === 10
    && candidate.strength === 100
    && candidate.chromaticAberration === 0
    && candidate.blur === 0
    && candidate.backgroundPreset === 'none'
    && candidate.color === 'transparent'
    && candidate.background === ''
    && candidate.freeze === false
    && candidate.noMorph === false
    && candidate.button === false
    && candidate.inline === false
    && candidate.customEffects === false;

  return matchesLegacyProfile || matchesTransitionalProfile;
}

// BUILD_ID is injected at build time via esbuild define
declare const BUILD_ID: string;

/** Main plugin class */
export default class OpenCodianPlugin extends Plugin {
  settings: OpenCodianSettings;
  storage: StorageService;
  openCodeService: OpenCodeService;
  opencodeConfigManager: OpencodeConfigManager | null = null;
  modelConfigService: ModelConfigService | null = null;
  settingsTab?: InstanceType<typeof OpenCodianSettingTab>;
  
  private conversations: Conversation[] = [];
  private conversationsLoaded = false;
  private conversationsLoadPromise: Promise<void> | null = null;
  private chatAppearanceSaveTimeoutId: number | null = null;
  private settingsUiStateSaveTimeoutId: number | null = null;
  private modelRefreshFrameId: number | null = null;
  private themeBackgroundDataUrlCache = new Map<string, string | null>();
  private themeBackgroundDataUrlRequests = new Map<string, Promise<string | null>>();
  private settingsPersistenceWritable = true;
  private settingsPersistenceWarningShown = false;

  async onload() {
    // Output BUILD_ID for debugging (always visible)
    logger.info(`OpenCodian BUILD_ID: ${BUILD_ID}`);
    addIcon(OPENCODIAN_APP_ICON, OPENCODIAN_APP_ICON_SVG);

    // Initialize storage
    this.storage = new StorageService(this);
    await this.storage.initialize();

    // Load settings
    await this.loadSettings();
    registerBuiltinGlassAdapters();
    this.applyLoggerSettings();
    this.applyProviderIconColorMode();

    // Initialize locale
    setLocale(this.settings.locale as 'en' | 'zh');

    const initialManagedServerState = await this.storage.loadManagedServerState();

    // Auto-create OpenCode config file based on permission mode
    await this.initializeOpencodeConfig();

    // Initialize OpenCode service
    this.openCodeService = new OpenCodeService(
      this.settings,
      {
        onServerStatusChange: (status) => {
          logger.debug(`Server status changed: ${status}`);
          this.settingsTab?.refreshServerStatusDisplay();
        },
        onError: (error) => {
          new Notice(`OpenCode error: ${error.message}`);
        },
        onModelsLoaded: (_providers) => {
          this.handleModelsLoaded();
        },
      },
      {
        initialManagedServerState,
        sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
        onManagedServerStateChange: (state) => {
          void this.storage.saveManagedServerState(state);
        },
      },
    );

    // Set vault path so OpenCode reads project config from .opencode/
    // This automatically adapts to Windows (C:\path) and macOS (/Users/path)
    const vaultPath = getVaultBasePath(this.app);
    if (vaultPath) {
      this.opencodeConfigManager = new OpencodeConfigManager(vaultPath);
      this.modelConfigService = new ModelConfigService(this.opencodeConfigManager, this.openCodeService);
      this.openCodeService.setVaultPath(vaultPath);
      logger.debug(`Vault path set to: ${vaultPath}`);
      logger.debug(`Platform: ${process.platform}`);
    } else {
      this.opencodeConfigManager = null;
      this.modelConfigService = null;
      logger.warn('Could not get vault path, OpenCode will use global config');
    }

    // Start server if auto-start is enabled
    if (isLocalServerMode(this.settings.server) && this.settings.server.local.autoStart) {
      try {
        await this.openCodeService.start();
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to start server';
        new Notice(`OpenCode: ${msg}`);
      }
    }

    await this.logServerStatusSnapshot('onload');

    // Load conversations before restoring any existing OpenCodian view.
    await this.loadConversations();

    // Register view
    this.registerView(
      VIEW_TYPE_OPENCODIAN,
      (leaf) => new OpenCodianView(leaf, this)
    );

    // Add ribbon icon
    this.addRibbonIcon(OPENCODIAN_APP_ICON, '打开 OpenCodian', () => {
      this.activateView();
    });

    // Register commands
    this.addCommand({
      id: 'open-view',
      name: '打开聊天视图',
      callback: () => {
        this.activateView();
      },
    });

    this.addCommand({
      id: 'new-conversation',
      name: '新建会话',
      callback: async () => {
        await this.createConversation();
      },
    });

    this.addCommand({
      id: 'toggle-liquid-diamond-demo',
      name: '切换钻石演示',
      callback: async () => {
        await this.toggleLiquidDiamondDemoForCurrentView();
      },
    });

    this.addCommand({
      id: 'toggle-liquid-diamond-demo-webgl',
      name: '切换钻石演示（WebGL）',
      callback: async () => {
        await this.toggleLiquidDiamondWebGlDemoForCurrentView();
      },
    });

    this.addCommand({
      id: 'toggle-glass-octahedron',
      name: '切换玻璃正八面体',
      callback: async () => {
        await this.toggleGlassOctahedronForCurrentView();
      },
    });

    this.addCommand({
      id: 'inline-edit',
      name: '行内编辑',
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const selectedText = editor.getSelection();
        const notePath = view.file?.path || '未知笔记';

        // TODO: Implement inline edit modal
        new Notice(
          '行内编辑：'
          + (selectedText ? '选区' : '光标')
          + '，位置 '
          + notePath,
        );
      },
    });

    this.addCommand({
      id: 'add-current-note-to-context',
      name: '将当前笔记添加到 OpenCodian 上下文',
      callback: async () => {
        await this.activateView();
        await this.getOpenCodianView()?.addCurrentNoteContextFromActiveEditor();
      },
    });

    this.addCommand({
      id: 'add-selection-to-context',
      name: '将选区添加到 OpenCodian 上下文',
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        await this.activateView();
        await this.getOpenCodianView()?.addSelectionContextFromActiveEditor(editor, view);
      },
    });

    // Add settings tab
    this.settingsTab = new OpenCodianSettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);

  }

  onunload() {
    this.openCodeService?.dispose();
    void this.openCodeService?.stop().catch((error) => {
      logger.warn('Failed to asynchronously stop OpenCode service during unload:', error);
    });
    this.clearChatAppearanceSaveTimer();
    this.clearQueuedModelRefresh();
    delete document.body.dataset.opencodianProviderIconMode;

  }

  /** Activate the chat view */
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN)[0];

    if (!leaf) {
      const newLeaf = this.settings.openInMainTab
        ? workspace.getLeaf('tab')
        : workspace.getRightLeaf(false);
      if (newLeaf) {
        await newLeaf.setViewState({
          type: VIEW_TYPE_OPENCODIAN,
          active: true,
        });
        leaf = newLeaf;
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  private getOpenCodianView(): OpenCodianView | null {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN)[0];
    return leaf?.view instanceof OpenCodianView
      ? leaf.view
      : null;
  }

  async toggleLiquidDiamondDemoForCurrentView(): Promise<void> {
    await this.activateView();
    this.getOpenCodianView()?.toggleLiquidDiamondDemo();
  }

  async toggleLiquidDiamondWebGlDemoForCurrentView(): Promise<void> {
    await this.activateView();
    this.getOpenCodianView()?.toggleLiquidDiamondWebGlDemo();
  }

  async toggleGlassOctahedronForCurrentView(): Promise<void> {
    await this.activateView();
    await this.getOpenCodianView()?.toggleGlassOctahedron();
  }

  /** Load settings from storage */
  async loadSettings() {
    const persistedSettings = await this.storage.loadPersistedSettings();
    const savedSettings =
      persistedSettings.core.data || persistedSettings.ui.data
        ? ({
            ...(persistedSettings.core.data ?? {}),
            ...(persistedSettings.ui.data ?? {}),
          } as Partial<OpenCodianSettings>)
        : null;
    this.settingsPersistenceWritable = persistedSettings.writable;
    const savedDebugLogPaths =
      savedSettings && typeof savedSettings === 'object' && 'debugLogPaths' in savedSettings
        ? (savedSettings as { debugLogPaths?: Partial<PlatformDebugLogPaths> }).debugLogPaths
        : undefined;
    const legacyDebugLogPath =
      savedSettings && typeof savedSettings === 'object' && 'debugLogPath' in savedSettings
        ? (savedSettings as { debugLogPath?: unknown }).debugLogPath
        : undefined;
    const normalizedDebugLogPaths: PlatformDebugLogPaths = {
      ...DEFAULT_SETTINGS.debugLogPaths,
      ...savedDebugLogPaths,
    };

    if (
      typeof legacyDebugLogPath === 'string' &&
      legacyDebugLogPath.trim().length > 0 &&
      !normalizedDebugLogPaths[getCurrentPlatformKey()]
    ) {
      normalizedDebugLogPaths[getCurrentPlatformKey()] = legacyDebugLogPath.trim();
    }

    const legacyServer =
      savedSettings && typeof savedSettings === 'object' && 'server' in savedSettings
        ? (savedSettings as {
            server?:
              | Partial<OpenCodianSettings['server']>
              | { host?: string; port?: number; autoStart?: boolean };
          }).server
        : undefined;
    const normalizedServer = (() => {
      const defaultServer = DEFAULT_SETTINGS.server;

      if (!legacyServer || typeof legacyServer !== 'object') {
        return defaultServer;
      }

      const hasNestedServer =
        'mode' in legacyServer || 'local' in legacyServer || 'remote' in legacyServer || 'auth' in legacyServer;

      if (hasNestedServer) {
        const nestedServer = legacyServer as Partial<OpenCodianSettings['server']>;
        return {
          ...defaultServer,
          ...nestedServer,
          local: {
            ...defaultServer.local,
            ...(nestedServer.local ?? {}),
          },
          remote: {
            ...defaultServer.remote,
            ...(nestedServer.remote ?? {}),
          },
          auth: {
            ...defaultServer.auth,
            ...(nestedServer.auth ?? {}),
          },
        };
      }

      const flatServer = legacyServer as { host?: string; port?: number; autoStart?: boolean };
      const legacyHost = typeof flatServer.host === 'string' && flatServer.host.trim()
        ? flatServer.host.trim()
        : defaultServer.local.host;
      const legacyPort = typeof flatServer.port === 'number' ? flatServer.port : defaultServer.local.port;
      const legacyAutoStart = typeof flatServer.autoStart === 'boolean'
        ? flatServer.autoStart
        : defaultServer.local.autoStart;

      return {
        ...defaultServer,
        mode: 'local' as const,
        local: {
          host: legacyHost,
          port: legacyPort,
          autoStart: legacyAutoStart,
        },
        remote: {
          baseUrl: `http://${legacyHost}:${legacyPort}`,
        },
      };
    })();
    const shouldMigrateLegacyLocalDefaultPort = Boolean(
      savedSettings
      && normalizedServer.mode === 'local'
      && normalizedServer.local.host === OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST
      && normalizedServer.local.port === OPENCODE_LEGACY_LOCAL_DEFAULT_PORT
      && normalizedServer.local.autoStart === DEFAULT_SETTINGS.server.local.autoStart
      && normalizedServer.remote.baseUrl === `http://${OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST}:${OPENCODE_LEGACY_LOCAL_DEFAULT_PORT}`,
    );
    if (shouldMigrateLegacyLocalDefaultPort) {
      normalizedServer.local = {
        ...normalizedServer.local,
        port: OPENCODIAN_LOCAL_SIDECAR_DEFAULT_PORT,
      };
    }
    const hasSavedChatAppearance =
      Boolean(savedSettings && typeof savedSettings === 'object' && 'chatAppearance' in savedSettings);
    const savedChatAppearance =
      hasSavedChatAppearance
        ? (savedSettings as { chatAppearance?: Partial<OpenCodianSettings['chatAppearance']> }).chatAppearance
        : undefined;
    const normalizedSavedChatAppearance = normalizeChatAppearanceSettings(savedChatAppearance);
    const hasSavedTheme =
      Boolean(savedSettings && typeof savedSettings === 'object' && 'theme' in savedSettings);
    const savedTheme =
      hasSavedTheme
        ? (savedSettings as { theme?: Partial<OpenCodianSettings['theme']> }).theme
        : undefined;
    const normalizedTheme = (() => {
      if (!savedSettings) {
        return getDefaultThemeSettings();
      }

      if (!hasSavedTheme) {
        if (
          hasSavedChatAppearance
          && !areChatAppearanceSettingsEqual(normalizedSavedChatAppearance, getDefaultChatAppearanceSettings())
        ) {
          return {
            activePresetId: null,
            customAppearanceOverrides: {},
          } satisfies OpenCodianSettings['theme'];
        }

        return getDefaultThemeSettings();
      }

      const baseTheme = normalizeThemeSettings(savedTheme);
      if (!baseTheme.activePresetId) {
        return {
          activePresetId: null,
          customAppearanceOverrides: {},
        } satisfies OpenCodianSettings['theme'];
      }

      const preset = getThemePresetDefinition(baseTheme.activePresetId);
      if (!preset) {
        return {
          activePresetId: null,
          customAppearanceOverrides: {},
        } satisfies OpenCodianSettings['theme'];
      }

      const effectiveAppearance = hasSavedChatAppearance
        ? normalizedSavedChatAppearance
        : resolveThemeChatAppearance(baseTheme);

      return {
        activePresetId: preset.id,
        customAppearanceOverrides: getThemeAppearanceOverridesFromBase(preset.appearance, effectiveAppearance),
      } satisfies OpenCodianSettings['theme'];
    })();
    const normalizedChatAppearance = (() => {
      const themeResolvedAppearance = normalizedTheme.activePresetId
        ? resolveThemeChatAppearance(normalizedTheme)
        : normalizedSavedChatAppearance;

      if (!hasSavedChatAppearance) {
        return themeResolvedAppearance;
      }

      return normalizeChatAppearanceSettings({
        ...themeResolvedAppearance,
        background: normalizedSavedChatAppearance.background,
      });
    })();
    const savedTabState =
      savedSettings && typeof savedSettings === 'object' && 'tabState' in savedSettings
        ? (savedSettings as { tabState?: Partial<OpenCodianSettings['tabState']> }).tabState
        : undefined;
    const normalizedTabState = normalizePersistedTabState(savedTabState);
    const savedProviderIconLibrary =
      savedSettings && typeof savedSettings === 'object' && 'providerIconLibrary' in savedSettings
        ? (savedSettings as { providerIconLibrary?: OpenCodianSettings['providerIconLibrary'] }).providerIconLibrary
        : undefined;
    const normalizedProviderIconLibrary = normalizeProviderIconLibrary(savedProviderIconLibrary);
    const savedGlassDefaultsVersion =
      savedSettings
      && typeof savedSettings === 'object'
      && 'inputPanelGlassRefractionGlassDefaultsVersion' in savedSettings
      && Number.isFinite(savedSettings.inputPanelGlassRefractionGlassDefaultsVersion)
        ? Number(savedSettings.inputPanelGlassRefractionGlassDefaultsVersion)
        : 0;
    const shouldResetGlassTierDefaults = savedGlassDefaultsVersion < 1;
    const shouldResetCardAndPillTierDefaults =
      savedGlassDefaultsVersion < INPUT_PANEL_GLASS_REFRACTION_GLASS_DEFAULTS_VERSION;
    const shouldResetGlassRefractionGlassDefaults =
      shouldResetGlassTierDefaults || shouldResetCardAndPillTierDefaults;
    const defaultInputPanelGlassRefraction = getDefaultInputPanelGlassRefractionSettings();
    const normalizedInputPanelGlassRefractionBase = normalizeInputPanelGlassRefractionSettings(
      savedSettings?.inputPanelGlassRefraction,
    );
    const normalizedInputPanelGlassRefraction = shouldResetGlassRefractionGlassDefaults
      ? {
          ...normalizedInputPanelGlassRefractionBase,
          ...(shouldResetGlassTierDefaults
            ? {
                glass: { ...defaultInputPanelGlassRefraction.glass },
              }
            : {}),
          ...(shouldResetCardAndPillTierDefaults
            ? {
                card: { ...defaultInputPanelGlassRefraction.card },
                pill: { ...defaultInputPanelGlassRefraction.pill },
              }
            : {}),
        }
      : normalizedInputPanelGlassRefractionBase;
    const normalizedInputPanelGlassRefractionSvgFilter = normalizeInputPanelGlassRefractionSvgFilterSettings(
      savedSettings?.inputPanelGlassRefractionSvgFilter,
    );
    const normalizedInputPanelLiquidGlassBase = normalizeInputPanelLiquidGlassSettings(
      savedSettings?.inputPanelLiquidGlass,
    );
    const defaultInputPanelLiquidGlass = getDefaultInputPanelLiquidGlassSettings();
    const shouldResetNikdelvinDefaults = isLegacyNikdelvinDefaultProfile(
      savedSettings?.inputPanelLiquidGlass?.nikdelvin,
    );
    const normalizedInputPanelLiquidGlass = shouldResetNikdelvinDefaults
      ? {
          ...normalizedInputPanelLiquidGlassBase,
          nikdelvin: { ...defaultInputPanelLiquidGlass.nikdelvin },
        }
      : normalizedInputPanelLiquidGlassBase;

    const normalizedSettings = savedSettings
      ? (() => {
          const remainingSavedSettings = {
            ...(savedSettings as Partial<OpenCodianSettings> & {
              experimentalComposerGlassRefractionEnabled?: unknown;
              inputPanelLiquidGlassMode?: unknown;
            }),
          };
          delete remainingSavedSettings.experimentalComposerGlassRefractionEnabled;
          delete remainingSavedSettings.inputPanelLiquidGlassMode;

          return {
            ...remainingSavedSettings,
            server: normalizedServer,
            chatScrollMode:
              (savedSettings.chatScrollMode as OpenCodianSettings['chatScrollMode'] | 'sticky' | undefined) === 'sticky'
                ? 'sticky-mask'
                : savedSettings.chatScrollMode,
            effortLevel: normalizeEffortLevel(savedSettings.effortLevel),
            thinkingBudget: normalizeThinkingBudget(savedSettings.thinkingBudget),
            tabBarPosition: normalizeTabBarPosition(savedSettings.tabBarPosition),
            belowHeaderTabBarLayout: normalizeBelowHeaderTabBarLayout(savedSettings.belowHeaderTabBarLayout),
            titleMode: normalizeTitleMode(savedSettings.titleMode),
            questionDisplayMode: normalizeQuestionDisplayMode(savedSettings.questionDisplayMode),
            questionCardPosition: normalizeQuestionCardPosition(savedSettings.questionCardPosition),
            showAnsweredQuestionCards:
              typeof savedSettings.showAnsweredQuestionCards === 'boolean'
                ? savedSettings.showAnsweredQuestionCards
                : DEFAULT_SETTINGS.showAnsweredQuestionCards,
            aiTitleModel: typeof savedSettings.aiTitleModel === 'string' ? savedSettings.aiTitleModel.trim() : '',
            disabledModelRefs: normalizeDisabledModelRefs(savedSettings.disabledModelRefs),
            renderUserMarkupAsCodeBlocks:
              typeof savedSettings.renderUserMarkupAsCodeBlocks === 'boolean'
                ? savedSettings.renderUserMarkupAsCodeBlocks
                : DEFAULT_SETTINGS.renderUserMarkupAsCodeBlocks,
            pluginIsolationMode: normalizePluginIsolationMode(savedSettings.pluginIsolationMode),
            inputPanelTheme: normalizeInputPanelThemeId(savedSettings.inputPanelTheme),
            inputPanelGlassRefraction: normalizedInputPanelGlassRefraction,
            inputPanelGlassRefractionSvgFilter: normalizedInputPanelGlassRefractionSvgFilter,
            inputPanelGlassRefractionGlassDefaultsVersion: INPUT_PANEL_GLASS_REFRACTION_GLASS_DEFAULTS_VERSION,
            inputPanelLiquidGlass: normalizedInputPanelLiquidGlass,
            debugLogPaths: normalizedDebugLogPaths,
            chatAppearance: normalizedChatAppearance,
            theme: normalizedTheme,
            tabState: normalizedTabState,
            modelAvailabilitySectionOpen:
              typeof savedSettings.modelAvailabilitySectionOpen === 'boolean'
                ? savedSettings.modelAvailabilitySectionOpen
                : DEFAULT_SETTINGS.modelAvailabilitySectionOpen,
            modelToolsSectionOpen:
              typeof savedSettings.modelToolsSectionOpen === 'boolean'
                ? savedSettings.modelToolsSectionOpen
                : DEFAULT_SETTINGS.modelToolsSectionOpen,
            inlineSerializedDebugLogArgs:
              typeof savedSettings.inlineSerializedDebugLogArgs === 'boolean'
                ? savedSettings.inlineSerializedDebugLogArgs
                : DEFAULT_SETTINGS.inlineSerializedDebugLogArgs,
            providerIconLibrary: normalizedProviderIconLibrary,
            providerIconColorMode: normalizeProviderIconColorMode(savedSettings.providerIconColorMode),
          };
        })()
      : null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...normalizedSettings,
      server: normalizedServer,
      tabBarPosition: normalizeTabBarPosition(normalizedSettings?.tabBarPosition),
      belowHeaderTabBarLayout: normalizeBelowHeaderTabBarLayout(normalizedSettings?.belowHeaderTabBarLayout),
      inputPanelTheme: normalizeInputPanelThemeId(normalizedSettings?.inputPanelTheme),
      inputPanelGlassRefraction: normalizedSettings?.inputPanelGlassRefraction
        ?? getDefaultInputPanelGlassRefractionSettings(),
      inputPanelGlassRefractionSvgFilter: normalizedSettings?.inputPanelGlassRefractionSvgFilter
        ?? getDefaultInputPanelGlassRefractionSvgFilterSettings(),
      inputPanelGlassRefractionGlassDefaultsVersion:
        normalizedSettings?.inputPanelGlassRefractionGlassDefaultsVersion
        ?? INPUT_PANEL_GLASS_REFRACTION_GLASS_DEFAULTS_VERSION,
      inputPanelLiquidGlass: normalizedSettings?.inputPanelLiquidGlass
        ?? getDefaultInputPanelLiquidGlassSettings(),
      debugLogPaths: normalizedDebugLogPaths,
      disabledModelRefs: normalizedSettings?.disabledModelRefs ?? [],
      chatAppearance: normalizedChatAppearance,
      theme: normalizedTheme,
      tabState: normalizedTabState ?? getDefaultPersistedTabState(),
      providerIconLibrary: normalizedProviderIconLibrary,
      providerIconColorMode: normalizeProviderIconColorMode(normalizedSettings?.providerIconColorMode),
    };

    this.reportSettingsLoadState(persistedSettings);

    if (
      persistedSettings.writable
      && (
        persistedSettings.shouldPersist
        || shouldResetGlassRefractionGlassDefaults
        || shouldMigrateLegacyLocalDefaultPort
      )
    ) {
      await this.persistSettingsDomains({ core: true, ui: true });
    }
  }

  /** Save settings to storage */
  async saveSettings(options: { syncService?: boolean; reloadModels?: boolean; syncConfig?: boolean; applyUi?: boolean } = {}) {
    const {
      syncService = true,
      reloadModels = true,
      syncConfig = true,
      applyUi = true,
    } = options;
    this.clearChatAppearanceSaveTimer();
    this.clearSettingsUiStateSaveTimer();
    this.applyLoggerSettings();

    if (syncService) {
      const previousSettings = this.openCodeService.getSettingsSnapshot();

      try {
        await this.openCodeService.updateSettings(this.settings);
      } catch (error) {
        this.settings = previousSettings;
        this.applyLoggerSettings();
        throw error;
      }
    }

    await this.persistSettingsDomains({ core: true, ui: true });

    this.refreshOpenCodianViews({ reloadModels, applyUi });
    
    // Sync OpenCode config with permission mode
    if (syncConfig) {
      await this.syncOpencodeConfig();
    }
  }

  private applyLoggerSettings(): void {
    setDebugLoggingEnabled(this.settings.enableDebugLogging);
    setInlineSerializedDebugLogArgsEnabled(this.settings.inlineSerializedDebugLogArgs);
  }

  applyProviderIconColorMode(): void {
    document.body.dataset.opencodianProviderIconMode = normalizeProviderIconColorMode(
      this.settings.providerIconColorMode,
    );
  }

  applyChatAppearanceSettings(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN)) {
      const view = leaf.view;
      if (view instanceof OpenCodianView) {
        view.applyChatAppearanceSettings();
      }
    }
  }

  getActiveThemePresetDefinition(): ThemePresetDefinition | null {
    return getThemePresetDefinition(this.settings.theme.activePresetId);
  }

  getChatAppearanceBaseline(): ChatAppearanceSettings {
    const activePreset = this.getActiveThemePresetDefinition();
    return activePreset
      ? normalizeChatAppearanceSettings(activePreset.appearance)
      : getDefaultChatAppearanceSettings();
  }

  selectThemePreset(presetId: ThemePresetId): void {
    const preset = getThemePresetDefinition(presetId);
    if (!preset) {
      return;
    }

    const preservedBackground = normalizeChatAppearanceSettings(this.settings.chatAppearance).background;
    this.settings.theme.activePresetId = preset.id;
    this.settings.theme.customAppearanceOverrides = {};
    this.settings.chatAppearance = normalizeChatAppearanceSettings({
      ...preset.appearance,
      background: preservedBackground,
    });
  }

  updateChatAppearance(mutator: (appearance: ChatAppearanceSettings) => void): void {
    const nextAppearance = normalizeChatAppearanceSettings(this.settings.chatAppearance);
    mutator(nextAppearance);
    this.setEffectiveChatAppearance(nextAppearance);
  }

  resetChatAppearanceToBaseline(): void {
    this.setEffectiveChatAppearance(this.getChatAppearanceBaseline());
  }

  resetChatAppearanceGroup(
    group: 'layout' | 'background' | 'user' | 'assistant' | 'input' | 'scrollbar' | 'advanced',
  ): void {
    const baseline = this.getChatAppearanceBaseline();
    const nextAppearance = normalizeChatAppearanceSettings(this.settings.chatAppearance);

    if (group === 'layout') {
      nextAppearance.layout = { ...baseline.layout };
      nextAppearance.sticky = { ...baseline.sticky };
    } else if (group === 'background') {
      nextAppearance.background = { ...baseline.background };
    } else if (group === 'user') {
      nextAppearance.user = { ...baseline.user };
    } else if (group === 'assistant') {
      nextAppearance.assistant = { ...baseline.assistant };
    } else if (group === 'input') {
      nextAppearance.input = { ...baseline.input };
    } else if (group === 'scrollbar') {
      nextAppearance.scrollbar = { ...baseline.scrollbar };
    } else {
      nextAppearance.advanced = { ...baseline.advanced };
    }

    this.setEffectiveChatAppearance(nextAppearance);
  }

  async selectThemePresetAndSave(presetId: ThemePresetId): Promise<void> {
    const previousAppearance = normalizeChatAppearanceSettings(this.settings.chatAppearance);
    this.selectThemePreset(presetId);
    await this.saveChatAppearanceImmediately(previousAppearance);
  }

  async resetChatAppearanceToBaselineAndSave(): Promise<void> {
    const previousAppearance = normalizeChatAppearanceSettings(this.settings.chatAppearance);
    this.resetChatAppearanceToBaseline();
    await this.saveChatAppearanceImmediately(previousAppearance);
  }

  async resetThemePresetAppearanceAndSave(): Promise<void> {
    const previousAppearance = normalizeChatAppearanceSettings(this.settings.chatAppearance);
    const preservedBackground = previousAppearance.background;
    this.resetChatAppearanceToBaseline();
    this.updateChatAppearance((appearance) => {
      appearance.background = { ...preservedBackground };
    });
    await this.saveChatAppearanceImmediately(previousAppearance);
  }

  async resetChatAppearanceGroupAndSave(
    group: 'layout' | 'background' | 'user' | 'assistant' | 'input' | 'scrollbar' | 'advanced',
  ): Promise<void> {
    const previousAppearance = normalizeChatAppearanceSettings(this.settings.chatAppearance);
    this.resetChatAppearanceGroup(group);
    await this.saveChatAppearanceImmediately(previousAppearance);
  }

  async importChatThemeBackgroundFile(file: File): Promise<void> {
    const previousAppearance = normalizeChatAppearanceSettings(this.settings.chatAppearance);
    const asset = await this.storage.saveThemeBackgroundAsset(
      await file.arrayBuffer(),
      file.name,
      file.type,
    );

    this.updateChatAppearance((appearance) => {
      appearance.background.imagePath = asset.path;
      appearance.background.imageMimeType = asset.mimeType;
      appearance.background.imageDisplayName = asset.displayName;
    });

    try {
      await this.saveChatAppearanceImmediately(previousAppearance);
    } catch (error) {
      this.clearThemeBackgroundDataUrlCache(asset.path);
      await this.storage.removeThemeBackground(asset.path);
      throw error;
    }
  }

  async clearChatThemeBackground(): Promise<void> {
    const previousAppearance = normalizeChatAppearanceSettings(this.settings.chatAppearance);
    const hadBackground = Boolean(
      previousAppearance.background.imagePath
      || previousAppearance.background.imageMimeType
      || previousAppearance.background.imageDisplayName,
    );
    if (!hadBackground) {
      return;
    }

    this.updateChatAppearance((appearance) => {
      appearance.background.imagePath = '';
      appearance.background.imageMimeType = '';
      appearance.background.imageDisplayName = '';
    });

    await this.saveChatAppearanceImmediately(previousAppearance);
  }

  async resolveChatThemeBackgroundDataUrl(): Promise<string | null> {
    const { imagePath, imageMimeType } = this.settings.chatAppearance.background;
    if (!imagePath) {
      return null;
    }

    const cacheKey = `${imagePath}::${imageMimeType}`;
    if (this.themeBackgroundDataUrlCache.has(cacheKey)) {
      return this.themeBackgroundDataUrlCache.get(cacheKey) ?? null;
    }

    const inFlightRequest = this.themeBackgroundDataUrlRequests.get(cacheKey);
    if (inFlightRequest) {
      return inFlightRequest;
    }

    const request = this.storage.readThemeBackgroundDataUrl(imagePath, imageMimeType)
      .then((dataUrl) => {
        this.themeBackgroundDataUrlCache.set(cacheKey, dataUrl);
        return dataUrl;
      })
      .catch((error) => {
        logger.warn('Failed to resolve chat theme background asset', error);
        this.themeBackgroundDataUrlCache.set(cacheKey, null);
        return null;
      })
      .finally(() => {
        this.themeBackgroundDataUrlRequests.delete(cacheKey);
      });

    this.themeBackgroundDataUrlRequests.set(cacheKey, request);
    return request;
  }

  refreshConversationRendering(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN)) {
      const view = leaf.view;
      if (view instanceof OpenCodianView) {
        view.refreshCurrentConversationRendering();
      }
    }
  }

  refreshQuestionUi(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN)) {
      const view = leaf.view;
      if (view instanceof OpenCodianView) {
        view.refreshQuestionUi();
      }
    }
  }

  private setEffectiveChatAppearance(nextAppearance: ChatAppearanceSettings): void {
    this.settings.chatAppearance = normalizeChatAppearanceSettings(nextAppearance);
    const activePreset = this.getActiveThemePresetDefinition();
    this.settings.theme.customAppearanceOverrides = activePreset
      ? getThemeAppearanceOverridesFromBase(activePreset.appearance, this.settings.chatAppearance)
      : {};
  }

  private clearThemeBackgroundDataUrlCache(path?: string | null): void {
    if (!path) {
      this.themeBackgroundDataUrlCache.clear();
      this.themeBackgroundDataUrlRequests.clear();
      return;
    }

    const pathPrefix = `${path}::`;
    for (const cacheKey of Array.from(this.themeBackgroundDataUrlCache.keys())) {
      if (cacheKey.startsWith(pathPrefix)) {
        this.themeBackgroundDataUrlCache.delete(cacheKey);
      }
    }
    for (const cacheKey of Array.from(this.themeBackgroundDataUrlRequests.keys())) {
      if (cacheKey.startsWith(pathPrefix)) {
        this.themeBackgroundDataUrlRequests.delete(cacheKey);
      }
    }
  }

  private async saveChatAppearanceImmediately(previousAppearance: ChatAppearanceSettings): Promise<void> {
    const previousBackgroundPath = previousAppearance.background.imagePath;
    const nextBackgroundPath = this.settings.chatAppearance.background.imagePath;

    try {
      const persisted = await this.persistSettingsDomains({ core: true });
      if (!persisted) {
        return;
      }
    } catch (error) {
      this.setEffectiveChatAppearance(previousAppearance);
      this.refreshOpenCodianViews({ reloadModels: false, applyUi: true });
      throw error;
    }

    if (previousBackgroundPath && previousBackgroundPath !== nextBackgroundPath) {
      this.clearThemeBackgroundDataUrlCache(previousBackgroundPath);
      try {
        await this.storage.removeThemeBackground(previousBackgroundPath);
      } catch (error) {
        logger.warn('Failed to delete old chat theme background asset', error);
      }
    }
  }

  scheduleChatAppearanceSave(delay = 220): void {
    this.clearChatAppearanceSaveTimer();
    this.chatAppearanceSaveTimeoutId = window.setTimeout(() => {
      this.chatAppearanceSaveTimeoutId = null;
      void this.persistSettingsDomains({ core: true }).catch((error) => {
        logger.error('Failed to persist core settings', error);
      });
    }, delay);
  }

  scheduleSettingsUiStateSave(delay = 220): void {
    this.clearSettingsUiStateSaveTimer();
    this.settingsUiStateSaveTimeoutId = window.setTimeout(() => {
      this.settingsUiStateSaveTimeoutId = null;
      void this.persistSettingsDomains({ ui: true }).catch((error) => {
        logger.error('Failed to persist UI settings state', error);
      });
    }, delay);
  }

  async saveSettingsUiStateImmediately(): Promise<void> {
    this.clearSettingsUiStateSaveTimer();
    await this.persistSettingsDomains({ ui: true });
  }

  private clearChatAppearanceSaveTimer(): void {
    if (this.chatAppearanceSaveTimeoutId !== null) {
      window.clearTimeout(this.chatAppearanceSaveTimeoutId);
      this.chatAppearanceSaveTimeoutId = null;
    }
  }

  private clearSettingsUiStateSaveTimer(): void {
    if (this.settingsUiStateSaveTimeoutId !== null) {
      window.clearTimeout(this.settingsUiStateSaveTimeoutId);
      this.settingsUiStateSaveTimeoutId = null;
    }
  }

  private async persistSettingsDomains(options: { core?: boolean; ui?: boolean }): Promise<boolean> {
    if (!this.settingsPersistenceWritable) {
      this.warnSettingsPersistenceBlocked(
        'OpenCodian settings persistence is in recovery-only mode because the saved settings files could not be safely recovered.',
      );
      return false;
    }

    const { core, ui } = splitPersistedSettings(this.settings);
    if (options.core) {
      await this.storage.saveCoreSettings(core);
    }
    if (options.ui) {
      await this.storage.saveUiSettings(ui);
    }
    return true;
  }

  private reportSettingsLoadState(result: Awaited<ReturnType<StorageService['loadPersistedSettings']>>): void {
    const recoveredFromBackup = result.core.source === 'backup' || result.ui.source === 'backup';
    const migratedFromLegacy = result.core.source === 'legacy' || result.ui.source === 'legacy';
    const blocked = !result.writable;

    if (recoveredFromBackup) {
      const message = 'OpenCodian recovered settings from a backup after detecting an unreadable settings file.';
      logger.warn(message);
      new Notice(message, 8000);
    }

    if (migratedFromLegacy) {
      const message = 'OpenCodian migrated settings to the new split persistence format.';
      logger.info(message);
      new Notice(message, 6000);
    }

    if (blocked) {
      this.warnSettingsPersistenceBlocked(
        result.core.message
        ?? result.ui.message
        ?? 'OpenCodian could not recover saved settings. Persistence is temporarily disabled to avoid overwriting data.',
      );
    }
  }

  private warnSettingsPersistenceBlocked(message: string): void {
    logger.error(message);
    if (this.settingsPersistenceWarningShown) {
      return;
    }

    this.settingsPersistenceWarningShown = true;
    new Notice(message, 12000);
  }

  private handleModelsLoaded(): void {
    this.queueModelRefresh();
  }

  private refreshOpenCodianViews(options: { reloadModels?: boolean; applyUi?: boolean } = {}): void {
    const { reloadModels = true, applyUi = true } = options;

    if (applyUi) {
      this.applyProviderIconColorMode();
    }

    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN)) {
      const view = leaf.view;
      if (view instanceof OpenCodianView) {
        if (applyUi) {
          view.applyLocaleTexts();
          view.applyChatAppearanceSettings();
          view.applyChatScrollMode();
          view.applyTabBarLayout();
        }
        if (reloadModels) {
          void view.reloadModelCatalog();
        }
      }
    }
  }

  private queueModelRefresh(): void {
    this.clearQueuedModelRefresh();
    this.modelRefreshFrameId = window.requestAnimationFrame(() => {
      this.modelRefreshFrameId = null;
      this.refreshOpenCodianViews({ reloadModels: true, applyUi: false });
      this.settingsTab?.onModelsLoaded();
    });
  }

  private clearQueuedModelRefresh(): void {
    if (this.modelRefreshFrameId !== null) {
      window.cancelAnimationFrame(this.modelRefreshFrameId);
      this.modelRefreshFrameId = null;
    }
  }

  async logServerStatusSnapshot(source = 'manual'): Promise<void> {
    const isHealthy = await this.openCodeService.checkHealth();
    const internalStatus = this.openCodeService.getServerStatus();
    const hasManagedProcess = this.openCodeService.isServerProcessRunning();
    const diagnostics = this.openCodeService.getServerDiagnostics();
    logger.debug(
      `Server snapshot [${source}] -> health=${isHealthy ? 'ok' : 'fail'}, status=${internalStatus}, managedProcess=${hasManagedProcess}, diagnostics=${JSON.stringify(diagnostics)}`
    );
  }

  async buildDiagnosticReport(source = 'manual'): Promise<string> {
    const vaultPath = getVaultBasePath(this.app) ?? 'Unavailable';
    const isHealthy = await this.openCodeService.checkHealth();
    const internalStatus = this.openCodeService.getServerStatus();
    const managedProcess = this.openCodeService.isServerProcessRunning();
    const diagnostics = this.openCodeService.getServerDiagnostics();

    return [
      '# OpenCodian Diagnostic Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Source: ${source}`,
      `Plugin version: ${this.manifest.version}`,
      `Platform: ${process.platform}`,
      `Vault path: ${vaultPath}`,
      '',
      '## Server',
      `Health: ${isHealthy ? 'ok' : 'fail'}`,
      `Status: ${internalStatus}`,
      `Managed process: ${managedProcess}`,
      `Diagnostics: ${JSON.stringify(diagnostics)}`,
      `Mode: ${this.settings.server.mode}`,
      `Base URL: ${getServerBaseUrl(this.settings.server) || '(not set)'}`,
      `Local host: ${this.settings.server.local.host}`,
      `Local port: ${this.settings.server.local.port}`,
      `Local auto-start: ${this.settings.server.local.autoStart}`,
      `Auth type: ${this.settings.server.auth.type}`,
      '',
      '## Settings',
      `Locale: ${this.settings.locale}`,
      `Permission mode: ${this.settings.permissionMode}`,
      `Debug logging: ${this.settings.enableDebugLogging}`,
      `Inline serialized debug log args: ${this.settings.inlineSerializedDebugLogArgs}`,
      `Plugin isolation mode: ${this.settings.pluginIsolationMode}`,
      `Default provider: ${this.settings.defaultProvider}`,
      `Default model: ${this.settings.defaultModel}`,
      `Debug log path (${getCurrentPlatformKey()}): ${getCurrentPlatformDebugLogPath(this.settings.debugLogPaths) || '(not set)'}`,
      `Debug log paths: ${JSON.stringify(this.settings.debugLogPaths)}`,
      '',
      '## Recent Logs',
      getRecentLogText() || '(no logs captured yet)',
      '',
    ].join('\n');
  }

  async writeDiagnosticLogFile(targetDirectory: string, source = 'manual'): Promise<string> {
    await fs.promises.mkdir(targetDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `opencodian-debug-${timestamp}.log`;
    const targetPath = path.join(targetDirectory, filename);
    const report = await this.buildDiagnosticReport(source);
    await fs.promises.writeFile(targetPath, report, 'utf-8');
    return targetPath;
  }

  /** Sync OpenCode config with current permission mode */
  private async syncOpencodeConfig(): Promise<void> {
    try {
      const vaultPath = getVaultBasePath(this.app);
      if (!vaultPath) {
        logger.warn('Could not get vault path, skipping OpenCode config sync');
        return;
      }
      const configManager = new OpencodeConfigManager(vaultPath);
      
      // Always update config to match current permission mode
      switch (this.settings.permissionMode) {
        case 'yolo':
          await configManager.setYoloMode();
          break;
        case 'normal':
          await configManager.setNormalMode();
          break;
        case 'plan':
          await configManager.setPlanMode();
          break;
      }
      
      // Verify the config was written correctly
      const config = await configManager.read();
      logger.debug(`OpenCode config updated to mode: ${this.settings.permissionMode}`);
      logger.debug(`Config file location: ${configManager.getConfigPath()}`);
      logger.debug('Config permissions:', JSON.stringify(config.permission, null, 2));
      
      // Show notice if server is running (needs restart)
      if (await this.openCodeService.checkHealth()) {
        logger.debug('OpenCode server is running. Config changes require restart to take effect.');
      }
    } catch (error) {
      logger.error('Failed to sync OpenCode config:', error);
    }
  }

  /** Initialize OpenCode config file based on current permission mode */
  private async initializeOpencodeConfig(): Promise<void> {
    try {
      const vaultPath = getVaultBasePath(this.app);
      if (!vaultPath) {
        logger.warn('Could not get vault path, skipping OpenCode config initialization');
        return;
      }
      const configManager = new OpencodeConfigManager(vaultPath);
      
      // Check if config already exists
      const exists = await configManager.exists();
      if (exists) {
        // Config exists, no need to create
        return;
      }

      // Create config based on current permission mode
      logger.debug(`Creating OpenCode config with mode: ${this.settings.permissionMode}`);
      
      switch (this.settings.permissionMode) {
        case 'yolo':
          await configManager.setYoloMode();
          break;
        case 'normal':
          await configManager.setNormalMode();
          break;
        case 'plan':
          await configManager.setPlanMode();
          break;
        default:
          await configManager.setNormalMode();
      }
      
      logger.debug(`OpenCode config created at: ${configManager.getConfigPath()}`);
    } catch (error) {
      logger.error('Failed to initialize OpenCode config:', error);
      // Don't throw - plugin should still work even if config creation fails
    }
  }

  /** Load conversations from storage */
  async loadConversations(options: { force?: boolean } = {}): Promise<void> {
    const { force = false } = options;

    if (this.conversationsLoaded && !force) {
      return;
    }

    if (this.conversationsLoadPromise) {
      await this.conversationsLoadPromise;
      return;
    }

    this.conversationsLoadPromise = (async () => {
      const metas = await this.storage.listConversations();

      this.conversations = metas.map((meta) => ({
        id: meta.id,
        title: meta.title,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        lastResponseAt: meta.lastResponseAt,
        titleGenerationStatus: meta.titleGenerationStatus,
        openCodeSessionId: meta.openCodeSessionId ?? meta.id,
        messages: [],
      }));
      this.conversationsLoaded = true;
    })();

    try {
      await this.conversationsLoadPromise;
    } finally {
      this.conversationsLoadPromise = null;
    }
  }

  /** Create a new conversation */
  async createConversation(): Promise<Conversation> {
    // Create session in OpenCode
    const sessionId = await this.openCodeService.createSession();
    
    const conversation: Conversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      title: this.getEmptyConversationTitle(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      openCodeSessionId: sessionId,
      messages: [],
    };

    this.conversations.unshift(conversation);
    await this.storage.saveConversation(conversation);

    return conversation;
  }

  async createConversationFromSession(
    sessionId: string,
    initial?: Partial<Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'openCodeSessionId'>>,
  ): Promise<Conversation> {
    const conversation: Conversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      title: initial?.title || this.getEmptyConversationTitle(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      openCodeSessionId: sessionId,
      messages: initial?.messages ? JSON.parse(JSON.stringify(initial.messages)) as Conversation['messages'] : [],
      currentNote: initial?.currentNote,
      externalContextPaths: initial?.externalContextPaths ? [...initial.externalContextPaths] : undefined,
      lastResponseAt: initial?.lastResponseAt,
      titleGenerationStatus: initial?.titleGenerationStatus,
    };

    this.conversations.unshift(conversation);
    await this.storage.saveConversation(conversation);
    return conversation;
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    const index = this.conversations.findIndex((item) => item.id === conversation.id);
    if (index === -1) {
      this.conversations.unshift(conversation);
    } else {
      this.conversations[index] = conversation;
    }

    await this.storage.saveConversation(conversation);
  }

  /** Get all conversations */
  getConversations(): Conversation[] {
    return [...this.conversations];
  }

  /** Get conversation by ID (with optional cache-first behavior) */
  async getConversationById(
    id: string,
    options: { preferCache?: boolean } = {},
  ): Promise<Conversation | undefined> {
    // First check in-memory cache
    const cached = this.conversations.find((c) => c.id === id);
    if (!cached) return undefined;

    if (options.preferCache) {
      return cached;
    }
    
    // Load full conversation with messages from storage
    const fullConversation = await this.storage.loadFullConversation(id);
    if (fullConversation) {
      // Update cache with full data
      const index = this.conversations.findIndex((c) => c.id === id);
      if (index !== -1) {
        this.conversations[index] = fullConversation;
      }
      return fullConversation;
    }
    
    return cached;
  }

  /** Delete a conversation */
  async deleteConversation(id: string): Promise<void> {
    const index = this.conversations.findIndex((c) => c.id === id);
    if (index === -1) return;

    const conversation = this.conversations[index];
    this.conversations.splice(index, 1);

    // Delete from OpenCode
    try {
      await this.openCodeService.deleteSession(conversation.openCodeSessionId);
    } catch {
      // Ignore errors
    }

    // Delete from storage
    await this.storage.deleteConversation(id);
  }

  /** Get placeholder title for a new, empty conversation */
  getEmptyConversationTitle(): string {
    return t('chat.tab.new');
  }

  /** Generate fallback conversation title from the first user message */
  generateDefaultTitle(firstMessage: string): string {
    const normalizedMessage = firstMessage.replace(/\r/g, '').trim();
    if (!normalizedMessage) {
      return t('chat.history.untitled');
    }

    const firstSentence = normalizedMessage
      .split(/[.!?\n]/)[0]
      .replace(/\s+/g, ' ')
      .trim();
    if (!firstSentence) {
      return t('chat.history.untitled');
    }

    const title = firstSentence.substring(0, 50).trim();
    if (!title) {
      return t('chat.history.untitled');
    }

    return title + (firstSentence.length > 50 ? '...' : '');
  }
}

// Export type for use in other modules
export type { OpenCodianPlugin };
