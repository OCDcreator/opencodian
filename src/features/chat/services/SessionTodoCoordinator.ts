import { Notice } from 'obsidian';

import type { SessionActivityStatus } from '../../../core/opencode';
import type {
  ChatMessage,
  Conversation,
  SessionTodo,
  ToolCallInfo,
} from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';
import {
  SessionTodoDockCoordinator,
  type SessionTodoDockCoordinatorRuntimeState,
} from './SessionTodoDockCoordinator';
import {
  type SessionTodoStateRuntime,
  SessionTodoStateService,
} from './SessionTodoStateService';

const logger = createLogger('SessionTodoCoordinator');

export interface SessionTodoCoordinatorRuntimeState
  extends SessionTodoStateRuntime,
    SessionTodoDockCoordinatorRuntimeState {
  todoRequestId: number;
  statusRequestId: number;
}

interface SessionTodoNoticeMessageOptions {
  title: string;
  content: string;
  tone: ChatMessage['noticeTone'];
}

export interface SessionTodoCoordinatorHost {
  getActiveTabId(): TabId | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getTabRuntimeState(tabId: TabId | null): SessionTodoCoordinatorRuntimeState | null;
  getSessionIdForTab(tabId: TabId | null): string | null;
  getConversationForTab(tabId: TabId | null): Conversation | null;
  hasMatchingPersistentAssistantNoticeMessage(
    title: string,
    content: string,
    tone: ChatMessage['noticeTone'],
    conversation?: Conversation | null,
  ): boolean;
  appendPersistentAssistantNoticeMessage(options: SessionTodoNoticeMessageOptions): Promise<void>;
  getSessionTodos(sessionId: string): Promise<SessionTodo[]>;
  getSessionStatuses(): Promise<Record<string, SessionActivityStatus>>;
  reconcileBackgroundTaskLiveSignals(tabId: TabId | null): void;
}

export class SessionTodoCoordinator {
  private readonly stateService: SessionTodoStateService;
  private readonly dockCoordinator: SessionTodoDockCoordinator;

