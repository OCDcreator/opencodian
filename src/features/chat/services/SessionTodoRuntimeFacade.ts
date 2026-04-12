import type { SessionActivityStatus } from '../../../core/opencode';
import type {
  SessionTodo,
  ToolCallInfo,
} from '../../../core/types';
import type { TabId } from '../tabs';
import type { SessionTodoStateService } from './SessionTodoStateService';

type SessionTodoRuntimeStatePort = Pick<
  SessionTodoStateService,
  | 'extractSessionTodosFromToolInput'
  | 'getTabSessionTodos'
  | 'setTabSessionTodos'
  | 'getTabSessionStatus'
  | 'setTabSessionStatus'
>;

export interface SessionTodoRuntimeFacadeHost {
  getSessionIdForTab(tabId: TabId | null): string | null;
}

export class SessionTodoRuntimeFacade {
  constructor(
    private readonly stateService: SessionTodoRuntimeStatePort,
    private readonly host: SessionTodoRuntimeFacadeHost,
  ) {}

  getTabSessionTodos(
    tabId: TabId | null,
    sessionId = this.host.getSessionIdForTab(tabId),
  ): SessionTodo[] {
    return this.stateService.getTabSessionTodos(tabId, sessionId);
  }

  setTabSessionTodos(
    tabId: TabId | null,
    todos: SessionTodo[],
    sessionId: string | null = this.host.getSessionIdForTab(tabId),
  ): void {
    this.stateService.setTabSessionTodos(tabId, todos, sessionId);
  }

  getTabSessionStatus(
    tabId: TabId | null,
    sessionId = this.host.getSessionIdForTab(tabId),
  ): SessionActivityStatus | null {
    return this.stateService.getTabSessionStatus(tabId, sessionId);
  }

  setTabSessionStatus(
    tabId: TabId | null,
    status: SessionActivityStatus | null,
    sessionId: string | null = this.host.getSessionIdForTab(tabId),
  ): void {
    this.stateService.setTabSessionStatus(tabId, status, sessionId);
  }

  applySessionTodoUpdate(
    tabId: TabId | null,
    sessionId: string,
    todos: SessionTodo[],
  ): void {
    this.stateService.setTabSessionTodos(tabId, todos, sessionId);
  }

  applySessionStatusUpdate(
    tabId: TabId | null,
    sessionId: string,
    status: SessionActivityStatus,
  ): void {
    this.stateService.setTabSessionStatus(tabId, status, sessionId);
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

    this.stateService.setTabSessionTodos(tabId, todos, sessionId);
  }

  resetTabSessionState(tabId: TabId | null, sessionId: string | null): void {
    this.stateService.setTabSessionTodos(tabId, [], sessionId);
    this.stateService.setTabSessionStatus(tabId, null, sessionId);
  }

  clearTabSessionState(tabId: TabId | null): void {
    this.resetTabSessionState(tabId, null);
  }
}
