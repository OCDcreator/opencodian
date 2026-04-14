import { Notice } from 'obsidian';

import type {
  QuestionDisplayMode,
  QuestionRequest,
  QuestionResolution,
} from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { QuestionResolutionCoordinator } from '../runtime/QuestionResolutionCoordinator';
import type { TabId } from '../tabs';
import type { QuestionDock } from '../ui/QuestionDock';
import {
  buildQuestionDockViewModel,
  normalizeQuestionDraftAnswers,
} from '../ui/questionDockState';
import {
  createEmptyQuestionDockRenderPayload,
  createQuestionDockRenderPayload,
} from './QuestionDockRenderAdapter';
import type { QuestionDockRenderStateFacade } from './QuestionDockRenderStateFacade';
import type {
  QuestionDockResolutionActionFacade,
  QuestionDockResolutionIntent,
} from './QuestionDockResolutionActionFacade';
import type { QuestionPostResolutionRuntimeFacade } from './QuestionPostResolutionRuntimeFacade';
import type {
  QuestionResolutionExecutionAction,
  QuestionResolutionExecutionFacade,
} from './QuestionResolutionExecutionFacade';

const logger = createLogger('QuestionDockCoordinator');

type QuestionDockPort = Pick<QuestionDock, 'render'>;
type QuestionDockRenderStatePort = Pick<QuestionDockRenderStateFacade, 'resolveRenderState'>;
type QuestionDockResolutionActionPort = Pick<
  QuestionDockResolutionActionFacade,
  'resolveAction'
>;
type QuestionResolutionExecutionPort = Pick<QuestionResolutionExecutionFacade, 'execute'>;
type QuestionResolutionCoordinatorPort = Pick<
  QuestionResolutionCoordinator,
  'applyResolvedQuestionState'
>;
type QuestionPostResolutionRuntimePort = Pick<
  QuestionPostResolutionRuntimeFacade,
  'followUpAfterResolution'
>;

export interface QuestionDockQueueDeferredRequest {
  promise: Promise<void>;
  resolve: () => void;
}

export interface QuestionDockRuntimeState {
  pendingQuestionRequests: QuestionRequest[];
  resolvedQuestionRequestIds: Set<string>;
  questionDraftAnswers: Map<string, string[][]>;
  questionActiveGroupKeys: Map<string, string>;
  questionActiveIndexes: Map<string, number>;
  questionRequestWaiters: Map<string, QuestionDockQueueDeferredRequest>;
}

export interface QuestionDockResolutionApplyOptions {
  afterStateApplied?: (() => void | Promise<void>) | null;
}

export interface QuestionDockCoordinatorHost {
  getActiveTabId(): TabId | null;
  getQuestionDock(): QuestionDockPort | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
  shouldUseAboveInputQuestionDock(): boolean;
  getCurrentConversationSessionId(): string | null | undefined;
  getTabRuntimeState(tabId: TabId | null): QuestionDockRuntimeState | null;
  ensureTabRuntimeState(tabId: TabId | null): QuestionDockRuntimeState | null;
  getSessionIdForTab(tabId: TabId | null): string | null | undefined;
  getPendingQuestions(): Promise<QuestionRequest[]>;
  setTabNeedsAttention(tabId: TabId | null, needsAttention: boolean): void;
}

export class QuestionDockCoordinator {
  constructor(
    private readonly host: QuestionDockCoordinatorHost,
    private readonly dockRenderState: QuestionDockRenderStatePort,
    private readonly dockResolutionAction: QuestionDockResolutionActionPort,
    private readonly resolutionExecution: QuestionResolutionExecutionPort,
    private readonly resolutionCoordinator: QuestionResolutionCoordinatorPort,
    private readonly postResolutionRuntime: QuestionPostResolutionRuntimePort,
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
          void this.handleQuestionDockAction('submit', renderState.tabId);
        },
        reject: () => {
          void this.handleQuestionDockAction('reject', renderState.tabId);
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

    this.clearPendingQuestionState(runtime);
    this.applyClearedPendingQuestions(tabId);
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
      const sessionRequests = pendingRequests.filter(
        (request) => request.sessionId === sessionId,
      );
      const mergedRequests = this.applyRefreshedPendingQuestionRequests(
        runtime,
        sessionRequests,
      );
      this.applyRefreshedPendingQuestions(tabId, mergedRequests);
      return mergedRequests;
    } catch (error) {
      logger.debug('Failed to refresh pending questions', error);
      return runtime.pendingQuestionRequests;
    }
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

