import { Notice } from 'obsidian';

import type {
  QuestionDisplayMode,
  QuestionRequest,
} from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
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
import type {
  QuestionResolutionApplyContext,
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
type QuestionResolutionExecutionPort = Pick<
  QuestionResolutionExecutionFacade,
  'executeAndApply'
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

interface QuestionDockPresentationSyncOptions {
  pruneInactiveState?: boolean;
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
    this.writeBackPendingQuestionRuntime(tabId, []);
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
      this.writeBackPendingQuestionRuntime(tabId, mergedRequests);
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
    return this.resolutionExecution.executeAndApply(
      action,
      this.createResolutionApplyContext(tabId, options.afterStateApplied ?? null),
    );
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

    this.syncPendingQuestionPresentationState(runtime, runtime.pendingQuestionRequests);
    this.writeBackPendingQuestionRuntime(tabId, runtime.pendingQuestionRequests);
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

    this.writeBackPendingQuestionRuntime(tabId, runtime.pendingQuestionRequests);
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
    this.syncPendingQuestionPresentationState(runtime, mergedRequests, {
      pruneInactiveState: true,
    });

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

  private syncPendingQuestionPresentationState(
    runtime: QuestionDockRuntimeState,
    pendingRequests: readonly QuestionRequest[],
    options: QuestionDockPresentationSyncOptions = {},
  ): void {
    const activeRequestIds = new Set<string>();

    for (const request of pendingRequests) {
      activeRequestIds.add(request.id);
      const answers = normalizeQuestionDraftAnswers(
        request.questions.length,
        runtime.questionDraftAnswers.get(request.id),
      );
      runtime.questionDraftAnswers.set(request.id, answers);
      this.ensureQuestionSelectionState(runtime, request, answers);
    }

    if (options.pruneInactiveState) {
      this.pruneInactiveQuestionState(runtime, activeRequestIds);
    }
  }

  private ensureQuestionSelectionState(
    runtime: QuestionDockRuntimeState,
    request: QuestionRequest,
    answers: string[][],
  ): void {
    if (runtime.questionActiveGroupKeys.has(request.id)) {
      return;
    }

    const viewModel = buildQuestionDockViewModel(request, answers, {
      displayMode: this.host.getQuestionDisplayMode(),
    });
    runtime.questionActiveGroupKeys.set(request.id, viewModel.activeGroupKey);
    runtime.questionActiveIndexes.set(request.id, viewModel.activeQuestionIndex);
  }

  private pruneInactiveQuestionState(
    runtime: QuestionDockRuntimeState,
    activeRequestIds: ReadonlySet<string>,
  ): void {
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

  private createResolutionApplyContext(
    tabId: TabId | null,
    afterStateApplied: (() => void | Promise<void>) | null,
  ): QuestionResolutionApplyContext {
    return {
      tabId,
      afterStateApplied,
    };
  }

  private writeBackPendingQuestionRuntime(
    tabId: TabId | null,
    pendingRequests: readonly QuestionRequest[],
  ): void {
    const isActiveTab = this.isActiveTab(tabId);
    const needsAttention = !isActiveTab && pendingRequests.length > 0;
    this.host.setTabNeedsAttention(tabId, needsAttention);
    if (isActiveTab) {
      this.render();
    }
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

  private isActiveTab(tabId: TabId | null): boolean {
    return tabId === this.host.getActiveTabId();
  }
}
