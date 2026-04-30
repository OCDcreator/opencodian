import { createLogger } from '../../shared';
import type { SessionTodo } from '../types';
import {
  OpenCodeSyncEventRuntimeCoordinator,
  type SessionActivityStatus,
  type SessionSyncEventUpdate,
} from './OpenCodeSyncEventRuntimeCoordinator';

const logger = createLogger('OpenCodeSessionLifecycleCoordinator');

export interface Session {
  id: string;
  title: string;
  revert?: {
    messageID: string;
    partID?: string;
  } | null;
  time: {
    created: number;
    updated: number;
    compacting?: number | null;
    archived?: number | null;
  };
  archived?: boolean;
  version?: string;
  share?: unknown;
}

export interface Message {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  providerID?: string;
  modelID?: string;
  summary?: boolean;
  structured?: unknown;
  error?: unknown;
  cost?: number;
  tokens?: {
    total?: number;
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
  time: {
    created: number;
    updated?: number;
  };
}

export interface Part {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  auto?: boolean;
  overflow?: boolean;
  tail_start_id?: string;
  synthetic?: boolean;
  metadata?: Record<string, unknown>;
  duration?: number;
  time?: {
    start?: number;
    end?: number;
  };
  [key: string]: unknown;
}

export interface SessionMessage {
  info: Message;
  parts: Part[];
}

export interface OpenCodeSessionLifecycleSdk {
  abort(request: { sessionID: string }): Promise<unknown>;
  create(request: { title: string }): Promise<unknown>;
  get(request: { sessionID: string }): Promise<unknown>;
  list(): Promise<unknown>;
  messages(request: { sessionID: string }): Promise<unknown>;
  todo(request: { sessionID: string }): Promise<unknown>;
  status(): Promise<unknown>;
  delete(request: { sessionID: string }): Promise<unknown>;
  update(request: { sessionID: string; title: string }): Promise<unknown>;
}

type SessionTodoUpdate = {
  sessionId: string;
  todos: SessionTodo[];
};

type SessionStatusUpdate = {
  sessionId: string;
  status: SessionActivityStatus;
};

export type OpenCodeSessionLifecycleSyncRuntime = Pick<
  OpenCodeSyncEventRuntimeCoordinator,
  'subscribeToSessionTodoUpdates' | 'subscribeToSessionStatusUpdates' | 'subscribeToSessionSyncEvents'
>;

export interface OpenCodeSessionLifecycleCoordinatorHost {
  shouldUseSdkAbort(): boolean;
  shouldUseSdkCrud(): boolean;
  getSdkSession(): OpenCodeSessionLifecycleSdk;
  postLegacy<T>(path: string, body: unknown): Promise<T>;
  getLegacy<T>(path: string): Promise<T>;
  patchLegacy<T>(path: string, body: unknown): Promise<T>;
  deleteLegacy(path: string): Promise<void>;
  normalizeSessionId(response: unknown): string;
  normalizeSessionMessages(response: unknown): SessionMessage[];
  normalizeSessionTodos(response: unknown): SessionTodo[];
  normalizeSessionStatuses(response: unknown): Record<string, SessionActivityStatus>;
  applySessionRevertState(sessionId: string, messages: SessionMessage[]): Promise<SessionMessage[]>;
  applyCanonicalSnapshot(sessionId: string, messages: SessionMessage[]): void;
  observeToolNamesInMessages(messages: SessionMessage[]): void;
  logServiceWarning(key: string, message: string, error: unknown): void;
  logServiceError(key: string, message: string, error: unknown): void;
}

export class OpenCodeSessionLifecycleCoordinator {
  private currentSessionId: string | null = null;

  constructor(
    private readonly host: OpenCodeSessionLifecycleCoordinatorHost,
    private readonly syncEventRuntime: OpenCodeSessionLifecycleSyncRuntime,
  ) {}

  async createSession(title?: string, options: { setCurrent?: boolean } = {}): Promise<string> {
    const request = {
      title: title ?? 'New Conversation',
    };

    const response = this.host.shouldUseSdkCrud()
      ? await this.host.getSdkSession().create(request)
      : await this.host.postLegacy<unknown>('/session', request);

    const sessionId = this.host.normalizeSessionId(response);
    if (options.setCurrent ?? true) {
      this.currentSessionId = sessionId;
    }

    return sessionId;
  }

  setSessionId(sessionId: string | null): void {
    this.currentSessionId = sessionId;
  }

  getSessionId(): string | null {
    return this.currentSessionId;
  }

  async getSessionInfo(sessionId: string): Promise<Session> {
    if (this.host.shouldUseSdkCrud()) {
      try {
        return await this.host.getSdkSession().get({ sessionID: sessionId }) as unknown as Session;
      } catch (error) {
        this.host.logServiceWarning('session.get', `SDK session.get failed for ${sessionId}, falling back to legacy HTTP`, error);
      }
    }

    return this.host.getLegacy<Session>(`/session/${sessionId}`);
  }