  async applyResolutionAction(
    action: QuestionResolutionExecutionAction,
    tabId: TabId | null,
    options: QuestionDockResolutionApplyOptions = {},
  ): Promise<boolean> {
    const resolution = await this.resolutionExecution.execute(action);
    if (!resolution) {
      return false;
    }

    this.applyResolvedQuestionRuntime(resolution, tabId);
    await options.afterStateApplied?.();
    await this.postResolutionRuntime.followUpAfterResolution(tabId);
    return true;
  }

  private renderEmptyDock(
    questionDock: QuestionDockPort,
    displayMode: QuestionDisplayMode = this.host.getQuestionDisplayMode(),
  ): void {
    const renderPayload = createEmptyQuestionDockRenderPayload(displayMode);
    questionDock.render(renderPayload.state, renderPayload.callbacks);
  }

  private getOrCreateQuestionWaiter(
    requestId: string,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): QuestionDockQueueDeferredRequest | null {
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

    const answers = normalizeQuestionDraftAnswers(
      request.questions.length,
      runtime.questionDraftAnswers.get(request.id),
    );
    runtime.questionDraftAnswers.set(request.id, answers);

    if (!runtime.questionActiveGroupKeys.has(request.id)) {
      const viewModel = buildQuestionDockViewModel(request, answers, {
        displayMode: this.host.getQuestionDisplayMode(),
      });
      runtime.questionActiveGroupKeys.set(request.id, viewModel.activeGroupKey);
      runtime.questionActiveIndexes.set(request.id, viewModel.activeQuestionIndex);
    }

    this.applyEnqueuedPendingQuestionRequest(tabId);
  }

  private removePendingQuestionRequest(
    requestId: string,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return;
    }

    runtime.pendingQuestionRequests = runtime.pendingQuestionRequests.filter(
      (request) => request.id !== requestId,
    );
    runtime.questionDraftAnswers.delete(requestId);
    runtime.questionActiveGroupKeys.delete(requestId);
    runtime.questionActiveIndexes.delete(requestId);

    const waiter = runtime.questionRequestWaiters.get(requestId);
    if (waiter) {
      waiter.resolve();
      runtime.questionRequestWaiters.delete(requestId);
    }

