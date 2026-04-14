import type { QuestionTodoActivationRefreshBridge } from '../../../../src/features/chat/services/QuestionTodoActivationRefreshBridge';
import {
  QuestionTodoActivationRefreshCoordinator,
  type QuestionTodoActivationRefreshCoordinatorHost,
} from '../../../../src/features/chat/services/QuestionTodoActivationRefreshCoordinator';

type QuestionTodoActivationRefreshPort = Pick<
  QuestionTodoActivationRefreshBridge,
  'refreshAfterActivation'
>;

function createHost(
  callOrder: string[],
): jest.Mocked<QuestionTodoActivationRefreshCoordinatorHost> {
  return {
    renderQuestionDock: jest.fn(() => {
      callOrder.push('question');
    }),
    updateSessionTodoDockForTab: jest.fn(() => {
      callOrder.push('todo-update');
    }),
    renderSessionTodoDock: jest.fn(() => {
      callOrder.push('todo-render');
    }),
  };
}

function createRefreshCoordinator(
  callOrder: string[],
): jest.Mocked<QuestionTodoActivationRefreshPort> {
  return {
    refreshAfterActivation: jest.fn(() => {
      callOrder.push('refresh');
      return Promise.resolve(undefined);
    }),
  };
}

describe('QuestionTodoActivationRefreshCoordinator', () => {
  it('applies activation preflight dock refreshes in order', () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const coordinator = new QuestionTodoActivationRefreshCoordinator(host, refreshCoordinator);

    coordinator.applyActivationPreflight('tab-1');

    expect(host.renderQuestionDock).toHaveBeenCalledTimes(1);
    expect(host.updateSessionTodoDockForTab).toHaveBeenCalledWith('tab-1');
    expect(refreshCoordinator.refreshAfterActivation).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['question', 'todo-update']);
  });

  it('applies conversation activation refreshes in order', () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const coordinator = new QuestionTodoActivationRefreshCoordinator(host, refreshCoordinator);

    coordinator.applyConversationActivation('tab-1', 'session-1');

    expect(host.renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
    expect(host.renderQuestionDock).toHaveBeenCalledTimes(1);
    expect(refreshCoordinator.refreshAfterActivation).toHaveBeenCalledWith('tab-1', 'session-1');
    expect(callOrder).toEqual(['todo-render', 'question', 'refresh']);
  });

  it('applies empty activation refreshes without supplemental status refresh', () => {
    const callOrder: string[] = [];
    const host = createHost(callOrder);
    const refreshCoordinator = createRefreshCoordinator(callOrder);
    const coordinator = new QuestionTodoActivationRefreshCoordinator(host, refreshCoordinator);

    coordinator.applyEmptyActivation('tab-1');

    expect(host.renderSessionTodoDock).toHaveBeenCalledWith('tab-1');
    expect(host.renderQuestionDock).toHaveBeenCalledTimes(1);
    expect(refreshCoordinator.refreshAfterActivation).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['todo-render', 'question']);
  });
});
