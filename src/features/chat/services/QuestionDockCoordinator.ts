import { Notice } from 'obsidian';

import type { QuestionDisplayMode, QuestionRequest, QuestionResolution } from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';
import type { QuestionDock, QuestionDockCallbacks } from '../ui/QuestionDock';
import type {
  QuestionDockQueueRuntimeFacade,
} from './QuestionDockQueueRuntimeFacade';
import type {
  QuestionPendingRefreshRuntimeFacade,
  QuestionPendingRefreshRuntimeState,
} from './QuestionPendingRefreshRuntimeFacade';
import type { QuestionPostResolutionRuntimeFacade } from './QuestionPostResolutionRuntimeFacade';
import {
  buildQuestionDockViewModel,
  getPreferredQuestionIndexForGroup,
  isQuestionAnswerComplete,
  normalizeQuestionDraftAnswers,
} from '../ui/questionDockState';

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
  questionDraftAnswers: QuestionPendingRefreshRuntimeState['questionDraftAnswers'];
  questionActiveGroupKeys: QuestionPendingRefreshRuntimeState['questionActiveGroupKeys'];
  questionActiveIndexes: QuestionPendingRefreshRuntimeState['questionActiveIndexes'];
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

const EMPTY_DOCK_CALLBACKS: QuestionDockCallbacks = {
  onAnswerChange: () => {},
  onSelectGroup: () => {},
  onSelectQuestion: () => {},
  onSubmit: () => {},
  onReject: () => {},
  onClose: () => {},
};

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

    const answers = this.getQuestionDraftAnswers(activeRequest, activeTabId);
    const displayMode = this.host.getQuestionDisplayMode();
    const viewModel = buildQuestionDockViewModel(activeRequest, answers, {
      activeGroupKey: runtime.questionActiveGroupKeys.get(activeRequest.id),
      activeQuestionIndex: runtime.questionActiveIndexes.get(activeRequest.id),
      displayMode,
    });
    runtime.questionActiveGroupKeys.set(activeRequest.id, viewModel.activeGroupKey);
    runtime.questionActiveIndexes.set(activeRequest.id, viewModel.activeQuestionIndex);

    questionDock.render({
      request: activeRequest,
      answers,
      displayMode,
      activeGroupKey: viewModel.activeGroupKey,
      activeQuestionIndex: viewModel.activeQuestionIndex,
    }, {
      onAnswerChange: (questionIndex, answer) => {
        this.setQuestionDraftAnswer(activeRequest, questionIndex, answer, activeTabId);
      },
      onSelectGroup: (groupKey) => {
        const nextAnswers = this.getQuestionDraftAnswers(activeRequest, activeTabId);
        runtime.questionActiveGroupKeys.set(activeRequest.id, groupKey);
        runtime.questionActiveIndexes.set(
          activeRequest.id,
          getPreferredQuestionIndexForGroup(activeRequest, nextAnswers, groupKey),
        );
        this.render();
      },
      onSelectQuestion: (questionIndex) => {
        const nextViewModel = buildQuestionDockViewModel(
          activeRequest,
          this.getQuestionDraftAnswers(activeRequest, activeTabId),
          {
            activeQuestionIndex: questionIndex,
            displayMode,
          },
        );
        runtime.questionActiveGroupKeys.set(activeRequest.id, nextViewModel.activeGroupKey);
        runtime.questionActiveIndexes.set(activeRequest.id, nextViewModel.activeQuestionIndex);
        this.render();
      },
      onSubmit: () => {
        void this.handleQuestionDockSubmit(activeTabId);
      },
      onReject: () => {
        void this.handleQuestionDockReject(activeTabId);
      },
      onClose: () => {
        void this.handleQuestionDockReject(activeTabId);
      },
    });
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

  markQuestionRequestResolved(
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
    questionDock.render({
      request: null,
      answers: [],
      displayMode: this.host.getQuestionDisplayMode(),
    }, EMPTY_DOCK_CALLBACKS);
  }

  private sanitizeQuestionAnswer(
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

  private getActivePendingQuestionRequest(
    tabId: TabId | null = this.host.getActiveTabId(),
  ): QuestionRequest | null {
    return this.host.getTabRuntimeState(tabId)?.pendingQuestionRequests[0] ?? null;
  }

  private getQuestionDraftAnswers(
    request: QuestionRequest,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): string[][] {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return normalizeQuestionDraftAnswers(request.questions.length);
    }

    const normalized = normalizeQuestionDraftAnswers(
      request.questions.length,
      runtime.questionDraftAnswers.get(request.id),
    );
    runtime.questionDraftAnswers.set(request.id, normalized);
    return normalized;
  }

  private setQuestionDraftAnswer(
    request: QuestionRequest,
    questionIndex: number,
    answer: readonly string[],
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    const nextAnswers = this.getQuestionDraftAnswers(request, tabId);
    nextAnswers[questionIndex] = this.sanitizeQuestionAnswer(answer, request, questionIndex);
    runtime.questionDraftAnswers.set(request.id, nextAnswers);
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

    const answers = this.getQuestionDraftAnswers(request, tabId).map((answer, index) =>
      this.sanitizeQuestionAnswer(answer, request, index),
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
