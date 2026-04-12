import { Notice } from 'obsidian';

import type { SessionActivityStatus } from '../../../core/opencode';
import type { SessionTodo } from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';

const logger = createLogger('SessionTodoStatusRefreshService');

export interface SessionTodoStatusRefreshRuntime {
  todoRequestId: number;
  statusRequestId: number;
}

export interface SessionTodoStatusRefreshServiceHost {
  getTabRuntimeState(tabId: TabId | null): SessionTodoStatusRefreshRuntime | null;
  getTabSessionTodos(tabId: TabId | null, sessionId?: string | null): SessionTodo[];
  setTabSessionTodos(tabId: TabId | null, todos: SessionTodo[], sessionId: string | null): void;
  renderSessionTodoDock(tabId: TabId | null): void;
  getTabSessionStatus(
    tabId: TabId | null,
    sessionId?: string | null,
  ): SessionActivityStatus | null;
  setTabSessionStatus(
    tabId: TabId | null,
    status: SessionActivityStatus | null,
    sessionId: string | null,
  ): void;
  getSessionTodos(sessionId: string): Promise<SessionTodo[]>;
  getSessionStatuses(): Promise<Record<string, SessionActivityStatus>>;
  reconcileBackgroundTaskLiveSignals(tabId: TabId | null): void;
}

export class SessionTodoStatusRefreshService {
  constructor(private readonly host: SessionTodoStatusRefreshServiceHost) {}

  async refreshTabSessionTodos(
    tabId: TabId | null,
    sessionId: string | null | undefined,
    options: { suppressErrors?: boolean } = {},
  ): Promise<SessionTodo[]> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || !sessionId) {
      this.host.renderSessionTodoDock(tabId);
      return [];
    }

    const requestId = runtime.todoRequestId + 1;
    runtime.todoRequestId = requestId;

    try {
      const todos = await this.host.getSessionTodos(sessionId);
      const latestRuntime = this.host.getTabRuntimeState(tabId);
      if (!latestRuntime || latestRuntime.todoRequestId !== requestId) {
        return this.host.getTabSessionTodos(tabId);
      }

      this.host.setTabSessionTodos(tabId, todos, sessionId);
      this.host.reconcileBackgroundTaskLiveSignals(tabId);
      return todos;
    } catch (error) {
      logger.debug('Failed to refresh session todos', error);
      if (!options.suppressErrors) {
        new Notice(t('chat.todo.loadFailed'));
      }
      return this.host.getTabSessionTodos(tabId);
    }
  }

  async refreshTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | null | undefined,
    options: { suppressErrors?: boolean } = {},
  ): Promise<SessionActivityStatus | null> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || !sessionId) {
      this.host.setTabSessionStatus(tabId, null, sessionId ?? null);
      return null;
    }

    const requestId = runtime.statusRequestId + 1;
    runtime.statusRequestId = requestId;

    try {
      const statuses = await this.host.getSessionStatuses();
      const latestRuntime = this.host.getTabRuntimeState(tabId);
      if (!latestRuntime || latestRuntime.statusRequestId !== requestId) {
        return this.host.getTabSessionStatus(tabId, sessionId);
      }

      const status = statuses[sessionId] ?? { type: 'idle' as const };
      this.host.setTabSessionStatus(tabId, status, sessionId);
      this.host.reconcileBackgroundTaskLiveSignals(tabId);
      return status;
    } catch (error) {
      logger.debug('Failed to refresh session status', error);
      if (!options.suppressErrors) {
        new Notice(t('chat.todo.loadFailed'));
      }
      return this.host.getTabSessionStatus(tabId, sessionId);
    }
  }
}
