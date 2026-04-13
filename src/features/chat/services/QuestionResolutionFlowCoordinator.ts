import { Notice } from 'obsidian';

import type {
  QuestionDisplayMode,
  QuestionRequest,
  QuestionResolution,
} from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type {
  QuestionInlineCardAction,
  QuestionInlineCardRenderer,
} from '../runtime/QuestionInlineCardRenderer';
import type { TabId } from '../tabs';
import type { QuestionDockCoordinator } from './QuestionDockCoordinator';
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

export interface QuestionResolutionFlowCoordinatorHost {
  getActiveTabId(): TabId | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
  replyToQuestion(requestId: string, answers: string[][]): Promise<void>;
  rejectQuestion(requestId: string): Promise<void>;
}

export interface QuestionResolutionFlowCoordinatorPorts {
  dockCoordinator: QuestionDockResolutionPort;
  inlineCardRenderer: QuestionInlineCardActionPort;
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
    try {
      if (action.type === 'reject') {
        await this.host.rejectQuestion(request.id);
        await this.applyResolvedQuestionState({
          request,
          status: 'rejected',
        }, tabId);
        return;
      }

      await this.host.replyToQuestion(request.id, action.answers);
      await this.applyResolvedQuestionState({
        request,
        status: 'answered',
        answers: action.answers,
      }, tabId);
    } catch (error) {
      logger.error('Failed to resolve question request:', error);
      new Notice(t('chat.question.notice.error'));
    }
  }

  private async applyResolvedQuestionState(
    resolution: QuestionResolution,
    tabId: TabId | null,
  ): Promise<void> {
    await this.ports.resolutionWriteback.applyResolution(resolution, tabId);
  }
}
