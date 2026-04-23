# renderGroups

> **源码**: `src/features/chat/renderGroups.ts`
> **状态**: [REVIEW]

## 概述

这个模块解决的是"持久化消息列表"和"实际渲染气泡数量"之间的差异。它把连续的普通助手消息压成一个渲染组，让 UI 不必为同一轮里拆开的多条 assistant message 分别画多个气泡。

此外，该模块还负责 compaction divider 的 live 注入和 compaction summary 的 `summaryKind` 标记。

## 核心类型

```typescript
interface MessageRenderGroup {
  mergedAssistant: boolean;
  messages: ChatMessage[];
}
```

## 关键行为

### 分组规则

`buildMessageRenderGroups()` 顺序遍历消息：

- `role === 'assistant'` 且 `displayStyle !== 'notice'` 的消息可合并
- assistant `summary === true`（当前用于 compaction report）不会参与 merge，保证报告保持独立 render group
- 如果当前组已经是 `mergedAssistant`，新的可合并助手消息会继续塞进该组
- 其他任何消息都会开启新组

因此 notice 卡片、用户消息和非连续的助手消息都不会被并组。

### 合并规则

`mergeAssistantMessagesForRender()` 只接受至少一条消息，否则抛错。返回值以最后一条消息为基底，再覆盖几个字段：

- `id`：用所有消息 id 以 `__` 拼接
- `content`：把每条消息提取出的文本内容用空行拼接，并跳过相邻重复文本
- `contentBlocks`：把所有块拍平成一个数组，并对相邻重复的 text block 做去重
- `modelId`：取从后往前找到的第一个非空 `modelId`
- `parts`、`sourceMessageId`：显式清空为 `undefined`

其余字段保持最后一条消息的值，例如 `timestamp`

### 文本提取与块拍平

- `extractTextContent()` 优先从 `contentBlocks` 的 `text` 块里取文本，否则回退到 `content`
- `flattenContentBlocks()` 会跟踪 `lastRenderedText`
- 非 `text` block 会原样保留，并重置去重边界
- `text` block 为空或与上一个渲染文本相同时会被跳过
- 没有块但有 `content` 的消息，会被转成一个 `{ type: 'text', text }` 块后参与同样的去重

### Compaction divider 注入

`injectLiveCompactionDivider()` 在渲染前为正在进行 compaction 的会话注入一条合成 live divider 消息：

- 当 `compactingAt` 为数字时激活注入
- 如果已存在该 phase 的 persisted divider（`compactionDivider` 且无 `live` 标记），跳过注入
- 注入位置：第一条 `summary === true` 消息之前，或消息列表末尾
- 合成消息的 `compactionDivider.live` 设为 `true`，`role` 为 `'user'`，id 包含 tab id 以区分多 tab

### Compaction summary 标记

`tagCompactionSummaries()` 在渲染后为紧跟在 compaction divider 之后的 summary 消息标记 `summaryKind: 'compaction'`：

- 遇到 `compactionDivider` 消息时进入 compaction 上下文
- 后续 `summary === true` 的 assistant 消息被标记为 `summaryKind: 'compaction'`
- 遇到非 divider 的 user 消息时重置上下文
- 只有 `summaryKind === 'compaction'` 的 summary 才会显示 compaction report badge 和 trailing assistant live patch

## 模块关系

- 上游依赖：`../../core/types`
- 下游消费者：`OpenCodianView.getMessagesForRender()`

## 注意事项

- 合并只影响渲染视图，不会反写原始 `Conversation.messages`。
- `displayStyle === 'notice'` 的 assistant message 明确不会合并，所以像系统提醒、rewind 空状态之类的卡片仍然保持独立节点。
- 这里的去重是"相邻重复文本去重"，不是全局去重；相隔其他 block 或消息后的同文内容仍可能保留。
- `injectLiveCompactionDivider` 和 `tagCompactionSummaries` 也只影响渲染视图，不会写入 `Conversation.messages`。
- `session.compacted` 事件触发 authoritative server reload 后，persisted divider 会使 live divider 自动停止注入。
