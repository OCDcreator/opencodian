import type {
  QuestionDisplayMode,
  QuestionRequest,
} from '../../../../src/core/types';
import { setLocale } from '../../../../src/i18n';
import {
  QuestionResolutionFlowCoordinator,
  type QuestionResolutionFlowCoordinatorHost,
  type QuestionResolutionFlowCoordinatorPorts,
} from '../../../../src/features/chat/services/QuestionResolutionFlowCoordinator';
import type { TabId } from '../../../../src/features/chat/tabs';

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
  displayMode?: QuestionDisplayMode;
  dockResolves?: boolean;
  action?: Awaited<ReturnType<QuestionResolutionFlowCoordinatorPorts['inlineCardRenderer']['collectAction']>>;
  applyResult?: boolean;
}) {
  const action = options && 'action' in options
    ? options.action
    : {
      type: 'reply' as const,
      answers: [['TypeScript']],
    };
  const host: jest.Mocked<QuestionResolutionFlowCoordinatorHost> = {
    getActiveTabId: jest.fn().mockReturnValue(options?.activeTabId ?? 'tab-active'),
    getQuestionDisplayMode: jest.fn().mockReturnValue(options?.displayMode ?? 'all'),
  };
  const ports: {
    dockCoordinator: jest.Mocked<QuestionResolutionFlowCoordinatorPorts['dockCoordinator']>;
    inlineCardRenderer: jest.Mocked<QuestionResolutionFlowCoordinatorPorts['inlineCardRenderer']>;
    resolutionApply: jest.Mocked<QuestionResolutionFlowCoordinatorPorts['resolutionApply']>;
  } = {
    dockCoordinator: {
      waitForDockResolutionIfEnabled: jest.fn().mockResolvedValue(options?.dockResolves ?? false),
    },
    inlineCardRenderer: {
      collectAction: jest.fn().mockResolvedValue(action),
    },
    resolutionApply: {
      applyAction: jest.fn().mockResolvedValue(options?.applyResult ?? true),
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
    expect(ports.inlineCardRenderer.collectAction).not.toHaveBeenCalled();
    expect(ports.resolutionApply.applyAction).not.toHaveBeenCalled();
  });

  it('replies through the inline card fallback via the shared apply seam', async () => {
    const request = createQuestionRequest();
    const { coordinator, ports } = createCoordinator({ displayMode: 'single' });

    await coordinator.showQuestionDialog(request, 'tab-active');

    expect(ports.inlineCardRenderer.collectAction).toHaveBeenCalledWith(
      request,
      'single',
      'tab-active',
    );
    expect(ports.resolutionApply.applyAction).toHaveBeenCalledWith({
      type: 'reply',
      request,
      answers: [['TypeScript']],
      resolution: {
        request,
        status: 'answered',
        answers: [['TypeScript']],
      },
    }, 'tab-active');
  });

  it('rejects through the inline card fallback via the shared apply seam', async () => {
    const request = createQuestionRequest();
    const { coordinator, ports } = createCoordinator({
      action: { type: 'reject' },
    });

    await coordinator.showQuestionDialog(request, 'tab-active');

    expect(ports.resolutionApply.applyAction).toHaveBeenCalledWith({
      type: 'reject',
      request,
      resolution: {
        request,
        status: 'rejected',
      },
    }, 'tab-active');
  });

  it('does not resolve when inline card rendering is unavailable', async () => {
    const request = createQuestionRequest();
    const { coordinator, ports } = createCoordinator({ action: null });

    await coordinator.showQuestionDialog(request, 'tab-active');

    expect(ports.resolutionApply.applyAction).not.toHaveBeenCalled();
  });

  it('still delegates inline failures to the shared apply seam', async () => {
    const request = createQuestionRequest();
    const { coordinator, ports } = createCoordinator({ applyResult: false });

    await coordinator.showQuestionDialog(request, 'tab-active');

    expect(ports.resolutionApply.applyAction).toHaveBeenCalledTimes(1);
  });
});
