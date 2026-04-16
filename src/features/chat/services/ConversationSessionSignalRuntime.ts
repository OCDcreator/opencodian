import type {
  SessionActivityStatus,
  SessionSyncEventUpdate,
} from '../../../core/opencode';
import type { SessionTodo } from '../../../core/types';
import type { TabId } from '../tabs';
import type { BackgroundTaskLiveSignalCoordinator } from './BackgroundTaskLiveSignalCoordinator';
import {
  type ConversationSessionTabResolutionPort,
  ConversationSessionTabResolver,
  type ConversationSessionTabResolverHost,
} from './ConversationSessionTabResolver';

type ConversationSessionSignalBackgroundTaskPort = Pick<
  BackgroundTaskLiveSignalCoordinator,
  'reconcileStateFromLiveSignals'
>;

export interface ConversationSessionSignalRuntimeHost extends ConversationSessionTabResolverHost {
  subscribeToSessionSyncEvents(listener: (update: SessionSyncEventUpdate) => void): () => void;
  subscribeToSessionTodoUpdates(
    listener: (update: { sessionId: string; todos: SessionTodo[] }) => void,
  ): () => void;
  subscribeToSessionStatusUpdates(
    listener: (update: { sessionId: string; status: SessionActivityStatus }) => void,
  ): () => void;
  scheduleConversationSyncFromSignal(tabId: TabId | null, reason: SessionSyncEventUpdate['type']): void;
  applySessionTodoUpdate(tabId: TabId | null, sessionId: string, todos: SessionTodo[]): void;
  applySessionStatusUpdate(
    tabId: TabId | null,
    sessionId: string,
    status: SessionActivityStatus,
  ): void;
}

export class ConversationSessionSignalRuntime {
  private disposeSessionSyncEvents: (() => void) | null = null;
  private disposeSessionTodoUpdates: (() => void) | null = null;
  private disposeSessionStatusUpdates: (() => void) | null = null;
  private readonly sessionTabResolver: ConversationSessionTabResolutionPort;

  constructor(
    private readonly host: ConversationSessionSignalRuntimeHost,
    private readonly backgroundTaskLiveSignalCoordinator: ConversationSessionSignalBackgroundTaskPort,
    sessionTabResolver: ConversationSessionTabResolutionPort = new ConversationSessionTabResolver(host),
  ) {
    this.sessionTabResolver = sessionTabResolver;
  }

  start(): void {
    this.stop();
    this.disposeSessionTodoUpdates = this.host.subscribeToSessionTodoUpdates(({ sessionId, todos }) => {
      this.handleSessionTodoUpdate(sessionId, todos);
    });
    this.disposeSessionStatusUpdates = this.host.subscribeToSessionStatusUpdates(({ sessionId, status }) => {
      this.handleSessionStatusUpdate(sessionId, status);
    });
    this.disposeSessionSyncEvents = this.host.subscribeToSessionSyncEvents((update) => {
      this.handleSessionSyncEvent(update);
    });
  }

  stop(): void {
    this.disposeSessionTodoUpdates?.();
    this.disposeSessionTodoUpdates = null;
    this.disposeSessionStatusUpdates?.();
    this.disposeSessionStatusUpdates = null;
    this.disposeSessionSyncEvents?.();
    this.disposeSessionSyncEvents = null;
  }

  private handleSessionSyncEvent(update: SessionSyncEventUpdate): void {
    for (const tabId of this.sessionTabResolver.resolveMatchedTabIds(update.sessionId)) {
      this.host.scheduleConversationSyncFromSignal(tabId, update.type);
    }
  }

  private handleSessionTodoUpdate(sessionId: string, todos: SessionTodo[]): void {
    for (const tabId of this.sessionTabResolver.resolveMatchedTabIds(sessionId)) {
      this.host.applySessionTodoUpdate(tabId, sessionId, todos);
      this.backgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals(tabId);
    }
  }

  private handleSessionStatusUpdate(
    sessionId: string,
    status: SessionActivityStatus,
  ): void {
    for (const tabId of this.sessionTabResolver.resolveMatchedTabIds(sessionId)) {
      this.host.applySessionStatusUpdate(tabId, sessionId, status);
      this.backgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals(tabId);
    }
  }
}
