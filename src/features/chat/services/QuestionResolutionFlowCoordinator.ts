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
import type { QuestionDockCoordinator } from './QuestionDockCoordinator';
import type { QuestionResolutionApplyFacade } from './QuestionResolutionApplyFacade';
import {
  createQuestionRejectExecutionAction,
  createQuestionReplyExecutionAction,
  type QuestionResolutionExecutionAction,
} from './QuestionResolutionExecutionFacade';

const logger = createLogger('QuestionResolutionFlowCoordinator');

type QuestionDockResolutionPort = Pick<
  QuestionDockCoordinator,
  'waitForDockResolutionIfEnabled'
>;
type QuestionInlineCardActionPort = Pick<QuestionInlineCardRenderer, 'collectAction'>;
type QuestionResolutionApplyPort = Pick<
  QuestionResolutionApplyFacade,
  'applyAction'
>;

export interface QuestionResolutionFlowCoordinatorHost {
  getActiveTabId(): TabId | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
}

export interface QuestionResolutionFlowCoordinatorPorts {
  dockCoordinator: QuestionDockResolutionPort;
  inlineCardRenderer: QuestionInlineCardActionPort;
  resolutionApply: QuestionResolutionApplyPort;
}

export class QuestionResolutionFlowCoordinator {
  constructor(
    private readonly host: QuestionResolutionFlowCoordinatorHost,
    private readonly ports: QuestionResolutionFlowCoordinatorPorts,
  ) {}

  async showQuestionDialog(
    request: QuestionRequest,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): Promise<void> {
    if (await this.ports.dockCoordinator.waitForDockResolutionIfEnabled(request, tabId)) {
      return;
    }

    const action = await this.ports.inlineCardRenderer.collectAction(
      request,
      this.host.getQuestionDisplayMode(),
      tabId,
    );

    if (!action) {
      logger.error('No streaming message element found for question card');
      return;
    }

    await this.resolveInlineQuestionAction(request, action, tabId);
  }

  private async resolveInlineQuestionAction(
    request: QuestionRequest,
    action: QuestionInlineCardAction,
    tabId: TabId | null,
  ): Promise<void> {
    await this.ports.resolutionApply.applyAction(
      this.createInlineResolutionExecutionAction(request, action),
      tabId,
    );
  }

  private createInlineResolutionExecutionAction(
    request: QuestionRequest,
    action: QuestionInlineCardAction,
  ): QuestionResolutionExecutionAction {
    if (action.type === 'reject') {
      return createQuestionRejectExecutionAction(request);
    }

    return createQuestionReplyExecutionAction(request, action.answers);
  }
}
