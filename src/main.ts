/* eslint-disable simple-import-sort/imports -- Entry-point bootstrap imports stay manually clustered by startup seam so owner-guarded wiring changes do not create unrelated reorder churn. */
import * as fs from 'fs';
import type { ElicitationRequest, ElicitationResult } from '@anthropic-ai/claude-agent-sdk';
import type { Editor, MarkdownView } from 'obsidian';
import { addIcon, Notice, Plugin } from 'obsidian';
import * as path from 'path';

import { ModelConfigService, ModelPricingService, OpencodeConfigManager } from './core/config';
import { setAgentServiceRegistry } from './core/agents/AgentCapability';
import {
  getConversationSessionBackendService,
  hasSessionCreationCapability,
} from './core/agents/backend/AgentBackendRouting';
import { AgentServiceRegistry } from './core/agents/backend/AgentServiceRegistry';
import { ClaudeCodeAdapter } from './core/agents/backend/ClaudeCodeAdapter';
import { wireHiddenAdapters } from './core/agents/backend/AgentAdapterWiring';
import {
  buildClaudeCodeElicitationContent,
  buildClaudeCodeElicitationQuestionRequest,
  normalizeClaudeCodeElicitationContent,
} from './core/agents/backend/ClaudeCodeElicitationBridge';
import { adaptMcpConfigForClaude } from './core/agents/backend/ClaudeCodeMcpConfigAdapter';
import { type ClaudeCodePermissionBridgeHostContext, createClaudeCodePermissionBridgeHost } from './core/agents/backend/ClaudeCodeDefaultPermissionHost';
import { ClaudeCodePermissionBridge, createClaudeCodePermissionBridge } from './core/agents/backend/ClaudeCodePermissionBridge';
import { loadClaudeCodeSdk } from './core/agents/backend/ClaudeCodeSdkLoader';
import { CodexAdapter } from './core/agents/backend/CodexAdapter';
import { type CodexApprovalHostContext, createCodexApprovalBridgeHost } from './core/agents/backend/CodexDefaultApprovalHost';
import { OpenCodeAdapter } from './core/agents/backend/OpenCodeAdapter';
import { OpenCodeService, SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from './core/opencode';
import { migrateOpenCodeCapabilitySettings } from './core/opencode/OpenCodeCapabilitySettingsMigration';
import { OpenCodianSettingsRuntimeCoordinator } from './core/runtime/OpenCodianSettingsRuntimeCoordinator';
import { OpenCodianStartupCoordinator } from './core/runtime/OpenCodianStartupCoordinator';
import { PluginRuntimeCoordinator } from './core/runtime/PluginRuntimeCoordinator';
import { StorageService } from './core/storage';
import { ConversationFullMessageCache } from './core/storage/ConversationFullMessageCache';
import { PluginUpdateService } from './core/update/PluginUpdateService';
import type {
  ChatAppearanceSettings,
  ChatMessage,
  Conversation,
  OpenCodianSettings,
  ThemePresetDefinition,
  ThemePresetId,
} from './core/types';
import {
  getConversationBackendSessionId,
  getCurrentPlatformDebugLogPath,
  getCurrentPlatformKey,
  getServerBaseUrl,
  isLocalServerMode,
  normalizeLobehubIconVariant,
  normalizeProviderIconColorMode,
  VIEW_TYPE_OPENCODIAN,
} from './core/types';
import { prepareLoadedSettingsBootstrapState } from './core/types/settingsLoadNormalization';
import { OpenCodianView } from './features/chat/OpenCodianView';
import { OpenCodianSettingTab } from './features/settings/OpenCodianSettings';
import { broadcastModelsLoadedToSettingsViews, broadcastServerStatusToSettingsViews, registerSettingsView } from './features/settings/SettingsViewRegistrar';
import { setLocale, t } from './i18n';
import {
  createLogger,
  getRecentLogText,
  getVaultBasePath,
  sanitizeDiagnosticReport,
  setClaudeCodeDebugChannelSettings,
  setDebugLoggingEnabled,
  setDebugModuleSettings,
  setDebugRefreshIntervalMs,
  setInlineSerializedDebugLogArgsEnabled,
} from './shared';
import { registerBuiltinGlassAdapters } from './utils/glass';
import type { AgentBackendKind } from './core/types/chat';

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
type ConversationCachePinProvider = () => Iterable<string>;
// BUILD_ID is injected at build time via esbuild define
declare const BUILD_ID: string;

/** Main plugin class */
export default class OpenCodianPlugin extends Plugin {
  settings: OpenCodianSettings;
  storage: StorageService;
  openCodeService: OpenCodeService;
  agentServiceRegistry: AgentServiceRegistry;
  claudeCodePermissionBridge: ClaudeCodePermissionBridge | null = null;
  claudeCodePermissionHostContext: ClaudeCodePermissionBridgeHostContext = { getActiveTabId: () => null };
  codexApprovalHostContext: CodexApprovalHostContext = { getActiveTabId: () => null };
  opencodeConfigManager: OpencodeConfigManager | null = null;
  modelConfigService: ModelConfigService | null = null;
  modelPricingService: ModelPricingService | null = null;
  pluginUpdateService: PluginUpdateService;
  settingsTab?: InstanceType<typeof OpenCodianSettingTab>;

  private conversations: Conversation[] = [];
  private conversationsLoaded = false;
  private conversationsLoadPromise: Promise<void> | null = null;
  private readonly conversationFullMessageCache = new ConversationFullMessageCache({ maxFullConversations: 12 });
  private readonly conversationCachePinProviders = new Set<ConversationCachePinProvider>();
  private conversationFullMessageCacheClock = 0;
  private runtimeCoordinator = new PluginRuntimeCoordinator({
    getSettings: () => this.settings ?? null,
    getOpenCodeService: () => this.openCodeService ?? null,
    getPluginUpdateService: () => this.pluginUpdateService ?? null,
    getPluginVersion: () => this.manifest.version,
    getOpenCodianLeaves: () => this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN),
    hasEnabledBackend: (backendId: AgentBackendKind) =>
      this.settings?.enabledBackends?.includes(backendId) ?? false,
    applyProviderIconColorMode: () => this.applyProviderIconColorMode(),
    startConfiguredLocalServerIfNeeded: () => this.startConfiguredLocalServerIfNeeded(),
    logServerStatusSnapshot: (source?: string) => this.logServerStatusSnapshot(source),
    onModelsLoaded: () => {
      this.settingsTab?.onModelsLoaded();
      this.settingsTab?.refreshServerStatusDisplay();
      broadcastModelsLoadedToSettingsViews(this);
      broadcastServerStatusToSettingsViews(this);
    },
  });
  private settingsPersistenceWritable = true;
  private settingsPersistenceWarningShown = false;
  private startupCoordinator = new OpenCodianStartupCoordinator();
  private settingsRuntimeCoordinator: OpenCodianSettingsRuntimeCoordinator | null = null;

  private getSettingsRuntimeCoordinator(): OpenCodianSettingsRuntimeCoordinator {
    if (!this.settingsRuntimeCoordinator) {
      this.settingsRuntimeCoordinator = new OpenCodianSettingsRuntimeCoordinator({
        getSettings: () => this.settings,
        setSettings: (settings) => { this.settings = settings; },
        getOpenCodeService: () => this.openCodeService,
        getStorageService: () => this.storage,
        getVaultBasePath: () => getVaultBasePath(this.app),
        refreshOpenCodianViews: (options) => this.runtimeCoordinator.refreshOpenCodianViews(options),
        invalidateSlashCommandMenuCatalogs: (options) => this.runtimeCoordinator.invalidateSlashCommandMenuCatalogs(options),
        scheduleDeferredRuntimeWarmup: () => this.runtimeCoordinator.scheduleDeferredRuntimeWarmup(),
        applyProviderIconColorMode: () => this.applyProviderIconColorMode(),
        getOpenCodianLeaves: () => this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN),
        onSettingsPersistenceBlocked: (message) => this.warnSettingsPersistenceBlocked(message),
      });
    }
    return this.settingsRuntimeCoordinator;
  }

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
    void this.runtimeCoordinator.checkPluginUpdateOnStartup();
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
    this.pluginUpdateService = new PluginUpdateService({
      app: this.app,
      manifest: this.manifest,
      initialState: this.settings.pluginUpdateState,
      persistState: async (state) => {
        this.settings.pluginUpdateState = state;
        await this.saveSettings({
          syncService: false,
          reloadModels: false,
          syncConfig: false,
          applyUi: false,
        });
      },
    });
    await coordinator.measureStartupStep('loadModelPricingCatalog', async () => {
      this.modelPricingService = new ModelPricingService({
        storage: this.storage,
        getOverrides: () => this.settings.modelPricingOverrides,
      });
      await this.modelPricingService.load();
    });
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

      // Wire agent service registry
      this.agentServiceRegistry = new AgentServiceRegistry();
      const openCodeAdapter = new OpenCodeAdapter(this.openCodeService);
      const userAdapters: import('./core/agents/backend/AgentService').AgentService[] = [openCodeAdapter];
      const vaultPath = getVaultBasePath(this.app);
      if (vaultPath) {
        const permissionHost = createClaudeCodePermissionBridgeHost(() => this.claudeCodePermissionHostContext);
        this.claudeCodePermissionBridge = createClaudeCodePermissionBridge(permissionHost);
        userAdapters.push(new ClaudeCodeAdapter({
          vaultPath,
          settings: this.settings.backendSettings.claudeCode,
          pathToClaudeCodeExecutable: this.getBundledClaudeCodeExecutablePath(vaultPath),
          sdkLoader: loadClaudeCodeSdk,
          permissionBridge: this.claudeCodePermissionBridge,
          onElicitation: (request, options) => this.handleClaudeCodeElicitation(request, options),
          mcpConfigLoader: async () => {
            if (!this.opencodeConfigManager) {
              return {};
            }
            try {
              const { McpConfigService } = await import('./core/config/McpConfigService');
              const mcpConfigService = new McpConfigService(this.opencodeConfigManager);
              const servers = await mcpConfigService.readProjectServers();
              return adaptMcpConfigForClaude(servers);
            } catch {
              return {};
            }
          },
        }));
      }
      wireHiddenAdapters({
        registry: this.agentServiceRegistry,
        adapters: userAdapters,
        vaultPath: vaultPath ?? undefined,
        pluginDir: vaultPath
          ? path.join(vaultPath, this.manifest.dir?.trim() || path.join('.obsidian', 'plugins', this.manifest.id?.trim() || 'opencodian'))
          : '',
        codexSettings: this.settings.backendSettings.codex,
      });
      this.agentServiceRegistry.setEnabledBackends(this.settings.enabledBackends);
      if (this.settings.activeBackend) {
        this.agentServiceRegistry.setActive(this.settings.activeBackend);
      }
      setAgentServiceRegistry(this.agentServiceRegistry);

      // Wire the Codex approval bridge host to the mutable context the chat
      // view populates on mount.  Mirrors the Claude permission host wiring.
      const codexAdapter = this.agentServiceRegistry.get('codex');
      if (codexAdapter instanceof CodexAdapter) {
        codexAdapter.setApprovalHost(
          createCodexApprovalBridgeHost(() => this.codexApprovalHostContext),
        );
      }

      // Auto-start the active adapter so it reaches connected state.
      // OpenCodeAdapter.start() is idempotent (ServerManager returns if already running).
      // Non-OpenCode adapters (Codex, Claude-Code) create their connection here.
      const activeKind = this.agentServiceRegistry.getActiveKind();
      if (activeKind) {
        const activeAdapter = this.agentServiceRegistry.get(activeKind);
        if (activeAdapter) {
          activeAdapter.start().catch(() => {
            // Best effort: startup continues even if adapter fails to connect.
          });
        }
      }
    });

    await this.startupCoordinator.measureStartupStep('configureVaultScopedServices', () => {
      this.configureVaultScopedServices();
    });

    await this.startupCoordinator.measureStartupStep('loadConversations', () => this.loadConversations());
  }

  private getBundledClaudeCodeExecutablePath(vaultPath: string): string {
    const pluginId = this.manifest.id?.trim() || 'opencodian';
    const pluginDir = this.manifest.dir?.trim()
      ? this.manifest.dir
      : path.join((this.app.vault as { configDir?: string }).configDir ?? '.obsidian', 'plugins', pluginId);
    const platformPackage = this.getClaudeAgentSdkPlatformPackageName();
    const binaryName = process.platform === 'win32' ? 'claude.exe' : 'claude';
    return path.join(
      vaultPath,
      pluginDir,
      'node_modules',
      '@anthropic-ai',
      platformPackage,
      binaryName,
    );
  }

  private async handleClaudeCodeElicitation(
    request: ElicitationRequest,
    options: { signal: AbortSignal },
  ): Promise<ElicitationResult> {
    if (options.signal.aborted) {
      return { action: 'cancel' };
    }

    const ctx = this.claudeCodePermissionHostContext;
    const renderer = ctx.elicitationCardRenderer;
    if (!renderer) {
      return { action: 'cancel' };
    }

    const questionRequest = buildClaudeCodeElicitationQuestionRequest(request);
    const response = await renderer.collectResponse(questionRequest, ctx.getActiveTabId());
    if (!response) {
      return { action: 'cancel' };
    }
    if (response.action !== 'accept') {
      return { action: response.action };
    }
    if (
      questionRequest.questions.length === 1
      && questionRequest.questions[0].options.some((option) => option.label === 'Decline')
      && response.answers?.[0]?.[0] === 'Decline'
    ) {
      return { action: 'decline' };
    }

    return {
      action: 'accept',
      content: normalizeClaudeCodeElicitationContent(response.content)
        ?? buildClaudeCodeElicitationContent(questionRequest, response.answers ?? [], request),
    };
  }

  private getClaudeAgentSdkPlatformPackageName(): string {
    const key = `${process.platform}-${process.arch}`;
    const packages: Record<string, string> = {
      'darwin-arm64': 'claude-agent-sdk-darwin-arm64',
      'darwin-x64': 'claude-agent-sdk-darwin-x64',
      'linux-arm64': 'claude-agent-sdk-linux-arm64',
      'linux-x64': 'claude-agent-sdk-linux-x64',
      'win32-arm64': 'claude-agent-sdk-win32-arm64',
      'win32-x64': 'claude-agent-sdk-win32-x64',
    };
    return packages[key] ?? `claude-agent-sdk-${process.platform}-${process.arch}`;
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

    // Skip server startup if OpenCode agent is not the active backend
    if (this.settings.activeBackend !== 'opencode') {
      logger.debug('OpenCode is not the active backend — skipping local server startup');
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

    registerSettingsView(this);

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
        await this.startNewConversationForCurrentView();
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
    // Stop the OpenCode server (async, best-effort)
    void this.openCodeService?.stop().catch((error) => {
      logger.warn('Failed to asynchronously stop OpenCode service during unload:', error);
    });
    // Dispose registry (which disposes adapters, which disposes OpenCodeService)
    this.agentServiceRegistry?.dispose();
    setAgentServiceRegistry(null);
    this.getSettingsRuntimeCoordinator().clearChatAppearanceSaveTimer();
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

  async startNewConversationForCurrentView(): Promise<void> {
    await this.activateView();
    await this.getOpenCodianView()?.createConversationInCurrentTab();
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
    this.getSettingsRuntimeCoordinator().initialize(this.settingsPersistenceWritable);

    this.reportSettingsLoadState(loadState.persistedSettings);

    await this.migrateOpenCodeCapabilitySettingsEnvelope(loadState.settings.opencodeCapabilities);

    if (loadState.shouldPersistNormalizedSettings) {
      await this.startupCoordinator.measureStartupStep(
        'persistNormalizedSettings',
        () => this.getSettingsRuntimeCoordinator().persistSettingsDomains({ core: true, ui: true }),
        { detail: 'startup normalization backfill' },
      );
    }
  }

  /** Save settings to storage */
  async saveSettings(options: { syncService?: boolean; reloadModels?: boolean; syncConfig?: boolean; applyUi?: boolean } = {}) {
    return this.getSettingsRuntimeCoordinator().saveSettings(options);
  }

  /**
   * Invalidate the slash-command / runtime menu catalog so the next `/` or
   * resource open reflects project-level changes (e.g. Claude/Codex project
   * commands/skills/agents edited in the resource settings). Runtime
   * supportedCommands()/supportedAgents() remains the final menu truth.
   */
  invalidateSlashCommandCatalog(options: { preload?: boolean } = {}): void {
    this.runtimeCoordinator.invalidateSlashCommandMenuCatalogs(options);
  }

  private applyLoggerSettings(): void {
    const settings = this.settings;
    setDebugLoggingEnabled(settings.enableDebugLogging);
    setDebugModuleSettings(settings.debugModuleSettings);
    setClaudeCodeDebugChannelSettings(settings.backendSettings.claudeCode.debugChannels);
    setDebugRefreshIntervalMs(settings.debugRefreshIntervalMs);
    setInlineSerializedDebugLogArgsEnabled(settings.inlineSerializedDebugLogArgs);
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
    return this.getSettingsRuntimeCoordinator().getActiveThemePresetDefinition();
  }

  getChatAppearanceBaseline(): ChatAppearanceSettings {
    return this.getSettingsRuntimeCoordinator().getChatAppearanceBaseline();
  }

  selectThemePreset(presetId: ThemePresetId): void {
    this.getSettingsRuntimeCoordinator().selectThemePreset(presetId);
  }

  updateChatAppearance(mutator: (appearance: ChatAppearanceSettings) => void): void {
    this.getSettingsRuntimeCoordinator().updateChatAppearance(mutator);
  }

  resetChatAppearanceToBaseline(): void {
    this.getSettingsRuntimeCoordinator().resetChatAppearanceToBaseline();
  }

  resetChatAppearanceGroup(
    group: 'layout' | 'background' | 'user' | 'assistant' | 'input' | 'scrollbar' | 'advanced',
  ): void {
    this.getSettingsRuntimeCoordinator().resetChatAppearanceGroup(group);
  }

  async selectThemePresetAndSave(presetId: ThemePresetId): Promise<void> {
    return this.getSettingsRuntimeCoordinator().selectThemePresetAndSave(presetId);
  }

  async resetChatAppearanceToBaselineAndSave(): Promise<void> {
    return this.getSettingsRuntimeCoordinator().resetChatAppearanceToBaselineAndSave();
  }

  async resetThemePresetAppearanceAndSave(): Promise<void> {
    return this.getSettingsRuntimeCoordinator().resetThemePresetAppearanceAndSave();
  }

  async resetChatAppearanceGroupAndSave(
    group: 'layout' | 'background' | 'user' | 'assistant' | 'input' | 'scrollbar' | 'advanced',
  ): Promise<void> {
    return this.getSettingsRuntimeCoordinator().resetChatAppearanceGroupAndSave(group);
  }

  async importChatThemeBackgroundFile(file: File): Promise<void> {
    return this.getSettingsRuntimeCoordinator().importChatThemeBackgroundFile(file);
  }

  async clearChatThemeBackground(): Promise<void> {
    return this.getSettingsRuntimeCoordinator().clearChatThemeBackground();
  }

  async resolveChatThemeBackgroundDataUrl(): Promise<string | null> {
    return this.getSettingsRuntimeCoordinator().resolveChatThemeBackgroundDataUrl();
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

  scheduleChatAppearanceSave(delay = 220): void {
    this.getSettingsRuntimeCoordinator().scheduleChatAppearanceSave(delay);
  }

  scheduleSettingsUiStateSave(delay = 220): void {
    this.getSettingsRuntimeCoordinator().scheduleSettingsUiStateSave(delay);
  }

  async saveSettingsUiStateImmediately(): Promise<void> {
    return this.getSettingsRuntimeCoordinator().saveSettingsUiStateImmediately();
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

    const raw = [
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
      '## Claude Code',
      `Enabled: ${this.settings.enabledBackends.includes('claude-code')}`,
      `Active: ${this.settings.activeBackend === 'claude-code'}`,
      `Debug module enabled: ${this.settings.debugModuleSettings.claudeCode}`,
      `Model: ${this.settings.backendSettings.claudeCode.model || '(default)'}`,
      `Effort: ${this.settings.backendSettings.claudeCode.effort}`,
      `Permission mode: ${this.settings.backendSettings.claudeCode.permissionMode}`,
      `Setting sources: ${this.settings.backendSettings.claudeCode.settingSources.join(', ') || '(none)'}`,
      `Additional directories: ${this.settings.backendSettings.claudeCode.additionalDirectories.length}`,
      'MCP servers configured: loaded from project MCP config at runtime',
      `Environment variables configured: ${Object.keys(this.settings.backendSettings.claudeCode.env).length}`,
      `File checkpoint: ${this.settings.backendSettings.claudeCode.enableFileCheckpointing}`,
      `Hook event stream: ${this.settings.backendSettings.claudeCode.includeHookEvents}`,
      `Forward subagent text: ${this.settings.backendSettings.claudeCode.forwardSubagentText}`,
      `Subagent progress summaries: ${this.settings.backendSettings.claudeCode.agentProgressSummaries}`,
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

    return sanitizeDiagnosticReport(raw);
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
          backend: meta.backend,
          openCodeSessionId: meta.openCodeSessionId ?? meta.id,
          backendSessionId: meta.backendSessionId ?? meta.openCodeSessionId ?? meta.id,
          backendAgentId: meta.backendAgentId,
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
    const activeBackend = this.settings.activeBackend ?? 'opencode';
    const activeBackendAdapter = Array.isArray(this.settings.enabledBackends) && this.settings.enabledBackends.includes(activeBackend)
      ? this.agentServiceRegistry?.get(activeBackend)
      : null;
    const sessionBackend = hasSessionCreationCapability(activeBackendAdapter) ? activeBackendAdapter : null;
    if (!sessionBackend && activeBackend === 'opencode') {
      if (!Array.isArray(this.settings.enabledBackends) || !this.settings.enabledBackends.includes('opencode')) {
        throw new Error('Cannot create conversation: opencode backend is not enabled');
      }

      await this.runtimeCoordinator.ensureRuntimeWarmupReadyForSessionBootstrap();
      const sessionId = await this.openCodeService.createSession();
      return this.createConversationRecord('opencode', sessionId);
    }
    if (!sessionBackend) {
      throw new Error('Cannot create conversation: active backend does not support sessions');
    }
    if (sessionBackend.kind === 'opencode') {
      await this.runtimeCoordinator.ensureRuntimeWarmupReadyForSessionBootstrap();
    }

    const sessionId = await sessionBackend.createSession();

    return this.createConversationRecord(sessionBackend.kind, sessionId);
  }

  private async createConversationRecord(
    backend: AgentBackendKind,
    sessionId: string,
  ): Promise<Conversation> {
    const conversation: Conversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      title: this.getEmptyConversationTitle(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      backend,
      ...(backend === 'opencode' ? { openCodeSessionId: sessionId } : {}),
      backendSessionId: sessionId,
      messages: [],
    };

    this.conversations.unshift(conversation);
    this.touchConversationFullMessageCache(conversation.id);
    await this.storage.saveConversation(conversation);

    return conversation;
  }

  async createConversationFromSession(
    sessionId: string,
    initial?: Partial<Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'openCodeSessionId' | 'backendSessionId'>>,
  ): Promise<Conversation> {
    const backend = initial?.backend ?? this.settings.activeBackend ?? 'opencode';
    const conversation: Conversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      title: initial?.title || this.getEmptyConversationTitle(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      backend,
      ...(backend === 'opencode' ? { openCodeSessionId: sessionId } : {}),
      backendSessionId: sessionId,
      messages: initial?.messages ? JSON.parse(JSON.stringify(initial.messages)) as Conversation['messages'] : [],
      currentNote: initial?.currentNote,
      externalContextPaths: initial?.externalContextPaths ? [...initial.externalContextPaths] : undefined,
      sessionSettings: initial?.sessionSettings ? JSON.parse(JSON.stringify(initial.sessionSettings)) as Conversation['sessionSettings'] : undefined,
      lastResponseAt: initial?.lastResponseAt,
      titleGenerationStatus: initial?.titleGenerationStatus,
    };

    this.conversations.unshift(conversation);
    this.touchConversationFullMessageCache(conversation.id);
    if (conversation.messages.length > 0) {
      this.trimConversationFullMessageCache();
    }
    await this.storage.saveConversation(conversation);
    return conversation;
  }

  /**
   * Minimal bridge for external hosts (e.g. settings-side backend session browser)
   * to resume a backend session into a new conversation.
   */
  async createConversationFromBackendSession(
    sessionId: string,
    title: string,
    initialMessages?: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: number }>,
    backend?: AgentBackendKind,
  ): Promise<string | null> {
    const resolvedBackend = backend ?? this.settings.activeBackend ?? 'opencode';
    const conversation = await this.createConversationFromSession(sessionId, {
      title,
      backend: resolvedBackend,
      messages: initialMessages as ChatMessage[] | undefined,
    });
    return conversation.id;
  }

  /**
   * Minimal bridge for external hosts to activate the chat view and load
   * a resumed conversation. Delegates to the active OpenCodianView seam.
   */
  async loadBackendSessionConversation(conversationId: string): Promise<void> {
    await this.activateView();
    await this.getOpenCodianView()?.loadConversationForExternalHost(conversationId);
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    const index = this.conversations.findIndex((item) => item.id === conversation.id);
    let nextConversation = conversation;

    if (
      index !== -1
      && conversation.messages.length === 0
      && (this.conversationFullMessageCache.isEvicted(conversation.id)
        || this.conversations[index].messages.length === 0)
    ) {
      const fullConversation = await this.storage.loadFullConversation(conversation.id);
      if (fullConversation && fullConversation.messages.length > 0) {
        nextConversation = {
          ...conversation,
          messages: fullConversation.messages,
        };
      }
    }

    if (index === -1) {
      this.conversations.unshift(nextConversation);
    } else {
      this.conversations[index] = nextConversation;
    }

    this.touchConversationFullMessageCache(nextConversation.id);
    this.trimConversationFullMessageCache();

    await this.storage.saveConversation(nextConversation);
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
      this.touchConversationFullMessageCache(fullConversation.id);
      this.trimConversationFullMessageCache();
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
    this.conversationFullMessageCache.forget(id);

    const backendSessionId = getConversationBackendSessionId(conversation);
    const sessionBackend = getConversationSessionBackendService(this.agentServiceRegistry, conversation);
    if (backendSessionId && sessionBackend) {
      try {
        await sessionBackend.deleteSession(backendSessionId);
      } catch {
        // Ignore errors
      }
    }

    // Delete from storage
    await this.storage.deleteConversation(id);
  }

  private touchConversationFullMessageCache(id: string): void {
    this.conversationFullMessageCacheClock = Math.max(Date.now(), this.conversationFullMessageCacheClock + 1);
    this.conversationFullMessageCache.touch(id, this.conversationFullMessageCacheClock);
  }

  registerConversationCachePinProvider(provider: ConversationCachePinProvider): void {
    this.conversationCachePinProviders.add(provider);
    this.trimConversationFullMessageCache();
  }

  unregisterConversationCachePinProvider(provider: ConversationCachePinProvider): void {
    this.conversationCachePinProviders.delete(provider);
    this.trimConversationFullMessageCache();
  }

  trimConversationFullMessageCache(): void {
    const snapshot = this.conversationFullMessageCache.trim(
      this.conversations,
      this.getConversationCachePinnedIds(),
    );
    if (snapshot.evictedConversationIds.length > 0) {
      logger.debug('Trimmed full conversation messages from memory cache', {
        evictedConversationIds: snapshot.evictedConversationIds,
        pinnedConversationIds: snapshot.pinnedConversationIds,
        fullConversationIds: snapshot.fullConversationIds,
      });
    }
  }

  private getConversationCachePinnedIds(): ReadonlySet<string> {
    const pinnedIds = new Set<string>();

    for (const provider of this.conversationCachePinProviders) {
      for (const id of provider()) {
        if (typeof id === 'string' && id.length > 0) {
          pinnedIds.add(id);
        }
      }
    }

    return pinnedIds;
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

  private handleModelsLoaded(): void {
    this.runtimeCoordinator.queueModelRefresh();
  }

  private handleOpenCodeServerStatusChange(status: string): void {
    logger.debug(`Server status changed: ${status}`);
    this.settingsTab?.refreshServerStatusDisplay();
    broadcastServerStatusToSettingsViews(this);
    // Forward to adapter for registry-level status subscribers
    const adapter = this.agentServiceRegistry?.get('opencode');
    if (adapter && 'notifyStatusChange' in adapter) {
      (adapter as import('./core/agents/backend/OpenCodeAdapter').OpenCodeAdapter).notifyStatusChange(status);
    }
    if (status === 'running') {
      this.runtimeCoordinator.invalidateSlashCommandMenuCatalogs({ preload: true });
    }
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

  /**
   * Run the versioned OpenCode capability settings migration on the loaded
   * envelope and surface a startup notice. When the migration cannot safely
   * map a field, the unmodified raw value is snapshotted to a backup path via
   * StorageService before the normalized envelope is kept. The notice never
   * exposes raw backup content or secret values.
   */
  private async migrateOpenCodeCapabilitySettingsEnvelope(raw: unknown): Promise<void> {
    const migration = migrateOpenCodeCapabilitySettings(raw, Date.now());
    this.settings = { ...this.settings, opencodeCapabilities: migration.normalized };

    if (migration.requiresBackup) {
      await this.storage.snapshotRawCapabilitySettings(raw);
      const impossibleCount = migration.report.entries.filter((e) => e.outcome === 'impossible').length;
      const message = impossibleCount > 0
        ? `OpenCodian preserved ${impossibleCount} capability preference field(s) in a backup; some legacy values could not be auto-migrated.`
        : 'OpenCodian updated capability preferences and kept a backup of the previous values.';
      logger.warn(message, { entryCount: migration.report.entries.length });
      new Notice(message, 6000);
      return;
    }

    const migratedCount = migration.report.entries.filter((e) => e.outcome === 'migrated').length;
    if (migratedCount > 0) {
      const message = `OpenCodian migrated ${migratedCount} capability preference field(s) to the current schema.`;
      logger.info(message);
      new Notice(message, 5000);
    }
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