  async abortSession(sessionId: string): Promise<void> {
    if (!sessionId) {
      return;
    }

    if (this.host.shouldUseSdkAbort()) {
      try {
        await this.host.getSdkSession().abort({ sessionID: sessionId });
        return;
      } catch (error) {
        this.host.logServiceWarning('session.abort', `SDK session.abort failed for ${sessionId}, falling back to legacy HTTP`, error);
      }
    }

    try {
      await this.host.postLegacy(`/session/${sessionId}/abort`, {});
    } catch (error) {
      this.host.logServiceWarning('session.abort', `Failed to abort session ${sessionId} via legacy HTTP`, error);
    }
  }

  async listSessions(): Promise<Session[]> {
    if (this.host.shouldUseSdkCrud()) {
      try {
        const response = await this.host.getSdkSession().list();
        return Array.isArray(response) ? response as Session[] : [];
      } catch (error) {
        this.host.logServiceWarning('session.list', 'SDK session.list failed, falling back to legacy HTTP', error);
      }
    }

    try {
      return await this.host.getLegacy<Session[]>('/session');
    } catch {
      return [];
    }
  }

  async getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
    if (!sessionId) {
      logger.warn('getSessionMessages called with empty sessionId');
      return [];
    }

    if (this.host.shouldUseSdkCrud()) {
      try {
        const response = await this.host.getSdkSession().messages({ sessionID: sessionId });
        const messages = await this.host.applySessionRevertState(
          sessionId,
          this.host.normalizeSessionMessages(response),
        );
        this.host.observeToolNamesInMessages(messages);
        this.host.applyCanonicalSnapshot(sessionId, messages);
        return messages;
      } catch (error) {
        this.host.logServiceWarning('session.messages', `SDK session.messages failed for ${sessionId}, falling back to legacy HTTP`, error);
      }
    }

    try {
      const response = await this.host.getLegacy<unknown>(`/session/${sessionId}/message`);
      const messages = await this.host.applySessionRevertState(
        sessionId,
        Array.isArray(response) ? response as SessionMessage[] : [],
      );
      this.host.observeToolNamesInMessages(messages);
      this.host.applyCanonicalSnapshot(sessionId, messages);
      return messages;
    } catch (error) {
      this.host.logServiceError('session.messages', `Failed to get messages for session ${sessionId}:`, error);
      return [];
    }
  }

  async getSessionTodos(sessionId: string): Promise<SessionTodo[]> {
    if (!sessionId) {
      logger.warn('getSessionTodos called with empty sessionId');
      return [];
    }

    if (this.host.shouldUseSdkCrud()) {
      try {
        const response = await this.host.getSdkSession().todo({ sessionID: sessionId });
        return this.host.normalizeSessionTodos(response);
      } catch (error) {
        this.host.logServiceWarning('session.todo', `SDK session.todo failed for ${sessionId}, falling back to legacy HTTP`, error);
      }
    }

    try {
      const response = await this.host.getLegacy<unknown>(`/session/${sessionId}/todo`);
      return this.host.normalizeSessionTodos(response);
    } catch (error) {
      this.host.logServiceError('session.todo', `Failed to get todos for session ${sessionId}:`, error);
      return [];
    }
  }

  async getSessionStatuses(): Promise<Record<string, SessionActivityStatus>> {
    if (this.host.shouldUseSdkCrud()) {
      try {
        const response = await this.host.getSdkSession().status();
        return this.host.normalizeSessionStatuses(response);
      } catch (error) {
        this.host.logServiceWarning('session.status', 'SDK session.status failed, falling back to legacy HTTP', error);
      }
    }

    try {
      const response = await this.host.getLegacy<unknown>('/session/status');
      return this.host.normalizeSessionStatuses(response);
    } catch (error) {
      this.host.logServiceError('session.status', 'Failed to get session statuses:', error);
      return {};
    }
  }

  subscribeToSessionTodoUpdates(
    listener: (update: SessionTodoUpdate) => void,
  ): () => void {
    return this.syncEventRuntime.subscribeToSessionTodoUpdates(listener);
  }

  subscribeToSessionStatusUpdates(
    listener: (update: SessionStatusUpdate) => void,
  ): () => void {
    return this.syncEventRuntime.subscribeToSessionStatusUpdates(listener);
  }

  subscribeToSessionSyncEvents(
    listener: (update: SessionSyncEventUpdate) => void,
  ): () => void {
    return this.syncEventRuntime.subscribeToSessionSyncEvents(listener);
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (this.host.shouldUseSdkCrud()) {
      await this.host.getSdkSession().delete({ sessionID: sessionId });
    } else {
      await this.host.deleteLegacy(`/session/${sessionId}`);
    }

    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    if (this.host.shouldUseSdkCrud()) {
      await this.host.getSdkSession().update({
        sessionID: sessionId,
        title,
      });
      return;
    }

    await this.host.patchLegacy<Session>(`/session/${sessionId}`, { title });
  }
}
