import { Notice } from 'obsidian';

import type { QuestionDisplayMode, QuestionRequest, QuestionResolution } from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';
import type { QuestionDock } from '../ui/QuestionDock';
import type {
  QuestionDockQueueRuntimeFacade,
} from './QuestionDockQueueRuntimeFacade';
import type {
  QuestionPendingRefreshRuntimeFacade,
  QuestionPendingRefreshRuntimeState,
} from './QuestionPendingRefreshRuntimeFacade';
import type { QuestionPostResolutionRuntimeFacade } from './QuestionPostResolutionRuntimeFacade';
import { isQuestionAnswerComplete } from '../ui/questionDockState';
import {
  getQuestionDockDraftAnswers,
  sanitizeQuestionDockAnswer,
  type QuestionDockInteractionRuntimeState,
} from './QuestionDockInteractionState';
import {
  createEmptyQuestionDockRenderPayload,
  createQuestionDockRenderPayload,
} from './QuestionDockRenderAdapter';

const logger = createLogger('QuestionDockCoordinator');

type QuestionPostResolutionRuntimePort = Pick<
  QuestionPostResolutionRuntimeFacade,
  'followUpAfterResolution'
>;
type QuestionDockQueueRuntimePort = Pick<
  QuestionDockQueueRuntimeFacade,
  'enqueuePendingQuestionRequest' | 'getOrCreateQuestionWaiter' | 'removePendingQuestionRequest'
>;
type QuestionPendingRefreshRuntimePort = Pick<
  QuestionPendingRefreshRuntimeFacade,
  | 'applyRefreshedPendingQuestionRequests'
  | 'clearPendingQuestionState'
  | 'getPendingQuestionRequests'
  | 'markQuestionRequestResolved'
>;

export interface QuestionDockCoordinatorRuntimeState {
  isStreaming: boolean;
  pendingQuestionRequests: QuestionPendingRefreshRuntimeState['pendingQuestionRequests'];
  questionDraftAnswers: QuestionDockInteractionRuntimeState['questionDraftAnswers'];
  questionActiveGroupKeys: QuestionDockInteractionRuntimeState['questionActiveGroupKeys'];
  questionActiveIndexes: QuestionDockInteractionRuntimeState['questionActiveIndexes'];
}

type QuestionDockPort = Pick<QuestionDock, 'render'>;

export interface QuestionDockCoordinatorHost {
  getTabRuntimeState(tabId: TabId | null): QuestionDockCoordinatorRuntimeState | null;
  getActiveTabId(): TabId | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
  getQuestionDock(): QuestionDockPort | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
  shouldUseAboveInputQuestionDock(): boolean;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  getPendingQuestions(): Promise<QuestionRequest[]>;
  replyToQuestion(requestId: string, answers: string[][]): Promise<void>;
  rejectQuestion(requestId: string): Promise<void>;
  applyResolvedQuestionState(resolution: QuestionResolution, tabId: TabId | null): void;
}

export class QuestionDockCoordinator {
  constructor(
    private readonly host: QuestionDockCoordinatorHost,
    private readonly dockQueueRuntime: QuestionDockQueueRuntimePort,
    private readonly pendingRefreshRuntime: QuestionPendingRefreshRuntimePort,
    private readonly postResolutionRuntime: QuestionPostResolutionRuntimePort,
  ) {}

  render(): void {
    const questionDock = this.host.getQuestionDock();
    if (!questionDock) {
      return;
    }

    if (!this.host.shouldUseAboveInputQuestionDock()) {
      this.renderEmptyDock(questionDock);
      return;
    }

    const activeTabId = this.host.getActiveTabId();
    const activeRequest = this.getActivePendingQuestionRequest(activeTabId);
    const activeSessionId = this.host.getCurrentConversationSessionId() ?? null;

    if (!activeTabId || !activeRequest || activeRequest.sessionId !== activeSessionId) {
      this.renderEmptyDock(questionDock);
      return;
    }

    const runtime = this.host.getTabRuntimeState(activeTabId);
    if (!runtime) {
      return;
    }

    const displayMode = this.host.getQuestionDisplayMode();
    const renderPayload = createQuestionDockRenderPayload(
      runtime,
      activeRequest,
      displayMode,
      {
        rerender: () => {
          this.render();
        },
        submit: () => {
          void this.handleQuestionDockSubmit(activeTabId);
        },
        reject: () => {
          void this.handleQuestionDockReject(activeTabId);
        },
      },
    );

    questionDock.render(renderPayload.state, renderPayload.callbacks);
  }

  clearPendingQuestionsForTab(tabId: TabId | null = this.host.getActiveTabId()): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    this.pendingRefreshRuntime.clearPendingQuestionState(tabId);

    this.host.setTabNeedsAttention(tabId, false);

