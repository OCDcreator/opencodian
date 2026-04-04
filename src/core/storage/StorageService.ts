/**
 * Storage Service
 * 
 * Manages persistence of conversations and settings.
 * Uses Obsidian's file system adapter for storage.
 */

import { type App, normalizePath } from 'obsidian';
import * as path from 'path';

import type { OpenCodianPlugin } from '../../main';
import type { ManagedServerState } from '../opencode/types';
import type { ChatMessage, Conversation, ConversationMeta, OpenCodianSettings } from '../types';

const STORAGE_DIR = '.opencodian';
const SESSIONS_DIR = `${STORAGE_DIR}/sessions`;
const THEME_BACKGROUNDS_DIR = `${STORAGE_DIR}/theme-backgrounds`;
const SETTINGS_FILE = `${STORAGE_DIR}/settings.json`;
const RUNTIME_FILE = `${STORAGE_DIR}/runtime.json`;
const MAX_THEME_BACKGROUND_BYTES = 64 * 1024 * 1024;
const THEME_BACKGROUND_MIME_TO_EXTENSION: Record<string, string> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

interface StoredThemeBackgroundAsset {
  path: string;
  mimeType: string;
  displayName: string;
}

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
    await this.ensureDir(THEME_BACKGROUNDS_DIR);
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

  async saveThemeBackgroundAsset(
    data: ArrayBuffer,
    sourceName: string,
    hintedMimeType?: string,
  ): Promise<StoredThemeBackgroundAsset> {
    this.assertThemeBackgroundByteLength(data.byteLength);
    const mimeType = this.detectThemeBackgroundMimeType(data, hintedMimeType, sourceName);
    const extension = THEME_BACKGROUND_MIME_TO_EXTENSION[mimeType];
    if (!extension) {
      throw new Error('Only SVG, PNG, JPEG, WEBP, and GIF background images are supported.');
    }

    await this.ensureDir(THEME_BACKGROUNDS_DIR);

    const fileName = `theme-bg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const storedPath = normalizePath(`${THEME_BACKGROUNDS_DIR}/${fileName}`);
    const writeBinary = this.app.vault.adapter.writeBinary?.bind(this.app.vault.adapter) as
      | undefined
      | ((filePath: string, fileData: ArrayBuffer) => Promise<void>);
    if (!writeBinary) {
      throw new Error('Vault adapter does not support writing theme background images.');
    }

    await writeBinary(storedPath, data);

    return {
      path: storedPath,
      mimeType,
      displayName: path.basename(sourceName.trim() || fileName),
    };
  }

  async removeThemeBackground(storedPath: string | null | undefined): Promise<void> {
    if (!storedPath?.trim()) {
      return;
    }

    try {
      await this.app.vault.adapter.remove(normalizePath(storedPath));
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async readThemeBackgroundDataUrl(storedPath: string, hintedMimeType?: string): Promise<string | null> {
    const normalizedStoredPath = normalizePath(storedPath);
    const exists = await this.app.vault.adapter.exists(normalizedStoredPath);
    if (!exists) {
      return null;
    }

    const readBinary = this.app.vault.adapter.readBinary?.bind(this.app.vault.adapter) as
      | undefined
      | ((filePath: string) => Promise<ArrayBuffer>);
    if (!readBinary) {
      return null;
    }

    const data = await readBinary(normalizedStoredPath);
    const mimeType = this.detectThemeBackgroundMimeType(data, hintedMimeType, normalizedStoredPath);
    const base64 = Buffer.from(data).toString('base64');
    return `data:${mimeType};base64,${base64}`;
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

  private assertThemeBackgroundByteLength(byteLength: number): void {
    if (byteLength > MAX_THEME_BACKGROUND_BYTES) {
      throw new Error('The background image is too large. Maximum size is 64 MB.');
    }
  }

  private detectThemeBackgroundMimeType(
    data: ArrayBuffer,
    hintedMimeType?: string,
    sourceHint?: string,
  ): string {
    const normalizedHint = hintedMimeType?.split(';')[0]?.trim().toLowerCase();
    if (normalizedHint && Object.prototype.hasOwnProperty.call(THEME_BACKGROUND_MIME_TO_EXTENSION, normalizedHint)) {
      return normalizedHint;
    }

    const bytes = new Uint8Array(data);
    const textPrefix = Buffer.from(bytes.slice(0, Math.min(bytes.length, 2048)))
      .toString('utf-8')
      .replace(/^\uFEFF/, '')
      .trimStart();
    if (/<svg[\s>]/i.test(textPrefix) || (/^<\?xml/i.test(textPrefix) && /\.svg$/i.test(sourceHint ?? ''))) {
      return 'image/svg+xml';
    }

    if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return 'image/png';
    }

    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }

    if (bytes.length >= 6) {
      const signature = Buffer.from(bytes.slice(0, 6)).toString('ascii');
      if (signature === 'GIF87a' || signature === 'GIF89a') {
        return 'image/gif';
      }
    }

    if (bytes.length >= 12) {
      const riff = Buffer.from(bytes.slice(0, 4)).toString('ascii');
      const webp = Buffer.from(bytes.slice(8, 12)).toString('ascii');
      if (riff === 'RIFF' && webp === 'WEBP') {
        return 'image/webp';
      }
    }

    const extension = path.extname(sourceHint ?? '').toLowerCase();
    switch (extension) {
      case '.svg':
        return 'image/svg+xml';
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      default:
        throw new Error('Only SVG, PNG, JPEG, WEBP, and GIF background images are supported.');
    }
  }
}
