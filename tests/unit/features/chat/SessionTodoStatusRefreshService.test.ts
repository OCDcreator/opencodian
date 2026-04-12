import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type { SessionTodo } from '../../../../src/core/types';
import {
  SessionTodoStatusRefreshService,
  type SessionTodoStatusRefreshRuntime,
  type SessionTodoStatusRefreshServiceHost,
} from '../../../../src/features/chat/services/SessionTodoStatusRefreshService';

type MockedSessionTodoStatusRefreshHost = {
  [Key in keyof SessionTodoStatusRefreshServiceHost]:
    SessionTodoStatusRefreshServiceHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : SessionTodoStatusRefreshServiceHost[Key];
};

function createTodo(id: string): SessionTodo {
  return {
    id,
    content: `Task ${id}`,
    status: 'pending',
    priority: 'medium',
  };
}

function createHost(
  runtime: SessionTodoStatusRefreshRuntime | null = { todoRequestId: 0, statusRequestId: 0 },
): MockedSessionTodoStatusRefreshHost {
  return {
    getTabRuntimeState: jest.fn().mockImplementation(() => runtime),
    getTabSessionTodos: jest.fn().mockReturnValue([] as SessionTodo[]),
    setTabSessionTodos: jest.fn(),
    renderSessionTodoDock: jest.fn(),
    getTabSessionStatus: jest.fn().mockReturnValue(null as SessionActivityStatus | null),
    setTabSessionStatus: jest.fn(),
    getSessionTodos: jest.fn().mockResolvedValue([] as SessionTodo[]),
    getSessionStatuses: jest.fn().mockResolvedValue({} as Record<string, SessionActivityStatus>),
    reconcileBackgroundTaskLiveSignals: jest.fn(),
  };
}

describe('SessionTodoStatusRefreshService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the todo dock and skips remote refresh when runtime is missing', async () => {
    const host = createHost(null);
    const service = new SessionTodoStatusRefreshService(host);

    const result = await service.refreshTabSessionTodos('tab-1', 'session-1');

    expect(result).toEqual([]);
    expect(host.renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
    expect(host.getSessionTodos).not.toHaveBeenCalled();
  });

  it('stores refreshed todos and reconciles background-task live signals', async () => {
    const host = createHost();
    const service = new SessionTodoStatusRefreshService(host);
    const todos = [createTodo('todo-1')];
    host.getSessionTodos.mockResolvedValue(todos);

    const result = await service.refreshTabSessionTodos('tab-1', 'session-1');

    expect(result).toEqual(todos);
    expect(host.getSessionTodos).toHaveBeenCalledWith('session-1');
    expect(host.setTabSessionTodos).toHaveBeenCalledWith('tab-1', todos, 'session-1');
    expect(host.reconcileBackgroundTaskLiveSignals).toHaveBeenCalledWith('tab-1');
  });

  it('returns the current todo snapshot when a refresh result becomes stale', async () => {
    const runtime = { todoRequestId: 0, statusRequestId: 0 };
    const host = createHost(runtime);
    const service = new SessionTodoStatusRefreshService(host);
    const currentTodos = [createTodo('current')];
    host.getTabSessionTodos.mockReturnValue(currentTodos);
    host.getSessionTodos.mockImplementation(async () => {
      runtime.todoRequestId = 99;
      return [createTodo('stale')];
    });

    const result = await service.refreshTabSessionTodos('tab-1', 'session-1');

    expect(result).toEqual(currentTodos);
    expect(host.setTabSessionTodos).not.toHaveBeenCalled();
    expect(host.reconcileBackgroundTaskLiveSignals).not.toHaveBeenCalled();
  });

  it('stores refreshed session status and reconciles background-task live signals', async () => {
    const host = createHost();
    const service = new SessionTodoStatusRefreshService(host);
    const status = { type: 'busy' as const };
    host.getSessionStatuses.mockResolvedValue({ 'session-1': status });

    const result = await service.refreshTabSessionStatus('tab-1', 'session-1');

    expect(result).toEqual(status);
    expect(host.getSessionStatuses).toHaveBeenCalled();
    expect(host.setTabSessionStatus).toHaveBeenCalledWith('tab-1', status, 'session-1');
    expect(host.reconcileBackgroundTaskLiveSignals).toHaveBeenCalledWith('tab-1');
  });

  it('clears session status when the tab has no active session', async () => {
    const host = createHost();
    const service = new SessionTodoStatusRefreshService(host);

    const result = await service.refreshTabSessionStatus('tab-1', null);

    expect(result).toBeNull();
    expect(host.setTabSessionStatus).toHaveBeenCalledWith('tab-1', null, null);
    expect(host.getSessionStatuses).not.toHaveBeenCalled();
  });
});
