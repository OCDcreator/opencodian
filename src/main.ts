import * as fs from 'fs';
import type { Editor, MarkdownView } from 'obsidian';
import { addIcon, Notice, Plugin } from 'obsidian';
import * as path from 'path';

import { ModelConfigService, OpencodeConfigManager } from './core/config';
import { OpenCodeService, SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from './core/opencode';
import { OpenCodianStartupCoordinator } from './core/runtime/OpenCodianStartupCoordinator';
import { PluginRuntimeCoordinator } from './core/runtime/PluginRuntimeCoordinator';
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
  getRecentLogText,
  getVaultBasePath,
  setDebugLoggingEnabled,
  setDebugModuleSettings,
  setDebugRefreshIntervalMs,
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
  private runtimeCoordinator = new PluginRuntimeCoordinator({
    getSettings: () => this.settings ?? null,
    getOpenCodeService: () => this.openCodeService ?? null,
    getOpenCodianLeaves: () => this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN),
    applyProviderIconColorMode: () => this.applyProviderIconColorMode(),
    startConfiguredLocalServerIfNeeded: () => this.startConfiguredLocalServerIfNeeded(),
    logServerStatusSnapshot: (source?: string) => this.logServerStatusSnapshot(source),
    onModelsLoaded: () => this.settingsTab?.onModelsLoaded(),
  });
  private themeBackgroundDataUrlCache = new Map<string, string | null>();
  private themeBackgroundDataUrlRequests = new Map<string, Promise<string | null>>();
  private settingsPersistenceWritable = true;
  private settingsPersistenceWarningShown = false;
  private startupCoordinator = new OpenCodianStartupCoordinator();

  async onload() {
    const startupVaultPath = getVaultBasePath(this.app) ?? 'Unavailable';
    logger.always(`OpenCodian ${this.manifest.version} BUILD_ID=${BUILD_ID} startup begin (vault=${startupVaultPath})`);

    await this.startupCoordinator.execute({
      manifest: this.manifest,
      getVaultBasePath: () => getVaultBasePath(this.app),
      registerAppIcon: () => addIcon(OPENCODIAN_APP_ICON, OPENCODIAN_APP_ICON_SVG),
      onPrepareStartupState: (coordinator) => this.handlePrepareStartupState(coordinator),
      onBootstrapOpenCodeRuntime: (initialManagedServerState) => this.handleBootstrapOpenCodeRuntime(initialManagedServerState),
      onRegisterWorkspaceIntegration: () => this.registerWorkspaceIntegration(),
      onScheduleDeferredRuntimeWarmup: () => this.runtimeCoordinator.scheduleDeferredRuntimeWarmup(),
    });
  }

  private warnSettingsPersistenceBlocked(message: string): void {
    logger.error(message);
    if (this.settingsPersistenceWarningShown) {
      return;
    }

    this.settingsPersistenceWarningShown = true;
    new Notice(message, 12000);
  }

  private async handlePrepareStartupState(coordinator: OpenCodianStartupCoordinator): Promise<LoadedManagedServerState> {
    this.storage = new StorageService(this);
    await coordinator.measureStartupStep('storage.initialize', () => this.storage.initialize());
    await coordinator.measureStartupStep('loadSettings', () => this.loadSettings());
    await coordinator.measureStartupStep('applyLoadedSettingsStartupEffects', () => {
      this.applyLoadedSettingsStartupEffects();
    });
    return coordinator.measureStartupStep('loadManagedServerState', () => this.storage.loadManagedServerState());
  }

  private applyLoadedSettingsStartupEffects(): void {
    registerBuiltinGlassAdapters();
    this.applyLoggerSettings();
    this.applyProviderIconColorMode();
    setLocale(this.settings.locale as 'en' | 'zh');
  }

  private async handleBootstrapOpenCodeRuntime(
    initialManagedServerState: LoadedManagedServerState,
  ): Promise<void> {
    await this.startupCoordinator.measureStartupStep('initializeOpencodeConfig', () => {
      const vaultPath = getVaultBasePath(this.app);
      if (vaultPath) {
        return OpencodeConfigManager.ensureInitialized(vaultPath, this.settings.permissionMode);
      }
      return Promise.resolve();
    });

    await this.startupCoordinator.measureStartupStep('constructOpenCodeService', () => {
      this.openCodeService = new OpenCodeService(
        this.settings,
        {
          onServerStatusChange: (status) => {
            this.handleOpenCodeServerStatusChange(status);
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

    await this.startupCoordinator.measureStartupStep('configureVaultScopedServices', () => {
      this.configureVaultScopedServices();
    });

    await this.startupCoordinator.measureStartupStep('loadConversations', () => this.loadConversations());
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
    this.runtimeCoordinator.dispose();
    this.openCodeService?.dispose();
    void this.openCodeService?.stop().catch((error) => {
      logger.warn('Failed to asynchronously stop OpenCode service during unload:', error);
    });
    this.clearChatAppearanceSaveTimer();
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
    const persistedSettings = await this.startupCoordinator.measureStartupStep(
      'storage.loadPersistedSettings',
      () => this.storage.loadPersistedSettings(),
    );
    const loadState = await this.startupCoordinator.measureStartupStep(
      'normalizeLoadedSettings',
      () => prepareLoadedSettingsBootstrapState(persistedSettings),
      {
        detail: () => `core=${persistedSettings.core.source}, ui=${persistedSettings.ui.source}, persist=${persistedSettings.shouldPersist ? 'yes' : 'no'}`,
      },
    );
    this.settingsPersistenceWritable = loadState.persistedSettings.writable;
    this.settings = loadState.settings;

    this.reportSettingsLoadState(loadState.persistedSettings);

    if (loadState.shouldPersistNormalizedSettings) {
      await this.startupCoordinator.measureStartupStep(
        'persistNormalizedSettings',
        () => this.persistSettingsDomains({ core: true, ui: true }),
        { detail: 'startup normalization backfill' },
      );
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

    this.runtimeCoordinator.refreshOpenCodianViews({ reloadModels, applyUi });
    this.runtimeCoordinator.invalidateSlashCommandMenuCatalogs();

    // Sync OpenCode config with permission mode
    if (syncConfig) {
      const vaultPath = getVaultBasePath(this.app);
      if (vaultPath) {
        await OpencodeConfigManager.syncPermissionMode(
          vaultPath,
          this.settings.permissionMode,
          { healthCheck: () => this.openCodeService.checkHealth() },
        );
      }
    }
  }

  private applyLoggerSettings(): void {
    setDebugLoggingEnabled(this.settings.enableDebugLogging);
    setDebugModuleSettings(this.settings.debugModuleSettings);
    setDebugRefreshIntervalMs(this.settings.debugRefreshIntervalMs);
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
      this.runtimeCoordinator.refreshOpenCodianViews({ reloadModels: false, applyUi: true });
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

  private handleModelsLoaded(): void {
    this.runtimeCoordinator.queueModelRefresh();
  }

  private handleOpenCodeServerStatusChange(status: string): void {
    logger.debug(`Server status changed: ${status}`);
    this.settingsTab?.refreshServerStatusDisplay();
    if (status === 'running') {
      this.runtimeCoordinator.invalidateSlashCommandMenuCatalogs({ preload: true });
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
      `Plugin name: ${this.manifest.name}`,
      `Plugin ID: ${this.manifest.id}`,
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
      `Debug modules: ${JSON.stringify(this.settings.debugModuleSettings)}`,
      `Debug refresh interval: ${this.settings.debugRefreshIntervalMs}ms`,
      `Inline serialized debug log args: ${this.settings.inlineSerializedDebugLogArgs}`,
      `Plugin isolation mode: ${this.settings.pluginIsolationMode}`,
      `Default provider: ${this.settings.defaultProvider}`,
      `Default model: ${this.settings.defaultModel}`,
      `Debug log path (${getCurrentPlatformKey()}): ${getCurrentPlatformDebugLogPath(this.settings.debugLogPaths) || '(not set)'}`,
      `Debug log paths: ${JSON.stringify(this.settings.debugLogPaths)}`,
      '',
      '## Startup Performance',
      ...this.startupCoordinator.getStartupPerfSummaryLines(),
      '',
      '## Startup Analysis',
      ...this.startupCoordinator.getStartupPerformanceDiagnosisLines(),
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

  getDebugBuildIdentityText(): string {
    return `OpenCodian ${this.manifest.version} BUILD_ID=${BUILD_ID}`;
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
      const metas = await this.startupCoordinator.measureStartupStep(
        'storage.listConversations',
        () => this.storage.listConversations(),
        { detail: () => this.describeConversationListDiagnostics() },
      );

      this.conversations = await this.startupCoordinator.measureStartupStep(
        'cacheConversationMetas',
        () => metas.map((meta) => ({
          id: meta.id,
          title: meta.title,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt,
          lastResponseAt: meta.lastResponseAt,
          titleGenerationStatus: meta.titleGenerationStatus,
          openCodeSessionId: meta.openCodeSessionId ?? meta.id,
          messages: [],
        })),
        { detail: () => `${metas.length} conversations` },
      );
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
    await this.runtimeCoordinator.ensureRuntimeWarmupReadyForSessionBootstrap();

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

  private describeConversationListDiagnostics(): string {
    const diagnostics = this.getConversationListDiagnosticsSnapshot();
    if (!diagnostics) {
      return 'conversation diagnostics unavailable';
    }

    return `sessions=${diagnostics.sessionFileCount}, metaHits=${diagnostics.metadataHitCount}, fullFallbacks=${diagnostics.fullSessionFallbackCount}`;
  }

  private getConversationListDiagnosticsSnapshot():
    ReturnType<StorageService['getConversationListDiagnosticsSnapshot']> {
    const storage = this.storage as StorageService & {
      getConversationListDiagnosticsSnapshot?: () => ReturnType<StorageService['getConversationListDiagnosticsSnapshot']>;
    };
    return storage.getConversationListDiagnosticsSnapshot?.() ?? null;
  }
}

// Export type for use in other modules
export type { OpenCodianPlugin };
