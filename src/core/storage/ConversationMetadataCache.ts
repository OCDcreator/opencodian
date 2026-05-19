import { normalizePath } from 'obsidian';

import { createLogger, getPerformanceTimestampMs } from '../../shared';
import type { ChatMessage, ConversationMeta } from '../types';

const SESSION_META_DIR = '.opencodian/session-metas';
const CONVERSATION_META_SCHEMA_VERSION = 1;
const CONVERSATION_META_BACKFILL_LOG_THRESHOLD_MS = 120;
const CONVERSATION_LIST_DIAGNOSTIC_LIMIT = 5;
const logger = createLogger('ConversationMetadataCache');

interface ConversationMetaEnvelope {
  schemaVersion: number;
  updatedAt: number;
  data: ConversationMeta;
}

interface ConversationMetadataAdapter {
  read(normalizedPath: string): Promise<string>;
  write(normalizedPath: string, data: string): Promise<void>;
  remove(normalizedPath: string): Promise<void>;
  list(normalizedPath: string): Promise<{ files: string[]; folders: string[] }>;
}

export interface ConversationListDiagnosticEntry {
  id: string;
  elapsedMs?: number;
  contentBytes?: number;
  messageCount?: number;
}

export interface ConversationListDiagnostics {
  collectedAt: string;
  sessionFileCount: number;
  metadataFileCount: number;
  metadataHitCount: number;
  fullSessionFallbackCount: number;
  metadataBackfillScheduledCount: number;
  totalFallbackBytes: number;
  totalElapsedMs: number;
  slowestFallbacks: ConversationListDiagnosticEntry[];
  largestFallbackSessions: ConversationListDiagnosticEntry[];
}

export interface MutableConversationListDiagnostics {
  collectedAt: string;
  sessionFileCount: number;
  metadataFileCount: number;
  metadataHitCount: number;
  fullSessionFallbackCount: number;
  metadataBackfillScheduledCount: number;
  totalFallbackBytes: number;
  totalElapsedMs: number;
  slowestFallbacks: ConversationListDiagnosticEntry[];
  largestFallbackSessions: ConversationListDiagnosticEntry[];
}

export function buildConversationMetaFromStoredRecord(
  data: Partial<ConversationMeta> & { messages?: ChatMessage[] | null; messageCount?: number | null },
): ConversationMeta | null {
  if (
    typeof data.id !== 'string'
    || typeof data.title !== 'string'
    || typeof data.createdAt !== 'number'
    || typeof data.updatedAt !== 'number'
  ) {
    return null;
  }

  const titleGenerationStatus = data.titleGenerationStatus === 'pending'
    || data.titleGenerationStatus === 'success'
    || data.titleGenerationStatus === 'failed'
    ? data.titleGenerationStatus
    : undefined;
  const lastResponseAt = typeof data.lastResponseAt === 'number' ? data.lastResponseAt : undefined;
  const messageCount = Array.isArray(data.messages)
    ? data.messages.length
    : typeof data.messageCount === 'number'
      ? data.messageCount
      : 0;

  return {
    id: data.id,
    title: data.title,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    lastResponseAt,
    titleGenerationStatus,
    messageCount,
    openCodeSessionId: typeof data.openCodeSessionId === 'string' ? data.openCodeSessionId : undefined,
    backend: data.backend ?? 'opencode',
  };
}

export function cloneConversationListDiagnostics(
  diagnostics: MutableConversationListDiagnostics | ConversationListDiagnostics,
): ConversationListDiagnostics {
  return {
    collectedAt: diagnostics.collectedAt,
    sessionFileCount: diagnostics.sessionFileCount,
    metadataFileCount: diagnostics.metadataFileCount,
    metadataHitCount: diagnostics.metadataHitCount,
    fullSessionFallbackCount: diagnostics.fullSessionFallbackCount,
    metadataBackfillScheduledCount: diagnostics.metadataBackfillScheduledCount,
    totalFallbackBytes: diagnostics.totalFallbackBytes,
    totalElapsedMs: diagnostics.totalElapsedMs,
    slowestFallbacks: diagnostics.slowestFallbacks.map((entry) => ({ ...entry })),
    largestFallbackSessions: diagnostics.largestFallbackSessions.map((entry) => ({ ...entry })),
  };
}

function getUtf8ByteLength(text: string): number {
  try {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(text).length;
    }
  } catch {
    // Fall through to Buffer/text length fallback.
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.byteLength(text, 'utf8');
  }

  return text.length;
}

