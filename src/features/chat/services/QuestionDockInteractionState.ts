import type { QuestionDisplayMode, QuestionRequest } from '../../../core/types';
import {
  buildQuestionDockViewModel,
  getPreferredQuestionIndexForGroup,
  normalizeQuestionDraftAnswers,
  type QuestionDockViewModel,
} from '../ui/questionDockState';

export interface QuestionDockInteractionRuntimeState {
  questionDraftAnswers: Map<string, string[][]>;
  questionActiveGroupKeys: Map<string, string>;
  questionActiveIndexes: Map<string, number>;
}

export interface QuestionDockActiveInteractionState {
  answers: string[][];
  viewModel: QuestionDockViewModel;
}

export function getQuestionDockActiveInteractionState(
  runtime: QuestionDockInteractionRuntimeState,
  request: QuestionRequest,
  displayMode: QuestionDisplayMode,
): QuestionDockActiveInteractionState {
  const answers = getQuestionDockDraftAnswers(runtime, request);
  const viewModel = buildQuestionDockViewModel(request, answers, {
    activeGroupKey: runtime.questionActiveGroupKeys.get(request.id),
    activeQuestionIndex: runtime.questionActiveIndexes.get(request.id),
    displayMode,
  });

  applyQuestionDockSelection(runtime, request.id, viewModel);

  return {
    answers,
    viewModel,
  };
}

export function getQuestionDockDraftAnswers(
  runtime: QuestionDockInteractionRuntimeState | null,
  request: QuestionRequest,
): string[][] {
  const normalized = normalizeQuestionDraftAnswers(
    request.questions.length,
    runtime?.questionDraftAnswers.get(request.id),
  );
  runtime?.questionDraftAnswers.set(request.id, normalized);
  return normalized;
}

export function setQuestionDockDraftAnswer(
  runtime: QuestionDockInteractionRuntimeState,
  request: QuestionRequest,
  questionIndex: number,
  answer: readonly string[],
): void {
  const nextAnswers = getQuestionDockDraftAnswers(runtime, request);
  nextAnswers[questionIndex] = sanitizeQuestionDockAnswer(answer, request, questionIndex);
  runtime.questionDraftAnswers.set(request.id, nextAnswers);
}

export function selectQuestionDockGroup(
  runtime: QuestionDockInteractionRuntimeState,
  request: QuestionRequest,
  groupKey: string,
): void {
  const answers = getQuestionDockDraftAnswers(runtime, request);
  runtime.questionActiveGroupKeys.set(request.id, groupKey);
  runtime.questionActiveIndexes.set(
    request.id,
    getPreferredQuestionIndexForGroup(request, answers, groupKey),
  );
}

export function selectQuestionDockQuestion(
  runtime: QuestionDockInteractionRuntimeState,
  request: QuestionRequest,
  questionIndex: number,
  displayMode: QuestionDisplayMode,
): void {
  const viewModel = buildQuestionDockViewModel(
    request,
    getQuestionDockDraftAnswers(runtime, request),
    {
      activeQuestionIndex: questionIndex,
      displayMode,
    },
  );

  applyQuestionDockSelection(runtime, request.id, viewModel);
}

export function sanitizeQuestionDockAnswer(
  answer: readonly string[],
  request: QuestionRequest,
  questionIndex: number,
): string[] {
  const cleaned = answer
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (request.questions[questionIndex]?.multiple) {
    return [...new Set(cleaned)];
  }

  return cleaned.length > 0 ? [cleaned[0]] : [];
}

function applyQuestionDockSelection(
  runtime: QuestionDockInteractionRuntimeState,
  requestId: string,
  viewModel: Pick<QuestionDockViewModel, 'activeGroupKey' | 'activeQuestionIndex'>,
): void {
  runtime.questionActiveGroupKeys.set(requestId, viewModel.activeGroupKey);
  runtime.questionActiveIndexes.set(requestId, viewModel.activeQuestionIndex);
}
