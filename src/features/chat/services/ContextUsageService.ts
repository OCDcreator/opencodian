import {
  type ChatMessage,
  type ContextBillingUsage,
  type ContextBillingUsageUpdate,
  type ContextCostDetails,
  type ContextUsageSnapshot,
  createEmptyTabContextState,
  getDefaultContextWindow,
  type StreamChunk,
  type TabContextState,
} from '../../../core/types';
import {
  ContextUsageDisplayService,
  type ContextUsageSummary,
} from './ContextUsageDisplayService';

interface ContextModelInfo {
  provider?: string | null;
  providerName?: string | null;
  model?: string | null;
  modelName?: string | null;
  contextWindow?: number | null;
}

interface ContextSessionInfo {
  compactingAt?: number | null;
  sessionId?: string | null;
  sessionTitle?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
}

export type { ContextUsageSnapshot } from '../../../core/types';
export type { ContextUsageSummary } from './ContextUsageDisplayService';

type TimestampRefreshMode = 'preserve' | 'now' | 'if-missing';

export class ContextUsageService {
  static createState(
    modelInfo?: ContextModelInfo,
    sessionInfo?: ContextSessionInfo,
  ): TabContextState {
    return this.syncStateIdentity(createEmptyTabContextState(), modelInfo, sessionInfo);
  }

  static syncStateIdentity(
    state: TabContextState | null | undefined,
    modelInfo?: ContextModelInfo,
    sessionInfo?: ContextSessionInfo,
  ): TabContextState {
    const next = this.cloneState(state);
    const previousSessionId = next.sessionId;
    const nextSessionId = sessionInfo?.sessionId ?? next.sessionId;
    const sessionChanged = typeof nextSessionId === 'string'
      && nextSessionId !== previousSessionId;
    const previousModelId = next.model;
    const modelChanged = typeof modelInfo?.model === 'string'
      && modelInfo.model !== previousModelId;

    // A tab may be rebound from one conversation to another. Precise usage is
    // authoritative only for its originating backend session, so clear it and
    // its derived estimates/cost at that identity boundary.
    if (sessionChanged) {
      next.estimatedInputTokens = 0;
      next.estimatedOutputTokens = 0;
      next.streamInputTokens = 0;
      next.streamOutputTokens = 0;
      next.preciseTokens = null;
      next.totalCost = null;
      next.costDetails = null;
      next.billingUsage = null;
    }

    next.provider = modelInfo?.provider ?? next.provider;
    next.providerName = modelInfo?.providerName ?? next.providerName ?? next.provider;
    next.model = modelInfo?.model ?? next.model;
    next.modelName = modelInfo?.modelName ?? next.modelName ?? next.model;
    this.syncContextWindow(next, modelInfo, modelChanged);
    next.sessionId = nextSessionId;
    next.sessionTitle = sessionInfo?.sessionTitle ?? next.sessionTitle;
    next.createdAt = sessionInfo?.createdAt ?? next.createdAt;
    next.updatedAt = sessionInfo?.updatedAt ?? next.updatedAt;
    if (sessionInfo && Object.prototype.hasOwnProperty.call(sessionInfo, 'compactingAt')) {
      next.compactingAt = sessionInfo.compactingAt ?? null;
    } else if (
      sessionInfo
      && sessionChanged
    ) {
      next.compactingAt = null;
    }
    return this.finalizeState(next);
  }

  static beginStream(state: TabContextState | null | undefined): TabContextState {
    const next = this.cloneState(state);
    next.streamInputTokens = 0;
    next.streamOutputTokens = 0;
    return next;
  }

  static completeStream(state: TabContextState | null | undefined): TabContextState {
    return this.beginStream(state);
  }

  static applyUsageChunk(
    state: TabContextState | null | undefined,
    chunk: Extract<StreamChunk, { type: 'usage' }>,
  ): TabContextState {
    const next = this.cloneState(state);
    const inputTokens = Math.max(0, chunk.inputTokens);
    const outputTokens = Math.max(0, chunk.outputTokens);
    const inputDelta = Math.max(0, inputTokens - next.streamInputTokens);
    const outputDelta = Math.max(0, outputTokens - next.streamOutputTokens);

    next.estimatedInputTokens += inputDelta;
    next.estimatedOutputTokens += outputDelta;
    next.streamInputTokens = Math.max(next.streamInputTokens, inputTokens);
    next.streamOutputTokens = Math.max(next.streamOutputTokens, outputTokens);
    next.sessionId = chunk.sessionId ?? next.sessionId;
    return this.finalizeState(next, 'now');
  }

