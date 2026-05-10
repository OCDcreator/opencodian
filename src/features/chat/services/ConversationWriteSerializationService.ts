import type { Conversation } from '../../../core/types';
import { createLogger } from '../../../shared';

const logger = createLogger('ConversationWriteSerializationService');

export interface ConversationWriteTicket {
  readonly conversationId: string;
  readonly version: number;
}

export interface ConversationWriteCommitResult {
  readonly applied: boolean;
  readonly version: number;
  readonly reason: string;
  readonly rejected?: boolean;
}

export interface ConversationWriteCommitOptions {
  readonly conversation: Conversation;
  readonly ticket: ConversationWriteTicket;
  readonly reason: string;
  readonly write: () => void | Promise<void>;
}

export interface ConversationWriteQueueTimeoutDiagnostic {
  readonly conversationId: string;
  readonly pendingWrites: number;
  readonly ageMs: number;
  readonly oldestReason: string | null;
  readonly newestReason: string | null;
}

export interface ConversationWriteQueueDepthDiagnostic {
  readonly conversationId: string;
  readonly pendingWrites: number;
  readonly oldestReason: string | null;
  readonly newestReason: string | null;
}

export interface ConversationWriteQueueRejectedDiagnostic
  extends ConversationWriteQueueDepthDiagnostic {
  readonly rejectedReason: string;
  readonly maxQueueDepth: number;
}

type ConversationWriteTimerHandle = ReturnType<typeof setTimeout>;

export interface ConversationWriteSerializationOptions {
  readonly queueTimeoutMs?: number;
  readonly maxQueueDepth?: number;
  readonly onQueueTimeout?: (diagnostic: ConversationWriteQueueTimeoutDiagnostic) => void;
  readonly onQueueDepthChange?: (diagnostic: ConversationWriteQueueDepthDiagnostic) => void;
  readonly onQueueRejected?: (diagnostic: ConversationWriteQueueRejectedDiagnostic) => void;
  readonly now?: () => number;
  readonly scope?: 'shared' | 'instance';
  readonly setTimeout?: (
    callback: () => void,
    delayMs: number,
  ) => ConversationWriteTimerHandle;
  readonly clearTimeout?: (handle: ConversationWriteTimerHandle) => void;
}

interface QueuedWriteDiagnosticState {
  readonly startedAt: number;
  readonly entries: QueuedWriteDiagnosticEntry[];
  timeoutHandle: ConversationWriteTimerHandle | null;
}

interface QueuedWriteDiagnosticEntry {
  readonly id: number;
  readonly reason: string;
}

interface ConversationWriteSerializationState {
  readonly versions: Map<string, number>;
  readonly queues: Map<string, Promise<void>>;
  readonly pendingWrites: Map<string, number>;
  readonly queueDiagnostics: Map<string, QueuedWriteDiagnosticState>;
  nextDiagnosticEntryId: number;
}

function createConversationWriteSerializationState(): ConversationWriteSerializationState {
  return {
    versions: new Map<string, number>(),
    queues: new Map<string, Promise<void>>(),
    pendingWrites: new Map<string, number>(),
    queueDiagnostics: new Map<string, QueuedWriteDiagnosticState>(),
    nextDiagnosticEntryId: 1,
  };
}

const SHARED_CONVERSATION_WRITE_SERIALIZATION_STATE =
  createConversationWriteSerializationState();

export class ConversationWriteSerializationService {
  private readonly state: ConversationWriteSerializationState;
  private readonly queueTimeoutMs: number | null;
  private readonly maxQueueDepth: number | null;
  private readonly onQueueTimeout: ((diagnostic: ConversationWriteQueueTimeoutDiagnostic) => void) | null;
  private readonly onQueueDepthChange: ((diagnostic: ConversationWriteQueueDepthDiagnostic) => void) | null;
  private readonly onQueueRejected: ((diagnostic: ConversationWriteQueueRejectedDiagnostic) => void) | null;
  private readonly now: () => number;
  private readonly setTimer: (
    callback: () => void,
    delayMs: number,
  ) => ConversationWriteTimerHandle;
  private readonly clearTimer: (handle: ConversationWriteTimerHandle) => void;

  constructor(options: ConversationWriteSerializationOptions = {}) {
    this.state = options.scope === 'instance'
      ? createConversationWriteSerializationState()
      : SHARED_CONVERSATION_WRITE_SERIALIZATION_STATE;
    this.queueTimeoutMs = typeof options.queueTimeoutMs === 'number' && options.queueTimeoutMs > 0
      ? options.queueTimeoutMs
      : 15_000;
    this.maxQueueDepth = typeof options.maxQueueDepth === 'number' && options.maxQueueDepth > 0
      ? options.maxQueueDepth
      : 75;
    this.onQueueTimeout = options.onQueueTimeout ?? ((diagnostic) => {
      logger.warn('Conversation write serialization queue is still pending', diagnostic);
    });
    this.onQueueDepthChange = options.onQueueDepthChange ?? ((diagnostic) => {
      logger.debug('Conversation write serialization queue depth changed', diagnostic);
    });
    this.onQueueRejected = options.onQueueRejected ?? ((diagnostic) => {
      logger.warn('Conversation write serialization queue rejected a new write', diagnostic);
    });
    this.now = options.now ?? (() => Date.now());
    this.setTimer = options.setTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimeout ?? ((handle) => clearTimeout(handle));
  }

  createTicket(conversationId: string): ConversationWriteTicket {
    return {
      conversationId,
      version: this.getVersion(conversationId) + this.getPendingWriteCount(conversationId),
    };
  }

  getVersion(conversationId: string): number {
    return this.state.versions.get(conversationId) ?? 0;
  }