function trackTopDiagnosticEntries(
  entries: ConversationListDiagnosticEntry[],
  nextEntry: ConversationListDiagnosticEntry,
  valueSelector: (entry: ConversationListDiagnosticEntry) => number,
): void {
  entries.push(nextEntry);
  entries.sort((left, right) => valueSelector(right) - valueSelector(left));
  if (entries.length > CONVERSATION_LIST_DIAGNOSTIC_LIMIT) {
    entries.splice(CONVERSATION_LIST_DIAGNOSTIC_LIMIT);
  }
}

export class ConversationMetadataCache {
  constructor(private readonly adapter: ConversationMetadataAdapter) {}

  getMetadataDirectoryPath(): string {
    return SESSION_META_DIR;
  }

  async getMetadataFileCount(): Promise<number> {
    const listing = await this.safeListDirectory();
    return listing.files.filter((file) => file.endsWith('.json')).length;
  }

  async loadConversationMeta(
    id: string,
    sessionPath: string,
    diagnostics?: MutableConversationListDiagnostics,
  ): Promise<ConversationMeta | null> {
    const sidecarMeta = await this.readConversationMetaSidecar(id);
    if (sidecarMeta) {
      if (diagnostics) {
        diagnostics.metadataHitCount += 1;
      }
      return sidecarMeta;
    }

    const startedAt = getPerformanceTimestampMs();
    try {
      const content = await this.adapter.read(normalizePath(sessionPath));
      const parsed = JSON.parse(content) as ConversationMeta & { messages?: ChatMessage[]; messageCount?: number };
      const meta = buildConversationMetaFromStoredRecord(parsed);
      if (!meta) {
        return null;
      }

      const elapsedMs = getPerformanceTimestampMs() - startedAt;
      const contentBytes = getUtf8ByteLength(content);
      if (diagnostics) {
        diagnostics.fullSessionFallbackCount += 1;
        diagnostics.totalFallbackBytes += contentBytes;
        diagnostics.metadataBackfillScheduledCount += 1;
        trackTopDiagnosticEntries(
          diagnostics.slowestFallbacks,
          {
            id,
            elapsedMs: Math.round(elapsedMs),
            contentBytes,
            messageCount: meta.messageCount,
          },
          (entry) => entry.elapsedMs ?? 0,
        );
        trackTopDiagnosticEntries(
          diagnostics.largestFallbackSessions,
          {
            id,
            contentBytes,
            messageCount: meta.messageCount,
          },
          (entry) => entry.contentBytes ?? 0,
        );
      }

      if (elapsedMs >= CONVERSATION_META_BACKFILL_LOG_THRESHOLD_MS) {
        logger.debug('Loaded conversation metadata from full session fallback', {
          id,
          elapsedMs: Math.round(elapsedMs),
          contentBytes,
          messageCount: meta.messageCount,
        });
      }

      void this.writeConversationMeta(meta, 'loadConversationFallback');
      return meta;
    } catch {
      return null;
    }
  }

  async writeConversationMeta(meta: ConversationMeta, source: string): Promise<boolean> {
    const envelope: ConversationMetaEnvelope = {
      schemaVersion: CONVERSATION_META_SCHEMA_VERSION,
      updatedAt: Date.now(),
      data: meta,
    };

    try {
      await this.adapter.write(
        normalizePath(this.getConversationMetaPath(meta.id)),
        JSON.stringify(envelope, null, 2),
      );
      return true;
    } catch (error) {
      logger.warn('Failed to write conversation metadata sidecar', {
        conversationId: meta.id,
        source,
        error,
      });

      try {
        await this.adapter.remove(normalizePath(this.getConversationMetaPath(meta.id)));
      } catch {
        // Ignore cleanup errors; future loads can still fall back to the full session JSON.
      }

      return false;
    }
  }

  async removeConversationMeta(id: string): Promise<void> {
    try {
      await this.adapter.remove(normalizePath(this.getConversationMetaPath(id)));
    } catch {
      // Ignore if metadata sidecar doesn't exist.
    }
  }

  private getConversationMetaPath(id: string): string {
    return `${SESSION_META_DIR}/${id}.json`;
  }

  private async readConversationMetaSidecar(id: string): Promise<ConversationMeta | null> {
    try {
      const content = await this.adapter.read(normalizePath(this.getConversationMetaPath(id)));
      const parsed = JSON.parse(content) as Partial<ConversationMetaEnvelope>;
      if (
        parsed.schemaVersion !== CONVERSATION_META_SCHEMA_VERSION
        || !parsed.data
        || typeof parsed.data !== 'object'
        || Array.isArray(parsed.data)
      ) {
        return null;
      }

      return buildConversationMetaFromStoredRecord(parsed.data);
    } catch {
      return null;
    }
  }

  private async safeListDirectory(): Promise<{ files: string[]; folders: string[] }> {
    try {
      return await this.adapter.list(normalizePath(SESSION_META_DIR));
    } catch {
      return { files: [], folders: [] };
    }
  }
}