  static applyPreciseUsage(
    state: TabContextState | null | undefined,
    usage: {
      total?: number | null;
      input: number;
      output: number;
      reasoning: number;
      cacheRead: number;
      cacheWrite: number | null;
      totalCost?: number | null;
      costDetails?: ContextCostDetails | null;
      billingUsage?: ContextBillingUsage | null;
    },
  ): TabContextState {
    const next = this.cloneState(state);
    next.preciseTokens = this.buildPreciseTokens(usage);
    next.estimatedInputTokens = next.preciseTokens.input
      + next.preciseTokens.cacheRead
      + (next.preciseTokens.cacheWrite ?? 0);
    next.estimatedOutputTokens = next.preciseTokens.output + next.preciseTokens.reasoning;
    next.totalCost = typeof usage.totalCost === 'number' ? usage.totalCost : null;
    next.costDetails = usage.costDetails
      ?? (typeof usage.totalCost === 'number'
        ? {
            source: 'backend-reported',
            completeness: 'complete',
            providerId: next.provider,
            endpoint: null,
            modelId: next.model,
            rates: null,
            catalogFetchedAt: null,
            usesBaseTier: false,
            unavailableTokenKinds: [],
          }
        : null);
    next.billingUsage = usage.billingUsage ?? next.billingUsage;
    return this.finalizeState(next, 'if-missing');
  }

  static applyUsageSnapshot(
    state: TabContextState | null | undefined,
    snapshot: ContextUsageSnapshot,
  ): TabContextState {
    return this.applyPreciseUsage(
      this.syncStateIdentity(
        state,
        {
          provider: snapshot.providerId,
          providerName: snapshot.providerName,
          model: snapshot.modelId,
          modelName: snapshot.modelName,
          contextWindow: snapshot.contextWindow,
        },
        {
          compactingAt: snapshot.compactingAt ?? null,
          sessionId: snapshot.sessionId,
          sessionTitle: snapshot.sessionTitle,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
        },
      ),
      {
        total: snapshot.totalTokens,
        input: snapshot.inputTokens,
        output: snapshot.outputTokens,
        reasoning: snapshot.reasoningTokens,
        cacheRead: snapshot.cacheReadTokens,
        cacheWrite: snapshot.cacheWriteTokens,
        totalCost: snapshot.totalCost,
        costDetails: snapshot.costDetails,
        billingUsage: snapshot.billingUsage,
      },
    );
  }

  static applyBillingUsage(
    state: TabContextState | null | undefined,
    usage: ContextBillingUsageUpdate,
  ): TabContextState {
    const next = this.cloneState(state);
    const previous = next.billingUsage;
    if (previous?.requestIds.includes(usage.requestId)) {
      return next;
    }

    const previousRequestIds = previous?.requestIds ?? [];
    next.billingUsage = {
      requestIds: [...previousRequestIds, usage.requestId],
      providerId: usage.providerId ?? previous?.providerId ?? next.provider,
      modelId: usage.modelId ?? previous?.modelId ?? next.model,
      inputTokens: (previous?.inputTokens ?? 0) + Math.max(0, usage.inputTokens),
      outputTokens: (previous?.outputTokens ?? 0) + Math.max(0, usage.outputTokens),
      reasoningTokens: (previous?.reasoningTokens ?? 0) + Math.max(0, usage.reasoningTokens),
      cacheReadTokens: this.mergeOptionalBillableTokenCount(
        previous?.cacheReadTokens,
        usage.cacheReadTokens,
      ),
      cacheWriteTokens: this.mergeOptionalBillableTokenCount(
        previous?.cacheWriteTokens,
        usage.cacheWriteTokens,
      ),
    };
    return this.finalizeState(next, 'now');
  }

  /** Builds a persistence-safe view of current state for a cost-only billing update. */
  static createUsageSnapshot(state: TabContextState | null | undefined): ContextUsageSnapshot | null {
    if (!state?.sessionId) {
      return null;
    }

    const tokens = this.getDisplayTokenBreakdown(state);
    const isBackendReportedCost = state.costDetails?.source === 'backend-reported';
    return {
      sessionId: state.sessionId,
      sessionTitle: state.sessionTitle ?? '',
      createdAt: state.createdAt ?? Date.now(),
      updatedAt: state.updatedAt ?? Date.now(),
      compactingAt: state.compactingAt ?? null,
      providerId: state.provider,
      providerName: state.providerName,
      modelId: state.model,
      modelName: state.modelName,
      contextWindow: state.contextWindow,
      totalTokens: tokens.total,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      reasoningTokens: tokens.reasoning,
      cacheReadTokens: tokens.cacheRead,
      cacheWriteTokens: tokens.cacheWrite,
      totalCost: isBackendReportedCost ? state.totalCost : null,
      costDetails: isBackendReportedCost ? state.costDetails : null,
      billingUsage: state.billingUsage,
    };
  }

