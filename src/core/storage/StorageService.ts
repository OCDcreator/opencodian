/**
 * Storage Service
 * 
 * Manages persistence of conversations and settings.
 * Uses Obsidian's file system adapter for storage.
 */

import { type App, normalizePath } from 'obsidian';

import type { OpenCodianPlugin } from '../../main';
import type { ManagedServerState } from '../opencode/types';
import type { ChatMessage, Conversation, ConversationMeta, OpenCodianSettings } from '../types';

const STORAGE_DIR = '.opencodian';
const SESSIONS_DIR = `${STORAGE_DIR}/sessions`;
const SETTINGS_FILE = `${STORAGE_DIR}/settings.json`;
const RUNTIME_FILE = `${STORAGE_DIR}/runtime.json`;

interface RuntimeState {
  managedServer: ManagedServerState | null;
}

export class StorageService {
  private app: App;
  private vaultPath: string;

  constructor(plugin: OpenCodianPlugin) {
    this.app = plugin.app;
    this.vaultPath = (this.app.vault.adapter as unknown as { basePath: string }).basePath;
  }

  /** Initialize storage directories */
  async initialize(): Promise<void> {
    await this.ensureDir(STORAGE_DIR);
    await this.ensureDir(SESSIONS_DIR);
  }

  /** Save conversation with all messages */
  async saveConversation(conversation: Conversation): Promise<void> {
    const path = `${SESSIONS_DIR}/${conversation.id}.json`;
    
    // Save full conversation data including messages
    const data = {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastResponseAt: conversation.lastResponseAt,
      titleGenerationStatus: conversation.titleGenerationStatus,
      messageCount: conversation.messages.length,
      openCodeSessionId: conversation.openCodeSessionId,
      currentNote: conversation.currentNote,
      externalContextPaths: conversation.externalContextPaths,
      messages: conversation.messages,  // Save full messages with contentBlocks
    };

    await this.app.vault.adapter.write(
      normalizePath(path),
      JSON.stringify(data, null, 2)
    );
  }

  /** Load full conversation with messages */
  async loadFullConversation(id: string): Promise<Conversation | null> {
    const path = `${SESSIONS_DIR}/${id}.json`;
    
    try {
      const content = await this.app.vault.adapter.read(normalizePath(path));
      const data = JSON.parse(content) as Conversation & { messageCount?: number };
      // Ensure messages array exists
      if (!data.messages) {
        data.messages = [];
      }
      return data;
    } catch {
      return null;
    }
  }

  /** Load conversation metadata only */
  async loadConversation(id: string): Promise<ConversationMeta | null> {
    const path = `${SESSIONS_DIR}/${id}.json`;
    
    try {
      const content = await this.app.vault.adapter.read(normalizePath(path));
      const data = JSON.parse(content) as ConversationMeta & { messages?: ChatMessage[] };
      return {
        id: data.id,
        title: data.title,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        lastResponseAt: data.lastResponseAt,
        titleGenerationStatus: data.titleGenerationStatus,
        messageCount: data.messages?.length ?? data.messageCount ?? 0,
        openCodeSessionId: data.openCodeSessionId,
      };
    } catch {
      return null;
    }
  }

  /** List all conversations */
  async listConversations(): Promise<ConversationMeta[]> {
    const files = await this.app.vault.adapter.list(normalizePath(SESSIONS_DIR));
    const conversations: ConversationMeta[] = [];

    for (const file of files.files) {
      if (file.endsWith('.json')) {
        const id = file.split('/').pop()?.replace('.json', '');
        if (id) {
          const conv = await this.loadConversation(id);
          if (conv) {
            conversations.push(conv);
          }
        }
      }
    }

    // Sort by last response time (newest first)
    return conversations.sort((a, b) => 
      (b.lastResponseAt ?? b.updatedAt) - (a.lastResponseAt ?? a.updatedAt)
    );
  }

  /** Delete a conversation */
  async deleteConversation(id: string): Promise<void> {
    const path = `${SESSIONS_DIR}/${id}.json`;
    
    try {
      await this.app.vault.adapter.remove(normalizePath(path));
    } catch {
      // Ignore if file doesn't exist
    }
  }

  /** Save plugin settings */
  async saveSettings(settings: OpenCodianSettings): Promise<void> {
    await this.app.vault.adapter.write(
      normalizePath(SETTINGS_FILE),
      JSON.stringify(settings, null, 2)
    );
  }

  /** Load plugin settings */
  async loadSettings(): Promise<Partial<OpenCodianSettings> | null> {
    try {
      const content = await this.app.vault.adapter.read(normalizePath(SETTINGS_FILE));
      return JSON.parse(content) as OpenCodianSettings;
    } catch {
      return null;
    }
  }

  async saveManagedServerState(state: ManagedServerState | null): Promise<void> {
    const runtime = await this.loadRuntimeState();
    runtime.managedServer = state;
    await this.app.vault.adapter.write(
      normalizePath(RUNTIME_FILE),
      JSON.stringify(runtime, null, 2),
    );
  }

  async loadManagedServerState(): Promise<ManagedServerState | null> {
    const runtime = await this.loadRuntimeState();
    return runtime.managedServer ?? null;
  }

  /** Ensure directory exists */
  private async ensureDir(dir: string): Promise<void> {
    const exists = await this.app.vault.adapter.exists(normalizePath(dir));
    if (!exists) {
      await this.app.vault.adapter.mkdir(normalizePath(dir));
    }
  }

  private async loadRuntimeState(): Promise<RuntimeState> {
    try {
      const content = await this.app.vault.adapter.read(normalizePath(RUNTIME_FILE));
      const parsed = JSON.parse(content) as Partial<RuntimeState>;
      return {
        managedServer: parsed.managedServer ?? null,
      };
    } catch {
      return {
        managedServer: null,
      };
    }
  }
}
