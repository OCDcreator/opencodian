# ContextDetailModal

> **源码**: `src/features/chat/ui/ContextDetailModal.ts`
> **状态**: [REVIEW]

## 概述

Obsidian Modal，展示当前会话的上下文使用详情。包括会话元信息（标题、provider、model）、消息统计（总数/用户/助手）、Token 明细（input/output/reasoning/cache/cost）、上下文分段条形图（breakdown）、异步加载的原始消息区，以及时间戳。统计数据来源于 `ContextUsageService` 的 `summarize()`、`getDisplayTokenBreakdown()`、`getContextBreakdown()` 三个方法；原始消息由调用方通过懒加载回调提供。

## 导入关系
上游: `obsidian`（Modal）、`Conversation`/`TabContextState`/`ContextBreakdownSegment`（core/types）、`i18n`、`ContextUsageService`
下游: 被 `OpenCodianView` 或 `ContextRing` 的点击回调打开

## 核心类型 / 接口

无独立导出类型。构造参数：

```typescript
constructor(
  app: App,
  conversation: Conversation | null,
  contextState: TabContextState | null,
  systemPrompt?: string | null,
  rawMessageLoader?: () => Promise<ContextRawMessageItem[]>,
)
```

其中 `ContextRawMessageItem` 为：

```typescript
{
  id: string;
  role: string;
  createdAt: number | null;
  payload: string;
}
```

## 核心逻辑

### 元信息网格

使用 `renderRow()` 渲染两列 grid：标签 + 值。字段包括 session title、provider、model、message counts、token breakdown、cost、timestamps；当 context summary 标记 `isCompacting` 时，还会额外显示当前 compaction status。

### 上下文分段条形图（Breakdown）

调用 `ContextUsageService.getContextBreakdown()` 获取 `ContextBreakdownSegment[]`，渲染为：
1. **堆叠条形图**: 每段宽度为 `segment.width%`，CSS 类 `is-{key}` 控制颜色
2. **图例列表**: swatch + 名称 + 百分比 + token 数

### 原始消息区

调用可选的 `rawMessageLoader()` 后异步渲染“原始消息”区：
- 打开弹窗时先显示 loading 态
- 成功后按消息渲染折叠项，标题为 `role • id`，右侧显示创建时间
- 展开后显示 `payload`，通常是格式化后的 `{ message, parts }` JSON
- 空数据与加载失败分别显示独立状态文案
- `onClose()` 后不再回写异步结果，避免销毁后的 DOM 更新
- modal shell 现在会在 `onOpen()` / `onClose()` 时切换 `opencodian-context-detail-modal`，专门覆盖 Obsidian 默认 modal 宽度限制，避免 raw JSON / token 明细被过窄容器压缩

### 时间戳格式化

`formatTimestamp()` 根据 `getLocale()` 使用 `Intl.DateTimeFormat`，支持 `zh-CN` / `en-US`。

### 估算标记

若 `contextState.preciseTokens` 为 false，显示"估算值"提示。

## 关键方法

| 方法 | 说明 |
|------|------|
| `onOpen()` | 清空内容、调用 summarize/breakdown、渲染网格/分段图，并启动原始消息异步加载 |
| `onClose()` | 清空 contentEl |
| `renderRow(container, label, value)` | 创建 label/value 两行 div |
| `renderBreakdown(container, segments)` | 渲染堆叠条形图 + 图例 |
| `loadRawMessages(container)` | 执行懒加载回调并渲染 loading / empty / error / data 状态 |
| `formatTimestamp(value)` | 将毫秒时间戳转为 locale-aware 字符串 |

## 数据流

```
Conversation + TabContextState + systemPrompt
        ↓
ContextUsageService.summarize()          → percentage, tone, contextWindow
ContextUsageService.getDisplayTokenBreakdown() → total, input, output, reasoning, cacheRead, cacheWrite
ContextUsageService.getContextBreakdown()       → ContextBreakdownSegment[]
rawMessageLoader()                        → ContextRawMessageItem[]
        ↓
Modal grid + breakdown bar + raw messages + notes
```

## 与其他模块的交互

- **ContextUsageService**: 三个核心数据方法
- **i18n**: 所有标签通过 `t()` 获取，支持 `context.usage.*`、`context.breakdown.*`、`context.rawMessages.*`

## 配置项

无直接配置项。

## 注意事项

- 当 `contextState` 为 null 或 `summary.isUnavailable` 时，显示空状态提示
- 原始消息区是独立异步块；即使加载失败，也不影响上方 context usage 统计展示
- `formatTimestamp` 有 fallback：先尝试 `dateStyle + timeStyle`，失败后使用 `year/month/day/hour/minute` 各组件
- 该 modal 依赖 `src/style/modals/config-editor-modal.css` 里的宽 modal 壳层规则；如果后续重新命名类名，需要同步更新样式选择器

## 补充说明

- `ContextBreakdownSegment` 的 `key` 值由 `ContextUsageService.getContextBreakdown()` 返回，包含 system / history / context 等 key，每个 key 对应 i18n 翻译 `context.breakdown.{key}`
- 与 `ContextUsageService` 各方法返回类型的精确映射：`summarize()` → `{ percentage, tone, ringLabel, tooltip, isUnavailable, isCompacting, contextWindow }`，`getDisplayTokenBreakdown()` → `{ total, input, output, reasoning, cacheRead, cacheWrite }`，`getContextBreakdown()` → `ContextBreakdownSegment[]`（每个含 `key`, `tokens`, `percent`, `width`）
