import type {
  QuestionDisplayMode,
  QuestionRequest,
} from '../../../core/types';
import type { TabId } from '../tabs';
import {
  buildQuestionDockViewModel,
  normalizeQuestionDraftAnswers,
} from '../ui/questionDockState';

export interface QuestionDockQueueDeferredRequest {
  promise: Promise<void>;
  resolve: () => void;
}

export interface QuestionDockQueueRuntimeState {
  pendingQuestionRequests: QuestionRequest[];
  questionDraftAnswers: Map<string, string[][]>;
  questionActiveGroupKeys: Map<string, string>;
  questionActiveIndexes: Map<string, number>;
  questionRequestWaiters: Map<string, QuestionDockQueueDeferredRequest>;
}

export interface QuestionDockQueueRuntimeFacadeHost {
  getTabRuntimeState(tabId: TabId | null): QuestionDockQueueRuntimeState | null;
  ensureTabRuntimeState(tabId: TabId | null): QuestionDockQueueRuntimeState | null;
}

export class QuestionDockQueueRuntimeFacade {
  constructor(private readonly host: QuestionDockQueueRuntimeFacadeHost) {}

  getOrCreateQuestionWaiter(
    requestId: string,
    tabId: TabId | null,
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

  enqueuePendingQuestionRequest(
    request: QuestionRequest,
    tabId: TabId | null,
    displayMode: QuestionDisplayMode,
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
        displayMode,
      });
      runtime.questionActiveGroupKeys.set(request.id, viewModel.activeGroupKey);
      runtime.questionActiveIndexes.set(request.id, viewModel.activeQuestionIndex);
    }
  }

  removePendingQuestionRequest(
    requestId: string,
    tabId: TabId | null,
  ): QuestionRequest[] {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return [];
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

    return runtime.pendingQuestionRequests;
  }
}
