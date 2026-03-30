import type { QuestionRequest } from '../../../../src/core/types';
import { QuestionDock } from '../../../../src/features/chat/ui/QuestionDock';
import {
  buildQuestionDockViewModel,
  buildQuestionGroups,
  getPreferredQuestionIndexForGroup,
} from '../../../../src/features/chat/ui/questionDockState';
import { setLocale } from '../../../../src/i18n';

const request: QuestionRequest = {
  id: 'request-1',
  sessionId: 'session-1',
  questions: [
    {
      header: 'Programming Skills',
      question: 'Which language do you use most?',
      options: [
        { label: 'TypeScript', description: 'Frontend and plugin work' },
        { label: 'Python', description: 'Automation and tooling' },
      ],
      custom: true,
    },
    {
      header: 'Work Environment',
      question: 'Which OS are you on?',
      options: [
        { label: 'Windows', description: '' },
        { label: 'macOS', description: '' },
      ],
      custom: false,
    },
    {
      header: 'Programming Skills',
      question: 'Which runtime are you targeting?',
      options: [
        { label: 'Node.js', description: '' },
        { label: 'Deno', description: '' },
      ],
      custom: false,
    },
  ],
};

describe('questionDockState', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  it('groups questions by header in first-seen order and tracks answered counts', () => {
    const groups = buildQuestionGroups(request, [['TypeScript'], [], ['Node.js']]);

    expect(groups).toEqual([
      {
        key: 'Programming Skills',
        label: 'Programming Skills',
        questionIndexes: [0, 2],
        answeredCount: 2,
        totalCount: 2,
      },
      {
        key: 'Work Environment',
        label: 'Work Environment',
        questionIndexes: [1],
        answeredCount: 0,
        totalCount: 1,
      },
    ]);
  });

  it('prefers the first unanswered question within the selected group', () => {
    expect(
      getPreferredQuestionIndexForGroup(request, [['TypeScript'], [], []], 'Programming Skills'),
    ).toBe(2);
    expect(
      getPreferredQuestionIndexForGroup(request, [['TypeScript'], [], ['Node.js']], 'Programming Skills'),
    ).toBe(0);
  });

  it('builds the all-mode view model from the active group', () => {
    const viewModel = buildQuestionDockViewModel(request, [['TypeScript'], [], []], {
      activeGroupKey: 'Programming Skills',
      displayMode: 'all',
    });

    expect(viewModel.activeGroupKey).toBe('Programming Skills');
    expect(viewModel.answeredCount).toBe(1);
    expect(viewModel.totalCount).toBe(3);
    expect(viewModel.visibleQuestions.map((question) => question.index)).toEqual([0, 2]);
    expect(viewModel.currentStep).toBeNull();
  });
});

describe('QuestionDock', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  it('stays hidden when there is no pending request', () => {
    const parentEl = document.createElement('div');
    document.body.appendChild(parentEl);
    const dock = new QuestionDock(parentEl);

    dock.render(
      {
        request: null,
        answers: [],
        displayMode: 'all',
      },
      {
        onAnswerChange: jest.fn(),
        onSelectGroup: jest.fn(),
        onSelectQuestion: jest.fn(),
        onSubmit: jest.fn(),
        onReject: jest.fn(),
        onClose: jest.fn(),
      },
    );

    expect(parentEl.querySelector('.opencodian-question-dock')?.classList.contains('is-hidden')).toBe(true);
  });

  it('advances to the next question in single mode after a valid answer', () => {
    const parentEl = document.createElement('div');
    document.body.appendChild(parentEl);
    const dock = new QuestionDock(parentEl);
    const onAnswerChange = jest.fn();
    const onSelectQuestion = jest.fn();

    dock.render(
      {
        request,
        answers: [[], [], []],
        displayMode: 'single',
        activeQuestionIndex: 0,
      },
      {
        onAnswerChange,
        onSelectGroup: jest.fn(),
        onSelectQuestion,
        onSubmit: jest.fn(),
        onReject: jest.fn(),
        onClose: jest.fn(),
      },
    );

    const inputEl = parentEl.querySelector<HTMLInputElement>('input[type="radio"][value="TypeScript"]');
    expect(inputEl).not.toBeNull();
    inputEl!.checked = true;
    inputEl!.dispatchEvent(new Event('change', { bubbles: true }));

    const submitBtn = parentEl.querySelector<HTMLButtonElement>('.opencodian-question-inline-btn.is-submit');
    submitBtn?.click();

    expect(onAnswerChange).toHaveBeenCalledWith(0, ['TypeScript']);
    expect(onSelectQuestion).toHaveBeenCalledWith(1);
  });

  it('wires close and reject actions from the dock shell', () => {
    const parentEl = document.createElement('div');
    document.body.appendChild(parentEl);
    const dock = new QuestionDock(parentEl);
    const onClose = jest.fn();
    const onReject = jest.fn();

    dock.render(
      {
        request,
        answers: [['TypeScript'], [], []],
        displayMode: 'all',
        activeGroupKey: 'Programming Skills',
      },
      {
        onAnswerChange: jest.fn(),
        onSelectGroup: jest.fn(),
        onSelectQuestion: jest.fn(),
        onSubmit: jest.fn(),
        onReject,
        onClose,
      },
    );

    parentEl.querySelector<HTMLButtonElement>('.opencodian-question-dock-close')?.click();
    parentEl.querySelector<HTMLButtonElement>('.opencodian-question-inline-btn.is-reject')?.click();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });
});
