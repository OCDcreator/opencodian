import * as obsidian from 'obsidian';

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
    replyToQuestion: jest.fn().mockResolvedValue(undefined),
    rejectQuestion: jest.fn().mockResolvedValue(undefined),
  };
  const ports: {
    dockCoordinator: jest.Mocked<QuestionResolutionFlowCoordinatorPorts['dockCoordinator']>;
    inlineCardRenderer: jest.Mocked<QuestionResolutionFlowCoordinatorPorts['inlineCardRenderer']>;
    resolutionCoordinator: jest.Mocked<QuestionResolutionFlowCoordinatorPorts['resolutionCoordinator']>;
    resolvedRequestRuntime: jest.Mocked<QuestionResolutionFlowCoordinatorPorts['resolvedRequestRuntime']>;
    postResolutionRuntime: jest.Mocked<QuestionResolutionFlowCoordinatorPorts['postResolutionRuntime']>;
  } = {
    dockCoordinator: {
      waitForDockResolutionIfEnabled: jest.fn().mockResolvedValue(options?.dockResolves ?? false),
    },
    inlineCardRenderer: {
      collectAction: jest.fn().mockResolvedValue(action),
    },
    resolutionCoordinator: {
      applyResolvedQuestionState: jest.fn(),
    },
    resolvedRequestRuntime: {
      markQuestionRequestResolved: jest.fn(),
    },
    postResolutionRuntime: {
      followUpAfterResolution: jest.fn().mockResolvedValue(undefined),
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
    const { coordinator, host, ports } = createCoordinator({ dockResolves: true });

    await coordinator.showQuestionDialog(request, 'tab-active');

    expect(ports.dockCoordinator.waitForDockResolutionIfEnabled).toHaveBeenCalledWith(
      request,
      'tab-active',
    );
    expect(ports.inlineCardRenderer.collectAction).not.toHaveBeenCalled();
    expect(host.replyToQuestion).not.toHaveBeenCalled();
    expect(host.rejectQuestion).not.toHaveBeenCalled();
    expect(ports.resolutionCoordinator.applyResolvedQuestionState).not.toHaveBeenCalled();
    expect(ports.postResolutionRuntime.followUpAfterResolution).not.toHaveBeenCalled();
  });

  it('replies through the inline card fallback and applies answered state', async () => {
    const request = createQuestionRequest();
    const { coordinator, host, ports } = createCoordinator({ displayMode: 'single' });

    await coordinator.showQuestionDialog(request, 'tab-active');

    expect(ports.inlineCardRenderer.collectAction).toHaveBeenCalledWith(
      request,
      'single',
      'tab-active',
    );
    expect(host.replyToQuestion).toHaveBeenCalledWith(request.id, [['TypeScript']]);
    expect(ports.resolvedRequestRuntime.markQuestionRequestResolved).toHaveBeenCalledWith(
      request.id,
      'tab-active',
    );
    expect(ports.resolutionCoordinator.applyResolvedQuestionState).toHaveBeenCalledWith({
      request,
      status: 'answered',
      answers: [['TypeScript']],
    }, 'tab-active');
    expect(ports.postResolutionRuntime.followUpAfterResolution).toHaveBeenCalledWith('tab-active');
  });

  it('rejects through the inline card fallback and applies rejected state', async () => {
    const request = createQuestionRequest();
    const { coordinator, host, ports } = createCoordinator({
      action: { type: 'reject' },
    });

    await coordinator.showQuestionDialog(request, 'tab-active');

    expect(host.rejectQuestion).toHaveBeenCalledWith(request.id);
    expect(host.replyToQuestion).not.toHaveBeenCalled();
    expect(ports.resolvedRequestRuntime.markQuestionRequestResolved).toHaveBeenCalledWith(
      request.id,
      'tab-active',
    );
    expect(ports.resolutionCoordinator.applyResolvedQuestionState).toHaveBeenCalledWith({
      request,
      status: 'rejected',
    }, 'tab-active');
    expect(ports.postResolutionRuntime.followUpAfterResolution).toHaveBeenCalledWith('tab-active');
  });

  it('does not resolve when inline card rendering is unavailable', async () => {
    const request = createQuestionRequest();
    const { coordinator, host, ports } = createCoordinator({ action: null });

    await coordinator.showQuestionDialog(request, 'tab-active');

    expect(host.replyToQuestion).not.toHaveBeenCalled();
    expect(host.rejectQuestion).not.toHaveBeenCalled();
    expect(ports.resolvedRequestRuntime.markQuestionRequestResolved).not.toHaveBeenCalled();
    expect(ports.resolutionCoordinator.applyResolvedQuestionState).not.toHaveBeenCalled();
    expect(ports.postResolutionRuntime.followUpAfterResolution).not.toHaveBeenCalled();
  });

  it('shows the existing error notice when inline resolution fails', async () => {
    const request = createQuestionRequest();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const { coordinator, host, ports } = createCoordinator();
    host.replyToQuestion.mockRejectedValueOnce(new Error('boom'));

    await coordinator.showQuestionDialog(request, 'tab-active');

    expect(noticeSpy).toHaveBeenCalledWith('Failed to send the question response.');
    expect(ports.resolvedRequestRuntime.markQuestionRequestResolved).not.toHaveBeenCalled();
    expect(ports.resolutionCoordinator.applyResolvedQuestionState).not.toHaveBeenCalled();
    expect(ports.postResolutionRuntime.followUpAfterResolution).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
