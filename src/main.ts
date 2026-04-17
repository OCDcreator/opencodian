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
  getThemeAppearanceOverridesFromBase,
  getThemePresetDefinition,
} from './core/theme';
import type {
  ChatAppearanceSettings,
  Conversation,
  OpenCodianSettings,
  ThemePresetDefinition,
  ThemePresetId,
} from './core/types';
import {
  getCurrentPlatformDebugLogPath,
  getCurrentPlatformKey,
  getDefaultChatAppearanceSettings,
  getServerBaseUrl,
  isLocalServerMode,
  normalizeChatAppearanceSettings,
  normalizeLobehubIconVariant,
  normalizeProviderIconColorMode,
  VIEW_TYPE_OPENCODIAN,
} from './core/types';
import { prepareLoadedSettingsBootstrapState } from './core/types/settingsLoadNormalization';
import { OpenCodianView } from './features/chat/OpenCodianView';
import { OpenCodianSettingTab } from './features/settings/OpenCodianSettings';
import { setLocale, t } from './i18n';
import {
  createLogger,
  formatDurationMs,
  getPerformanceTimestampMs,
  getRecentLogText,
  getVaultBasePath,
  setDebugLoggingEnabled,
  setInlineSerializedDebugLogArgsEnabled,
} from './shared';
import { registerBuiltinGlassAdapters } from './utils/glass';

const logger = createLogger('OpenCodian');
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

type LoadedManagedServerState = Awaited<ReturnType<StorageService['loadManagedServerState']>>;
// BUILD_ID is injected at build time via esbuild define
declare const BUILD_ID: string;

type StartupPerfEntry = {
  step: string;
  elapsedMs: number;
  status: 'ok' | 'error';
  depth: number;
  detail?: string;
};

