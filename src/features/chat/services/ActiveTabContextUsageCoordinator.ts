import type { ResolvedModelSelection } from '../../../core/config/modelConfig';
import {
  createEmptyTabContextState,
  getConversationBackendSessionId,
  type StreamChunk,
  type TabContextState,
} from '../../../core/types';
import {
  createLogger,
  formatDurationMs,
  getPerformanceTimestampMs,
  shouldEmitLogFingerprint,
} from '../../../shared';
import type { TabId } from '../tabs/types';
import type {
  ModelSelectorKnownModelInfo,
  ModelSelectorSelection,
} from '../ui/modelSelector/types';
import {
  ContextUsageService,
  type ContextUsageSnapshot,
} from './ContextUsageService';

const logger = createLogger('ActiveTabContextUsageCoordinator');

interface ActiveTabContextUsageConversation {
  id: string;
  backendSessionId?: string;
  openCodeSessionId?: string | null;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ActiveTabContextUsageCoordinatorHost {
  hasActiveTab(): boolean;
  getCurrentConversation(): ActiveTabContextUsageConversation | null;
  getCurrentSessionModel(): ModelSelectorSelection | null;
  getCurrentSessionModelResolution(): ResolvedModelSelection;
  findKnownModelInfo(selection: ModelSelectorSelection | null): ModelSelectorKnownModelInfo | null;
  getActiveTabContextUsage(): TabContextState | null;
  setActiveTabContextUsage(contextUsage: TabContextState): void;
  renderContextUsageIndicator(state: TabContextState | null): void;
  getSessionContextUsageSnapshot(sessionId: string): Promise<ContextUsageSnapshot | null>;
  hasTab(tabId: string): boolean;
  getTabContextUsage(tabId: TabId | null): TabContextState | null;
  setTabContextUsage(tabId: TabId | null, contextUsage: TabContextState): void;
  getActiveTabId(): TabId | null;
  openContextUsageDetailsModal(contextState: TabContextState | null): void;
}

export class ActiveTabContextUsageCoordinator {
  constructor(private readonly host: ActiveTabContextUsageCoordinatorHost) {}

  syncIdentity(): void {
    if (!this.host.hasActiveTab()) {
      this.host.renderContextUsageIndicator(null);
      return;
    }

    const currentModel = this.host.getCurrentSessionModel();
    const resolution = this.host.getCurrentSessionModelResolution();
    const modelInfo = this.host.findKnownModelInfo(currentModel);
    const conversation = this.host.getCurrentConversation();
    const nextState = ContextUsageService.syncStateIdentity(
      this.getCurrentState(),
      {
        provider: currentModel?.provider ?? null,
        providerName:
          modelInfo?.providerName
          ?? resolution.providerName
          ?? currentModel?.provider
          ?? null,
        model: currentModel?.model ?? null,
        modelName:
          modelInfo?.modelName
          ?? resolution.modelName
          ?? currentModel?.model
          ?? null,
        contextWindow: modelInfo?.contextWindow ?? resolution.contextWindow,
      },
      {
        sessionId: conversation ? getConversationBackendSessionId(conversation) ?? null : null,
        sessionTitle: conversation?.title ?? null,
        createdAt: conversation?.createdAt ?? null,
        updatedAt: conversation?.updatedAt ?? null,
      },
    );

    this.commitState(nextState);
  }

  async refreshFromServer(): Promise<void> {
    const conversation = this.host.getCurrentConversation();
    const expectedConversationId = conversation?.id ?? null;
    const expectedSessionId = conversation ? getConversationBackendSessionId(conversation) ?? null : null;
    const startedAt = getPerformanceTimestampMs();
    let requestElapsedMs: number | null = null;
    let outcome = 'skipped';
    if (!expectedConversationId || !expectedSessionId || !this.host.hasActiveTab()) {
      this.logRefreshFromServerOutcome(
        {
          outcome,
          startedAt,
          conversationId: expectedConversationId,
          sessionId: expectedSessionId,
          requestElapsedMs,
        },
      );
      return;
    }

    const requestStartedAt = getPerformanceTimestampMs();
    const snapshot = await this.host.getSessionContextUsageSnapshot(expectedSessionId);
    requestElapsedMs = getPerformanceTimestampMs() - requestStartedAt;
    const currentConversation = this.host.getCurrentConversation();
    if (
      !snapshot
      || currentConversation?.id !== expectedConversationId
      || (currentConversation ? getConversationBackendSessionId(currentConversation) ?? null : null) !== expectedSessionId
      || !this.host.hasActiveTab()
    ) {
      outcome = snapshot ? 'stale' : 'empty';
      this.logRefreshFromServerOutcome(
        {
          outcome,
          startedAt,
          conversationId: expectedConversationId,
          sessionId: expectedSessionId,
          requestElapsedMs,
          snapshot,
        },
      );
      return;
    }

    outcome = 'committed';
    this.commitState(ContextUsageService.applyUsageSnapshot(this.getCurrentState(), snapshot));
    this.logRefreshFromServerOutcome(
      {
        outcome,
        startedAt,
        conversationId: expectedConversationId,
        sessionId: expectedSessionId,
        requestElapsedMs,
        snapshot,
      },
    );
  }

