/**
 * ConversationMarkdownExportService — R-D1 (advantage-parity): the vault
 * orchestration half of conversation export (pure serialization lives in
 * `ConversationMarkdownExporter.ts`).
 *
 * Write discipline (advantage-parity.md §3 R-D1):
 * - Manual export (`exportConversation`) is purely additive: `vault.create`
 *   with `-2`/`-3`… conflict suffixes, never an overwrite of anything.
 * - Conversation storage is never touched; the only persisted side state is a
 *   plugin-private `.opencodian/conversation-export-state.json` tracking the
 *   auto-export note per conversation.
 * - Auto-export (default off, `scheduleAutoExport`) refreshes the note IT
 *   created via `vault.modify`, and only after verifying the file's mtime
 *   still matches our last write — a user-edited note disables auto-update
 *   for that conversation instead of clobbering the edits.
 * - Images are written once as content-addressed attachments (message id +
 *   content hash) and embedded with `![[…]]`; a failed note write best-effort
 *   trashes the attachments created by THIS export so no orphan halves
 *   remain ("失败时不留半个文件").
 *
 * Locale discipline: core.storage must not import i18n; user-facing notices
 * live in the app-layer caller (main.ts) via return values and callbacks.
 */

import { isSafeVaultRelativePath, sanitizeVaultFileBaseName } from '../../shared/vault';
import type { Conversation } from '../types';
import type { ImageAttachment } from '../types/chat';
import type { ConversationExportSettings } from '../types/settings';
import {
  DEFAULT_CONVERSATION_EXPORT_SETTINGS,
  normalizeConversationExportDirectory,
  normalizeConversationExportFilenameTemplate,
} from '../types/settings';
import {
  buildConversationMarkdown,
  type BuildConversationMarkdownResult,
  renderFileName,
  shortConversationId,
} from './ConversationMarkdownExporter';

const MAX_EXPORT_FILE_NAME_PROBES = 100;
/** Window in which a file mtime newer than our last write counts as user edit. */
const USER_EDIT_MTIME_GRACE_MS = 1500;
/** Debounce for auto-export after a conversation save (bursts coalesce). */
const AUTO_EXPORT_DEBOUNCE_MS = 2000;
/** State file lives in the plugin-private storage directory. */
export const CONVERSATION_EXPORT_STATE_PATH = '.opencodian/conversation-export-state.json';

/** The vault surface the exporter needs (structural subset of Obsidian's Vault). */
export interface ConversationExportVault {
  getAbstractFileByPath(path: string): unknown;
  createFolder(path: string): Promise<unknown>;
  create(path: string, data: string): Promise<unknown>;
  modify(path: string, data: string): Promise<unknown>;
  getAvailablePathForAttachments(fileName: string): Promise<string>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  exists(path: string): Promise<boolean>;
  trash(path: string): Promise<boolean>;
  /** mtime of a vault file, or null when it is missing / not a file. */
  getFileMtime(path: string): Promise<number | null>;
}

