import type { QuestionRequest } from '../../../../src/core/types';
import {
  QuestionResolutionFlowCoordinator,
  type QuestionResolutionFlowCoordinatorHost,
  type QuestionResolutionFlowCoordinatorPorts,
} from '../../../../src/features/chat/services/QuestionResolutionFlowCoordinator';
import type { TabId } from '../../../../src/features/chat/tabs';
import { setLocale } from '../../../../src/i18n';

function createQuestionRequest(overrides?: Partial<QuestionRequest>): QuestionRequest {
  return {
    id: 'request-1',
    sessionId: 'session-1',
    questions: [
      {
        header: 'Programming',
        question: 'Which language are you using?',
        options: [
          { label: 'TypeScript', description: '' },
          { label: 'Python', description: '' },
        ],
        custom: true,
      },
    ],
    ...overrides,
  };
}

function createCoordinator(options?: {
  activeTabId?: TabId | null;
  dockResolves?: boolean;
  action?: Awaited<ReturnType<QuestionResolutionFlowCoordinatorPorts['inlineResolutionAction']['collectResolutionAction']>>;
  applyResult?: boolean;
}) {
  const action = options && 'action' in options
    ? options.action
    : {
      type: 'reply' as const,
      request: createQuestionRequest(),
      answers: [['TypeScript']],
      resolution: {
        request: createQuestionRequest(),
        status: 'answered' as const,
        answers: [['TypeScript']],
      },
    };
  const host: jest.Mocked<QuestionResolutionFlowCoordinatorHost> = {
    getActiveTabId: jest.fn().mockReturnValue(options?.activeTabId ?? 'tab-active'),
  };
  const ports: {
    dockCoordinator: jest.Mocked<QuestionResolutionFlowCoordinatorPorts['dockCoordinator']>;
    inlineResolutionAction: jest.Mocked<QuestionResolutionFlowCoordinatorPorts['inlineResolutionAction']>;
    resolutionExecution: jest.Mocked<QuestionResolutionFlowCoordinatorPorts['resolutionExecution']>;
  } = {
    dockCoordinator: {
      waitForDockResolutionIfEnabled: jest.fn().mockResolvedValue(options?.dockResolves ?? false),
    },
    inlineResolutionAction: {
      collectResolutionAction: jest.fn().mockResolvedValue(action),
    },
    resolutionExecution: {
      executeAndApply: jest.fn().mockResolvedValue(options?.applyResult ?? true),
    },
  };

  return {
    host,
    ports,
    coordinator: new QuestionResolutionFlowCoordinator(host, ports),
  };
}

describe('QuestionResolutionFlowCoordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLocale('en');
  });

  it('returns after the above-input dock resolves the question', async () => {
    const request = createQuestionRequest();
    const { coordinator, ports } = createCoordinator({ dockResolves: true });

    await coordinator.showQuestionDialog(request, 'tab-active');

    expect(ports.dockCoordinator.waitForDockResolutionIfEnabled).toHaveBeenCalledWith(
      request,
      'tab-active',
    );
    expect(ports.inlineResolutionAction.collectResolutionAction).not.toHaveBeenCalled();
    expect(ports.resolutionExecution.executeAndApply).not.toHaveBeenCalled();
  });

  it('replays inline resolution actions through the dock lifecycle owner', async () => {
    const request = createQuestionRequest();
    const inlineAction = {
      type: 'reply' as const,
      request,
      answers: [['TypeScript']],
      resolution: {
        request,
        status: 'answered' as const,
        answers: [['TypeScript']],
      },
    };
    const { coordinator, ports } = createCoordinator({ action: inlineAction });

    await coordinator.showQuestionDialog(request, 'tab-active');

    expect(ports.inlineResolutionAction.collectResolutionAction).toHaveBeenCalledWith(
      request,
      'tab-active',
    );
    expect(ports.resolutionExecution.executeAndApply).toHaveBeenCalledWith(
      inlineAction,
      { tabId: 'tab-active' },
    );
  });

  it('replays inline reject actions through the dock lifecycle owner', async () => {
    const request = createQuestionRequest();
    const inlineAction = {
      type: 'reject' as const,
      request,
      resolution: {
        request,
        status: 'rejected' as const,
      },
    };
    const { coordinator, ports } = createCoordinator({
      action: inlineAction,
    });

    await coordinator.showQuestionDialog(request, 'tab-active');

    expect(ports.resolutionExecution.executeAndApply).toHaveBeenCalledWith(
      inlineAction,
      { tabId: 'tab-active' },
    );
  });

  it('does not resolve when inline card rendering is unavailable', async () => {
    const request = createQuestionRequest();
    const { coordinator, ports } = createCoordinator({ action: null });

    await coordinator.showQuestionDialog(request, 'tab-active');

    expect(ports.resolutionExecution.executeAndApply).not.toHaveBeenCalled();
  });

  it('still delegates inline failures to the shared execution lifecycle owner', async () => {
    const request = createQuestionRequest();
    const { coordinator, ports } = createCoordinator({ applyResult: false });

    await coordinator.showQuestionDialog(request, 'tab-active');

    expect(ports.resolutionExecution.executeAndApply).toHaveBeenCalledTimes(1);
  });
});
