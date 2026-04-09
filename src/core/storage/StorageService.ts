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
const LEGACY_SETTINGS_FILE = `${STORAGE_DIR}/settings.json`;
const CORE_SETTINGS_FILE = `${STORAGE_DIR}/settings.core.json`;
const UI_SETTINGS_FILE = `${STORAGE_DIR}/settings.ui.json`;
const CORE_SETTINGS_BACKUP_FILE = `${CORE_SETTINGS_FILE}.bak`;
const UI_SETTINGS_BACKUP_FILE = `${UI_SETTINGS_FILE}.bak`;
const RUNTIME_FILE = `${STORAGE_DIR}/runtime.json`;
const SETTINGS_SCHEMA_VERSION = 1;
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

export type PersistedUiSettingsKey =
  | 'tabState'
  | 'settingsPanelScrollTop'
  | 'modelAvailabilitySectionOpen'
  | 'modelToolsSectionOpen';

export type PersistedUiSettings = Pick<OpenCodianSettings, PersistedUiSettingsKey>;
export type PersistedCoreSettings = Omit<OpenCodianSettings, PersistedUiSettingsKey>;
export type SettingsFileSource = 'primary' | 'backup' | 'legacy' | 'missing' | 'blocked';
export type SettingsEnvelopeSource = 'settings.core' | 'settings.ui';

interface SettingsEnvelope<T> {
  schemaVersion: number;
  updatedAt: number;
  source: SettingsEnvelopeSource;
  data: T;
}

interface SettingsReadResult<T> {
  data: T | null;
  kind: 'ok' | 'missing' | 'invalid';
  message?: string;
}

export interface SettingsFileLoadResult<T> {
  data: T | null;
  filePath: string;
  source: SettingsFileSource;
  shouldPersist: boolean;
  message?: string;
}

export interface SettingsLoadResult {
  core: SettingsFileLoadResult<Partial<PersistedCoreSettings>>;
  ui: SettingsFileLoadResult<Partial<PersistedUiSettings>>;
  writable: boolean;
  shouldPersist: boolean;
}

export function splitPersistedSettings(settings: OpenCodianSettings): {
  core: PersistedCoreSettings;
  ui: PersistedUiSettings;
} {
  const {
    tabState,
    settingsPanelScrollTop,
    modelAvailabilitySectionOpen,
    modelToolsSectionOpen,
    ...core
  } = settings;

  return {
    core,
    ui: {
      tabState,
      settingsPanelScrollTop,
      modelAvailabilitySectionOpen,
      modelToolsSectionOpen,
    },
  };
}

export class StorageService {
  private app: App;
  private vaultPath: string;
  private settingsWriteQueue: Promise<void> = Promise.resolve();

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

  async saveCoreSettings(settings: PersistedCoreSettings): Promise<void> {
    await this.enqueueSettingsWrite(() => this.writeSettingsFile(
      CORE_SETTINGS_FILE,
      CORE_SETTINGS_BACKUP_FILE,
      'settings.core',
      settings,
    ));
  }

  async saveUiSettings(settings: PersistedUiSettings): Promise<void> {
    await this.enqueueSettingsWrite(() => this.writeSettingsFile(
      UI_SETTINGS_FILE,
      UI_SETTINGS_BACKUP_FILE,
      'settings.ui',
      settings,
    ));
  }

  async loadPersistedSettings(): Promise<SettingsLoadResult> {
    const legacySettings = await this.readLegacySettings();
    const core = await this.loadSettingsFile(
      CORE_SETTINGS_FILE,
      CORE_SETTINGS_BACKUP_FILE,
      'settings.core',
      legacySettings,
      (settings) => {
        const {
          tabState: _tabState,
          settingsPanelScrollTop: _settingsPanelScrollTop,
          modelAvailabilitySectionOpen: _modelAvailabilitySectionOpen,
          modelToolsSectionOpen: _modelToolsSectionOpen,
          ...persistedCore
        } = settings;
        return persistedCore;
      },
    );
    const ui = await this.loadSettingsFile(
      UI_SETTINGS_FILE,
      UI_SETTINGS_BACKUP_FILE,
      'settings.ui',
      legacySettings,
      (settings) => ({
        tabState: settings.tabState,
        settingsPanelScrollTop: settings.settingsPanelScrollTop,
        modelAvailabilitySectionOpen: settings.modelAvailabilitySectionOpen,
        modelToolsSectionOpen: settings.modelToolsSectionOpen,
      }),
    );

    return {
      core,
      ui,
      writable: core.source !== 'blocked' && ui.source !== 'blocked',
      shouldPersist: core.shouldPersist || ui.shouldPersist,
    };
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

  private enqueueSettingsWrite(task: () => Promise<void>): Promise<void> {
    const next = this.settingsWriteQueue.then(task, task);
    this.settingsWriteQueue = next.catch(() => undefined);
    return next;
  }

  private async writeSettingsFile<T extends Record<string, unknown>>(
    filePath: string,
    backupPath: string,
    source: SettingsEnvelopeSource,
    data: T,
  ): Promise<void> {
    const normalizedFilePath = normalizePath(filePath);
    const normalizedBackupPath = normalizePath(backupPath);
    const adapter = this.app.vault.adapter;

    if (await adapter.exists(normalizedFilePath)) {
      try {
        const previousContent = await adapter.read(normalizedFilePath);
        await adapter.write(normalizedBackupPath, previousContent);
      } catch {
        // Keep writing the new primary file even if the previous snapshot cannot be backed up.
      }
    }

    const envelope: SettingsEnvelope<T> = {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      updatedAt: Date.now(),
      source,
      data,
    };

    await adapter.write(normalizedFilePath, JSON.stringify(envelope, null, 2));
  }

  private async readLegacySettings(): Promise<SettingsReadResult<Partial<OpenCodianSettings>>> {
    return this.readJsonFile(
      LEGACY_SETTINGS_FILE,
      (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return null;
        }

        return value as Partial<OpenCodianSettings>;
      },
    );
  }

