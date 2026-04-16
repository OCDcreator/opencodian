import {
  type ChatMessage,
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
  sessionId?: string | null;
  sessionTitle?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
}

export interface ContextUsageSnapshot {
  sessionId: string;
  sessionTitle: string;
  createdAt: number;
  updatedAt: number;
  providerId: string | null;
  providerName: string | null;
  modelId: string | null;
  modelName: string | null;
  contextWindow: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
}

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
    const modelId = modelInfo?.model ?? next.model;

    next.provider = modelInfo?.provider ?? next.provider;
    next.providerName = modelInfo?.providerName ?? next.providerName ?? next.provider;
    next.model = modelInfo?.model ?? next.model;
    next.modelName = modelInfo?.modelName ?? next.modelName ?? next.model;
    next.contextWindow = this.resolveContextWindow(modelInfo?.contextWindow, modelId);
    next.sessionId = sessionInfo?.sessionId ?? next.sessionId;
    next.sessionTitle = sessionInfo?.sessionTitle ?? next.sessionTitle;
    next.createdAt = sessionInfo?.createdAt ?? next.createdAt;
    next.updatedAt = sessionInfo?.updatedAt ?? next.updatedAt;
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
      input: number;
      output: number;
      reasoning: number;
      cacheRead: number;
      cacheWrite: number;
      totalCost?: number | null;
    },
  ): TabContextState {
    const next = this.cloneState(state);
    next.preciseTokens = this.buildPreciseTokens(usage);
    next.estimatedInputTokens = next.preciseTokens.input + next.preciseTokens.cacheRead + next.preciseTokens.cacheWrite;
    next.estimatedOutputTokens = next.preciseTokens.output + next.preciseTokens.reasoning;
    next.totalCost = typeof usage.totalCost === 'number' ? usage.totalCost : next.totalCost;
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
          sessionId: snapshot.sessionId,
          sessionTitle: snapshot.sessionTitle,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
        },
      ),
      {
        input: snapshot.inputTokens,
        output: snapshot.outputTokens,
        reasoning: snapshot.reasoningTokens,
        cacheRead: snapshot.cacheReadTokens,
        cacheWrite: snapshot.cacheWriteTokens,
        totalCost: snapshot.totalCost,
      },
    );
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
    cacheWrite: number;
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
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
  }): NonNullable<TabContextState['preciseTokens']> {
    const input = Math.max(0, usage.input);
    const output = Math.max(0, usage.output);
    const reasoning = Math.max(0, usage.reasoning);
    const cacheRead = Math.max(0, usage.cacheRead);
    const cacheWrite = Math.max(0, usage.cacheWrite);

    return {
      total: input + output + reasoning + cacheRead + cacheWrite,
      input,
      output,
      reasoning,
      cacheRead,
      cacheWrite,
    };
  }
}
