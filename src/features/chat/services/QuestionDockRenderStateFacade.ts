import type { QuestionDisplayMode, QuestionRequest } from '../../../core/types';
import type { TabId } from '../tabs';
import type { QuestionDockInteractionRuntimeState } from './QuestionDockInteractionState';

export interface QuestionDockRenderStateRuntimeState
  extends QuestionDockInteractionRuntimeState {
  pendingQuestionRequests: QuestionRequest[];
}

export type QuestionDockResolvedRenderState =
  | {
      kind: 'skip';
    }
  | {
      kind: 'empty';
      displayMode: QuestionDisplayMode;
    }
  | {
      kind: 'active';
      tabId: TabId;
      runtime: QuestionDockRenderStateRuntimeState;
      request: QuestionRequest;
      displayMode: QuestionDisplayMode;
    };

export interface QuestionDockRenderStateFacadeHost {
  getActiveTabId(): TabId | null;
  getCurrentConversationSessionId(): string | null | undefined;
  getQuestionDisplayMode(): QuestionDisplayMode;
  shouldUseAboveInputQuestionDock(): boolean;
  getTabRuntimeState(tabId: TabId | null): QuestionDockRenderStateRuntimeState | null;
}

export class QuestionDockRenderStateFacade {
  constructor(private readonly host: QuestionDockRenderStateFacadeHost) {}

  getActivePendingQuestionRequest(
    tabId: TabId | null = this.host.getActiveTabId(),
  ): QuestionRequest | null {
    return this.host.getTabRuntimeState(tabId)?.pendingQuestionRequests[0] ?? null;
  }

  resolveRenderState(): QuestionDockResolvedRenderState {
    const displayMode = this.host.getQuestionDisplayMode();
    if (!this.host.shouldUseAboveInputQuestionDock()) {
      return {
        kind: 'empty',
        displayMode,
      };
    }

    const activeTabId = this.host.getActiveTabId();
    const activeRequest = this.getActivePendingQuestionRequest(activeTabId);
    const activeSessionId = this.host.getCurrentConversationSessionId() ?? null;

    if (!activeTabId || !activeRequest || activeRequest.sessionId !== activeSessionId) {
      return {
        kind: 'empty',
        displayMode,
      };
    }

    const runtime = this.host.getTabRuntimeState(activeTabId);
    if (!runtime) {
      return {
        kind: 'skip',
      };
    }

    return {
      kind: 'active',
      tabId: activeTabId,
      runtime,
      request: activeRequest,
      displayMode,
    };
  }
}
