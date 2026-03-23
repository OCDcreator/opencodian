/**
 * OpenCodian - Obsidian plugin entry point
 * 
 * Registers the sidebar chat view, settings tab, and commands.
 * Manages conversation persistence and server lifecycle.
 */

import type { Editor, MarkdownView } from 'obsidian';
import { Notice, Plugin } from 'obsidian';

import { OpenCodianView } from './features/chat/OpenCodianView';

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
    setLocale(this.settings.locale);

    // Initialize OpenCode service
    this.openCodeService = new OpenCodeService(this.settings, {
      onServerStatusChange: (status) => {
        console.log('OpenCode server status:', status);
      },
      onError: (error) => {
        new Notice(`OpenCode error: ${error.message}`);
      },
      onModelsLoaded: (providers) => {
        // Auto-save settings when models are loaded and defaults are updated
        void this.saveSettings();
        console.log('[OpenCodian] Models loaded, settings updated:', {
          provider: this.settings.defaultProvider,
          model: this.settings.defaultModel,
          availableProviders: providers.map(p => p.id),
        });
        // Notify settings tab to refresh dropdowns if it's open
        this.settingsTab?.onModelsLoaded();
      },
    });

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

    console.log('OpenCodian plugin loaded');
  }

  onunload() {
    // Stop OpenCode service
    void this.openCodeService.stop();
    console.log('OpenCodian plugin unloaded');
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
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...savedSettings,
    };
  }

  /** Save settings to storage */
  async saveSettings() {
    await this.storage.saveSettings(this.settings);
    
    // Update service with new settings
    this.openCodeService.updateSettings(this.settings);
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

  /** Get conversation by ID */
  getConversationById(id: string): Conversation | undefined {
    return this.conversations.find((c) => c.id === id);
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
