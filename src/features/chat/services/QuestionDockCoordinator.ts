import { Notice } from 'obsidian';

import type { QuestionDisplayMode, QuestionRequest, QuestionResolution } from '../../../core/types';
import { t } from '../../../i18n';
import type { TabId } from '../tabs';
import type { QuestionDock } from '../ui/QuestionDock';
import type { QuestionDockRefreshFacade } from './QuestionDockRefreshFacade';
import type {
  QuestionDockRenderStateFacade,
  QuestionDockRenderStateRuntimeState,
} from './QuestionDockRenderStateFacade';
import type { QuestionDockWritebackFacade } from './QuestionDockWritebackFacade';
import type {
  QuestionDockQueueRuntimeFacade,
} from './QuestionDockQueueRuntimeFacade';
import type { QuestionResolutionWritebackFacade } from './QuestionResolutionWritebackFacade';
import { isQuestionAnswerComplete } from '../ui/questionDockState';
import {
  getQuestionDockDraftAnswers,
  sanitizeQuestionDockAnswer,
} from './QuestionDockInteractionState';
import {
  createEmptyQuestionDockRenderPayload,
  createQuestionDockRenderPayload,
} from './QuestionDockRenderAdapter';

type QuestionResolutionWritebackPort = Pick<
  QuestionResolutionWritebackFacade,
  'applyResolution'
>;
type QuestionDockQueueRuntimePort = Pick<
  QuestionDockQueueRuntimeFacade,
  'enqueuePendingQuestionRequest' | 'getOrCreateQuestionWaiter' | 'removePendingQuestionRequest'
>;
type QuestionDockRefreshPort = Pick<
  QuestionDockRefreshFacade,
  'clearPendingQuestionsForTab' | 'refreshPendingQuestionsForTab'
>;
type QuestionDockRenderStatePort = Pick<
  QuestionDockRenderStateFacade,
  'getActivePendingQuestionRequest' | 'resolveRenderState'
>;
type QuestionDockWritebackPort = Pick<
  QuestionDockWritebackFacade,
  | 'applyClearedPendingQuestions'
  | 'applyEnqueuedPendingQuestionRequest'
  | 'applyRefreshedPendingQuestions'
  | 'applyRemovedPendingQuestionRequest'
>;

export interface QuestionDockCoordinatorRuntimeState extends QuestionDockRenderStateRuntimeState {
  isStreaming: boolean;
}

type QuestionDockPort = Pick<QuestionDock, 'render'>;

export interface QuestionDockCoordinatorHost {
  getTabRuntimeState(tabId: TabId | null): QuestionDockCoordinatorRuntimeState | null;
  getActiveTabId(): TabId | null;
  getQuestionDock(): QuestionDockPort | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
  shouldUseAboveInputQuestionDock(): boolean;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
  replyToQuestion(requestId: string, answers: string[][]): Promise<void>;
  rejectQuestion(requestId: string): Promise<void>;
}

export class QuestionDockCoordinator {
  constructor(
    private readonly host: QuestionDockCoordinatorHost,
    private readonly dockRenderState: QuestionDockRenderStatePort,
    private readonly dockQueueRuntime: QuestionDockQueueRuntimePort,
    private readonly dockRefresh: QuestionDockRefreshPort,
    private readonly dockWriteback: QuestionDockWritebackPort,
    private readonly resolutionWriteback: QuestionResolutionWritebackPort,
  ) {}

  render(): void {
    const questionDock = this.host.getQuestionDock();
    if (!questionDock) {
      return;
    }

    const renderState = this.dockRenderState.resolveRenderState();
    if (renderState.kind === 'skip') {
      return;
    }

    if (renderState.kind === 'empty') {
      this.renderEmptyDock(questionDock, renderState.displayMode);
      return;
    }
    const renderPayload = createQuestionDockRenderPayload(
      renderState.runtime,
      renderState.request,
      renderState.displayMode,
      {
        rerender: () => {
          this.render();
        },
        submit: () => {
          void this.handleQuestionDockSubmit(renderState.tabId);
        },
        reject: () => {
          void this.handleQuestionDockReject(renderState.tabId);
        },
      },
    );

    questionDock.render(renderPayload.state, renderPayload.callbacks);
  }

  clearPendingQuestionsForTab(tabId: TabId | null = this.host.getActiveTabId()): void {
    this.dockRefresh.clearPendingQuestionsForTab(tabId);
  }

  async refreshPendingQuestionsForTab(
    tabId: TabId | null,
    sessionId?: string | null,
  ): Promise<QuestionRequest[]> {
    return this.dockRefresh.refreshPendingQuestionsForTab(tabId, sessionId);
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

  private renderEmptyDock(
    questionDock: QuestionDockPort,
    displayMode: QuestionDisplayMode = this.host.getQuestionDisplayMode(),
  ): void {
    const renderPayload = createEmptyQuestionDockRenderPayload(displayMode);
    questionDock.render(renderPayload.state, renderPayload.callbacks);
  }

  private getActivePendingQuestionRequest(
    tabId: TabId | null = this.host.getActiveTabId(),
  ): QuestionRequest | null {
    return this.dockRenderState.getActivePendingQuestionRequest(tabId);
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
    this.dockWriteback.applyEnqueuedPendingQuestionRequest(tabId);
  }

  private removePendingQuestionRequest(
    requestId: string,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    const remainingRequests = this.dockQueueRuntime.removePendingQuestionRequest(requestId, tabId);
    this.dockWriteback.applyRemovedPendingQuestionRequest(tabId, remainingRequests);
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
      await this.applyQuestionDockResolution({
        request,
        status: 'answered',
        answers,
      }, tabId);
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
      await this.applyQuestionDockResolution({
        request,
        status: 'rejected',
      }, tabId);
    } catch (error) {
      logger.error('Failed to resolve question request:', error);
      new Notice(t('chat.question.notice.error'));
    }
  }

  private async applyQuestionDockResolution(
    resolution: QuestionResolution,
    tabId: TabId | null,
  ): Promise<void> {
    await this.resolutionWriteback.applyResolution(resolution, tabId, {
      afterStateApplied: () => {
        this.removePendingQuestionRequest(resolution.request.id, tabId);
      },
    });
  }
}