/** Adapter surface for the plugin-private state file. */
export interface ConversationExportAdapter {
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

interface ConversationExportStateEntry {
  path: string;
  lastExportAt: number;
  lastExportedResponseAt: number;
  disabledReason?: 'user-edited';
}

interface ConversationExportStateFile {
  version: 1;
  entries: Record<string, ConversationExportStateEntry>;
}

export interface ConversationMarkdownExportServiceOptions {
  vault: ConversationExportVault;
  adapter: ConversationExportAdapter;
  getSettings: () => ConversationExportSettings | null | undefined;
  /** Feature-layer notice hook: the user edited the auto-export note. */
  onUserEditedAutoExport?: (conversationId: string, path: string) => void;
}

/** One image placed by the exporter (returned for tests / debugging). */
export interface ExportedImageRef {
  messageId: string;
  index: number;
  path: string;
}

/** Deterministic, non-cryptographic content hash for attachment dedup. */
function hashAttachmentData(base64: string): string {
  let hash = 5381;
  for (let index = 0; index < base64.length; index += 1) {
    hash = ((hash * 33) ^ base64.charCodeAt(index)) >>> 0;
  }
  return `${hash.toString(16)}-${base64.length.toString(16)}`;
}

function attachmentExtension(mediaType: ImageAttachment['mediaType']): string | null {
  switch (mediaType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return null;
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/**
 * Orchestrates vault writes for one export. Owns the auto-export state file
 * and the per-conversation debounce timers.
 */
export class ConversationMarkdownExportService {
  private readonly vault: ConversationExportVault;
  private readonly adapter: ConversationExportAdapter;
  private readonly getSettings: () => ConversationExportSettings | null | undefined;
  private readonly onUserEditedAutoExport?: (conversationId: string, path: string) => void;
  private state: ConversationExportStateFile | null = null;
  private statePersistPromise: Promise<void> = Promise.resolve();
  private readonly pendingAutoExportTimers = new Map<string, number>();
  private disposed = false;

  constructor(options: ConversationMarkdownExportServiceOptions) {
    this.vault = options.vault;
    this.adapter = options.adapter;
    this.getSettings = options.getSettings;
    this.onUserEditedAutoExport = options.onUserEditedAutoExport;
  }

  dispose(): void {
    this.disposed = true;
    for (const timerId of this.pendingAutoExportTimers.values()) {
      window.clearTimeout(timerId);
    }
    this.pendingAutoExportTimers.clear();
  }

  /**
   * Manual export (command / history menu): ALWAYS creates a new note via
   * `vault.create` with conflict suffixes. Never overwrites, never touches
   * conversation storage. Resolves with the created note path.
   */
  async exportConversation(conversation: Conversation): Promise<{ path: string }> {
    const settings = this.requireSettings();
    const directory = normalizeConversationExportDirectory(settings.directory)
      ?? DEFAULT_CONVERSATION_EXPORT_SETTINGS.directory;
    const template = normalizeConversationExportFilenameTemplate(settings.filenameTemplate);

    const built = buildConversationMarkdown(conversation);
    const writtenAttachments: ExportedImageRef[] = [];

    try {
      const markdown = await this.materializeImages(conversation.id, built, writtenAttachments);
      await this.ensureDirectory(directory);
      const fileName = renderFileName(conversation, template);
      const path = await this.createNoteWithConflictSuffix(directory, fileName, markdown);
      return { path };
    } catch (error) {
      // Fail closed without halves: remove attachments created by THIS export
      // before surfacing the error. Best-effort — a trash failure must not
      // mask the original error.
      for (const attachment of writtenAttachments) {
        try {
          await this.vault.trash(attachment.path);
        } catch {
          // Intentionally swallowed; original failure takes precedence.
        }
      }
      throw error;
    }
  }

  /**
   * Auto-export entry (feature layer calls this after each conversation
   * save): debounced, guarded by the response timestamp, refreshes the note
   * this feature created — or gives up honestly when the user edited it.
   */
  scheduleAutoExport(conversation: Conversation): void {
    if (this.disposed) {
      return;
    }
    const settings = this.getSettings();
    if (!settings?.autoExport) {
      return;
    }
    void this.withState(async (state) => {
      const entry = state.entries[conversation.id];
      if (entry?.disabledReason) {
        return;
      }
      const responseAt = conversation.lastResponseAt ?? conversation.updatedAt;
      if (conversation.messages.length === 0) {
        return;
      }
      if (entry && responseAt <= entry.lastExportedResponseAt) {
        return;
      }
      this.scheduleAutoExportTimer(conversation.id, async () => {
        await this.runAutoExport(conversation);
      });
    });
  }

  private scheduleAutoExportTimer(conversationId: string, run: () => Promise<void>): void {
    const existing = this.pendingAutoExportTimers.get(conversationId);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }
    const timerId = window.setTimeout(() => {
      this.pendingAutoExportTimers.delete(conversationId);
      void run();
    }, AUTO_EXPORT_DEBOUNCE_MS);
    this.pendingAutoExportTimers.set(conversationId, timerId);
  }

  private async runAutoExport(conversation: Conversation): Promise<void> {
    if (this.disposed) {
      return;
    }
    const settings = this.getSettings();
    if (!settings?.autoExport) {
      return;
    }
    const directory = normalizeConversationExportDirectory(settings.directory)
      ?? DEFAULT_CONVERSATION_EXPORT_SETTINGS.directory;
    const template = normalizeConversationExportFilenameTemplate(settings.filenameTemplate);

    await this.withState(async (state) => {
      const entry = state.entries[conversation.id];
      if (entry?.disabledReason) {
        return;
      }
      const responseAt = conversation.lastResponseAt ?? conversation.updatedAt;
      if (entry && responseAt <= entry.lastExportedResponseAt) {
        return;
      }

      const built = buildConversationMarkdown(conversation);
      const markdown = await this.materializeImages(conversation.id, built, []);

      if (!entry) {
        await this.ensureDirectory(directory);
        const fileName = renderFileName(conversation, template);
        const path = await this.createNoteWithConflictSuffix(directory, fileName, markdown);
        state.entries[conversation.id] = {
          path,
          lastExportAt: Date.now(),
          lastExportedResponseAt: responseAt,
        };
        return;
      }

      // Refresh-in-place is only allowed on a note we still own: any mtime
      // newer than our last write means the user edited it.
      const mtime = await this.vault.getFileMtime(entry.path);
      if (mtime === null) {
        // The note was deleted; recreate it from scratch at a fresh path.
        await this.ensureDirectory(directory);
        const fileName = renderFileName(conversation, template);
        const path = await this.createNoteWithConflictSuffix(directory, fileName, markdown);
        state.entries[conversation.id] = {
          path,
          lastExportAt: Date.now(),
          lastExportedResponseAt: responseAt,
        };
        return;
      }
      if (mtime > entry.lastExportAt + USER_EDIT_MTIME_GRACE_MS) {
        state.entries[conversation.id] = { ...entry, disabledReason: 'user-edited' };
        this.onUserEditedAutoExport?.(conversation.id, entry.path);
        return;
      }
      await this.vault.modify(entry.path, markdown);
      state.entries[conversation.id] = {
        path: entry.path,
        lastExportAt: Date.now(),
        lastExportedResponseAt: responseAt,
      };
    });
  }

  private async materializeImages(
    conversationId: string,
    built: BuildConversationMarkdownResult,
    writtenAttachments: ExportedImageRef[],
  ): Promise<string> {
    const embedsByMessage = new Map<string, Map<number, string>>();
    for (const image of built.pendingImages) {
      const placed = await this.writeImageAttachment(conversationId, image);
      writtenAttachments.push(placed);
      const byIndex = embedsByMessage.get(image.messageId) ?? new Map<number, string>();
      byIndex.set(image.index, placed.path);
      embedsByMessage.set(image.messageId, byIndex);
    }
    return built.markdown.replace(
      /\{\{opencodian:image:([^:]+):(\d+)\}\}/g,
      (match, messageId: string, index: string) => {
        const path = embedsByMessage.get(messageId)?.get(Number(index));
        return path ? `![[${path}]]` : match;
      },
    );
  }

  private requireSettings(): ConversationExportSettings {
    const settings = this.getSettings();
    if (!settings) {
      throw new Error('Conversation export settings are not available yet.');
    }
    return settings;
  }

  private async ensureDirectory(directory: string): Promise<void> {
    if (this.vault.getAbstractFileByPath(directory) !== null) {
      return;
    }
    try {
      await this.vault.createFolder(directory);
    } catch {
      // Concurrent creation (e.g. a synced folder appearing) is fine as long
      // as the folder exists now; anything else surfaces at note creation.
      if (this.vault.getAbstractFileByPath(directory) === null) {
        throw new Error(`Could not create the export directory "${directory}".`);
      }
    }
  }

  private async createNoteWithConflictSuffix(
    directory: string,
    fileName: string,
    markdown: string,
  ): Promise<string> {
    const base = `${directory}/${fileName}.md`;
    if (this.vault.getAbstractFileByPath(base) === null) {
      await this.vault.create(base, markdown);
      return base;
    }
    for (let suffix = 2; suffix < 2 + MAX_EXPORT_FILE_NAME_PROBES; suffix += 1) {
      const candidate = `${directory}/${fileName}-${suffix}.md`;
      if (this.vault.getAbstractFileByPath(candidate) === null) {
        await this.vault.create(candidate, markdown);
        return candidate;
      }
    }
    throw new Error(`Could not find a free export path for "${fileName}".`);
  }

  /**
   * Content-addressed attachment write: stable name from message id + image
   * index + content hash, so re-exports (auto-refresh, manual re-export)
   * REUSE the existing attachment instead of duplicating it. Placement goes
   * through Obsidian's attachment resolver; out-of-vault results fail closed.
   */
  private async writeImageAttachment(
    conversationId: string,
    image: ImageAttachment & { messageId: string; index: number },
  ): Promise<ExportedImageRef> {
    const extension = attachmentExtension(image.mediaType);
    if (!extension) {
      throw new Error(`Unsupported image media type for export: ${image.mediaType}`);
    }
    const baseName = image.filename
      ? sanitizeVaultFileBaseName(image.filename)
      : `conversation-${shortConversationId(conversationId)}-${image.messageId}-${image.index}`;
    const fileName = `${baseName}-${hashAttachmentData(image.data)}.${extension}`;

    const resolved = await this.vault.getAvailablePathForAttachments(fileName);
    const normalized = resolved.replace(/^\.\//, '');
    if (!isSafeVaultRelativePath(normalized)) {
      throw new Error(
        `The resolved attachment path "${normalized}" is outside the vault. Check Obsidian's attachment folder setting.`,
      );
    }
    if (!(await this.vault.exists(normalized))) {
      await this.vault.writeBinary(normalized, base64ToArrayBuffer(image.data));
    }
    return { messageId: image.messageId, index: image.index, path: normalized };
  }

  private async withState<T>(action: (state: ConversationExportStateFile) => Promise<T>): Promise<T> {
    if (!this.state) {
      this.state = await this.loadState();
    }
    const before = JSON.stringify(this.state);
    const result = await action(this.state);
    // Read-only passes (e.g. the debounce scheduler peeking at entries) must
    // not trigger a state write on every conversation save.
    if (JSON.stringify(this.state) !== before) {
      this.statePersistPromise = this.statePersistPromise.then(() => this.persistState(this.state!));
    }
    return result;
  }

  private async loadState(): Promise<ConversationExportStateFile> {
    try {
      if (!(await this.adapter.exists(CONVERSATION_EXPORT_STATE_PATH))) {
        return { version: 1, entries: {} };
      }
      const raw = await this.adapter.read(CONVERSATION_EXPORT_STATE_PATH);
      const parsed = JSON.parse(raw) as Partial<ConversationExportStateFile>;
      if (!parsed || typeof parsed !== 'object' || parsed.version !== 1 || !parsed.entries) {
        return { version: 1, entries: {} };
      }
      const entries: Record<string, ConversationExportStateEntry> = {};
      for (const [conversationId, entry] of Object.entries(parsed.entries)) {
        if (
          entry
          && typeof entry.path === 'string'
          && typeof entry.lastExportAt === 'number'
          && typeof entry.lastExportedResponseAt === 'number'
        ) {
          entries[conversationId] = entry;
        }
      }
      return { version: 1, entries };
    } catch {
      // Unreadable state is not worth failing exports over: start fresh.
      return { version: 1, entries: {} };
    }
  }

  private async persistState(state: ConversationExportStateFile): Promise<void> {
    try {
      await this.adapter.write(
        CONVERSATION_EXPORT_STATE_PATH,
        JSON.stringify(state, null, 2),
      );
    } catch {
      // State persistence is best-effort; auto-export still works in-session.
    }
  }
}
