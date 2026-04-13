import type {
  QuestionDisplayMode,
  QuestionRequest,
} from '../../../core/types';
import { createLogger } from '../../../shared';
import type {
  QuestionInlineCardAction,
  QuestionInlineCardRenderer,
} from '../runtime/QuestionInlineCardRenderer';
import type { TabId } from '../tabs';
import {
  createQuestionRejectExecutionAction,
  createQuestionReplyExecutionAction,
  type QuestionResolutionExecutionAction,
} from './QuestionResolutionExecutionFacade';

const logger = createLogger('QuestionInlineResolutionActionFacade');

type QuestionInlineCardActionPort = Pick<QuestionInlineCardRenderer, 'collectAction'>;

export interface QuestionInlineResolutionActionFacadeHost {
  getActiveTabId(): TabId | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
}

export class QuestionInlineResolutionActionFacade {
  constructor(
    private readonly host: QuestionInlineResolutionActionFacadeHost,
    private readonly inlineCardRenderer: QuestionInlineCardActionPort,
  ) {}

  async collectResolutionAction(
    request: QuestionRequest,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): Promise<QuestionResolutionExecutionAction | null> {
    const action = await this.inlineCardRenderer.collectAction(
      request,
      this.host.getQuestionDisplayMode(),
      tabId,
    );

    if (!action) {
      logger.error('No streaming message element found for question card');
      return null;
    }

    return this.createResolutionAction(request, action);
  }

  private createResolutionAction(
    request: QuestionRequest,
    action: QuestionInlineCardAction,
  ): QuestionResolutionExecutionAction {
    if (action.type === 'reject') {
      return createQuestionRejectExecutionAction(request);
    }

    return createQuestionReplyExecutionAction(request, action.answers);
  }
}
