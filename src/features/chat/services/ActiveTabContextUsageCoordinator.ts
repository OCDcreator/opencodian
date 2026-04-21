import type { ResolvedModelSelection } from '../../../core/config/modelConfig';
import {
  createEmptyTabContextState,
  type TabContextState,
} from '../../../core/types';
import {
  createLogger,
  formatDurationMs,
  getPerformanceTimestampMs,
  shouldEmitLogFingerprint,
} from '../../../shared';
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
  openCodeSessionId: string | null | undefined;
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
        sessionId: conversation?.openCodeSessionId ?? null,
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
    const expectedSessionId = conversation?.openCodeSessionId ?? null;
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
      || currentConversation?.openCodeSessionId !== expectedSessionId
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
