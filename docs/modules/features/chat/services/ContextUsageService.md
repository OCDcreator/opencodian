# ContextUsageService

> **源码**: `src/features/chat/services/ContextUsageService.ts`
> **状态**: [REVIEW]

## 概述

`ContextUsageService` 是一个纯静态服务，用来读写 `TabContextState`。它不自己持有状态；状态由 `OpenCodianView` 和 `TabManager` 按 tab 保存。

它处理三类事情：

- 维护模型/会话身份信息和 context window
- 处理 streaming usage 增量与服务端精确用量快照
- 为 UI 生成摘要和上下文来源拆分

## 核心类型

```typescript
export interface ContextUsageSummary {
  totalTokens: number;
  percentage: number;
  tone: 'success' | 'warning' | 'danger' | 'muted';
  ringLabel: string;
  isUnavailable: boolean;
  contextWindow: number;
  tooltip: string;
}
```

## 关键行为

### 身份同步

`createState()` 只是创建一个空 state 后交给 `syncStateIdentity()` 处理。  
`syncStateIdentity()` 会同步：

- `provider` / `providerName`
- `model` / `modelName`
- `contextWindow`
- `sessionId` / `sessionTitle`
- `createdAt` / `updatedAt`
- `percentage`

`contextWindow` 优先级是：

1. 显式传入的 `contextWindow`
2. `getDefaultContextWindow(modelId)`
3. `0`

### streaming 增量

- `beginStream()` 把 `streamInputTokens` 和 `streamOutputTokens` 归零
- `applyUsageChunk()` 用当前 chunk 和上一次流内计数做 delta，只累加新增部分
- `completeStream()` 目前直接复用 `beginStream()`，也就是在流结束后清空这两个“本次流内计数器”

### 精确快照

`applyPreciseUsage()` 会建立 `preciseTokens`，并把估算字段也校准到同一份快照：

- `estimatedInputTokens = input + cacheRead + cacheWrite`
- `estimatedOutputTokens = output + reasoning`

如果有 `totalCost`，也会同步到 state。

### 摘要

`summarize()` 返回 UI 可直接消费的 `ContextUsageSummary`：

- 当 `state` 不存在、没有模型或 `contextWindow <= 0` 时，返回 `isUnavailable: true`
- 百分比阈值：`>= 85` 为 `danger`，`>= 60` 为 `warning`，其余为 `success`
- tooltip 由总 token、占用百分比和格式化后的美元费用组成

### 展示拆分

`getDisplayTokenBreakdown()`：

- 有 `preciseTokens` 时直接返回精确拆分
- 没有时只用估算的 input/output，reasoning 和 cache 系列记为 `0`

`getContextBreakdown()` 只针对“输入侧”做来源拆分。它会按字符数估算：

- system prompt
- user message
- assistant message
- tool 输入/输出
- other

如果估算总量高于真实 `inputTokens`，会整体按比例缩放。

## 模块关系

- 上游依赖：`../../../core/types`、`../../../i18n`
- 下游消费者：`OpenCodianView`、`ContextRing`、`ContextDetailModal`

## 注意事项

- token 估算规则固定为“字符数除以 4 向上取整”，只是 UI 级近似值。
- 消息字符统计同时兼容两种存储形态：`parts` 和 `contentBlocks/content`。
- `formatCurrency()` 固定按 USD 格式化，并根据金额大小调整小数位数。
