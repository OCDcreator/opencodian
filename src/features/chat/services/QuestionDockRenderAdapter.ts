import type { QuestionDisplayMode, QuestionRequest } from '../../../core/types';
import type { QuestionDockCallbacks, QuestionDockRenderState } from '../ui/QuestionDock';
import {
  getQuestionDockActiveInteractionState,
  type QuestionDockInteractionRuntimeState,
  selectQuestionDockGroup,
  selectQuestionDockQuestion,
  setQuestionDockDraftAnswer,
} from './QuestionDockInteractionState';

export interface QuestionDockRenderActions {
  rerender(): void;
  submit(): void;
  reject(): void;
}

export interface QuestionDockRenderPayload {
  state: QuestionDockRenderState;
  callbacks: QuestionDockCallbacks;
}

const EMPTY_QUESTION_DOCK_CALLBACKS: QuestionDockCallbacks = {
  onAnswerChange: () => {},
  onSelectGroup: () => {},
  onSelectQuestion: () => {},
  onSubmit: () => {},
  onReject: () => {},
  onClose: () => {},
};

export function createEmptyQuestionDockRenderPayload(
  displayMode: QuestionDisplayMode,
): QuestionDockRenderPayload {
  return {
    state: {
      request: null,
      answers: [],
      displayMode,
    },
    callbacks: EMPTY_QUESTION_DOCK_CALLBACKS,
  };
}

export function createQuestionDockRenderPayload(
  runtime: QuestionDockInteractionRuntimeState,
  request: QuestionRequest,
  displayMode: QuestionDisplayMode,
  actions: QuestionDockRenderActions,
): QuestionDockRenderPayload {
  const { answers, viewModel } = getQuestionDockActiveInteractionState(
    runtime,
    request,
    displayMode,
  );

  return {
    state: {
      request,
      answers,
      displayMode,
      activeGroupKey: viewModel.activeGroupKey,
      activeQuestionIndex: viewModel.activeQuestionIndex,
    },
    callbacks: {
      onAnswerChange: (questionIndex, answer) => {
        setQuestionDockDraftAnswer(runtime, request, questionIndex, answer);
      },
      onSelectGroup: (groupKey) => {
        selectQuestionDockGroup(runtime, request, groupKey);
        actions.rerender();
      },
      onSelectQuestion: (questionIndex) => {
        selectQuestionDockQuestion(runtime, request, questionIndex, displayMode);
        actions.rerender();
      },
      onSubmit: () => {
        actions.submit();
      },
      onReject: () => {
        actions.reject();
      },
      onClose: () => {
        actions.reject();
      },
    },
  };
}
