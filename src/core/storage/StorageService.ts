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
import { type StoredThemeBackgroundAsset, ThemeBackgroundStorage } from './ThemeBackgroundStorage';

const STORAGE_DIR = '.opencodian';
const SESSIONS_DIR = `${STORAGE_DIR}/sessions`;
const LEGACY_SETTINGS_FILE = `${STORAGE_DIR}/settings.json`;
const CORE_SETTINGS_FILE = `${STORAGE_DIR}/settings.core.json`;
const UI_SETTINGS_FILE = `${STORAGE_DIR}/settings.ui.json`;
const CORE_SETTINGS_BACKUP_FILE = `${CORE_SETTINGS_FILE}.bak`;
const UI_SETTINGS_BACKUP_FILE = `${UI_SETTINGS_FILE}.bak`;
const RUNTIME_FILE = `${STORAGE_DIR}/runtime.json`;
const SETTINGS_SCHEMA_VERSION = 1;

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

interface LoadSettingsFileOptions<T extends Record<string, unknown>> {
  filePath: string;
  backupPath: string;
  source: SettingsEnvelopeSource;
  legacySettings: SettingsReadResult<Partial<OpenCodianSettings>>;
  extractLegacyData: (settings: Partial<OpenCodianSettings>) => Partial<T>;
}

interface PersistedSettingsFileProfile<T extends Record<string, unknown>> {
  filePath: string;
  backupPath: string;
  source: SettingsEnvelopeSource;
  extractLegacyData: (settings: Partial<OpenCodianSettings>) => Partial<T>;
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

const PERSISTED_UI_SETTINGS_KEYS = [
  'tabState',
  'settingsPanelScrollTop',
  'modelAvailabilitySectionOpen',
  'modelToolsSectionOpen',
] as const satisfies readonly PersistedUiSettingsKey[];

function extractPersistedUiSettings(
  settings: Partial<OpenCodianSettings>,
): Partial<PersistedUiSettings> {
  return {
    tabState: settings.tabState,
    settingsPanelScrollTop: settings.settingsPanelScrollTop,
    modelAvailabilitySectionOpen: settings.modelAvailabilitySectionOpen,
    modelToolsSectionOpen: settings.modelToolsSectionOpen,
  };
}

function extractPersistedCoreSettings(
  settings: Partial<OpenCodianSettings>,
): Partial<PersistedCoreSettings> {
  const persistedCore = { ...settings } as Partial<OpenCodianSettings>;
  for (const key of PERSISTED_UI_SETTINGS_KEYS) {
    delete persistedCore[key];
  }
  return persistedCore as Partial<PersistedCoreSettings>;
}

const CORE_SETTINGS_PROFILE: PersistedSettingsFileProfile<PersistedCoreSettings> = {
  filePath: CORE_SETTINGS_FILE,
  backupPath: CORE_SETTINGS_BACKUP_FILE,
  source: 'settings.core',
  extractLegacyData: extractPersistedCoreSettings,
};

const UI_SETTINGS_PROFILE: PersistedSettingsFileProfile<PersistedUiSettings> = {
  filePath: UI_SETTINGS_FILE,
  backupPath: UI_SETTINGS_BACKUP_FILE,
  source: 'settings.ui',
  extractLegacyData: extractPersistedUiSettings,
};

export function splitPersistedSettings(settings: OpenCodianSettings): {
  core: PersistedCoreSettings;
  ui: PersistedUiSettings;
} {
  return {
    core: extractPersistedCoreSettings(settings) as PersistedCoreSettings,
    ui: extractPersistedUiSettings(settings) as PersistedUiSettings,
  };
}

export class StorageService {
  private app: App;
  private vaultPath: string;
  private settingsWriteQueue: Promise<void> = Promise.resolve();
  private themeBackgroundStorage: ThemeBackgroundStorage;

