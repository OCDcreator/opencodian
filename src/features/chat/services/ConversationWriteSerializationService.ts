import type { Conversation } from '../../../core/types';

export interface ConversationWriteTicket {
  readonly conversationId: string;
  readonly version: number;
}

export interface ConversationWriteCommitResult {
  readonly applied: boolean;
  readonly version: number;
  readonly reason: string;
}

export interface ConversationWriteCommitOptions {
  readonly conversation: Conversation;
  readonly ticket: ConversationWriteTicket;
  readonly reason: string;
  readonly write: () => void | Promise<void>;
}

export class ConversationWriteSerializationService {
  private readonly versions = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly pendingWrites = new Map<string, number>();

  createTicket(conversationId: string): ConversationWriteTicket {
    return {
      conversationId,
      version: this.getVersion(conversationId) + this.getPendingWriteCount(conversationId),
    };
  }

  getVersion(conversationId: string): number {
    return this.versions.get(conversationId) ?? 0;
  }

  commit(options: ConversationWriteCommitOptions): Promise<ConversationWriteCommitResult> {
    const conversationId = options.conversation.id;
    const previous = this.queues.get(conversationId) ?? Promise.resolve();

    this.incrementPendingWriteCount(conversationId);

    const commit = previous
      .catch(() => undefined)
      .then(() => this.runCommit(conversationId, options));
    const queueEntry = commit.then(
      () => undefined,
      () => undefined,
    );

    this.queues.set(conversationId, queueEntry);
    queueEntry.finally(() => {
      if (this.queues.get(conversationId) === queueEntry) {
        this.queues.delete(conversationId);
      }
    });

    return commit;
  }

  private async runCommit(
    conversationId: string,
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
      this.versions.set(conversationId, nextVersion);
      return {
        applied: true,
        version: nextVersion,
        reason: options.reason,
      };
    } finally {
      this.decrementPendingWriteCount(conversationId);
    }
  }

  private getPendingWriteCount(conversationId: string): number {
    return this.pendingWrites.get(conversationId) ?? 0;
  }

  private incrementPendingWriteCount(conversationId: string): void {
    this.pendingWrites.set(conversationId, this.getPendingWriteCount(conversationId) + 1);
  }

  private decrementPendingWriteCount(conversationId: string): void {
    const nextCount = this.getPendingWriteCount(conversationId) - 1;
    if (nextCount > 0) {
      this.pendingWrites.set(conversationId, nextCount);
      return;
    }

    this.pendingWrites.delete(conversationId);
  }
}
