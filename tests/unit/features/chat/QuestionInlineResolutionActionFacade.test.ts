import type {
  QuestionDisplayMode,
  QuestionRequest,
} from '../../../../src/core/types';
import {
  QuestionInlineResolutionActionFacade,
  type QuestionInlineResolutionActionFacadeHost,
} from '../../../../src/features/chat/services/QuestionInlineResolutionActionFacade';
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

function createFacade(options?: {
  activeTabId?: TabId | null;
  displayMode?: QuestionDisplayMode;
  action?: { type: 'reply'; answers: string[][] } | { type: 'reject' } | null;
}) {
  const host: jest.Mocked<QuestionInlineResolutionActionFacadeHost> = {
    getActiveTabId: jest.fn().mockReturnValue(options?.activeTabId ?? 'tab-active'),
    getQuestionDisplayMode: jest.fn().mockReturnValue(options?.displayMode ?? 'all'),
  };
  const inlineCardRenderer = {
    collectAction: jest.fn().mockResolvedValue(
      options && 'action' in options
        ? options.action
        : {
          type: 'reply' as const,
          answers: [['TypeScript']],
        },
    ),
  };

  return {
    host,
    inlineCardRenderer,
    facade: new QuestionInlineResolutionActionFacade(host, inlineCardRenderer),
  };
}

describe('QuestionInlineResolutionActionFacade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('collects inline reply actions using the configured display mode', async () => {
    const request = createQuestionRequest();
    const { facade, host, inlineCardRenderer } = createFacade({ displayMode: 'single' });

    await expect(facade.collectResolutionAction(request, 'tab-active')).resolves.toEqual({
      type: 'reply',
      request,
      answers: [['TypeScript']],
      resolution: {
        request,
        status: 'answered',
        answers: [['TypeScript']],
      },
    });

    expect(host.getQuestionDisplayMode).toHaveBeenCalledTimes(1);
    expect(inlineCardRenderer.collectAction).toHaveBeenCalledWith(
      request,
      'single',
      'tab-active',
    );
  });

  it('maps inline reject actions into reject execution actions', async () => {
    const request = createQuestionRequest();
    const { facade } = createFacade({
      action: { type: 'reject' },
    });

    await expect(facade.collectResolutionAction(request, 'tab-active')).resolves.toEqual({
      type: 'reject',
      request,
      resolution: {
        request,
        status: 'rejected',
      },
    });
  });

  it('returns null when inline question collection cannot render', async () => {
    const request = createQuestionRequest();
    const { facade } = createFacade({ action: null });

    await expect(facade.collectResolutionAction(request, 'tab-active')).resolves.toBeNull();
  });
});
