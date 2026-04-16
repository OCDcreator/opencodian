import type { QuestionRequest, QuestionResolution } from '../../../../src/core/types';
import {
  appendQuestionResolutionCard,
  appendQuestionResolutionCardFromRenderPlan,
  buildQuestionAnswerMarkdown,
  buildQuestionRejectedMarkdown,
  buildQuestionResolutionCardRenderPlan,
  populateQuestionResolutionCard,
} from '../../../../src/features/chat/runtime/QuestionResolutionCardRenderer';
import { t } from '../../../../src/i18n';

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
      {
        header: 'Platform',
        question: 'Which platform should be verified?',
        options: [],
        multiple: false,
        custom: false,
      },
    ],
  };
}

describe('QuestionResolutionCardRenderer', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders answered question summaries and updates collapse hints', () => {
    const cardEl = document.createElement('div');
    document.body.appendChild(cardEl);
    const resolution: QuestionResolution = {
      request: createQuestionRequest(),
      status: 'answered',
      answers: [
        ['TypeScript', 'Rust'],
        ['Windows'],
      ],
    };

    populateQuestionResolutionCard(cardEl, resolution);

    const detailsEl = cardEl.querySelector<HTMLDetailsElement>('details');
    const titleEl = cardEl.querySelector('.opencodian-question-inline-title');
    const bodyEl = cardEl.querySelector('.opencodian-question-inline-body-text');
    const hintEl = cardEl.querySelector('.opencodian-question-inline-collapse-hint');
    const values = Array.from(cardEl.querySelectorAll('.opencodian-question-inline-summary-value'))
      .map((element) => element.textContent);

    expect(detailsEl?.open).toBe(true);
    expect(titleEl?.textContent).toBe(t('chat.question.notice.answeredTitle'));
    expect(bodyEl?.textContent).toBe(t('chat.question.notice.answeredBody'));
    expect(hintEl?.textContent).toBe(t('chat.action.showLess'));
    expect(values).toEqual(['TypeScript, Rust', 'Windows']);

    detailsEl!.open = false;
    detailsEl!.dispatchEvent(new Event('toggle'));

    expect(hintEl?.textContent).toBe(t('chat.action.showMore'));
  });

  it('creates and populates a resolved card container inside a parent element', () => {
    const parentEl = document.createElement('div');
    document.body.appendChild(parentEl);

    const cardEl = appendQuestionResolutionCard(parentEl, {
      request: createQuestionRequest(),
      status: 'answered',
      answers: [
        ['TypeScript'],
        ['Windows'],
      ],
    });

    expect(cardEl.parentElement).toBe(parentEl);
    expect(cardEl.className).toBe('opencodian-question-inline opencodian-question-inline--resolved');
    expect(cardEl.querySelector('.opencodian-question-inline-title')?.textContent)
      .toBe(t('chat.question.notice.answeredTitle'));
    expect(parentEl.querySelectorAll('.opencodian-question-inline--resolved')).toHaveLength(1);
  });

  it('splits structured assistant blocks around the resolved card insertion point', () => {
    const resolution: QuestionResolution = {
      request: createQuestionRequest(),
      status: 'answered',
      answers: [
        ['TypeScript'],
        ['Windows'],
      ],
    };
    const renderPlan = buildQuestionResolutionCardRenderPlan({
      contentBlocks: [
        { type: 'text', text: 'Final answer' },
        { type: 'thinking', thinking: 'Reasoning' },
        { type: 'tool_use', toolName: 'search' },
        { type: 'text', text: 'Follow-up detail' },
      ],
      questionResolution: resolution,
      shouldRenderQuestionResolutionCard: true,
    });

    expect(renderPlan.hasContentBlocks).toBe(true);
    expect(renderPlan.blocksBeforeCard).toEqual([
      { type: 'thinking', thinking: 'Reasoning' },
      { type: 'tool_use', toolName: 'search' },
    ]);
    expect(renderPlan.blocksAfterCard).toEqual([
      { type: 'text', text: 'Final answer' },
      { type: 'text', text: 'Follow-up detail' },
    ]);
    expect(renderPlan.resolvedCardResolution).toEqual(resolution);
  });

  it('returns an empty render plan when structured blocks are missing', () => {
    expect(buildQuestionResolutionCardRenderPlan()).toEqual({
      hasContentBlocks: false,
      blocksBeforeCard: [],
      blocksAfterCard: [],
      resolvedCardResolution: null,
    });
  });

  it('keeps the persisted resolved card hidden when the visibility gate is off', () => {
    const renderPlan = buildQuestionResolutionCardRenderPlan({
      questionResolution: {
        request: createQuestionRequest(),
        status: 'answered',
        answers: [
          ['TypeScript'],
          ['Windows'],
        ],
      },
      shouldRenderQuestionResolutionCard: false,
    });
    const parentEl = document.createElement('div');
    document.body.appendChild(parentEl);

    const cardEl = appendQuestionResolutionCardFromRenderPlan(parentEl, renderPlan);

    expect(renderPlan.resolvedCardResolution).toBeNull();
    expect(cardEl).toBeNull();
    expect(parentEl.querySelector('.opencodian-question-inline--resolved')).toBeNull();
  });

  it('renders rejected question summaries and builds matching markdown', () => {
    const request = createQuestionRequest();
    const cardEl = document.createElement('div');
    document.body.appendChild(cardEl);

    populateQuestionResolutionCard(cardEl, {
      request,
      status: 'rejected',
    });

    const titleEl = cardEl.querySelector('.opencodian-question-inline-title');
    const values = Array.from(cardEl.querySelectorAll('.opencodian-question-inline-summary-value'))
      .map((element) => element.textContent);

    expect(titleEl?.textContent).toBe(t('chat.question.notice.rejectedTitle'));
    expect(values).toEqual([
      t('chat.question.reject'),
      t('chat.question.reject'),
    ]);

    expect(buildQuestionAnswerMarkdown(request, [
      ['TypeScript', 'Rust'],
      ['Windows'],
    ])).toBe([
      t('chat.question.notice.answeredBody'),
      '',
      '- **Language**: TypeScript, Rust',
      '- **Platform**: Windows',
    ].join('\n'));

    expect(buildQuestionRejectedMarkdown(request)).toBe([
      t('chat.question.notice.rejectedBody'),
      '',
      '- Language',
      '- Platform',
    ].join('\n'));
  });
});
