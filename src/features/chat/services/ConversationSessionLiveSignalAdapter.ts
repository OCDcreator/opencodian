import type { SessionActivityStatus } from '../../../core/opencode';
import type { SessionTodo } from '../../../core/types';
import type { TabId } from '../tabs';
import type { BackgroundTaskLiveSignalCoordinator } from './BackgroundTaskLiveSignalCoordinator';
import {
  ConversationSessionTabResolver,
  type ConversationSessionTabResolverHost,
} from './ConversationSessionTabResolver';

type ConversationSessionLiveSignalBackgroundTaskPort = Pick<
  BackgroundTaskLiveSignalCoordinator,
  'reconcileStateFromLiveSignals'
>;

export interface ConversationSessionLiveSignalAdapterHost extends ConversationSessionTabResolverHost {
  subscribeToSessionTodoUpdates(
    listener: (update: { sessionId: string; todos: SessionTodo[] }) => void,
  ): () => void;
  subscribeToSessionStatusUpdates(
    listener: (update: { sessionId: string; status: SessionActivityStatus }) => void,
  ): () => void;
  applySessionTodoUpdate(
    tabId: TabId | null,
    sessionId: string,
    todos: SessionTodo[],
  ): void;
  applySessionStatusUpdate(
    tabId: TabId | null,
    sessionId: string,
    status: SessionActivityStatus,
  ): void;
}

export class ConversationSessionLiveSignalAdapter {
  private disposeTodoSubscription: (() => void) | null = null;
  private disposeStatusSubscription: (() => void) | null = null;
  private readonly sessionTabResolver: ConversationSessionTabResolver;

  constructor(
    private readonly host: ConversationSessionLiveSignalAdapterHost,
    private readonly backgroundTaskLiveSignalCoordinator: ConversationSessionLiveSignalBackgroundTaskPort,
  ) {
    this.sessionTabResolver = new ConversationSessionTabResolver(host);
  }

  start(): void {
    this.stop();
    this.disposeTodoSubscription = this.host.subscribeToSessionTodoUpdates(({ sessionId, todos }) => {
      this.handleSessionTodoUpdate(sessionId, todos);
    });
    this.disposeStatusSubscription = this.host.subscribeToSessionStatusUpdates(({ sessionId, status }) => {
      this.handleSessionStatusUpdate(sessionId, status);
    });
  }

  stop(): void {
    this.disposeTodoSubscription?.();
    this.disposeTodoSubscription = null;
    this.disposeStatusSubscription?.();
    this.disposeStatusSubscription = null;
  }

  private handleSessionTodoUpdate(sessionId: string, todos: SessionTodo[]): void {
    for (const tabId of this.sessionTabResolver.resolveMatchedTabIds(sessionId)) {
      this.host.applySessionTodoUpdate(tabId, sessionId, todos);
      this.backgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals(tabId);
    }
  }

  private handleSessionStatusUpdate(sessionId: string, status: SessionActivityStatus): void {
    for (const tabId of this.sessionTabResolver.resolveMatchedTabIds(sessionId)) {
      this.host.applySessionStatusUpdate(tabId, sessionId, status);
      this.backgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals(tabId);
    }
  }
}