  constructor(private readonly host: SessionTodoCoordinatorHost) {
    this.stateService = new SessionTodoStateService({
      getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
      getActiveTabId: () => host.getActiveTabId(),
      getSessionIdForTab: (tabId) => host.getSessionIdForTab(tabId),
      getConversationForTab: (tabId) => host.getConversationForTab(tabId),
      renderSessionTodoDock: (tabId) => {
        this.render(tabId);
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

    this.dockCoordinator = new SessionTodoDockCoordinator({
      getActiveTabId: () => host.getActiveTabId(),
      getCurrentConversationSessionId: () => host.getCurrentConversationSessionId(),
      getTabRuntimeState: (tabId) => host.getTabRuntimeState(tabId),
      getTabSessionTodos: (tabId, sessionId) =>
        this.stateService.getTabSessionTodos(tabId, sessionId),
    });
  }

  attach(parentEl: HTMLElement): void {
    this.dockCoordinator.attach(parentEl);
  }

  render(tabId: TabId | null = this.host.getActiveTabId()): void {
    this.dockCoordinator.render(tabId);
  }

  updateForTab(tabId: TabId): void {
    this.dockCoordinator.updateForTab(tabId);
  }

  destroy(): void {
    this.dockCoordinator.destroy();
  }

  getTabSessionTodos(
    tabId: TabId | null,
    sessionId = this.host.getSessionIdForTab(tabId),
  ): SessionTodo[] {
    return this.stateService.getTabSessionTodos(tabId, sessionId);
  }

  getTabSessionStatus(
    tabId: TabId | null,
    sessionId = this.host.getSessionIdForTab(tabId),
  ): SessionActivityStatus | null {
    return this.stateService.getTabSessionStatus(tabId, sessionId);
  }

  hasIncompleteTodos(todos: readonly SessionTodo[]): boolean {
    return this.stateService.hasIncompleteTodos(todos);
  }

  hasIncompleteTabSessionTodos(tabId: TabId | null = this.host.getActiveTabId()): boolean {
    return this.stateService.hasIncompleteTabSessionTodos(tabId);
  }

  reconcileStaleSessionTodoState(tabId: TabId | null = this.host.getActiveTabId()): void {
    this.stateService.reconcileStaleSessionTodoState(tabId);
  }

  async refreshTabSessionTodos(
    tabId: TabId | null,
    sessionId: string | null | undefined,
    options: { suppressErrors?: boolean } = {},
  ): Promise<SessionTodo[]> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || !sessionId) {
      this.render(tabId);
      return [];
    }

    const requestId = runtime.todoRequestId + 1;
    runtime.todoRequestId = requestId;

    try {
      const todos = await this.host.getSessionTodos(sessionId);
      const latestRuntime = this.host.getTabRuntimeState(tabId);
      if (!latestRuntime || latestRuntime.todoRequestId !== requestId) {
        return this.getTabSessionTodos(tabId);
      }

      this.writeSessionTodos(tabId, sessionId, todos);
      this.host.reconcileBackgroundTaskLiveSignals(tabId);
      return todos;
    } catch (error) {
      logger.debug('Failed to refresh session todos', error);
      if (!options.suppressErrors) {
        new Notice(t('chat.todo.loadFailed'));
      }
      return this.getTabSessionTodos(tabId);
    }
  }

  async refreshTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | null | undefined,
    options: { suppressErrors?: boolean } = {},
  ): Promise<SessionActivityStatus | null> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || !sessionId) {
      this.writeSessionStatus(tabId, sessionId ?? null, null);
      return null;
    }

    const requestId = runtime.statusRequestId + 1;
    runtime.statusRequestId = requestId;

    try {
      const statuses = await this.host.getSessionStatuses();
      const latestRuntime = this.host.getTabRuntimeState(tabId);
      if (!latestRuntime || latestRuntime.statusRequestId !== requestId) {
        return this.getTabSessionStatus(tabId, sessionId);
      }

      const status = statuses[sessionId] ?? { type: 'idle' as const };
      this.writeSessionStatus(tabId, sessionId, status);
      this.host.reconcileBackgroundTaskLiveSignals(tabId);
      return status;
    } catch (error) {
      logger.debug('Failed to refresh session status', error);
      if (!options.suppressErrors) {
        new Notice(t('chat.todo.loadFailed'));
      }
      return this.getTabSessionStatus(tabId, sessionId);
    }
  }

  applySessionTodoUpdate(
    tabId: TabId | null,
    sessionId: string,
    todos: SessionTodo[],
  ): void {
    this.writeSessionTodos(tabId, sessionId, todos);
  }

  applySessionStatusUpdate(
    tabId: TabId | null,
    sessionId: string,
    status: SessionActivityStatus,
  ): void {
    this.writeSessionStatus(tabId, sessionId, status);
  }

  applyStreamingTodoSnapshotFromTool(
    toolCall: ToolCallInfo,
    tabId: TabId | null,
  ): void {
    if (toolCall.name !== 'todowrite') {
      return;
    }

    const todos = this.stateService.extractSessionTodosFromToolInput(toolCall.input ?? {});
    if (todos.length === 0) {
      return;
    }

    const sessionId = this.host.getSessionIdForTab(tabId);
    if (!sessionId) {
      return;
    }

    this.writeSessionTodos(tabId, sessionId, todos);
  }

  resetTabSessionState(tabId: TabId | null, sessionId: string | null): void {
    this.writeSessionTodos(tabId, sessionId, []);
    this.writeSessionStatus(tabId, sessionId, null);
  }

  clearTabSessionState(tabId: TabId | null): void {
    this.resetTabSessionState(tabId, null);
  }

  private writeSessionTodos(
    tabId: TabId | null,
    sessionId: string | null,
    todos: SessionTodo[],
  ): void {
    this.stateService.setTabSessionTodos(tabId, todos, sessionId);
  }

  private writeSessionStatus(
    tabId: TabId | null,
    sessionId: string | null,
    status: SessionActivityStatus | null,
  ): void {
    this.stateService.setTabSessionStatus(tabId, status, sessionId);
  }
}
