/**
 * OpenCodian - Obsidian plugin entry point
 * 
 * Registers the sidebar chat view, settings tab, and commands.
 * Manages conversation persistence and server lifecycle.
 */

import type { Editor, MarkdownView } from 'obsidian';
import { Notice, Plugin } from 'obsidian';

import { OpenCodianView } from './features/chat/OpenCodianView';

import { OpencodeConfigManager } from './core/config';
import { OpenCodeService } from './core/opencode';
import { StorageService } from './core/storage';
import type { Conversation, OpenCodianSettings } from './core/types';
import { DEFAULT_SETTINGS, VIEW_TYPE_OPENCODIAN } from './core/types';
import { OpenCodianSettingTab } from './features/settings/OpenCodianSettings';
import { setLocale } from './i18n';

/** Main plugin class */
export default class OpenCodianPlugin extends Plugin {
  settings: OpenCodianSettings;
  storage: StorageService;
  openCodeService: OpenCodeService;
  settingsTab?: InstanceType<typeof OpenCodianSettingTab>;
  
  private conversations: Conversation[] = [];

  async onload() {
    // Initialize storage
    this.storage = new StorageService(this);
    await this.storage.initialize();

    // Load settings
    await this.loadSettings();

    // Initialize locale
    setLocale(this.settings.locale as 'en' | 'zh');

    // Auto-create OpenCode config file based on permission mode
    await this.initializeOpencodeConfig();

    // Initialize OpenCode service
    this.openCodeService = new OpenCodeService(this.settings, {
      onServerStatusChange: (status) => {

      },
      onError: (error) => {
        new Notice(`OpenCode error: ${error.message}`);
      },
      onModelsLoaded: (providers) => {
        // Auto-save settings when models are loaded and defaults are updated
        void this.saveSettings();

        // Notify settings tab to refresh dropdowns if it's open
        this.settingsTab?.onModelsLoaded();
      },
    });

    // Set vault path so OpenCode reads project config from .opencode/
    // This automatically adapts to Windows (C:\path) and macOS (/Users/path)
    const vaultPath = this.app.vault.adapter.getBasePath();
    if (vaultPath) {
      this.openCodeService.setVaultPath(vaultPath);
      console.log(`[OpenCodian] Vault path set to: ${vaultPath}`);
      console.log(`[OpenCodian] Platform: ${process.platform}`);
    } else {
      console.warn('[OpenCodian] Could not get vault path, OpenCode will use global config');
    }

    // Start server if auto-start is enabled
    if (this.settings.server.autoStart) {
      try {
        await this.openCodeService.start();
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to start server';
        new Notice(`OpenCode: ${msg}`);
      }
    }

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
    const normalizedSettings = savedSettings
      ? {
          ...savedSettings,
          chatScrollMode:
            savedSettings.chatScrollMode === 'sticky'
              ? 'sticky-mask'
              : savedSettings.chatScrollMode,
        }
      : null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...normalizedSettings,
    };
  }

  /** Save settings to storage */
  async saveSettings() {
    await this.storage.saveSettings(this.settings);
    
    // Update service with new settings
    this.openCodeService.updateSettings(this.settings);

    // Refresh any open chat views that depend on UI settings
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN)) {
      const view = leaf.view;
      if (view instanceof OpenCodianView) {
        view.applyChatScrollMode();
      }
    }
    
    // Sync OpenCode config with permission mode
    await this.syncOpencodeConfig();
  }

  /** Sync OpenCode config with current permission mode */
  private async syncOpencodeConfig(): Promise<void> {
    try {
      const vaultPath = this.app.vault.adapter.getBasePath();
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
      console.log(`[OpenCodian] OpenCode config updated to mode: ${this.settings.permissionMode}`);
      console.log(`[OpenCodian] Config file location: ${configManager.getConfigPath()}`);
      console.log(`[OpenCodian] Config permissions:`, JSON.stringify(config.permission, null, 2));
      
      // Show notice if server is running (needs restart)
      if (this.openCodeService?.checkHealth()) {
        console.log('[OpenCodian] OpenCode server is running. Config changes require restart to take effect.');
      }
    } catch (error) {
      console.error('[OpenCodian] Failed to sync OpenCode config:', error);
    }
  }

  /** Initialize OpenCode config file based on current permission mode */
  private async initializeOpencodeConfig(): Promise<void> {
    try {
      const vaultPath = this.app.vault.adapter.getBasePath();
      const configManager = new OpencodeConfigManager(vaultPath);
      
      // Check if config already exists
      const exists = await configManager.exists();
      if (exists) {
        // Config exists, no need to create
        return;
      }

      // Create config based on current permission mode
      console.log(`[OpenCodian] Creating OpenCode config with mode: ${this.settings.permissionMode}`);
      
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
      
      console.log(`[OpenCodian] OpenCode config created at: ${configManager.getConfigPath()}`);
    } catch (error) {
      console.error('[OpenCodian] Failed to initialize OpenCode config:', error);
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
