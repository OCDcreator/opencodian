# ContextUsageService

> **源码**: `src/features/chat/services/ContextUsageService.ts`
> **状态**: [DRAFT]

## 概述

上下文窗口用量追踪与摘要服务。维护每个标签页的 `TabContextState`，累积流式传输中的 token 用量增量，支持精确用量（来自服务端）和估算用量（基于字符数）双模式。为 `ContextRing` UI 组件提供汇总数据，包括用量百分比、色调、工具提示文本和 token 细分。

## 导入关系

**上游**:
- `../../../core/types` — `ChatMessage`, `TabContextState`, `StreamChunk`, `ContextBreakdownSegment`, `createEmptyTabContextState`, `getDefaultContextWindow`
- `../../../i18n` — 国际化文本

**下游**:
- **OpenCodianView** — 管理 `TabContextState` 生命周期
- **ContextRing (ui/)** — 消费 `ContextUsageSummary` 渲染环形进度条

## 核心类型 / 接口

```typescript
interface ContextUsageSummary {
  totalTokens: number;
  percentage: number;
  tone: 'success' | 'warning' | 'danger' | 'muted';
  ringLabel: string;
  isUnavailable: boolean;
  contextWindow: number;
  tooltip: string;
}
```

## 核心逻辑

### 状态创建与同步
`createState()` / `syncStateIdentity()` 创建或更新 `TabContextState`，解析模型信息、上下文窗口大小、会话元数据。上下文窗口优先使用服务端提供的显式值，回退到 `getDefaultContextWindow(modelId)`。

### 流式用量累积
`beginStream()` 重置流内 token 计数器。`applyUsageChunk()` 接收 `StreamChunk.usage` 事件，计算增量 delta 并累加到估算总量。`completeStream()` 重置流状态。

### 精确用量
`applyPreciseUsage()` 接收来自服务端的精确 token 分项（input/output/reasoning/cacheRead/cacheWrite），覆盖估算值。

### 用量摘要
`summarize()` 生成面向 UI 的 `ContextUsageSummary`：
- `percentage` — 百分比值
- `tone` — ≥85% 为 danger，≥60% 为 warning，否则 success
- `tooltip` — 包含总 token 数、用量百分比、费用

### 上下文细分
`getContextBreakdown()` 将 input tokens 按 system/user/assistant/tool/other 细分，用于可视化。基于字符数估算（÷4），若估算总量超过实际 input 则按比例缩放。

### 费用格式化
`formatCurrency()` 根据费用大小自适应小数位数（0 → 2位，<0.01 → 6位，<1 → 4位，≥1 → 2位）。

## 关键方法

| 方法 | 说明 |
|------|------|
| `createState(modelInfo?, sessionInfo?)` | 创建初始 TabContextState |
| `syncStateIdentity(state, modelInfo?, sessionInfo?)` | 同步模型/会话信息到状态 |
| `beginStream(state)` | 重置流内 token 计数器 |
| `completeStream(state)` | 完成流式传输，重置流状态 |
| `applyUsageChunk(state, chunk)` | 应用流式 usage 事件增量 |
| `applyPreciseUsage(state, usage)` | 应用服务端精确用量数据 |
| `summarize(state)` | 生成 UI 摘要（百分比、色调、工具提示） |
| `getDisplayTokenBreakdown(state)` | 获取 token 分项（input/output/reasoning/cache*） |
| `getContextBreakdown(state, messages, systemPrompt?)` | 计算 system/user/assistant/tool/other 细分 |
| `formatNumber(value)` | 格式化数字（千位分隔） |
| `formatCurrency(value)` | 格式化 USD 货币值 |
| `formatPercent(value, digits?)` | 格式化百分比 |

## 数据流

```
流式 usage 事件 → applyUsageChunk()
  → 累积 estimatedInputTokens / estimatedOutputTokens

服务端精确用量 → applyPreciseUsage()
  → 覆盖 preciseTokens 分项

渲染时:
  summarize(tabContextState)
    → ContextUsageSummary → ContextRing 渲染

  getContextBreakdown(state, messages)
    → ContextBreakdownSegment[] → 上下文细分可视化
```

## 与其他模块的交互

- **OpenCodianView**: 在流式传输期间调用 `applyUsageChunk()`，在模型切换时调用 `syncStateIdentity()`，通过 `TabManager` 按 tab 存储
- **ContextRing**: 消费 `summarize()` 结果渲染环形图
- **core/types**: `TabContextState` 类型和 `getDefaultContextWindow()` 默认值映射

## 配置项

无直接配置，但受以下设置间接影响：
- 模型选择 → 影响上下文窗口大小
- `contextWindow` 可通过模型目录配置

## 注意事项

- 所有方法为 `static`，无实例状态——状态由调用方（OpenCodianView/TabManager）持有
- Token 估算使用 `chars / 4` 粗略公式，精度有限
- 精确用量会完全覆盖估算值，两者不会混合
- `calculatePercentage()` 结果限制在 0-100 范围内
- 消息字符统计需处理 `contentBlocks` 和 `parts` 两种格式

## 待补充

- [ ] `getDefaultContextWindow()` 中的模型→窗口大小映射表
- [ ] `TabContextState` 完整字段说明
- [ ] 估算 vs 精确用量的切换时机
- [ ] `ContextBreakdownSegment` 在 UI 中的渲染方式
