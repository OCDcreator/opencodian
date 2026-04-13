import type {
  QuestionDisplayMode,
  QuestionRequest,
  QuestionResolution,
} from '../../../core/types';
import { createLogger } from '../../../shared';
import type {
  QuestionInlineCardAction,
  QuestionInlineCardRenderer,
} from '../runtime/QuestionInlineCardRenderer';
import type { TabId } from '../tabs';
import type { QuestionDockCoordinator } from './QuestionDockCoordinator';
import {
  createQuestionRejectExecutionAction,
  createQuestionReplyExecutionAction,
  type QuestionResolutionExecutionAction,
  type QuestionResolutionExecutionFacade,
} from './QuestionResolutionExecutionFacade';
import type { QuestionResolutionWritebackFacade } from './QuestionResolutionWritebackFacade';

const logger = createLogger('QuestionResolutionFlowCoordinator');

type QuestionDockResolutionPort = Pick<
  QuestionDockCoordinator,
  'waitForDockResolutionIfEnabled'
>;
type QuestionInlineCardActionPort = Pick<QuestionInlineCardRenderer, 'collectAction'>;
type QuestionResolutionWritebackPort = Pick<
  QuestionResolutionWritebackFacade,
  'applyResolution'
>;
type QuestionResolutionExecutionPort = Pick<
  QuestionResolutionExecutionFacade,
  'execute'
>;

export interface QuestionResolutionFlowCoordinatorHost {
  getActiveTabId(): TabId | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
}

export interface QuestionResolutionFlowCoordinatorPorts {
  dockCoordinator: QuestionDockResolutionPort;
  inlineCardRenderer: QuestionInlineCardActionPort;
  resolutionExecution: QuestionResolutionExecutionPort;
  resolutionWriteback: QuestionResolutionWritebackPort;
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
    const resolution = await this.ports.resolutionExecution.execute(
      this.createInlineResolutionExecutionAction(request, action),
    );
    if (!resolution) {
      return;
    }

    await this.applyResolvedQuestionState(resolution, tabId);
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

  private async applyResolvedQuestionState(
    resolution: QuestionResolution,
    tabId: TabId | null,
  ): Promise<void> {
    await this.ports.resolutionWriteback.applyResolution(resolution, tabId);
  }
}