  commit(options: ConversationWriteCommitOptions): Promise<ConversationWriteCommitResult> {
    const conversationId = options.conversation.id;
    const previous = this.state.queues.get(conversationId) ?? Promise.resolve();
    const pendingWrites = this.getPendingWriteCount(conversationId);
    if (this.maxQueueDepth !== null && pendingWrites >= this.maxQueueDepth) {
      this.reportQueueRejected(conversationId, options.reason);
      return Promise.resolve({
        applied: false,
        rejected: true,
        version: this.getVersion(conversationId),
        reason: options.reason,
      });
    }

    const diagnosticEntryId = this.state.nextDiagnosticEntryId;
    this.state.nextDiagnosticEntryId += 1;

    this.incrementPendingWriteCount(conversationId);
    this.recordQueuedWrite(conversationId, diagnosticEntryId, options.reason);
    this.reportQueueDepthChange(conversationId);

    const commit = previous
      .catch(() => undefined)
      .then(() => this.runCommit(conversationId, diagnosticEntryId, options));
    const queueEntry = commit.then(
      () => undefined,
      () => undefined,
    );

    this.state.queues.set(conversationId, queueEntry);
    queueEntry.finally(() => {
      if (this.state.queues.get(conversationId) === queueEntry) {
        this.state.queues.delete(conversationId);
      }
    });

    return commit;
  }

  private async runCommit(
    conversationId: string,
    diagnosticEntryId: number,
    options: ConversationWriteCommitOptions,
  ): Promise<ConversationWriteCommitResult> {
    try {
      const currentVersion = this.getVersion(conversationId);
      if (
        options.ticket.conversationId !== conversationId
        || options.ticket.version !== currentVersion
      ) {
        return {
          applied: false,
          version: currentVersion,
          reason: options.reason,
        };
      }

      await options.write();

      const nextVersion = currentVersion + 1;
      this.state.versions.set(conversationId, nextVersion);
      return {
        applied: true,
        version: nextVersion,
        reason: options.reason,
      };
    } finally {
      this.decrementPendingWriteCount(conversationId);
      this.clearQueuedWrite(conversationId, diagnosticEntryId);
      this.reportQueueDepthChange(conversationId);
    }
  }

  private getPendingWriteCount(conversationId: string): number {
    return this.state.pendingWrites.get(conversationId) ?? 0;
  }

  private incrementPendingWriteCount(conversationId: string): void {
    this.state.pendingWrites.set(conversationId, this.getPendingWriteCount(conversationId) + 1);
  }

  private decrementPendingWriteCount(conversationId: string): void {
    const nextCount = this.getPendingWriteCount(conversationId) - 1;
    if (nextCount > 0) {
      this.state.pendingWrites.set(conversationId, nextCount);
      return;
    }

    this.state.pendingWrites.delete(conversationId);
  }

  private recordQueuedWrite(
    conversationId: string,
    entryId: number,
    reason: string,
  ): void {
    let diagnostic = this.state.queueDiagnostics.get(conversationId);
    if (!diagnostic) {
      diagnostic = {
        startedAt: this.now(),
        entries: [],
        timeoutHandle: null,
      };
      this.state.queueDiagnostics.set(conversationId, diagnostic);
      if (this.queueTimeoutMs !== null && this.onQueueTimeout) {
        diagnostic.timeoutHandle = this.setTimer(() => {
          this.reportQueueTimeout(conversationId);
        }, this.queueTimeoutMs);
      }
    }

    diagnostic.entries.push({ id: entryId, reason });
  }

  private clearQueuedWrite(conversationId: string, entryId: number): void {
    const diagnostic = this.state.queueDiagnostics.get(conversationId);
    if (!diagnostic) {
      return;
    }

    const entryIndex = diagnostic.entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex !== -1) {
      diagnostic.entries.splice(entryIndex, 1);
    }

    if (diagnostic.entries.length > 0) {
      return;
    }

    if (diagnostic.timeoutHandle) {
      this.clearTimer(diagnostic.timeoutHandle);
    }
    this.state.queueDiagnostics.delete(conversationId);
  }

  private reportQueueTimeout(conversationId: string): void {
    const diagnostic = this.state.queueDiagnostics.get(conversationId);
    if (!diagnostic || !this.onQueueTimeout) {
      return;
    }

    this.onQueueTimeout({
      conversationId,
      pendingWrites: this.getPendingWriteCount(conversationId),
      ageMs: this.now() - diagnostic.startedAt,
      oldestReason: diagnostic.entries[0]?.reason ?? null,
      newestReason: diagnostic.entries[diagnostic.entries.length - 1]?.reason ?? null,
    });
  }

  private reportQueueDepthChange(conversationId: string): void {
    if (!this.onQueueDepthChange) {
      return;
    }

    this.onQueueDepthChange(this.buildQueueDepthDiagnostic(conversationId));
  }

  private reportQueueRejected(conversationId: string, rejectedReason: string): void {
    if (!this.onQueueRejected || this.maxQueueDepth === null) {
      return;
    }

    this.onQueueRejected({
      ...this.buildQueueDepthDiagnostic(conversationId),
      rejectedReason,
      maxQueueDepth: this.maxQueueDepth,
    });
  }

  private buildQueueDepthDiagnostic(
    conversationId: string,
  ): ConversationWriteQueueDepthDiagnostic {
    const diagnostic = this.state.queueDiagnostics.get(conversationId);
    return {
      conversationId,
      pendingWrites: this.getPendingWriteCount(conversationId),
      oldestReason: diagnostic?.entries[0]?.reason ?? null,
      newestReason: diagnostic?.entries[diagnostic.entries.length - 1]?.reason ?? null,
    };
  }
}
