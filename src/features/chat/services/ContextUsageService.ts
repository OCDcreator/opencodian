import {
  type ChatMessage,
  type ContextBreakdownKey,
  type ContextBreakdownSegment,
  createEmptyTabContextState,
  getDefaultContextWindow,
  type StreamChunk,
  type TabContextState,
} from '../../../core/types';
import { t } from '../../../i18n';

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

export interface ContextUsageSummary {
  totalTokens: number;
  percentage: number;
  tone: 'success' | 'warning' | 'danger' | 'muted';
  ringLabel: string;
  isUnavailable: boolean;
  contextWindow: number;
  tooltip: string;
}

interface ContextDisplayTokenBreakdown {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

type ContextBreakdownCharCounts = Record<Exclude<ContextBreakdownKey, 'other'>, number>;
type ContextBreakdownTokenMap = Record<ContextBreakdownKey, number>;
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
    if (!state || !state.model || state.contextWindow <= 0) {
      return {
        totalTokens: 0,
        percentage: 0,
        tone: 'muted',
        ringLabel: '-',
        isUnavailable: true,
        contextWindow: 0,
        tooltip: t('context.usage.unavailable'),
      };
    }

    const display = this.getDisplaySnapshot(state);
    const totalTokens = display.totalTokens;
    const percentage = display.percentage;
    const tone = percentage >= 85
      ? 'danger'
      : percentage >= 60
        ? 'warning'
        : 'success';

