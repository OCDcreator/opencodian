import { Notice } from 'obsidian';

import type { QuestionRequest, QuestionResolution } from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';

export type QuestionResolutionExecutionAction =
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

export interface QuestionResolutionExecutionFacadeHost {
  replyToQuestion(requestId: string, answers: string[][]): Promise<void>;
  rejectQuestion(requestId: string): Promise<void>;
}

export interface QuestionResolutionExecutionLifecyclePort {
  markResolvedQuestionRequest(requestId: string, tabId: TabId | null): void;
  applyResolvedQuestionState(
    resolution: QuestionResolution,
    tabId: TabId | null,
  ): void;
  followUpAfterResolution(tabId: TabId | null): Promise<void>;
}

const logger = createLogger('QuestionResolutionExecutionFacade');

export function createQuestionReplyExecutionAction(
  request: QuestionRequest,
  answers: string[][],
): QuestionResolutionExecutionAction {
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

export function createQuestionRejectExecutionAction(
  request: QuestionRequest,
): QuestionResolutionExecutionAction {
  return {
    type: 'reject',
    request,
    resolution: {
      request,
      status: 'rejected',
    },
  };
}

export interface QuestionResolutionApplyContext {
  tabId: TabId | null;
  afterStateApplied?: (() => void | Promise<void>) | null;
}

export class QuestionResolutionExecutionFacade {
  constructor(
    private readonly host: QuestionResolutionExecutionFacadeHost,
    private readonly lifecycle?: QuestionResolutionExecutionLifecyclePort,
  ) {}

  async execute(
    action: QuestionResolutionExecutionAction,
  ): Promise<QuestionResolution | null> {
    try {
      if (action.type === 'reply') {
        await this.host.replyToQuestion(action.request.id, action.answers);
      } else {
        await this.host.rejectQuestion(action.request.id);
      }

      return action.resolution;
    } catch (error) {
      logger.error('Failed to resolve question request:', error);
      new Notice(t('chat.question.notice.error'));
      return null;
    }
  }

  async executeAndApply(
    action: QuestionResolutionExecutionAction,
    context: QuestionResolutionApplyContext,
  ): Promise<boolean> {
    const resolution = await this.execute(action);
    if (!resolution) {
      return false;
    }

    this.lifecycle?.markResolvedQuestionRequest(resolution.request.id, context.tabId);
    this.lifecycle?.applyResolvedQuestionState(resolution, context.tabId);
    await context.afterStateApplied?.();
    await this.lifecycle?.followUpAfterResolution(context.tabId);
    return true;
  }
}
