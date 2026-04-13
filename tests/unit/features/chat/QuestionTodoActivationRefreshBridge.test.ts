import type { SessionActivityStatus } from '../../../../src/core/opencode';
import type { QuestionRequest, SessionTodo } from '../../../../src/core/types';
import {
  QuestionTodoActivationRefreshBridge,
  type QuestionTodoActivationRefreshBridgeHost,
} from '../../../../src/features/chat/services/QuestionTodoActivationRefreshBridge';

type MockedActivationRefreshHost = {
  [Key in keyof QuestionTodoActivationRefreshBridgeHost]:
    QuestionTodoActivationRefreshBridgeHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : QuestionTodoActivationRefreshBridgeHost[Key];
};

function createHost(callOrder: string[] = []): MockedActivationRefreshHost {
  return {
    refreshPendingQuestionsForTab: jest.fn(() => {
      callOrder.push('pending-question');
      return Promise.resolve([] as QuestionRequest[]);
    }),
    refreshTabSessionStatus: jest.fn(() => {
      callOrder.push('status');
      return Promise.resolve({ type: 'idle' } as SessionActivityStatus);
    }),
    refreshTabSessionTodos: jest.fn(() => {
      callOrder.push('todo');
      return Promise.resolve([] as SessionTodo[]);
    }),
  };
}

describe('QuestionTodoActivationRefreshBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts activation status, question, and todo refreshes in the existing order', async () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const bridge = new QuestionTodoActivationRefreshBridge(host);

    await bridge.refreshAfterActivation('tab-1', 'session-1');

    expect(host.refreshTabSessionStatus).toHaveBeenCalledWith(
      'tab-1',
      'session-1',
      { suppressErrors: true },
    );
    expect(host.refreshPendingQuestionsForTab).toHaveBeenCalledWith('tab-1', 'session-1');
    expect(host.refreshTabSessionTodos).toHaveBeenCalledWith(
      'tab-1',
      'session-1',
      { suppressErrors: true },
    );
    expect(callOrder).toEqual(['status', 'pending-question', 'todo']);
  });
});
