# ContextUsageDisplayService

> **源码**: `src/features/chat/services/ContextUsageDisplayService.ts`
> **状态**: [REVIEW]

## 概述

`ContextUsageDisplayService` 承接 context usage 的 UI display / presentation 规则。它是无状态静态服务，供 `ContextUsageService` 的兼容 facade 使用，避免 state update 与 render snapshot 逻辑继续混在同一文件。

它负责：

- 从 `TabContextState` 生成 context ring 可消费的 `ContextUsageSummary`
- 格式化 token 数、美元费用与百分比
- 生成 display token breakdown（precise 优先，estimated fallback）
- 根据 system prompt、messages、parts 与 content blocks 估算输入侧 context breakdown
- 在估算 token 超过真实 input tokens 时按比例缩放，并补齐 `other`

## 公开接口

```typescript
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

export class ContextUsageDisplayService {
  static summarize(...): ContextUsageSummary;
  static formatNumber(...): string;
  static formatCurrency(...): string;
  static getDisplayTokenBreakdown(...): ContextDisplayTokenBreakdown;
  static getContextBreakdown(...): ContextBreakdownSegment[];
  static formatPercent(...): string;
}
```

## 关键行为

- summary tone 阈值保持不变：`>= 85` 为 `danger`，`>= 60` 为 `warning`，其余为 `success`；无模型或 context window 时返回 muted/unavailable。
- 当 `TabContextState.compactingAt` 存在时，summary 会切到 `isCompacting = true`、warning tone、`ringLabel = '…'`，并在 tooltip 首行加入 compaction 提示。
- display token breakdown 有 `preciseTokens` 时直接使用 precise split；否则只展示 estimated input/output，reasoning/cache 记为 `0`。
- context breakdown 的 token 估算仍是“字符数除以 4 向上取整”，仅用于 UI 级近似展示。
- message 字符统计继续兼容 `parts`、`contentBlocks` 与 fallback `content` 三种存储形态。
- `formatCurrency()` 固定按 USD 格式化，并根据金额大小调整小数位数，保持小额费用可见。

## 与相邻模块的边界

- `ContextUsageService` 负责 state identity、stream delta、precise snapshot 与 `percentage` 写回；display 方法只是委托本模块。
- `ContextRing` 与 `ContextDetailModal` 仍可通过 `ContextUsageService` 的兼容 public API 消费这些 display 规则。