    if (tabId === this.host.getActiveTabId()) {
      this.render();
    }
  }

  async refreshPendingQuestionsForTab(
    tabId: TabId | null,
    sessionId: string | null | undefined = this.host.getSessionIdForTab(tabId),
  ): Promise<QuestionRequest[]> {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime || !sessionId) {
      this.clearPendingQuestionsForTab(tabId);
      return [];
    }

    try {
      const pendingRequests = await this.host.getPendingQuestions();
      const sessionRequests = pendingRequests.filter((request) => request.sessionId === sessionId);
      const mergedRequests = this.pendingRefreshRuntime.applyRefreshedPendingQuestionRequests(
        tabId,
        sessionRequests,
      );

      if (tabId === this.host.getActiveTabId()) {
        this.host.setTabNeedsAttention(tabId, false);
        this.render();
      } else {
        this.host.setTabNeedsAttention(tabId, mergedRequests.length > 0);
      }

      return mergedRequests;
    } catch (error) {
      logger.debug('Failed to refresh pending questions', error);
      return this.pendingRefreshRuntime.getPendingQuestionRequests(tabId);
    }
  }

  private markQuestionRequestResolved(
    requestId: string,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    this.pendingRefreshRuntime.markQuestionRequestResolved(requestId, tabId);
  }

  async waitForDockResolutionIfEnabled(
    request: QuestionRequest,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): Promise<boolean> {
    if (!this.host.shouldUseAboveInputQuestionDock() || !tabId) {
      return false;
    }

    const waiter = this.getOrCreateQuestionWaiter(request.id, tabId);
    if (!waiter) {
      return false;
    }

    this.enqueuePendingQuestionRequest(request, tabId);
    await waiter.promise;
    return true;
  }

  private renderEmptyDock(questionDock: QuestionDockPort): void {
    const renderPayload = createEmptyQuestionDockRenderPayload(this.host.getQuestionDisplayMode());
    questionDock.render(renderPayload.state, renderPayload.callbacks);
  }

  private getActivePendingQuestionRequest(
    tabId: TabId | null = this.host.getActiveTabId(),
  ): QuestionRequest | null {
    return this.host.getTabRuntimeState(tabId)?.pendingQuestionRequests[0] ?? null;
  }

  private getOrCreateQuestionWaiter(
    requestId: string,
    tabId: TabId | null = this.host.getActiveTabId(),
  ) {
    return this.dockQueueRuntime.getOrCreateQuestionWaiter(requestId, tabId);
  }

  private enqueuePendingQuestionRequest(
    request: QuestionRequest,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    this.dockQueueRuntime.enqueuePendingQuestionRequest(
      request,
      tabId,
      this.host.getQuestionDisplayMode(),
    );

    if (tabId !== this.host.getActiveTabId()) {
      this.host.setTabNeedsAttention(tabId, true);
      return;
    }

    this.host.setTabNeedsAttention(tabId, false);
    this.render();
  }

  private removePendingQuestionRequest(
    requestId: string,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    const remainingRequests = this.dockQueueRuntime.removePendingQuestionRequest(requestId, tabId);

    if (tabId === this.host.getActiveTabId()) {
      this.host.setTabNeedsAttention(tabId, false);
      this.render();
      return;
    }

    this.host.setTabNeedsAttention(tabId, remainingRequests.length > 0);
  }

  private async handleQuestionDockSubmit(
    tabId: TabId | null = this.host.getActiveTabId(),
  ): Promise<void> {
    const request = this.getActivePendingQuestionRequest(tabId);
    if (!request) {
      return;
    }

    const runtime = this.host.getTabRuntimeState(tabId);
    const answers = getQuestionDockDraftAnswers(runtime, request).map((answer, index) =>
      sanitizeQuestionDockAnswer(answer, request, index),
    );
    const hasEmptyAnswer = request.questions.some((question, index) =>
      !isQuestionAnswerComplete(question, answers[index]),
    );
    if (hasEmptyAnswer) {
      new Notice(t('chat.question.answerRequired'));
      return;
    }

    try {
      await this.host.replyToQuestion(request.id, answers);
      this.markQuestionRequestResolved(request.id, tabId);
      this.host.applyResolvedQuestionState({
        request,
        status: 'answered',
        answers,
      }, tabId);
      this.removePendingQuestionRequest(request.id, tabId);
      await this.afterQuestionDockResolution(tabId);
    } catch (error) {
      logger.error('Failed to resolve question request:', error);
      new Notice(t('chat.question.notice.error'));
    }
  }

  private async handleQuestionDockReject(
    tabId: TabId | null = this.host.getActiveTabId(),
  ): Promise<void> {
    const request = this.getActivePendingQuestionRequest(tabId);
    if (!request) {
      return;
    }

    try {
      await this.host.rejectQuestion(request.id);
      this.markQuestionRequestResolved(request.id, tabId);
      this.host.applyResolvedQuestionState({
        request,
        status: 'rejected',
      }, tabId);
      this.removePendingQuestionRequest(request.id, tabId);
      await this.afterQuestionDockResolution(tabId);
    } catch (error) {
      logger.error('Failed to resolve question request:', error);
      new Notice(t('chat.question.notice.error'));
    }
  }

  private async afterQuestionDockResolution(tabId: TabId | null): Promise<void> {
    this.render();
    await this.postResolutionRuntime.followUpAfterResolution(tabId);
  }
}