    this.applyRemovedPendingQuestionRequest(tabId, runtime.pendingQuestionRequests);
  }

  private clearPendingQuestionState(runtime: QuestionDockRuntimeState): void {
    runtime.pendingQuestionRequests = [];
    runtime.resolvedQuestionRequestIds.clear();
    runtime.questionDraftAnswers.clear();
    runtime.questionActiveGroupKeys.clear();
    runtime.questionActiveIndexes.clear();
    runtime.questionRequestWaiters.clear();
  }

  private applyRefreshedPendingQuestionRequests(
    runtime: QuestionDockRuntimeState,
    sessionRequests: readonly QuestionRequest[],
  ): QuestionRequest[] {
    const mergedRequests = this.mergePendingQuestionRequests(runtime, sessionRequests);
    runtime.pendingQuestionRequests = mergedRequests;

    this.pruneResolvedQuestionRequestIds(runtime, sessionRequests);
    this.syncDraftAnswers(runtime, mergedRequests);
    this.pruneInactiveQuestionState(runtime, mergedRequests);

    return mergedRequests;
  }

  private mergePendingQuestionRequests(
    runtime: QuestionDockRuntimeState,
    sessionRequests: readonly QuestionRequest[],
  ): QuestionRequest[] {
    const waitingIds = new Set(runtime.questionRequestWaiters.keys());
    const mergedRequests = sessionRequests.filter(
      (request) => !runtime.resolvedQuestionRequestIds.has(request.id),
    );
    const mergedRequestIds = new Set(mergedRequests.map((request) => request.id));

    for (const existing of runtime.pendingQuestionRequests) {
      if (!waitingIds.has(existing.id) || mergedRequestIds.has(existing.id)) {
        continue;
      }

      mergedRequests.push(existing);
      mergedRequestIds.add(existing.id);
    }

    return mergedRequests;
  }

  private pruneResolvedQuestionRequestIds(
    runtime: QuestionDockRuntimeState,
    sessionRequests: readonly QuestionRequest[],
  ): void {
    const rawSessionRequestIds = new Set(sessionRequests.map((request) => request.id));

    for (const requestId of [...runtime.resolvedQuestionRequestIds]) {
      if (!rawSessionRequestIds.has(requestId)) {
        runtime.resolvedQuestionRequestIds.delete(requestId);
      }
    }
  }

  private syncDraftAnswers(
    runtime: QuestionDockRuntimeState,
    mergedRequests: readonly QuestionRequest[],
  ): void {
    for (const request of mergedRequests) {
      runtime.questionDraftAnswers.set(
        request.id,
        normalizeQuestionDraftAnswers(
          request.questions.length,
          runtime.questionDraftAnswers.get(request.id),
        ),
      );
    }
  }

  private pruneInactiveQuestionState(
    runtime: QuestionDockRuntimeState,
    mergedRequests: readonly QuestionRequest[],
  ): void {
    const activeRequestIds = new Set(mergedRequests.map((request) => request.id));

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
  }

  private applyResolvedQuestionRuntime(
    resolution: QuestionResolution,
    tabId: TabId | null,
  ): void {
    this.host.getTabRuntimeState(tabId)?.resolvedQuestionRequestIds.add(resolution.request.id);
    this.resolutionCoordinator.applyResolvedQuestionState(resolution, tabId);
  }

  private applyEnqueuedPendingQuestionRequest(tabId: TabId | null): void {
    if (this.isActiveTab(tabId)) {
      this.applyActiveTabDockWriteback(tabId);
      return;
    }

    this.host.setTabNeedsAttention(tabId, true);
  }

  private applyRemovedPendingQuestionRequest(
    tabId: TabId | null,
    remainingRequests: readonly QuestionRequest[],
  ): void {
    if (this.isActiveTab(tabId)) {
      this.applyActiveTabDockWriteback(tabId);
      return;
    }

    this.host.setTabNeedsAttention(tabId, remainingRequests.length > 0);
  }

  private applyClearedPendingQuestions(tabId: TabId | null): void {
    this.applyRemovedPendingQuestionRequest(tabId, []);
  }

  private applyRefreshedPendingQuestions(
    tabId: TabId | null,
    mergedRequests: readonly QuestionRequest[],
  ): void {
    if (this.isActiveTab(tabId)) {
      this.applyActiveTabDockWriteback(tabId);
      return;
    }

    this.host.setTabNeedsAttention(tabId, mergedRequests.length > 0);
  }

  private applyActiveTabDockWriteback(tabId: TabId | null): void {
    this.host.setTabNeedsAttention(tabId, false);
    this.render();
  }

  private isActiveTab(tabId: TabId | null): boolean {
    return tabId === this.host.getActiveTabId();
  }

  private async handleQuestionDockAction(
    intent: QuestionDockResolutionIntent,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): Promise<void> {
    const action = this.dockResolutionAction.resolveAction(intent, tabId);
    if (action.type === 'skip') {
      return;
    }

    if (action.type === 'answer-required') {
      new Notice(t('chat.question.answerRequired'));
      return;
    }

    await this.applyResolutionAction(action, tabId, {
      afterStateApplied: () => {
        this.removePendingQuestionRequest(action.request.id, tabId);
      },
    });
  }
}
