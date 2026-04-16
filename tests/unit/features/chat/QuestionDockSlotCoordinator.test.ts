import {
  QuestionDockSlotCoordinator,
  type QuestionDockSlotCoordinatorHost,
} from '../../../../src/features/chat/services/QuestionDockSlotCoordinator';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createHost(shouldUseAboveInputQuestionDock = true) {
  const host: Mocked<QuestionDockSlotCoordinatorHost> = {
    shouldUseAboveInputQuestionDock: jest.fn().mockReturnValue(shouldUseAboveInputQuestionDock),
  };

  return { host };
}

describe('QuestionDockSlotCoordinator', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('creates the owned dock slot and triggers an initial render on attach', () => {
    const { host } = createHost();
    const renderDock = jest.fn();
    const coordinator = new QuestionDockSlotCoordinator(host, renderDock);

    coordinator.attach(document.body);

    expect(document.querySelector('.opencodian-question-dock-slot')).not.toBeNull();
    expect(document.querySelector('.opencodian-question-dock')).not.toBeNull();
    expect(coordinator.getQuestionDock()).not.toBeNull();
    expect(renderDock).toHaveBeenCalledTimes(1);
  });

  it('forwards later render triggers and the above-input setting through the dedicated coordinator', () => {
    const { host } = createHost(false);
    const renderDock = jest.fn();
    const coordinator = new QuestionDockSlotCoordinator(host, renderDock);

    coordinator.attach(document.body);
    renderDock.mockClear();

    coordinator.render();

    expect(renderDock).toHaveBeenCalledTimes(1);
    expect(coordinator.shouldUseAboveInputQuestionDock()).toBe(false);
    expect(host.shouldUseAboveInputQuestionDock).toHaveBeenCalledTimes(1);
  });

  it('removes the owned slot and dock on destroy', () => {
    const { host } = createHost();
    const coordinator = new QuestionDockSlotCoordinator(host, jest.fn());

    coordinator.attach(document.body);
    coordinator.destroy();

    expect(document.querySelector('.opencodian-question-dock-slot')).toBeNull();
    expect(document.querySelector('.opencodian-question-dock')).toBeNull();
    expect(coordinator.getQuestionDock()).toBeNull();
  });
});
