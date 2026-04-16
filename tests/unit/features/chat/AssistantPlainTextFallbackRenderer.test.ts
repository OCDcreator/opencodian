import type { QuestionRequest, QuestionResolution } from '../../../../src/core/types';
import { renderAssistantPlainTextFallbackContent } from '../../../../src/features/chat/runtime/AssistantPlainTextFallbackRenderer';
import { buildQuestionResolutionCardRenderPlan } from '../../../../src/features/chat/runtime/QuestionResolutionCardRenderer';
import type { MarkdownRenderService } from '../../../../src/utils/markdown';

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

describe('AssistantPlainTextFallbackRenderer', () => {
  afterEach(() => {
    document.body.replaceChildren();
    jest.clearAllMocks();
  });

  it('renders a resolved card before markdown fallback content', async () => {
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    const resolution: QuestionResolution = {
      request: createQuestionRequest(),
      status: 'answered',
      answers: [['TypeScript']],
    };
    const markdownService = {
      render: jest.fn().mockImplementation(async (targetEl: HTMLElement, markdown: string) => {
        targetEl.textContent = `rendered:${markdown}`;
        return { success: true };
      }),
    } as Pick<MarkdownRenderService, 'render'>;

    await renderAssistantPlainTextFallbackContent({
      containerEl,
      messageContent: '**Final answer**',
      markdownService: markdownService as MarkdownRenderService,
      questionResolutionRenderPlan: buildQuestionResolutionCardRenderPlan({
        questionResolution: resolution,
        shouldRenderQuestionResolutionCard: true,
      }),
    });

    expect(containerEl.children).toHaveLength(2);
    expect(containerEl.children[0].classList.contains('opencodian-question-inline--resolved')).toBe(true);
    expect(containerEl.children[1].classList.contains('opencodian-message-text')).toBe(true);
    expect(containerEl.children[1].textContent).toBe('rendered:**Final answer**');
    expect(markdownService.render).toHaveBeenCalledWith(
      containerEl.children[1],
      '**Final answer**',
    );
  });

  it('falls back to text content when markdown rendering is unavailable', async () => {
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    await renderAssistantPlainTextFallbackContent({
      containerEl,
      messageContent: 'Plain answer',
      markdownService: null,
      questionResolutionRenderPlan: buildQuestionResolutionCardRenderPlan(),
    });

    expect(containerEl.children).toHaveLength(1);
    expect(containerEl.children[0].classList.contains('opencodian-message-text')).toBe(true);
    expect(containerEl.children[0].textContent).toBe('Plain answer');
  });
});
