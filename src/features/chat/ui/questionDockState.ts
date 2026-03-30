import type { QuestionDisplayMode, QuestionPrompt, QuestionRequest } from '../../../core/types';

export interface QuestionDockGroup {
  key: string;
  label: string;
  questionIndexes: number[];
  answeredCount: number;
  totalCount: number;
}

export interface QuestionDockQuestionView {
  index: number;
  question: QuestionPrompt;
  answer: string[];
  answered: boolean;
}

export interface QuestionDockViewModel {
  groups: QuestionDockGroup[];
  activeGroupKey: string;
  activeQuestionIndex: number;
  visibleQuestions: QuestionDockQuestionView[];
  answeredCount: number;
  totalCount: number;
  currentStep: { current: number; total: number } | null;
}

export interface QuestionDockSelectionOptions {
  activeGroupKey?: string | null;
  activeQuestionIndex?: number | null;
  displayMode: QuestionDisplayMode;
}

export function normalizeQuestionDraftAnswers(
  totalQuestions: number,
  answers?: readonly string[][] | null,
): string[][] {
  return Array.from({ length: totalQuestions }, (_, index) => {
    const answer = answers?.[index];
    return Array.isArray(answer) ? [...answer] : [];
  });
}

export function isQuestionAnswerComplete(
  question: QuestionPrompt,
  answer?: readonly string[] | null,
): boolean {
  if (!Array.isArray(answer)) {
    return false;
  }

  return answer.some((item) => typeof item === 'string' && item.trim().length > 0);
}

export function buildQuestionGroups(
  request: QuestionRequest,
  answers: readonly string[][] = [],
): QuestionDockGroup[] {
  const groups = new Map<string, QuestionDockGroup>();

  request.questions.forEach((question, index) => {
    const key = question.header;
    const existing = groups.get(key);

    if (existing) {
      existing.questionIndexes.push(index);
      existing.totalCount += 1;
      if (isQuestionAnswerComplete(question, answers[index])) {
        existing.answeredCount += 1;
      }
      return;
    }

    groups.set(key, {
      key,
      label: question.header,
      questionIndexes: [index],
      answeredCount: isQuestionAnswerComplete(question, answers[index]) ? 1 : 0,
      totalCount: 1,
    });
  });

  return [...groups.values()];
}

export function getPreferredQuestionIndexForGroup(
  request: QuestionRequest,
  answers: readonly string[][],
  groupKey: string,
): number {
  const group = buildQuestionGroups(request, answers).find((item) => item.key === groupKey);
  if (!group || group.questionIndexes.length === 0) {
    return 0;
  }

  return group.questionIndexes.find((index) =>
    !isQuestionAnswerComplete(request.questions[index], answers[index]),
  ) ?? group.questionIndexes[0];
}

function getGroupKeyForQuestionIndex(groups: readonly QuestionDockGroup[], questionIndex: number): string | null {
  const group = groups.find((item) => item.questionIndexes.includes(questionIndex));
  return group?.key ?? null;
}

export function buildQuestionDockViewModel(
  request: QuestionRequest,
  answersInput: readonly string[][] = [],
  options: QuestionDockSelectionOptions,
): QuestionDockViewModel {
  const answers = normalizeQuestionDraftAnswers(request.questions.length, answersInput);
  const groups = buildQuestionGroups(request, answers);
  const totalCount = request.questions.length;
  const answeredCount = request.questions.filter((question, index) =>
    isQuestionAnswerComplete(question, answers[index]),
  ).length;

  if (totalCount === 0 || groups.length === 0) {
    return {
      groups: [],
      activeGroupKey: '',
      activeQuestionIndex: 0,
      visibleQuestions: [],
      answeredCount,
      totalCount,
      currentStep: null,
    };
  }

  let activeGroupKey = options.activeGroupKey ?? '';
  let activeQuestionIndex = Number.isInteger(options.activeQuestionIndex)
    ? Math.max(0, Math.min(options.activeQuestionIndex ?? 0, totalCount - 1))
    : 0;

  const derivedGroupKey = getGroupKeyForQuestionIndex(groups, activeQuestionIndex);
  if (derivedGroupKey) {
    activeGroupKey = derivedGroupKey;
  }

  if (!groups.some((group) => group.key === activeGroupKey)) {
    activeGroupKey = groups[0].key;
  }

  if (options.displayMode === 'single') {
    const groupForIndex = getGroupKeyForQuestionIndex(groups, activeQuestionIndex);
    if (groupForIndex !== activeGroupKey) {
      activeQuestionIndex = getPreferredQuestionIndexForGroup(request, answers, activeGroupKey);
    }
  } else {
    activeQuestionIndex = getPreferredQuestionIndexForGroup(request, answers, activeGroupKey);
  }

  const visibleIndexes = options.displayMode === 'single'
    ? [activeQuestionIndex]
    : (groups.find((group) => group.key === activeGroupKey)?.questionIndexes ?? []);

  return {
    groups,
    activeGroupKey,
    activeQuestionIndex,
    visibleQuestions: visibleIndexes.map((index) => ({
      index,
      question: request.questions[index],
      answer: answers[index] ?? [],
      answered: isQuestionAnswerComplete(request.questions[index], answers[index]),
    })),
    answeredCount,
    totalCount,
    currentStep: options.displayMode === 'single'
      ? {
          current: activeQuestionIndex + 1,
          total: totalCount,
        }
      : null,
  };
}
