import type { QuestionRequest, QuestionResolution } from '../../../../src/core/types';
import { t } from '../../../../src/i18n';
import { QuestionResolutionCoordinator } from '../../../../src/features/chat/runtime/QuestionResolutionCoordinator';

function createQuestionRequest(): QuestionRequest {
  return {
    id: 'question-1',
    sessionId: 'session-1',
    questions: [
      {
        header: 'Language',
        question: 'Which languages should be included?',
        options: [],
        multiple: true,
        custom: true,
      },
    ],
  };
}

function createResolution(): QuestionResolution {
  return {
    request: createQuestionRequest(),
    status: 'answered',
    answers: [['TypeScript', 'Rust']],
  };
}

function createHarness(options?: { cardEl?: HTMLElement | null; shouldRender?: boolean }) {
  const runtime = {
    pendingQuestionResolution: null as QuestionResolution | null,
  };
  const questionInlineCardRenderer = {
    clear: jest.fn(),
    getOrCreateCard: jest.fn(() => options?.cardEl ?? null),
  };
  const keepQuestionCardPinnedToBottom = jest.fn();
  const coordinator = new QuestionResolutionCoordinator(questionInlineCardRenderer, {
    getTabRuntimeState: () => runtime,
    shouldRenderQuestionResolutionCards: () => options?.shouldRender ?? true,
    keepQuestionCardPinnedToBottom,
  });

  return {
    coordinator,
    keepQuestionCardPinnedToBottom,
    questionInlineCardRenderer,
    runtime,
  };
}

describe('QuestionResolutionCoordinator', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('stores pending resolution state and clears the inline card when cards are disabled', () => {
    const resolution = createResolution();
    const harness = createHarness({ shouldRender: false });

    harness.coordinator.applyResolvedQuestionState(resolution, 'tab-1');

    expect(harness.runtime.pendingQuestionResolution).toBe(resolution);
    expect(harness.questionInlineCardRenderer.clear).toHaveBeenCalledWith('tab-1');
    expect(harness.questionInlineCardRenderer.getOrCreateCard).not.toHaveBeenCalled();
    expect(harness.keepQuestionCardPinnedToBottom).not.toHaveBeenCalled();
  });

  it('reuses the shared inline card container and renders the resolved summary when enabled', () => {
    const resolution = createResolution();
    const cardEl = document.createElement('div');
    document.body.appendChild(cardEl);
    const harness = createHarness({
      cardEl,
      shouldRender: true,
    });

    harness.coordinator.applyResolvedQuestionState(resolution, 'tab-1');

    expect(harness.runtime.pendingQuestionResolution).toBe(resolution);
    expect(harness.questionInlineCardRenderer.getOrCreateCard).toHaveBeenCalledWith(
      'opencodian-question-inline opencodian-question-inline--resolved',
      'tab-1',
    );
    expect(cardEl.querySelector('.opencodian-question-inline-title')?.textContent)
      .toBe(t('chat.question.notice.answeredTitle'));
    expect(harness.keepQuestionCardPinnedToBottom).toHaveBeenCalledWith('tab-1');
  });

  it('keeps pending resolution state even if no card container is available', () => {
    const resolution = createResolution();
    const harness = createHarness({
      cardEl: null,
      shouldRender: true,
    });

    harness.coordinator.applyResolvedQuestionState(resolution, 'tab-1');

    expect(harness.runtime.pendingQuestionResolution).toBe(resolution);
    expect(harness.keepQuestionCardPinnedToBottom).not.toHaveBeenCalled();
  });
});