  private async loadSettingsFile<T extends Record<string, unknown>>(
    filePath: string,
    backupPath: string,
    source: SettingsEnvelopeSource,
    legacySettings: SettingsReadResult<Partial<OpenCodianSettings>>,
    extractLegacyData: (settings: Partial<OpenCodianSettings>) => Partial<T>,
  ): Promise<SettingsFileLoadResult<Partial<T>>> {
    const primary = await this.readEnvelopeFile<T>(filePath, source);
    if (primary.kind === 'ok') {
      return {
        data: primary.data,
        filePath,
        source: 'primary',
        shouldPersist: false,
      };
    }

    const backup = await this.readEnvelopeFile<T>(backupPath, source);
    if (backup.kind === 'ok') {
      return {
        data: backup.data,
        filePath,
        source: 'backup',
        shouldPersist: true,
        message: primary.kind === 'invalid'
          ? `Recovered ${filePath} from backup after the primary file became unreadable.`
          : `Recovered missing ${filePath} from backup.`,
      };
    }

    if (legacySettings.kind === 'ok') {
      return {
        data: extractLegacyData(legacySettings.data ?? {}),
        filePath,
        source: 'legacy',
        shouldPersist: true,
        message: `Migrated ${filePath} from legacy settings.json.`,
      };
    }

    const anyInvalid = primary.kind === 'invalid' || backup.kind === 'invalid' || legacySettings.kind === 'invalid';
    if (!anyInvalid) {
      return {
        data: null,
        filePath,
        source: 'missing',
        shouldPersist: false,
      };
    }

    return {
      data: null,
      filePath,
      source: 'blocked',
      shouldPersist: false,
      message: primary.message ?? backup.message ?? legacySettings.message ?? `Failed to recover ${filePath}.`,
    };
  }

  private async readEnvelopeFile<T extends Record<string, unknown>>(
    filePath: string,
    expectedSource: SettingsEnvelopeSource,
  ): Promise<SettingsReadResult<Partial<T>>> {
    return this.readJsonFile(
      filePath,
      (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return null;
        }

        const candidate = value as Partial<SettingsEnvelope<Partial<T>>>;
        if (
          candidate.schemaVersion !== SETTINGS_SCHEMA_VERSION
          || candidate.source !== expectedSource
          || !candidate.data
          || typeof candidate.data !== 'object'
          || Array.isArray(candidate.data)
        ) {
          return null;
        }

        return candidate.data;
      },
    );
  }

  private async readJsonFile<T>(
    filePath: string,
    parse: (value: unknown) => T | null,
  ): Promise<SettingsReadResult<T>> {
    const normalizedFilePath = normalizePath(filePath);
    const adapter = this.app.vault.adapter;
    const exists = await adapter.exists(normalizedFilePath);
    if (!exists) {
      return {
        data: null,
        kind: 'missing',
      };
    }

    try {
      const content = await adapter.read(normalizedFilePath);
      const parsed = JSON.parse(content);
      const normalized = parse(parsed);
      if (normalized === null) {
        return {
          data: null,
          kind: 'invalid',
          message: `Invalid settings payload in ${filePath}.`,
        };
      }

      return {
        data: normalized,
        kind: 'ok',
      };
    } catch (error) {
      return {
        data: null,
        kind: 'invalid',
        message: error instanceof Error
          ? `Failed to read ${filePath}: ${error.message}`
          : `Failed to read ${filePath}.`,
      };
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
