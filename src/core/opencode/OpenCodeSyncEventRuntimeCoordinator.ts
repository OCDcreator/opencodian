import { createLogger } from '../../shared';
import type { SessionTodo } from '../types';

const logger = createLogger('OpenCodeSyncEventRuntimeCoordinator');
const TRANSIENT_CONNECTIVITY_RECOVERY_POLL_MS = 3_000;

export type SessionActivityStatus =
  | {
      type: 'idle';
    }
  | {
      type: 'busy';
    }
  | {
      type: 'retry';
      attempt: number;
      message: string;
      next: number;
    };

type SessionTodoUpdate = {
  sessionId: string;
  todos: SessionTodo[];
};

type SessionTodoListener = (update: SessionTodoUpdate) => void;

type SessionStatusUpdate = {
  sessionId: string;
  status: SessionActivityStatus;
};

type SessionStatusListener = (update: SessionStatusUpdate) => void;

export type SessionSyncEventUpdate =
  | {
      sessionId: string;
      type: 'message.updated';
      messageId: string | null;
    }
  | {
      sessionId: string;
      type: 'message.part.updated';
      messageId: string | null;
      partId: string | null;
      partType: string | null;
      time: number | null;
    }
  | {
      sessionId: string;
      type: 'session.diff';
    };

type SessionSyncEventListener = (update: SessionSyncEventUpdate) => void;

type RawSyncEvent = {
  type?: string;
  properties?: {
    sessionID?: unknown;
    todos?: unknown;
    status?: unknown;
    info?: {
      id?: unknown;
      sessionID?: unknown;
    };
    part?: {
      id?: unknown;
      type?: unknown;
      messageID?: unknown;
      sessionID?: unknown;
    };
    time?: unknown;
  };
};

export interface OpenCodeSyncEventRuntimeCoordinatorHost {
  shouldUseSdkSync(): boolean;
  subscribeToSyncEvents(signal: AbortSignal): Promise<AsyncIterable<unknown>>;
  normalizeSessionTodos(response: unknown): SessionTodo[];
  normalizeSessionStatus(status: unknown): SessionActivityStatus | null;
  isTransientConnectivityError(error: unknown): boolean;
  logSyncEventStreamFailure(error: unknown): void;
  checkHealth(): Promise<boolean>;
  delay(ms: number, signal?: AbortSignal): Promise<void>;
}

function resolveSessionId(event: RawSyncEvent): string {
  return typeof event.properties?.sessionID === 'string'
    ? event.properties.sessionID
    : typeof event.properties?.info?.sessionID === 'string'
      ? event.properties.info.sessionID
      : typeof event.properties?.part?.sessionID === 'string'
        ? event.properties.part.sessionID
        : '';
}

export class OpenCodeSyncEventRuntimeCoordinator {
  private readonly sessionTodoListeners = new Set<SessionTodoListener>();
  private readonly sessionStatusListeners = new Set<SessionStatusListener>();
  private readonly sessionSyncEventListeners = new Set<SessionSyncEventListener>();
  private subscriptionAbortController: AbortController | null = null;
  private subscriptionPromise: Promise<void> | null = null;
  private wanted = false;

  constructor(private readonly host: OpenCodeSyncEventRuntimeCoordinatorHost) {}

  subscribeToSessionTodoUpdates(listener: (update: SessionTodoUpdate) => void): () => void {
    this.sessionTodoListeners.add(listener);
    this.wanted = true;
    this.ensureSubscription();

    return () => {
      this.sessionTodoListeners.delete(listener);
      if (!this.hasListeners()) {
        this.stopSubscription();
      }
    };
  }

  subscribeToSessionStatusUpdates(listener: (update: SessionStatusUpdate) => void): () => void {
    this.sessionStatusListeners.add(listener);
    this.wanted = true;
    this.ensureSubscription();

    return () => {
      this.sessionStatusListeners.delete(listener);
      if (!this.hasListeners()) {
        this.stopSubscription();
      }
    };
  }

  subscribeToSessionSyncEvents(listener: (update: SessionSyncEventUpdate) => void): () => void {
    this.sessionSyncEventListeners.add(listener);
    this.wanted = true;
    this.ensureSubscription();

    return () => {
      this.sessionSyncEventListeners.delete(listener);
      if (!this.hasListeners()) {
        this.stopSubscription();
      }
    };
  }

  hasListeners(): boolean {
    return this.sessionTodoListeners.size > 0
      || this.sessionStatusListeners.size > 0
      || this.sessionSyncEventListeners.size > 0;
  }

