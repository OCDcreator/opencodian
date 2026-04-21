import { createLogger } from '../../shared';
import type { SessionDiffEntry, SessionTodo } from '../types';
import type {
  OpenCodeCanonicalMessageInfo,
  OpenCodeCanonicalPart,
} from './types';

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
      info: OpenCodeCanonicalMessageInfo;
    }
  | {
      sessionId: string;
      type: 'message.removed';
      messageId: string;
    }
  | {
      sessionId: string;
      type: 'message.part.updated';
      part: OpenCodeCanonicalPart;
      time: number | null;
    }
  | {
      sessionId: string;
      type: 'message.part.removed';
      messageId: string;
      partId: string;
    }
  | {
      sessionId: string;
      type: 'message.part.delta';
      messageId: string;
      partId: string;
      field: string;
      delta: string;
    }
  | {
      sessionId: string;
      type: 'session.diff';
      diff?: SessionDiffEntry[];
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
      role?: unknown;
      time?: unknown;
      [key: string]: unknown;
    };
    part?: {
      id?: unknown;
      type?: unknown;
      messageID?: unknown;
      sessionID?: unknown;
      [key: string]: unknown;
    };
    messageID?: unknown;
    partID?: unknown;
    field?: unknown;
    delta?: unknown;
    diff?: unknown;
    time?: unknown;
  };
};

type RawSyncEventProperties = NonNullable<RawSyncEvent['properties']>;

export interface OpenCodeSyncEventRuntimeCoordinatorHost {
  shouldUseSdkSync(): boolean;
  subscribeToSyncEvents(signal: AbortSignal): Promise<AsyncIterable<unknown>>;
  normalizeSessionTodos(response: unknown): SessionTodo[];
  normalizeSessionStatus(status: unknown): SessionActivityStatus | null;
  applySessionSyncEvent(update: SessionSyncEventUpdate): void;
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

function normalizeMessageInfo(
  info: RawSyncEventProperties['info'],
  sessionId: string,
): OpenCodeCanonicalMessageInfo | null {
  if (!info || typeof info !== 'object' || typeof info.id !== 'string') {
    return null;
  }

  const role = info.role === 'user' || info.role === 'assistant'
    ? info.role
    : null;
  if (!role) {
    return null;
  }

  const rawTime = info.time && typeof info.time === 'object'
    ? info.time as Record<string, unknown>
    : {};
  const created = typeof rawTime.created === 'number' ? rawTime.created : 0;

  return {
    ...info,
    id: info.id,
    sessionID: typeof info.sessionID === 'string' ? info.sessionID : sessionId,
    role,
    time: {
      ...rawTime,
      created,
    },
  } as OpenCodeCanonicalMessageInfo;
}

function normalizePart(
  part: RawSyncEventProperties['part'],
  sessionId: string,
): OpenCodeCanonicalPart | null {
  if (
    !part
    || typeof part !== 'object'
    || typeof part.id !== 'string'
    || typeof part.messageID !== 'string'
    || typeof part.type !== 'string'
  ) {
    return null;
  }

  return {
    ...part,
    id: part.id,
    sessionID: typeof part.sessionID === 'string' ? part.sessionID : sessionId,
    messageID: part.messageID,
    type: part.type,
  } as OpenCodeCanonicalPart;
}

function resolveStringProperty(
  event: RawSyncEvent,
  key: 'messageID' | 'partID' | 'field' | 'delta',
): string | null {
  const value = event.properties?.[key];
  return typeof value === 'string' ? value : null;
}

function normalizeDiffEntry(rawEntry: unknown): SessionDiffEntry | null {
  if (!rawEntry || typeof rawEntry !== 'object') {
    return null;
  }

  const entry = rawEntry as Record<string, unknown>;
  const file = typeof entry.file === 'string'
    ? entry.file
    : typeof entry.path === 'string'
      ? entry.path
      : '';
  if (!file) {
    return null;
  }

  const status = entry.status === 'added' || entry.status === 'deleted' || entry.status === 'modified'
    ? entry.status
    : undefined;

  return {
    file,
    additions: typeof entry.additions === 'number' ? entry.additions : 0,
    deletions: typeof entry.deletions === 'number' ? entry.deletions : 0,
    ...(typeof entry.patch === 'string' ? { patch: entry.patch } : {}),
    ...(typeof entry.before === 'string' ? { before: entry.before } : {}),
    ...(typeof entry.after === 'string' ? { after: entry.after } : {}),
    ...(status ? { status } : {}),
  };
}

function normalizeDiffEntries(rawDiff: unknown): SessionDiffEntry[] {
  if (!Array.isArray(rawDiff)) {
    return [];
  }

  return rawDiff.reduce<SessionDiffEntry[]>((entries, rawEntry) => {
    const entry = normalizeDiffEntry(rawEntry);
    if (entry) {
      entries.push(entry);
    }
    return entries;
  }, []);
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
      const update = this.createSessionSyncEventUpdate(value, sessionId);
      if (update) {
        this.emitSessionSyncEventUpdate(update);
      }
      return;
    }

    const status = this.host.normalizeSessionStatus(value.properties?.status);
    if (!status) {
      return;
    }

    this.emitSessionStatusUpdate({ sessionId, status });
  }

  private createSessionSyncEventUpdate(
    value: RawSyncEvent,
    sessionId: string,
  ): SessionSyncEventUpdate | null {
    switch (value.type) {
      case 'message.updated': {
        const info = normalizeMessageInfo(value.properties?.info, sessionId);
        return info
          ? {
            sessionId,
            type: 'message.updated',
            info,
          }
          : null;
      }
      case 'message.removed': {
        const messageId = resolveStringProperty(value, 'messageID');
        return messageId
          ? {
            sessionId,
            type: 'message.removed',
            messageId,
          }
          : null;
      }
      case 'message.part.updated': {
        const part = normalizePart(value.properties?.part, sessionId);
        return part
          ? {
            sessionId,
            type: 'message.part.updated',
            part,
            time: typeof value.properties?.time === 'number'
              ? value.properties.time
              : null,
          }
          : null;
      }
      case 'message.part.removed': {
        const messageId = resolveStringProperty(value, 'messageID');
        const partId = resolveStringProperty(value, 'partID');
        return messageId && partId
          ? {
            sessionId,
            type: 'message.part.removed',
            messageId,
            partId,
          }
          : null;
      }
      case 'message.part.delta': {
        const messageId = resolveStringProperty(value, 'messageID');
        const partId = resolveStringProperty(value, 'partID');
        const field = resolveStringProperty(value, 'field');
        const delta = resolveStringProperty(value, 'delta');
        return messageId && partId && field && delta !== null
          ? {
            sessionId,
            type: 'message.part.delta',
            messageId,
            partId,
            field,
            delta,
          }
          : null;
      }
      case 'session.diff':
        return {
          sessionId,
          type: 'session.diff',
          diff: normalizeDiffEntries(value.properties?.diff),
        };
      default:
        return null;
    }
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
    try {
      this.host.applySessionSyncEvent(update);
    } catch (error) {
      logger.error('Session sync-event canonical apply failed', error);
    }

    for (const listener of this.sessionSyncEventListeners) {
      try {
        listener(update);
      } catch (error) {
        logger.error('Session sync-event listener failed', error);
      }
    }
  }
}
