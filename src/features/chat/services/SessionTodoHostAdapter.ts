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
import { SessionTodoRuntimeFacade } from './SessionTodoRuntimeFacade';

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
  runtimeFacade: SessionTodoRuntimeFacade;
}

export function createSessionTodoServices(host: SessionTodoViewHost): SessionTodoServices {
  let dockCoordinator!: SessionTodoDockCoordinator;

  const stateService = new SessionTodoStateService({
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

  const runtimeFacade = new SessionTodoRuntimeFacade(stateService, {
    getSessionIdForTab: (tabId) => host.getSessionIdForTab(tabId),
  });

  dockCoordinator = new SessionTodoDockCoordinator({
    getActiveTabId: () => host.getActiveTabId(),
    getCurrentConversationSessionId: () => host.getCurrentConversationSessionId(),
    getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
    getTabSessionTodos: (tabId, sessionId) => runtimeFacade.getTabSessionTodos(tabId, sessionId),
  });

  const statusRefreshService = new SessionTodoStatusRefreshService({
    getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
    getTabSessionTodos: (tabId, sessionId) => runtimeFacade.getTabSessionTodos(tabId, sessionId),
    setTabSessionTodos: (tabId, todos, sessionId) => {
      runtimeFacade.setTabSessionTodos(tabId, todos, sessionId);
    },
    renderSessionTodoDock: (tabId) => {
      dockCoordinator.render(tabId);
    },
    getTabSessionStatus: (tabId, sessionId) => runtimeFacade.getTabSessionStatus(tabId, sessionId),
    setTabSessionStatus: (tabId, status, sessionId) => {
      runtimeFacade.setTabSessionStatus(tabId, status, sessionId);
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
    runtimeFacade,
  };
}
