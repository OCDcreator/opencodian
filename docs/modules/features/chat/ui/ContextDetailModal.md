# ContextDetailModal

> **源码**: `src/features/chat/ui/ContextDetailModal.ts`
> **状态**: [REVIEW]

## 概述

Obsidian Modal，展示当前会话的上下文使用详情。包括会话元信息（标题、provider、model）、消息统计（总数/用户/助手）、Token 明细（input/output/reasoning/cache/cost）、上下文分段条形图（breakdown），以及时间戳。数据来源于 `ContextUsageService` 的 `summarize()`、`getDisplayTokenBreakdown()`、`getContextBreakdown()` 三个方法。

## 导入关系
上游: `obsidian`（Modal）、`Conversation`/`TabContextState`/`ContextBreakdownSegment`（core/types）、`i18n`、`ContextUsageService`
下游: 被 `OpenCodianView` 或 `ContextRing` 的点击回调打开

## 核心类型 / 接口

无独立导出类型。构造参数：

```typescript
constructor(app: App, conversation: Conversation | null, contextState: TabContextState | null, systemPrompt?: string | null)
```

## 核心逻辑

### 元信息网格

使用 `renderRow()` 渲染两列 grid：标签 + 值。字段包括 session title、provider、model、message counts、token breakdown、cost、timestamps。

### 上下文分段条形图（Breakdown）

调用 `ContextUsageService.getContextBreakdown()` 获取 `ContextBreakdownSegment[]`，渲染为：
1. **堆叠条形图**: 每段宽度为 `segment.width%`，CSS 类 `is-{key}` 控制颜色
2. **图例列表**: swatch + 名称 + 百分比 + token 数

### 时间戳格式化

`formatTimestamp()` 根据 `getLocale()` 使用 `Intl.DateTimeFormat`，支持 `zh-CN` / `en-US`。

### 估算标记

若 `contextState.preciseTokens` 为 false，显示"估算值"提示。

## 关键方法

| 方法 | 说明 |
|------|------|
| `onOpen()` | 清空内容、调用 summarize/breakdown、渲染网格和分段图 |
| `onClose()` | 清空 contentEl |
| `renderRow(container, label, value)` | 创建 label/value 两行 div |
| `renderBreakdown(container, segments)` | 渲染堆叠条形图 + 图例 |
| `formatTimestamp(value)` | 将毫秒时间戳转为 locale-aware 字符串 |

## 数据流

```
Conversation + TabContextState + systemPrompt
        ↓
ContextUsageService.summarize()          → percentage, tone, contextWindow
ContextUsageService.getDisplayTokenBreakdown() → total, input, output, reasoning, cacheRead, cacheWrite
ContextUsageService.getContextBreakdown()       → ContextBreakdownSegment[]
        ↓
Modal grid + breakdown bar + legend
```

## 与其他模块的交互

- **ContextUsageService**: 三个核心数据方法
- **i18n**: 所有标签通过 `t()` 获取，支持 `context.usage.*` 和 `context.breakdown.*` 命名空间

## 配置项

无直接配置项。

## 注意事项

- 当 `contextState` 为 null 或 `summary.isUnavailable` 时，显示空状态提示
- `formatTimestamp` 有 fallback：先尝试 `dateStyle + timeStyle`，失败后使用 `year/month/day/hour/minute` 各组件

## 补充说明

- `ContextBreakdownSegment` 的 `key` 值由 `ContextUsageService.getContextBreakdown()` 返回，包含 system / history / context 等 key，每个 key 对应 i18n 翻译 `context.breakdown.{key}`
- 与 `ContextUsageService` 各方法返回类型的精确映射：`summarize()` → `{ percentage, tone, ringLabel, tooltip, isUnavailable, contextWindow }`，`getDisplayTokenBreakdown()` → `{ total, input, output, reasoning, cacheRead, cacheWrite }`，`getContextBreakdown()` → `ContextBreakdownSegment[]`（每个含 `key`, `tokens`, `percent`, `width`）
