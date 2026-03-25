/**
 * OpenCodian - Obsidian plugin entry point
 * 
 * Registers the sidebar chat view, settings tab, and commands.
 * Manages conversation persistence and server lifecycle.
 */

import * as fs from 'fs';
import type { Editor, MarkdownView } from 'obsidian';
import { Notice, Plugin } from 'obsidian';
import * as path from 'path';

import { ModelConfigService, OpencodeConfigManager } from './core/config';
import { OpenCodeService } from './core/opencode';
import { StorageService } from './core/storage';
import type { Conversation, OpenCodianSettings, PlatformDebugLogPaths } from './core/types';
import {
  DEFAULT_SETTINGS,
  getCurrentPlatformDebugLogPath,
  getCurrentPlatformKey,
  getServerBaseUrl,
  isLocalServerMode,
  VIEW_TYPE_OPENCODIAN,
} from './core/types';
import { OpenCodianView } from './features/chat/OpenCodianView';
import { OpenCodianSettingTab } from './features/settings/OpenCodianSettings';
import { setLocale } from './i18n';
import { createLogger, getRecentLogText, getVaultBasePath, setDebugLoggingEnabled } from './shared';

const logger = createLogger('OpenCodian');

/** Main plugin class */
export default class OpenCodianPlugin extends Plugin {
  settings: OpenCodianSettings;
  storage: StorageService;
  openCodeService: OpenCodeService;
  opencodeConfigManager: OpencodeConfigManager | null = null;
  modelConfigService: ModelConfigService | null = null;
  settingsTab?: InstanceType<typeof OpenCodianSettingTab>;
  
  private conversations: Conversation[] = [];

  async onload() {
    // Initialize storage
    this.storage = new StorageService(this);
    await this.storage.initialize();

    // Load settings
    await this.loadSettings();
    this.applyLoggerSettings();

    // Initialize locale
    setLocale(this.settings.locale as 'en' | 'zh');

    // Auto-create OpenCode config file based on permission mode
    await this.initializeOpencodeConfig();

    // Initialize OpenCode service
    this.openCodeService = new OpenCodeService(this.settings, {
      onServerStatusChange: (status) => {
        logger.debug(`Server status changed: ${status}`);
        this.settingsTab?.refreshServerStatusDisplay();
      },
      onError: (error) => {
        new Notice(`OpenCode error: ${error.message}`);
      },
      onModelsLoaded: (_providers) => {
        // Auto-save settings when models are loaded and defaults are updated
        void this.saveSettings();

        // Notify settings tab to refresh dropdowns if it's open
        this.settingsTab?.onModelsLoaded();
      },
    });

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

    // Register view
    this.registerView(
      VIEW_TYPE_OPENCODIAN,
      (leaf) => new OpenCodianView(leaf, this)
    );

    // Add ribbon icon
    this.addRibbonIcon('bot', 'Open OpenCodian', () => {
      this.activateView();
    });

    // Register commands
    this.addCommand({
      id: 'open-view',
      name: 'Open chat view',
      callback: () => {
        this.activateView();
      },
    });

    this.addCommand({
      id: 'new-conversation',
      name: 'New conversation',
      callback: async () => {
        await this.createConversation();
      },
    });

    this.addCommand({
      id: 'inline-edit',
      name: 'Inline edit',
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const selectedText = editor.getSelection();
        const notePath = view.file?.path || 'unknown';

        // TODO: Implement inline edit modal
        new Notice('Inline edit: ' + (selectedText ? 'selection' : 'cursor') + ' at ' + notePath);
      },
    });

    // Add settings tab
    this.settingsTab = new OpenCodianSettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);

    // Load conversations
    await this.loadConversations();


  }

  onunload() {
    // Stop OpenCode service
    void this.openCodeService.stop();

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

  /** Load settings from storage */
  async loadSettings() {
    const savedSettings = await this.storage.loadSettings();
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

    const normalizedSettings = savedSettings
      ? {
          ...savedSettings,
          server: normalizedServer,
          chatScrollMode:
            (savedSettings.chatScrollMode as OpenCodianSettings['chatScrollMode'] | 'sticky' | undefined) === 'sticky'
              ? 'sticky-mask'
              : savedSettings.chatScrollMode,
          debugLogPaths: normalizedDebugLogPaths,
        }
      : null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...normalizedSettings,
      server: normalizedServer,
      debugLogPaths: normalizedDebugLogPaths,
    };
  }

  /** Save settings to storage */
  async saveSettings() {
    await this.storage.saveSettings(this.settings);
    this.applyLoggerSettings();
    
    // Update service with new settings
    this.openCodeService.updateSettings(this.settings);

    // Refresh any open chat views that depend on UI settings
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN)) {
      const view = leaf.view;
      if (view instanceof OpenCodianView) {
        view.applyChatScrollMode();
        void view.reloadModelCatalog();
      }
    }
    
    // Sync OpenCode config with permission mode
    await this.syncOpencodeConfig();
  }

  private applyLoggerSettings(): void {
    setDebugLoggingEnabled(this.settings.enableDebugLogging);
  }

  async logServerStatusSnapshot(source = 'manual'): Promise<void> {
    const isHealthy = await this.openCodeService.checkHealth();
    const internalStatus = this.openCodeService.getServerStatus();
    const hasManagedProcess = this.openCodeService.isServerProcessRunning();
    logger.debug(
      `Server snapshot [${source}] -> health=${isHealthy ? 'ok' : 'fail'}, status=${internalStatus}, managedProcess=${hasManagedProcess}`
    );
  }

  async buildDiagnosticReport(source = 'manual'): Promise<string> {
    const vaultPath = getVaultBasePath(this.app) ?? 'Unavailable';
    const isHealthy = await this.openCodeService.checkHealth();
    const internalStatus = this.openCodeService.getServerStatus();
    const managedProcess = this.openCodeService.isServerProcessRunning();

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
  async loadConversations() {
    const metas = await this.storage.listConversations();
    
    // Convert metadata to conversations (without messages)
    this.conversations = metas.map((meta) => ({
      id: meta.id,
      title: meta.title,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      lastResponseAt: meta.lastResponseAt,
      // Use stored openCodeSessionId or fallback to conversation ID
      openCodeSessionId: meta.openCodeSessionId ?? meta.id,
      messages: [],
    }));
  }

  /** Create a new conversation */
  async createConversation(): Promise<Conversation> {
    // Create session in OpenCode
    const sessionId = await this.openCodeService.createSession();
    
    const conversation: Conversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      title: this.generateDefaultTitle(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      openCodeSessionId: sessionId,
      messages: [],
    };

    this.conversations.unshift(conversation);
    await this.storage.saveConversation(conversation);

    return conversation;
  }

  /** Get all conversations */
  getConversations(): Conversation[] {
    return [...this.conversations];
  }

  /** Get conversation by ID (with messages loaded from storage) */
  async getConversationById(id: string): Promise<Conversation | undefined> {
    // First check in-memory cache
    const cached = this.conversations.find((c) => c.id === id);
    if (!cached) return undefined;
    
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

  /** Generate default conversation title */
  private generateDefaultTitle(): string {
    const now = new Date();
    return now.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

// Export type for use in other modules
export type { OpenCodianPlugin };
