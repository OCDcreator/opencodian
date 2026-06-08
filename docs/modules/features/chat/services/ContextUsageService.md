# ContextUsageService

> **源码**: `src/features/chat/services/ContextUsageService.ts`
> **状态**: [REVIEW]

## 概述

`ContextUsageService` 是 `TabContextState` 的纯 state/update facade。它不自己持有状态；状态由 `OpenCodianView` 和 `TabManager` 按 tab 保存。

当前职责集中在：

- 维护模型/会话身份信息和 context window
- 处理 streaming usage 增量与服务端精确用量快照
- 计算并写回 `TabContextState.percentage`
- 保留原有 display public API，并把 summary、token breakdown、context breakdown 与 formatter 委托给 `ContextUsageDisplayService`

## 核心类型

`ContextUsageSnapshot` 由 `src/core/types/chat.ts` 拥有，本模块仅 re-export 以兼容既有 chat 调用方。backend adapter / OpenCode session control 不应从本 feature service 反向导入该 DTO。

```typescript
export interface ContextUsageSnapshot {
  sessionId: string;
  sessionTitle: string;
  compactingAt?: number | null;
  providerId: string | null;
  modelId: string | null;
  contextWindow: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
}
```

`ContextUsageSummary` 仍从本模块 re-export，但实际由 `ContextUsageDisplayService` 定义和生成。

## 关键行为

### 身份同步

`createState()` 只是创建一个空 state 后交给 `syncStateIdentity()` 处理。  
`syncStateIdentity()` 会同步：

- `provider` / `providerName`
- `model` / `modelName`
- `contextWindow`
- `sessionId` / `sessionTitle`
- `createdAt` / `updatedAt`
- `compactingAt`
- `percentage`

`contextWindow` 优先级是：

1. 显式传入的 `contextWindow`
2. `getDefaultContextWindow(modelId)`
3. `0`

### streaming 增量

- `beginStream()` 把 `streamInputTokens` 和 `streamOutputTokens` 归零。
- `applyUsageChunk()` 用当前 chunk 和上一次流内计数做 delta，只累加新增部分，并用 `now` 模式刷新 `updatedAt`。
- `completeStream()` 目前直接复用 `beginStream()`，也就是在流结束后清空这两个“本次流内计数器”。

### 精确快照

`applyPreciseUsage()` 会建立 `preciseTokens`，并把估算字段也校准到同一份快照：

- `estimatedInputTokens = input + cacheRead + cacheWrite`
- `estimatedOutputTokens = output + reasoning`

如果有 `totalCost`，也会同步到 state。`applyUsageSnapshot()` 先同步 identity（含 `compactingAt`），再复用这条 precise usage 路径。

### compaction live state

- `TabContextState` 现在可携带 `compactingAt`
- `syncStateIdentity()` 在同 session refresh 时会保留/更新 compaction 时间戳；session 切换时若没有新值则清空，避免旧 tab 泄露 stale compacting 状态
- `summarize()` 继续走 display facade，但 display owner 会把 `compactingAt` 映射成 ring/modal 可见的 live compaction 提示

### display facade

- `summarize()`、`getDisplayTokenBreakdown()`、`getContextBreakdown()`、`formatNumber()`、`formatCurrency()` 与 `formatPercent()` 继续保留在本模块，避免 UI 调用方迁移。
- 这些方法现在只是委托 `ContextUsageDisplayService`，让 state/update 逻辑与 UI display/presentation 规则分离。

## 模块关系

- 上游依赖：`../../../core/types`、`ContextUsageDisplayService`
- 下游消费者：`OpenCodianView`、`ActiveTabContextUsageCoordinator`、`ContextRing`、`ContextDetailModal`

## 注意事项

- `percentage` 写回 state 时仍基于 precise total 或 estimated input/output 的总量，不受 display breakdown 估算影响。
- `ContextUsageService` 保持无状态纯函数式 API；不要在这里引入 tab/runtime 持有逻辑。
