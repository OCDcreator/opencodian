import type {
  ChatMessage,
  ContextBreakdownKey,
  ContextBreakdownSegment,
  TabContextState,
} from '../../../core/types';
import { t } from '../../../i18n';

export interface ContextUsageSummary {
  totalTokens: number;
  percentage: number;
  tone: 'success' | 'warning' | 'danger' | 'muted';
  ringLabel: string;
  isCompacting: boolean;
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

export class ContextUsageDisplayService {
  static summarize(state: TabContextState | null | undefined): ContextUsageSummary {
    if (!state || !state.model || state.contextWindow <= 0) {
      return {
        totalTokens: 0,
        percentage: 0,
        tone: 'muted',
        ringLabel: '-',
        isCompacting: false,
        isUnavailable: true,
        contextWindow: 0,
        tooltip: t('context.usage.unavailable'),
      };
    }

    const display = this.getDisplaySnapshot(state);
    const totalTokens = display.totalTokens;
    const percentage = display.percentage;
    const isCompacting = typeof state.compactingAt === 'number';
    const tone = isCompacting
      ? 'warning'
      : percentage >= 85
        ? 'danger'
        : percentage >= 60
          ? 'warning'
          : 'success';

    return {
      totalTokens,
      percentage,
      tone,
      ringLabel: isCompacting ? '…' : String(percentage),
      isCompacting,
      isUnavailable: false,
      contextWindow: state.contextWindow,
      tooltip: [
        ...(isCompacting ? [t('context.usage.compacting')] : []),
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

  private static calculatePercentage(totalTokens: number, contextWindow: number): number {
    if (contextWindow <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round((totalTokens / contextWindow) * 100)));
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