  static applyCostSnapshot(
    state: TabContextState | null | undefined,
    snapshot: Pick<ContextUsageSnapshot, 'totalCost' | 'costDetails' | 'billingUsage'>,
  ): TabContextState {
    const next = this.cloneState(state);
    next.totalCost = typeof snapshot.totalCost === 'number' ? snapshot.totalCost : null;
    next.costDetails = snapshot.costDetails ?? null;
    next.billingUsage = snapshot.billingUsage ?? next.billingUsage;
    return this.finalizeState(next, 'now');
  }

  static summarize(state: TabContextState | null | undefined): ContextUsageSummary {
    return ContextUsageDisplayService.summarize(state);
  }

  static formatNumber(value: number): string {
    return ContextUsageDisplayService.formatNumber(value);
  }

  static formatCurrency(value: number | null | undefined): string {
    return ContextUsageDisplayService.formatCurrency(value);
  }

  static getDisplayTokenBreakdown(state: TabContextState | null | undefined): {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number | null;
    total: number;
  } {
    return ContextUsageDisplayService.getDisplayTokenBreakdown(state);
  }

  static getContextBreakdown(
    state: TabContextState | null | undefined,
    messages: ChatMessage[],
    systemPrompt?: string | null,
  ) {
    return ContextUsageDisplayService.getContextBreakdown(state, messages, systemPrompt);
  }

  static formatPercent(value: number, digits = 0): string {
    return ContextUsageDisplayService.formatPercent(value, digits);
  }

  private static resolveContextWindow(
    explicitContextWindow: number | null | undefined,
    modelId: string | null | undefined,
  ): number {
    if (typeof explicitContextWindow === 'number' && explicitContextWindow > 0) {
      return explicitContextWindow;
    }

    if (modelId) {
      return getDefaultContextWindow(modelId);
    }

    return 0;
  }

  /**
   * Keeps an app-server-reported window authoritative until the caller
   * explicitly replaces it or switches to a different model.
   */
  private static syncContextWindow(
    state: TabContextState,
    modelInfo: ContextModelInfo | undefined,
    modelChanged: boolean,
  ): void {
    const explicitContextWindow = modelInfo?.contextWindow;
    if (typeof explicitContextWindow === 'number' && explicitContextWindow > 0) {
      state.contextWindow = explicitContextWindow;
      return;
    }

    if (!modelChanged && state.contextWindow > 0) {
      return;
    }

    state.contextWindow = this.resolveContextWindow(undefined, modelInfo?.model ?? state.model);
  }

  private static calculatePercentage(totalTokens: number, contextWindow: number): number {
    if (contextWindow <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round((totalTokens / contextWindow) * 100)));
  }

  private static getTotalTokens(state: TabContextState): number {
    if (state.preciseTokens) {
      return state.preciseTokens.total;
    }

    return Math.max(0, state.estimatedInputTokens + state.estimatedOutputTokens);
  }

  private static cloneState(state: TabContextState | null | undefined): TabContextState {
    return state ? { ...state } : createEmptyTabContextState();
  }

  private static finalizeState(
    state: TabContextState,
    timestampRefreshMode: TimestampRefreshMode = 'preserve',
  ): TabContextState {
    if (timestampRefreshMode === 'now') {
      state.updatedAt = Date.now();
    } else if (timestampRefreshMode === 'if-missing') {
      state.updatedAt = state.updatedAt ?? Date.now();
    }

    state.percentage = this.calculatePercentage(this.getTotalTokens(state), state.contextWindow);
    return state;
  }

  private static buildPreciseTokens(usage: {
    total?: number | null;
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number | null;
  }): NonNullable<TabContextState['preciseTokens']> {
    const input = Math.max(0, usage.input);
    const output = Math.max(0, usage.output);
    const reasoning = Math.max(0, usage.reasoning);
    const cacheRead = Math.max(0, usage.cacheRead);
    const cacheWrite = typeof usage.cacheWrite === 'number'
      ? Math.max(0, usage.cacheWrite)
      : null;
    const calculatedTotal = input + output + reasoning + cacheRead + (cacheWrite ?? 0);

    return {
      total: typeof usage.total === 'number' && usage.total >= 0
        ? usage.total
        : calculatedTotal,
      input,
      output,
      reasoning,
      cacheRead,
      cacheWrite,
    };
  }

  private static mergeOptionalBillableTokenCount(
    previous: number | null | undefined,
    next: number | null,
  ): number | null {
    if (previous === null || next === null) {
      return null;
    }
    return (previous ?? 0) + Math.max(0, next);
  }
}