    return {
      totalTokens,
      percentage,
      tone,
      ringLabel: String(percentage),
      isUnavailable: false,
      contextWindow: state.contextWindow,
      tooltip: [
        `${t('context.usage.totalTokens')}: ${this.formatNumber(totalTokens)}`,
        `${t('context.usage.usage')}: ${percentage}%`,
        `${t('context.usage.cost')}: ${this.formatCurrency(state.totalCost)}`,
      ].join('\n'),
    };
  }

  static formatNumber(value: number): string {
    return new Intl.NumberFormat().format(Math.max(0, Math.round(value)));
  }

  static formatCurrency(value: number | null | undefined): string {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
      return '-';
    }

    const maximumFractionDigits = value === 0
      ? 2
      : value < 0.01
        ? 6
        : value < 1
          ? 4
          : 2;
    const minimumFractionDigits = value > 0 && value < 0.01 ? 4 : 2;

    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(value);
  }

  static getDisplayTokenBreakdown(state: TabContextState | null | undefined): {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  } {
    return this.getDisplaySnapshot(state).tokens;
  }

  static getContextBreakdown(
    state: TabContextState | null | undefined,
    messages: ChatMessage[],
    systemPrompt?: string | null,
  ): ContextBreakdownSegment[] {
    const inputTokens = this.getDisplaySnapshot(state).tokens.input;
    if (inputTokens <= 0) {
      return [];
    }

    return this.buildBreakdownSegments(
      this.fitBreakdownTokens(
        this.estimateBreakdownTokens(
          this.collectBreakdownChars(messages, systemPrompt),
        ),
        inputTokens,
      ),
      inputTokens,
    );
  }

  static formatPercent(value: number, digits = 0): string {
    return `${value.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })}%`;
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

  private static getDisplaySnapshot(
    state: TabContextState | null | undefined,
  ): { tokens: ContextDisplayTokenBreakdown; totalTokens: number; percentage: number } {
    const tokens = this.buildDisplayTokenBreakdown(state);
    return {
      tokens,
      totalTokens: tokens.total,
      percentage: this.calculatePercentage(tokens.total, state?.contextWindow ?? 0),
    };
  }

  private static buildDisplayTokenBreakdown(
    state: TabContextState | null | undefined,
  ): ContextDisplayTokenBreakdown {
    const precise = state?.preciseTokens;
    if (precise) {
      return {
        input: precise.input,
        output: precise.output,
        reasoning: precise.reasoning,
        cacheRead: precise.cacheRead,
        cacheWrite: precise.cacheWrite,
        total: precise.total,
      };
    }

    const input = state?.estimatedInputTokens ?? 0;
    const output = state?.estimatedOutputTokens ?? 0;
    return {
      input,
      output,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: input + output,
    };
  }

  private static estimateTokens(chars: number): number {
    return chars > 0 ? Math.ceil(chars / 4) : 0;
  }

  private static collectBreakdownChars(
    messages: ChatMessage[],
    systemPrompt?: string | null,
  ): ContextBreakdownCharCounts {
    return messages.reduce<ContextBreakdownCharCounts>(
      (acc, message) => {
        if (message.role === 'user') {
          acc.user += this.getUserCharsFromMessage(message);
          return acc;
        }

        if (message.role === 'assistant') {
          const { assistant, tool } = this.getAssistantCharsFromMessage(message);
          acc.assistant += assistant;
          acc.tool += tool;
        }

        return acc;
      },
      {
        system: systemPrompt?.trim().length ?? 0,
        user: 0,
        assistant: 0,
        tool: 0,
      },
    );
  }

  private static estimateBreakdownTokens(
    counts: ContextBreakdownCharCounts,
  ): Omit<ContextBreakdownTokenMap, 'other'> {
    return {
      system: this.estimateTokens(counts.system),
      user: this.estimateTokens(counts.user),
      assistant: this.estimateTokens(counts.assistant),
      tool: this.estimateTokens(counts.tool),
    };
  }

  private static fitBreakdownTokens(
    estimated: Omit<ContextBreakdownTokenMap, 'other'>,
    inputTokens: number,
  ): ContextBreakdownTokenMap {
    const estimatedTotal = estimated.system + estimated.user + estimated.assistant + estimated.tool;
    if (estimatedTotal <= inputTokens) {
      return {
        ...estimated,
        other: inputTokens - estimatedTotal,
      };
    }

    const scale = inputTokens / estimatedTotal;
    const scaled = {
      system: Math.floor(estimated.system * scale),
      user: Math.floor(estimated.user * scale),
      assistant: Math.floor(estimated.assistant * scale),
      tool: Math.floor(estimated.tool * scale),
    };

    return {
      ...scaled,
      other: Math.max(0, inputTokens - scaled.system - scaled.user - scaled.assistant - scaled.tool),
    };
  }

  private static buildBreakdownSegments(
    tokens: ContextBreakdownTokenMap,
    inputTokens: number,
  ): ContextBreakdownSegment[] {
    return ([
      { key: 'system', tokens: tokens.system },
      { key: 'user', tokens: tokens.user },
      { key: 'assistant', tokens: tokens.assistant },
      { key: 'tool', tokens: tokens.tool },
      { key: 'other', tokens: tokens.other },
    ] as const)
      .filter((segment) => segment.tokens > 0)
      .map((segment) => ({
        key: segment.key,
        tokens: segment.tokens,
        width: (segment.tokens / inputTokens) * 100,
        percent: Math.round(((segment.tokens / inputTokens) * 100) * 10) / 10,
      }));
  }

  private static getUserCharsFromMessage(message: ChatMessage): number {
    const parts = this.getParts(message);
    if (parts.length > 0) {
      return parts.reduce<number>((sum, part) => sum + this.getUserCharsFromPart(part), 0);
    }

    return message.content.length;
  }

  private static getAssistantCharsFromMessage(message: ChatMessage): { assistant: number; tool: number } {
    const parts = this.getParts(message);
    if (parts.length > 0) {
      return parts.reduce<{ assistant: number; tool: number }>(
        (sum, part) => {
          const next = this.getAssistantCharsFromPart(part);
          return {
            assistant: sum.assistant + next.assistant,
            tool: sum.tool + next.tool,
          };
        },
        { assistant: 0, tool: 0 },
      );
    }

    if (message.contentBlocks?.length) {
      return message.contentBlocks.reduce(
        (sum, block) => {
          if (block.type === 'text') {
            return {
              ...sum,
              assistant: sum.assistant + (block.text?.length ?? 0),
            };
          }

          if (block.type === 'thinking') {
            return {
              ...sum,
              assistant: sum.assistant + (block.thinking?.length ?? 0),
            };
          }

          if (block.type === 'tool_use') {
            return {
              ...sum,
              tool: sum.tool + this.getToolChars(
                block.toolInput,
                typeof block.toolResult === 'string' ? block.toolResult : '',
                '',
              ),
            };
          }

          return sum;
        },
        { assistant: 0, tool: 0 },
      );
    }

    return {
      assistant: message.content.length,
      tool: 0,
    };
  }

  private static getParts(message: ChatMessage): unknown[] {
    return Array.isArray(message.parts) ? message.parts : [];
  }

  private static getUserCharsFromPart(part: unknown): number {
    const type = this.getStringField(part, 'type');
    if (type === 'text') {
      return this.getStringField(part, 'text').length;
    }

    if (type === 'file') {
      return this.getNestedStringField(part, ['source', 'text', 'value']).length;
    }

    if (type === 'agent') {
      return this.getNestedStringField(part, ['source', 'value']).length;
    }

    return 0;
  }

  private static getAssistantCharsFromPart(part: unknown): { assistant: number; tool: number } {
    const type = this.getStringField(part, 'type');
    if (type === 'text' || type === 'reasoning') {
      return {
        assistant: this.getStringField(part, 'text').length,
        tool: 0,
      };
    }

    if (type !== 'tool') {
      return { assistant: 0, tool: 0 };
    }

    const state = this.getObjectField(part, 'state');
    const status = this.getStringField(state, 'status');
    const input = this.getUnknownField(state, 'input');
    const raw = this.getStringField(state, 'raw');
    const output = this.getStringField(state, 'output');
    const error = this.getStringField(state, 'error');

    if (status === 'pending' || status === 'running') {
      return {
        assistant: 0,
        tool: this.getToolChars(input, raw, ''),
      };
    }

    if (status === 'completed') {
      return {
        assistant: 0,
        tool: this.getToolChars(input, output, ''),
      };
    }

    if (status === 'error') {
      return {
        assistant: 0,
        tool: this.getToolChars(input, '', error),
      };
    }

    return {
      assistant: 0,
      tool: this.getToolChars(input, '', ''),
    };
  }

  private static getToolChars(input: unknown, output: string, error: string): number {
    return this.stringifyUnknown(input).length + output.length + error.length;
  }

  private static getUnknownField(value: unknown, key: string): unknown {
    if (!this.isRecord(value)) {
      return undefined;
    }

    return value[key];
  }

  private static getObjectField(value: unknown, key: string): Record<string, unknown> | null {
    const field = this.getUnknownField(value, key);
    return this.isRecord(field) ? field : null;
  }

  private static getStringField(value: unknown, key: string): string {
    const field = this.getUnknownField(value, key);
    return typeof field === 'string' ? field : '';
  }

  private static getNestedStringField(value: unknown, path: string[]): string {
    let current: unknown = value;
    for (const key of path) {
      if (!this.isRecord(current)) {
        return '';
      }
      current = current[key];
    }

    return typeof current === 'string' ? current : '';
  }

  private static stringifyUnknown(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
