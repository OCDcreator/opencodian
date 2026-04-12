import { Notice } from 'obsidian';

import type { QuestionDisplayMode, QuestionRequest, QuestionResolution } from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { TabId } from '../tabs';
import type { QuestionDock, QuestionDockCallbacks } from '../ui/QuestionDock';
import {
  buildQuestionDockViewModel,
  getPreferredQuestionIndexForGroup,
  isQuestionAnswerComplete,
  normalizeQuestionDraftAnswers,
} from '../ui/questionDockState';

const logger = createLogger('QuestionDockCoordinator');

interface DeferredQuestionRequest {
  promise: Promise<void>;
  resolve: () => void;
}

export interface QuestionDockCoordinatorRuntimeState {
  isStreaming: boolean;
  pendingQuestionRequests: QuestionRequest[];
  resolvedQuestionRequestIds: Set<string>;
  questionDraftAnswers: Map<string, string[][]>;
  questionActiveGroupKeys: Map<string, string>;
  questionActiveIndexes: Map<string, number>;
  questionRequestWaiters: Map<string, DeferredQuestionRequest>;
}

type QuestionDockPort = Pick<QuestionDock, 'render'>;

export interface QuestionDockCoordinatorHost {
  getTabRuntimeState(tabId: TabId | null): QuestionDockCoordinatorRuntimeState | null;
  ensureTabRuntimeState(tabId: TabId | null): QuestionDockCoordinatorRuntimeState | null;
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
  refreshTabSessionStatus(
    tabId: TabId | null,
    sessionId: string | undefined,
    options: { suppressErrors?: boolean },
  ): Promise<unknown>;
  startConversationSyncLoop(): void;
  syncVisibleConversationInBackground(): Promise<void>;
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
  constructor(private readonly host: QuestionDockCoordinatorHost) {}

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

    runtime.pendingQuestionRequests = [];
    runtime.resolvedQuestionRequestIds.clear();
    runtime.questionDraftAnswers.clear();
    runtime.questionActiveGroupKeys.clear();
    runtime.questionActiveIndexes.clear();
    runtime.questionRequestWaiters.clear();

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
      const rawSessionRequestIds = new Set(sessionRequests.map((request) => request.id));
      const filteredSessionRequests = sessionRequests.filter(
        (request) => !runtime.resolvedQuestionRequestIds.has(request.id),
      );
      const waitingIds = new Set(runtime.questionRequestWaiters.keys());
      const mergedRequests = [...filteredSessionRequests];

      for (const existing of runtime.pendingQuestionRequests) {
        if (waitingIds.has(existing.id) && !mergedRequests.some((request) => request.id === existing.id)) {
          mergedRequests.push(existing);
        }
      }

      for (const requestId of [...runtime.resolvedQuestionRequestIds]) {
        if (!rawSessionRequestIds.has(requestId)) {
          runtime.resolvedQuestionRequestIds.delete(requestId);
        }
      }

      runtime.pendingQuestionRequests = mergedRequests;
      const activeRequestIds = new Set(mergedRequests.map((request) => request.id));

      for (const request of mergedRequests) {
        this.getQuestionDraftAnswers(request, tabId);
      }

      for (const requestId of [...runtime.questionDraftAnswers.keys()]) {
        if (!activeRequestIds.has(requestId)) {
          runtime.questionDraftAnswers.delete(requestId);
        }
      }

      for (const requestId of [...runtime.questionActiveGroupKeys.keys()]) {
        if (!activeRequestIds.has(requestId)) {
          runtime.questionActiveGroupKeys.delete(requestId);
        }
      }

      for (const requestId of [...runtime.questionActiveIndexes.keys()]) {
        if (!activeRequestIds.has(requestId)) {
          runtime.questionActiveIndexes.delete(requestId);
        }
      }

      if (tabId === this.host.getActiveTabId()) {
        this.host.setTabNeedsAttention(tabId, false);
        this.render();
      } else {
        this.host.setTabNeedsAttention(tabId, mergedRequests.length > 0);
      }

      return mergedRequests;
    } catch (error) {
      logger.debug('Failed to refresh pending questions', error);
      return runtime.pendingQuestionRequests;
    }
  }

  markQuestionRequestResolved(
    requestId: string,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    runtime?.resolvedQuestionRequestIds.add(requestId);
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
  ): DeferredQuestionRequest | null {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return null;
    }

    const existing = runtime.questionRequestWaiters.get(requestId);
    if (existing) {
      return existing;
    }

    let resolve = () => {};
    const promise = new Promise<void>((resolver) => {
      resolve = resolver;
    });
    const waiter = { promise, resolve };
    runtime.questionRequestWaiters.set(requestId, waiter);
    return waiter;
  }

  private resolveQuestionWaiter(
    requestId: string,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    const waiter = runtime?.questionRequestWaiters.get(requestId);
    if (!waiter) {
      return;
    }

    waiter.resolve();
    runtime?.questionRequestWaiters.delete(requestId);
  }

  private enqueuePendingQuestionRequest(
    request: QuestionRequest,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    const runtime = this.host.ensureTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    if (!runtime.pendingQuestionRequests.some((item) => item.id === request.id)) {
      runtime.pendingQuestionRequests = [...runtime.pendingQuestionRequests, request];
    }

    this.getQuestionDraftAnswers(request, tabId);

    const answers = this.getQuestionDraftAnswers(request, tabId);
    if (!runtime.questionActiveGroupKeys.has(request.id)) {
      const viewModel = buildQuestionDockViewModel(request, answers, {
        displayMode: this.host.getQuestionDisplayMode(),
      });
      runtime.questionActiveGroupKeys.set(request.id, viewModel.activeGroupKey);
      runtime.questionActiveIndexes.set(request.id, viewModel.activeQuestionIndex);
    }

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
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.pendingQuestionRequests = runtime.pendingQuestionRequests.filter((request) => request.id !== requestId);
    runtime.questionDraftAnswers.delete(requestId);
    runtime.questionActiveGroupKeys.delete(requestId);
    runtime.questionActiveIndexes.delete(requestId);
    this.resolveQuestionWaiter(requestId, tabId);

    if (tabId === this.host.getActiveTabId()) {
      this.host.setTabNeedsAttention(tabId, false);
      this.render();
      return;
    }

    this.host.setTabNeedsAttention(tabId, runtime.pendingQuestionRequests.length > 0);
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
    const sessionId = this.host.getSessionIdForTab(tabId) ?? undefined;
    this.render();

    if (!sessionId) {
      return;
    }

    void this.host.refreshTabSessionStatus(tabId, sessionId, { suppressErrors: true });
    this.host.startConversationSyncLoop();

    if (tabId === this.host.getActiveTabId() && !this.host.getTabRuntimeState(tabId)?.isStreaming) {
      await this.host.syncVisibleConversationInBackground();
    }
  }
}
