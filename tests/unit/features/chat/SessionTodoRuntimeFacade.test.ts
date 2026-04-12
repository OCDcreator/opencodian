import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type {
  SessionTodo,
  ToolCallInfo,
} from '../../../../src/core/types';
import {
  SessionTodoRuntimeFacade,
  type SessionTodoRuntimeFacadeHost,
} from '../../../../src/features/chat/services/SessionTodoRuntimeFacade';
import type { SessionTodoStateService } from '../../../../src/features/chat/services/SessionTodoStateService';

type SessionTodoRuntimeStatePort = Pick<
  SessionTodoStateService,
  | 'extractSessionTodosFromToolInput'
  | 'getTabSessionTodos'
  | 'setTabSessionTodos'
  | 'getTabSessionStatus'
  | 'setTabSessionStatus'
>;

function createToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return {
    id: 'tool-1',
    name: 'todowrite',
    input: {
      todos: [{ content: 'Refactor runtime facade' }],
    },
    status: 'completed',
    ...overrides,
  };
}

describe('SessionTodoRuntimeFacade', () => {
  function createFacade(options?: {
    sessionId?: string | null;
    extractedTodos?: SessionTodo[];
  }) {
    const stateService: jest.Mocked<SessionTodoRuntimeStatePort> = {
      extractSessionTodosFromToolInput: jest
        .fn()
        .mockReturnValue(options?.extractedTodos ?? [{ content: 'Refactor runtime facade', status: 'pending' }]),
      getTabSessionTodos: jest.fn().mockReturnValue([] as SessionTodo[]),
      setTabSessionTodos: jest.fn(),
      getTabSessionStatus: jest.fn().mockReturnValue(null as SessionActivityStatus | null),
      setTabSessionStatus: jest.fn(),
    };
    const host: jest.Mocked<SessionTodoRuntimeFacadeHost> = {
      getSessionIdForTab: jest
        .fn()
        .mockReturnValue(options && 'sessionId' in options ? options.sessionId ?? null : 'session-1'),
    };

    return {
      facade: new SessionTodoRuntimeFacade(stateService, host),
      stateService,
      host,
    };
  }

  it('applies streaming todowrite snapshots through the shared state service', () => {
    const { facade, stateService, host } = createFacade();

    facade.applyStreamingTodoSnapshotFromTool(createToolCall(), 'tab-1');

    expect(stateService.extractSessionTodosFromToolInput).toHaveBeenCalledWith({
      todos: [{ content: 'Refactor runtime facade' }],
    });
    expect(host.getSessionIdForTab).toHaveBeenCalledWith('tab-1');
    expect(stateService.setTabSessionTodos).toHaveBeenCalledWith(
      'tab-1',
      [{ content: 'Refactor runtime facade', status: 'pending' }],
      'session-1',
    );
  });

  it('ignores streaming todo snapshots when no tab session is available', () => {
    const { facade, stateService } = createFacade({ sessionId: null });

    facade.applyStreamingTodoSnapshotFromTool(createToolCall(), 'tab-1');

    expect(stateService.setTabSessionTodos).not.toHaveBeenCalled();
  });

  it('resets and clears tab session state through one facade boundary', () => {
    const { facade, stateService } = createFacade();

    facade.resetTabSessionState('tab-1', 'session-1');
    facade.clearTabSessionState('tab-1');

    expect(stateService.setTabSessionTodos).toHaveBeenNthCalledWith(1, 'tab-1', [], 'session-1');
    expect(stateService.setTabSessionStatus).toHaveBeenNthCalledWith(1, 'tab-1', null, 'session-1');
    expect(stateService.setTabSessionTodos).toHaveBeenNthCalledWith(2, 'tab-1', [], null);
    expect(stateService.setTabSessionStatus).toHaveBeenNthCalledWith(2, 'tab-1', null, null);
  });
});
