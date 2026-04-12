import type { QuestionRequest } from '../../../core/types';
import type { TabId } from '../tabs';
import { normalizeQuestionDraftAnswers } from '../ui/questionDockState';

export interface QuestionPendingRefreshRuntimeState {
  pendingQuestionRequests: QuestionRequest[];
  resolvedQuestionRequestIds: Set<string>;
  questionDraftAnswers: Map<string, string[][]>;
  questionActiveGroupKeys: Map<string, string>;
  questionActiveIndexes: Map<string, number>;
  questionRequestWaiters: Pick<Map<string, unknown>, 'keys' | 'clear'>;
}

export interface QuestionPendingRefreshRuntimeFacadeHost {
  getTabRuntimeState(tabId: TabId | null): QuestionPendingRefreshRuntimeState | null;
}

export class QuestionPendingRefreshRuntimeFacade {
  constructor(private readonly host: QuestionPendingRefreshRuntimeFacadeHost) {}

  getPendingQuestionRequests(tabId: TabId | null): QuestionRequest[] {
    return this.host.getTabRuntimeState(tabId)?.pendingQuestionRequests ?? [];
  }

  clearPendingQuestionState(tabId: TabId | null): void {
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
  }

  markQuestionRequestResolved(
    requestId: string,
    tabId: TabId | null,
  ): void {
    this.host.getTabRuntimeState(tabId)?.resolvedQuestionRequestIds.add(requestId);
  }

  applyRefreshedPendingQuestionRequests(
    tabId: TabId | null,
    sessionRequests: readonly QuestionRequest[],
  ): QuestionRequest[] {
    const runtime = this.host.getTabRuntimeState(tabId);
    if (!runtime) {
      return [];
    }

    const mergedRequests = this.mergePendingQuestionRequests(runtime, sessionRequests);
    runtime.pendingQuestionRequests = mergedRequests;

    this.pruneResolvedQuestionRequestIds(runtime, sessionRequests);
    this.syncDraftAnswers(runtime, mergedRequests);
    this.pruneInactiveQuestionState(runtime, mergedRequests);

    return mergedRequests;
  }

  private mergePendingQuestionRequests(
    runtime: QuestionPendingRefreshRuntimeState,
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
    runtime: QuestionPendingRefreshRuntimeState,
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
    runtime: QuestionPendingRefreshRuntimeState,
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
    runtime: QuestionPendingRefreshRuntimeState,
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
}
