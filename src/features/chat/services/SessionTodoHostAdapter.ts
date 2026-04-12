import type { SessionActivityStatus } from '../../../core/opencode';
import type { ChatMessage, Conversation, SessionTodo } from '../../../core/types';
import type { TabId } from '../tabs';
import {
  SessionTodoDockCoordinator,
  type SessionTodoDockCoordinatorRuntimeState,
} from './SessionTodoDockCoordinator';
import {
  SessionTodoStateService,
  type SessionTodoStateRuntime,
} from './SessionTodoStateService';
import {
  SessionTodoStatusRefreshService,
  type SessionTodoStatusRefreshRuntime,
} from './SessionTodoStatusRefreshService';

export interface SessionTodoRuntimeState
  extends SessionTodoStateRuntime,
    SessionTodoStatusRefreshRuntime,
    SessionTodoDockCoordinatorRuntimeState {}

export interface SessionTodoViewHost {
  getActiveTabId(): TabId | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getTabRuntimeState(tabId: TabId | null): SessionTodoRuntimeState | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getConversationForTab(tabId: TabId | null): Conversation | null;
  hasMatchingPersistentAssistantNoticeMessage(
    title: string,
    content: string,
    tone: ChatMessage['noticeTone'],
    conversation?: Conversation | null,
  ): boolean;
  appendPersistentAssistantNoticeMessage(options: {
    title: string;
    content: string;
    tone: ChatMessage['noticeTone'];
  }): Promise<void>;
  getSessionTodos(sessionId: string): Promise<SessionTodo[]>;
  getSessionStatuses(): Promise<Record<string, SessionActivityStatus>>;
  reconcileBackgroundTaskLiveSignals(tabId: TabId | null): void;
}

export interface SessionTodoServices {
  dockCoordinator: SessionTodoDockCoordinator;
  stateService: SessionTodoStateService;
  statusRefreshService: SessionTodoStatusRefreshService;
}

export function createSessionTodoServices(host: SessionTodoViewHost): SessionTodoServices {
  let stateService: SessionTodoStateService;

  const dockCoordinator = new SessionTodoDockCoordinator({
    getActiveTabId: () => host.getActiveTabId(),
    getCurrentConversationSessionId: () => host.getCurrentConversationSessionId(),
    getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
    getTabSessionTodos: (tabId, sessionId) => stateService.getTabSessionTodos(tabId, sessionId),
  });

  stateService = new SessionTodoStateService({
    getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
    getActiveTabId: () => host.getActiveTabId(),
    getSessionIdForTab: (tabId) => host.getSessionIdForTab(tabId),
    getConversationForTab: (tabId) => host.getConversationForTab(tabId),
    renderSessionTodoDock: (tabId) => {
      dockCoordinator.render(tabId);
    },
    hasMatchingPersistentAssistantNoticeMessage: (
      title,
      content,
      tone,
      conversation,
    ) => host.hasMatchingPersistentAssistantNoticeMessage(title, content, tone, conversation),
    appendPersistentAssistantNoticeMessage: (options) =>
      host.appendPersistentAssistantNoticeMessage(options),
  });

  const statusRefreshService = new SessionTodoStatusRefreshService({
    getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
    getTabSessionTodos: (tabId, sessionId) => stateService.getTabSessionTodos(tabId, sessionId),
    setTabSessionTodos: (tabId, todos, sessionId) => {
      stateService.setTabSessionTodos(tabId, todos, sessionId);
    },
    renderSessionTodoDock: (tabId) => {
      dockCoordinator.render(tabId);
    },
    getTabSessionStatus: (tabId, sessionId) => stateService.getTabSessionStatus(tabId, sessionId),
    setTabSessionStatus: (tabId, status, sessionId) => {
      stateService.setTabSessionStatus(tabId, status, sessionId);
    },
    getSessionTodos: (sessionId) => host.getSessionTodos(sessionId),
    getSessionStatuses: () => host.getSessionStatuses(),
    reconcileBackgroundTaskLiveSignals: (tabId) => {
      host.reconcileBackgroundTaskLiveSignals(tabId);
    },
  });

  return {
    dockCoordinator,
    stateService,
    statusRefreshService,
  };
}
