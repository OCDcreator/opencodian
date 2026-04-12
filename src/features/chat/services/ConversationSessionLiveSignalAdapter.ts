import type { SessionActivityStatus } from '../../../core/opencode';
import type { Conversation, SessionTodo } from '../../../core/types';
import type { TabData, TabId } from '../tabs';
import type { BackgroundTaskLiveSignalCoordinator } from './BackgroundTaskLiveSignalCoordinator';

type ConversationSessionLiveSignalBackgroundTaskPort = Pick<
  BackgroundTaskLiveSignalCoordinator,
  'reconcileStateFromLiveSignals'
>;

export interface ConversationSessionLiveSignalAdapterHost {
  subscribeToSessionTodoUpdates(
    listener: (update: { sessionId: string; todos: SessionTodo[] }) => void,
  ): () => void;
  subscribeToSessionStatusUpdates(
    listener: (update: { sessionId: string; status: SessionActivityStatus }) => void,
  ): () => void;
  getAllTabs(): readonly TabData[];
  getConversations(): readonly Conversation[];
  getCurrentConversation(): Conversation | null;
  getActiveTabId(): TabId | null;
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

  constructor(
    private readonly host: ConversationSessionLiveSignalAdapterHost,
    private readonly backgroundTaskLiveSignalCoordinator: ConversationSessionLiveSignalBackgroundTaskPort,
  ) {}

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
    for (const tabId of this.getMatchedTabIds(sessionId)) {
      this.host.applySessionTodoUpdate(tabId, sessionId, todos);
      this.backgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals(tabId);
    }
  }

  private handleSessionStatusUpdate(sessionId: string, status: SessionActivityStatus): void {
    for (const tabId of this.getMatchedTabIds(sessionId)) {
      this.host.applySessionStatusUpdate(tabId, sessionId, status);
      this.backgroundTaskLiveSignalCoordinator.reconcileStateFromLiveSignals(tabId);
    }
  }

  private getMatchedTabIds(sessionId: string): TabId[] {
    const conversations = new Map(
      this.host.getConversations().map((conversation) => [conversation.id, conversation]),
    );
    const matchedTabIds = this.host.getAllTabs()
      .filter((tab) => {
        const conversation = tab.conversationId ? conversations.get(tab.conversationId) : null;
        return conversation?.openCodeSessionId === sessionId;
      })
      .map((tab) => tab.id);

    const activeTabId = this.host.getActiveTabId();
    if (
      matchedTabIds.length === 0
      && this.host.getCurrentConversation()?.openCodeSessionId === sessionId
      && activeTabId
    ) {
      matchedTabIds.push(activeTabId);
    }

    return matchedTabIds;
  }
}
