import { Notice } from 'obsidian';

import type { QuestionDisplayMode, QuestionRequest, QuestionResolution } from '../../../core/types';
import { t } from '../../../i18n';
import type { TabId } from '../tabs';
import type { QuestionDock } from '../ui/QuestionDock';
import type { QuestionDockRefreshFacade } from './QuestionDockRefreshFacade';
import type {
  QuestionDockResolutionActionFacade,
  QuestionDockResolutionIntent,
} from './QuestionDockResolutionActionFacade';
import type { QuestionResolutionExecutionFacade } from './QuestionResolutionExecutionFacade';
import type {
  QuestionDockRenderStateFacade,
} from './QuestionDockRenderStateFacade';
import type { QuestionDockWritebackFacade } from './QuestionDockWritebackFacade';
import type {
  QuestionDockQueueRuntimeFacade,
} from './QuestionDockQueueRuntimeFacade';
import type { QuestionResolutionWritebackFacade } from './QuestionResolutionWritebackFacade';
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
  'resolveRenderState'
>;
type QuestionDockResolutionActionPort = Pick<
  QuestionDockResolutionActionFacade,
  'resolveAction'
>;
type QuestionResolutionExecutionPort = Pick<
  QuestionResolutionExecutionFacade,
  'execute'
>;
type QuestionDockWritebackPort = Pick<
  QuestionDockWritebackFacade,
  'applyEnqueuedPendingQuestionRequest' | 'applyRemovedPendingQuestionRequest'
>;

type QuestionDockPort = Pick<QuestionDock, 'render'>;

export interface QuestionDockCoordinatorHost {
  getActiveTabId(): TabId | null;
  getQuestionDock(): QuestionDockPort | null;
  getQuestionDisplayMode(): QuestionDisplayMode;
  shouldUseAboveInputQuestionDock(): boolean;
}

export class QuestionDockCoordinator {
  constructor(
    private readonly host: QuestionDockCoordinatorHost,
    private readonly dockRenderState: QuestionDockRenderStatePort,
    private readonly dockResolutionAction: QuestionDockResolutionActionPort,
    private readonly resolutionExecution: QuestionResolutionExecutionPort,
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

    const resolution = await this.resolutionExecution.execute(action);
    if (!resolution) {
      return;
    }

    await this.applyQuestionDockResolution(resolution, tabId);
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
