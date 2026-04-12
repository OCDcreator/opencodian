import type { QuestionRequest } from '../../../../src/core/types';
import {
  getQuestionDockActiveInteractionState,
  sanitizeQuestionDockAnswer,
  selectQuestionDockGroup,
  selectQuestionDockQuestion,
  setQuestionDockDraftAnswer,
  type QuestionDockInteractionRuntimeState,
} from '../../../../src/features/chat/services/QuestionDockInteractionState';

const request: QuestionRequest = {
  id: 'request-1',
  sessionId: 'session-1',
  questions: [
    {
      header: 'Programming',
      question: 'Which language do you use most?',
      options: [
        { label: 'TypeScript', description: '' },
        { label: 'Python', description: '' },
      ],
      custom: true,
    },
    {
      header: 'Work Environment',
      question: 'Which OS are you on?',
      options: [
        { label: 'macOS', description: '' },
        { label: 'Windows', description: '' },
      ],
      custom: false,
    },
    {
      header: 'Programming',
      question: 'Which runtimes are you targeting?',
      options: [
        { label: 'Node.js', description: '' },
        { label: 'Bun', description: '' },
      ],
      custom: true,
      multiple: true,
    },
  ],
};

function createRuntimeState(
  answers: string[][] = [],
): QuestionDockInteractionRuntimeState {
  return {
    questionDraftAnswers: new Map<string, string[][]>(
      answers.length > 0 ? [[request.id, answers]] : [],
    ),
    questionActiveGroupKeys: new Map(),
    questionActiveIndexes: new Map(),
  };
}

describe('QuestionDockInteractionState', () => {
  it('sanitizes single-answer and multi-answer drafts before submission', () => {
    expect(sanitizeQuestionDockAnswer([' TypeScript ', ' Python '], request, 0)).toEqual([
      'TypeScript',
    ]);
    expect(sanitizeQuestionDockAnswer([' Node.js ', 'Node.js', '  ', ' Bun '], request, 2)).toEqual([
      'Node.js',
      'Bun',
    ]);
  });

  it('normalizes draft answers and persists the derived active selection', () => {
    const runtime = createRuntimeState([['TypeScript']]);

    const { answers, viewModel } = getQuestionDockActiveInteractionState(
      runtime,
      request,
      'all',
    );

    expect(answers).toEqual([['TypeScript'], [], []]);
    expect(viewModel.activeGroupKey).toBe('Programming');
    expect(viewModel.activeQuestionIndex).toBe(2);
    expect(runtime.questionDraftAnswers.get(request.id)).toEqual([['TypeScript'], [], []]);
    expect(runtime.questionActiveGroupKeys.get(request.id)).toBe('Programming');
    expect(runtime.questionActiveIndexes.get(request.id)).toBe(2);
  });

  it('updates draft answers and active group/index from dock callbacks', () => {
    const runtime = createRuntimeState([['TypeScript'], [], []]);

    setQuestionDockDraftAnswer(runtime, request, 2, [' Node.js ', 'Node.js', ' Bun ']);
    selectQuestionDockGroup(runtime, request, 'Programming');

    expect(runtime.questionDraftAnswers.get(request.id)?.[2]).toEqual(['Node.js', 'Bun']);
    expect(runtime.questionActiveGroupKeys.get(request.id)).toBe('Programming');
    expect(runtime.questionActiveIndexes.get(request.id)).toBe(0);

    selectQuestionDockQuestion(runtime, request, 1, 'single');

    expect(runtime.questionActiveGroupKeys.get(request.id)).toBe('Work Environment');
    expect(runtime.questionActiveIndexes.get(request.id)).toBe(1);
  });
});