  constructor(plugin: OpenCodianPlugin) {
    this.app = plugin.app;
    this.vaultPath = (this.app.vault.adapter as unknown as { basePath: string }).basePath;
    this.themeBackgroundStorage = new ThemeBackgroundStorage(this.app.vault.adapter);
  }

  /** Initialize storage directories */
  async initialize(): Promise<void> {
    await this.ensureDir(STORAGE_DIR);
    await this.ensureDir(SESSIONS_DIR);
    await this.themeBackgroundStorage.initialize();
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
    await this.saveSettingsProfile(CORE_SETTINGS_PROFILE, settings);
  }

  async saveUiSettings(settings: PersistedUiSettings): Promise<void> {
    await this.saveSettingsProfile(UI_SETTINGS_PROFILE, settings);
  }

  async loadPersistedSettings(): Promise<SettingsLoadResult> {
    const legacySettings = await this.readLegacySettings();
    const core = await this.loadSettingsProfile(CORE_SETTINGS_PROFILE, legacySettings);
    const ui = await this.loadSettingsProfile(UI_SETTINGS_PROFILE, legacySettings);

    return this.buildSettingsLoadResult(core, ui);
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
    return this.themeBackgroundStorage.saveAsset(data, sourceName, hintedMimeType);
  }

  async removeThemeBackground(storedPath: string | null | undefined): Promise<void> {
    await this.themeBackgroundStorage.remove(storedPath);
  }

  async readThemeBackgroundDataUrl(storedPath: string, hintedMimeType?: string): Promise<string | null> {
    return this.themeBackgroundStorage.readDataUrl(storedPath, hintedMimeType);
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

  private saveSettingsProfile<T extends Record<string, unknown>>(
    profile: PersistedSettingsFileProfile<T>,
    data: T,
  ): Promise<void> {
    return this.enqueueSettingsWrite(() => this.writeSettingsFile(
      profile.filePath,
      profile.backupPath,
      profile.source,
      data,
    ));
  }

  private loadSettingsProfile<T extends Record<string, unknown>>(
    profile: PersistedSettingsFileProfile<T>,
    legacySettings: SettingsReadResult<Partial<OpenCodianSettings>>,
  ): Promise<SettingsFileLoadResult<Partial<T>>> {
    return this.loadSettingsFile({
      ...profile,
      legacySettings,
    });
  }

  private buildSettingsLoadResult(
    core: SettingsFileLoadResult<Partial<PersistedCoreSettings>>,
    ui: SettingsFileLoadResult<Partial<PersistedUiSettings>>,
  ): SettingsLoadResult {
    return {
      core,
      ui,
      writable: core.source !== 'blocked' && ui.source !== 'blocked',
      shouldPersist: core.shouldPersist || ui.shouldPersist,
    };
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
    options: LoadSettingsFileOptions<T>,
  ): Promise<SettingsFileLoadResult<Partial<T>>> {
    const {
      filePath,
      backupPath,
      source,
      legacySettings,
      extractLegacyData,
    } = options;
    const primary = await this.readEnvelopeFile<T>(filePath, source);
    const backup = await this.readEnvelopeFile<T>(backupPath, source);
    return this.resolveSettingsFileLoad({
      filePath,
      primary,
      backup,
      legacySettings,
      extractLegacyData,
    });
  }

  private resolveSettingsFileLoad<T extends Record<string, unknown>>(options: {
    filePath: string;
    primary: SettingsReadResult<Partial<T>>;
    backup: SettingsReadResult<Partial<T>>;
    legacySettings: SettingsReadResult<Partial<OpenCodianSettings>>;
    extractLegacyData: (settings: Partial<OpenCodianSettings>) => Partial<T>;
  }): SettingsFileLoadResult<Partial<T>> {
    const {
      filePath,
      primary,
      backup,
      legacySettings,
      extractLegacyData,
    } = options;

    if (primary.kind === 'ok') {
      return {
        data: primary.data,
        filePath,
        source: 'primary',
        shouldPersist: false,
      };
    }

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
}
