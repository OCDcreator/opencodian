/**
 * Storage Service
 * 
 * Manages persistence of conversations and settings.
 * Uses Obsidian's file system adapter for storage.
 */

import { type App, normalizePath } from 'obsidian';

import type { Conversation, ConversationMeta, OpenCodianSettings } from '../types';
import type { OpenCodianPlugin } from '../../main';

const STORAGE_DIR = '.opencodian';
const SESSIONS_DIR = `${STORAGE_DIR}/sessions`;
const SETTINGS_FILE = `${STORAGE_DIR}/settings.json`;

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

  /** Save conversation metadata */
  async saveConversation(conversation: Conversation): Promise<void> {
    const path = `${SESSIONS_DIR}/${conversation.id}.json`;
    const data: ConversationMeta & { openCodeSessionId?: string } = {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastResponseAt: conversation.lastResponseAt,
      messageCount: conversation.messages.length,
      openCodeSessionId: conversation.openCodeSessionId,
    };

    await this.app.vault.adapter.write(
      normalizePath(path),
      JSON.stringify(data, null, 2)
    );
  }

  /** Load conversation metadata */
  async loadConversation(id: string): Promise<ConversationMeta | null> {
    const path = `${SESSIONS_DIR}/${id}.json`;
    
    try {
      const content = await this.app.vault.adapter.read(normalizePath(path));
      return JSON.parse(content) as ConversationMeta;
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

  /** Ensure directory exists */
  private async ensureDir(dir: string): Promise<void> {
    const exists = await this.app.vault.adapter.exists(normalizePath(dir));
    if (!exists) {
      await this.app.vault.adapter.mkdir(normalizePath(dir));
    }
  }
}