  private getCurrentState(): TabContextState {
    return this.host.getActiveTabContextUsage() ?? createEmptyTabContextState();
  }

  private commitState(contextUsage: TabContextState): void {
    this.host.setActiveTabContextUsage(contextUsage);
    this.host.renderContextUsageIndicator(contextUsage);
  }

  beginTabContextUsageStream(tabId: TabId | null): void {
    if (!this.host.hasTab(tabId ?? '')) {
      return;
    }

    const nextState = ContextUsageService.beginStream(
      this.host.getTabContextUsage(tabId) ?? createEmptyTabContextState(),
    );
    this.host.setTabContextUsage(tabId, nextState);
    if (tabId === this.host.getActiveTabId()) {
      this.refreshContextUsageIndicator();
    }
  }

  completeTabContextUsageStream(tabId: TabId | null): void {
    if (!this.host.hasTab(tabId ?? '')) {
      return;
    }

    const nextState = ContextUsageService.completeStream(
      this.host.getTabContextUsage(tabId) ?? createEmptyTabContextState(),
    );
    this.host.setTabContextUsage(tabId, nextState);
    if (tabId === this.host.getActiveTabId()) {
      this.refreshContextUsageIndicator();
    }
  }

  applyUsageChunkToTab(
    tabId: TabId | null,
    chunk: Extract<StreamChunk, { type: 'usage' }>,
  ): void {
    if (!this.host.hasTab(tabId ?? '')) {
      return;
    }

    const nextState = ContextUsageService.applyUsageChunk(
      this.host.getTabContextUsage(tabId) ?? createEmptyTabContextState(),
      chunk,
    );
    this.host.setTabContextUsage(tabId, nextState);
    if (tabId === this.host.getActiveTabId()) {
      this.refreshContextUsageIndicator();
    }
  }

  openContextUsageDetails(): void {
    const contextState = this.host.getActiveTabContextUsage() ?? null;
    this.host.openContextUsageDetailsModal(contextState);
  }

  refreshContextUsageIndicator(): void {
    const state = this.host.getActiveTabContextUsage() ?? null;
    this.host.renderContextUsageIndicator(state);
  }

  private logRefreshFromServerOutcome({
    outcome,
    startedAt,
    conversationId,
    sessionId,
    requestElapsedMs,
    snapshot,
  }: {
    outcome: string;
    startedAt: number;
    conversationId: string | null;
    sessionId: string | null;
    requestElapsedMs: number | null;
    snapshot?: ContextUsageSnapshot | null;
  }): void {
    const fingerprint = {
      outcome,
      conversationId,
      sessionId,
      updatedAt: snapshot?.updatedAt ?? null,
      compactingAt: snapshot?.compactingAt ?? null,
      inputTokens: snapshot?.inputTokens ?? null,
      outputTokens: snapshot?.outputTokens ?? null,
      reasoningTokens: snapshot?.reasoningTokens ?? null,
      cacheReadTokens: snapshot?.cacheReadTokens ?? null,
      cacheWriteTokens: snapshot?.cacheWriteTokens ?? null,
      totalCost: snapshot?.totalCost ?? null,
    };

    if (!shouldEmitLogFingerprint('context-usage.refreshFromServer', fingerprint)) {
      return;
    }

    logger.debug(
      `[context-usage] refreshFromServer ${outcome} in ${formatDurationMs(getPerformanceTimestampMs() - startedAt)}`,
      {
        conversationId,
        sessionId,
        ...(requestElapsedMs === null ? {} : { request: formatDurationMs(requestElapsedMs) }),
      },
    );
  }
}
