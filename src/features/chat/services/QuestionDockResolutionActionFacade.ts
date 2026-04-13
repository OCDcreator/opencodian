import type { QuestionRequest, QuestionResolution } from '../../../core/types';
import type { TabId } from '../tabs';
import { isQuestionAnswerComplete } from '../ui/questionDockState';
import {
  getQuestionDockDraftAnswers,
  sanitizeQuestionDockAnswer,
  type QuestionDockInteractionRuntimeState,
} from './QuestionDockInteractionState';
import type { QuestionDockRenderStateFacade } from './QuestionDockRenderStateFacade';

type QuestionDockActiveRequestPort = Pick<
  QuestionDockRenderStateFacade,
  'getActivePendingQuestionRequest'
>;

export type QuestionDockResolutionActionRuntimeState = QuestionDockInteractionRuntimeState;

export type QuestionDockResolutionIntent = 'submit' | 'reject';

export type QuestionDockResolutionAction =
  | {
      type: 'skip';
    }
  | {
      type: 'answer-required';
      request: QuestionRequest;
    }
  | {
      type: 'reply';
      request: QuestionRequest;
      answers: string[][];
      resolution: QuestionResolution;
    }
  | {
      type: 'reject';
      request: QuestionRequest;
      resolution: QuestionResolution;
    };

export interface QuestionDockResolutionActionFacadeHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): QuestionDockResolutionActionRuntimeState | null;
}

export class QuestionDockResolutionActionFacade {
  constructor(
    private readonly host: QuestionDockResolutionActionFacadeHost,
    private readonly dockRenderState: QuestionDockActiveRequestPort,
  ) {}

  resolveAction(
    intent: QuestionDockResolutionIntent,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): QuestionDockResolutionAction {
    const request = this.dockRenderState.getActivePendingQuestionRequest(tabId);
    if (!request) {
      return {
        type: 'skip',
      };
    }

    if (intent === 'reject') {
      return {
        type: 'reject',
        request,
        resolution: {
          request,
          status: 'rejected',
        },
      };
    }

    const answers = this.collectDraftAnswers(request, tabId);
    if (this.hasIncompleteAnswers(request, answers)) {
      return {
        type: 'answer-required',
        request,
      };
    }

    return {
      type: 'reply',
      request,
      answers,
      resolution: {
        request,
        status: 'answered',
        answers,
      },
    };
  }

  private collectDraftAnswers(
    request: QuestionRequest,
    tabId: TabId | null,
  ): string[][] {
    const runtime = this.host.getTabRuntimeState(tabId);
    return getQuestionDockDraftAnswers(runtime, request).map((answer, index) =>
      sanitizeQuestionDockAnswer(answer, request, index),
    );
  }

  private hasIncompleteAnswers(
    request: QuestionRequest,
    answers: readonly string[][],
  ): boolean {
    return request.questions.some((question, index) =>
      !isQuestionAnswerComplete(question, answers[index]),
    );
  }
}