  ensureSubscription(): void {
    if (!this.host.shouldUseSdkSync()) {
      return;
    }

    if (!this.wanted || !this.hasListeners() || this.subscriptionPromise) {
      return;
    }

    const abortController = new AbortController();
    this.subscriptionAbortController = abortController;
    this.subscriptionPromise = this.runLoop(abortController).finally(() => {
      if (this.subscriptionAbortController === abortController) {
        this.subscriptionAbortController = null;
      }
      this.subscriptionPromise = null;
      if (this.wanted && this.hasListeners() && this.host.shouldUseSdkSync()) {
        this.ensureSubscription();
      }
    });
  }

  stopSubscription(keepWanted = false): void {
    this.wanted = keepWanted;
    this.subscriptionAbortController?.abort();
    this.subscriptionAbortController = null;
  }

  restartSubscription(): void {
    if (!this.host.shouldUseSdkSync() || !this.hasListeners()) {
      return;
    }

    this.stopSubscription(true);
    if (!this.subscriptionPromise) {
      this.ensureSubscription();
    }
  }

  private async runLoop(abortController: AbortController): Promise<void> {
    while (!abortController.signal.aborted && this.hasListeners()) {
      try {
        const stream = await this.host.subscribeToSyncEvents(abortController.signal);

        for await (const event of stream) {
          if (abortController.signal.aborted) {
            break;
          }
          this.handleSyncEvent(event);
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          break;
        }
        const isTransientConnectivity = this.host.isTransientConnectivityError(error);
        this.host.logSyncEventStreamFailure(error);
        if (isTransientConnectivity) {
          await this.waitForTransientConnectivityRecovery(abortController.signal);
          continue;
        }
      }

      if (abortController.signal.aborted) {
        break;
      }

      await this.host.delay(1000, abortController.signal).catch(() => {});
    }
  }

  private async waitForTransientConnectivityRecovery(signal: AbortSignal): Promise<void> {
    while (!signal.aborted && this.wanted && this.hasListeners()) {
      const healthy = await this.host.checkHealth().catch(() => false);
      if (healthy) {
        return;
      }

      await this.host.delay(TRANSIENT_CONNECTIVITY_RECOVERY_POLL_MS, signal).catch(() => {});
    }
  }

  private handleSyncEvent(event: unknown): void {
    if (!event || typeof event !== 'object') {
      return;
    }

    const value = event as RawSyncEvent;
    const sessionId = resolveSessionId(value);
    if (!sessionId) {
      return;
    }

    if (value.type === 'todo.updated') {
      const todos = this.host.normalizeSessionTodos(value.properties?.todos);
      this.emitSessionTodoUpdate({ sessionId, todos });
      return;
    }

    if (value.type !== 'session.status') {
      if (value.type === 'message.updated') {
        this.emitSessionSyncEventUpdate({
          sessionId,
          type: 'message.updated',
          messageId: typeof value.properties?.info?.id === 'string'
            ? value.properties.info.id
            : null,
        });
      } else if (value.type === 'message.part.updated') {
        this.emitSessionSyncEventUpdate({
          sessionId,
          type: 'message.part.updated',
          messageId: typeof value.properties?.part?.messageID === 'string'
            ? value.properties.part.messageID
            : null,
          partId: typeof value.properties?.part?.id === 'string'
            ? value.properties.part.id
            : null,
          partType: typeof value.properties?.part?.type === 'string'
            ? value.properties.part.type
            : null,
          time: typeof value.properties?.time === 'number'
            ? value.properties.time
            : null,
        });
      } else if (value.type === 'session.diff') {
        this.emitSessionSyncEventUpdate({
          sessionId,
          type: 'session.diff',
        });
      }
      return;
    }

    const status = this.host.normalizeSessionStatus(value.properties?.status);
    if (!status) {
      return;
    }

    this.emitSessionStatusUpdate({ sessionId, status });
  }

  private emitSessionTodoUpdate(update: SessionTodoUpdate): void {
    for (const listener of this.sessionTodoListeners) {
      try {
        listener(update);
      } catch (error) {
        logger.error('Session todo listener failed', error);
      }
    }
  }

  private emitSessionStatusUpdate(update: SessionStatusUpdate): void {
    for (const listener of this.sessionStatusListeners) {
      try {
        listener(update);
      } catch (error) {
        logger.error('Session status listener failed', error);
      }
    }
  }

  private emitSessionSyncEventUpdate(update: SessionSyncEventUpdate): void {
    for (const listener of this.sessionSyncEventListeners) {
      try {
        listener(update);
      } catch (error) {
        logger.error('Session sync-event listener failed', error);
      }
    }
  }
}