type StartupPerfTrace = {
  runId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  entries: StartupPerfEntry[];
};

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
  private deferredRuntimeWarmupTimerId: number | null = null;
  private deferredRuntimeWarmupPromise: Promise<void> | null = null;
  private themeBackgroundDataUrlCache = new Map<string, string | null>();
  private themeBackgroundDataUrlRequests = new Map<string, Promise<string | null>>();
  private settingsPersistenceWritable = true;
  private settingsPersistenceWarningShown = false;
  private startupPerfTrace: StartupPerfTrace | null = null;
  private startupPerfDepth = 0;

  async onload() {
    this.beginStartupPerfTrace();
    const startupVaultPath = getVaultBasePath(this.app) ?? 'Unavailable';
    logger.info(`OpenCodian ${this.manifest.version} BUILD_ID=${BUILD_ID} startup begin (vault=${startupVaultPath})`);

    try {
      await this.measureStartupStep('registerAppIcon', () => {
        addIcon(OPENCODIAN_APP_ICON, OPENCODIAN_APP_ICON_SVG);
      });
      const initialManagedServerState = await this.measureStartupStep(
        'prepareStartupState',
        () => this.prepareStartupState(),
      );
      await this.measureStartupStep(
        'bootstrapOpenCodeRuntime',
        () => this.bootstrapOpenCodeRuntime(initialManagedServerState),
      );
      await this.measureStartupStep('registerWorkspaceIntegration', () => {
        this.registerWorkspaceIntegration();
      });
      logger.info('[startup] deferring runtime warmup until after workspace integration');
      this.completeStartupPerfTrace('completed');
      await this.persistStartupPerfTraceSnapshot();
      this.scheduleDeferredRuntimeWarmup();
    } catch (error) {
      this.completeStartupPerfTrace('failed');
      await this.persistStartupPerfTraceSnapshot().catch((persistError) => {
        logger.warn('Failed to persist startup trace after startup failure', persistError);
      });
      throw error;
    }
  }

  private async prepareStartupState(): Promise<LoadedManagedServerState> {
    this.storage = new StorageService(this);
    await this.measureStartupStep('storage.initialize', () => this.storage.initialize());
    await this.measureStartupStep('loadSettings', () => this.loadSettings());
    await this.measureStartupStep('applyLoadedSettingsStartupEffects', () => {
      this.applyLoadedSettingsStartupEffects();
    });
    return this.measureStartupStep('loadManagedServerState', () => this.storage.loadManagedServerState());
  }

  private applyLoadedSettingsStartupEffects(): void {
    registerBuiltinGlassAdapters();
    this.applyLoggerSettings();
    this.applyProviderIconColorMode();
    setLocale(this.settings.locale as 'en' | 'zh');
  }

  private async bootstrapOpenCodeRuntime(
    initialManagedServerState: LoadedManagedServerState,
  ): Promise<void> {
    await this.measureStartupStep('initializeOpencodeConfig', () => this.initializeOpencodeConfig());
    await this.measureStartupStep('constructOpenCodeService', () => {
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
    });
    await this.measureStartupStep('configureVaultScopedServices', () => {
      this.configureVaultScopedServices();
    });
    await this.measureStartupStep('loadConversations', () => this.loadConversations());
  }

  private configureVaultScopedServices(): void {
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
  }

  private async startConfiguredLocalServerIfNeeded(): Promise<void> {
    if (!isLocalServerMode(this.settings.server) || !this.settings.server.local.autoStart) {
      return;
    }

    try {
      await this.openCodeService.start();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to start server';
      new Notice(`OpenCode: ${msg}`);
    }
  }

  private registerWorkspaceIntegration(): void {
    this.registerView(
      VIEW_TYPE_OPENCODIAN,
      (leaf) => new OpenCodianView(leaf, this)
    );

    this.addRibbonIcon(OPENCODIAN_APP_ICON, '打开 OpenCodian', () => {
      this.activateView();
    });

    this.registerPluginCommands();

    this.settingsTab = new OpenCodianSettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);
  }

  private registerPluginCommands(): void {
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
  }

  onunload() {
    this.clearDeferredRuntimeWarmupTimer();
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

  async reapplyConversationSessionDefaults(): Promise<void> {
    await this.getOpenCodianView()?.reapplyCurrentConversationSessionSettings();
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
    const loadState = prepareLoadedSettingsBootstrapState(await this.storage.loadPersistedSettings());
    this.settingsPersistenceWritable = loadState.persistedSettings.writable;
    this.settings = loadState.settings;

    this.reportSettingsLoadState(loadState.persistedSettings);

    if (loadState.shouldPersistNormalizedSettings) {
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
    document.body.dataset.opencodianProviderIconVariant = normalizeLobehubIconVariant(
      this.settings.providerIconDefaultVariant,
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

  private scheduleDeferredRuntimeWarmup(): void {
    if (!this.shouldWarmupRuntimeAfterStartup()) {
      return;
    }

    if (this.deferredRuntimeWarmupTimerId !== null || this.deferredRuntimeWarmupPromise) {
      return;
    }

    this.deferredRuntimeWarmupTimerId = window.setTimeout(() => {
      this.deferredRuntimeWarmupTimerId = null;
      void this.startDeferredRuntimeWarmup('deferred-onload');
    }, 0);
  }

  async ensureRuntimeWarmupReadyForSessionBootstrap(): Promise<void> {
    if (!this.shouldWarmupRuntimeAfterStartup() || this.openCodeService.isReady()) {
      return;
    }

    if (this.deferredRuntimeWarmupTimerId !== null) {
      this.clearDeferredRuntimeWarmupTimer();
      await this.startDeferredRuntimeWarmup('session-bootstrap');
      return;
    }

    if (this.deferredRuntimeWarmupPromise) {
      await this.deferredRuntimeWarmupPromise;
      return;
    }

    await this.startDeferredRuntimeWarmup('session-bootstrap');
  }

  private clearDeferredRuntimeWarmupTimer(): void {
    if (this.deferredRuntimeWarmupTimerId !== null) {
      window.clearTimeout(this.deferredRuntimeWarmupTimerId);
      this.deferredRuntimeWarmupTimerId = null;
    }
  }

  private shouldWarmupRuntimeAfterStartup(): boolean {
    return Boolean(
      this.openCodeService
      && this.settings
      && isLocalServerMode(this.settings.server)
      && this.settings.server.local.autoStart,
    );
  }

  private async startDeferredRuntimeWarmup(
    source: 'deferred-onload' | 'session-bootstrap',
  ): Promise<void> {
    if (this.deferredRuntimeWarmupPromise) {
      return this.deferredRuntimeWarmupPromise;
    }

    this.deferredRuntimeWarmupPromise = this.runDeferredRuntimeWarmup(source)
      .catch((error) => {
        logger.warn('Deferred runtime warmup failed', error);
        throw error;
      })
      .finally(() => {
        this.deferredRuntimeWarmupPromise = null;
      });

    return this.deferredRuntimeWarmupPromise;
  }

  private async runDeferredRuntimeWarmup(
    source: 'deferred-onload' | 'session-bootstrap',
  ): Promise<void> {
    if (!this.openCodeService) {
      return;
    }

    const startedAt = getPerformanceTimestampMs();
    logger.debug(`[startup] deferred runtime warmup started (${source})`);

    await this.startConfiguredLocalServerIfNeeded();
    await this.logServerStatusSnapshot(source);

    logger.info(
      `[startup] deferred runtime warmup completed in ${formatDurationMs(getPerformanceTimestampMs() - startedAt)} (${source})`,
    );
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
      `BUILD_ID: ${BUILD_ID}`,
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
      '## Startup Performance',
      ...this.getStartupPerfSummaryLines(),
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
    await this.ensureRuntimeWarmupReadyForSessionBootstrap();

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
      sessionSettings: initial?.sessionSettings ? JSON.parse(JSON.stringify(initial.sessionSettings)) as Conversation['sessionSettings'] : undefined,
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

  private beginStartupPerfTrace(): void {
    const startedAt = new Date();
    this.startupPerfTrace = {
      runId: `startup-${startedAt.getTime()}`,
      startedAt: startedAt.toISOString(),
      status: 'running',
      entries: [],
    };
    this.startupPerfDepth = 0;
  }

  private async measureStartupStep<T>(
    step: string,
    operation: () => Promise<T> | T,
    options: { detail?: string | (() => string) } = {},
  ): Promise<T> {
    const depth = this.startupPerfDepth;
    const startedAt = getPerformanceTimestampMs();
    this.startupPerfDepth = depth + 1;
    logger.debug(`[startup] ${step} started`);

    try {
      const result = await Promise.resolve(operation());
      const elapsedMs = getPerformanceTimestampMs() - startedAt;
      const detail = typeof options.detail === 'function' ? options.detail() : options.detail;
      this.recordStartupPerfEntry({
        step,
        elapsedMs,
        status: 'ok',
        depth,
        detail,
      });
      logger.debug(
        `[startup] ${step} completed in ${formatDurationMs(elapsedMs)}${detail ? ` (${detail})` : ''}`,
      );
      return result;
    } catch (error) {
      const elapsedMs = getPerformanceTimestampMs() - startedAt;
      const detail = typeof options.detail === 'function' ? options.detail() : options.detail;
      this.recordStartupPerfEntry({
        step,
        elapsedMs,
        status: 'error',
        depth,
        detail,
      });
      logger.error(
        `[startup] ${step} failed after ${formatDurationMs(elapsedMs)}${detail ? ` (${detail})` : ''}`,
        error,
      );
      throw error;
    } finally {
      this.startupPerfDepth = depth;
    }
  }

  private recordStartupPerfEntry(entry: StartupPerfEntry): void {
    this.startupPerfTrace?.entries.push(entry);
  }

  private completeStartupPerfTrace(status: 'completed' | 'failed'): void {
    if (!this.startupPerfTrace) {
      return;
    }

    this.startupPerfTrace.status = status;
    this.startupPerfTrace.completedAt = new Date().toISOString();
    const summaryEntries = this.startupPerfTrace.entries.filter((entry) => entry.depth === 0);
    const totalElapsedMs = summaryEntries.reduce((sum, entry) => sum + entry.elapsedMs, 0);
    const summaryText = summaryEntries
      .map((entry) => `${entry.step}=${formatDurationMs(entry.elapsedMs)}`)
      .join(', ');

    logger.info(
      `[startup] ${status} in ${formatDurationMs(totalElapsedMs)}${summaryText ? ` | ${summaryText}` : ''}`,
    );
  }

  private getStartupPerfSummaryLines(): string[] {
    if (!this.startupPerfTrace) {
      return ['(no startup trace captured yet)'];
    }

    const summaryEntries = this.startupPerfTrace.entries.filter((entry) => entry.depth === 0);
    const detailEntries = this.startupPerfTrace.entries
      .filter((entry) => entry.depth > 0)
      .sort((left, right) => right.elapsedMs - left.elapsedMs)
      .slice(0, 6);
    const totalElapsedMs = summaryEntries.reduce((sum, entry) => sum + entry.elapsedMs, 0);

    return [
      `Run ID: ${this.startupPerfTrace.runId}`,
      `Status: ${this.startupPerfTrace.status}`,
      `Started: ${this.startupPerfTrace.startedAt}`,
      `Completed: ${this.startupPerfTrace.completedAt ?? '(running)'}`,
      `Top-level total: ${formatDurationMs(totalElapsedMs)}`,
      `Top-level steps: ${
        summaryEntries.length
          ? summaryEntries.map((entry) => `${entry.step}=${formatDurationMs(entry.elapsedMs)}`).join(', ')
          : '(none)'
      }`,
      `Slowest nested steps: ${
        detailEntries.length
          ? detailEntries
            .map((entry) =>
              `${entry.step}=${formatDurationMs(entry.elapsedMs)}${entry.detail ? ` (${entry.detail})` : ''}`)
            .join(', ')
          : '(none)'
      }`,
    ];
  }

  private async persistStartupPerfTraceSnapshot(): Promise<void> {
    if (!this.startupPerfTrace || !this.settings?.enableDebugLogging) {
      return;
    }

    const vaultPath = getVaultBasePath(this.app);
    if (!vaultPath) {
      return;
    }

    const debugDirectoryPath = path.join(vaultPath, '.opencodian', 'debug');
    const outputPath = path.join(debugDirectoryPath, 'startup-perf-latest.log');
    const trace = this.startupPerfTrace;
    const topLevelEntries = trace.entries.filter((entry) => entry.depth === 0);
    const nestedEntries = trace.entries.filter((entry) => entry.depth > 0);
    const lines = [
      '# OpenCodian Startup Performance Trace',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Plugin version: ${this.manifest.version}`,
      `BUILD_ID: ${BUILD_ID}`,
      '',
      ...this.getStartupPerfSummaryLines(),
      '',
      'Top-level entries:',
      ...(topLevelEntries.length
        ? topLevelEntries.map((entry) =>
          `- ${entry.step}: ${formatDurationMs(entry.elapsedMs)} [${entry.status}]${entry.detail ? ` (${entry.detail})` : ''}`)
        : ['- (none)']),
      '',
      'Nested entries:',
      ...(nestedEntries.length
        ? nestedEntries.map((entry) =>
          `- ${'  '.repeat(Math.max(0, entry.depth - 1))}${entry.step}: ${formatDurationMs(entry.elapsedMs)} [${entry.status}]${entry.detail ? ` (${entry.detail})` : ''}`)
        : ['- (none)']),
      '',
      'Recent logs:',
      getRecentLogText() || '(no logs captured yet)',
      '',
    ];

    await fs.promises.mkdir(debugDirectoryPath, { recursive: true });
    await fs.promises.writeFile(outputPath, lines.join('\n'), 'utf-8');
    logger.debug(`[startup] wrote startup trace snapshot to ${outputPath}`);
  }
}

// Export type for use in other modules
export type { OpenCodianPlugin };
